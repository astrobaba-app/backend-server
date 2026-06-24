const crypto = require("crypto");
const Razorpay = require("razorpay");
const { sequelize } = require("../../dbConnection/dbConfig");
const Wallet = require("../../model/wallet/wallet");
const WalletTransaction = require("../../model/wallet/walletTransaction");
const ReportPurchase = require("../../model/report/reportPurchase");
const {
  getReportPurchaseConfig,
  getActiveReportPurchase,
  normalizeReportType,
} = require("../../services/reportPurchaseService");

const razorpay = new Razorpay({
  key_id: process.env.RAZORPAY_KEY_ID,
  key_secret: process.env.RAZORPAY_KEY_SECRET,
});

const toAmount = (value) => {
  const parsed = Number(value || 0);
  return Number.isFinite(parsed) ? Math.round(parsed * 100) / 100 : 0;
};

const buildPurchaseResponse = (purchase, config) => ({
  id: purchase.id,
  reportType: purchase.reportType,
  amount: toAmount(purchase.amount),
  currency: purchase.currency,
  status: purchase.status,
  paymentMethod: purchase.paymentMethod,
  accessToken: purchase.accessToken,
  redirectPath: config.redirectPath,
  createdAt: purchase.createdAt,
});

const getReportAccess = async (req, res) => {
  try {
    const userId = req.user.id;
    const config = getReportPurchaseConfig(req.query.reportType);
    const purchase = await getActiveReportPurchase({
      userId,
      reportType: config.reportType,
      accessToken: req.query.accessToken || null,
    });

    return res.status(200).json({
      success: true,
      hasAccess: Boolean(purchase),
      config,
      purchase: purchase ? buildPurchaseResponse(purchase, config) : null,
    });
  } catch (error) {
    return res.status(error.statusCode || 500).json({
      success: false,
      message: error.message || "Failed to check report access",
    });
  }
};

const payReportWithWallet = async (req, res) => {
  const tx = await sequelize.transaction();
  try {
    const userId = req.user.id;
    const config = getReportPurchaseConfig(req.body.reportType);
    const amount = toAmount(config.amount);

    const wallet = await Wallet.findOne({ where: { userId }, transaction: tx });
    if (!wallet) {
      await tx.rollback();
      return res.status(404).json({ success: false, message: "Wallet not found" });
    }

    const currentBalance = toAmount(wallet.balance);
    if (currentBalance < amount) {
      await tx.rollback();
      return res.status(400).json({
        success: false,
        message: `Insufficient wallet balance. Required: Rs. ${amount}, Available: Rs. ${currentBalance}.`,
        currentBalance,
        requiredAmount: amount,
      });
    }

    const nextBalance = toAmount(currentBalance - amount);
    await wallet.update(
      {
        balance: nextBalance,
        totalSpent: toAmount(Number(wallet.totalSpent || 0) + amount),
      },
      { transaction: tx }
    );

    const walletTransaction = await WalletTransaction.create(
      {
        userId,
        walletId: wallet.id,
        amount,
        type: "debit",
        status: "completed",
        paymentMethod: "manual",
        description: `${config.label} purchase`,
        balanceBefore: currentBalance,
        balanceAfter: nextBalance,
        metadata: {
          reportType: config.reportType,
          purchaseSource: "report_unlock",
        },
      },
      { transaction: tx }
    );

    const purchase = await ReportPurchase.create(
      {
        userId,
        reportType: config.reportType,
        amount,
        currency: "INR",
        status: "paid",
        paymentMethod: "wallet",
        walletTransactionId: walletTransaction.id,
        metadata: {
          label: config.label,
          walletBalanceBefore: currentBalance,
          walletBalanceAfter: nextBalance,
        },
      },
      { transaction: tx }
    );

    await tx.commit();

    console.log("[ReportPurchase][Wallet] paid", {
      userId,
      reportType: config.reportType,
      purchaseId: purchase.id,
      amount,
    });

    return res.status(200).json({
      success: true,
      message: "Report unlocked with wallet",
      purchase: buildPurchaseResponse(purchase, config),
    });
  } catch (error) {
    await tx.rollback();
    console.error("[ReportPurchase][Wallet] error", error);
    return res.status(error.statusCode || 500).json({
      success: false,
      message: error.message || "Failed to unlock report with wallet",
    });
  }
};

const createReportRazorpayOrder = async (req, res) => {
  try {
    const userId = req.user.id;
    const config = getReportPurchaseConfig(req.body.reportType);
    const amount = toAmount(config.amount);
    const receipt = `rpt_${config.reportType}_${Date.now().toString().slice(-8)}`;

    const razorpayOrder = await razorpay.orders.create({
      amount: Math.round(amount * 100),
      currency: "INR",
      receipt,
      notes: {
        userId,
        reportType: config.reportType,
        purpose: "report_purchase",
      },
    });

    const purchase = await ReportPurchase.create({
      userId,
      reportType: config.reportType,
      amount,
      currency: "INR",
      status: "pending",
      paymentMethod: "razorpay",
      razorpayOrderId: razorpayOrder.id,
      metadata: {
        label: config.label,
        receipt,
      },
    });

    return res.status(200).json({
      success: true,
      purchaseId: purchase.id,
      razorpayOrderId: razorpayOrder.id,
      amountInPaise: razorpayOrder.amount,
      currency: razorpayOrder.currency,
      key: process.env.RAZORPAY_KEY_ID,
      config,
    });
  } catch (error) {
    console.error("[ReportPurchase][RazorpayCreate] error", error);
    return res.status(error.statusCode || 500).json({
      success: false,
      message: error.message || "Failed to create payment order",
    });
  }
};

