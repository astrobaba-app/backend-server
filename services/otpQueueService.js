const crypto = require("crypto");
const redis = require("../config/redis/redis");
const { assertMsg91OtpConfigured, sendMsg91Otp } = require("./msg91OtpService");

const OTP_QUEUE_KEY = "queue:msg91_otp";
const OTP_TTL_SECONDS = 5 * 60;
const MAX_SEND_ATTEMPTS = 3;
const toPositiveInt = (value, fallback) => {
  const parsed = Number.parseInt(value, 10);
  return Number.isFinite(parsed) && parsed > 0 ? parsed : fallback;
};

const OTP_SEND_HOURLY_LIMIT = toPositiveInt(
  process.env.OTP_SEND_HOURLY_LIMIT,
  5
);
const OTP_SEND_DAILY_LIMIT = toPositiveInt(
  process.env.OTP_SEND_DAILY_LIMIT,
  30
);
const OTP_SEND_MONTHLY_LIMIT = toPositiveInt(
  process.env.OTP_SEND_MONTHLY_LIMIT,
  300
);
const OTP_VERIFY_PER_OTP_LIMIT = toPositiveInt(
  process.env.OTP_VERIFY_PER_OTP_LIMIT,
  5
);
const OTP_VERIFY_DAILY_LIMIT = toPositiveInt(
  process.env.OTP_VERIFY_DAILY_LIMIT,
  60
);
const OTP_VERIFY_MONTHLY_LIMIT = toPositiveInt(
  process.env.OTP_VERIFY_MONTHLY_LIMIT,
  600
);

const TOO_FREQUENT_MESSAGE = "Hourly OTP limit reached. Please try later.";
const DAILY_SEND_LIMIT_MESSAGE =
  "Daily OTP limit reached. Please try tomorrow.";
const MONTHLY_SEND_LIMIT_MESSAGE =
  "Monthly OTP limit reached. Please contact support.";
const TOO_MANY_VERIFY_ATTEMPTS_MESSAGE =
  "Too many OTP verification attempts. Please request a new OTP.";
const DAILY_VERIFY_LIMIT_MESSAGE =
  "Daily OTP verification limit reached. Please try tomorrow.";
const MONTHLY_VERIFY_LIMIT_MESSAGE =
  "Monthly OTP verification limit reached. Please contact support.";
const ANDROID_SMS_RETRIEVER_HASH = String(
  process.env.ANDROID_SMS_RETRIEVER_HASH || ""
).trim();
const MSG91_MOBILE_OTP_TEMPLATE_ID = String(
  process.env.MSG91_MOBILE_OTP_TEMPLATE_ID || ""
).trim();
const DUMMY_ASTROLOGER_PHONE = "8112590071";

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

const secondsUntilEndOfDay = () => {
  const now = new Date();
  const end = new Date(now);
  end.setHours(24, 0, 0, 0);
  return Math.max(1, Math.ceil((end.getTime() - now.getTime()) / 1000));
};

const secondsUntilEndOfMonth = () => {
  const now = new Date();
  const end = new Date(now.getFullYear(), now.getMonth() + 1, 1);
  return Math.max(1, Math.ceil((end.getTime() - now.getTime()) / 1000));
};

const getOtpKey = ({ actorType, mobile }) => `${actorType}:otp:${mobile}`;
const getSendLimitKey = ({ actorType, mobile, window }) =>
  `${actorType}:otp:send:${window}:${mobile}`;
const getVerifyAttemptsKey = ({ actorType, mobile }) =>
  `${actorType}:otp:verify:${mobile}`;
const getVerifyLimitKey = ({ actorType, mobile, window }) =>
  `${actorType}:otp:verify:${window}:${mobile}`;

const isUnlimitedDummyAstrologerOtp = ({ actorType, mobile }) =>
  actorType === "astrologer" && mobile === DUMMY_ASTROLOGER_PHONE;

const incrementWindowLimit = async ({ key, ttlSeconds, limit, message }) => {
  const requestCount = await redis.incr(key);

  if (requestCount === 1) {
    await redis.expire(key, ttlSeconds);
  }

  if (requestCount > limit) {
    const error = new Error(message);
    error.statusCode = 429;
    throw error;
  }
};

const checkOtpSendLimits = async ({ actorType, mobile }) => {
  if (isUnlimitedDummyAstrologerOtp({ actorType, mobile })) {
    return;
  }

  await incrementWindowLimit({
    key: getSendLimitKey({ actorType, mobile, window: "hour" }),
    ttlSeconds: 60 * 60,
    limit: OTP_SEND_HOURLY_LIMIT,
    message: TOO_FREQUENT_MESSAGE,
  });

  await incrementWindowLimit({
    key: getSendLimitKey({ actorType, mobile, window: "day" }),
    ttlSeconds: secondsUntilEndOfDay(),
    limit: OTP_SEND_DAILY_LIMIT,
    message: DAILY_SEND_LIMIT_MESSAGE,
  });

  await incrementWindowLimit({
    key: getSendLimitKey({ actorType, mobile, window: "month" }),
    ttlSeconds: secondsUntilEndOfMonth(),
    limit: OTP_SEND_MONTHLY_LIMIT,
    message: MONTHLY_SEND_LIMIT_MESSAGE,
  });
};

