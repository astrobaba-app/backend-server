const express = require("express");
const router = express.Router();
const {
  getNotifications,
  markAsRead,
  markAllAsRead,
  deleteNotification,
  getUnreadCount,
  registerDeviceToken,
  removeDeviceToken,
  getUserTokens,
  sendTestNotification,
  getWebPushPublicKey,
  subscribeWebPush,
  unsubscribeWebPush,
} = require("../../controller/notification/notificationController");
const {
  getAstrologerNotifications,
  getAstrologerUnreadCount,
  markAstrologerNotificationAsRead,
  markAllAstrologerNotificationsAsRead,
  deleteAstrologerNotification,
} = require("../../controller/notification/astrologerNotificationController");
const checkForAuthenticationCookie = require("../../middleware/authMiddleware");
const { authorizeRoles } = require("../../middleware/roleMiddleware");

router.get("/push/public-key", getWebPushPublicKey);

router.get(
  "/astrologer",
  checkForAuthenticationCookie(),
  authorizeRoles(["astrologer"]),
  getAstrologerNotifications
);
router.get(
  "/astrologer/unread-count",
  checkForAuthenticationCookie(),
  authorizeRoles(["astrologer"]),
  getAstrologerUnreadCount
);
router.patch(
  "/astrologer/read-all",
  checkForAuthenticationCookie(),
  authorizeRoles(["astrologer"]),
  markAllAstrologerNotificationsAsRead
);
router.patch(
  "/astrologer/:notificationId/read",
  checkForAuthenticationCookie(),
  authorizeRoles(["astrologer"]),
  markAstrologerNotificationAsRead
);
router.delete(
  "/astrologer/:notificationId",
  checkForAuthenticationCookie(),
  authorizeRoles(["astrologer"]),
  deleteAstrologerNotification
);

// All routes require user authentication
router.get("/", checkForAuthenticationCookie(), getNotifications);
router.get("/unread-count", checkForAuthenticationCookie(), getUnreadCount);
router.patch("/:notificationId/read", checkForAuthenticationCookie(), markAsRead);
router.patch("/read-all", checkForAuthenticationCookie(), markAllAsRead);
router.delete("/:notificationId", checkForAuthenticationCookie(), deleteNotification);

// Device token routes for push notifications
router.post("/device-token", checkForAuthenticationCookie(), registerDeviceToken);
router.delete("/device-token", checkForAuthenticationCookie(), removeDeviceToken);
router.get("/device-tokens", checkForAuthenticationCookie(), getUserTokens);

// Test notification route
router.post("/test", checkForAuthenticationCookie(), sendTestNotification);

router.post(
  "/push/subscribe",
  checkForAuthenticationCookie(),
  authorizeRoles(["astrologer"]),
  subscribeWebPush
);

router.delete(
  "/push/unsubscribe",
  checkForAuthenticationCookie(),
  authorizeRoles(["astrologer"]),
  unsubscribeWebPush
);

module.exports = router;
