const express = require("express");
const router = express.Router();
const {
  getNotifications,
  markAsRead,
  markAllAsRead,
  deleteNotification,
  getUnreadCount,
} = require("../../controller/notification/notificationController");
const checkForAuthenticationCookie = require("../../middleware/authMiddleware");

// All routes require user authentication
router.get("/", checkForAuthenticationCookie(), getNotifications);
router.get("/unread-count", checkForAuthenticationCookie(), getUnreadCount);
router.patch("/:notificationId/read", checkForAuthenticationCookie(), markAsRead);
router.patch("/read-all", checkForAuthenticationCookie(), markAllAsRead);
router.delete("/:notificationId", checkForAuthenticationCookie(), deleteNotification);

module.exports = router;
