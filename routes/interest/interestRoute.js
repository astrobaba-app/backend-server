const express = require("express");
const router = express.Router();
const checkForAuthenticationCookie = require("../../middleware/authMiddleware");
const { authorizeRoles } = require("../../middleware/roleMiddleware");
const {
  getCohortSummary,
  getCohortUsers,
  getCohortBackfillStats,
  getInterestCategories,
  getUserInterestSummaryForAdmin,
  runCohortBackfill,
} = require("../../controller/interest/interestController");

router.get(
  "/categories",
  checkForAuthenticationCookie(),
  authorizeRoles(["admin", "superadmin", "masteradmin"]),
  getInterestCategories
);
router.get(
  "/users/:userId",
  checkForAuthenticationCookie(),
  authorizeRoles(["admin", "superadmin", "masteradmin"]),
  getUserInterestSummaryForAdmin
);
router.get(
  "/cohorts/summary",
  checkForAuthenticationCookie(),
  authorizeRoles(["admin", "superadmin", "masteradmin"]),
  getCohortSummary
);
router.get(
  "/backfill/stats",
  checkForAuthenticationCookie(),
  authorizeRoles(["admin", "superadmin", "masteradmin"]),
  getCohortBackfillStats
);
router.post(
  "/backfill/run",
  checkForAuthenticationCookie(),
  authorizeRoles(["admin", "superadmin", "masteradmin"]),
  runCohortBackfill
);
router.get(
  "/cohorts/:cohortType/:category/users",
  checkForAuthenticationCookie(),
  authorizeRoles(["admin", "superadmin", "masteradmin"]),
  getCohortUsers
);
router.get(
  "/cohorts/:category/users",
  checkForAuthenticationCookie(),
  authorizeRoles(["admin", "superadmin", "masteradmin"]),
  getCohortUsers
);

module.exports = router;
