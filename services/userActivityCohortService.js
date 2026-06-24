const { literal } = require("sequelize");
const User = require("../model/user/userAuth");
const {
  ACTIVITY_CATEGORIES,
  COHORT_TYPES,
  setUserCohortScores,
} = require("./interestCohortService");

const getConfigNumber = (key, fallback) => {
  const parsed = Number(process.env[key]);
  return Number.isFinite(parsed) ? parsed : fallback;
};

const ACTIVITY_COHORT_CONFIG = {
  newUserDays: getConfigNumber("ACTIVITY_COHORT_NEW_USER_DAYS", 7),
  repeatLoginCount: getConfigNumber("ACTIVITY_COHORT_REPEAT_LOGIN_COUNT", 2),
  recentlyActiveDays: getConfigNumber("ACTIVITY_COHORT_RECENTLY_ACTIVE_DAYS", 3),
  inactive30Days: getConfigNumber("ACTIVITY_COHORT_INACTIVE_30_DAYS", 30),
  dormantDays: getConfigNumber("ACTIVITY_COHORT_DORMANT_DAYS", 90),
};

function daysSince(date, now = new Date()) {
  if (!date) return null;
  const diffMs = now.getTime() - new Date(date).getTime();
  return Math.max(0, Math.floor(diffMs / (24 * 60 * 60 * 1000)));
}

function emptyActivityScores() {
  return ACTIVITY_CATEGORIES.reduce((scores, category) => {
    scores[category] = 0;
    return scores;
  }, {});
}

function buildActivityScores(metrics) {
  const scores = emptyActivityScores();

  if (metrics.accountAgeDays !== null && metrics.accountAgeDays <= ACTIVITY_COHORT_CONFIG.newUserDays) {
    scores.NewUser = Math.max(1, ACTIVITY_COHORT_CONFIG.newUserDays - metrics.accountAgeDays + 1);
  } else {
    scores.ExistingUser = Math.max(1, metrics.accountAgeDays || 1);
  }

  if (metrics.lastLoginMethod === "phone") scores.PhoneLoginUser = metrics.loginCount || 1;
  if (metrics.lastLoginMethod === "google") scores.GoogleLoginUser = metrics.loginCount || 1;
  if (metrics.lastLoginMethod === "apple") scores.AppleLoginUser = metrics.loginCount || 1;

  if (metrics.loginCount >= ACTIVITY_COHORT_CONFIG.repeatLoginCount) {
    scores.RepeatLoginUser = metrics.loginCount;
  }

  if (
    metrics.daysSinceLastLogin !== null &&
    metrics.daysSinceLastLogin <= ACTIVITY_COHORT_CONFIG.recentlyActiveDays
  ) {
    scores.RecentlyActiveUser = Math.max(1, ACTIVITY_COHORT_CONFIG.recentlyActiveDays - metrics.daysSinceLastLogin + 1);
  }

  if (
    metrics.daysSinceLastLogin !== null &&
    metrics.daysSinceLastLogin >= ACTIVITY_COHORT_CONFIG.inactive30Days
  ) {
    scores.Inactive30DaysUser = metrics.daysSinceLastLogin;
  }

  if (
    metrics.daysSinceLastLogin !== null &&
    metrics.daysSinceLastLogin >= ACTIVITY_COHORT_CONFIG.dormantDays
  ) {
    scores.DormantUser = metrics.daysSinceLastLogin;
  }

  if (metrics.lastLogoutAt && (!metrics.lastLoginAt || new Date(metrics.lastLogoutAt) >= new Date(metrics.lastLoginAt))) {
    scores.LoggedOutUser = 1;
  }

  return scores;
}

async function calculateActivityMetrics(userId) {
  const user = await User.findByPk(userId, {
    attributes: [
      "id",
      "createdAt",
      "loginCount",
      "firstLoginAt",
      "lastLoginAt",
      "lastLoginMethod",
      "lastLogoutAt",
    ],
  });

  if (!user) return null;

  const now = new Date();
  return {
    userId,
    accountAgeDays: daysSince(user.createdAt, now),
    loginCount: Number(user.loginCount || 0),
    firstLoginAt: user.firstLoginAt || null,
    lastLoginAt: user.lastLoginAt || null,
    lastLoginMethod: user.lastLoginMethod || null,
    lastLogoutAt: user.lastLogoutAt || null,
    daysSinceLastLogin: daysSince(user.lastLoginAt, now),
    config: ACTIVITY_COHORT_CONFIG,
  };
}

async function refreshUserActivityCohorts(userId) {
  if (!userId) return { updated: false, reason: "missing_user_id" };

  const metrics = await calculateActivityMetrics(userId);
  if (!metrics) return { updated: false, reason: "user_not_found" };

  const scores = buildActivityScores(metrics);

  console.log("[ActivityCohort] Refreshing user activity cohorts", {
    userId,
    metrics: {
      accountAgeDays: metrics.accountAgeDays,
      loginCount: metrics.loginCount,
      lastLoginMethod: metrics.lastLoginMethod,
      daysSinceLastLogin: metrics.daysSinceLastLogin,
      lastLogoutAt: metrics.lastLogoutAt,
    },
    activeCategories: Object.entries(scores)
      .filter(([, score]) => Number(score || 0) > 0)
      .map(([category]) => category),
  });

  return setUserCohortScores({
    userId,
    cohortType: COHORT_TYPES.ACTIVITY,
    scores,
    metadata: {
      metrics,
      refreshedAt: new Date().toISOString(),
    },
  });
}

function queueUserActivityCohortRefresh(userId, reason = "user_activity_event") {
  if (!userId) return;

  console.log("[ActivityCohort] Queueing user activity cohort refresh", {
    userId,
    reason,
  });

  setImmediate(async () => {
    try {
      await refreshUserActivityCohorts(userId);
    } catch (error) {
      console.error("[ActivityCohort] User activity cohort refresh failed:", {
        userId,
        reason,
        error: error.message,
      });
    }
  });
}

async function recordUserLogin(userId, loginMethod, options = {}) {
  const normalizedMethod = ["phone", "google", "apple"].includes(loginMethod)
    ? loginMethod
    : null;

  if (!userId || !normalizedMethod) return;

  const now = new Date();
  await User.update(
    {
      firstLoginAt: literal('COALESCE("firstLoginAt", NOW())'),
      lastLoginAt: now,
      lastLoginMethod: normalizedMethod,
      loginCount: literal('COALESCE("loginCount", 0) + 1'),
    },
    {
      where: { id: userId },
    }
  );

  queueUserActivityCohortRefresh(
    userId,
    options.isNewUser ? "new_user_login" : `${normalizedMethod}_login`
  );
}

async function recordUserLogout(userId) {
  if (!userId) return;

  await User.update(
    {
      lastLogoutAt: new Date(),
    },
    {
      where: { id: userId },
    }
  );

  queueUserActivityCohortRefresh(userId, "logout");
}

module.exports = {
  ACTIVITY_COHORT_CONFIG,
  buildActivityScores,
  calculateActivityMetrics,
  queueUserActivityCohortRefresh,
  recordUserLogin,
  recordUserLogout,
  refreshUserActivityCohorts,
};
