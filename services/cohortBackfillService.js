const { Op, QueryTypes } = require("sequelize");
const { sequelize } = require("../dbConnection/dbConfig");
const User = require("../model/user/userAuth");
const AIChatSession = require("../model/aiChat/aiChatSession");
const AIChatMessage = require("../model/aiChat/aiChatMessage");
const ChatHistorySession = require("../model/chat/chatHistorySession");
const ChatHistoryMessage = require("../model/chat/chatHistoryMessage");
const InterestIntentResult = require("../model/interest/interestIntentResult");
const UserInterestScore = require("../model/interest/userInterestScore");
const { createChatCompletion } = require("./openaiClient");
const { refreshUserWalletCohorts } = require("./walletCohortService");
const { refreshUserAstroProductCohorts } = require("./astroProductCohortService");
const {
  buildHumanClassificationMessages,
  COHORT_TYPES,
  getInterestJsonSchema,
  normalizeClassificationPayload,
  recordIntentClassification,
} = require("./interestCohortService");

const DEFAULT_BACKFILL_LIMIT = 25;
const MAX_BACKFILL_LIMIT = 500;
const DEFAULT_INTEREST_LIMIT = 5;
const MAX_INTEREST_LIMIT = 25;
const DEFAULT_MESSAGE_LIMIT = 6;
const MAX_MESSAGE_LIMIT = 12;

function clampInteger(value, fallback, min, max) {
  const parsed = Number(value);
  if (!Number.isFinite(parsed)) return fallback;
  return Math.min(Math.max(Math.floor(parsed), min), max);
}

function normalizeBackfillType(value) {
  const normalized = String(value || "").trim().toLowerCase();
  return ["wallet", "astro", "interest"].includes(normalized) ? normalized : null;
}

function normalizeInterestSource(value) {
  const normalized = String(value || "").trim().toLowerCase();
  if (["ai", "ai_chat", "ai-chat"].includes(normalized)) return "ai_chat";
  if (["human", "human_chat", "real_astrologer", "real-astrologer"].includes(normalized)) {
    return "human_chat";
  }
  if (normalized === "both") return "both";
  return "ai_chat";
}

async function countDistinctUsers(tableName, whereSql = "") {
  const rows = await sequelize.query(
    `SELECT COUNT(DISTINCT "userId")::int AS "count" FROM "${tableName}" ${whereSql}`,
    { type: QueryTypes.SELECT }
  );
  return Number(rows[0]?.count || 0);
}

async function getUsersWithBothAiAndHumanChatCount() {
  const rows = await sequelize.query(
    `
      SELECT COUNT(*)::int AS "count"
      FROM (
        SELECT DISTINCT "userId" FROM "ai_chat_sessions"
      ) ai
      INNER JOIN (
        SELECT DISTINCT "userId" FROM "chat_history_sessions"
      ) human ON human."userId" = ai."userId"
    `,
    { type: QueryTypes.SELECT }
  );
  return Number(rows[0]?.count || 0);
}

async function countPendingCohortType(cohortType) {
  const rows = await sequelize.query(
    `
      SELECT COUNT(*)::int AS "count"
      FROM "users" users
      WHERE NOT EXISTS (
        SELECT 1
        FROM "user_interest_scores" scores
        WHERE scores."userId" = users."id"
          AND scores."cohortType" = :cohortType
      )
    `,
    {
      replacements: { cohortType },
      type: QueryTypes.SELECT,
    }
  );
  return Number(rows[0]?.count || 0);
}

async function countPendingInterestSource(source) {
  const sessionTable = source === "ai_chat" ? "ai_chat_sessions" : "chat_history_sessions";
  const resultSessionType = source === "ai_chat" ? "ai_chat" : "human_chat";
  const backfillSource = source === "ai_chat" ? "ai_chat_backfill" : "human_chat_backfill";

  const rows = await sequelize.query(
    `
      SELECT COUNT(*)::int AS "count"
      FROM (
        SELECT DISTINCT sessions."userId"
        FROM "${sessionTable}" sessions
        WHERE NOT EXISTS (
          SELECT 1
          FROM "interest_intent_results" results
          WHERE results."userId" = sessions."userId"
            AND results."sessionType" = :resultSessionType
            AND results."source" = :backfillSource
        )
      ) pending
    `,
    {
      replacements: { resultSessionType, backfillSource },
      type: QueryTypes.SELECT,
    }
  );
  return Number(rows[0]?.count || 0);
}

