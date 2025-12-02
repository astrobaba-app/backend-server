const express = require("express");
const router = express.Router();
const {
  createLiveSession,
  startLiveSession,
  getHostToken,
  joinLiveSession,
  leaveLiveSession,
  endLiveSession,
  getActiveLiveSessions,
  getAstrologerLiveSessions,
} = require("../../controller/live/liveController");
const checkForAuthenticationCookie = require("../../middleware/authMiddleware");
const validateAstrologerToken = require("../../middleware/validateAstrologerToken");
const upload = require("../../config/uploadConfig/supabaseUpload");

// Public routes
router.get("/active", getActiveLiveSessions);

// Astrologer routes
router.post("/create", validateAstrologerToken, upload.single("thumbnail"), createLiveSession);
router.post("/:sessionId/start", validateAstrologerToken, startLiveSession);
router.get("/:sessionId/host-token", validateAstrologerToken, getHostToken);
router.post("/:sessionId/end", validateAstrologerToken, endLiveSession);
router.get("/astrologer/sessions", validateAstrologerToken, getAstrologerLiveSessions);

// User routes
router.post("/:sessionId/join", checkForAuthenticationCookie(), joinLiveSession);
router.post("/:sessionId/leave", checkForAuthenticationCookie(), leaveLiveSession);

module.exports = router;
