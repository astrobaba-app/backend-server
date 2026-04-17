const express = require("express");
const router = express.Router();
const {
  generateOtp,
  verifyOtp,
  whatsappRegisterOrCheck,
  refreshAccessToken,
  logout,
} = require("../../controller/authController/phoneAuthController");

router.post("/generate-otp", generateOtp);
router.post("/verify-otp", verifyOtp);
router.post("/whatsapp/register", whatsappRegisterOrCheck);
router.post("/refresh-token", refreshAccessToken);

router.post("/logout", logout);

module.exports = router;
