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
  getLiveHistory,
  getLiveChatMessages,
} = require("../../controller/live/liveController");
const checkForAuthenticationCookie = require("../../middleware/authMiddleware");
const upload = require("../../config/uploadConfig/supabaseUpload");

// Public routes
router.get("/active", getActiveLiveSessions);

// Astrologer routes (require authentication)
router.post("/create", checkForAuthenticationCookie(), upload.single("thumbnail"), createLiveSession);
router.post("/:sessionId/start", checkForAuthenticationCookie(), startLiveSession);
router.get("/:sessionId/host-token", checkForAuthenticationCookie(), getHostToken);
router.post("/:sessionId/end", checkForAuthenticationCookie(), endLiveSession);
router.get("/astrologer/sessions", checkForAuthenticationCookie(), getAstrologerLiveSessions);
router.get("/astrologer/history", checkForAuthenticationCookie(), getLiveHistory);

// User routes
router.post("/:sessionId/join", checkForAuthenticationCookie(), joinLiveSession);
router.post("/:sessionId/leave", checkForAuthenticationCookie(), leaveLiveSession);

// Live chat messages (accessible to both)
router.get("/:sessionId/messages", getLiveChatMessages);

module.exports = router;
