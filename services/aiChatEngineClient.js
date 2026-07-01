const axios = require("axios");

const AI_CHAT_ENGINE_URL =
  process.env.AI_CHAT_ENGINE_URL || "http://127.0.0.1:8011";
const AI_CHAT_ENGINE_TIMEOUT_MS = Number(
  process.env.AI_CHAT_ENGINE_TIMEOUT_MS || 50000
);

const generateAiChatEngineResponse = async (payload) => {
  const response = await axios.post(
    `${AI_CHAT_ENGINE_URL.replace(/\/+$/, "")}/v1/chat/respond`,
    payload,
    {
      timeout: Number.isFinite(AI_CHAT_ENGINE_TIMEOUT_MS)
        ? AI_CHAT_ENGINE_TIMEOUT_MS
        : 50000,
    }
  );

  return response.data;
};

module.exports = {
  generateAiChatEngineResponse,
};
