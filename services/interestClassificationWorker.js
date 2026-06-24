const ChatMessage = require("../model/chat/chatMessage");
const ChatSession = require("../model/chat/chatSession");
const ChatHistoryMessage = require("../model/chat/chatHistoryMessage");
const ChatHistorySession = require("../model/chat/chatHistorySession");
const redis = require("../config/redis/redis");
const { createChatCompletion } = require("./openaiClient");
const {
  INTEREST_QUEUE_NAME,
} = require("./interestQueueService");
const {
  buildHumanClassificationMessages,
  getInterestJsonSchema,
  normalizeClassificationPayload,
  recordIntentClassification,
} = require("./interestCohortService");

const DEFAULT_WORKER_INTERVAL_SECONDS = 3600;
const DEFAULT_MESSAGES_COUNT = 8;
const MAX_QUEUE_ATTEMPTS = 5;

let workerTimer = null;
let isProcessing = false;

function getWorkerIntervalMs() {
  const seconds = Number(process.env.INTEREST_WORKER_INTERVAL || DEFAULT_WORKER_INTERVAL_SECONDS);
  return Math.max(60, Number.isFinite(seconds) ? seconds : DEFAULT_WORKER_INTERVAL_SECONDS) * 1000;
}

function getMessagesCount() {
  const count = Number(process.env.INTEREST_MESSAGES_COUNT || DEFAULT_MESSAGES_COUNT);
  return Math.min(Math.max(Number.isFinite(count) ? Math.floor(count) : DEFAULT_MESSAGES_COUNT, 1), 20);
}

function parseQueueItem(raw) {
  if (!raw) return null;
  if (typeof raw === "object") return raw;
  try {
    return JSON.parse(raw);
  } catch (error) {
    console.error("Invalid interest queue item:", error);
    return null;
  }
}

async function requeueWithBackoff(item, reason) {
  const attempts = Number(item?.attempts || 0) + 1;
  if (attempts >= MAX_QUEUE_ATTEMPTS) {
    console.error("[InterestCohort][Worker] Dropping queue item after max attempts:", {
      sessionId: item?.sessionId,
      reason,
    });
    return;
  }

  await redis.lpush(
    INTEREST_QUEUE_NAME,
    JSON.stringify({
      ...item,
      attempts,
      lastFailureReason: reason,
      lastFailedAt: new Date().toISOString(),
    })
  );
}

async function getRecentUserMessagesForSession(sessionId) {
  const limit = getMessagesCount();

  const historySession = await ChatHistorySession.findOne({
    where: { sourceSessionId: sessionId },
    attributes: ["id", "userId"],
  });

  if (historySession) {
    const messages = await ChatHistoryMessage.findAll({
      where: {
        historySessionId: historySession.id,
        senderType: "user",
        isDeleted: false,
      },
      order: [["originalCreatedAt", "DESC"]],
      limit,
      attributes: ["message"],
    });

    const result = {
      userId: historySession.userId,
      messages: messages.reverse().map((message) => message.message).filter(Boolean),
    };
    console.log("[InterestCohort][Worker] Loaded user messages from chat history", {
      sessionId,
      historySessionId: historySession.id,
      userId: result.userId,
      messageCount: result.messages.length,
    });
    return result;
  }

  const liveSession = await ChatSession.findByPk(sessionId, {
    attributes: ["id", "userId"],
  });
  if (!liveSession) {
    console.log("[InterestCohort][Worker] No live or history session found", {
      sessionId,
    });
    return { userId: null, messages: [] };
  }

  const messages = await ChatMessage.findAll({
    where: {
      sessionId,
      senderType: "user",
      isDeleted: false,
    },
    order: [["createdAt", "DESC"]],
    limit,
    attributes: ["message"],
  });

  const result = {
    userId: liveSession.userId,
    messages: messages.reverse().map((message) => message.message).filter(Boolean),
  };
  console.log("[InterestCohort][Worker] Loaded user messages from live chat", {
    sessionId,
    userId: result.userId,
    messageCount: result.messages.length,
  });
  return result;
}