async function getBackfillStats() {
  const [
    totalUsers,
    walletPendingUsers,
    astroPendingUsers,
    aiChatUsers,
    humanChatUsers,
    bothAiAndHumanUsers,
    interestAiPendingUsers,
    interestHumanPendingUsers,
  ] = await Promise.all([
    User.count(),
    countPendingCohortType(COHORT_TYPES.WALLET),
    countPendingCohortType(COHORT_TYPES.ASTRO),
    countDistinctUsers("ai_chat_sessions"),
    countDistinctUsers("chat_history_sessions"),
    getUsersWithBothAiAndHumanChatCount(),
    countPendingInterestSource("ai_chat"),
    countPendingInterestSource("human_chat"),
  ]);

  const stats = {
    totalUsers,
    wallet: {
      pendingUsers: walletPendingUsers,
      processedUsers: Math.max(totalUsers - walletPendingUsers, 0),
    },
    astro: {
      pendingUsers: astroPendingUsers,
      processedUsers: Math.max(totalUsers - astroPendingUsers, 0),
    },
    interest: {
      aiChatUsers,
      humanChatUsers,
      bothAiAndHumanUsers,
      aiPendingUsers: interestAiPendingUsers,
      humanPendingUsers: interestHumanPendingUsers,
      totalPendingUserSources: interestAiPendingUsers + interestHumanPendingUsers,
    },
  };

  console.log("[CohortBackfill][Admin] Stats fetched", stats);
  return stats;
}

async function getPendingUsersForCohortType(cohortType, limit) {
  return User.findAll({
    where: sequelize.literal(`NOT EXISTS (
      SELECT 1
      FROM "user_interest_scores" scores
      WHERE scores."userId" = "User"."id"
        AND scores."cohortType" = ${sequelize.escape(cohortType)}
    )`),
    attributes: ["id"],
    order: [["createdAt", "ASC"]],
    limit,
  });
}

async function runDeterministicBackfill({ cohortType, limit, dryRun }) {
  const users = await getPendingUsersForCohortType(cohortType, limit);
  const userIds = users.map((user) => user.id);

  console.log("[CohortBackfill] Deterministic batch selected", {
    cohortType,
    limit,
    dryRun,
    selectedUsers: userIds.length,
    userIds,
  });

  if (dryRun) {
    return {
      cohortType,
      dryRun: true,
      selectedUsers: userIds.length,
      processedUsers: 0,
      failedUsers: 0,
      failures: [],
    };
  }

  const failures = [];
  for (const userId of userIds) {
    try {
      if (cohortType === COHORT_TYPES.WALLET) {
        await refreshUserWalletCohorts(userId);
      } else if (cohortType === COHORT_TYPES.ASTRO) {
        await refreshUserAstroProductCohorts(userId);
      }
    } catch (error) {
      failures.push({ userId, reason: error.message });
      console.error("[CohortBackfill] Deterministic user failed", {
        cohortType,
        userId,
        error: error.message,
      });
    }
  }

  return {
    cohortType,
    dryRun: false,
    selectedUsers: userIds.length,
    processedUsers: userIds.length - failures.length,
    failedUsers: failures.length,
    failures,
  };
}

async function getPendingInterestUsers(source, limit) {
  const sessionTable = source === "ai_chat" ? "ai_chat_sessions" : "chat_history_sessions";
  const backfillSource = source === "ai_chat" ? "ai_chat_backfill" : "human_chat_backfill";
  const resultSessionType = source === "ai_chat" ? "ai_chat" : "human_chat";

  return sequelize.query(
    `
      SELECT sessions."userId" AS "userId", MIN(sessions."id"::text)::uuid AS "sessionId"
      FROM "${sessionTable}" sessions
      WHERE NOT EXISTS (
        SELECT 1
        FROM "interest_intent_results" results
        WHERE results."userId" = sessions."userId"
          AND results."sessionType" = :resultSessionType
          AND results."source" = :backfillSource
      )
      GROUP BY sessions."userId"
      ORDER BY MIN(sessions."createdAt") ASC
      LIMIT :limit
    `,
    {
      replacements: { resultSessionType, backfillSource, limit },
      type: QueryTypes.SELECT,
    }
  );
}

