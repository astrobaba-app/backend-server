const express = require("express");
const router = express.Router();
const checkForAuthenticationCookie = require("../../middleware/authMiddleware");
const {
  generateDailyInsight,
  getDailyInsight,
  getStandoutInsights,
  generateOneYearInsight,
} = require("../../controller/horoscope/astroInsightController");

router.post("/daily", checkForAuthenticationCookie(), generateDailyInsight);
router.get("/daily/:userRequestId", checkForAuthenticationCookie(), getDailyInsight);
router.get("/standout/:userRequestId", checkForAuthenticationCookie(), getStandoutInsights);
router.get("/one-year/:userRequestId", checkForAuthenticationCookie(), generateOneYearInsight);

module.exports = router;
