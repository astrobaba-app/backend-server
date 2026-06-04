const PalmOrder = require("../../model/palm/palmOrder");
const AIJob = require("../../model/palm/aiJob");
const PalmUpload = require("../../model/palm/palmUpload");
const User = require("../../model/user/userAuth");
const { cleanupPalmQueueStaleJobs } = require("../../services/palmQueueService");

const getPalmFailureCandidates = async (req, res) => {
  try {
    const limit = Math.min(100, Math.max(1, Number(req.query.limit || 30)));
    const statusFilter = String(req.query.status || "all").trim().toLowerCase();

    const where = {};
    if (statusFilter === "failed") where.status = "failed";
    if (statusFilter === "paid") where.status = "paid";

    let orders = [];
    try {
      orders = await PalmOrder.findAll({
        where,
        include: [
          { model: PalmUpload, as: "palmUpload", required: false },
          { model: User, as: "user", required: false, attributes: ["id", "fullName", "email", "mobile"] },
        ],
        order: [["updatedAt", "DESC"]],
        limit,
      });
    } catch (queryError) {
      const message = String(queryError?.message || "");
      if (/maxretries|retriesused|lastfailurereason|retryexhaustedat/i.test(message)) {
        orders = await PalmOrder.findAll({
          where,
          include: [
            { model: PalmUpload, as: "palmUpload", required: false },
            { model: User, as: "user", required: false, attributes: ["id", "fullName", "email", "mobile"] },
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
      const maxRetries = Number(order.maxRetries || 3);
      const retriesUsed = Number(order.retriesUsed || 0);
      return {
        orderId: order.id,
        amount: order.amount,
        paymentMethod: order.paymentMethod,
        orderStatus: order.status,
        createdAt: order.createdAt,
        updatedAt: order.updatedAt,
        lastFailureReason: order.lastFailureReason || null,
        retry: {
          maxRetries,
          retriesUsed,
          remainingRetries: Math.max(0, maxRetries - retriesUsed),
        },
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
              mobile: order.user.mobile || null,
            }
          : null,
      };
    });

    return res.status(200).json({ success: true, items });
  } catch (error) {
    return res.status(500).json({ success: false, message: "Failed to load palm analysis items", error: error.message });
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
  getPalmFailureCandidates,
  cleanupPalmQueue,
};
