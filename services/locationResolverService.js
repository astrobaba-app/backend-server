const axios = require("axios");
const redis = require("../config/redis/redis");

const GOOGLE_MAPS_API_KEY = process.env.MAPS_API_KEY;

const LOCATION_CACHE_PREFIX = "geo:india:city:";
const MEMORY_CACHE_TTL_MS = 15 * 60 * 1000;
const REDIS_CACHE_TTL_SECONDS = 24 * 60 * 60;

const memoryCache = new Map();

const normalizePart = (value) =>
  typeof value === "string" ? value.trim().toLowerCase().replace(/\s+/g, " ") : "";

const toTitleCase = (value) =>
  String(value || "")
    .trim()
    .replace(/\s+/g, " ")
    .split(" ")
    .filter(Boolean)
    .map((part) => part.charAt(0).toUpperCase() + part.slice(1).toLowerCase())
    .join(" ");

const buildCacheKey = ({ city, state }) => {
  const cityKey = normalizePart(city);
  const stateKey = normalizePart(state) || "na";
  return `${LOCATION_CACHE_PREFIX}${cityKey}:${stateKey}`;
};

const getMemoryCachedLocation = (cacheKey) => {
  const cached = memoryCache.get(cacheKey);
  if (!cached) return null;

  if (Date.now() >= cached.expiresAt) {
    memoryCache.delete(cacheKey);
    return null;
  }

  return cached.value;
};

const setMemoryCachedLocation = (cacheKey, value) => {
  memoryCache.set(cacheKey, {
    value,
    expiresAt: Date.now() + MEMORY_CACHE_TTL_MS,
  });
};

const getRedisCachedLocation = async (cacheKey) => {
  try {
    const cachedValue = await redis.get(cacheKey);
    if (!cachedValue) return null;

    return typeof cachedValue === "string"
      ? JSON.parse(cachedValue)
      : cachedValue;
  } catch (error) {
    console.error("Location Redis cache read failed:", error.message || error);
    return null;
  }
};

const setRedisCachedLocation = async (cacheKey, value) => {
  try {
    await redis.setex(cacheKey, REDIS_CACHE_TTL_SECONDS, value);
  } catch (error) {
    console.error("Location Redis cache write failed:", error.message || error);
  }
};

const ensureCoordinates = (latitude, longitude) => {
  const lat = Number(latitude);
  const lon = Number(longitude);

  if (!Number.isFinite(lat) || lat < -90 || lat > 90) {
    return null;
  }

  if (!Number.isFinite(lon) || lon < -180 || lon > 180) {
    return null;
  }

  return {
    latitude: Number(lat.toFixed(6)),
    longitude: Number(lon.toFixed(6)),
  };
};

const fetchCoordinatesFromGoogle = async (query) => {
  const response = await axios.get("https://maps.googleapis.com/maps/api/geocode/json", {
    params: {
      address: query,
      key: GOOGLE_MAPS_API_KEY,
      components: "country:IN",
    },
    timeout: 2500,
  });

  const status = response.data?.status;
  const results = Array.isArray(response.data?.results)
    ? response.data.results
    : [];

  if (status !== "OK" || results.length === 0) {
    return null;
  }

  const location = results[0]?.geometry?.location;
  const validatedCoordinates = ensureCoordinates(location?.lat, location?.lng);

  if (!validatedCoordinates) {
    return null;
  }

  return {
    ...validatedCoordinates,
    resolvedAddress: results[0]?.formatted_address || query,
  };
};

const resolveIndianCityCoordinates = async ({ city, state }) => {
  const normalizedCity = normalizePart(city);
  const normalizedState = normalizePart(state);

  if (!normalizedCity) {
    const error = new Error("City is required to resolve coordinates");
    error.statusCode = 400;
    throw error;
  }

  if (!GOOGLE_MAPS_API_KEY) {
    const error = new Error("MAPS_API_KEY is not configured on the server");
    error.statusCode = 503;
    throw error;
  }

  const cacheKey = buildCacheKey({ city: normalizedCity, state: normalizedState });

  const memoryCached = getMemoryCachedLocation(cacheKey);
  if (memoryCached) {
    return memoryCached;
  }

  const redisCached = await getRedisCachedLocation(cacheKey);
  if (redisCached) {
    setMemoryCachedLocation(cacheKey, redisCached);
    return redisCached;
  }

  const queryCandidates = normalizedState
    ? [
        `${toTitleCase(normalizedCity)}, ${toTitleCase(normalizedState)}, India`,
        `${toTitleCase(normalizedCity)}, India`,
      ]
    : [`${toTitleCase(normalizedCity)}, India`];

  for (const query of queryCandidates) {
    const result = await fetchCoordinatesFromGoogle(query);
    if (!result) {
      continue;
    }

    setMemoryCachedLocation(cacheKey, result);
    setRedisCachedLocation(cacheKey, result);

    return result;
  }

  const error = new Error("Unable to resolve latitude and longitude for the provided location");
  error.statusCode = 422;
  throw error;
};

module.exports = {
  resolveIndianCityCoordinates,
};
