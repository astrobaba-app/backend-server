const express = require("express");
const router = express.Router();
const {
  sendMessage,
  getChatHistory,
  getMyChatSessions,
  checkAssistantAvailability,
  getMyChatSpending,
  subscribeToPlan,
  getMyAssistantPlan,
  updateAssistantConfig,
  getAssistantAnalytics,
  cancelAssistantPlan,
} = require("../../controller/assistant/assistantController");
const checkForAuthenticationCookie = require("../../middleware/authMiddleware");
const validateAstrologerToken = require("../../middleware/validateAstrologerToken");

// User routes - Chat with assistant
router.post("/chat", checkForAuthenticationCookie(), sendMessage);
router.get("/chat/:sessionId", checkForAuthenticationCookie(), getChatHistory);
router.get("/my-sessions", checkForAuthenticationCookie(), getMyChatSessions);
router.get("/my-spending", checkForAuthenticationCookie(), getMyChatSpending);
router.get("/check/:astrologerId", checkAssistantAvailability);

// Astrologer routes - Manage assistant
router.post("/subscribe", validateAstrologerToken, subscribeToPlan);
router.get("/my-plan", validateAstrologerToken, getMyAssistantPlan);
router.put("/config", validateAstrologerToken, updateAssistantConfig);
router.get("/analytics", validateAstrologerToken, getAssistantAnalytics);
router.delete("/cancel", validateAstrologerToken, cancelAssistantPlan);

module.exports = router;
