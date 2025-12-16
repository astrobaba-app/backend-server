const express = require("express");
const router = express.Router();
const {
  initiateCall,
  acceptCall,
  rejectCall,
  getCallToken,
  endCall,
  getUserCallHistory,
  getAstrologerCallHistory,
} = require("../../controller/call/callController");
const checkForAuthenticationCookie = require("../../middleware/authMiddleware");

// User routes
router.post("/initiate", checkForAuthenticationCookie(), initiateCall);
router.get("/history", checkForAuthenticationCookie(), getUserCallHistory);

// Astrologer routes
router.post("/:callId/accept", checkForAuthenticationCookie(), acceptCall);
router.post("/:callId/reject", checkForAuthenticationCookie(), rejectCall);
router.get("/astrologer/history", checkForAuthenticationCookie(), getAstrologerCallHistory);

// Shared routes (both user and astrologer)
router.get("/:callId/token", checkForAuthenticationCookie(), getCallToken);
router.post("/:callId/end", checkForAuthenticationCookie(), endCall);
module.exports = router;
