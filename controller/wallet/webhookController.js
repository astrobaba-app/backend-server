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

    console.log('=== WEBHOOK RECEIVED ===');
    console.log('Event:', req.body.event);
    console.log('Timestamp:', new Date().toISOString());

    // Verify webhook signature
    const expectedSignature = crypto
      .createHmac("sha256", process.env.RAZORPAY_WEBHOOK_SECRET)
      .update(webhookBody)
      .digest("hex");

    console.log('Webhook signature valid:', webhookSignature === expectedSignature);

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

    console.log(`Processing webhook event: ${event}`);

    switch (event) {
      case "payment.captured":
        await handlePaymentCaptured(payload.payment.entity);
        break;

      case "payment.failed":
        await handlePaymentFailed(payload.payment.entity);
        break;

      case "order.paid":
        await handleOrderPaid(payload.order.entity, payload.payment.entity);
        break;

      default:
        console.log(`Unhandled webhook event: ${event}`);
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

/**
 * Handle successful payment capture
 */
const handlePaymentCaptured = async (payment) => {
  const sequelize = require("../../dbConnection/dbConfig").sequelize;
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
      console.log(`Transaction ${transaction.id} already completed (idempotency check)`);
      return;
    }

    const wallet = await Wallet.findOne({ where: { id: transaction.walletId } });

    if (!wallet) {
      console.error(`Wallet not found: ${transaction.walletId}`);
      return;
    }

    // Start database transaction for atomicity
    dbTransaction = await sequelize.transaction();

    // Update wallet balance
    const newBalance = parseFloat(wallet.balance) + parseFloat(transaction.amount);
    const newTotalRecharge = parseFloat(wallet.totalRecharge) + parseFloat(transaction.amount);

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

    await dbTransaction.commit();
    console.log(`Payment captured successfully: ${payment.id}, New balance: ${newBalance}`);
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
      console.log(`Transaction ${transaction.id} already processed`);
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

    console.log(`Payment failed: ${payment.id}`);
  } catch (error) {
    console.error("Error handling payment failed:", error);
  }
};

/**
 * Handle order paid event
 */
const handleOrderPaid = async (order, payment) => {
  try {
    console.log(`Order paid: ${order.id}, Payment: ${payment.id}`);
    // Additional logic if needed
  } catch (error) {
    console.error("Error handling order paid:", error);
  }
};

module.exports = {
  handleWebhook,
};
