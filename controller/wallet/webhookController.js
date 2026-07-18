const WalletTransaction = require("../../model/wallet/walletTransaction");
const Wallet = require("../../model/wallet/wallet");
const crypto = require("crypto");

/**
 * Handle Razorpay webhook events
 * @route POST /api/wallet/webhook
 */
const handleWebhook = async (req, res) => {
  try {
    const webhookSignature = req.headers["x-razorpay-signature"];
    const webhookBody = JSON.stringify(req.body);



    // Verify webhook signature
    const expectedSignature = crypto
      .createHmac("sha256", process.env.RAZORPAY_WEBHOOK_SECRET)
      .update(webhookBody)
      .digest("hex");



    if (webhookSignature !== expectedSignature) {
      console.error("=== WEBHOOK SIGNATURE INVALID ===");
      console.error("Invalid webhook signature");
      return res.status(400).json({
        success: false,
        message: "Invalid signature",
      });
    }

    const event = req.body.event;
    const payload = req.body.payload;



    switch (event) {
      case "payment.captured":
      case "qr_code.credited":
        await handlePaymentCaptured(payload.payment?.entity || payload.qr_code?.entity);
        break;

      case "payment.failed":
        await handlePaymentFailed(payload.payment.entity);
        break;

      case "order.paid":
        await handleOrderPaid(payload.order.entity, payload.payment.entity);
        break;

      default:
        console.log("Unhandled webhook event:", event);
    }

    res.status(200).json({ success: true });
  } catch (error) {
    console.error("Webhook error:", error);
    res.status(500).json({
      success: false,
      message: "Webhook processing failed",
      error: error.message,
    });
  }
};

const toAmount = (value) => {
  const parsed = parseFloat(value ?? 0);
  return Number.isFinite(parsed) ? parsed : 0;
};

const roundMoney = (value) => Math.round(toAmount(value) * 100) / 100;

/**
 * Handle successful payment capture
 */
const handlePaymentCaptured = async (payment) => {
  const sequelize = require("../../dbConnection/dbConfig").sequelize;
  const CouponUsage = require("../../model/coupon/couponUsage");
  const Coupon = require("../../model/coupon/coupon");
  const { queueWalletCohortRefresh } = require("../../services/walletCohortService");
  let dbTransaction;
  
  try {
    const transaction = await WalletTransaction.findOne({
      where: { razorpayOrderId: payment.order_id },
    });

    if (!transaction) {
      console.error(`Transaction not found for order: ${payment.order_id}`);
      return;
    }

    // Idempotency check - skip if already processed
    if (transaction.status === "completed") {
      queueWalletCohortRefresh(transaction.userId, "webhook_idempotent");
      return;
    }

    const wallet = await Wallet.findOne({ where: { id: transaction.walletId } });

    if (!wallet) {
      console.error(`Wallet not found: ${transaction.walletId}`);
      return;
    }

    // Start database transaction for atomicity
    dbTransaction = await sequelize.transaction();

    // Update wallet balance with safe rounding to prevent float precision drift
    const newBalance = roundMoney(toAmount(wallet.balance) + toAmount(transaction.amount));
    const newTotalRecharge = roundMoney(toAmount(wallet.totalRecharge) + toAmount(transaction.amount));

    await wallet.update({
      balance: newBalance,
      totalRecharge: newTotalRecharge,
    }, { transaction: dbTransaction });

    // Update transaction
    await transaction.update({
      status: "completed",
      razorpayPaymentId: payment.id,
      balanceAfter: newBalance,
      metadata: {
        ...transaction.metadata,
        capturedAt: new Date().toISOString(),
        paymentMethod: payment.method,
        email: payment.email,
        contact: payment.contact,
      },
    }, { transaction: dbTransaction });

    // Update coupon usage if exists
    const couponUsage = await CouponUsage.findOne({
      where: {
        orderId: payment.order_id,
        userId: transaction.userId,
        status: "pending",
      },
    });

    if (couponUsage) {
      await couponUsage.update({ status: "success" }, { transaction: dbTransaction });
      const coupon = await Coupon.findByPk(couponUsage.couponId);
      if (coupon) {
        await coupon.update({ usageCount: coupon.usageCount + 1 }, { transaction: dbTransaction });
      }
    }

    await dbTransaction.commit();
    queueWalletCohortRefresh(transaction.userId, "webhook_captured");
  } catch (error) {
    if (dbTransaction) {
      await dbTransaction.rollback();
    }
    console.error("Error handling payment captured:", error);
  }
};

/**
 * Handle failed payment
 */
const handlePaymentFailed = async (payment) => {
  const CouponUsage = require("../../model/coupon/couponUsage");
  try {
    const transaction = await WalletTransaction.findOne({
      where: { razorpayOrderId: payment.order_id },
    });

    if (!transaction) {
      console.error(`Transaction not found for order: ${payment.order_id}`);
      return;
    }

    // Skip if already processed
    if (transaction.status !== "pending") {
      return;
    }

    await transaction.update({
      status: "failed",
      razorpayPaymentId: payment.id,
      metadata: {
        ...transaction.metadata,
        failedAt: new Date().toISOString(),
        errorCode: payment.error_code,
        errorDescription: payment.error_description,
        errorReason: payment.error_reason,
      },
    });

    const couponUsage = await CouponUsage.findOne({
      where: {
        orderId: payment.order_id,
        status: "pending",
      },
    });

    if (couponUsage) {
      await couponUsage.update({ status: "failed" });
    }
  } catch (error) {
    console.error("Error handling payment failed:", error);
  }
};

/**
 * Handle order paid event
 */
const handleOrderPaid = async (order, payment) => {
  try {
    if (payment) {
      await handlePaymentCaptured(payment);
    }
  } catch (error) {
    console.error("Error handling order paid:", error);
  }
};

module.exports = {
  handleWebhook,
};
