const express = require("express");
const router = express.Router();
const {
  generateOtp,
  verifyOtp,
  whatsappRegisterOrCheck,
  refreshAccessToken,
  logout,
} = require("../../controller/authController/phoneAuthController");
const {
  sendOtpV2,
  verifyOtpV2,
} = require("../../controller/authController/phoneAuthControllerV2");
const { verifyBotProtection } = require("../../middleware/botProtection");


router.post("/generate-otp", verifyBotProtection, generateOtp);
router.post("/verify-otp", verifyOtp);
router.post("/v2/send-otp", verifyBotProtection, sendOtpV2);
router.post("/v2/verify-otp", verifyOtpV2);
router.post("/whatsapp/register", whatsappRegisterOrCheck);
router.post("/refresh-token", refreshAccessToken);

router.post("/logout", logout);

module.exports = router;
