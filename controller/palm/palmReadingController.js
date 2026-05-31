const PalmUpload = require("../../model/palm/palmUpload");
const PalmFeature = require("../../model/palm/palmFeature");
const PalmReport = require("../../model/palm/palmReport");
const AIJob = require("../../model/palm/aiJob");
const PalmOrder = require("../../model/palm/palmOrder");
const Wallet = require("../../model/wallet/wallet");
const WalletTransaction = require("../../model/wallet/walletTransaction");
const Razorpay = require("razorpay");
const crypto = require("crypto");
const { sequelize } = require("../../dbConnection/dbConfig");
const { enqueuePalmJob } = require("../../services/palmQueueService");
const { checkPalmEngineHealth } = require("../../services/palmReadingService");

const PALM_REPORT_PRICE = Number(process.env.PALM_REPORT_PRICE || 49);
const razorpay = new Razorpay({
  key_id: process.env.RAZORPAY_KEY_ID,
  key_secret: process.env.RAZORPAY_KEY_SECRET,
});

const ensureQueuedJob = async ({ userId, palmUploadId }) => {
  const paidOrder = await PalmOrder.findOne({
    where: { userId, palmUploadId, status: "paid" },
  });
  if (!paidOrder) {
    throw new Error("payment_required_before_processing");
  }

  const existing = await AIJob.findOne({ where: { userId, palmUploadId } });
  if (existing) {
    if (existing.status === "completed") return existing;
    if (existing.status === "failed") {
      await existing.update({
        status: "queued",
        stage: "queued",
        progress: 8,
        stageMessage: "Resuming your paid palm report.",
        error: null,
      });
      await enqueuePalmJob(existing.id);
      return existing;
    }
    if (existing.status === "queued") {
      await enqueuePalmJob(existing.id);
    }
    return existing;
  }

  const job = await AIJob.create({
    userId,
    palmUploadId,
    type: "palm_reading",
    status: "queued",
    stage: "queued",
    progress: 8,
    stageMessage: "Payment confirmed. Your palm report is entering the analysis queue.",
  });
  await enqueuePalmJob(job.id);
  return job;
};

const createPalmReadingOrder = async (req, res) => {
  try {
    const userId = req.user.id;
    const uploadedPalmImages = req.uploadedPalmImages || [];
    if (!uploadedPalmImages.length) {
      return res.status(400).json({ success: false, message: "At least one palm image is required" });
    }

    const health = await checkPalmEngineHealth();
    if (!health.ok) {
      console.error("[PalmController] Palm engine unavailable", health);
      return res.status(503).json({
        success: false,
        message: "Palm AI engine is temporarily unavailable. Please try again in a minute.",
        details: health,
      });
    }

    const metadata = {
      gender: req.body.gender || null,
      ageRange: req.body.ageRange || null,
      dominantHand: req.body.dominantHand || null,
      notes: req.body.notes || null,
    };

    const palmUpload = await PalmUpload.create({
      userId,
      imageUrls: uploadedPalmImages.map((item) => item.url),
      imageHash: uploadedPalmImages[0]?.hash || null,
      metadata,
    });

    const expiresAt = new Date(Date.now() + 15 * 60 * 1000);
    const order = await PalmOrder.create({
      userId,
      palmUploadId: palmUpload.id,
      amount: PALM_REPORT_PRICE,
      status: "pending_payment",
      expiresAt,
      idempotencyKey: `${userId}:${palmUpload.id}:${Date.now()}`,
    });

    let wallet = await Wallet.findOne({ where: { userId } });
    if (!wallet) {
      wallet = await Wallet.create({ userId });
    }
    const walletBalance = Number(wallet.balance || 0);

    return res.status(201).json({
      success: true,
      orderId: order.id,
      palmUploadId: palmUpload.id,
      amount: PALM_REPORT_PRICE,
      walletBalance,
      canPayWithWallet: walletBalance >= PALM_REPORT_PRICE,
      paymentRequired: true,
      optimization: {
        processedImages: uploadedPalmImages.length,
        ignoredImages: req.ignoredPalmImagesCount || 0,
      },
    });
  } catch (error) {
    return res.status(500).json({ success: false, message: "Failed to create palm order", error: error.message });
  }
};

