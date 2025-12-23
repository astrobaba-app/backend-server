const Notification = require("../model/notification/notification");
const User = require("../model/user/userAuth");
const pushNotificationService = require("./pushNotificationService");

class NotificationService {
  /**
   * Send notification to specific user
   */
  async sendToUser(userId, { type, title, message, data = {}, actionUrl = null, priority = "medium", sendPush = true }) {
    try {
      // Ensure the target user actually exists in the users table to
      // avoid foreign key violations (e.g. when passing an astrologerId).
      const user = await User.findByPk(userId, { attributes: ["id"] });

      if (!user) {
        console.warn(
          `NotificationService.sendToUser: user not found for id=${userId}, skipping notification of type=${type}`
        );
        return null;
      }

      const notification = await Notification.create({
        userId,
        type,
        title,
        message,
        data,
        actionUrl,
        priority,
      });

      // Send push notification via FCM
      if (sendPush) {
        try {
          await pushNotificationService.sendToUser(userId, {
            title,
            body: message,
            data: {
              ...data,
              type,
              notificationId: notification.id,
              actionUrl: actionUrl || "",
            },
          });
        } catch (pushError) {
          console.error("Error sending push notification:", pushError);
          // Don't fail the entire notification if push fails
        }
      }

      return notification;
    } catch (error) {
      console.error("Error sending notification to user:", error);
      throw error;
    }
  }

  /**
   * Broadcast notification to all users
   */
  async broadcastToAll({ type, title, message, data = {}, actionUrl = null, priority = "medium", sendPush = true }) {
    try {
      // Get all users (User model doesn't have isActive column)
      const users = await User.findAll({
        attributes: ["id"],
      });

      // Create notification for each user
      const notifications = await Promise.all(
        users.map((user) =>
          Notification.create({
            userId: user.id,
            type,
            title,
            message,
            data,
            actionUrl,
            priority,
          })
        )
      );

      // Send push notifications via FCM
      if (sendPush) {
        try {
          await pushNotificationService.broadcastToAll({
            title,
            body: message,
            data: {
              ...data,
              type,
              actionUrl: actionUrl || "",
            },
          });
        } catch (pushError) {
          console.error("Error sending broadcast push notification:", pushError);
          // Don't fail the entire notification if push fails
        }
      }

      return {
        success: true,
        totalSent: notifications.length,
      };
    } catch (error) {
      console.error("Error broadcasting notification:", error);
      throw error;
    }
  }

  /**
   * Notify users when astrologer goes live
   */
  async notifyLiveStarted(liveSession, astrologer) {
    const title = `${astrologer.fullName} is now LIVE! 🔴`;
    const message = `Join now: "${liveSession.title}" at ₹${liveSession.pricePerMinute}/min`;

    return await this.broadcastToAll({
      type: "live_started",
      title,
      message,
      data: {
        liveSessionId: liveSession.id,
        astrologerId: astrologer.id,
        astrologerName: astrologer.fullName,
        astrologerPhoto: astrologer.photo,
        pricePerMinute: liveSession.pricePerMinute,
        sessionType: liveSession.sessionType,
      },
      actionUrl: `/live/${liveSession.id}`,
      priority: "high",
    });
  }

  /**
   * Notify users about scheduled live session
   */
  async notifyLiveScheduled(liveSession, astrologer, scheduledAt) {
    const title = `Upcoming Live Session 📅`;
    const message = `${astrologer.fullName} will go live on ${new Date(scheduledAt).toLocaleString()}`;

    return await this.broadcastToAll({
      type: "live_scheduled",
      title,
      message,
      data: {
        liveSessionId: liveSession.id,
        astrologerId: astrologer.id,
        scheduledAt,
      },
      actionUrl: `/live/${liveSession.id}`,
      priority: "medium",
    });
  }

  /**
   * Notify astrologer about incoming call
   */
  async notifyIncomingCall(astrologerId, callSession, user) {
    return await this.sendToUser(astrologerId, {
      type: "call_incoming",
      title: "Incoming Call 📞",
      message: `${user.fullName} is calling you`,
      data: {
        callSessionId: callSession.id,
        userId: user.id,
        userName: user.fullName,
        callType: callSession.callType,
      },
      actionUrl: `/call/${callSession.id}`,
      priority: "urgent",
    });
  }

  /**
   * Notify user about missed call
   */
  async notifyMissedCall(userId, callSession, astrologer) {
    return await this.sendToUser(userId, {
      type: "call_missed",
      title: "Missed Call",
      message: `You missed a call from ${astrologer.fullName}`,
      data: {
        callSessionId: callSession.id,
        astrologerId: astrologer.id,
      },
      actionUrl: `/astrologer/${astrologer.id}`,
      priority: "medium",
    });
  }

  /**
   * Mark notification as read
   */
  async markAsRead(notificationId, userId) {
    const notification = await Notification.findOne({
      where: { id: notificationId, userId },
    });

    if (!notification) {
      throw new Error("Notification not found");
    }

    await notification.update({
      isRead: true,
      readAt: new Date(),
    });

    return notification;
  }

  /**
   * Mark all notifications as read for a user
   */
  async markAllAsRead(userId) {
    await Notification.update(
      {
        isRead: true,
        readAt: new Date(),
      },
      {
        where: { userId, isRead: false },
      }
    );
  }

  /**
   * Delete old notifications (cleanup job)
   */
  async deleteExpiredNotifications() {
    const deleted = await Notification.destroy({
      where: {
        expiresAt: {
          [require("sequelize").Op.lt]: new Date(),
        },
      },
    });

    return deleted;
  }
}

module.exports = new NotificationService();
