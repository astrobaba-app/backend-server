const express = require("express");
const router = express.Router();
const {
  sendRegistrationOTP,
  verifyOTP,
  completeRegistration,
  login,
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

// Protected routes
router.get("/profile",checkForAuthenticationCookie(), getProfile);
router.put("/profile",  checkForAuthenticationCookie(), upload.single("photo"), updateProfile);
router.post("/logout",  checkForAuthenticationCookie(),logout);

// Availability routes
router.post("/toggle-status",  checkForAuthenticationCookie(), toggleOnlineStatus);
router.post("/go-online",  checkForAuthenticationCookie(), goOnline);
router.post("/go-offline",  checkForAuthenticationCookie(), goOffline);
router.get("/status",  checkForAuthenticationCookie(), getOnlineStatus);

module.exports = router;
