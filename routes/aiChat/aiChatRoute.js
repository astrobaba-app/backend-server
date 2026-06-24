const express = require("express");
const router = express.Router();
const {
  createChatSession,
  createChatSessionV2,
  getAiAstrologersV2,
  sendMessage,
  sendMessageV2,
  getMyChatSessions,
  getChatMessages,
  endChatSession,
  getAiChatHistoryV2,
  getAiChatHistorySessionV2,
  endChatSessionV2,
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
router.get("/v2/astrologers", checkForAuthenticationCookie(), getAiAstrologersV2);
router.post("/v2/create", checkForAuthenticationCookie(), createChatSessionV2);
router.post("/v2/session/:sessionId/send", checkForAuthenticationCookie(), sendMessageV2);
router.post("/v2/session/:sessionId/end", checkForAuthenticationCookie(), endChatSessionV2);
router.get("/v2/history", checkForAuthenticationCookie(), getAiChatHistoryV2);
router.get("/v2/history/:sessionId", checkForAuthenticationCookie(), getAiChatHistorySessionV2);

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
