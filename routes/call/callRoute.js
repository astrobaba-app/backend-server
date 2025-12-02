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
const validateAstrologerToken = require("../../middleware/validateAstrologerToken");

// Middleware for both user and astrologer
const dualAuth = (req, res, next) => {
  if (req.headers.cookie && req.headers.cookie.includes("token")) {
    return checkForAuthenticationCookie()(req, res, next);
  }
  if (req.headers.cookie && req.headers.cookie.includes("astrologerToken")) {
    return validateAstrologerToken(req, res, next);
  }
  return res.status(401).json({
    success: false,
    message: "Authentication required",
  });
};

// User routes
router.post("/initiate", checkForAuthenticationCookie(), initiateCall);
router.get("/history", checkForAuthenticationCookie(), getUserCallHistory);

// Astrologer routes
router.post("/:callId/accept", validateAstrologerToken, acceptCall);
router.post("/:callId/reject", validateAstrologerToken, rejectCall);
router.get("/astrologer/history", validateAstrologerToken, getAstrologerCallHistory);

// Shared routes (both user and astrologer)
router.get("/:callId/token", dualAuth, getCallToken);
router.post("/:callId/end", dualAuth, endCall);

module.exports = router;
