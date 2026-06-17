const express = require("express");
const router = express.Router();
const {
  sendRegistrationOTP,
  verifyOTP,
  completeRegistration,
  login,
  refreshAccessToken,
  getProfile,
  updateProfile,
  logout,
  toggleOnlineStatus,
  goOnline,
  goOffline,
  getOnlineStatus,
} = require("../../controller/astrologer/astrologerAuthController");
const {
  sendRegistrationOTPV2,
  verifyOTPV2,
  completeRegistrationV2,
  logoutV2,
} = require("../../controller/astrologer/astrologerAuthControllerV2");
const upload = require("../../config/uploadConfig/supabaseUpload");
const checkForAuthenticationCookie = require("../../middleware/authMiddleware");

// Public routes
router.post("/send-otp", sendRegistrationOTP);
router.post("/verify-otp", verifyOTP);
router.post("/register", upload.single("photo"), completeRegistration);
router.post("/login", login);
router.post("/refresh-token", refreshAccessToken);
router.post("/v2/send-otp", sendRegistrationOTPV2);
router.post("/v2/verify-otp", verifyOTPV2);
router.post("/v2/register", upload.single("photo"), completeRegistrationV2);
router.post("/v2/logout", checkForAuthenticationCookie(), logoutV2);

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
