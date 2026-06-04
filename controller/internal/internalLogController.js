const OpenAIRequestLog = require("../../model/ai/openAiRequestLog");

const sanitizeString = (value, maxLength) => {
  if (value === null || value === undefined) return null;
  const text = String(value);
  if (!maxLength || text.length <= maxLength) return text;
  return text.slice(0, maxLength);
};

const sanitizeUuidOrNull = (value) => {
  const text = sanitizeString(value, 64);
  if (!text) return null;
  const uuidV4Like = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
  return uuidV4Like.test(text) ? text : null;
};

const parseIntOrNull = (value) => {
  if (value === null || value === undefined || value === "") return null;
  const parsed = Number.parseInt(value, 10);
  return Number.isFinite(parsed) ? parsed : null;
};

const parseStatus = (value) => (String(value || "success").toLowerCase() === "error" ? "error" : "success");

const createInternalOpenAIRequestLog = async (req, res) => {
  try {
    const token = req.headers["x-internal-log-token"];
    const expected = process.env.INTERNAL_LOG_TOKEN;

    if (!expected || !token || token !== expected) {
      return res.status(401).json({ success: false, message: "Unauthorized" });
    }

    const payload = req.body || {};

    const log = await OpenAIRequestLog.create({
      userId: sanitizeUuidOrNull(payload.userId),
      developerName: sanitizeString(payload.developerName, 120),
      developerSecretHash: sanitizeString(payload.developerSecretHash, 128),
      machineName: sanitizeString(payload.machineName, 255),
      environment: sanitizeString(payload.environment, 60),
      serviceName: sanitizeString(payload.serviceName, 120),
      gitBranch: sanitizeString(payload.gitBranch, 120),
      gitCommit: sanitizeString(payload.gitCommit, 64),
      gitEmail: sanitizeString(payload.gitEmail, 180),
      appEndpoint: sanitizeString(payload.appEndpoint, 255),
      appMethod: sanitizeString(payload.appMethod, 12),
      ipAddress: sanitizeString(payload.ipAddress, 64),
      openaiEndpoint: sanitizeString(payload.openaiEndpoint, 120),
      openaiRequestId: sanitizeString(payload.openaiRequestId, 120),
      requestType: sanitizeString(payload.requestType, 120),
      model: sanitizeString(payload.model, 120),
      promptTokens: parseIntOrNull(payload.promptTokens),
      completionTokens: parseIntOrNull(payload.completionTokens),
      totalTokens: parseIntOrNull(payload.totalTokens),
      durationMs: parseIntOrNull(payload.durationMs),
      status: parseStatus(payload.status),
      errorType: sanitizeString(payload.errorType, 120),
      errorMessage: sanitizeString(payload.errorMessage, 500),
      feature: sanitizeString(payload.feature, 120),
    });

    return res.status(201).json({ success: true, id: log.id });
  } catch (error) {
    console.error("Internal OpenAI log error:", error);
    return res.status(500).json({ success: false, message: "Failed to log OpenAI request" });
  }
};

module.exports = { createInternalOpenAIRequestLog };
