const { Op } = require("sequelize");
const { sequelize } = require("../dbConnection/dbConfig");
const InterestIntentResult = require("../model/interest/interestIntentResult");
const UserInterestScore = require("../model/interest/userInterestScore");
const UserInterestCohort = require("../model/interest/userInterestCohort");

const INTEREST_CATEGORIES = InterestIntentResult.INTEREST_CATEGORIES;
const INTEREST_CATEGORY_SET = new Set(INTEREST_CATEGORIES);
const COHORT_TYPES = {
  INTEREST: "interest",
  WALLET: "wallet",
  ASTRO: "astro",
  ACTIVITY: "activity",
};
const WALLET_CATEGORIES = [
  "NeverRecharged",
  "FirstRechargeCompleted",
  "RepeatRecharger",
  "LowBalanceUser",
  "HighBalanceUser",
];
const WALLET_CATEGORY_SET = new Set(WALLET_CATEGORIES);
const ASTRO_CATEGORIES = [
  "KundliNotCreated",
  "KundliCreated",
  "KundliViewed",
  "MatchingNotCreated",
  "MatchingCreated",
  "MatchingViewed",
  "HoroscopeViewed",
];
const ASTRO_CATEGORY_SET = new Set(ASTRO_CATEGORIES);
const ACTIVITY_CATEGORIES = [
  "NewUser",
  "ExistingUser",
  "PhoneLoginUser",
  "GoogleLoginUser",
  "AppleLoginUser",
  "RepeatLoginUser",
  "RecentlyActiveUser",
  "Inactive30DaysUser",
  "DormantUser",
  "LoggedOutUser",
];
const ACTIVITY_CATEGORY_SET = new Set(ACTIVITY_CATEGORIES);
const PRIMARY_SCORE_INCREMENT = Number(process.env.INTEREST_PRIMARY_SCORE_INCREMENT || 10);
const SECONDARY_SCORE_INCREMENT = Number(process.env.INTEREST_SECONDARY_SCORE_INCREMENT || 5);
const COHORT_SCORE_THRESHOLD = 1;
const MIN_CONFIDENCE = Number(process.env.INTEREST_MIN_CONFIDENCE || 0.45);

function normalizeInterestCategory(value) {
  const normalized = String(value || "").trim().toLowerCase();
  return INTEREST_CATEGORIES.find((category) => category.toLowerCase() === normalized) || null;
}

function normalizeWalletCategory(value) {
  const normalized = String(value || "").trim().toLowerCase();
  return WALLET_CATEGORIES.find((category) => category.toLowerCase() === normalized) || null;
}

function normalizeAstroCategory(value) {
  const normalized = String(value || "").trim().toLowerCase();
  return ASTRO_CATEGORIES.find((category) => category.toLowerCase() === normalized) || null;
}

function normalizeActivityCategory(value) {
  const normalized = String(value || "").trim().toLowerCase();
  return ACTIVITY_CATEGORIES.find((category) => category.toLowerCase() === normalized) || null;
}

function normalizeCohortType(value) {
  const normalized = String(value || "").trim().toLowerCase();
  return Object.values(COHORT_TYPES).includes(normalized) ? normalized : null;
}

function normalizeCohortCategory(cohortType, value) {
  if (cohortType === COHORT_TYPES.INTEREST) return normalizeInterestCategory(value);
  if (cohortType === COHORT_TYPES.WALLET) return normalizeWalletCategory(value);
  if (cohortType === COHORT_TYPES.ASTRO) return normalizeAstroCategory(value);
  if (cohortType === COHORT_TYPES.ACTIVITY) return normalizeActivityCategory(value);
  return null;
}

function getCategoriesForCohortType(cohortType) {
  if (cohortType === COHORT_TYPES.INTEREST) return INTEREST_CATEGORIES;
  if (cohortType === COHORT_TYPES.WALLET) return WALLET_CATEGORIES;
  if (cohortType === COHORT_TYPES.ASTRO) return ASTRO_CATEGORIES;
  if (cohortType === COHORT_TYPES.ACTIVITY) return ACTIVITY_CATEGORIES;
  return [...INTEREST_CATEGORIES, ...WALLET_CATEGORIES, ...ASTRO_CATEGORIES, ...ACTIVITY_CATEGORIES];
}

