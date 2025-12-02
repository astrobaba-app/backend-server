const express = require("express");
const router = express.Router();
const {
  startChatSession,
  endChatSession,
  sendMessage,
  getSessionMessages,
  getUserChatSessions,
  getAstrologerChatSessions,
  getActiveSession,
  getTotalMinutesWithAstrologer,
} = require("../../controller/chat/chatController");
const checkForAuthenticationCookie = require("../../middleware/authMiddleware");
const upload = require("../../config/uploadConfig/supabaseUpload");


// User routes
router.post("/start", checkForAuthenticationCookie(), startChatSession);
router.post("/:sessionId/end", checkForAuthenticationCookie(), endChatSession);
router.get("/my-sessions", checkForAuthenticationCookie(), getUserChatSessions);
router.get("/active/:astrologerId", checkForAuthenticationCookie(), getActiveSession);
router.get("/total-minutes/:astrologerId", checkForAuthenticationCookie(), getTotalMinutesWithAstrologer);

// Astrologer routes
router.get("/astrologer/sessions",getAstrologerChatSessions);
// Shared routes (both user and astrologer)
router.post("/:sessionId/message", upload.single("file"), sendMessage);
router.get("/:sessionId/messages", getSessionMessages);

module.exports = router;
