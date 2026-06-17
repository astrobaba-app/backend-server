const express = require("express");
const router = express.Router();
const {
  register,
  login,
  verify2FALogin,
  refreshAccessToken,
  getAllAdmins,
  changeAdminRole,
  getAllUsers,
  getDashboardStats,
  updateUserWhatsappChatLimit,
  updateAllUsersWhatsappChatLimit,
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
  getOpenAIRequestLogs,
} = require("../../controller/admin/adminController");
const {
  getSignupBonusSettings,
  updateSignupBonusSettings,
  toggleSignupBonus,
} = require("../../controller/admin/signupBonusController");
const {
  getAstrologerPayoutRequests,
  markPayoutRequestPaid,
  rejectPayoutRequest,
} = require("../../controller/admin/astrologerPayoutController");
const {
  getWhatsappAuthSettings,
  updateWhatsappAuthSettings,
} = require("../../controller/admin/whatsappAuthController");
const {
  uploadScheduledNotifications,
  listScheduledNotificationBatches,
  getScheduledNotificationBatch,
  getScheduledNotificationGroups,
  getScheduledNotificationHistory,
  updateScheduledNotificationItem,
  cancelScheduledNotificationItem,
  cancelScheduledNotificationBatch,
  deleteScheduledNotificationBatch,
  getScheduledNotificationTemplate,
} = require("../../controller/admin/scheduledNotificationController");
const {
  getForumAppealsForAdmin,
  getForumPostsForAdmin,
  getForumReportsForAdmin,
  updateForumAppealStatus,
  updateForumPostStatus,
  updateForumReportStatus,
  updateForumUserRestriction,
} = require("../../controller/admin/adminForumController");
const { getPlatformRazorpayTransactions } = require("../../controller/admin/platformTransactionAdminController");
const {
  getPalmFailureCandidates,
  cleanupPalmQueue,
} = require("../../controller/admin/palmRefundAdminController");
const {
  createJob,
  getAdminJobs,
  updateJobStatus,
  getAdminJobApplications,
  getAdminJobApplicationById,
  getAdminJobApplicationResume,
  acceptJobApplication,
  rejectJobApplication,
} = require("../../controller/job/jobController");
const checkForAuthenticationCookie = require("../../middleware/authMiddleware");
const { authorizeRoles } = require("../../middleware/roleMiddleware");
const multer = require("multer");

const spreadsheetUpload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 5 * 1024 * 1024 },
  fileFilter: (req, file, cb) => {
    const allowedMimeTypes = new Set([
      "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
      "application/vnd.ms-excel",
      "text/csv",
    ]);
    if (
      allowedMimeTypes.has(file.mimetype) ||
      /\.(xlsx|xls|csv)$/i.test(file.originalname)
    ) {
      cb(null, true);
      return;
    }
    cb(new Error("Only Excel or CSV files are allowed"));
  },
});

router.post("/register", register);
router.post("/login", login);
router.post("/verify-2fa-login", verify2FALogin);
router.post("/refresh-token", refreshAccessToken);

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

router.get(
  "/openai-request-logs",
  checkForAuthenticationCookie(),
  authorizeRoles(["admin", "superadmin", "masteradmin"]),
  getOpenAIRequestLogs
);

