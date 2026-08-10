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
  downloadSadeSatiReportPdf,
  regenerateSadeSatiReportPdf,
  generateHealthKundaliReport,
  getHealthKundaliHistory,
  deleteHealthKundaliReport,
  downloadHealthReportPdf,
  regenerateHealthReportPdf,
  generateLoveRelationshipKundaliReport,
  getLoveRelationshipKundaliHistory,
  deleteLoveRelationshipKundaliReport,
  downloadLoveRelationshipReportPdf,
  regenerateLoveRelationshipReportPdf,
  generateCompatibilityKundaliReport,
  getCompatibilityKundaliHistory,
  deleteCompatibilityKundaliReport,
  downloadCompatibilityReportPdf,
  regenerateCompatibilityReportPdf,
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


router.get("/sade-sati-kundali/:id/pdf", checkForAuthenticationCookie(), downloadSadeSatiReportPdf);
router.post("/sade-sati-kundali/:id/regenerate-pdf", checkForAuthenticationCookie(), regenerateSadeSatiReportPdf);

// Health
router.post("/health-kundali", checkForAuthenticationCookie(), generateHealthKundaliReport);
router.get("/health-kundali", checkForAuthenticationCookie(), getHealthKundaliHistory);
router.delete("/health-kundali/:id", checkForAuthenticationCookie(), deleteHealthKundaliReport);
router.get("/health-kundali/:id/pdf", checkForAuthenticationCookie(), downloadHealthReportPdf);
router.post("/health-kundali/:id/regenerate-pdf", checkForAuthenticationCookie(), regenerateHealthReportPdf);

// Love Relationship
router.post("/love-relationship-kundali", checkForAuthenticationCookie(), generateLoveRelationshipKundaliReport);
router.get("/love-relationship-kundali", checkForAuthenticationCookie(), getLoveRelationshipKundaliHistory);
router.delete("/love-relationship-kundali/:id", checkForAuthenticationCookie(), deleteLoveRelationshipKundaliReport);
router.get("/love-relationship-kundali/:id/pdf", checkForAuthenticationCookie(), downloadLoveRelationshipReportPdf);
router.post("/love-relationship-kundali/:id/regenerate-pdf", checkForAuthenticationCookie(), regenerateLoveRelationshipReportPdf);

// Compatibility
router.post("/compatibility-kundali", checkForAuthenticationCookie(), generateCompatibilityKundaliReport);
router.get("/compatibility-kundali", checkForAuthenticationCookie(), getCompatibilityKundaliHistory);
router.delete("/compatibility-kundali/:id", checkForAuthenticationCookie(), deleteCompatibilityKundaliReport);
router.get("/compatibility-kundali/:id/pdf", checkForAuthenticationCookie(), downloadCompatibilityReportPdf);
router.post("/compatibility-kundali/:id/regenerate-pdf", checkForAuthenticationCookie(), regenerateCompatibilityReportPdf);


module.exports = router;