function isKnownCohortCategory(cohortType, category) {
  if (cohortType === COHORT_TYPES.INTEREST) return INTEREST_CATEGORY_SET.has(category);
  if (cohortType === COHORT_TYPES.WALLET) return WALLET_CATEGORY_SET.has(category);
  if (cohortType === COHORT_TYPES.ASTRO) return ASTRO_CATEGORY_SET.has(category);
  if (cohortType === COHORT_TYPES.ACTIVITY) return ACTIVITY_CATEGORY_SET.has(category);
  return false;
}

function clampConfidence(value) {
  const parsed = Number(value);
  if (!Number.isFinite(parsed)) return 0;
  return Math.max(0, Math.min(1, parsed));
}

function extractJsonObject(text) {
  const raw = String(text || "").trim();
  if (!raw) return null;

  try {
    return JSON.parse(raw);
  } catch (_) {
    const firstBrace = raw.indexOf("{");
    const lastBrace = raw.lastIndexOf("}");
    if (firstBrace === -1 || lastBrace === -1 || lastBrace <= firstBrace) {
      return null;
    }

    try {
      return JSON.parse(raw.slice(firstBrace, lastBrace + 1));
    } catch (_ignored) {
      return null;
    }
  }
}

function normalizeClassificationPayload(payload) {
  const parsed = typeof payload === "string" ? extractJsonObject(payload) : payload;
  if (!parsed || typeof parsed !== "object") return null;

  const primaryIntent = normalizeInterestCategory(
    parsed.primaryIntent || parsed.primary_intent || parsed.primary
  );
  const secondaryIntent = normalizeInterestCategory(
    parsed.secondaryIntent || parsed.secondary_intent || parsed.secondary
  );
  const confidence = clampConfidence(parsed.confidence ?? parsed.confidenceScore);

  if (!primaryIntent || confidence < MIN_CONFIDENCE) {
    return null;
  }

  return {
    primaryIntent,
    secondaryIntent: secondaryIntent && secondaryIntent !== primaryIntent ? secondaryIntent : null,
    confidence,
  };
}

function getInterestJsonSchema({ includeAstrologyResponse = false } = {}) {
  const properties = includeAstrologyResponse
    ? {
        astrologyResponse: {
          type: "string",
          description: "The exact user-facing astrology response.",
        },
        intentClassification: {
          type: "object",
          additionalProperties: false,
          properties: {
            primaryIntent: { type: "string", enum: INTEREST_CATEGORIES },
            secondaryIntent: { type: ["string", "null"], enum: [...INTEREST_CATEGORIES, null] },
            confidence: { type: "number", minimum: 0, maximum: 1 },
          },
          required: ["primaryIntent", "secondaryIntent", "confidence"],
        },
      }
    : {
        primaryIntent: { type: "string", enum: INTEREST_CATEGORIES },
        secondaryIntent: { type: ["string", "null"], enum: [...INTEREST_CATEGORIES, null] },
        confidence: { type: "number", minimum: 0, maximum: 1 },
      };

  return {
    type: "json_schema",
    json_schema: {
      name: includeAstrologyResponse
        ? "astrology_response_with_interest_intent"
        : "interest_intent_classification",
      strict: true,
      schema: {
        type: "object",
        additionalProperties: false,
        properties,
        required: Object.keys(properties),
      },
    },
  };
}

function buildInlineIntentInstruction() {
  return `\n\nINTERNAL RESPONSE FORMAT:\nReturn a strict JSON object with astrologyResponse and intentClassification.\n- astrologyResponse must contain only the user-facing astrology answer.\n- intentClassification.primaryIntent and secondaryIntent must be chosen from: ${INTEREST_CATEGORIES.join(", ")}.\n- Use null for secondaryIntent if there is no clear secondary interest.\n- confidence must be a number from 0 to 1.\n- Do not add explanations outside JSON.`;
}

function parseInlineAiResponse(content) {
  const parsed = extractJsonObject(content);
  if (!parsed || typeof parsed !== "object") {
    return {
      astrologyResponse: String(content || ""),
      classification: null,
    };
  }

  return {
    astrologyResponse: String(parsed.astrologyResponse || parsed.response || ""),
    classification: normalizeClassificationPayload(
      parsed.intentClassification || parsed.intent || parsed
    ),
  };
}

function buildHumanClassificationMessages(messages) {
  const recentMessages = (messages || [])
    .map((message, index) => `${index + 1}. ${String(message || "").trim()}`)
    .filter(Boolean)
    .join("\n");

  return [
    {
      role: "system",
      content:
        "You classify astrology consultation intent for cohorting. Return JSON only. " +
        `Choose categories only from: ${INTEREST_CATEGORIES.join(", ")}.`,
    },
    {
      role: "user",
      content:
        "Classify the user's main consultation interest from these recent user messages.\n" +
        "Return primaryIntent, secondaryIntent, and confidence. No explanation.\n\n" +
        recentMessages,
    },
  ];
}

