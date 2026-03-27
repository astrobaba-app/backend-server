const { Op } = require("sequelize");
const { sequelize } = require("../../dbConnection/dbConfig");
const AstrologerEarning = require("../../model/astrologer/astrologerEarning");
const AstrologerPayoutRequest = require("../../model/astrologer/astrologerPayoutRequest");
const ChatSession = require("../../model/chat/chatSession");
const User = require("../../model/user/userAuth");

const PLATFORM_FEE_PERCENTAGE = 10;

const toNumber = (value) => {
  const parsed = parseFloat(value);
  return Number.isFinite(parsed) ? parsed : 0;
};

const getAstrologerEarningsDashboard = async (req, res) => {
  try {
    const astrologerId = req.user.id;
    const page = Math.max(1, parseInt(req.query.page, 10) || 1);
    const limit = Math.min(100, Math.max(1, parseInt(req.query.limit, 10) || 20));
    const offset = (page - 1) * limit;

    const where = { astrologerId };
    if (req.query.paymentStatus) {
      where.paymentStatus = req.query.paymentStatus;
    }
    if (req.query.consultationType) {
      where.consultationType = req.query.consultationType;
    }

    const { rows, count } = await AstrologerEarning.findAndCountAll({
      where,
      limit,
      offset,
      order: [["sessionEndTime", "DESC"], ["createdAt", "DESC"]],
      include: [
        {
          model: User,
          as: "user",
          attributes: ["id", "fullName", "email"],
        },
      ],
    });

    const allEarnings = await AstrologerEarning.findAll({
      where: { astrologerId },
      attributes: [
        "consultationType",
        "paymentStatus",
        "totalAmount",
        "platformCommission",
        "netEarning",
      ],
      raw: true,
    });

    const summary = allEarnings.reduce(
      (acc, earning) => {
        const gross = toNumber(earning.totalAmount);
        const fee = toNumber(earning.platformCommission);
        const net = toNumber(earning.netEarning);
        const paymentStatus = earning.paymentStatus;
        const consultationType = earning.consultationType || "chat";

        acc.totalGrossEarning += gross;
        acc.totalPlatformFee += fee;
        acc.lifetimeNetEarning += net;

        if (paymentStatus === "completed") {
          acc.totalPaidOut += net;
        }

        if (paymentStatus === "pending") {
          acc.availableForPayout += net;
        }

        if (paymentStatus === "processing") {
          acc.processingPayoutAmount += net;
        }

        if (paymentStatus === "pending" || paymentStatus === "processing") {
          acc.totalNetEarning += net;

          if (consultationType === "chat") acc.totalChatEarning += net;
          if (consultationType === "voice_call") acc.totalVoiceCallEarning += net;
          if (consultationType === "video_call") acc.totalVideoCallEarning += net;
        }

        return acc;
      },
      {
        totalGrossEarning: 0,
        totalPlatformFee: 0,
        lifetimeNetEarning: 0,
        totalNetEarning: 0,
        totalChatEarning: 0,
        totalVoiceCallEarning: 0,
        totalVideoCallEarning: 0,
        totalPaidOut: 0,
        availableForPayout: 0,
        processingPayoutAmount: 0,
      }
    );

    const activeChatSessions = await ChatSession.findAll({
      where: {
        astrologerId,
        status: "active",
        requestStatus: "approved",
      },
      attributes: ["startTime", "pricePerMinute"],
    });

    const now = Date.now();
    const ongoingChatGross = activeChatSessions.reduce((sum, session) => {
      const startedAt = session.startTime ? new Date(session.startTime).getTime() : now;
      const minutes = Math.max(1, Math.ceil((now - startedAt) / (1000 * 60)));
      const pricePerMinute = toNumber(session.pricePerMinute);
      return sum + minutes * pricePerMinute;
    }, 0);
    const ongoingChatEarning = ongoingChatGross * ((100 - PLATFORM_FEE_PERCENTAGE) / 100);

    const activePayoutRequest = await AstrologerPayoutRequest.findOne({
      where: {
        astrologerId,
        status: {
          [Op.in]: ["requested", "processing"],
        },
      },
      order: [["createdAt", "DESC"]],
    });

    res.status(200).json({
      success: true,
      summary: {
        totalGrossEarning: toNumber(summary.totalGrossEarning.toFixed(2)),
        totalPlatformFee: toNumber(summary.totalPlatformFee.toFixed(2)),
        totalNetEarning: toNumber(summary.totalNetEarning.toFixed(2)),
        lifetimeNetEarning: toNumber(summary.lifetimeNetEarning.toFixed(2)),
        totalChatEarning: toNumber(summary.totalChatEarning.toFixed(2)),
        totalVoiceCallEarning: toNumber(summary.totalVoiceCallEarning.toFixed(2)),
        totalVideoCallEarning: toNumber(summary.totalVideoCallEarning.toFixed(2)),
        ongoingChatEarning: toNumber(ongoingChatEarning.toFixed(2)),
        totalPaidOut: toNumber(summary.totalPaidOut.toFixed(2)),
        availableForPayout: toNumber(summary.availableForPayout.toFixed(2)),
        processingPayoutAmount: toNumber(summary.processingPayoutAmount.toFixed(2)),
        platformFeePercentage: PLATFORM_FEE_PERCENTAGE,
      },
      activePayoutRequest,
      earnings: rows,
      pagination: {
        total: count,
        page,
        limit,
        totalPages: Math.ceil(count / limit),
      },
    });
  } catch (error) {
    console.error("Get astrologer earnings dashboard error:", error);
    res.status(500).json({
      success: false,
      message: "Failed to fetch earning dashboard",
      error: error.message,
    });
  }
};

