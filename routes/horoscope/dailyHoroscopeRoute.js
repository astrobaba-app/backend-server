const express = require("express");
const router = express.Router();
const {
  getDailyHoroscope,
  getWeeklyHoroscope,
  getMonthlyHoroscope,
  getYearlyHoroscope,
} = require("../../controller/horoscope/dailyHoroscopeController");

router.get("/daily/:zodiacSign", getDailyHoroscope);
router.get("/weekly/:zodiacSign", getWeeklyHoroscope);
router.get("/monthly/:zodiacSign", getMonthlyHoroscope);
router.get("/yearly/:zodiacSign", getYearlyHoroscope);

module.exports = router;