router.get(
  "/platform-transactions",
  checkForAuthenticationCookie(),
  authorizeRoles(["admin", "superadmin", "masteradmin"]),
  getPlatformRazorpayTransactions
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
  "/dashboard/stats",
  checkForAuthenticationCookie(),
  authorizeRoles(["admin", "superadmin", "masteradmin"]),
  getDashboardStats
);
router.get(
  "/users",
  checkForAuthenticationCookie(),
  authorizeRoles(["admin", "superadmin", "masteradmin"]),
  getAllUsers
);
router.put(
  "/users/whatsapp-chat-limit/bulk",
  checkForAuthenticationCookie(),
  authorizeRoles(["admin", "superadmin", "masteradmin"]),
  updateAllUsersWhatsappChatLimit
);
router.put(
  "/users/:userId/whatsapp-chat-limit",
  checkForAuthenticationCookie(),
  authorizeRoles(["admin", "superadmin", "masteradmin"]),
  updateUserWhatsappChatLimit
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

router.get(
  "/scheduled-notifications/template",
  checkForAuthenticationCookie(),
  authorizeRoles(["admin", "superadmin", "masteradmin"]),
  getScheduledNotificationTemplate
);
router.post(
  "/scheduled-notifications/upload",
  checkForAuthenticationCookie(),
  authorizeRoles(["admin", "superadmin", "masteradmin"]),
  spreadsheetUpload.single("file"),
  uploadScheduledNotifications
);
router.get(
  "/scheduled-notifications",
  checkForAuthenticationCookie(),
  authorizeRoles(["admin", "superadmin", "masteradmin"]),
  listScheduledNotificationBatches
);
router.get(
  "/scheduled-notifications/groups",
  checkForAuthenticationCookie(),
  authorizeRoles(["admin", "superadmin", "masteradmin"]),
  getScheduledNotificationGroups
);
router.get(
  "/scheduled-notifications/history",
  checkForAuthenticationCookie(),
  authorizeRoles(["admin", "superadmin", "masteradmin"]),
  getScheduledNotificationHistory
);
router.get(
  "/scheduled-notifications/:batchId",
  checkForAuthenticationCookie(),
  authorizeRoles(["admin", "superadmin", "masteradmin"]),
  getScheduledNotificationBatch
);
router.patch(
  "/scheduled-notifications/items/:itemId",
  checkForAuthenticationCookie(),
  authorizeRoles(["admin", "superadmin", "masteradmin"]),
  updateScheduledNotificationItem
);
router.post(
  "/scheduled-notifications/items/:itemId/cancel",
  checkForAuthenticationCookie(),
  authorizeRoles(["admin", "superadmin", "masteradmin"]),
  cancelScheduledNotificationItem
);
router.post(
  "/scheduled-notifications/:batchId/cancel",
  checkForAuthenticationCookie(),
  authorizeRoles(["admin", "superadmin", "masteradmin"]),
  cancelScheduledNotificationBatch
);
router.delete(
  "/scheduled-notifications/:batchId",
  checkForAuthenticationCookie(),
  authorizeRoles(["admin", "superadmin", "masteradmin"]),
  deleteScheduledNotificationBatch
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

// WhatsApp auth settings routes
router.get(
  "/whatsapp-auth/settings",
  checkForAuthenticationCookie(),
  authorizeRoles(["admin", "superadmin", "masteradmin"]),
  getWhatsappAuthSettings
);
router.put(
  "/whatsapp-auth/settings",
  checkForAuthenticationCookie(),
  authorizeRoles(["admin", "superadmin", "masteradmin"]),
  updateWhatsappAuthSettings
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

router.get(
  "/payout-requests",
  checkForAuthenticationCookie(),
  authorizeRoles(["admin", "superadmin", "masteradmin"]),
  getAstrologerPayoutRequests
);

router.post(
  "/payout-requests/:payoutRequestId/pay",
  checkForAuthenticationCookie(),
  authorizeRoles(["admin", "superadmin", "masteradmin"]),
  markPayoutRequestPaid
);

router.post(
  "/payout-requests/:payoutRequestId/reject",
  checkForAuthenticationCookie(),
  authorizeRoles(["admin", "superadmin", "masteradmin"]),
  rejectPayoutRequest
);

// Jobs management routes
router.post(
  "/jobs",
  checkForAuthenticationCookie(),
  authorizeRoles(["admin", "superadmin", "masteradmin"]),
  createJob
);

router.get(
  "/jobs",
  checkForAuthenticationCookie(),
  authorizeRoles(["admin", "superadmin", "masteradmin"]),
  getAdminJobs
);

router.patch(
  "/jobs/:jobId/status",
  checkForAuthenticationCookie(),
  authorizeRoles(["admin", "superadmin", "masteradmin"]),
  updateJobStatus
);

router.get(
  "/job-applications",
  checkForAuthenticationCookie(),
  authorizeRoles(["admin", "superadmin", "masteradmin"]),
  getAdminJobApplications
);

router.get(
  "/job-applications/:applicationId",
  checkForAuthenticationCookie(),
  authorizeRoles(["admin", "superadmin", "masteradmin"]),
  getAdminJobApplicationById
);

router.get(
  "/job-applications/:applicationId/resume",
  checkForAuthenticationCookie(),
  authorizeRoles(["admin", "superadmin", "masteradmin"]),
  getAdminJobApplicationResume
);

router.patch(
  "/job-applications/:applicationId/accept",
  checkForAuthenticationCookie(),
  authorizeRoles(["admin", "superadmin", "masteradmin"]),
  acceptJobApplication
);

router.patch(
  "/job-applications/:applicationId/reject",
  checkForAuthenticationCookie(),
  authorizeRoles(["admin", "superadmin", "masteradmin"]),
  rejectJobApplication
);

router.get(
  "/palm/refunds",
  checkForAuthenticationCookie(),
  authorizeRoles(["admin", "superadmin", "masteradmin"]),
  getPalmFailureCandidates
);

router.post(
  "/palm/queue/cleanup",
  checkForAuthenticationCookie(),
  authorizeRoles(["admin", "superadmin", "masteradmin"]),
  cleanupPalmQueue
);

module.exports = router;
