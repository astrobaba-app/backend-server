const redis = require("../config/redis/redis");
const Review = require("../model/review/review");
const AIChatSession = require("../model/aiChat/aiChatSession");
const { Op } = require("sequelize");

const CHAT_FEEDBACK_PROMPT_PREFIX = "chat_feedback_prompt";
const CHAT_FEEDBACK_PROMPT_TTL_SECONDS = 30 * 60;
const CHAT_FEEDBACK_PROMPT_DELAY_MS = 5500;
const MIN_CHAT_FEEDBACK_SECONDS = 60;

const getPromptKey = (userId) => `${CHAT_FEEDBACK_PROMPT_PREFIX}:${userId}`;

const safeParsePrompt = (rawValue) => {
  if (!rawValue) return null;
  if (typeof rawValue === "object") return rawValue;

  try {
    return JSON.parse(rawValue);
  } catch {
    return null;
  }
};

const getSessionDurationSeconds = (session) => {
  const startMs = session?.startTime ? new Date(session.startTime).getTime() : NaN;
  const endMs = session?.endTime ? new Date(session.endTime).getTime() : NaN;

  if (Number.isFinite(startMs) && Number.isFinite(endMs) && endMs >= startMs) {
    return Math.floor((endMs - startMs) / 1000);
  }

  const totalMinutes = Number(session?.totalMinutes || 0);
  if (Number.isFinite(totalMinutes) && totalMinutes > 0) {
    return Math.round(totalMinutes * 60);
  }

  return 0;
};

const hasRealAstrologerReview = async ({ userId, astrologerId }) => {
  if (!userId || !astrologerId) return false;
  const existing = await Review.findOne({
    where: { userId, astrologerId },
    attributes: ["id"],
  });
  return Boolean(existing);
};

const hasAiAstrologerFeedback = async ({ userId, astrologerId }) => {
  if (!userId || !astrologerId) return false;
  const existing = await AIChatSession.findOne({
    where: {
      userId,
      astrologerId,
      feedbackSubmittedAt: { [Op.ne]: null },
    },
    attributes: ["id"],
  });
  return Boolean(existing);
};

const shouldQueuePromptForTarget = async ({ targetType, userId, astrologerId }) => {
  if (targetType === "real") {
    return !(await hasRealAstrologerReview({ userId, astrologerId }));
  }

  if (targetType === "ai") {
    return !(await hasAiAstrologerFeedback({ userId, astrologerId }));
  }

  return false;
};

const queueChatFeedbackPrompt = async ({
  userId,
  targetType,
  astrologerId,
  astrologerName,
  sessionId = null,
  durationSeconds = 0,
}) => {
  if (!userId || !targetType || !astrologerId) {
    return null;
  }

  if (durationSeconds < MIN_CHAT_FEEDBACK_SECONDS) {
    return null;
  }

  const canQueue = await shouldQueuePromptForTarget({
    targetType,
    userId,
    astrologerId,
  });

  if (!canQueue) {
    return null;
  }

  const prompt = {
    promptId: `${targetType}:${astrologerId}:${sessionId || Date.now()}`,
    userId,
    targetType,
    astrologerId,
    astrologerName: astrologerName || "Astrologer",
    sessionId,
    durationSeconds,
    availableAt: Date.now() + CHAT_FEEDBACK_PROMPT_DELAY_MS,
    createdAt: new Date().toISOString(),
  };

  await redis.set(getPromptKey(userId), JSON.stringify(prompt), {
    ex: CHAT_FEEDBACK_PROMPT_TTL_SECONDS,
  });
  return prompt;
};

const getPendingChatFeedbackPrompt = async (userId) => {
  const prompt = safeParsePrompt(await redis.get(getPromptKey(userId)));
  if (!prompt) {
    return null;
  }

  const canQueue = await shouldQueuePromptForTarget({
    targetType: prompt.targetType,
    userId,
    astrologerId: prompt.astrologerId,
  });

  if (!canQueue) {
    await redis.del(getPromptKey(userId));
    return null;
  }

  return prompt;
};

const dismissPendingChatFeedbackPrompt = async (userId) => {
  await redis.del(getPromptKey(userId));
};

module.exports = {
  MIN_CHAT_FEEDBACK_SECONDS,
  getPendingChatFeedbackPrompt,
  dismissPendingChatFeedbackPrompt,
  getSessionDurationSeconds,
  queueChatFeedbackPrompt,
};
