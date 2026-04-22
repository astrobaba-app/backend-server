const redis = require("../config/redis/redis");

const parsePositiveInteger = (value, fallbackValue) => {
  const parsedValue = Number.parseInt(String(value || ""), 10);
  if (!Number.isFinite(parsedValue) || parsedValue <= 0) {
    return fallbackValue;
  }
  return parsedValue;
};

const DEFAULT_OTP_LIMIT = parsePositiveInteger(
  process.env.FIREBASE_OTP_RATE_LIMIT_MAX_REQUESTS,
  10
);

const DEFAULT_OTP_WINDOW_SECONDS = parsePositiveInteger(
  process.env.FIREBASE_OTP_RATE_LIMIT_WINDOW_SECONDS,
  3600
);

const normalizeScope = (scope) => {
  const safeScope = String(scope || "default").trim().toLowerCase();
  return safeScope.replace(/[^a-z0-9:_-]/g, "") || "default";
};

const toSafeNumber = (value, fallbackValue = 0) => {
  if (typeof value === "number" && Number.isFinite(value)) {
    return value;
  }

  const parsedValue = Number.parseInt(String(value || ""), 10);
  if (Number.isFinite(parsedValue)) {
    return parsedValue;
  }

  return fallbackValue;
};

const buildRateLimitKey = (scope, mobile) =>
  `firebase:otp:rate-limit:${normalizeScope(scope)}:${mobile}`;

const checkAndConsumeFirebaseOtpQuota = async ({
  mobile,
  scope = "default",
  limit = DEFAULT_OTP_LIMIT,
  windowSeconds = DEFAULT_OTP_WINDOW_SECONDS,
}) => {
  const key = buildRateLimitKey(scope, mobile);

  try {
    const currentCountRaw = await redis.incr(key);
    const currentCount = toSafeNumber(currentCountRaw, 0);

    if (currentCount <= 1) {
      await redis.expire(key, windowSeconds);
    }

    const keyTtlRaw = await redis.ttl(key);
    const ttlSeconds = toSafeNumber(keyTtlRaw, windowSeconds);
    const retryAfterSeconds = ttlSeconds > 0 ? ttlSeconds : windowSeconds;

    const remaining = Math.max(limit - currentCount, 0);
    const isAllowed = currentCount <= limit;

    return {
      allowed: isAllowed,
      limit,
      windowSeconds,
      remaining,
      retryAfterSeconds,
      scope: normalizeScope(scope),
      degraded: false,
    };
  } catch (error) {
    console.error("Firebase OTP quota check failed:", error);

    // Fail open for availability. Firebase will still enforce its own limits.
    return {
      allowed: true,
      limit,
      windowSeconds,
      remaining: null,
      retryAfterSeconds: 0,
      scope: normalizeScope(scope),
      degraded: true,
    };
  }
};

module.exports = {
  checkAndConsumeFirebaseOtpQuota,
};
