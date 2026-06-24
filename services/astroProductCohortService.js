const { Op, fn, col } = require("sequelize");
const Kundli = require("../model/horoscope/kundli");
const MatchingProfile = require("../model/horoscope/matchingProfile");
const UserRequest = require("../model/user/userRequest");
const UserInterestScore = require("../model/interest/userInterestScore");
const {
  ASTRO_CATEGORIES,
  COHORT_TYPES,
  incrementUserCohortScore,
  setUserCohortScores,
} = require("./interestCohortService");

const getConfigNumber = (key, fallback) => {
  const parsed = Number(process.env[key]);
  return Number.isFinite(parsed) ? parsed : fallback;
};

const ASTRO_COHORT_CONFIG = {
  enabled: process.env.ASTRO_COHORT_ENABLED !== "false",
};

const HOROSCOPE_VIEW_CATEGORIES = ["HoroscopeViewed"];

function emptyAstroScores() {
  return ASTRO_CATEGORIES.reduce((scores, category) => {
    scores[category] = 0;
    return scores;
  }, {});
}

async function getCurrentAstroScores(userId) {
  const rows = await UserInterestScore.findAll({
    where: {
      userId,
      cohortType: COHORT_TYPES.ASTRO,
      category: {
        [Op.in]: HOROSCOPE_VIEW_CATEGORIES,
      },
    },
  });

  return rows.reduce((scores, row) => {
    scores[row.category] = Number(row.score || 0);
    return scores;
  }, {});
}

async function calculateAstroProductMetrics(userId) {
  const kundliRows = await Kundli.findAll({
    include: [
      {
        model: UserRequest,
        as: "userRequest",
        where: { userId },
        attributes: [],
        required: true,
      },
    ],
    attributes: [
      [fn("COUNT", col("Kundli.id")), "kundliCount"],
      [fn("COALESCE", fn("SUM", col("Kundli.viewCount")), 0), "kundliViewCount"],
      [fn("MAX", col("Kundli.lastViewedAt")), "lastKundliViewedAt"],
    ],
    raw: true,
  });

  const matchingRows = await MatchingProfile.findAll({
    where: { userId },
    attributes: [
      [fn("COUNT", col("id")), "matchingCount"],
      [fn("COALESCE", fn("SUM", col("viewCount")), 0), "matchingViewCount"],
      [fn("MAX", col("lastViewedAt")), "lastMatchingViewedAt"],
    ],
    raw: true,
  });

  const horoscopeScores = await getCurrentAstroScores(userId);
  const kundliMetrics = kundliRows[0] || {};
  const matchingMetrics = matchingRows[0] || {};
  const horoscopeViewCount = Number(horoscopeScores.HoroscopeViewed || 0);

  return {
    kundliCount: Number(kundliMetrics.kundliCount || 0),
    kundliViewCount: Number(kundliMetrics.kundliViewCount || 0),
    lastKundliViewedAt: kundliMetrics.lastKundliViewedAt || null,
    matchingCount: Number(matchingMetrics.matchingCount || 0),
    matchingViewCount: Number(matchingMetrics.matchingViewCount || 0),
    lastMatchingViewedAt: matchingMetrics.lastMatchingViewedAt || null,
    horoscopeViewCount,
    config: ASTRO_COHORT_CONFIG,
  };
}

function buildAstroProductScores(metrics) {
  const scores = emptyAstroScores();

  if (metrics.kundliCount <= 0) {
    scores.KundliNotCreated = 1;
  } else {
    scores.KundliCreated = metrics.kundliCount;
  }

  scores.KundliViewed = metrics.kundliViewCount;

  if (metrics.matchingCount <= 0) {
    scores.MatchingNotCreated = 1;
  } else {
    scores.MatchingCreated = metrics.matchingCount;
  }

  scores.MatchingViewed = metrics.matchingViewCount;

  scores.HoroscopeViewed = metrics.horoscopeViewCount;

  return scores;
}

async function refreshUserAstroProductCohorts(userId) {
  if (!userId) return { updated: false, reason: "missing_user_id" };

  const metrics = await calculateAstroProductMetrics(userId);
  const scores = buildAstroProductScores(metrics);

  console.log("[AstroCohort] Refreshing astro product cohorts", {
    userId,
    metrics: {
      kundliCount: metrics.kundliCount,
      kundliViewCount: metrics.kundliViewCount,
      matchingCount: metrics.matchingCount,
      matchingViewCount: metrics.matchingViewCount,
      horoscopeViewCount: metrics.horoscopeViewCount,
    },
    activeCategories: Object.entries(scores)
      .filter(([, score]) => Number(score || 0) > 0)
      .map(([category]) => category),
  });

  return setUserCohortScores({
    userId,
    cohortType: COHORT_TYPES.ASTRO,
    scores,
    metadata: {
      metrics,
      refreshedAt: new Date().toISOString(),
    },
  });
}

function queueAstroProductCohortRefresh(userId, reason = "astro_product_event") {
  if (!userId) return;

  console.log("[AstroCohort] Queueing astro product cohort refresh", {
    userId,
    reason,
  });

  setImmediate(async () => {
    try {
      await refreshUserAstroProductCohorts(userId);
    } catch (error) {
      console.error("[AstroCohort] Astro product cohort refresh failed:", {
        userId,
        reason,
        error: error.message,
      });
    }
  });
}

async function recordHoroscopeView(userId, period) {
  if (!userId) return { updated: false, reason: "anonymous_view" };

  await incrementUserCohortScore({
    userId,
    cohortType: COHORT_TYPES.ASTRO,
    category: "HoroscopeViewed",
    increment: 1,
    metadata: {
      lastPeriod: period,
      lastViewedAt: new Date().toISOString(),
    },
  });

  queueAstroProductCohortRefresh(userId, `horoscope_${period}_viewed`);
  return { updated: true };
}

function queueHoroscopeView(userId, period) {
  if (!userId) return;

  setImmediate(async () => {
    try {
      await recordHoroscopeView(userId, period);
    } catch (error) {
      console.error("[AstroCohort] Horoscope view recording failed:", {
        userId,
        period,
        error: error.message,
      });
    }
  });
}

module.exports = {
  ASTRO_COHORT_CONFIG,
  buildAstroProductScores,
  calculateAstroProductMetrics,
  queueAstroProductCohortRefresh,
  queueHoroscopeView,
  recordHoroscopeView,
  refreshUserAstroProductCohorts,
};
