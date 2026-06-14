const express = require("express");
const router = express.Router();
const {
  startChatSession,
  endChatSession,
  sendMessage,
  getSessionMessages,
  getChatSessionStatusV2,
  getUserChatSessions,
  getUserChatHistory,
  getUserAstrologerChatHistory,
  getChatHistorySessionV2,
  getAstrologerChatHistory,
  getAstrologerChatSessions,
  getActiveSession,
  getTotalMinutesWithAstrologer,
  approveChatRequest,
  rejectChatRequest,
  endAstrologerChatSession,
} = require("../../controller/chat/chatController");
const checkForAuthenticationCookie = require("../../middleware/authMiddleware");
const { authorizeRoles } = require("../../middleware/roleMiddleware");
const upload = require("../../config/uploadConfig/supabaseUpload");


// User routes
router.post("/start", checkForAuthenticationCookie(), startChatSession);
router.post("/:sessionId/end", checkForAuthenticationCookie(), endChatSession);
router.get("/my-sessions", checkForAuthenticationCookie(), getUserChatSessions);
router.get("/history", checkForAuthenticationCookie(), getUserChatHistory);
router.get("/history/:astrologerId", checkForAuthenticationCookie(), getUserAstrologerChatHistory);
router.get("/active/:astrologerId", checkForAuthenticationCookie(), getActiveSession);
router.get("/total-minutes/:astrologerId", checkForAuthenticationCookie(), getTotalMinutesWithAstrologer);
router.get("/v2/sessions/:sessionId/status", checkForAuthenticationCookie(), getChatSessionStatusV2);
router.get("/v2/history/:historySessionId", checkForAuthenticationCookie(), getChatHistorySessionV2);

// Astrologer routes
router.get(
  "/astrologer/history",
  checkForAuthenticationCookie(),
  authorizeRoles(["astrologer"]),
  getAstrologerChatHistory
);

router.get(
  "/astrologer/sessions",
  checkForAuthenticationCookie(),
  authorizeRoles(["astrologer"]),
  getAstrologerChatSessions
);

router.post(
  "/astrologer/requests/:sessionId/approve",
  checkForAuthenticationCookie(),
  authorizeRoles(["astrologer"]),
  approveChatRequest
);

router.post(
  "/astrologer/requests/:sessionId/reject",
  checkForAuthenticationCookie(),
  authorizeRoles(["astrologer"]),
  rejectChatRequest
);

router.post(
  "/astrologer/:sessionId/end",
  checkForAuthenticationCookie(),
  authorizeRoles(["astrologer"]),
  endAstrologerChatSession
);

// Shared routes (both user and astrologer)
router.post(
  "/:sessionId/message",
  checkForAuthenticationCookie(),
  upload.single("file"),
  sendMessage
);
router.get(
  "/:sessionId/messages",
  checkForAuthenticationCookie(),
  getSessionMessages
);

module.exports = router;
