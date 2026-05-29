const OpenAI = require("openai");
const { logOpenAIRequest } = require("./openaiRequestLogService");

let openaiClient = null;

const getOpenAIClient = () => {
  if (!process.env.OPENAI_API_KEY) {
    return null;
  }

  if (!openaiClient) {
    openaiClient = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });
  }

  return openaiClient;
};

const createChatCompletion = async (params, context = {}) => {
  const openai = getOpenAIClient();
  if (!openai) {
    throw new Error("OpenAI API key not configured");
  }

  const startTime = Date.now();

  try {
    const response = await openai.chat.completions.create(params);

    await logOpenAIRequest({
      context,
      openaiEndpoint: "/v1/chat/completions",
      requestType: "chat.completions.create",
      model: params?.model,
      response,
      status: "success",
      durationMs: Date.now() - startTime,
    });

    return response;
  } catch (error) {
    await logOpenAIRequest({
      context,
      openaiEndpoint: "/v1/chat/completions",
      requestType: "chat.completions.create",
      model: params?.model,
      response: null,
      status: "error",
      durationMs: Date.now() - startTime,
      error,
    });

    throw error;
  }
};

const createEmbeddings = async (params, context = {}) => {
  const openai = getOpenAIClient();
  if (!openai) {
    throw new Error("OpenAI API key not configured");
  }

  const startTime = Date.now();

  try {
    const response = await openai.embeddings.create(params);

    await logOpenAIRequest({
      context,
      openaiEndpoint: "/v1/embeddings",
      requestType: "embeddings.create",
      model: params?.model,
      response,
      status: "success",
      durationMs: Date.now() - startTime,
    });

    return response;
  } catch (error) {
    await logOpenAIRequest({
      context,
      openaiEndpoint: "/v1/embeddings",
      requestType: "embeddings.create",
      model: params?.model,
      response: null,
      status: "error",
      durationMs: Date.now() - startTime,
      error,
    });

    throw error;
  }
};

module.exports = {
  getOpenAIClient,
  createChatCompletion,
  createEmbeddings,
};
