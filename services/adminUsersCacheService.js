const redis = require("../config/redis/redis");

const USERS_LIST_CACHE_PREFIX = "admin:users:list:v1";
const USERS_CACHE_VERSION_KEY = "admin:users:list:version";
const USERS_LIST_CACHE_TTL_SECONDS = 10 * 60;

const parseCachedValue = (cachedValue) => {
  if (!cachedValue) return null;

  if (typeof cachedValue === "string") {
    try {
      return JSON.parse(cachedValue);
    } catch {
      return null;
    }
  }

  return cachedValue;
};

const getUsersCacheVersion = async () => {
  try {
    const cachedVersion = await redis.get(USERS_CACHE_VERSION_KEY);

    if (cachedVersion === null || cachedVersion === undefined) {
      return 1;
    }

    const versionNumber = Number(cachedVersion);
    return Number.isFinite(versionNumber) && versionNumber > 0
      ? versionNumber
      : 1;
  } catch (error) {
    console.error("Failed to get users cache version:", error.message || error);
    return 1;
  }
};

const buildUsersListCacheKey = ({ page, limit, version }) => {
  return `${USERS_LIST_CACHE_PREFIX}:${version}:page:${page}:limit:${limit}`;
};

const getCachedUsersList = async ({ page, limit }) => {
  const version = await getUsersCacheVersion();
  const cacheKey = buildUsersListCacheKey({ page, limit, version });

  try {
    const cachedValue = await redis.get(cacheKey);
    return parseCachedValue(cachedValue);
  } catch (error) {
    console.error("Failed to read users list cache:", error.message || error);
    return null;
  }
};

const setCachedUsersList = async ({ page, limit, payload }) => {
  const version = await getUsersCacheVersion();
  const cacheKey = buildUsersListCacheKey({ page, limit, version });

  try {
    await redis.setex(cacheKey, USERS_LIST_CACHE_TTL_SECONDS, payload);
  } catch (error) {
    console.error("Failed to write users list cache:", error.message || error);
  }
};

const invalidateUsersListCache = async () => {
  try {
    await redis.incr(USERS_CACHE_VERSION_KEY);
  } catch (error) {
    console.error("Failed to invalidate users list cache:", error.message || error);
  }
};

module.exports = {
  USERS_LIST_CACHE_TTL_SECONDS,
  getCachedUsersList,
  setCachedUsersList,
  invalidateUsersListCache,
};