function buildConsultationClassificationMessages(messages) {
  return buildHumanClassificationMessages(messages);
}

async function setCohortScore({
  userId,
  cohortType = COHORT_TYPES.INTEREST,
  category,
  score,
  intentResultId = null,
  metadata = null,
  transaction,
}) {
  if (!userId || !isKnownCohortCategory(cohortType, category)) return null;

  const [scoreRow] = await UserInterestScore.findOrCreate({
    where: { userId, cohortType, category },
    defaults: {
      userId,
      cohortType,
      category,
      score: 0,
      lastIntentResultId: intentResultId,
      lastUpdatedAt: new Date(),
      metadata,
    },
    transaction,
    lock: transaction.LOCK.UPDATE,
  });

  const previousScore = Number(scoreRow.score || 0);
  const nextScore = Math.max(0, Math.round(Number(score || 0)));
  await scoreRow.update(
    {
      score: nextScore,
      lastIntentResultId: intentResultId,
      lastUpdatedAt: new Date(),
      metadata,
    },
    { transaction }
  );

  console.log("[Cohort] Set user cohort score", {
    userId,
    cohortType,
    category,
    previousScore,
    nextScore,
    cohortThreshold: COHORT_SCORE_THRESHOLD,
    qualifiesForCohort: nextScore >= COHORT_SCORE_THRESHOLD,
    intentResultId,
  });

  return scoreRow;
}

async function upsertScore({
  userId,
  cohortType = COHORT_TYPES.INTEREST,
  category,
  increment,
  intentResultId,
  metadata = null,
  transaction,
}) {
  if (!category || !isKnownCohortCategory(cohortType, category) || !increment) return null;

  const existing = await UserInterestScore.findOne({
    where: { userId, cohortType, category },
    transaction,
    lock: transaction.LOCK.UPDATE,
  });
  const previousScore = Number(existing?.score || 0);

  return setCohortScore({
    userId,
    cohortType,
    category,
    score: previousScore + increment,
    intentResultId,
    metadata,
    transaction,
  });
}

async function updateCohortForScore(scoreRow, transaction) {
  if (!scoreRow) return null;

  const active = Number(scoreRow.score || 0) >= COHORT_SCORE_THRESHOLD;
  const [cohort] = await UserInterestCohort.findOrCreate({
    where: {
      userId: scoreRow.userId,
      cohortType: scoreRow.cohortType,
      category: scoreRow.category,
    },
    defaults: {
      userId: scoreRow.userId,
      cohortType: scoreRow.cohortType,
      category: scoreRow.category,
      scoreAtAssignment: scoreRow.score,
      isActive: active,
      assignedAt: new Date(),
      lastQualifiedAt: new Date(),
      metadata: scoreRow.metadata,
    },
    transaction,
  });

  if (active) {
    await cohort.update(
      {
        isActive: true,
        scoreAtAssignment: scoreRow.score,
        lastQualifiedAt: new Date(),
        metadata: scoreRow.metadata,
      },
      { transaction }
    );
  } else if (cohort.isActive) {
    await cohort.update(
      {
        isActive: false,
        scoreAtAssignment: scoreRow.score,
        metadata: scoreRow.metadata,
      },
      { transaction }
    );
  }

  console.log("[Cohort] Evaluated cohort membership", {
    userId: scoreRow.userId,
    cohortType: scoreRow.cohortType,
    category: scoreRow.category,
    score: Number(scoreRow.score || 0),
    threshold: COHORT_SCORE_THRESHOLD,
    isActive: active,
    cohortId: cohort.id,
  });

  return cohort;
}

function buildScoreIncrementMap(classification) {
  const increments = new Map();
  if (!classification) return increments;

  if (classification.primaryIntent) {
    increments.set(
      classification.primaryIntent,
      (increments.get(classification.primaryIntent) || 0) + PRIMARY_SCORE_INCREMENT
    );
  }

  if (
    classification.secondaryIntent &&
    classification.secondaryIntent !== classification.primaryIntent
  ) {
    increments.set(
      classification.secondaryIntent,
      (increments.get(classification.secondaryIntent) || 0) + SECONDARY_SCORE_INCREMENT
    );
  }

  return increments;
}

