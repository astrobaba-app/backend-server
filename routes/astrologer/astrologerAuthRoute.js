const express = require("express");
const router = express.Router();
const {
  sendRegistrationOTP,
  verifyOTP,
  completeRegistration,
  login,
  refreshAccessToken,
  sendForgotPasswordOTP,
  verifyForgotPasswordOTP,
  resetForgotPassword,
  getProfile,
  updateProfile,
  logout,
  toggleOnlineStatus,
  goOnline,
  goOffline,
  getOnlineStatus,
} = require("../../controller/astrologer/astrologerAuthController");
const upload = require("../../config/uploadConfig/supabaseUpload");
const checkForAuthenticationCookie = require("../../middleware/authMiddleware");

// Public routes
router.post("/send-otp", sendRegistrationOTP);
router.post("/verify-otp", verifyOTP);
router.post("/register", upload.single("photo"), completeRegistration);
router.post("/login", login);
router.post("/refresh-token", refreshAccessToken);
router.post("/forgot-password/send-otp", sendForgotPasswordOTP);
router.post("/forgot-password/verify-otp", verifyForgotPasswordOTP);
router.post("/forgot-password/reset", resetForgotPassword);

// Protected routes
router.get("/profile",checkForAuthenticationCookie(), getProfile);
router.put("/profile",  checkForAuthenticationCookie(), upload.single("photo"), updateProfile);
router.post("/logout", logout);

// Availability routes
router.post("/toggle-status",  checkForAuthenticationCookie(), toggleOnlineStatus);
router.post("/go-online",  checkForAuthenticationCookie(), goOnline);
router.post("/go-offline",  checkForAuthenticationCookie(), goOffline);
router.get("/status",  checkForAuthenticationCookie(), getOnlineStatus);

module.exports = router;
