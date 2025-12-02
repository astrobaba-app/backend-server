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
const validateAstrologerToken = require("../../middleware/validateAstrologerToken");
const upload = require("../../config/uploadConfig/supabaseUpload");

// Public routes
router.post("/send-otp", sendRegistrationOTP);
router.post("/verify-otp", verifyOTP);
router.post("/register", upload.single("photo"), completeRegistration);
router.post("/login", login);

// Protected routes
router.get("/profile", validateAstrologerToken, getProfile);
router.put("/profile", validateAstrologerToken, upload.single("photo"), updateProfile);
router.post("/logout", validateAstrologerToken, logout);

// Availability routes
router.post("/toggle-status", validateAstrologerToken, toggleOnlineStatus);
router.post("/go-online", validateAstrologerToken, goOnline);
router.post("/go-offline", validateAstrologerToken, goOffline);
router.get("/status", validateAstrologerToken, getOnlineStatus);

module.exports = router;
