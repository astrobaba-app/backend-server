const express = require("express");
const router = express.Router();
const checkForAuthenticationCookie = require("../../middleware/authMiddleware");
const {
  checkKundliStatus,
  generateDailyKundliReport,
} = require("../../controller/horoscope/dailyKundliController");

router.get("/check-status", checkForAuthenticationCookie(), checkKundliStatus);
router.post("/generate", checkForAuthenticationCookie(), generateDailyKundliReport);

module.exports = router;
