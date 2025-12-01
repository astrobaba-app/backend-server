const express = require("express");
const router = express.Router();
const {
  generateOtp,
  verifyOtp,
  logout,
} = require("../../controller/authController/phoneAuthController");
const checkForAuthenticationCookie = require("../../middleware/authMiddleware");

router.post("/generate-otp", generateOtp);
router.post("/verify-otp", verifyOtp);

// Protected routes
router.post("/logout", checkForAuthenticationCookie(), logout);

module.exports = router;
