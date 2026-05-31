const redis = require("../config/redis/redis");
const AIJob = require("../model/palm/aiJob");
const PalmFeature = require("../model/palm/palmFeature");
const PalmReport = require("../model/palm/palmReport");
const PalmUpload = require("../model/palm/palmUpload");
const PalmOrder = require("../model/palm/palmOrder");
const Wallet = require("../model/wallet/wallet");
const WalletTransaction = require("../model/wallet/walletTransaction");
const { sequelize } = require("../dbConnection/dbConfig");
const { analyzePalm } = require("./palmReadingService");

const PALM_QUEUE_KEY = "queue:palm_reading";
const WORKER_INTERVAL_MS = 800;
let workerStarted = false;
let processing = false;
let reconcileRunning = false;
const RECONCILE_INTERVAL_MS = 60 * 1000;
const PALM_DEBUG = String(process.env.PALM_DEBUG_LOGS || "").toLowerCase() === "true";
const queueLog = (event, payload = {}) => {
  if (!PALM_DEBUG) return;
  console.log(`[PalmFlow][QUEUE] ${event}`, payload);
};
const queueInfo = (event, payload = {}) => {
  console.log(`[PalmQueue][${event}]`, payload);
};
const QUALITY_REJECT_ERROR_TAG = "QUALITY_REJECTED_TERMINAL";

const extractQualityRejectReasons = (message) => {
  try {
    const start = message.indexOf("{");
    if (start === -1) return [];
    const parsed = JSON.parse(message.slice(start));
    const reasons = parsed?.detail?.checks?.reject_reasons;
    return Array.isArray(reasons) ? reasons : [];
  } catch {
    return [];
  }
};

const handleQualityRejectCompensation = async ({ job, reasonText }) => {
  const order = await PalmOrder.findOne({
    where: { userId: job.userId, palmUploadId: job.palmUploadId },
  });
  if (!order) return;

  if (order.status !== "failed") {
    await order.update({ status: "failed" });
  }

  if (order.paymentMethod === "wallet" && order.refundStatus !== "completed") {
    const tx = await sequelize.transaction();
    try {
      let wallet = await Wallet.findOne({ where: { userId: order.userId }, transaction: tx });
      if (!wallet) {
        wallet = await Wallet.create({ userId: order.userId }, { transaction: tx });
      }
      const oldBalance = Number(wallet.balance || 0);
      const refundAmount = Number(order.amount || 0);
      const newBalance = oldBalance + refundAmount;
      await wallet.update({ balance: newBalance }, { transaction: tx });
      await WalletTransaction.create(
        {
          userId: order.userId,
          walletId: wallet.id,
          amount: refundAmount,
          type: "credit",
          status: "completed",
          paymentMethod: "refund",
          description: "Palm quality reject auto-refund",
          metadata: { palmOrderId: order.id, reason: reasonText || "quality_rejected" },
          balanceBefore: oldBalance,
          balanceAfter: newBalance,
        },
        { transaction: tx }
      );
      await order.update(
        {
          refundStatus: "completed",
          refundReason: reasonText || "quality_rejected",
          refundProcessedAt: new Date(),
        },
        { transaction: tx }
      );
      await tx.commit();
      queueInfo("WALLET_REFUND_COMPLETED", { orderId: order.id, jobId: job.id, amount: refundAmount });
    } catch (error) {
      await tx.rollback();
      await order.update({
        refundStatus: "failed",
        refundReason: reasonText || "quality_rejected",
      });
      queueInfo("WALLET_REFUND_FAILED", { orderId: order.id, jobId: job.id, message: error.message });
    }
    return;
  }

  if (order.paymentMethod === "razorpay" && order.refundStatus === "none") {
    await order.update({
      refundStatus: "pending",
      refundReason: reasonText || "quality_rejected",
    });
    queueInfo("RAZORPAY_REFUND_PENDING", { orderId: order.id, jobId: job.id });
  }
};

const hasPaidPalmOrder = async (job) => {
  const paidOrder = await PalmOrder.findOne({
    where: {
      userId: job.userId,
      palmUploadId: job.palmUploadId,
      status: "paid",
    },
  });
  return Boolean(paidOrder);
};

const enqueuePalmJob = async (jobId) => {
  const job = await AIJob.findByPk(jobId);
  if (!job) {
    throw new Error("palm_job_not_found");
  }
  const paid = await hasPaidPalmOrder(job);
  if (!paid) {
    await job.update({
      status: "failed",
      stage: "failed",
      progress: 100,
      stageMessage: "Payment required before palm processing.",
      error: "Payment required",
    });
    throw new Error("payment_required_before_processing");
  }
  await redis.rpush(PALM_QUEUE_KEY, jobId);
  queueLog("enqueue", { jobId, palmUploadId: job.palmUploadId, userId: job.userId, status: job.status });
  queueInfo("ENQUEUE", { jobId, palmUploadId: job.palmUploadId, userId: job.userId, status: job.status });
  void processNextPalmJob();
};

const clearPalmJobFromQueue = async (jobId) => {
  try {
    const removed = await redis.lrem(PALM_QUEUE_KEY, 0, jobId);
    if (removed > 0) {
      queueInfo("QUEUE_CLEARED_JOB", { jobId, removed });
    }
    return removed;
  } catch (error) {
    console.error("[PalmQueue][QUEUE_CLEAR_ERROR]", { jobId, message: error.message });
    return 0;
  }
};