const payPalmOrderWithWallet = async (req, res) => {
  try {
    const userId = req.user.id;
    const { orderId } = req.params;
    const order = await PalmOrder.findOne({ where: { id: orderId, userId } });
    if (!order) return res.status(404).json({ success: false, message: "Order not found" });
    if (order.status === "paid") {
      const job = await ensureQueuedJob({ userId, palmUploadId: order.palmUploadId });
      return res.status(200).json({ success: true, alreadyPaid: true, jobId: job.id, orderId: order.id });
    }
    if (order.status !== "pending_payment") {
      return res.status(400).json({ success: false, message: "Order is not payable" });
    }

    const wallet = await Wallet.findOne({ where: { userId } });
    if (!wallet) return res.status(404).json({ success: false, message: "Wallet not found" });
    const currentBalance = Number(wallet.balance || 0);
    if (currentBalance < PALM_REPORT_PRICE) {
      return res.status(400).json({ success: false, message: "Insufficient wallet balance", currentBalance });
    }

    const tx = await sequelize.transaction();
    try {
      const newBalance = currentBalance - PALM_REPORT_PRICE;
      await wallet.update(
        { balance: newBalance, totalSpent: Number(wallet.totalSpent || 0) + PALM_REPORT_PRICE },
        { transaction: tx }
      );
      const walletTxn = await WalletTransaction.create(
        {
          userId,
          walletId: wallet.id,
          amount: PALM_REPORT_PRICE,
          type: "debit",
          status: "completed",
          paymentMethod: "manual",
          description: "Palm report purchase",
          balanceBefore: currentBalance,
          balanceAfter: newBalance,
        },
        { transaction: tx }
      );
      await order.update(
        { status: "paid", paymentMethod: "wallet", walletTransactionId: walletTxn.id },
        { transaction: tx }
      );
      await tx.commit();
    } catch (error) {
      await tx.rollback();
      throw error;
    }

    const job = await ensureQueuedJob({ userId, palmUploadId: order.palmUploadId });
    return res.status(202).json({
      success: true,
      orderId: order.id,
      status: "paid",
      jobId: job.id,
      paymentMethod: "wallet",
    });
  } catch (error) {
    if (String(error.message || "").includes("payment_required_before_processing")) {
      return res.status(400).json({ success: false, message: "Payment required before processing" });
    }
    return res.status(500).json({ success: false, message: "Failed to pay with wallet", error: error.message });
  }
};

const createPalmOrderRazorpay = async (req, res) => {
  try {
    const userId = req.user.id;
    const { orderId } = req.params;
    const order = await PalmOrder.findOne({ where: { id: orderId, userId } });
    if (!order) return res.status(404).json({ success: false, message: "Order not found" });
    if (order.status === "paid") return res.status(400).json({ success: false, message: "Order already paid" });

    const options = {
      amount: Math.round(PALM_REPORT_PRICE * 100),
      currency: "INR",
      receipt: `palm_${Date.now().toString().slice(-8)}`,
      notes: { userId, palmOrderId: order.id, purpose: "palm_report_purchase" },
    };
    const razorpayOrder = await razorpay.orders.create(options);
    await order.update({ razorpayOrderId: razorpayOrder.id });

    return res.status(200).json({
      success: true,
      razorpayOrderId: razorpayOrder.id,
      amountInPaise: razorpayOrder.amount,
      currency: razorpayOrder.currency,
      key: process.env.RAZORPAY_KEY_ID,
      orderId: order.id,
    });
  } catch (error) {
    return res.status(500).json({ success: false, message: "Failed to create Razorpay order", error: error.message });
  }
};

const verifyPalmOrderRazorpay = async (req, res) => {
  try {
    const userId = req.user.id;
    const { orderId } = req.params;
    const { razorpay_order_id, razorpay_payment_id, razorpay_signature } = req.body;
    const order = await PalmOrder.findOne({ where: { id: orderId, userId } });
    if (!order) return res.status(404).json({ success: false, message: "Order not found" });
    if (order.status === "paid") {
      const job = await ensureQueuedJob({ userId, palmUploadId: order.palmUploadId });
      return res.status(200).json({ success: true, alreadyPaid: true, jobId: job.id, orderId: order.id });
    }

    const generatedSignature = crypto
      .createHmac("sha256", process.env.RAZORPAY_KEY_SECRET)
      .update(`${razorpay_order_id}|${razorpay_payment_id}`)
      .digest("hex");
    if (generatedSignature !== razorpay_signature) {
      return res.status(400).json({ success: false, message: "Invalid payment signature" });
    }

    await order.update({
      status: "paid",
      paymentMethod: "razorpay",
      razorpayOrderId: razorpay_order_id,
      razorpayPaymentId: razorpay_payment_id,
      razorpaySignature: razorpay_signature,
    });

    const job = await ensureQueuedJob({ userId, palmUploadId: order.palmUploadId });
    return res.status(200).json({ success: true, orderId: order.id, status: "paid", paymentMethod: "razorpay", jobId: job.id });
  } catch (error) {
    if (String(error.message || "").includes("payment_required_before_processing")) {
      return res.status(400).json({ success: false, message: "Payment required before processing" });
    }
    return res.status(500).json({ success: false, message: "Failed to verify payment", error: error.message });
  }
};

