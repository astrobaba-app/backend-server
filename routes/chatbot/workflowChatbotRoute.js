const express = require("express");
const router = express.Router();
const {
  handleMessage,
  resetSession,
} = require("../../controller/chatbot/workflowChatbotController");

// Public endpoints for rule-based workflow chatbot
router.post("/message", handleMessage);
router.post("/reset", resetSession);

module.exports = router;
