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
const checkForAuthenticationCookie = require("../../middleware/authMiddleware");
const { authorizeRoles } = require("../../middleware/roleMiddleware");

router.get("/push/public-key", getWebPushPublicKey);

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
