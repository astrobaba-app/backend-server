const crypto = require("crypto");
const AdminSettings = require("../model/admin/adminSettings");
const redis = require("../config/redis/redis");

const WHATSAPP_AUTH_SETTING_KEY = "whatsapp_auth_api_key";
const WHATSAPP_AUTH_CACHE_KEY = "admin_setting:whatsapp_auth_api_key";

const REDIS_CACHE_TTL_SECONDS = 60;
const MEMORY_CACHE_TTL_MS = 10000;

let memoryCache = {
  value: null,
  expiresAt: 0,
};

const normalizeApiKeyValue = (rawValue) => {
  if (typeof rawValue !== "string") return "";

  let normalized = rawValue.trim();

  if (normalized.toLowerCase().startsWith("bearer ")) {
    normalized = normalized.slice(7).trim();
  }

  const hasWrappedDoubleQuotes =
    normalized.startsWith('"') && normalized.endsWith('"') && normalized.length >= 2;
  const hasWrappedSingleQuotes =
    normalized.startsWith("'") && normalized.endsWith("'") && normalized.length >= 2;

  if (hasWrappedDoubleQuotes || hasWrappedSingleQuotes) {
    normalized = normalized.slice(1, -1).trim();
  }

  // API keys should be token-safe; stripping whitespace avoids copy/paste issues.
  return normalized.replace(/\s+/g, "");
};

const parseJsonValue = (rawValue, fallbackValue = {}) => {
  if (!rawValue) return fallbackValue;

  try {
    return typeof rawValue === "string" ? JSON.parse(rawValue) : rawValue;
  } catch {
    return fallbackValue;
  }
};

const normalizeCachedSetting = (cachedValue) => {
  if (!cachedValue || typeof cachedValue !== "object") {
    return null;
  }

  const apiKey = typeof cachedValue.apiKey === "string" ? cachedValue.apiKey : "";

  return {
    isEnabled: Boolean(cachedValue.isEnabled),
    apiKey,
    isConfigured: apiKey.length > 0,
    updatedAt: cachedValue.updatedAt || null,
  };
};

const normalizeDbSetting = (setting) => {
  if (!setting) {
    return {
      isEnabled: false,
      apiKey: "",
      isConfigured: false,
      updatedAt: null,
    };
  }

  const parsedValue = parseJsonValue(setting.settingValue, {});
  const apiKey = typeof parsedValue.apiKey === "string" ? parsedValue.apiKey : "";

  return {
    isEnabled: Boolean(setting.isActive),
    apiKey,
    isConfigured: apiKey.length > 0,
    updatedAt: setting.updatedAt || null,
  };
};

const getMemoryCachedSetting = () => {
  if (!memoryCache.value) {
    return null;
  }

  if (Date.now() >= memoryCache.expiresAt) {
    memoryCache = {
      value: null,
      expiresAt: 0,
    };

    return null;
  }

  return memoryCache.value;
};

const setMemoryCachedSetting = (setting) => {
  memoryCache = {
    value: setting,
    expiresAt: Date.now() + MEMORY_CACHE_TTL_MS,
  };
};

const getRedisCachedSetting = async () => {
  try {
    const cached = await redis.get(WHATSAPP_AUTH_CACHE_KEY);
    if (!cached) return null;

    const parsed = parseJsonValue(cached, null);
    return normalizeCachedSetting(parsed);
  } catch (error) {
    console.error("Failed to get WhatsApp auth cache from Redis:", error.message);
    return null;
  }
};

const setRedisCachedSetting = async (setting) => {
  try {
    await redis.setex(WHATSAPP_AUTH_CACHE_KEY, REDIS_CACHE_TTL_SECONDS, setting);
  } catch (error) {
    console.error("Failed to set WhatsApp auth cache in Redis:", error.message);
  }
};

const getWhatsappAuthSetting = async ({ forceRefresh = false } = {}) => {
  if (!forceRefresh) {
    const memoryCached = getMemoryCachedSetting();
    if (memoryCached) {
      return memoryCached;
    }

    const redisCached = await getRedisCachedSetting();
    if (redisCached) {
      setMemoryCachedSetting(redisCached);
      return redisCached;
    }
  }

  const setting = await AdminSettings.findOne({
    where: { settingKey: WHATSAPP_AUTH_SETTING_KEY },
  });

  const normalizedSetting = normalizeDbSetting(setting);
  setMemoryCachedSetting(normalizedSetting);
  await setRedisCachedSetting(normalizedSetting);

  return normalizedSetting;
};

const saveWhatsappAuthSetting = async ({ apiKey, isEnabled }) => {
  let setting = await AdminSettings.findOne({
    where: { settingKey: WHATSAPP_AUTH_SETTING_KEY },
  });

  const currentSetting = normalizeDbSetting(setting);

  const normalizedApiKey =
    apiKey !== undefined ? normalizeApiKeyValue(apiKey) : currentSetting.apiKey;
  const normalizedIsEnabled =
    typeof isEnabled === "boolean" ? isEnabled : currentSetting.isEnabled;

  if (!setting) {
    setting = await AdminSettings.create({
      settingKey: WHATSAPP_AUTH_SETTING_KEY,
      settingValue: JSON.stringify({ apiKey: normalizedApiKey }),
      description: "API key used to authenticate WhatsApp user registration/check requests",
      isActive: normalizedIsEnabled,
    });
  } else {
    await setting.update({
      settingValue: JSON.stringify({ apiKey: normalizedApiKey }),
      isActive: normalizedIsEnabled,
    });
  }

  const normalizedSetting = normalizeDbSetting(setting);
  setMemoryCachedSetting(normalizedSetting);
  await setRedisCachedSetting(normalizedSetting);

  return normalizedSetting;
};

const isApiKeyMatch = (providedApiKey, configuredApiKey) => {
  const provided = Buffer.from(normalizeApiKeyValue(providedApiKey));
  const configured = Buffer.from(normalizeApiKeyValue(configuredApiKey));

  if (provided.length !== configured.length) {
    return false;
  }

  return crypto.timingSafeEqual(provided, configured);
};

const validateWhatsappApiKey = async (providedApiKey) => {
  const normalizedProvidedKey = normalizeApiKeyValue(providedApiKey);

  if (!normalizedProvidedKey) {
    return {
      isValid: false,
      reason: "missing",
    };
  }

  const setting = await getWhatsappAuthSetting();

  if (!setting.isEnabled) {
    return {
      isValid: false,
      reason: "disabled",
    };
  }

  if (!setting.isConfigured) {
    return {
      isValid: false,
      reason: "not_configured",
    };
  }

  if (!isApiKeyMatch(normalizedProvidedKey, setting.apiKey)) {
    return {
      isValid: false,
      reason: "invalid",
    };
  }

  return {
    isValid: true,
    reason: "valid",
  };
};

const maskApiKey = (apiKey) => {
  if (!apiKey || apiKey.length < 8) {
    return "********";
  }

  return `${apiKey.slice(0, 4)}${"*".repeat(apiKey.length - 8)}${apiKey.slice(-4)}`;
};

module.exports = {
  WHATSAPP_AUTH_SETTING_KEY,
  getWhatsappAuthSetting,
  saveWhatsappAuthSetting,
  validateWhatsappApiKey,
  maskApiKey,
};
