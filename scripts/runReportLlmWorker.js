require("dotenv").config();
require("../model/associations/associations");

const {
  LLM_QUEUE_KEY,
  LLM_BATCH_SIZE,
  drainQueueSnapshot,
} = require("../services/reportGenerationQueueService");
const {
  generateYearlyKundaliReport,
  generateWealthKundaliReport,
  generateSadeSatiKundaliReport,
} = require("../controller/horoscope/kundliReportController");
const { processPalmQueueSnapshot } = require("../services/palmQueueService");
const ReportGenerationRequest = require("../model/report/reportGenerationRequest");

const CONTROLLERS = {
  yearly_kundali: generateYearlyKundaliReport,
  wealth_kundali: generateWealthKundaliReport,
  sade_sati_kundali: generateSadeSatiKundaliReport,
};

const createWorkerResponse = () => {
  const state = { statusCode: 200, payload: null };
  return {
    status(code) {
      state.statusCode = code;
      return this;
    },
    json(payload) {
      state.payload = payload;
      if (state.statusCode >= 400) {
        const message = payload?.error || payload?.message || "Report controller failed";
        const error = new Error(message);
        error.statusCode = state.statusCode;
        error.payload = payload;
        throw error;
      }
      return payload;
    },
    getState() {
      return state;
    },
  };
};

const processLlmJob = async (job) => {
  const reportRequest = await ReportGenerationRequest.findByPk(job.reportRequestId);
  if (!reportRequest) throw new Error("ReportGenerationRequest not found");

  const controller = CONTROLLERS[job.reportType];
  if (!controller) throw new Error(`Unsupported report type: ${job.reportType}`);

  await reportRequest.update({
    status: "llm_processing",
    startedAt: reportRequest.startedAt || new Date(),
    metadata: {
      ...(reportRequest.metadata || {}),
      processingStatus: "llm_processing",
      workerStartedAt: new Date().toISOString(),
    },
  });

  console.log("[ReportLLMWorker] Processing", {
    reportRequestId: reportRequest.id,
    userId: reportRequest.userId,
    reportType: reportRequest.reportType,
  });

  const req = {
    user: { id: reportRequest.userId },
    body: reportRequest.requestPayload || {},
    reportQueueMode: "llm_worker",
    reportGenerationRequestId: reportRequest.id,
  };
  const res = createWorkerResponse();
  await controller(req, res);

  console.log("[ReportLLMWorker] Completed", {
    reportRequestId: reportRequest.id,
    reportType: reportRequest.reportType,
  });
};

const run = async () => {
  await drainQueueSnapshot({
    queueKey: LLM_QUEUE_KEY(),
    batchSize: LLM_BATCH_SIZE(),
    workerName: "ReportLLMWorker",
    handler: processLlmJob,
  });

  await processPalmQueueSnapshot({ workerName: "ReportLLMWorker:Palm" });
};

run()
  .then(() => process.exit(0))
  .catch((error) => {
    console.error("[ReportLLMWorker] Fatal error", error);
    process.exit(1);
  });
