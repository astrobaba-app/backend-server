const express = require("express");
const router = express.Router();
const {
  getDailyHoroscope,
  getWeeklyHoroscope,
  getMonthlyHoroscope,
  getYearlyHoroscope,
} = require("../../controller/horoscope/dailyHoroscopeController");
const checkForAuthenticationCookie = require("../../middleware/authMiddleware");

router.get("/daily/:zodiacSign", checkForAuthenticationCookie.optional(), getDailyHoroscope);
router.get("/weekly/:zodiacSign", checkForAuthenticationCookie.optional(), getWeeklyHoroscope);
router.get("/monthly/:zodiacSign", checkForAuthenticationCookie.optional(), getMonthlyHoroscope);
router.get("/yearly/:zodiacSign", checkForAuthenticationCookie.optional(), getYearlyHoroscope);

module.exports = router;
