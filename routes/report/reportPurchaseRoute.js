const express = require("express");
const checkForAuthenticationCookie = require("../../middleware/authMiddleware");
const {
  getReportAccess,
  payReportWithWallet,
  createReportRazorpayOrder,
  verifyReportRazorpayPayment,
  recoverReportRazorpayPayment,
} = require("../../controller/report/reportPurchaseController");

const router = express.Router();

router.get("/access", checkForAuthenticationCookie(), getReportAccess);
router.post("/pay-wallet", checkForAuthenticationCookie(), payReportWithWallet);
router.post("/razorpay/create", checkForAuthenticationCookie(), createReportRazorpayOrder);
router.post("/razorpay/verify", checkForAuthenticationCookie(), verifyReportRazorpayPayment);
router.post("/razorpay/recover", checkForAuthenticationCookie(), recoverReportRazorpayPayment);

module.exports = router;
