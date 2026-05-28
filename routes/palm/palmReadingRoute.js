const express = require("express");
const checkForAuthenticationCookie = require("../../middleware/authMiddleware");
const { palmImagesUpload } = require("../../config/uploadConfig/cloudinaryImageUpload");
const { createPalmReadingJob, getPalmReadingJob, getPalmReadingHistory } = require("../../controller/palm/palmReadingController");

const router = express.Router();

router.post("/upload", checkForAuthenticationCookie(), palmImagesUpload, createPalmReadingJob);
router.get("/jobs/:jobId", checkForAuthenticationCookie(), getPalmReadingJob);
router.get("/history", checkForAuthenticationCookie(), getPalmReadingHistory);

module.exports = router;