async function getFirstAiUserMessages(userId, messageLimit) {
  const sessions = await AIChatSession.findAll({
    where: { userId },
    attributes: ["id"],
    order: [["createdAt", "ASC"]],
  });
  const sessionIds = sessions.map((session) => session.id);
  if (!sessionIds.length) return [];

  const messages = await AIChatMessage.findAll({
    where: {
      sessionId: { [Op.in]: sessionIds },
      role: "user",
    },
    attributes: ["content", "createdAt"],
    order: [["createdAt", "ASC"]],
    limit: messageLimit,
  });

  return messages.map((message) => message.content).filter(Boolean);
}

async function getFirstHumanUserMessages(userId, messageLimit) {
  const sessions = await ChatHistorySession.findAll({
    where: { userId },
    attributes: ["id"],
    order: [["createdAt", "ASC"]],
  });
  const sessionIds = sessions.map((session) => session.id);
  if (!sessionIds.length) return [];

  const messages = await ChatHistoryMessage.findAll({
    where: {
      historySessionId: { [Op.in]: sessionIds },
      senderType: "user",
      isDeleted: false,
    },
    attributes: ["message", "originalCreatedAt"],
    order: [["originalCreatedAt", "ASC"]],
    limit: messageLimit,
  });

  return messages.map((message) => message.message).filter(Boolean);
}

function extractUsage(completion) {
  const usage = completion?.usage || {};
  return {
    promptTokens: Number(usage.prompt_tokens || 0),
    completionTokens: Number(usage.completion_tokens || 0),
    totalTokens: Number(usage.total_tokens || 0),
  };
}

function addUsage(total, next) {
  return {
    promptTokens: total.promptTokens + next.promptTokens,
    completionTokens: total.completionTokens + next.completionTokens,
    totalTokens: total.totalTokens + next.totalTokens,
  };
}

async function classifyInterestBackfillUser({
  source,
  userId,
  sessionId,
  messageLimit,
  dryRun,
}) {
  const messages =
    source === "ai_chat"
      ? await getFirstAiUserMessages(userId, messageLimit)
      : await getFirstHumanUserMessages(userId, messageLimit);

  console.log("[CohortBackfill][Interest] User messages prepared", {
    source,
    userId,
    sessionId,
    messageCount: messages.length,
    dryRun,
  });

  if (!messages.length) {
    return {
      processed: false,
      reason: "no_user_messages",
      usage: { promptTokens: 0, completionTokens: 0, totalTokens: 0 },
    };
  }

  if (dryRun) {
    return {
      processed: false,
      dryRun: true,
      messageCount: messages.length,
      usage: { promptTokens: 0, completionTokens: 0, totalTokens: 0 },
    };
  }

  const completion = await createChatCompletion(
    {
      model:
        process.env.OPENAI_INTEREST_MODEL ||
        process.env.OPENAI_CHAT_MODEL_FAST ||
        process.env.OPENAI_CHAT_MODEL ||
        "gpt-4o-mini",
      messages: buildHumanClassificationMessages(messages),
      max_tokens: 120,
      temperature: 0,
      response_format: getInterestJsonSchema(),
    },
    {
      userId,
      feature: "cohort_interest_backfill",
      metadata: { source, sessionId, messageCount: messages.length },
    }
  );

  const usage = extractUsage(completion);
  const rawContent = completion.choices?.[0]?.message?.content || "";
  const classification = normalizeClassificationPayload(rawContent);

  console.log("[CohortBackfill][Interest] OpenAI classification received", {
    source,
    userId,
    sessionId,
    model: completion.model || null,
    usage,
    hasClassification: Boolean(classification),
    primaryIntent: classification?.primaryIntent || null,
    secondaryIntent: classification?.secondaryIntent || null,
    confidence: classification?.confidence || null,
  });

  const recordResult = await recordIntentClassification({
    userId,
    sessionId,
    sessionType: source === "ai_chat" ? "ai_chat" : "human_chat",
    source: source === "ai_chat" ? "ai_chat_backfill" : "human_chat_backfill",
    classification,
    metadata: {
      backfilled: true,
      backfillType: "manual_admin",
      backfillSource: source,
      messagesCount: messages.length,
      messageLimit,
      model: completion.model || null,
      usage,
      backfilledAt: new Date().toISOString(),
    },
  });

  return {
    processed: Boolean(recordResult.recorded),
    reason: recordResult.reason || null,
    classification,
    usage,
  };
}