const verifyReportRazorpayPayment = async (req, res) => {
  const tx = await sequelize.transaction();
  try {
    const userId = req.user.id;
    const {
      reportType,
      purchaseId,
      razorpay_order_id,
      razorpay_payment_id,
      razorpay_signature,
    } = req.body;
    const config = getReportPurchaseConfig(reportType);

    const expectedSignature = crypto
      .createHmac("sha256", process.env.RAZORPAY_KEY_SECRET)
      .update(`${razorpay_order_id}|${razorpay_payment_id}`)
      .digest("hex");

    if (expectedSignature !== razorpay_signature) {
      await tx.rollback();
      return res.status(400).json({ success: false, message: "Invalid payment signature" });
    }

    const purchase = await ReportPurchase.findOne({
      where: {
        id: purchaseId,
        userId,
        reportType: normalizeReportType(reportType),
        razorpayOrderId: razorpay_order_id,
      },
      transaction: tx,
    });

    if (!purchase) {
      await tx.rollback();
      return res.status(404).json({ success: false, message: "Payment record not found" });
    }

    await purchase.update(
      {
        status: "paid",
        razorpayPaymentId: razorpay_payment_id,
        razorpaySignature: razorpay_signature,
        metadata: {
          ...(purchase.metadata || {}),
          verifiedAt: new Date().toISOString(),
        },
      },
      { transaction: tx }
    );

    await tx.commit();

    console.log("[ReportPurchase][RazorpayVerify] paid", {
      userId,
      reportType: config.reportType,
      purchaseId: purchase.id,
      razorpayOrderId: razorpay_order_id,
    });

    return res.status(200).json({
      success: true,
      message: "Report unlocked with online payment",
      purchase: buildPurchaseResponse(purchase, config),
    });
  } catch (error) {
    await tx.rollback();
    console.error("[ReportPurchase][RazorpayVerify] error", error);
    return res.status(error.statusCode || 500).json({
      success: false,
      message: error.message || "Failed to verify payment",
    });
  }
};

const recoverReportRazorpayPayment = async (req, res) => {
  const tx = await sequelize.transaction();
  try {
    const userId = req.user.id;
    const { reportType, purchaseId, razorpayOrderId } = req.body;
    const config = getReportPurchaseConfig(reportType);

    const purchase = await ReportPurchase.findOne({
      where: {
        id: purchaseId,
        userId,
        reportType: normalizeReportType(reportType),
        razorpayOrderId,
      },
      transaction: tx,
    });

    if (!purchase) {
      await tx.rollback();
      return res.status(404).json({ success: false, message: "Payment record not found" });
    }

    if (purchase.status === "paid") {
      await tx.commit();
      return res.status(200).json({
        success: true,
        recovered: true,
        message: "Report payment already verified",
        purchase: buildPurchaseResponse(purchase, config),
      });
    }

    const paymentList = await razorpay.orders.fetchPayments(razorpayOrderId);
    const paidPayment = (paymentList.items || []).find((payment) => {
      const status = String(payment.status || "").toLowerCase();
      return status === "captured" || status === "authorized";
    });

    if (!paidPayment) {
      await tx.rollback();
      return res.status(402).json({
        success: false,
        recovered: false,
        message: "No successful payment found for this report order yet.",
      });
    }

    const expectedAmountInPaise = Math.round(toAmount(purchase.amount) * 100);
    if (Number(paidPayment.amount || 0) !== expectedAmountInPaise) {
      await tx.rollback();
      return res.status(400).json({
        success: false,
        recovered: false,
        message: "Payment amount does not match this report order.",
      });
    }

    await purchase.update(
      {
        status: "paid",
        razorpayPaymentId: paidPayment.id,
        metadata: {
          ...(purchase.metadata || {}),
          recoveredAt: new Date().toISOString(),
          recoveredPaymentStatus: paidPayment.status,
        },
      },
      { transaction: tx }
    );

    await tx.commit();

    console.log("[ReportPurchase][RazorpayRecover] paid", {
      userId,
      reportType: config.reportType,
      purchaseId: purchase.id,
      razorpayOrderId,
      razorpayPaymentId: paidPayment.id,
    });

    return res.status(200).json({
      success: true,
      recovered: true,
      message: "Report payment recovered successfully",
      purchase: buildPurchaseResponse(purchase, config),
    });
  } catch (error) {
    await tx.rollback();
    console.error("[ReportPurchase][RazorpayRecover] error", error);
    return res.status(error.statusCode || 500).json({
      success: false,
      recovered: false,
      message: error.message || "Failed to recover report payment",
    });
  }
};

module.exports = {
  getReportAccess,
  payReportWithWallet,
  createReportRazorpayOrder,
  verifyReportRazorpayPayment,
  recoverReportRazorpayPayment,
};
