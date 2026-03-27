const { Op } = require("sequelize");
const { sequelize } = require("../../dbConnection/dbConfig");
const Astrologer = require("../../model/astrologer/astrologer");
const AstrologerEarning = require("../../model/astrologer/astrologerEarning");
const AstrologerPayoutRequest = require("../../model/astrologer/astrologerPayoutRequest");

const getAstrologerPayoutRequests = async (req, res) => {
  try {
    const page = Math.max(1, parseInt(req.query.page, 10) || 1);
    const limit = Math.min(100, Math.max(1, parseInt(req.query.limit, 10) || 20));
    const offset = (page - 1) * limit;

    const where = {};
    if (req.query.status) {
      where.status = req.query.status;
    }

    const { rows, count } = await AstrologerPayoutRequest.findAndCountAll({
      where,
      include: [
        {
          model: Astrologer,
          as: "astrologer",
          attributes: [
            "id",
            "fullName",
            "email",
            "phoneNumber",
            "photo",
            "dateOfBirth",
            "gender",
            "languages",
            "skills",
            "categories",
            "yearsOfExperience",
            "bio",
            "rating",
            "totalConsultations",
            "pricePerMinute",
            "availability",
            "isApproved",
            "isActive",
            "isOnline",
            "createdAt",
          ],
        },
      ],
      order: [["createdAt", "DESC"]],
      limit,
      offset,
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
    console.error("Get admin payout requests error:", error);
    res.status(500).json({
      success: false,
      message: "Failed to fetch payout requests",
      error: error.message,
    });
  }
};

const markPayoutRequestPaid = async (req, res) => {
  const transaction = await sequelize.transaction();

  try {
    const { payoutRequestId } = req.params;
    const { paymentMethod, transactionId, notes } = req.body;

    const payoutRequest = await AstrologerPayoutRequest.findByPk(payoutRequestId, {
      transaction,
      lock: transaction.LOCK.UPDATE,
    });

    if (!payoutRequest) {
      await transaction.rollback();
      return res.status(404).json({
        success: false,
        message: "Payout request not found",
      });
    }

    if (!["requested", "processing"].includes(payoutRequest.status)) {
      await transaction.rollback();
      return res.status(400).json({
        success: false,
        message: "Only requested or processing payouts can be marked as paid",
      });
    }

    const earningIds = Array.isArray(payoutRequest.earningIds) ? payoutRequest.earningIds : [];

    if (earningIds.length > 0) {
      await AstrologerEarning.update(
        {
          paymentStatus: "completed",
          paidAt: new Date(),
          paymentMethod: paymentMethod || null,
          transactionId: transactionId || null,
          notes: notes || null,
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
    }

    await payoutRequest.update(
      {
        status: "paid",
        processedAt: new Date(),
        processedByAdminId: req.user.id,
        paymentMethod: paymentMethod || null,
        transactionId: transactionId || null,
        notes: notes || null,
      },
      { transaction }
    );

    await transaction.commit();

    res.status(200).json({
      success: true,
      message: "Payout marked as paid",
      payoutRequest,
    });
  } catch (error) {
    await transaction.rollback();
    console.error("Mark payout paid error:", error);
    res.status(500).json({
      success: false,
      message: "Failed to mark payout as paid",
      error: error.message,
    });
  }
};

const rejectPayoutRequest = async (req, res) => {
  const transaction = await sequelize.transaction();

  try {
    const { payoutRequestId } = req.params;
    const { notes } = req.body;

    const payoutRequest = await AstrologerPayoutRequest.findByPk(payoutRequestId, {
      transaction,
      lock: transaction.LOCK.UPDATE,
    });

    if (!payoutRequest) {
      await transaction.rollback();
      return res.status(404).json({
        success: false,
        message: "Payout request not found",
      });
    }

    if (!["requested", "processing"].includes(payoutRequest.status)) {
      await transaction.rollback();
      return res.status(400).json({
        success: false,
        message: "Only requested or processing payouts can be rejected",
      });
    }

    const earningIds = Array.isArray(payoutRequest.earningIds) ? payoutRequest.earningIds : [];

    if (earningIds.length > 0) {
      await AstrologerEarning.update(
        {
          paymentStatus: "pending",
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
    }

    await payoutRequest.update(
      {
        status: "rejected",
        processedAt: new Date(),
        processedByAdminId: req.user.id,
        notes: notes || null,
      },
      { transaction }
    );

    await transaction.commit();

    res.status(200).json({
      success: true,
      message: "Payout request rejected",
      payoutRequest,
    });
  } catch (error) {
    await transaction.rollback();
    console.error("Reject payout request error:", error);
    res.status(500).json({
      success: false,
      message: "Failed to reject payout request",
      error: error.message,
    });
  }
};

module.exports = {
  getAstrologerPayoutRequests,
  markPayoutRequestPaid,
  rejectPayoutRequest,
};
