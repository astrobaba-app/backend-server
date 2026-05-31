const Razorpay = require("razorpay");
const { Op } = require("sequelize");
const PalmOrder = require("../../model/palm/palmOrder");
const AIJob = require("../../model/palm/aiJob");
const PalmUpload = require("../../model/palm/palmUpload");
const User = require("../../model/user/userAuth");
const { cleanupPalmQueueStaleJobs } = require("../../services/palmQueueService");

const razorpay = new Razorpay({
  key_id: process.env.RAZORPAY_KEY_ID,
  key_secret: process.env.RAZORPAY_KEY_SECRET,
});

const getPalmRefundCandidates = async (req, res) => {
  try {
    const limit = Math.min(100, Math.max(1, Number(req.query.limit || 30)));
    const paymentMethod = String(req.query.paymentMethod || "").trim();
    const refundStatus = String(req.query.refundStatus || "").trim();

    const where = {
      status: "failed",
    };
    if (paymentMethod === "wallet" || paymentMethod === "razorpay") {
      where.paymentMethod = paymentMethod;
    }
    if (refundStatus) {
      where.refundStatus = refundStatus;
    }

    let orders = [];
    try {
      orders = await PalmOrder.findAll({
        where,
        include: [
          { model: PalmUpload, as: "palmUpload", required: false },
          { model: User, as: "user", required: false, attributes: ["id", "fullName", "email"] },
        ],
        order: [["updatedAt", "DESC"]],
        limit,
      });
    } catch (queryError) {
      // Backward compatibility: if refund columns are not migrated yet, fallback gracefully.
      const message = String(queryError?.message || "");
      if (/refundstatus|refundreason|refundprocessedat|refundrazorpayid/i.test(message)) {
        const fallbackWhere = { status: "failed" };
        if (paymentMethod === "wallet" || paymentMethod === "razorpay") {
          fallbackWhere.paymentMethod = paymentMethod;
        }
        orders = await PalmOrder.findAll({
          where: fallbackWhere,
          include: [
            { model: PalmUpload, as: "palmUpload", required: false },
            { model: User, as: "user", required: false, attributes: ["id", "fullName", "email"] },
          ],
          order: [["updatedAt", "DESC"]],
          limit,
        });
      } else {
        throw queryError;
      }
    }

    const palmUploadIds = orders.map((o) => o.palmUploadId).filter(Boolean);
    const jobs = await AIJob.findAll({ where: { palmUploadId: palmUploadIds } });
    const jobByUploadId = new Map(jobs.map((j) => [j.palmUploadId, j]));

    const items = orders.map((order) => {
      const job = jobByUploadId.get(order.palmUploadId);
      return {
        orderId: order.id,
        amount: order.amount,
        paymentMethod: order.paymentMethod,
        status: order.status,
        refundStatus: order.refundStatus || "none",
        refundReason: order.refundReason || null,
        refundProcessedAt: order.refundProcessedAt || null,
        razorpayPaymentId: order.razorpayPaymentId || null,
        createdAt: order.createdAt,
        updatedAt: order.updatedAt,
        job: job
          ? {
              id: job.id,
              status: job.status,
              stage: job.stage,
              error: job.error,
              stageMessage: job.stageMessage,
            }
          : null,
        user: order.user
          ? {
              id: order.user.id,
              name: order.user.fullName,
              email: order.user.email,
            }
          : null,
      };
    });

    return res.status(200).json({ success: true, items });
  } catch (error) {
    return res.status(500).json({ success: false, message: "Failed to load palm refund candidates", error: error.message });
  }
};

const processPalmRazorpayRefund = async (req, res) => {
  try {
    const { orderId } = req.params;
    const order = await PalmOrder.findByPk(orderId);
    if (!order) return res.status(404).json({ success: false, message: "Palm order not found" });
    if (order.paymentMethod !== "razorpay") {
      return res.status(400).json({ success: false, message: "This order is not paid via Razorpay" });
    }
    if (order.refundStatus === "completed") {
      return res.status(200).json({ success: true, alreadyRefunded: true, orderId: order.id, refundRazorpayId: order.refundRazorpayId || null });
    }
    if (!order.razorpayPaymentId) {
      return res.status(400).json({ success: false, message: "Missing Razorpay payment id for this order" });
    }

    await order.update({ refundStatus: "processing", refundReason: order.refundReason || "quality_rejected" });

    const refund = await razorpay.payments.refund(order.razorpayPaymentId, {
      amount: Math.round(Number(order.amount || 0) * 100),
      notes: {
        source: "admin_palm_refund",
        palmOrderId: order.id,
      },
    });

    await order.update({
      refundStatus: "completed",
      refundProcessedAt: new Date(),
      refundRazorpayId: refund?.id || null,
    });

    return res.status(200).json({
      success: true,
      orderId: order.id,
      refundStatus: "completed",
      refundRazorpayId: refund?.id || null,
    });
  } catch (error) {
    const orderId = req.params?.orderId;
    if (orderId) {
      try {
        const order = await PalmOrder.findByPk(orderId);
        if (order) {
          await order.update({ refundStatus: "failed" });
        }
      } catch {
        // ignore secondary update failures
      }
    }
    return res.status(500).json({ success: false, message: "Failed to process Razorpay refund", error: error.message });
  }
};

const cleanupPalmQueue = async (_req, res) => {
  try {
    const result = await cleanupPalmQueueStaleJobs();
    return res.status(200).json({ success: true, ...result });
  } catch (error) {
    return res.status(500).json({ success: false, message: "Failed to cleanup palm queue", error: error.message });
  }
};

module.exports = {
  getPalmRefundCandidates,
  processPalmRazorpayRefund,
  cleanupPalmQueue,
};
