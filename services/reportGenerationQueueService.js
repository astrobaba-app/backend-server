const redis = require("../config/redis/redis");
const ReportGenerationRequest = require("../model/report/reportGenerationRequest");

const truthy = (value) => ["1", "true", "yes", "on"].includes(String(value || "").toLowerCase());

const requiredEnv = (name) => {
  const value = process.env[name];
  if (value === undefined || value === null || String(value).trim() === "") {
    throw new Error(`${name} is required for report queue workers`);
  }
  return value;
};

const requiredNumberEnv = (name) => {
  const value = Number(requiredEnv(name));
  if (!Number.isFinite(value)) {
    throw new Error(`${name} must be a valid number`);
  }
  return value;
};

const REPORT_QUEUE_ENABLED = () => truthy(process.env.REPORT_QUEUE_ENABLED);
const LLM_QUEUE_KEY = () => requiredEnv("REPORT_LLM_QUEUE_NAME");
const PDF_QUEUE_KEY = () => requiredEnv("REPORT_PDF_QUEUE_NAME");
const LLM_BATCH_SIZE = () => requiredNumberEnv("REPORT_LLM_WORKER_BATCH_SIZE");
const PDF_BATCH_SIZE = () => requiredNumberEnv("REPORT_PDF_WORKER_BATCH_SIZE");
const RETRY_COUNT = () => requiredNumberEnv("REPORT_WORKER_RETRY_COUNT");
const RETRY_DELAY_MS = () => requiredNumberEnv("REPORT_WORKER_RETRY_DELAY_MS");

const REPORT_PRICES = {
  yearly_kundali: () => Number(process.env.YEARLY_REPORT_GENERATION_PRICE || 0),
  wealth_kundali: () => Number(process.env.WEALTH_REPORT_GENERATION_PRICE || 0),
  sade_sati_kundali: () => Number(process.env.SADE_SATI_REPORT_GENERATION_PRICE || 0),
};

const parseRedisValue = (value) => {
  if (!value) return null;
  if (typeof value === "string") {
    try {
      return JSON.parse(value);
    } catch {
      return null;
    }
  }
  return value;
};

const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

const getReportPrice = (reportType) => {
  const resolver = REPORT_PRICES[reportType];
  return resolver ? resolver() : Number(process.env.DEFAULT_REPORT_GENERATION_PRICE || 0);
};

const enqueueReportLlmRequest = async ({ userId, reportType, payload }) => {
  const reportRequest = await ReportGenerationRequest.create({
    userId,
    userRequestId: payload?.userRequestId || null,
    reportType,
    sourceType: "queued_report_submission",
    status: "queued",
    price: getReportPrice(reportType),
    currency: process.env.REPORT_GENERATION_CURRENCY || "INR",
    requestPayload: payload || {},
    metadata: {
      queue: LLM_QUEUE_KEY(),
      queuedAt: new Date().toISOString(),
      processingStatus: "pending_llm",
    },
  });

  const job = {
    reportRequestId: reportRequest.id,
    userId,
    reportType,
    attempts: 0,
    createdAt: Date.now(),
  };

  await redis.rpush(LLM_QUEUE_KEY(), JSON.stringify(job));
  console.log("[ReportQueue][LLM][ENQUEUE]", {
    queue: LLM_QUEUE_KEY(),
    reportRequestId: reportRequest.id,
    userId,
    reportType,
  });

  return reportRequest;
};

const enqueueReportPdfRequest = async ({ reportRequest, reportRequestId, userId, reportType, sourceId }) => {
  const id = reportRequestId || reportRequest?.id;
  if (!id) throw new Error("reportRequestId is required for PDF queue");

  const job = {
    reportRequestId: id,
    userId: userId || reportRequest?.userId,
    reportType: reportType || reportRequest?.reportType,
    sourceId: sourceId || reportRequest?.sourceId || null,
    attempts: 0,
    createdAt: Date.now(),
  };

  await redis.rpush(PDF_QUEUE_KEY(), JSON.stringify(job));
  console.log("[ReportQueue][PDF][ENQUEUE]", {
    queue: PDF_QUEUE_KEY(),
    reportRequestId: job.reportRequestId,
    userId: job.userId,
    reportType: job.reportType,
    sourceId: job.sourceId,
  });

  return job;
};

const requeueWithRetry = async ({ queueKey, job, error }) => {
  const attempts = Number(job.attempts || 0) + 1;
  if (attempts >= RETRY_COUNT()) return false;
  if (RETRY_DELAY_MS() > 0) await sleep(RETRY_DELAY_MS());
  await redis.rpush(queueKey, JSON.stringify({ ...job, attempts, lastError: error?.message || String(error) }));
  return true;
};

const getRetryQueuedStatus = (workerName) => {
  if (workerName === "ReportPDFWorker") return "llm_completed";
  return "queued";
};

const drainQueueSnapshot = async ({ queueKey, batchSize, handler, workerName }) => {
  const initialLength = Number(await redis.llen(queueKey)) || 0;
  const limit = initialLength;
  console.log(`[${workerName}] Queue processing started`, { queue: queueKey, initialLength, batchSize, processingLimit: limit });

  let processed = 0;
  for (let index = 0; index < limit; index += 1) {
    const rawJob = await redis.lpop(queueKey);
    if (!rawJob) break;
    const job = parseRedisValue(rawJob);
    if (!job?.reportRequestId || !job?.reportType || !job?.userId) {
      console.error(`[${workerName}] Dropping malformed report job`, { rawJob });
      continue;
    }

    try {
      await handler(job);
      processed += 1;
    } catch (error) {
      console.error(`[${workerName}] Job failed`, {
        reportRequestId: job.reportRequestId,
        reportType: job.reportType,
        attempts: Number(job.attempts || 0) + 1,
        message: error.message,
      });
      const requeued = await requeueWithRetry({ queueKey, job, error });
      const reportRequest = await ReportGenerationRequest.findByPk(job.reportRequestId);
      if (reportRequest) {
        const attempts = Number(job.attempts || 0) + 1;
        if (requeued) {
          await reportRequest.update({
            status: getRetryQueuedStatus(workerName),
            error: error.message || String(error),
            metadata: {
              ...(reportRequest.metadata || {}),
              failedQueue: queueKey,
              attempts,
              processingStatus: "retry_queued",
              lastWorkerName: workerName,
              lastWorkerError: error.message || String(error),
              nextRetryQueuedAt: new Date().toISOString(),
            },
          });
        } else {
          await reportRequest.update({
            status: `${workerName.toLowerCase()}_failed`,
            error: error.message || String(error),
            completedAt: new Date(),
            metadata: {
              ...(reportRequest.metadata || {}),
              failedQueue: queueKey,
              attempts,
              processingStatus: "failed",
              lastWorkerName: workerName,
              lastWorkerError: error.message || String(error),
            },
          });
        }
      }
    }
  }

  console.log(`[${workerName}] Queue processing finished`, { queue: queueKey, processed, initialLength });
  return { processed, initialLength };
};

module.exports = {
  REPORT_QUEUE_ENABLED,
  LLM_QUEUE_KEY,
  PDF_QUEUE_KEY,
  LLM_BATCH_SIZE,
  PDF_BATCH_SIZE,
  enqueueReportLlmRequest,
  enqueueReportPdfRequest,
  drainQueueSnapshot,
};
