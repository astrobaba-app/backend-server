const express = require("express");
const router = express.Router();

const {
  createJob,
  getJobs,
  getAdminJobs,
  getJobById,
  submitJobApplication,
} = require("../../controller/job/jobController");
const checkForAuthenticationCookie = require("../../middleware/authMiddleware");
const { authorizeRoles } = require("../../middleware/roleMiddleware");
const resumeUpload = require("../../config/uploadConfig/cloudinaryPdfUpload");

// Public careers listing
router.get("/", getJobs);

// Admin jobs management
router.post(
  "/admin/create",
  checkForAuthenticationCookie(),
  authorizeRoles(["admin", "superadmin", "masteradmin"]),
  createJob
);

router.get(
  "/admin/all",
  checkForAuthenticationCookie(),
  authorizeRoles(["admin", "superadmin", "masteradmin"]),
  getAdminJobs
);

router.get("/:jobId", getJobById);

router.post(
  "/:jobId/applications",
  resumeUpload.single("resume"),
  submitJobApplication
);

module.exports = router;
