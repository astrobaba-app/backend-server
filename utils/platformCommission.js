const DEFAULT_ASTROLOGER_PLATFORM_COMMISSION_PERCENT = 20;

const toCommissionPercent = (value, fallback) => {
  const parsed = Number.parseFloat(String(value ?? "").trim());

  if (!Number.isFinite(parsed)) {
    return fallback;
  }

  return Math.min(Math.max(parsed, 0), 100);
};

const ASTROLOGER_PLATFORM_COMMISSION_PERCENT = toCommissionPercent(
  process.env.ASTROLOGER_PLATFORM_COMMISSION_PERCENT,
  DEFAULT_ASTROLOGER_PLATFORM_COMMISSION_PERCENT
);

module.exports = {
  ASTROLOGER_PLATFORM_COMMISSION_PERCENT,
};
