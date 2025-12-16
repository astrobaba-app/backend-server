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
  approveChatRequest,
  rejectChatRequest,
} = require("../../controller/chat/chatController");
const checkForAuthenticationCookie = require("../../middleware/authMiddleware");
const { authorizeRoles } = require("../../middleware/roleMiddleware");
const upload = require("../../config/uploadConfig/supabaseUpload");


// User routes
router.post("/start", checkForAuthenticationCookie(), startChatSession);
router.post("/:sessionId/end", checkForAuthenticationCookie(), endChatSession);
router.get("/my-sessions", checkForAuthenticationCookie(), getUserChatSessions);
router.get("/active/:astrologerId", checkForAuthenticationCookie(), getActiveSession);
router.get("/total-minutes/:astrologerId", checkForAuthenticationCookie(), getTotalMinutesWithAstrologer);

// Astrologer routes
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
