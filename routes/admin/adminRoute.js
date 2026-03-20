const express = require("express");
const router = express.Router();
const {
  register,
  login,
  verify2FALogin,
  getAllAdmins,
  changeAdminRole,
  getAllUsers,
  getAllAstrologers,
  getPendingAstrologers,
  approveAstrologer,
  rejectAstrologer,
  logout,
  broadcastNotification,
  getBroadcastHistory,
  resendBroadcast,
  getProfile,
  updateProfile,
  changePassword,
  enableTwoFactor,
  verifyTwoFactor,
  disableTwoFactor,
} = require("../../controller/admin/adminController");
const {
  getSignupBonusSettings,
  updateSignupBonusSettings,
  toggleSignupBonus,
} = require("../../controller/admin/signupBonusController");
const {
  getForumAppealsForAdmin,
  getForumPostsForAdmin,
  getForumReportsForAdmin,
  updateForumAppealStatus,
  updateForumPostStatus,
  updateForumReportStatus,
  updateForumUserRestriction,
} = require("../../controller/admin/adminForumController");
const checkForAuthenticationCookie = require("../../middleware/authMiddleware");
const { authorizeRoles } = require("../../middleware/roleMiddleware");

router.post("/register", register);
router.post("/login", login);
router.post("/verify-2fa-login", verify2FALogin);

router.post("/logout", logout);

// Profile routes
router.get(
  "/profile",
  checkForAuthenticationCookie(),
  authorizeRoles(["admin", "superadmin", "masteradmin"]),
  getProfile
);
router.put(
  "/profile",
  checkForAuthenticationCookie(),
  authorizeRoles(["admin", "superadmin", "masteradmin"]),
  updateProfile
);
router.put(
  "/change-password",
  checkForAuthenticationCookie(),
  authorizeRoles(["admin", "superadmin", "masteradmin"]),
  changePassword
);

// 2FA routes
router.post(
  "/2fa/enable",
  checkForAuthenticationCookie(),
  authorizeRoles(["admin", "superadmin", "masteradmin"]),
  enableTwoFactor
);
router.post(
  "/2fa/verify",
  checkForAuthenticationCookie(),
  authorizeRoles(["admin", "superadmin", "masteradmin"]),
  verifyTwoFactor
);
router.post(
  "/2fa/disable",
  checkForAuthenticationCookie(),
  authorizeRoles(["admin", "superadmin", "masteradmin"]),
  disableTwoFactor
);

// Master admin only routes
router.get(
  "/admins",
  checkForAuthenticationCookie(),
  authorizeRoles(["masteradmin"]),
  getAllAdmins
);
router.put(
  "/admins/:adminId/role",
  checkForAuthenticationCookie(),
  authorizeRoles([ "masteradmin"]),
  changeAdminRole
);
router.get(
  "/users",
  checkForAuthenticationCookie(),
  authorizeRoles(["admin", "superadmin", "masteradmin"]),
  getAllUsers
);
router.get(
  "/astrologers",
  checkForAuthenticationCookie(),
  authorizeRoles(["admin", "superadmin", "masteradmin"]),
  getAllAstrologers
);
router.get(
  "/astrologers/pending",
  checkForAuthenticationCookie(),
  authorizeRoles(["admin", "superadmin", "masteradmin"]),
  getPendingAstrologers
);
router.put(
  "/astrologers/:astrologerId/approve",
  checkForAuthenticationCookie(),
  authorizeRoles(["admin", "superadmin", "masteradmin"]),
  approveAstrologer
);
router.put(
  "/astrologers/:astrologerId/reject",
  checkForAuthenticationCookie(),
  authorizeRoles(["admin", "superadmin", "masteradmin"]),
  rejectAstrologer
);

// Broadcast push notification to all users
router.post(
  "/broadcast-notification",
  checkForAuthenticationCookie(),
  authorizeRoles(["admin", "superadmin", "masteradmin"]),
  broadcastNotification
);
router.get(
  "/broadcast-history",
  checkForAuthenticationCookie(),
  authorizeRoles(["admin", "superadmin", "masteradmin"]),
  getBroadcastHistory
);
router.post(
  "/broadcast-resend/:logId",
  checkForAuthenticationCookie(),
  authorizeRoles(["admin", "superadmin", "masteradmin"]),
  resendBroadcast
);

// Signup bonus settings routes
router.get(
  "/signup-bonus/settings",
  checkForAuthenticationCookie(),
  authorizeRoles(["admin", "superadmin", "masteradmin"]),
  getSignupBonusSettings
);
router.put(
  "/signup-bonus/settings",
  checkForAuthenticationCookie(),
  authorizeRoles(["admin", "superadmin", "masteradmin"]),
  updateSignupBonusSettings
);
router.post(
  "/signup-bonus/toggle",
  checkForAuthenticationCookie(),
  authorizeRoles(["admin", "superadmin", "masteradmin"]),
  toggleSignupBonus
);

// Forum moderation routes
router.get(
  "/forum/posts",
  checkForAuthenticationCookie(),
  authorizeRoles(["admin", "superadmin", "masteradmin"]),
  getForumPostsForAdmin
);

router.get(
  "/forum/reports",
  checkForAuthenticationCookie(),
  authorizeRoles(["admin", "superadmin", "masteradmin"]),
  getForumReportsForAdmin
);

router.patch(
  "/forum/posts/:postId/status",
  checkForAuthenticationCookie(),
  authorizeRoles(["admin", "superadmin", "masteradmin"]),
  updateForumPostStatus
);

router.patch(
  "/forum/reports/:reportId",
  checkForAuthenticationCookie(),
  authorizeRoles(["admin", "superadmin", "masteradmin"]),
  updateForumReportStatus
);

router.patch(
  "/forum/users/:userId/restriction",
  checkForAuthenticationCookie(),
  authorizeRoles(["admin", "superadmin", "masteradmin"]),
  updateForumUserRestriction
);

router.get(
  "/forum/appeals",
  checkForAuthenticationCookie(),
  authorizeRoles(["admin", "superadmin", "masteradmin"]),
  getForumAppealsForAdmin
);

router.patch(
  "/forum/appeals/:appealId",
  checkForAuthenticationCookie(),
  authorizeRoles(["admin", "superadmin", "masteradmin"]),
  updateForumAppealStatus
);

module.exports = router;
