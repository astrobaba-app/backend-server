const { Op } = require("sequelize");
const WalletTransaction = require("../../model/wallet/walletTransaction");
const User = require("../../model/user/userAuth");

const getPlatformRazorpayTransactions = async (req, res) => {
  try {
    const page = Math.max(1, Number(req.query.page || 1));
    const limit = Math.min(200, Math.max(1, Number(req.query.limit || 50)));
    const offset = (page - 1) * limit;
    const status = String(req.query.status || "").trim();
    const type = String(req.query.type || "").trim();
    const q = String(req.query.q || "").trim();
    const dateFrom = String(req.query.dateFrom || "").trim();
    const dateTo = String(req.query.dateTo || "").trim();

    const where = {
      paymentMethod: "razorpay",
    };

    if (status) where.status = status;
    if (type) where.type = type;

    if (dateFrom || dateTo) {
      where.createdAt = {};
      if (dateFrom) where.createdAt[Op.gte] = new Date(dateFrom);
      if (dateTo) where.createdAt[Op.lte] = new Date(dateTo);
    }

    if (q) {
      where[Op.or] = [
        { razorpayOrderId: { [Op.iLike]: `%${q}%` } },
        { razorpayPaymentId: { [Op.iLike]: `%${q}%` } },
        { description: { [Op.iLike]: `%${q}%` } },
      ];
    }

    const { rows, count } = await WalletTransaction.findAndCountAll({
      where,
      include: [
        {
          model: User,
          as: "user",
          required: false,
          attributes: ["id", "fullName", "email", "mobile"],
        },
      ],
      order: [["createdAt", "DESC"]],
      limit,
      offset,
    });

    const transactions = rows.map((tx) => ({
      id: tx.id,
      amount: Number(tx.amount || 0),
      type: tx.type,
      status: tx.status,
      paymentMethod: tx.paymentMethod,
      description: tx.description || "",
      razorpayOrderId: tx.razorpayOrderId || null,
      razorpayPaymentId: tx.razorpayPaymentId || null,
      createdAt: tx.createdAt,
      updatedAt: tx.updatedAt,
      balanceBefore: tx.balanceBefore,
      balanceAfter: tx.balanceAfter,
      user: tx.user
        ? {
            id: tx.user.id,
            name: tx.user.fullName || null,
            email: tx.user.email || null,
            mobile: tx.user.mobile || null,
          }
        : null,
    }));

    return res.status(200).json({
      success: true,
      transactions,
      pagination: {
        total: count,
        page,
        limit,
        totalPages: Math.ceil(count / limit),
      },
    });
  } catch (error) {
    console.error("Get platform razorpay transactions error:", error);
    return res.status(500).json({
      success: false,
      message: "Failed to fetch platform transactions",
      error: error.message,
    });
  }
};

module.exports = { getPlatformRazorpayTransactions };

