const express = require("express");
const router = express.Router();
const {
  createChatSession,
  sendMessage,
  getMyChatSessions,
  getChatMessages,
  endChatSession,
  deleteChatSession,
  clearChatSession,
  attachKundliToSession,
  greetSession,
  getAutoFollowUpQuestion,
} = require("../../controller/aiChat/aiChatController");
const {
  createVoiceSession,
  getVoiceConfig,
} = require("../../controller/aiChat/aiVoiceController");
const checkForAuthenticationCookie = require("../../middleware/authMiddleware");

// Chat routes - All routes require authentication
router.post("/create", checkForAuthenticationCookie(), createChatSession);
router.get("/sessions", checkForAuthenticationCookie(), getMyChatSessions);
router.get("/session/:sessionId/messages", checkForAuthenticationCookie(), getChatMessages);
router.post("/session/:sessionId/send", checkForAuthenticationCookie(), sendMessage);
router.post("/session/:sessionId/end", checkForAuthenticationCookie(), endChatSession);
router.delete("/session/:sessionId", checkForAuthenticationCookie(), deleteChatSession);
router.delete("/session/:sessionId/clear", checkForAuthenticationCookie(), clearChatSession);
router.put("/session/:sessionId/attach-kundli", checkForAuthenticationCookie(), attachKundliToSession);
router.post("/session/:sessionId/greet", checkForAuthenticationCookie(), greetSession);
router.post("/session/:sessionId/follow-up-question", checkForAuthenticationCookie(), getAutoFollowUpQuestion);

// Voice call routes
router.post("/voice/session", checkForAuthenticationCookie(), createVoiceSession);
router.get("/voice/config", checkForAuthenticationCookie(), getVoiceConfig);

module.exports = router;