const checkOtpVerifyLimits = async ({ actorType, mobile }) => {
  if (isUnlimitedDummyAstrologerOtp({ actorType, mobile })) {
    return;
  }

  await incrementWindowLimit({
    key: getVerifyAttemptsKey({ actorType, mobile }),
    ttlSeconds: OTP_TTL_SECONDS,
    limit: OTP_VERIFY_PER_OTP_LIMIT,
    message: TOO_MANY_VERIFY_ATTEMPTS_MESSAGE,
  });

  await incrementWindowLimit({
    key: getVerifyLimitKey({ actorType, mobile, window: "day" }),
    ttlSeconds: secondsUntilEndOfDay(),
    limit: OTP_VERIFY_DAILY_LIMIT,
    message: DAILY_VERIFY_LIMIT_MESSAGE,
  });

  await incrementWindowLimit({
    key: getVerifyLimitKey({ actorType, mobile, window: "month" }),
    ttlSeconds: secondsUntilEndOfMonth(),
    limit: OTP_VERIFY_MONTHLY_LIMIT,
    message: MONTHLY_VERIFY_LIMIT_MESSAGE,
  });
};

const enqueueOtp = async ({ actorType, mobile, otp, templateId, includeAppHash }) => {
  const payload = {
    id: crypto.randomUUID(),
    actorType,
    mobile,
    otp,
    templateId: templateId || undefined,
    includeAppHash: includeAppHash === true,
    attempts: 0,
    queuedAt: Date.now(),
  };

  await redis.rpush(OTP_QUEUE_KEY, JSON.stringify(payload));

  if (isOtpWorkerEnabled()) {
    scheduleOtpQueueDrain();
  }
};

const createAndQueueOtp = async ({ actorType, mobile, templateId, includeAppHash }) => {
  assertMsg91OtpConfigured();
  await checkOtpSendLimits({ actorType, mobile });

  const otp = generate4DigitOtp();
  await redis.setex(getOtpKey({ actorType, mobile }), OTP_TTL_SECONDS, {
    otp,
    mobile,
    createdAt: Date.now(),
  });
  await redis.del(getVerifyAttemptsKey({ actorType, mobile }));

  await enqueueOtp({ actorType, mobile, otp, templateId, includeAppHash });
};

const createStoredOtp = async ({ actorType, mobile, otp }) => {
  await checkOtpSendLimits({ actorType, mobile });

  await redis.setex(getOtpKey({ actorType, mobile }), OTP_TTL_SECONDS, {
    otp,
    mobile,
    createdAt: Date.now(),
  });
  await redis.del(getVerifyAttemptsKey({ actorType, mobile }));
};

const createAndQueueMobileOtp = async ({ actorType, mobile }) => {
  if (MSG91_MOBILE_OTP_TEMPLATE_ID && !ANDROID_SMS_RETRIEVER_HASH) {
    const error = new Error(
      "ANDROID_SMS_RETRIEVER_HASH must be configured when MSG91_MOBILE_OTP_TEMPLATE_ID is used"
    );
    error.statusCode = 503;
    throw error;
  }

  return createAndQueueOtp({
    actorType,
    mobile,
    templateId: MSG91_MOBILE_OTP_TEMPLATE_ID || undefined,
    includeAppHash: Boolean(MSG91_MOBILE_OTP_TEMPLATE_ID && ANDROID_SMS_RETRIEVER_HASH),
  });
};

const verifyQueuedOtp = async ({ actorType, mobile, otp }) => {
  const otpKey = getOtpKey({ actorType, mobile });
  const verifyAttemptsKey = getVerifyAttemptsKey({ actorType, mobile });
  await checkOtpVerifyLimits({ actorType, mobile });

  const storedData = parseRedisValue(await redis.get(otpKey));

  if (!storedData || storedData.mobile !== mobile || storedData.otp !== otp) {
    const error = new Error("Invalid or expired OTP");
    error.statusCode = 400;
    throw error;
  }

  await redis.del(otpKey);
  await redis.del(verifyAttemptsKey);
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
          templateId: job.templateId,
          variables: {
            otp: job.otp,
            ...(job.includeAppHash && ANDROID_SMS_RETRIEVER_HASH
              ? { app_hash: ANDROID_SMS_RETRIEVER_HASH }
              : {}),
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
  TOO_MANY_VERIFY_ATTEMPTS_MESSAGE,
  createAndQueueOtp,
  createAndQueueMobileOtp,
  createStoredOtp,
  verifyQueuedOtp,
  startOtpQueueWorker,
};
