const express = require("express");
const router = express.Router();
const {
  getUserKundlisForReport,
  generateKundliReport,
  getGeneratedKundliReport,
  downloadKundliReportPDF,
  previewKundliReportPDF,
  generateDailyKundaliReport,
  getDailyKundaliHistory,
  deleteDailyKundaliReport,
  generateYearlyKundaliReport,
  getYearlyKundaliHistory,
  deleteYearlyKundaliReport,
} = require("../../controller/horoscope/kundliReportController");
const checkForAuthenticationCookie = require("../../middleware/authMiddleware");

// Get all user's kundlis for selection
router.get("/user-kundlis", checkForAuthenticationCookie(), getUserKundlisForReport);

// Generate report content (with OpenAI enhancement)
router.post("/generate", checkForAuthenticationCookie(), generateKundliReport);

// Get previously generated report content for a selected kundli
router.get("/generated/:userRequestId", checkForAuthenticationCookie(), getGeneratedKundliReport);

// Download PDF
router.post("/download", checkForAuthenticationCookie(), downloadKundliReportPDF);

// Preview PDF (base64)
router.post("/preview", checkForAuthenticationCookie(), previewKundliReportPDF);

// Daily Kundali endpoints
router.post("/daily-kundali", checkForAuthenticationCookie(), generateDailyKundaliReport);
router.get("/daily-kundali", checkForAuthenticationCookie(), getDailyKundaliHistory);

// Delete a daily report record
router.delete("/daily-kundali/:id", checkForAuthenticationCookie(), deleteDailyKundaliReport);

// Yearly Kundali endpoints
router.post("/yearly-kundali", checkForAuthenticationCookie(), generateYearlyKundaliReport);
router.get("/yearly-kundali", checkForAuthenticationCookie(), getYearlyKundaliHistory);

// Delete a yearly report record
router.delete("/yearly-kundali/:id", checkForAuthenticationCookie(), deleteYearlyKundaliReport);

module.exports = router;