async function runInterestBackfill({ source, limit, messageLimit, dryRun }) {
  const selectedSources = source === "both" ? ["ai_chat", "human_chat"] : [source];
  const totalUsage = { promptTokens: 0, completionTokens: 0, totalTokens: 0 };
  const sourceResults = [];

  for (const selectedSource of selectedSources) {
    const pendingUsers = await getPendingInterestUsers(selectedSource, limit);
    const sourceUsage = { promptTokens: 0, completionTokens: 0, totalTokens: 0 };
    const failures = [];
    let processedUsers = 0;
    let skippedUsers = 0;

    console.log("[CohortBackfill][Interest] Batch selected", {
      source: selectedSource,
      limit,
      messageLimit,
      dryRun,
      selectedUsers: pendingUsers.length,
      estimatedOpenAICalls: dryRun ? 0 : pendingUsers.length,
      userIds: pendingUsers.map((user) => user.userId),
    });

    for (const pendingUser of pendingUsers) {
      try {
        const result = await classifyInterestBackfillUser({
          source: selectedSource,
          userId: pendingUser.userId,
          sessionId: pendingUser.sessionId,
          messageLimit,
          dryRun,
        });
        const nextUsage = result.usage || { promptTokens: 0, completionTokens: 0, totalTokens: 0 };
        sourceUsage.promptTokens += nextUsage.promptTokens;
        sourceUsage.completionTokens += nextUsage.completionTokens;
        sourceUsage.totalTokens += nextUsage.totalTokens;

        if (result.processed) {
          processedUsers += 1;
        } else {
          skippedUsers += 1;
        }
      } catch (error) {
        failures.push({ userId: pendingUser.userId, reason: error.message });
        console.error("[CohortBackfill][Interest] User failed", {
          source: selectedSource,
          userId: pendingUser.userId,
          error: error.message,
        });
      }
    }

    const nextTotalUsage = addUsage(totalUsage, sourceUsage);
    totalUsage.promptTokens = nextTotalUsage.promptTokens;
    totalUsage.completionTokens = nextTotalUsage.completionTokens;
    totalUsage.totalTokens = nextTotalUsage.totalTokens;

    const result = {
      source: selectedSource,
      dryRun,
      selectedUsers: pendingUsers.length,
      processedUsers,
      skippedUsers,
      failedUsers: failures.length,
      failures,
      usage: sourceUsage,
    };

    console.log("[CohortBackfill][Interest] Batch completed", result);
    sourceResults.push(result);
  }

  const response = {
    cohortType: COHORT_TYPES.INTEREST,
    source,
    dryRun,
    messageLimit,
    selectedUsers: sourceResults.reduce((sum, item) => sum + item.selectedUsers, 0),
    processedUsers: sourceResults.reduce((sum, item) => sum + item.processedUsers, 0),
    skippedUsers: sourceResults.reduce((sum, item) => sum + item.skippedUsers, 0),
    failedUsers: sourceResults.reduce((sum, item) => sum + item.failedUsers, 0),
    estimatedOpenAICalls: dryRun ? 0 : sourceResults.reduce((sum, item) => sum + item.selectedUsers, 0),
    usage: totalUsage,
    sources: sourceResults,
  };

  console.log("[CohortBackfill][Interest] Manual backfill completed", response);
  return response;
}

async function runManualCohortBackfill(options = {}) {
  const cohortType = normalizeBackfillType(options.cohortType);
  if (!cohortType) {
    return { success: false, reason: "invalid_cohort_type" };
  }

  const dryRun = options.dryRun === true || options.dryRun === "true";
  const defaultLimit = cohortType === COHORT_TYPES.INTEREST ? DEFAULT_INTEREST_LIMIT : DEFAULT_BACKFILL_LIMIT;
  const maxLimit = cohortType === COHORT_TYPES.INTEREST ? MAX_INTEREST_LIMIT : MAX_BACKFILL_LIMIT;
  const limit = clampInteger(options.limit, defaultLimit, 1, maxLimit);

  console.log("[CohortBackfill][Admin] Manual backfill requested", {
    cohortType,
    limit,
    dryRun,
    source: options.source || null,
    messageLimit: options.messageLimit || null,
  });

  if (cohortType === COHORT_TYPES.WALLET || cohortType === COHORT_TYPES.ASTRO) {
    return runDeterministicBackfill({ cohortType, limit, dryRun });
  }

  const source = normalizeInterestSource(options.source);
  const messageLimit = clampInteger(
    options.messageLimit,
    DEFAULT_MESSAGE_LIMIT,
    1,
    MAX_MESSAGE_LIMIT
  );

  return runInterestBackfill({ source, limit, messageLimit, dryRun });
}

module.exports = {
  getBackfillStats,
  runManualCohortBackfill,
};