const cleanupPalmQueueStaleJobs = async () => {
  try {
    const queuedIds = await redis.lrange(PALM_QUEUE_KEY, 0, -1);
    if (!Array.isArray(queuedIds) || queuedIds.length === 0) {
      return { scanned: 0, removed: 0 };
    }

    let removed = 0;
    for (const jobId of queuedIds) {
      const job = await AIJob.findByPk(jobId);
      const shouldRemove =
        !job ||
        job.status === "completed" ||
        (job.status === "failed" && String(job.error || "") === QUALITY_REJECT_ERROR_TAG);
      if (shouldRemove) {
        removed += await clearPalmJobFromQueue(jobId);
      }
    }
    queueInfo("QUEUE_CLEANUP_DONE", { scanned: queuedIds.length, removed });
    return { scanned: queuedIds.length, removed };
  } catch (error) {
    console.error("[PalmQueue][QUEUE_CLEANUP_ERROR]", { message: error.message });
    return { scanned: 0, removed: 0, error: error.message };
  }
};

const processNextPalmJob = async () => {
  if (processing) return;
  processing = true;
  let activeJob = null;
  const startedAt = Date.now();
  try {
    const jobId = await redis.lpop(PALM_QUEUE_KEY);
    if (!jobId) return;
    const remaining = await redis.llen(PALM_QUEUE_KEY);
    queueLog("dequeue", { jobId, remainingInQueue: remaining });
    queueInfo("DEQUEUE", { jobId, remainingInQueue: remaining });
    const job = await AIJob.findByPk(jobId);
    if (!job) {
      queueLog("skip_missing_job", { jobId });
      queueInfo("SKIP_MISSING_JOB", { jobId });
      return;
    }
    if (job.status === "completed") {
      queueLog("skip_completed", { jobId, palmUploadId: job.palmUploadId, userId: job.userId });
      queueInfo("SKIP_COMPLETED", { jobId, palmUploadId: job.palmUploadId, userId: job.userId });
      return;
    }
    if (job.status === "processing") {
      queueLog("skip_already_processing", { jobId, palmUploadId: job.palmUploadId, userId: job.userId });
      queueInfo("SKIP_ALREADY_PROCESSING", { jobId, palmUploadId: job.palmUploadId, userId: job.userId });
      return;
    }
    activeJob = job;

    const paid = await hasPaidPalmOrder(job);
    if (!paid) {
      queueLog("skip_unpaid", { jobId: job.id, palmUploadId: job.palmUploadId, userId: job.userId });
      queueInfo("SKIP_UNPAID", { jobId: job.id, palmUploadId: job.palmUploadId, userId: job.userId });
      await job.update({
        status: "failed",
        stage: "failed",
        progress: 100,
        stageMessage: "Payment required before palm processing.",
        error: "Payment required",
      });
      return;
    }

    queueInfo("JOB_START", {
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
    queueLog("stage_vision_started", { jobId: job.id, palmUploadId: upload.id });

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
    queueLog("analyze_done", {
      jobId: job.id,
      palmUploadId: upload.id,
      featureKeys: Object.keys(result?.extracted_features || {}).length,
      elapsedMs: Date.now() - startedAt,
    });
    queueInfo("ANALYZE_SUCCESS", {
      jobId: job.id,
      hasFeatures: Boolean(result?.extracted_features),
      hasInsights: Boolean(result?.structured_insights),
      elapsedMs: Date.now() - startedAt,
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
    queueLog("job_completed", {
      jobId: job.id,
      palmUploadId: job.palmUploadId,
      totalElapsedMs: Date.now() - startedAt,
    });
    queueInfo("JOB_COMPLETED", {
      jobId: job.id,
      palmUploadId: job.palmUploadId,
      totalElapsedMs: Date.now() - startedAt,
    });
  } catch (error) {
    queueLog("process_error", { jobId: activeJob?.id, message: error.message });
    console.error("[PalmQueue][PROCESS_ERROR]", {
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
        const rejectReasons = qualityReject ? extractQualityRejectReasons(message) : [];
        const rejectReasonText = rejectReasons.length ? ` (${rejectReasons.join(", ")})` : "";
        await activeJob.update({
          status: "failed",
          stage: "failed",
          progress: 100,
          stageMessage: qualityReject
            ? `Upload rejected by quality checks${rejectReasonText}. Please upload one clear, stable palm image.`
            : rateLimited
            ? "Our AI safety service is busy right now. Please retry in a minute."
            : quota
            ? "AI quota exhausted temporarily. Please retry later."
            : unreachable
            ? "Palm AI engine is temporarily unavailable. Please retry shortly."
            : "Palm analysis failed. Please retry with clearer images.",
          error: qualityReject ? QUALITY_REJECT_ERROR_TAG : "Palm processing failed",
        });
        if (qualityReject) {
          await handleQualityRejectCompensation({
            job: activeJob,
            reasonText: rejectReasons.join(", ") || "quality_rejected",
          });
          await clearPalmJobFromQueue(activeJob.id);
        }
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
        if (String(job.error || "") === QUALITY_REJECT_ERROR_TAG) {
          continue;
        }
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

      if (job.status === "queued") {
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

module.exports = {
  enqueuePalmJob,
  clearPalmJobFromQueue,
  cleanupPalmQueueStaleJobs,
  startPalmQueueWorker,
  reconcilePaidPalmOrders,
  QUALITY_REJECT_ERROR_TAG,
};
