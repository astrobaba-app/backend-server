const express = require("express");
const router = express.Router();
const checkForAuthenticationCookie = require("../../middleware/authMiddleware");
const {
  createFeedback,
  getFeedbackStatus,
} = require("../../controller/feedback/feedbackController");

const allowFeedbackActors = (req, res, next) => {
  const role = req.user?.role;

  if (!role || role === "user" || role === "astrologer") {
    return next();
  }

  return res.status(403).json({
    message: "Unauthorized Access! , You are not authorized to access this resources ",
  });
};

router.get(
  "/status",
  checkForAuthenticationCookie(),
  allowFeedbackActors,
  getFeedbackStatus
);

router.post(
  "/create",
  checkForAuthenticationCookie(),
  allowFeedbackActors,
  createFeedback
);

module.exports = router;
