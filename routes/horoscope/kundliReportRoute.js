const express = require("express");
const router = express.Router();
const {
  getUserKundlisForReport,
  generateKundliReport,
  getGeneratedKundliReport,
  downloadKundliReportPDF,
  previewKundliReportPDF,
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

module.exports = router;
