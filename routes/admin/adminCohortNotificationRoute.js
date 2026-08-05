const express = require("express");
const multer = require("multer");
const checkForAuthenticationCookie = require("../../middleware/authMiddleware");
const { authorizeRoles } = require("../../middleware/roleMiddleware");
const {
  cohortBroadcastNotification,
  cohortExcelUploadNotification,
  getCohortNotificationTemplate,
} = require("../../controller/admin/adminCohortNotificationController");

const router = express.Router();
const upload = multer({ storage: multer.memoryStorage() });

router.post(
  "/cohort",
  checkForAuthenticationCookie(),
  authorizeRoles(["admin", "superadmin", "masteradmin"]),
  cohortBroadcastNotification
);

router.post(
  "/cohort-upload",
  checkForAuthenticationCookie(),
  authorizeRoles(["admin", "superadmin", "masteradmin"]),
  upload.single("excelFile"),
  cohortExcelUploadNotification
);

router.get(
  "/cohort-template",
  checkForAuthenticationCookie(),
  authorizeRoles(["admin", "superadmin", "masteradmin"]),
  getCohortNotificationTemplate
);

module.exports = router;
