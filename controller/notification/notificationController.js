const Notification = require("../../model/notification/notification");
const notificationService = require("../../services/notificationService");
const pushNotificationService = require("../../services/pushNotificationService");
const webPushService = require("../../services/webPushService");
const Astrologer = require("../../model/astrologer/astrologer");

async function resolveActorType(req) {
  if (req.user?.role === "astrologer") return "astrologer";

  if (req.user?.id) {
    const astrologer = await Astrologer.findByPk(req.user.id, { attributes: ["id"] });
    if (astrologer) return "astrologer";
  }

  return "user";
}

// Get user notifications
const getNotifications = async (req, res) => {
  try {
    const userId = req.user.id;
    const { page = 1, limit = 50, isRead } = req.query;
    const offset = (page - 1) * limit;

    const where = { userId };
    if (isRead !== undefined) {
      where.isRead = isRead === "true";
    }

    const { rows: notifications, count } = await Notification.findAndCountAll({
      where,
      order: [["createdAt", "DESC"]],
      limit: parseInt(limit),
      offset: parseInt(offset),
    });

    // Count unread
    const unreadCount = await Notification.count({
      where: { userId, isRead: false },
    });

    res.status(200).json({
      success: true,
      notifications,
      unreadCount,
      pagination: {
        total: count,
        page: parseInt(page),
        limit: parseInt(limit),
        totalPages: Math.ceil(count / limit),
      },
    });
  } catch (error) {
    console.error("Get notifications error:", error);
    res.status(500).json({
      success: false,
      message: "Failed to fetch notifications",
      error: error.message,
    });
  }
};

// Mark notification as read
const markAsRead = async (req, res) => {
  try {
    const userId = req.user.id;
    const { notificationId } = req.params;

    await notificationService.markAsRead(notificationId, userId);

    res.status(200).json({
      success: true,
      message: "Notification marked as read",
    });
  } catch (error) {
    console.error("Mark as read error:", error);
    res.status(500).json({
      success: false,
      message: error.message || "Failed to mark notification as read",
    });
  }
};

// Mark all notifications as read
const markAllAsRead = async (req, res) => {
  try {
    const userId = req.user.id;

    await notificationService.markAllAsRead(userId);

    res.status(200).json({
      success: true,
      message: "All notifications marked as read",
    });
  } catch (error) {
    console.error("Mark all as read error:", error);
    res.status(500).json({
      success: false,
      message: "Failed to mark all notifications as read",
    });
  }
};

// Delete notification
const deleteNotification = async (req, res) => {
  try {
    const userId = req.user.id;
    const { notificationId } = req.params;

    const notification = await Notification.findOne({
      where: { id: notificationId, userId },
    });

    if (!notification) {
      return res.status(404).json({
        success: false,
        message: "Notification not found",
      });
    }

    await notification.destroy();

    res.status(200).json({
      success: true,
      message: "Notification deleted successfully",
    });
  } catch (error) {
    console.error("Delete notification error:", error);
    res.status(500).json({
      success: false,
      message: "Failed to delete notification",
      error: error.message,
    });
  }
};

// Get unread count
const getUnreadCount = async (req, res) => {
  try {
    const userId = req.user.id;

    const unreadCount = await Notification.count({
      where: { userId, isRead: false },
    });

    res.status(200).json({
      success: true,
      unreadCount,
    });
  } catch (error) {
    console.error("Get unread count error:", error);
    res.status(500).json({
      success: false,
      message: "Failed to fetch unread count",
      error: error.message,
    });
  }
};

/**
 * Register device token for push notifications
 */
const registerDeviceToken = async (req, res) => {
  try {
    const { token, deviceType, deviceId, deviceName } = req.body;
    const actorId = req.user.id;
    const actorType = await resolveActorType(req);

    if (!token) {
      return res.status(400).json({
        success: false,
        message: "Device token is required",
      });
    }

    const savedToken =
      actorType === "astrologer"
        ? await pushNotificationService.saveAstrologerDeviceToken(
            actorId,
            token,
            deviceType || "android",
            deviceId,
            deviceName
          )
        : await pushNotificationService.saveDeviceToken(
            actorId,
            token,
            deviceType || "android",
            deviceId
          );

    const pendingPushResult =
      actorType === "user"
        ? await notificationService.sendPendingPushToUser(actorId)
        : null;

    res.status(200).json({
      success: true,
      message: "Device token registered successfully",
      data: {
        id: savedToken.id,
        deviceType: savedToken.deviceType,
        deviceName: savedToken.deviceName,
        actorType,
        pendingPush: pendingPushResult,
      },
    });
  } catch (error) {
    console.error("Error registering device token:", error);
    res.status(500).json({
      success: false,
      message: "Failed to register device token",
      error: error.message,
    });
  }
};

