const PalmUpload = require("../../model/palm/palmUpload");
const PalmFeature = require("../../model/palm/palmFeature");
const PalmReport = require("../../model/palm/palmReport");
const AIJob = require("../../model/palm/aiJob");
const PalmOrder = require("../../model/palm/palmOrder");
const Wallet = require("../../model/wallet/wallet");
const WalletTransaction = require("../../model/wallet/walletTransaction");
const Razorpay = require("razorpay");
const crypto = require("crypto");
const { Op } = require("sequelize");
const { sequelize } = require("../../dbConnection/dbConfig");
const { enqueuePalmJob } = require("../../services/palmQueueService");
const { checkPalmEngineHealth } = require("../../services/palmReadingService");
const { generatePalmReportPDF } = require("../../services/palmReportPdfService");

const PALM_REPORT_PRICE = Number(process.env.PALM_REPORT_PRICE || 59);
const PALM_CHECKOUT_TOKEN_TTL_MS = 30 * 60 * 1000;
const PALM_TRUST_BASE_MIN = 2000;
const PALM_TRUST_BASE_MAX = 2200;
const PALM_TRUST_STEPS = [1, 2, 3, 4, 6];
const CHECKOUT_TOKEN_SECRET = process.env.PALM_CHECKOUT_TOKEN_SECRET || process.env.JWT_SECRET || "palm_checkout_secret";
const PALM_DEBUG = String(process.env.PALM_DEBUG_LOGS || "").toLowerCase() === "true";
const beLog = (event, payload = {}) => {
  if (!PALM_DEBUG) return;
  console.log(`[PalmFlow][BE] ${event}`, payload);
};
const razorpay = new Razorpay({
  key_id: process.env.RAZORPAY_KEY_ID,
  key_secret: process.env.RAZORPAY_KEY_SECRET,
});

const base64UrlEncode = (value) =>
  Buffer.from(value).toString("base64").replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/g, "");

const base64UrlDecode = (value) => {
  const normalized = value.replace(/-/g, "+").replace(/_/g, "/");
  const pad = normalized.length % 4 === 0 ? "" : "=".repeat(4 - (normalized.length % 4));
  return Buffer.from(normalized + pad, "base64").toString("utf8");
};

const signCheckoutToken = (payload) => {
  const encodedPayload = base64UrlEncode(JSON.stringify(payload));
  const signature = crypto.createHmac("sha256", CHECKOUT_TOKEN_SECRET).update(encodedPayload).digest("base64url");
  return `${encodedPayload}.${signature}`;
};

const verifyCheckoutToken = (token) => {
  if (!token || typeof token !== "string" || !token.includes(".")) {
    throw new Error("invalid_checkout_token");
  }

  const [encodedPayload, signature] = token.split(".");
  const expected = crypto.createHmac("sha256", CHECKOUT_TOKEN_SECRET).update(encodedPayload).digest("base64url");
  const safeSignature = Buffer.from(signature);
  const safeExpected = Buffer.from(expected);

  if (
    safeSignature.length !== safeExpected.length ||
    !crypto.timingSafeEqual(safeSignature, safeExpected)
  ) {
    throw new Error("invalid_checkout_token_signature");
  }

  const payload = JSON.parse(base64UrlDecode(encodedPayload));
  if (!payload?.exp || Date.now() > Number(payload.exp)) {
    throw new Error("checkout_token_expired");
  }
  return payload;
};

const createSeededRandom = (seed) => {
  let t = seed >>> 0;
  return () => {
    t += 0x6d2b79f5;
    let r = Math.imul(t ^ (t >>> 15), 1 | t);
    r ^= r + Math.imul(r ^ (r >>> 7), 61 | r);
    return ((r ^ (r >>> 14)) >>> 0) / 4294967296;
  };
};

const getIndiaDateParts = (date = new Date()) => {
  const formatter = new Intl.DateTimeFormat("en-CA", {
    timeZone: "Asia/Kolkata",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    hour12: false,
  });

  const parts = formatter.formatToParts(date);
  const map = {};
  for (const part of parts) {
    if (part.type !== "literal") map[part.type] = part.value;
  }

  return {
    dateKey: `${map.year}-${map.month}-${map.day}`,
    hour: Number(map.hour || 0),
    minute: Number(map.minute || 0),
  };
};