const createPayoutRequest = async (req, res) => {
  const transaction = await sequelize.transaction();

  try {
    const astrologerId = req.user.id;

    const existingOpenRequest = await AstrologerPayoutRequest.findOne({
      where: {
        astrologerId,
        status: {
          [Op.in]: ["requested", "processing"],
        },
      },
      transaction,
      lock: transaction.LOCK.UPDATE,
    });

    if (existingOpenRequest) {
      await transaction.rollback();
      return res.status(409).json({
        success: false,
        message: "You already have an active payout request",
        payoutRequest: existingOpenRequest,
      });
    }

    const pendingEarnings = await AstrologerEarning.findAll({
      where: {
        astrologerId,
        paymentStatus: "pending",
      },
      transaction,
      lock: transaction.LOCK.UPDATE,
      order: [["createdAt", "ASC"]],
    });

    if (!pendingEarnings.length) {
      await transaction.rollback();
      return res.status(400).json({
        success: false,
        message: "No pending earnings available for payout",
      });
    }

    const earningIds = pendingEarnings.map((earning) => earning.id);
    const requestedAmount = pendingEarnings.reduce((sum, earning) => sum + toNumber(earning.netEarning), 0);

    const breakdown = {
      chat: 0,
      voice_call: 0,
      video_call: 0,
      live: 0,
    };

    pendingEarnings.forEach((earning) => {
      const key = earning.consultationType || "chat";
      if (Object.prototype.hasOwnProperty.call(breakdown, key)) {
        breakdown[key] += toNumber(earning.netEarning);
      }
    });

    const payoutRequest = await AstrologerPayoutRequest.create(
      {
        astrologerId,
        requestedAmount,
        status: "requested",
        earningIds,
        snapshot: {
          payoutAt: new Date().toISOString(),
          totalSessions: pendingEarnings.length,
          breakdown,
          platformFeePercentage: PLATFORM_FEE_PERCENTAGE,
        },
      },
      { transaction }
    );

    await AstrologerEarning.update(
      {
        paymentStatus: "processing",
      },
      {
        where: {
          id: {
            [Op.in]: earningIds,
          },
        },
        transaction,
      }
    );

    await transaction.commit();

    res.status(201).json({
      success: true,
      message: "Payout request submitted successfully",
      payoutRequest,
    });
  } catch (error) {
    await transaction.rollback();
    console.error("Create payout request error:", error);
    res.status(500).json({
      success: false,
      message: "Failed to create payout request",
      error: error.message,
    });
  }
};

const getMyPayoutRequests = async (req, res) => {
  try {
    const astrologerId = req.user.id;
    const page = Math.max(1, parseInt(req.query.page, 10) || 1);
    const limit = Math.min(100, Math.max(1, parseInt(req.query.limit, 10) || 20));
    const offset = (page - 1) * limit;

    const where = { astrologerId };
    if (req.query.status) {
      where.status = req.query.status;
    }

    const { rows, count } = await AstrologerPayoutRequest.findAndCountAll({
      where,
      limit,
      offset,
      order: [["createdAt", "DESC"]],
    });

    res.status(200).json({
      success: true,
      payoutRequests: rows,
      pagination: {
        total: count,
        page,
        limit,
        totalPages: Math.ceil(count / limit),
      },
    });
  } catch (error) {
    console.error("Get payout requests error:", error);
    res.status(500).json({
      success: false,
      message: "Failed to fetch payout requests",
      error: error.message,
    });
  }
};

module.exports = {
  getAstrologerEarningsDashboard,
  createPayoutRequest,
  getMyPayoutRequests,
};
