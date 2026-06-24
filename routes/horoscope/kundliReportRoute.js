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
  regenerateDailyReportPdf,
  downloadDailyReportPdf,
  generateYearlyKundaliReport,
  getYearlyKundaliHistory,
  deleteYearlyKundaliReport,
  regenerateYearlyReportPdf,
  downloadYearlyReportPdf,
  generateWealthKundaliReport,
  getWealthKundaliHistory,
  deleteWealthKundaliReport,
  regenerateWealthReportPdf,
  downloadWealthReportPdf,
  generateSadeSatiKundaliReport,
  getSadeSatiKundaliHistory,
  deleteSadeSatiKundaliReport,
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
router.get("/daily-kundali/:id/pdf", checkForAuthenticationCookie(), downloadDailyReportPdf);
router.post("/daily-kundali/:id/regenerate-pdf", checkForAuthenticationCookie(), regenerateDailyReportPdf);

// Delete a daily report record
router.delete("/daily-kundali/:id", checkForAuthenticationCookie(), deleteDailyKundaliReport);

// Yearly Kundali endpoints
router.post("/yearly-kundali", checkForAuthenticationCookie(), generateYearlyKundaliReport);
router.get("/yearly-kundali", checkForAuthenticationCookie(), getYearlyKundaliHistory);
router.get("/yearly-kundali/:id/pdf", checkForAuthenticationCookie(), downloadYearlyReportPdf);
router.post("/yearly-kundali/:id/regenerate-pdf", checkForAuthenticationCookie(), regenerateYearlyReportPdf);

// Delete a yearly report record
router.delete("/yearly-kundali/:id", checkForAuthenticationCookie(), deleteYearlyKundaliReport);

// Wealth Kundali endpoints
router.post("/wealth-kundali", checkForAuthenticationCookie(), generateWealthKundaliReport);
router.get("/wealth-kundali", checkForAuthenticationCookie(), getWealthKundaliHistory);
router.get("/wealth-kundali/:id/pdf", checkForAuthenticationCookie(), downloadWealthReportPdf);
router.post("/wealth-kundali/:id/regenerate-pdf", checkForAuthenticationCookie(), regenerateWealthReportPdf);

// Delete a wealth report record
router.delete("/wealth-kundali/:id", checkForAuthenticationCookie(), deleteWealthKundaliReport);

// Sade Sati Kundali endpoints
router.post("/sade-sati-kundali", checkForAuthenticationCookie(), generateSadeSatiKundaliReport);
router.get("/sade-sati-kundali", checkForAuthenticationCookie(), getSadeSatiKundaliHistory);

// Delete a sade-sati report record
router.delete("/sade-sati-kundali/:id", checkForAuthenticationCookie(), deleteSadeSatiKundaliReport);

module.exports = router;