async function processQueueItem(item) {
  const parsed = parseQueueItem(item);
  if (!parsed?.sessionId) {
    console.log("[InterestCohort][Worker] Skipped invalid queue item", {
      item,
    });
    return { processed: false, reason: "invalid_item" };
  }

  console.log("[InterestCohort][Worker] Processing queue item", {
    sessionId: parsed.sessionId,
    userId: parsed.userId || null,
    attempts: parsed.attempts || 0,
  });

  const { userId: resolvedUserId, messages } = await getRecentUserMessagesForSession(parsed.sessionId);
  const userId = parsed.userId || resolvedUserId;

  if (!userId || messages.length === 0) {
    console.log("[InterestCohort][Worker] Requeueing item; messages unavailable", {
      sessionId: parsed.sessionId,
      userId,
      messageCount: messages.length,
    });
    await requeueWithBackoff(parsed, "messages_not_available");
    return { processed: false, reason: "messages_not_available" };
  }

  const completion = await createChatCompletion(
    {
      model: process.env.OPENAI_INTEREST_MODEL || process.env.OPENAI_CHAT_MODEL_FAST || process.env.OPENAI_CHAT_MODEL || "gpt-4o-mini",
      messages: buildHumanClassificationMessages(messages),
      max_tokens: 120,
      temperature: 0,
      response_format: getInterestJsonSchema(),
    },
    {
      userId,
      feature: "human_chat_interest_classification",
      metadata: { sessionId: parsed.sessionId },
    }
  );

  const rawContent = completion.choices?.[0]?.message?.content || "";
  const classification = normalizeClassificationPayload(rawContent);
  console.log("[InterestCohort][Worker] OpenAI classification received", {
    sessionId: parsed.sessionId,
    userId,
    hasClassification: Boolean(classification),
    primaryIntent: classification?.primaryIntent || null,
    secondaryIntent: classification?.secondaryIntent || null,
    confidence: classification?.confidence || null,
  });

  const result = await recordIntentClassification({
    userId,
    sessionId: parsed.sessionId,
    sessionType: "human_chat",
    source: "human_chat_worker",
    classification,
    metadata: {
      consultationEndTime: parsed.consultationEndTime || null,
      messagesCount: messages.length,
      model: completion.model || null,
    },
  });

  console.log("[InterestCohort][Worker] Queue item record result", {
    sessionId: parsed.sessionId,
    userId,
    recorded: result.recorded,
    reason: result.reason || null,
  });

  return {
    processed: result.recorded,
    reason: result.reason || null,
  };
}

async function processInterestClassificationQueue() {
  if (isProcessing) {
    console.log("[InterestCohort][Worker] Queue processing skipped; already running");
    return;
  }
  isProcessing = true;

  try {
    const batchSize = Math.min(Math.max(Number(process.env.INTEREST_WORKER_BATCH_SIZE || 25), 1), 100);
    console.log("[InterestCohort][Worker] Queue processing started", {
      queue: INTEREST_QUEUE_NAME,
      batchSize,
    });

    for (let index = 0; index < batchSize; index += 1) {
      const item = await redis.rpop(INTEREST_QUEUE_NAME);
      if (!item) {
        console.log("[InterestCohort][Worker] Queue empty");
        break;
      }

      try {
        await processQueueItem(item);
      } catch (error) {
        const parsed = parseQueueItem(item);
        console.error("[InterestCohort][Worker] Queue item failed:", error);
        if (parsed) {
          await requeueWithBackoff(parsed, error.message || "processing_failed");
        }
      }
    }
  } finally {
    isProcessing = false;
  }
}

function startInterestClassificationWorker() {
  if (workerTimer || process.env.INTEREST_WORKER_DISABLED === "true") {
    console.log("[InterestCohort][Worker] Worker not started", {
      alreadyStarted: Boolean(workerTimer),
      disabled: process.env.INTEREST_WORKER_DISABLED === "true",
    });
    return;
  }

  const intervalMs = getWorkerIntervalMs();
  workerTimer = setInterval(processInterestClassificationQueue, intervalMs);
  setTimeout(processInterestClassificationQueue, 5000);
  console.log(`Interest classification worker enabled every ${Math.round(intervalMs / 1000)} seconds`);
}

module.exports = {
  processInterestClassificationQueue,
  startInterestClassificationWorker,
};