const getSeedFromDateKey = (dateKey) => {
  let seed = 0;
  for (let i = 0; i < dateKey.length; i += 1) {
    seed += dateKey.charCodeAt(i) * (i + 1);
  }
  return seed;
};

const getPalmReadingTrustSnapshot = (date = new Date()) => {
  const { dateKey, hour, minute } = getIndiaDateParts(date);
  const seed = getSeedFromDateKey(dateKey);
  const rand = createSeededRandom(seed);
  const base = PALM_TRUST_BASE_MIN + Math.floor(rand() * (PALM_TRUST_BASE_MAX - PALM_TRUST_BASE_MIN + 1));

  const slotCount = Math.floor((hour * 60 + minute) / 30);
  let count = base;

  for (let i = 0; i < slotCount; i += 1) {
    const step = PALM_TRUST_STEPS[Math.floor(rand() * PALM_TRUST_STEPS.length)];
    count += step;
  }

  return { dateKey, base, count, slotCount };
};

const toMaxRetries = (value) => {
  if (value === null || value === undefined) return 3;
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : 3;
};

const getActiveRetrySourceOrder = async (userId) => {
  const orders = await PalmOrder.findAll({
    where: { userId, status: "failed", retrySourceOrderId: null },
    order: [["updatedAt", "DESC"]],
    limit: 25,
  });
  const order = orders.find((o) => toMaxRetries(o.maxRetries) > 0) || null;
  if (!order) return null;

  const maxRetries = toMaxRetries(order.maxRetries);
  const retriesUsed = Number(order.retriesUsed || 0);
  if (retriesUsed >= maxRetries) return null;

  // If user completed any newer report, expire this latest retry source.
  const newerSuccess = await AIJob.findOne({
    where: {
      userId,
      status: "completed",
      createdAt: { [Op.gt]: order.updatedAt },
    },
    order: [["createdAt", "DESC"]],
  });
  if (newerSuccess) {
    await order.update({
      retriesUsed: maxRetries,
      retryExhaustedAt: new Date(),
    });
    return null;
  }
  return order;
};

const getActiveRetryJobForSource = async (userId, sourceOrderId) => {
  const retryOrders = await PalmOrder.findAll({
    where: { userId, retrySourceOrderId: sourceOrderId },
    order: [["createdAt", "DESC"]],
    limit: 20,
  });
  if (!retryOrders.length) return null;
  const uploadIds = retryOrders.map((o) => o.palmUploadId).filter(Boolean);
  if (!uploadIds.length) return null;
  const activeJob = await AIJob.findOne({
    where: { userId, palmUploadId: uploadIds, status: { [Op.in]: ["queued", "processing"] } },
    order: [["updatedAt", "DESC"]],
  });
  return activeJob || null;
};

