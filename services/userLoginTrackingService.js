const redis = require("../config/redis/redis");
const { invalidateUsersListCache } = require("./adminUsersCacheService");
const { recordUserLogin } = require("./userActivityCohortService");

const TOTAL_USERS_CACHE_KEY = "admin:dashboard:total-users:v1";
const TODAY_LOGINS_CACHE_PREFIX = "admin:dashboard:today-logins:";

const getLocalDateKey = (date = new Date()) => {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const day = String(date.getDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
};

const invalidateDashboardStatsCache = async ({ invalidateTotalUsers = false } = {}) => {
  const keys = [`${TODAY_LOGINS_CACHE_PREFIX}${getLocalDateKey()}:v1`];

  if (invalidateTotalUsers) {
    keys.push(TOTAL_USERS_CACHE_KEY);
  }

  try {
    await Promise.all(keys.map((key) => redis.del(key)));
  } catch (error) {
    console.error("Failed to invalidate dashboard stats cache:", error.message || error);
  }
};

const trackUserLogin = async (
  userId,
  loginMethod,
  { invalidateTotalUsers = false } = {}
) => {
  if (!userId || !["phone", "google", "apple"].includes(loginMethod)) {
    return;
  }

  try {
    await recordUserLogin(userId, loginMethod, {
      isNewUser: invalidateTotalUsers,
    });
  } catch (error) {
    console.error("Failed to persist user login metadata:", error.message || error);
  }

  await invalidateDashboardStatsCache({ invalidateTotalUsers });

  if (invalidateTotalUsers) {
    await invalidateUsersListCache();
  }
};

module.exports = {
  trackUserLogin,
};
