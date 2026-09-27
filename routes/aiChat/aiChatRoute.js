const express = require("express");
const router = express.Router();
const {
  createChatSession,
  createChatSessionV2,
  continueChatSessionV2,
  getLatestAiChatSession,
  getAiAstrologersV2,
  sendMessage,
  sendMessageV2,
  sendMessageV3,
  getMyChatSessions,
  getChatMessages,
  endChatSession,
  getAiChatHistoryV2,
  getAiChatHistorySessionV2,
  endChatSessionV2,
  deleteChatSession,
  clearChatSession,
  attachKundliToSession,
  getAiAstrologerReviews,
  greetSession,
  getSessionFeedback,
  getAutoFollowUpQuestion,
  getAiChatQueueStatus,
  submitSessionFeedback,
} = require("../../controller/aiChat/aiChatController");
const {
  createVoiceSession,
  getVoiceConfig,
} = require("../../controller/aiChat/aiVoiceController");
const checkForAuthenticationCookie = require("../../middleware/authMiddleware");

// Chat routes - All routes require authentication
router.get("/v2/astrologers", checkForAuthenticationCookie(), getAiAstrologersV2);
router.get("/v2/astrologers/:astrologerId/latest-session", checkForAuthenticationCookie(), getLatestAiChatSession);
router.post("/v2/create", checkForAuthenticationCookie(), createChatSessionV2);
router.post("/v2/session/:sessionId/continue", checkForAuthenticationCookie(), continueChatSessionV2);
router.post("/v2/session/:sessionId/send", checkForAuthenticationCookie(), sendMessageV2);
router.post("/v2/session/:sessionId/end", checkForAuthenticationCookie(), endChatSessionV2);
router.get("/v2/history", checkForAuthenticationCookie(), getAiChatHistoryV2);
router.get("/v2/history/:sessionId", checkForAuthenticationCookie(), getAiChatHistorySessionV2);
router.get("/v2/astrologers/:astrologerId/reviews", checkForAuthenticationCookie(), getAiAstrologerReviews);
router.post("/v3/session/:sessionId/send", checkForAuthenticationCookie(), sendMessageV3);

router.post("/create", checkForAuthenticationCookie(), createChatSession);
router.get("/sessions", checkForAuthenticationCookie(), getMyChatSessions);
router.get("/session/:sessionId/messages", checkForAuthenticationCookie(), getChatMessages);
router.get("/session/:sessionId/queue-status", checkForAuthenticationCookie(), getAiChatQueueStatus);
router.get("/session/:sessionId/feedback", checkForAuthenticationCookie(), getSessionFeedback);
router.post("/session/:sessionId/send", checkForAuthenticationCookie(), sendMessage);
router.post("/session/:sessionId/end", checkForAuthenticationCookie(), endChatSession);
router.post("/session/:sessionId/feedback", checkForAuthenticationCookie(), submitSessionFeedback);
router.delete("/session/:sessionId", checkForAuthenticationCookie(), deleteChatSession);
router.delete("/session/:sessionId/clear", checkForAuthenticationCookie(), clearChatSession);
router.put("/session/:sessionId/attach-kundli", checkForAuthenticationCookie(), attachKundliToSession);
router.post("/session/:sessionId/greet", checkForAuthenticationCookie(), greetSession);
router.post("/session/:sessionId/follow-up-question", checkForAuthenticationCookie(), getAutoFollowUpQuestion);

// Voice call routes
router.post("/voice/session", checkForAuthenticationCookie(), createVoiceSession);
router.get("/voice/config", checkForAuthenticationCookie(), getVoiceConfig);

module.exports = router;