const ensureQueuedJob = async ({ userId, palmUploadId }) => {
  const paidOrder = await PalmOrder.findOne({
    where: { userId, palmUploadId },
  });
  if (!paidOrder || (paidOrder.status !== "paid" && paidOrder.status !== "failed")) {
    throw new Error("payment_required_before_processing");
  }
  const maxRetries = toMaxRetries(paidOrder.maxRetries);
  const retriesUsed = Number(paidOrder.retriesUsed || 0);
  if (paidOrder.status === "failed" && retriesUsed >= maxRetries) {
    throw new Error("retry_limit_reached");
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
      if (paidOrder.status !== "paid") {
        await paidOrder.update({ status: "paid" });
      }
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

const finalizePaidPalmOrder = async ({
  userId,
  checkoutPayload,
  paymentMethod,
  walletTransactionId = null,
  razorpayOrderId = null,
  razorpayPaymentId = null,
  razorpaySignature = null,
  transaction = null,
  enqueueJob = true,
}) => {
  const idempotencyKey = `checkout:${checkoutPayload.sessionId}`;
  beLog("finalize_start", {
    userId,
    sessionId: checkoutPayload.sessionId,
    paymentMethod,
    imageCount: Array.isArray(checkoutPayload.imageUrls) ? checkoutPayload.imageUrls.length : 0,
  });
  const existingOrder = await PalmOrder.findOne({ where: { userId, idempotencyKey } });
  if (existingOrder && existingOrder.status === "paid") {
    const job = await ensureQueuedJob({ userId, palmUploadId: existingOrder.palmUploadId });
    beLog("finalize_idempotent_reuse", { orderId: existingOrder.id, jobId: job.id, sessionId: checkoutPayload.sessionId });
    return { order: existingOrder, job, alreadyPaid: true };
  }

  const createOptions = transaction ? { transaction } : undefined;
  const palmUpload = await PalmUpload.create(
    {
      userId,
      imageUrls: checkoutPayload.imageUrls || [],
      imageHash: checkoutPayload.imageHash || null,
      metadata: checkoutPayload.metadata || {},
    },
    createOptions
  );

  const order = await PalmOrder.create(
    {
      userId,
      palmUploadId: palmUpload.id,
      amount: PALM_REPORT_PRICE,
      status: "paid",
      paymentMethod,
      walletTransactionId,
      razorpayOrderId,
      razorpayPaymentId,
      razorpaySignature,
      idempotencyKey,
      maxRetries: 3,
      retriesUsed: 0,
      },
    createOptions
  );

  const job = await AIJob.create(
    {
      userId,
      palmUploadId: palmUpload.id,
      type: "palm_reading",
      status: "queued",
      stage: "queued",
      progress: 8,
      stageMessage: "Payment confirmed. Your palm report is entering the analysis queue.",
    },
    createOptions
  );

  if (enqueueJob) {
    await enqueuePalmJob(job.id);
  }
  beLog("finalize_created", { orderId: order.id, jobId: job.id, palmUploadId: palmUpload.id, sessionId: checkoutPayload.sessionId });
  return { order, job, alreadyPaid: false };
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

    const retrySourceOrder = await getActiveRetrySourceOrder(userId);
    if (retrySourceOrder) {
      const activeRetryJob = await getActiveRetryJobForSource(userId, retrySourceOrder.id);
      if (activeRetryJob) {
        const sourceMax = toMaxRetries(retrySourceOrder.maxRetries);
        const sourceUsed = Number(retrySourceOrder.retriesUsed || 0);
        return res.status(202).json({
          success: true,
          paymentRequired: false,
          jobId: activeRetryJob.id,
          retry: {
            sourceOrderId: retrySourceOrder.id,
            totalRetries: sourceMax,
            remainingRetries: Math.max(0, sourceMax - sourceUsed),
          },
          message: "A retry is already in progress. Reusing existing processing job.",
        });
      }

      const palmUpload = await PalmUpload.create({
        userId,
        imageUrls: uploadedPalmImages.map((item) => item.url),
        imageHash: uploadedPalmImages[0]?.hash || null,
        metadata,
      });
      const retryOrder = await PalmOrder.create({
        userId,
        palmUploadId: palmUpload.id,
        amount: 0,
        status: "paid",
        paymentMethod: null,
        idempotencyKey: `retry:${crypto.randomUUID()}`,
        maxRetries: 0,
        retriesUsed: 0,
        retrySourceOrderId: retrySourceOrder.id,
      });
      const job = await AIJob.create({
        userId,
        palmUploadId: palmUpload.id,
        type: "palm_reading",
        status: "queued",
        stage: "queued",
        progress: 8,
        stageMessage: "Free retry detected. Your palm report is entering the analysis queue.",
      });
      await enqueuePalmJob(job.id);
      const sourceMax = toMaxRetries(retrySourceOrder.maxRetries);
      const sourceUsed = Number(retrySourceOrder.retriesUsed || 0);
      return res.status(202).json({
        success: true,
        paymentRequired: false,
        orderId: retryOrder.id,
        jobId: job.id,
        retry: {
          sourceOrderId: retrySourceOrder.id,
          totalRetries: sourceMax,
          remainingRetries: Math.max(0, sourceMax - sourceUsed),
        },
      });
    }

    let wallet = await Wallet.findOne({ where: { userId } });
    if (!wallet) {
      wallet = await Wallet.create({ userId });
    }
    const walletBalance = Number(wallet.balance || 0);
    const checkoutPayload = {
      sessionId: crypto.randomUUID(),
      userId,
      imageUrls: uploadedPalmImages.map((item) => item.url),
      imageHash: uploadedPalmImages[0]?.hash || null,
      metadata,
      iat: Date.now(),
      exp: Date.now() + PALM_CHECKOUT_TOKEN_TTL_MS,
    };
    const checkoutToken = signCheckoutToken(checkoutPayload);
    beLog("checkout_created", {
      userId,
      sessionId: checkoutPayload.sessionId,
      imageCount: uploadedPalmImages.length,
      ignoredImages: req.ignoredPalmImagesCount || 0,
      imageFormats: uploadedPalmImages.map((it) => it.format || "unknown"),
    });

    return res.status(201).json({
      success: true,
      checkoutToken,
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
    const checkoutToken = String(req.body?.checkoutToken || "");
    const checkoutPayload = verifyCheckoutToken(checkoutToken);
    beLog("wallet_pay_request", { userId, sessionId: checkoutPayload.sessionId });
    if (checkoutPayload.userId !== userId) {
      return res.status(403).json({ success: false, message: "Checkout token does not belong to this user" });
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
      const finalized = await finalizePaidPalmOrder({
        userId,
        checkoutPayload,
        paymentMethod: "wallet",
        walletTransactionId: walletTxn.id,
        transaction: tx,
        enqueueJob: false,
      });
      await tx.commit();
      await enqueuePalmJob(finalized.job.id);
      beLog("wallet_pay_success", {
        userId,
        sessionId: checkoutPayload.sessionId,
        orderId: finalized.order.id,
        jobId: finalized.job.id,
      });
      return res.status(202).json({
        success: true,
        orderId: finalized.order.id,
        status: "paid",
        jobId: finalized.job.id,
        paymentMethod: "wallet",
        alreadyPaid: finalized.alreadyPaid,
      });
    } catch (error) {
      await tx.rollback();
      throw error;
    }
  } catch (error) {
    beLog("wallet_pay_error", { message: error.message, userId: req?.user?.id });
    if (String(error.message || "").includes("checkout_token")) {
      return res.status(400).json({ success: false, message: "Checkout expired. Please upload palm image again." });
    }
    if (String(error.message || "").includes("payment_required_before_processing")) {
      return res.status(400).json({ success: false, message: "Payment required before processing" });
    }
    return res.status(500).json({ success: false, message: "Failed to pay with wallet", error: error.message });
  }
};

const createPalmOrderRazorpay = async (req, res) => {
  try {
    const userId = req.user.id;
    const checkoutToken = String(req.body?.checkoutToken || "");
    const checkoutPayload = verifyCheckoutToken(checkoutToken);
    beLog("razorpay_create_request", { userId, sessionId: checkoutPayload.sessionId });
    if (checkoutPayload.userId !== userId) {
      return res.status(403).json({ success: false, message: "Checkout token does not belong to this user" });
    }

    const options = {
      amount: Math.round(PALM_REPORT_PRICE * 100),
      currency: "INR",
      receipt: `palm_${Date.now().toString().slice(-8)}`,
      notes: { userId, checkoutSessionId: checkoutPayload.sessionId, purpose: "palm_report_purchase" },
    };
    const razorpayOrder = await razorpay.orders.create(options);
    beLog("razorpay_create_success", { userId, sessionId: checkoutPayload.sessionId, razorpayOrderId: razorpayOrder.id });

    return res.status(200).json({
      success: true,
      razorpayOrderId: razorpayOrder.id,
      amountInPaise: razorpayOrder.amount,
      currency: razorpayOrder.currency,
      key: process.env.RAZORPAY_KEY_ID,
    });
  } catch (error) {
    beLog("razorpay_create_error", { message: error.message, userId: req?.user?.id });
    if (String(error.message || "").includes("checkout_token")) {
      return res.status(400).json({ success: false, message: "Checkout expired. Please upload palm image again." });
    }
    return res.status(500).json({ success: false, message: "Failed to create Razorpay order", error: error.message });
  }
};

const verifyPalmOrderRazorpay = async (req, res) => {
  try {
    const userId = req.user.id;
    const { razorpay_order_id, razorpay_payment_id, razorpay_signature, checkoutToken } = req.body;
    const checkoutPayload = verifyCheckoutToken(String(checkoutToken || ""));
    beLog("razorpay_verify_request", { userId, sessionId: checkoutPayload.sessionId, razorpayOrderId: razorpay_order_id });
    if (checkoutPayload.userId !== userId) {
      return res.status(403).json({ success: false, message: "Checkout token does not belong to this user" });
    }

    const generatedSignature = crypto
      .createHmac("sha256", process.env.RAZORPAY_KEY_SECRET)
      .update(`${razorpay_order_id}|${razorpay_payment_id}`)
      .digest("hex");
    if (generatedSignature !== razorpay_signature) {
      return res.status(400).json({ success: false, message: "Invalid payment signature" });
    }

    const finalized = await finalizePaidPalmOrder({
      userId,
      checkoutPayload,
      paymentMethod: "razorpay",
      razorpayOrderId: razorpay_order_id,
      razorpayPaymentId: razorpay_payment_id,
      razorpaySignature: razorpay_signature,
    });
    beLog("razorpay_verify_success", {
      userId,
      sessionId: checkoutPayload.sessionId,
      orderId: finalized.order.id,
      jobId: finalized.job.id,
    });
    return res.status(200).json({
      success: true,
      orderId: finalized.order.id,
      status: "paid",
      paymentMethod: "razorpay",
      jobId: finalized.job.id,
      alreadyPaid: finalized.alreadyPaid,
    });
  } catch (error) {
    beLog("razorpay_verify_error", { message: error.message, userId: req?.user?.id });
    if (String(error.message || "").includes("checkout_token")) {
      return res.status(400).json({ success: false, message: "Checkout expired. Please upload palm image again." });
    }
    if (String(error.message || "").includes("payment_required_before_processing")) {
      return res.status(400).json({ success: false, message: "Payment required before processing" });
    }
    return res.status(500).json({ success: false, message: "Failed to verify payment", error: error.message });
  }
};

const payPalmCheckoutWithWallet = async (req, res) => payPalmOrderWithWallet(req, res);
const createPalmCheckoutRazorpay = async (req, res) => createPalmOrderRazorpay(req, res);
const verifyPalmCheckoutRazorpay = async (req, res) => verifyPalmOrderRazorpay(req, res);

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
    if (order.status !== "paid" && order.status !== "failed") {
      return res.status(400).json({ success: false, message: "This order is not paid yet" });
    }
    const maxRetries = toMaxRetries(order.maxRetries);
    const retriesUsed = Number(order.retriesUsed || 0);
    const remainingRetries = Math.max(0, maxRetries - retriesUsed);

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

    if (remainingRetries <= 0) {
      return res.status(400).json({
        success: false,
        message: "No free retries remaining for this paid request.",
        retry: { maxRetries, retriesUsed, remainingRetries: 0 },
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
      retry: { maxRetries, retriesUsed, remainingRetries },
    });
  } catch (error) {
    if (String(error.message || "").includes("payment_required_before_processing")) {
      return res.status(400).json({ success: false, message: "Payment required before processing" });
    }
    if (String(error.message || "").includes("retry_limit_reached")) {
      return res.status(400).json({ success: false, message: "Free retry limit reached for this report." });
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
    beLog("job_status_fetch", {
      userId,
      jobId: job.id,
      status: job.status,
      stage: job.stage,
      progress: job.progress,
      updatedAt: job.updatedAt,
    });

    // Self-heal: if a paid job is still queued for too long, re-enqueue it.
    if (job.status === "queued") {
      const lastUpdate = new Date(job.updatedAt || job.createdAt || Date.now()).getTime();
      const queuedForMs = Date.now() - lastUpdate;
      if (queuedForMs > 20 * 1000) {
        try {
          await ensureQueuedJob({ userId, palmUploadId: job.palmUploadId });
        } catch (queueError) {
          console.error("[PalmController] queued job re-enqueue failed", {
            jobId: job.id,
            message: queueError?.message,
          });
        }
      }
    }

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
        pdfDownloadUrl: report ? `/palm-reading/reports/${job.palmUploadId}/pdf` : null,
      };
    }
    if (job.status === "failed") {
      const order = await PalmOrder.findOne({
        where: { userId, palmUploadId: job.palmUploadId },
      });
      if (order) {
        const sourceOrder = order.retrySourceOrderId
          ? await PalmOrder.findOne({ where: { id: order.retrySourceOrderId, userId } })
          : null;
        const effectiveOrder = sourceOrder || order;
        const maxRetries = toMaxRetries(effectiveOrder.maxRetries);
        const retriesUsed = Number(effectiveOrder.retriesUsed || 0);
        response.order = {
          id: effectiveOrder.id,
          paymentMethod: order.paymentMethod,
          lastFailureReason: effectiveOrder.lastFailureReason || order.lastFailureReason || null,
          maxRetries,
          retriesUsed,
          remainingRetries: Math.max(0, maxRetries - retriesUsed),
        };
      }
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
            lastFailureReason: item.order.lastFailureReason || null,
            maxRetries: toMaxRetries(item.order.maxRetries),
            retriesUsed: Number(item.order.retriesUsed || 0),
            remainingRetries: Math.max(0, toMaxRetries(item.order.maxRetries) - Number(item.order.retriesUsed || 0)),
          }
        : null,
      report: item.report
        ? {
            structuredInsights: item.report.structuredInsights || {},
            finalNarrative: item.report.finalNarrative || "",
            confidenceScores: item.report.confidenceScores || {},
            pdfDownloadUrl: `/palm-reading/reports/${item.id}/pdf`,
          }
        : null,
      features: item.features?.features || {},
    }));

    return res.status(200).json({ success: true, history });
  } catch (error) {
    return res.status(500).json({ success: false, message: "Failed to fetch palm history", error: error.message });
  }
};

