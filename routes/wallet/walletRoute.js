const express = require("express");
const router = express.Router();
const {
  getWalletBalance,
  createRechargeOrder,
  verifyRecharge,
  getTransactionHistory,
  deductForAIUsage,
} = require("../../controller/wallet/walletController");
const { handleWebhook } = require("../../controller/wallet/webhookController");
const checkForAuthenticationCookie = require("../../middleware/authMiddleware");

// Webhook (no auth required - Razorpay will call this)
router.post("/webhook", handleWebhook);

router.get("/balance", checkForAuthenticationCookie(),getWalletBalance);
router.post("/recharge/create-order",checkForAuthenticationCookie(), createRechargeOrder);
router.post("/recharge/verify",checkForAuthenticationCookie(), verifyRecharge);
router.get("/transactions",checkForAuthenticationCookie(), getTransactionHistory);
router.post("/ai-deduct",checkForAuthenticationCookie(), deductForAIUsage);

module.exports = router;
