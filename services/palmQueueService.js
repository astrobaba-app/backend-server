const redis = require("../config/redis/redis");
const AIJob = require("../model/palm/aiJob");
const PalmFeature = require("../model/palm/palmFeature");
const PalmReport = require("../model/palm/palmReport");
const PalmUpload = require("../model/palm/palmUpload");
const PalmOrder = require("../model/palm/palmOrder");
const { analyzePalm } = require("./palmReadingService");

const PALM_QUEUE_KEY = "queue:palm_reading";
const WORKER_INTERVAL_MS = 800;
let workerStarted = false;
let processing = false;
let reconcileRunning = false;
const RECONCILE_INTERVAL_MS = 60 * 1000;

const enqueuePalmJob = async (jobId) => {
  await redis.rpush(PALM_QUEUE_KEY, jobId);
  void processNextPalmJob();
};

const processNextPalmJob = async () => {
  if (processing) return;
  processing = true;
  let activeJob = null;
  try {
    const jobId = await redis.lpop(PALM_QUEUE_KEY);
    if (!jobId) return;

    console.log("[PalmQueue] dequeued job", { jobId });
    const job = await AIJob.findByPk(jobId);
    if (!job || job.status === "completed") return;
    activeJob = job;
    console.log("[PalmQueue] job start", {
      jobId: job.id,
      palmUploadId: job.palmUploadId,
      userId: job.userId,
    });

    await job.update({
      status: "processing",
      stage: "processing_started",
      progress: 15,
      stageMessage: "Palm images received. Starting analysis.",
      startedAt: new Date(),
      error: null,
    });
    const upload = await PalmUpload.findByPk(job.palmUploadId);
    if (!upload) {
      await job.update({
        status: "failed",
        stage: "failed",
        progress: 100,
        stageMessage: "Could not load uploaded images. Please re-upload.",
        error: "Palm upload missing",
      });
      return;
    }

    await job.update({
      stage: "vision_feature_extraction",
      progress: 45,
      stageMessage: "Extracting palm lines and mount details using vision AI.",
    });

    // Dedupe optimization: reuse completed report for same image hash.
    if (upload.imageHash) {
      const cachedUpload = await PalmUpload.findOne({
        where: { imageHash: upload.imageHash },
        include: [
          { model: PalmFeature, as: "features", required: false },
          { model: PalmReport, as: "report", required: false },
        ],
        order: [["createdAt", "DESC"]],
      });

      if (cachedUpload?.report && cachedUpload?.features) {
        await PalmFeature.upsert({
          palmUploadId: upload.id,
          features: cachedUpload.features.features || {},
          confidenceScores: cachedUpload.features.confidenceScores || {},
        });
        await PalmReport.upsert({
          palmUploadId: upload.id,
          structuredInsights: cachedUpload.report.structuredInsights || {},
          finalNarrative: cachedUpload.report.finalNarrative || "Report not generated",
          confidenceScores: cachedUpload.report.confidenceScores || {},
        });
        await job.update({
          status: "completed",
          stage: "completed",
          progress: 100,
          stageMessage: "Matched a previous palm analysis. Report is ready instantly.",
          completedAt: new Date(),
        });
        console.log("[PalmQueue] cache hit by imageHash", { jobId: job.id, imageHash: upload.imageHash });
        return;
      }
    }

    const metadata = {
      ...(upload.metadata || {}),
      user_id: job.userId,
      palm_upload_id: upload.id,
      job_id: job.id,
    };

    const result = await analyzePalm({ imageUrls: upload.imageUrls, metadata });
    console.log("[PalmQueue] analyzePalm success", {
      jobId: job.id,
      hasFeatures: Boolean(result?.extracted_features),
      hasInsights: Boolean(result?.structured_insights),
    });

    await PalmFeature.upsert({
      palmUploadId: upload.id,
      features: result.extracted_features || {},
      confidenceScores: result.confidence_scores || {},
    });

    await job.update({
      stage: "rules_and_interpretation",
      progress: 72,
      stageMessage: "Applying palmistry rules and generating structured insights.",
    });

    await PalmReport.upsert({
      palmUploadId: upload.id,
      structuredInsights: result.structured_insights || {},
      finalNarrative: result.final_narrative_report || "Report not generated",
      confidenceScores: result.confidence_scores || {},
    });

    await job.update({
      status: "completed",
      stage: "completed",
      progress: 100,
      stageMessage: "Your premium palm report is ready.",
      completedAt: new Date(),
    });
    console.log("[PalmQueue] job completed", { jobId: job.id, palmUploadId: job.palmUploadId });
  } catch (error) {
    console.error("[PalmQueue] processing failed", {
      jobId: activeJob?.id,
      palmUploadId: activeJob?.palmUploadId,
      message: error.message,
      stack: error.stack,
      raw: error,
    });
    try {
      if (activeJob) {
        const message = String(error.message || "Palm job failed");
        const unreachable = /ECONNREFUSED|ENOTFOUND|ETIMEDOUT|unknown_status/i.test(message);
        const quota = /insufficient_quota|quota/i.test(message);
        const qualityReject = /rejected_quality_or_fraud|rejected_nsfw|Upload rejected/i.test(message);
        const rateLimited = /Too Many Requests|429|rate.?limit|temporarily busy/i.test(message);
        await activeJob.update({
          status: "failed",
          stage: "failed",
          progress: 100,
          stageMessage: qualityReject
            ? "Upload rejected by fraud/quality checks. Please upload one clear real human palm image."
            : rateLimited
            ? "Our AI safety service is busy right now. Please retry in a minute."
            : quota
            ? "AI quota exhausted temporarily. Please retry later."
            : unreachable
            ? "Palm AI engine is temporarily unavailable. Please retry shortly."
            : "Palm analysis failed. Please retry with clearer images.",
          error: "Palm processing failed",
        });
      }
    } catch (innerError) {
      console.error("[PalmQueue] failed to persist error state:", innerError.message || innerError);
    }
  } finally {
    processing = false;
  }
};