const downloadPalmReadingPdf = async (req, res) => {
  try {
    const userId = req.user.id;
    const { palmUploadId } = req.params;
    const upload = await PalmUpload.findOne({
      where: { id: palmUploadId, userId },
      include: [
        { model: AIJob, as: "aiJob", required: false },
        { model: PalmFeature, as: "features", required: false },
        { model: PalmReport, as: "report", required: true },
      ],
    });

    if (!upload || !upload.report) {
      return res.status(404).json({ success: false, message: "Completed palm report not found" });
    }

    if (upload.aiJob && upload.aiJob.status !== "completed") {
      return res.status(409).json({ success: false, message: "Palm report is still processing" });
    }

    const pdfBuffer = await generatePalmReportPDF({
      palmImages: upload.imageUrls || [],
      features: upload.features?.features || {},
      structuredInsights: upload.report.structuredInsights || {},
      finalNarrative: upload.report.finalNarrative || "",
      generatedAt: upload.report.createdAt || upload.createdAt,
    });

    const fileName = `graho_palmistry_report_${String(palmUploadId).slice(0, 8)}.pdf`;
    res.setHeader("Content-Type", "application/pdf");
    res.setHeader("Content-Disposition", `attachment; filename="${fileName}"`);
    res.setHeader("Content-Length", pdfBuffer.length);
    return res.send(pdfBuffer);
  } catch (error) {
    console.error("[Palm PDF] download failed", {
      userId: req.user?.id,
      palmUploadId: req.params?.palmUploadId,
      message: error?.message,
    });
    return res.status(500).json({ success: false, message: "Failed to generate palm PDF", error: error.message });
  }
};

const getPalmReadingTrustIndicator = async (_req, res) => {
  try {
    const snapshot = getPalmReadingTrustSnapshot();
    return res.status(200).json({
      success: true,
      trustIndicator: {
        count: snapshot.count,
        suffix: "+",
        label: "users received their palm reading today",
      },
      meta: {
        timezone: "Asia/Kolkata",
        dateKey: snapshot.dateKey,
        slotCount: snapshot.slotCount,
      },
    });
  } catch (error) {
    return res.status(500).json({
      success: false,
      message: "Failed to fetch palm trust indicator",
      error: error.message,
    });
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
  downloadPalmReadingPdf,
  getPalmReadingTrustIndicator,
  payPalmCheckoutWithWallet,
  createPalmCheckoutRazorpay,
  verifyPalmCheckoutRazorpay,
};