async function applyScoreDeltas({
  userId,
  previousClassification,
  nextClassification,
  intentResultId,
  transaction,
}) {
  const previousIncrements = buildScoreIncrementMap(previousClassification);
  const nextIncrements = buildScoreIncrementMap(nextClassification);
  const categories = new Set([
    ...previousIncrements.keys(),
    ...nextIncrements.keys(),
  ]);
  const updatedScores = [];

  for (const category of categories) {
    const delta =
      (nextIncrements.get(category) || 0) - (previousIncrements.get(category) || 0);
    if (!delta) continue;

    const score = await upsertScore({
      userId,
      cohortType: COHORT_TYPES.INTEREST,
      category,
      increment: delta,
      intentResultId,
      transaction,
    });
    updatedScores.push(score);
  }

  for (const score of updatedScores) {
    await updateCohortForScore(score, transaction);
  }

  return updatedScores;
}

async function recordIntentClassification({
  userId,
  sessionId,
  sessionType,
  source,
  classification,
  metadata = null,
}) {
  const normalized = normalizeClassificationPayload(classification);
  if (!userId || !sessionId || !sessionType || !source || !normalized) {
    console.log("[InterestCohort] Skipped recording invalid classification", {
      userId,
      sessionId,
      sessionType,
      source,
      classification,
      normalized,
    });
    return { recorded: false, reason: "invalid_classification" };
  }

  console.log("[InterestCohort] Recording intent classification", {
    userId,
    sessionId,
    sessionType,
    source,
    primaryIntent: normalized.primaryIntent,
    secondaryIntent: normalized.secondaryIntent,
    confidence: normalized.confidence,
  });

  return sequelize.transaction(async (transaction) => {
    const existing = await InterestIntentResult.findOne({
      where: { sessionId, sessionType },
      transaction,
      lock: transaction.LOCK.UPDATE,
    });

    if (existing) {
      if (String(existing.userId) !== String(userId)) {
        console.log("[InterestCohort] Existing intent result belongs to another user", {
          userId,
          sessionId,
          sessionType,
          existingUserId: existing.userId,
          existingIntentResultId: existing.id,
        });
        return { recorded: false, reason: "session_user_mismatch", intentResult: existing };
      }

      const previousClassification = {
        primaryIntent: existing.primaryIntent,
        secondaryIntent: existing.secondaryIntent,
        confidence: Number(existing.confidence || 0),
      };

      const updatedScores = await applyScoreDeltas({
        userId,
        previousClassification,
        nextClassification: normalized,
        intentResultId: existing.id,
        transaction,
      });

      await existing.update(
        {
          source,
          primaryIntent: normalized.primaryIntent,
          secondaryIntent: normalized.secondaryIntent,
          confidence: normalized.confidence,
          metadata,
          processedAt: new Date(),
        },
        { transaction }
      );

      console.log("[InterestCohort] Updated existing intent classification", {
        userId,
        sessionId,
        sessionType,
        existingIntentResultId: existing.id,
        previousPrimaryIntent: previousClassification.primaryIntent,
        previousSecondaryIntent: previousClassification.secondaryIntent,
        nextPrimaryIntent: normalized.primaryIntent,
        nextSecondaryIntent: normalized.secondaryIntent,
        updatedScoreCount: updatedScores.filter(Boolean).length,
      });

      return {
        recorded: true,
        updated: true,
        intentResult: existing,
        classification: normalized,
      };
    }

    const intentResult = await InterestIntentResult.create(
      {
        userId,
        sessionId,
        sessionType,
        source,
        primaryIntent: normalized.primaryIntent,
        secondaryIntent: normalized.secondaryIntent,
        confidence: normalized.confidence,
        metadata,
      },
      { transaction }
    );

    const primaryScore = await upsertScore({
      userId,
      cohortType: COHORT_TYPES.INTEREST,
      category: normalized.primaryIntent,
      increment: PRIMARY_SCORE_INCREMENT,
      intentResultId: intentResult.id,
      transaction,
    });
    const updatedScores = [primaryScore];

    if (normalized.secondaryIntent) {
      const secondaryScore = await upsertScore({
        userId,
        cohortType: COHORT_TYPES.INTEREST,
        category: normalized.secondaryIntent,
        increment: SECONDARY_SCORE_INCREMENT,
        intentResultId: intentResult.id,
        transaction,
      });
      updatedScores.push(secondaryScore);
    }

    for (const score of updatedScores) {
      await updateCohortForScore(score, transaction);
    }

    console.log("[InterestCohort] Recorded intent classification and applied scores", {
      userId,
      sessionId,
      sessionType,
      intentResultId: intentResult.id,
      primaryIntent: normalized.primaryIntent,
      secondaryIntent: normalized.secondaryIntent,
      updatedScoreCount: updatedScores.filter(Boolean).length,
      cohortThreshold: COHORT_SCORE_THRESHOLD,
    });

    return {
      recorded: true,
      intentResult,
      classification: normalized,
    };
  });
}

