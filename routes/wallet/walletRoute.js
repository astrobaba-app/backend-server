const express = require("express");
const router = express.Router();
const {
  getWalletBalance,
  createRechargeOrder,
  verifyRecharge,
  cancelRechargeOrder,
  getTransactionHistory,
  deductForAIUsage,
  createRechargeQrOrder,
  checkRechargeStatus,
} = require("../../controller/wallet/walletController");
const { handleWebhook } = require("../../controller/wallet/webhookController");
const checkForAuthenticationCookie = require("../../middleware/authMiddleware");

// Webhook (no auth required - Razorpay will call this)
router.post("/webhook", handleWebhook);

router.get("/balance", checkForAuthenticationCookie(),getWalletBalance);
router.post("/recharge/create-order",checkForAuthenticationCookie(), createRechargeOrder);
router.post("/recharge/create-qr-order", checkForAuthenticationCookie(), createRechargeQrOrder);
router.get("/recharge/check-status", checkForAuthenticationCookie(), checkRechargeStatus);
router.post("/recharge/verify",checkForAuthenticationCookie(), verifyRecharge);
router.post("/recharge/cancel",checkForAuthenticationCookie(), cancelRechargeOrder);
router.get("/transactions",checkForAuthenticationCookie(), getTransactionHistory);
router.post("/ai-deduct",checkForAuthenticationCookie(), deductForAIUsage);

module.exports = router;
