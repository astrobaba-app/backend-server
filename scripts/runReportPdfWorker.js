require("dotenv").config();
require("../model/associations/associations");

const {
  PDF_QUEUE_KEY,
  PDF_BATCH_SIZE,
  drainQueueSnapshot,
} = require("../services/reportGenerationQueueService");
const {
  generateQueuedReportPdf,
} = require("../controller/horoscope/kundliReportController");
const ReportGenerationRequest = require("../model/report/reportGenerationRequest");

const processPdfJob = async (job) => {
  const reportRequest = await ReportGenerationRequest.findByPk(job.reportRequestId);
  if (!reportRequest) throw new Error("ReportGenerationRequest not found");

  await reportRequest.update({
    status: "pdf_processing",
    metadata: {
      ...(reportRequest.metadata || {}),
      processingStatus: "pdf_processing",
      pdfWorkerStartedAt: new Date().toISOString(),
    },
  });

  console.log("[ReportPDFWorker] Processing", {
    reportRequestId: reportRequest.id,
    userId: reportRequest.userId,
    reportType: reportRequest.reportType,
    sourceId: reportRequest.sourceId,
  });

  await generateQueuedReportPdf(reportRequest);

  console.log("[ReportPDFWorker] Completed", {
    reportRequestId: reportRequest.id,
    reportType: reportRequest.reportType,
    pdfUrl: reportRequest.pdfUrl,
  });
};

const run = async () => {
  await drainQueueSnapshot({
    queueKey: PDF_QUEUE_KEY(),
    batchSize: PDF_BATCH_SIZE(),
    workerName: "ReportPDFWorker",
    handler: processPdfJob,
  });
};

run()
  .then(() => process.exit(0))
  .catch((error) => {
    console.error("[ReportPDFWorker] Fatal error", error);
    process.exit(1);
  });
