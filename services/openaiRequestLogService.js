const OpenAIRequestLog = require("../model/ai/openAiRequestLog");
const { getDeveloperIdentity, getGitInfo } = require("./developerIdentityService");

const truncate = (value, maxLength) => {
  if (!value) return value;
  const text = String(value);
  return text.length > maxLength ? text.slice(0, maxLength - 3) + "..." : text;
};

const resolveRequestContext = (context = {}) => {
  const req = context.req || null;
  const userId = context.userId || req?.user?.id || null;

  return {
    userId,
    appEndpoint: req?.originalUrl || null,
    appMethod: req?.method || null,
    ipAddress: req?.ip || req?.headers?.["x-forwarded-for"] || null,
    feature: context.feature || null,
  };
};

const logOpenAIRequest = async ({
  context,
  openaiEndpoint,
  requestType,
  model,
  response,
  status = "success",
  durationMs,
  error,
}) => {
  try {
    const identity = getDeveloperIdentity();
    const gitInfo = getGitInfo();
    const reqContext = resolveRequestContext(context);

    const usage = response?.usage || null;

    await OpenAIRequestLog.create({
      userId: reqContext.userId,
      developerName: identity.developerName,
      developerSecretHash: identity.developerSecretHash,
      machineName: identity.machineName,
      environment: identity.environment,
      serviceName: identity.serviceName,
      gitBranch: gitInfo.gitBranch,
      gitCommit: gitInfo.gitCommit,
      gitEmail: gitInfo.gitEmail,
      appEndpoint: reqContext.appEndpoint,
      appMethod: reqContext.appMethod,
      ipAddress: reqContext.ipAddress,
      openaiEndpoint,
      openaiRequestId: response?.id || null,
      requestType,
      model,
      promptTokens: usage?.prompt_tokens ?? usage?.input_tokens ?? null,
      completionTokens: usage?.completion_tokens ?? usage?.output_tokens ?? null,
      totalTokens: usage?.total_tokens ?? null,
      durationMs: Number.isFinite(durationMs) ? Math.round(durationMs) : null,
      status: status === "error" ? "error" : "success",
      errorType: error?.type || error?.name || null,
      errorMessage: truncate(error?.message || error?.toString(), 500),
      feature: reqContext.feature,
    });
  } catch (logError) {
    console.warn("[OpenAI Log] Failed to write request log:", logError?.message || logError);
  }
};

module.exports = {
  logOpenAIRequest,
};