async function setUserCohortScores({
  userId,
  cohortType,
  scores,
  metadata = null,
}) {
  const normalizedType = normalizeCohortType(cohortType);
  if (!userId || !normalizedType || !scores || typeof scores !== "object") {
    console.log("[Cohort] Skipped invalid cohort score refresh", {
      userId,
      cohortType,
      hasScores: Boolean(scores),
    });
    return { updated: false, reason: "invalid_payload" };
  }

  const categories = getCategoriesForCohortType(normalizedType);

  return sequelize.transaction(async (transaction) => {
    const updatedScores = [];

    for (const category of categories) {
      const score = Number(scores[category] || 0);
      const scoreRow = await setCohortScore({
        userId,
        cohortType: normalizedType,
        category,
        score,
        metadata,
        transaction,
      });
      updatedScores.push(scoreRow);
    }

    await UserInterestScore.update(
      {
        score: 0,
        lastUpdatedAt: new Date(),
        metadata,
      },
      {
        where: {
          userId,
          cohortType: normalizedType,
          category: { [Op.notIn]: categories },
        },
        transaction,
      }
    );

    await UserInterestCohort.update(
      {
        isActive: false,
        metadata,
      },
      {
        where: {
          userId,
          cohortType: normalizedType,
          category: { [Op.notIn]: categories },
        },
        transaction,
      }
    );

    for (const scoreRow of updatedScores) {
      await updateCohortForScore(scoreRow, transaction);
    }

    console.log("[Cohort] Refreshed user cohort scores", {
      userId,
      cohortType: normalizedType,
      activeCategories: updatedScores
        .filter((row) => Number(row?.score || 0) >= COHORT_SCORE_THRESHOLD)
        .map((row) => row.category),
    });

    return {
      updated: true,
      cohortType: normalizedType,
      updatedScoreCount: updatedScores.filter(Boolean).length,
    };
  });
}

async function incrementUserCohortScore({
  userId,
  cohortType,
  category,
  increment = 1,
  metadata = null,
}) {
  const normalizedType = normalizeCohortType(cohortType);
  const normalizedCategory = normalizeCohortCategory(normalizedType, category);
  const scoreIncrement = Math.round(Number(increment || 0));

  if (!userId || !normalizedType || !normalizedCategory || !scoreIncrement) {
    console.log("[Cohort] Skipped invalid cohort score increment", {
      userId,
      cohortType,
      category,
      increment,
    });
    return { updated: false, reason: "invalid_payload" };
  }

  return sequelize.transaction(async (transaction) => {
    const scoreRow = await upsertScore({
      userId,
      cohortType: normalizedType,
      category: normalizedCategory,
      increment: scoreIncrement,
      metadata,
      transaction,
    });

    await updateCohortForScore(scoreRow, transaction);

    return {
      updated: true,
      cohortType: normalizedType,
      category: normalizedCategory,
      score: Number(scoreRow.score || 0),
    };
  });
}

async function getUserInterestSummary(userId) {
  const scores = await UserInterestScore.findAll({
    where: { userId, cohortType: COHORT_TYPES.INTEREST },
    order: [
      ["score", "DESC"],
      ["updatedAt", "DESC"],
    ],
  });

  const cohorts = await UserInterestCohort.findAll({
    where: { userId, cohortType: COHORT_TYPES.INTEREST, isActive: true },
    order: [
      ["scoreAtAssignment", "DESC"],
      ["lastQualifiedAt", "DESC"],
    ],
  });

  const rankedScores = scores.map((row) => ({
    category: row.category,
    score: row.score,
    lastUpdatedAt: row.lastUpdatedAt,
  }));

  return {
    primaryInterest: rankedScores[0]?.category || null,
    secondaryInterest: rankedScores[1]?.category || null,
    scores: rankedScores,
    cohorts: cohorts.map((row) => ({
      category: row.category,
      scoreAtAssignment: row.scoreAtAssignment,
      assignedAt: row.assignedAt,
      lastQualifiedAt: row.lastQualifiedAt,
    })),
  };
}

