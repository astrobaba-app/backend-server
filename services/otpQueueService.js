const crypto = require("crypto");
const redis = require("../config/redis/redis");
const { assertMsg91OtpConfigured, sendMsg91Otp } = require("./msg91OtpService");

const OTP_QUEUE_KEY = "queue:msg91_otp";
const OTP_TTL_SECONDS = 5 * 60;
const OTP_RATE_LIMIT_WINDOW_SECONDS = 60 * 60;
const OTP_RATE_LIMIT_MAX_REQUESTS = 5;
const MAX_SEND_ATTEMPTS = 3;
const TOO_FREQUENT_MESSAGE =
  "You are trying too frequently. Please try after 1 hour.";

let workerStarted = false;
let processing = false;
let drainScheduled = false;

const isOtpWorkerEnabled = () => {
  return String(process.env.OTP_QUEUE_WORKER_ENABLED || "true").toLowerCase() !== "false";
};

const parseRedisValue = (value) => {
  if (!value) return null;
  if (typeof value === "string") {
    try {
      return JSON.parse(value);
    } catch {
      return null;
    }
  }
  return value;
};

const generate4DigitOtp = () => {
  return crypto.randomInt(1000, 10000).toString();
};

const getOtpKey = ({ actorType, mobile }) => `${actorType}:otp:${mobile}`;
const getRateLimitKey = ({ actorType, mobile }) =>
  `${actorType}:otp:rate:${mobile}`;

const checkOtpRateLimit = async ({ actorType, mobile }) => {
  const rateLimitKey = getRateLimitKey({ actorType, mobile });
  const requestCount = await redis.incr(rateLimitKey);

  if (requestCount === 1) {
    await redis.expire(rateLimitKey, OTP_RATE_LIMIT_WINDOW_SECONDS);
  }

  if (requestCount > OTP_RATE_LIMIT_MAX_REQUESTS) {
    const error = new Error(TOO_FREQUENT_MESSAGE);
    error.statusCode = 429;
    throw error;
  }
};

const enqueueOtp = async ({ actorType, mobile, otp }) => {
  const payload = {
    id: crypto.randomUUID(),
    actorType,
    mobile,
    otp,
    attempts: 0,
    queuedAt: Date.now(),
  };

  await redis.rpush(OTP_QUEUE_KEY, JSON.stringify(payload));

  if (isOtpWorkerEnabled()) {
    scheduleOtpQueueDrain();
  }
};

const createAndQueueOtp = async ({ actorType, mobile }) => {
  assertMsg91OtpConfigured();
  await checkOtpRateLimit({ actorType, mobile });

  const otp = generate4DigitOtp();
  await redis.setex(getOtpKey({ actorType, mobile }), OTP_TTL_SECONDS, {
    otp,
    mobile,
    createdAt: Date.now(),
  });

  await enqueueOtp({ actorType, mobile, otp });
};

const verifyQueuedOtp = async ({ actorType, mobile, otp }) => {
  const otpKey = getOtpKey({ actorType, mobile });
  const storedData = parseRedisValue(await redis.get(otpKey));

  if (!storedData || storedData.mobile !== mobile || storedData.otp !== otp) {
    const error = new Error("Invalid or expired OTP");
    error.statusCode = 400;
    throw error;
  }

  await redis.del(otpKey);
  return true;
};

const scheduleOtpQueueDrain = () => {
  if (!isOtpWorkerEnabled() || drainScheduled) return;

  drainScheduled = true;
  setImmediate(() => {
    drainScheduled = false;
    void drainOtpQueue();
  });
};

const drainOtpQueue = async () => {
  if (!isOtpWorkerEnabled() || processing) return;
  processing = true;

  try {
    while (true) {
      const rawJob = await redis.lpop(OTP_QUEUE_KEY);
      if (!rawJob) return;

      const job = parseRedisValue(rawJob);
      if (!job?.mobile || !job?.otp || !job?.actorType) {
        console.error("[OTPQueue] Dropping malformed OTP job");
        continue;
      }

      try {
        await sendMsg91Otp({
          mobile: `91${job.mobile}`,
          otp: job.otp,
          variables: {
            otp: job.otp,
          },
        });
        console.log("[OTPQueue] OTP sent", {
          jobId: job.id,
          actorType: job.actorType,
          mobile: job.mobile,
        });
      } catch (error) {
        const attempts = Number(job.attempts || 0) + 1;
        console.error("[OTPQueue] OTP send failed", {
          jobId: job.id,
          actorType: job.actorType,
          mobile: job.mobile,
          attempts,
          message: error.message,
        });

        if (attempts < MAX_SEND_ATTEMPTS) {
          await redis.rpush(
            OTP_QUEUE_KEY,
            JSON.stringify({
              ...job,
              attempts,
              lastError: error.message,
            })
          );
        }
      }
    }
  } catch (error) {
    console.error("[OTPQueue] Worker error:", error);
  } finally {
    processing = false;
  }
};

const startOtpQueueWorker = () => {
  if (workerStarted) return;
  if (!isOtpWorkerEnabled()) {
    console.log("[OTPQueue] Worker disabled by OTP_QUEUE_WORKER_ENABLED=false");
    return;
  }

  workerStarted = true;
  console.log("[OTPQueue] Worker ready in on-demand mode");
};

module.exports = {
  TOO_FREQUENT_MESSAGE,
  createAndQueueOtp,
  verifyQueuedOtp,
  startOtpQueueWorker,
};
