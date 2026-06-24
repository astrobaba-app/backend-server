const redis = require("../config/redis/redis");

const INTEREST_QUEUE_NAME =
  process.env.INTEREST_CLASSIFICATION_QUEUE || "interest_classification_queue";

async function enqueueHumanConsultationInterestClassification({ userId, sessionId, endedAt }) {
  if (!userId || !sessionId) {
    console.log("[InterestCohort][Human] Queue skipped; missing fields", {
      userId,
      sessionId,
      endedAt,
    });
    return { queued: false, reason: "missing_required_fields" };
  }

  const payload = {
    userId,
    sessionId,
    consultationEndTime: endedAt || new Date().toISOString(),
    attempts: 0,
  };

  try {
    await redis.lpush(INTEREST_QUEUE_NAME, JSON.stringify(payload));
    console.log("[InterestCohort][Human] Queued consultation for classification", {
      queue: INTEREST_QUEUE_NAME,
      userId,
      sessionId,
      consultationEndTime: payload.consultationEndTime,
    });
    return { queued: true };
  } catch (error) {
    console.error("[InterestCohort][Human] Failed to queue interest classification:", error);
    return { queued: false, reason: "redis_error" };
  }
}

module.exports = {
  INTEREST_QUEUE_NAME,
  enqueueHumanConsultationInterestClassification,
};