/**
 * Remove device token
 */
const removeDeviceToken = async (req, res) => {
  try {
    const { token } = req.body;
    const actorType = await resolveActorType(req);

    if (!token) {
      return res.status(400).json({
        success: false,
        message: "Device token is required",
      });
    }

    const removed =
      actorType === "astrologer"
        ? await pushNotificationService.removeAstrologerDeviceToken(token)
        : await pushNotificationService.removeDeviceToken(token);

    res.status(200).json({
      success: true,
      message: removed
        ? "Device token removed successfully"
        : "Device token not found",
    });
  } catch (error) {
    console.error("Error removing device token:", error);
    res.status(500).json({
      success: false,
      message: "Failed to remove device token",
      error: error.message,
    });
  }
};

/**
 * Get user's device tokens
 */
const getUserTokens = async (req, res) => {
  try {
    const actorId = req.user.id;
    const actorType = await resolveActorType(req);

    const tokens =
      actorType === "astrologer"
        ? await pushNotificationService.getAstrologerTokens(actorId)
        : await pushNotificationService.getUserTokens(actorId);

    res.status(200).json({
      success: true,
      actorType,
      data: tokens.map((t) => ({
        id: t.id,
        deviceType: t.deviceType,
        deviceId: t.deviceId,
        deviceName: t.deviceName,
        lastUsedAt: t.lastUsedAt,
      })),
    });
  } catch (error) {
    console.error("Error getting user tokens:", error);
    res.status(500).json({
      success: false,
      message: "Failed to get user tokens",
      error: error.message,
    });
  }
};

/**
 * Send test notification (for testing purposes)
 */
const sendTestNotification = async (req, res) => {
  try {
    const userId = req.user.id;

    await notificationService.sendToUser(userId, {
      type: "test",
      title: "Test Notification 🔔",
      message: "This is a test push notification from Graho",
      data: { test: true },
      priority: "high",
      sendPush: true,
    });

    res.status(200).json({
      success: true,
      message: "Test notification sent successfully",
    });
  } catch (error) {
    console.error("Error sending test notification:", error);
    res.status(500).json({
      success: false,
      message: "Failed to send test notification",
      error: error.message,
    });
  }
};

/**
 * Get VAPID public key for web push subscription.
 */
const getWebPushPublicKey = async (req, res) => {
  res.status(200).json({
    success: true,
    publicKey: process.env.WEB_PUSH_PUBLIC_KEY || null,
  });
};

/**
 * Save astrologer browser push subscription.
 */
const subscribeWebPush = async (req, res) => {
  try {
    const astrologerId = req.user.id;
    const { subscription } = req.body;

    if (!subscription) {
      return res.status(400).json({
        success: false,
        message: "Subscription payload is required",
      });
    }

    const saved = await webPushService.upsertAstrologerSubscription({
      astrologerId,
      subscription,
      userAgent: req.headers["user-agent"] || null,
    });

    res.status(200).json({
      success: true,
      message: "Web push subscription saved",
      data: { id: saved.id, endpoint: saved.endpoint },
    });
  } catch (error) {
    console.error("Subscribe web push error:", error);
    res.status(500).json({
      success: false,
      message: "Failed to save web push subscription",
      error: error.message,
    });
  }
};

/**
 * Deactivate astrologer browser push subscription.
 */
const unsubscribeWebPush = async (req, res) => {
  try {
    const astrologerId = req.user.id;
    const { endpoint } = req.body;

    if (!endpoint) {
      return res.status(400).json({
        success: false,
        message: "Endpoint is required",
      });
    }

    await webPushService.removeAstrologerSubscription({ astrologerId, endpoint });

    res.status(200).json({
      success: true,
      message: "Web push subscription removed",
    });
  } catch (error) {
    console.error("Unsubscribe web push error:", error);
    res.status(500).json({
      success: false,
      message: "Failed to remove web push subscription",
      error: error.message,
    });
  }
};

module.exports = {
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
};