const startPalmQueueWorker = () => {
  if (workerStarted) return;
  workerStarted = true;
  setInterval(() => {
    void processNextPalmJob();
  }, WORKER_INTERVAL_MS);
  setInterval(() => {
    void reconcilePaidPalmOrders();
  }, RECONCILE_INTERVAL_MS);
  console.log("[PalmQueue] Worker started");
};

const reconcilePaidPalmOrders = async () => {
  if (reconcileRunning) return;
  reconcileRunning = true;
  try {
    const orders = await PalmOrder.findAll({
      where: { status: "paid" },
      order: [["updatedAt", "DESC"]],
      limit: 200,
    });

    for (const order of orders) {
      const uploadId = order.palmUploadId;
      const report = await PalmReport.findOne({ where: { palmUploadId: uploadId } });
      if (report?.finalNarrative) continue;

      const job = await AIJob.findOne({ where: { userId: order.userId, palmUploadId: uploadId } });
      if (!job) {
        const created = await AIJob.create({
          userId: order.userId,
          palmUploadId: uploadId,
          type: "palm_reading",
          status: "queued",
          stage: "queued",
          progress: 8,
          stageMessage: "Recovering your paid palm report.",
        });
        await enqueuePalmJob(created.id);
        continue;
      }

      if (job.status === "failed") {
        await job.update({
          status: "queued",
          stage: "queued",
          progress: 8,
          stageMessage: "Retrying your paid palm report automatically.",
          error: null,
        });
        await enqueuePalmJob(job.id);
        continue;
      }

    }
  } catch (error) {
    console.error("[PalmQueue] reconcile failed", { message: error.message, stack: error.stack });
  } finally {
    reconcileRunning = false;
  }
};

module.exports = { enqueuePalmJob, startPalmQueueWorker, reconcilePaidPalmOrders };