const getPalmOrder = async (req, res) => {
  try {
    const userId = req.user.id;
    const { orderId } = req.params;
    const order = await PalmOrder.findOne({ where: { id: orderId, userId } });
    if (!order) return res.status(404).json({ success: false, message: "Order not found" });
    return res.status(200).json({ success: true, order });
  } catch (error) {
    return res.status(500).json({ success: false, message: "Failed to fetch order", error: error.message });
  }
};

const resumePalmOrder = async (req, res) => {
  try {
    const userId = req.user.id;
    const { orderId } = req.params;
    const order = await PalmOrder.findOne({ where: { id: orderId, userId } });
    if (!order) return res.status(404).json({ success: false, message: "Order not found" });
    if (order.status !== "paid") {
      return res.status(400).json({ success: false, message: "This order is not paid yet" });
    }

    const report = await PalmReport.findOne({ where: { palmUploadId: order.palmUploadId } });
    if (report?.finalNarrative) {
      const completedJob = await AIJob.findOne({ where: { userId, palmUploadId: order.palmUploadId } });
      return res.status(200).json({
        success: true,
        alreadyCompleted: true,
        orderId: order.id,
        jobId: completedJob?.id || null,
      });
    }

    const job = await ensureQueuedJob({ userId, palmUploadId: order.palmUploadId });
    return res.status(200).json({
      success: true,
      resumed: true,
      orderId: order.id,
      jobId: job.id,
      status: job.status,
      stage: job.stage,
    });
  } catch (error) {
    if (String(error.message || "").includes("payment_required_before_processing")) {
      return res.status(400).json({ success: false, message: "Payment required before processing" });
    }
    return res.status(500).json({ success: false, message: "Failed to resume paid order", error: error.message });
  }
};

const getPalmReadingJob = async (req, res) => {
  try {
    const userId = req.user.id;
    const { jobId } = req.params;
    const job = await AIJob.findOne({ where: { id: jobId, userId } });
    if (!job) return res.status(404).json({ success: false, message: "Job not found" });

    const response = { success: true, job };
    if (job.status === "completed") {
      const feature = await PalmFeature.findOne({ where: { palmUploadId: job.palmUploadId } });
      const report = await PalmReport.findOne({ where: { palmUploadId: job.palmUploadId } });
      const upload = await PalmUpload.findByPk(job.palmUploadId);
      response.result = {
        palmImages: upload?.imageUrls || [],
        extractedFeatures: feature?.features || {},
        structuredInsights: report?.structuredInsights || {},
        finalNarrativeReport: report?.finalNarrative || "",
        confidenceScores: report?.confidenceScores || feature?.confidenceScores || {},
      };
    }
    return res.status(200).json(response);
  } catch (error) {
    return res.status(500).json({ success: false, message: "Failed to fetch job", error: error.message });
  }
};

const getPalmReadingHistory = async (req, res) => {
  try {
    const userId = req.user.id;
    const uploads = await PalmUpload.findAll({
      where: { userId },
      include: [
        { model: AIJob, as: "aiJob", required: false },
        { model: PalmOrder, as: "order", required: false },
        { model: PalmFeature, as: "features", required: false },
        { model: PalmReport, as: "report", required: false },
      ],
      order: [["createdAt", "DESC"]],
      limit: 50,
    });

    const history = uploads.map((item) => ({
      palmUploadId: item.id,
      createdAt: item.createdAt,
      images: item.imageUrls || [],
      metadata: item.metadata || {},
      job: item.aiJob
        ? {
            id: item.aiJob.id,
            status: item.aiJob.status,
            stage: item.aiJob.stage,
            progress: item.aiJob.progress,
            stageMessage: item.aiJob.stageMessage,
            completedAt: item.aiJob.completedAt,
          }
        : null,
      order: item.order
        ? {
            id: item.order.id,
            status: item.order.status,
            amount: item.order.amount,
            paymentMethod: item.order.paymentMethod,
            palmUploadId: item.order.palmUploadId,
          }
        : null,
      report: item.report
        ? {
            structuredInsights: item.report.structuredInsights || {},
            finalNarrative: item.report.finalNarrative || "",
            confidenceScores: item.report.confidenceScores || {},
          }
        : null,
      features: item.features?.features || {},
    }));

    return res.status(200).json({ success: true, history });
  } catch (error) {
    return res.status(500).json({ success: false, message: "Failed to fetch palm history", error: error.message });
  }
};

module.exports = {
  createPalmReadingOrder,
  payPalmOrderWithWallet,
  createPalmOrderRazorpay,
  verifyPalmOrderRazorpay,
  getPalmOrder,
  resumePalmOrder,
  getPalmReadingJob,
  getPalmReadingHistory,
};
