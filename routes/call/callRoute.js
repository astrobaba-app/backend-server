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
router.post("/:callId/accept", acceptCall);
router.post("/:callId/reject", rejectCall);
router.get("/astrologer/history", getAstrologerCallHistory);

// Shared routes (both user and astrologer)
router.get("/:callId/token", getCallToken);
router.post("/:callId/end", endCall);
module.exports = router;
