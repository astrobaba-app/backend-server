const axios = require("axios");

const AI_CHAT_ENGINE_URL =
  process.env.AI_CHAT_ENGINE_URL || "http://127.0.0.1:8011";
const AI_CHAT_ENGINE_TIMEOUT_MS = Number(
  process.env.AI_CHAT_ENGINE_TIMEOUT_MS || 50000
);

const getTimeout = () =>
  Number.isFinite(AI_CHAT_ENGINE_TIMEOUT_MS) ? AI_CHAT_ENGINE_TIMEOUT_MS : 50000;

const getBaseUrl = () => AI_CHAT_ENGINE_URL.replace(/\/+$/, "");

const generateAiChatEngineResponse = async (payload) => {
  const response = await axios.post(
    `${getBaseUrl()}/v1/chat/respond`,
    payload,
    { timeout: getTimeout() }
  );

  return response.data;
};

const upsertAiChatEngineKundliCache = async (sessionId, payload) => {
  const response = await axios.put(
    `${getBaseUrl()}/v1/sessions/${encodeURIComponent(sessionId)}/kundli-cache`,
    {
      session_id: sessionId,
      kundli: payload.kundli || null,
      user_request: payload.user_request || null,
    },
    { timeout: getTimeout() }
  );

  return response.data;
};

const clearAiChatEngineKundliCache = async (sessionId) => {
  const response = await axios.delete(
    `${getBaseUrl()}/v1/sessions/${encodeURIComponent(sessionId)}/kundli-cache`,
    { timeout: getTimeout() }
  );

  return response.data;
};

module.exports = {
  generateAiChatEngineResponse,
  upsertAiChatEngineKundliCache,
  clearAiChatEngineKundliCache,
};

