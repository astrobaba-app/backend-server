const express = require("express");
const checkForAuthenticationCookie = require("../../middleware/authMiddleware");
const { palmImagesUpload } = require("../../config/uploadConfig/cloudinaryImageUpload");
const {
  createPalmReadingOrder,
  payPalmOrderWithWallet,
  createPalmOrderRazorpay,
  verifyPalmOrderRazorpay,
  getPalmOrder,
  resumePalmOrder,
  getPalmReadingJob,
  getPalmReadingHistory,
} = require("../../controller/palm/palmReadingController");

const router = express.Router();

router.post("/upload", checkForAuthenticationCookie(), palmImagesUpload, createPalmReadingOrder);
router.post("/orders/:orderId/pay-wallet", checkForAuthenticationCookie(), payPalmOrderWithWallet);
router.post("/orders/:orderId/create-razorpay", checkForAuthenticationCookie(), createPalmOrderRazorpay);
router.post("/orders/:orderId/verify-razorpay", checkForAuthenticationCookie(), verifyPalmOrderRazorpay);
router.post("/orders/:orderId/resume", checkForAuthenticationCookie(), resumePalmOrder);
router.get("/orders/:orderId", checkForAuthenticationCookie(), getPalmOrder);
router.get("/jobs/:jobId", checkForAuthenticationCookie(), getPalmReadingJob);
router.get("/history", checkForAuthenticationCookie(), getPalmReadingHistory);

module.exports = router;