async function getUsersInInterestCohort(category, options = {}) {
  const cohortType = normalizeCohortType(options.cohortType) || COHORT_TYPES.INTEREST;
  const normalizedCategory = normalizeCohortCategory(cohortType, category);
  if (!normalizedCategory) {
    return { cohortType, category: null, users: [], count: 0 };
  }

  const limit = Math.min(Math.max(Number(options.limit) || 50, 1), 500);
  const offset = Math.max(Number(options.offset) || 0, 0);

  const { rows, count } = await UserInterestCohort.findAndCountAll({
    where: {
      cohortType,
      category: normalizedCategory,
      isActive: true,
      scoreAtAssignment: {
        [Op.gte]: COHORT_SCORE_THRESHOLD,
      },
    },
    order: [
      ["scoreAtAssignment", "DESC"],
      ["lastQualifiedAt", "DESC"],
    ],
    limit,
    offset,
  });

  return {
    cohortType,
    category: normalizedCategory,
    count,
    users: rows.map((row) => ({
      userId: row.userId,
      scoreAtAssignment: row.scoreAtAssignment,
      assignedAt: row.assignedAt,
      lastQualifiedAt: row.lastQualifiedAt,
    })),
  };
}

async function getCohortSummary(options = {}) {
  const requestedType = normalizeCohortType(options.cohortType);
  const where = { isActive: true };
  if (requestedType) where.cohortType = requestedType;
  const summaryTypes = requestedType
    ? [requestedType]
    : [COHORT_TYPES.INTEREST, COHORT_TYPES.WALLET, COHORT_TYPES.ASTRO, COHORT_TYPES.ACTIVITY];
  where[Op.or] = summaryTypes.map((cohortType) => ({
    cohortType,
    category: { [Op.in]: getCategoriesForCohortType(cohortType) },
  }));

  const cohorts = await UserInterestCohort.findAll({
    where,
    attributes: [
      "cohortType",
      "category",
      [sequelize.fn("COUNT", sequelize.col("userId")), "userCount"],
    ],
    group: ["cohortType", "category"],
    raw: true,
  });

  const countsByCategory = new Map(
    cohorts.map((row) => [`${row.cohortType}:${row.category}`, Number(row.userCount || 0)])
  );

  const groups = summaryTypes.map((cohortType) => {
    const categories = getCategoriesForCohortType(cohortType).map((category) => ({
      cohortType,
      category,
      userCount: countsByCategory.get(`${cohortType}:${category}`) || 0,
    }));

    return {
      cohortType,
      categories,
      totalCategories: categories.length,
      activeCategories: categories.filter((item) => item.userCount > 0).length,
      totalCohortMemberships: categories.reduce((sum, item) => sum + item.userCount, 0),
    };
  });

  const categories = groups.flatMap((group) => group.categories);

  const totalCohortMemberships = categories.reduce(
    (sum, item) => sum + item.userCount,
    0
  );
  const activeCategories = categories.filter((item) => item.userCount > 0).length;

  console.log("[Cohort][Admin] Cohort summary fetched", {
    cohortType: requestedType || "all",
    totalCategories: categories.length,
    activeCategories,
    totalCohortMemberships,
    nonZeroCategories: categories.filter((item) => item.userCount > 0),
    cohortThreshold: COHORT_SCORE_THRESHOLD,
  });

  return {
    groups,
    categories,
    totalCategories: categories.length,
    activeCategories,
    totalCohortMemberships,
  };
}

async function getInterestCohortSummary() {
  return getCohortSummary({ cohortType: COHORT_TYPES.INTEREST });
}

module.exports = {
  COHORT_TYPES,
  ASTRO_CATEGORIES,
  ACTIVITY_CATEGORIES,
  INTEREST_CATEGORIES,
  WALLET_CATEGORIES,
  COHORT_SCORE_THRESHOLD,
  buildConsultationClassificationMessages,
  buildHumanClassificationMessages,
  buildInlineIntentInstruction,
  getCohortSummary,
  getInterestJsonSchema,
  getInterestCohortSummary,
  getUserInterestSummary,
  getUsersInInterestCohort,
  incrementUserCohortScore,
  normalizeCohortType,
  normalizeClassificationPayload,
  normalizeCohortCategory,
  normalizeAstroCategory,
  normalizeActivityCategory,
  normalizeInterestCategory,
  normalizeWalletCategory,
  parseInlineAiResponse,
  recordIntentClassification,
  setUserCohortScores,
};
