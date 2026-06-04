const Notification = require("../model/notification/notification");
const User = require("../model/user/userAuth");
const BroadcastLog = require("../model/admin/broadcastLog");
const DeviceToken = require("../model/user/deviceToken");
const pushNotificationService = require("./pushNotificationService");
const { Op, literal } = require("sequelize");

const PENDING_PUSH_LIMIT = 20;
const MAX_PUSH_ATTEMPTS = 3;
const PENDING_PUSH_MAX_AGE_DAYS = 7;

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
          // Convert all data values to strings (FCM requirement)
          const stringifiedData = {};
          for (const [key, value] of Object.entries(data)) {
            stringifiedData[key] = String(value);
          }

          await pushNotificationService.sendToUser(userId, {
            title,
            body: message,
            data: {
              ...stringifiedData,
              type: String(type),
              notificationId: String(notification.id),
              actionUrl: String(actionUrl || ""),
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
      const pushEligibleUsers = sendPush
        ? await DeviceToken.findAll({
            attributes: ["userId"],
            group: ["userId"],
            raw: true,
          })
        : [];
      const pushEligibleUserIds = new Set(
        pushEligibleUsers.map((token) => String(token.userId)).filter(Boolean)
      );

      // Create notification for each user
      const notifications = await Promise.all(
        users.map((user) => {
          const userId = String(user.id);
          const pushResendEligible =
            type === "admin_broadcast" && pushEligibleUserIds.has(userId);

          return Notification.create({
            userId: user.id,
            type,
            title,
            message,
            data: {
              ...data,
              pushResendEligible,
            },
            actionUrl,
            priority,
          });
        })
      );
      const notificationIdsByUserId = new Map(
        notifications.map((notification) => [String(notification.userId), notification.id])
      );

      // Send push notifications via FCM
      let pushSuccessCount = 0;
      let pushFailureCount = 0;
      if (sendPush) {
        try {
          // Convert all data values to strings (FCM requirement)
          const stringifiedData = {};
          for (const [key, value] of Object.entries(data)) {
            stringifiedData[key] = String(value);
          }

          const pushResult = await pushNotificationService.broadcastToAll({
            title,
            body: message,
            data: {
              ...stringifiedData,
              type: String(type),
              actionUrl: String(actionUrl || ""),
            },
          });
          pushSuccessCount = pushResult?.successCount ?? 0;
          pushFailureCount = pushResult?.failureCount ?? 0;

          const attemptedNotificationIds = (pushResult?.attemptedUserIds || [])
            .map((userId) => notificationIdsByUserId.get(String(userId)))
            .filter(Boolean);
          const deliveredNotificationIds = (pushResult?.deliveredUserIds || [])
            .map((userId) => notificationIdsByUserId.get(String(userId)))
            .filter(Boolean);
          const failedNotificationIds = (pushResult?.failedUserIds || [])
            .map((userId) => notificationIdsByUserId.get(String(userId)))
            .filter(Boolean);

          if (attemptedNotificationIds.length) {
            await Notification.update(
              {
                pushAttemptCount: literal('"pushAttemptCount" + 1'),
                pushLastAttemptAt: new Date(),
              },
              { where: { id: attemptedNotificationIds } }
            );
          }

          if (deliveredNotificationIds.length) {
            await Notification.update(
              {
                pushDeliveredAt: new Date(),
                pushLastError: null,
              },
              { where: { id: deliveredNotificationIds } }
            );
          }

          if (failedNotificationIds.length) {
            await Notification.update(
              {
                pushLastError: "FCM delivery failed",
              },
              { where: { id: failedNotificationIds } }
            );
          }
        } catch (pushError) {
          console.error("Error sending broadcast push notification:", pushError);
          // Don't fail the entire notification if push fails
        }
      }

      return {
        success: true,
        totalSent: sendPush ? pushEligibleUserIds.size : notifications.length,
        totalInAppCount: notifications.length,
        pushSuccessCount,
        pushFailureCount,
        pushPendingCount: Math.max(pushEligibleUserIds.size - pushSuccessCount, 0),
      };
    } catch (error) {
      console.error("Error broadcasting notification:", error);
      throw error;
    }
  }

  async sendPendingPushToUser(userId, limit = PENDING_PUSH_LIMIT) {
    try {
      const maxAge = new Date();
      maxAge.setDate(maxAge.getDate() - PENDING_PUSH_MAX_AGE_DAYS);

      const pendingNotifications = await Notification.findAll({
        where: {
          userId,
          type: "admin_broadcast",
          pushDeliveredAt: null,
          data: {
            [Op.contains]: {
              pushResendEligible: true,
            },
          },
          createdAt: {
            [Op.gte]: maxAge,
          },
          pushAttemptCount: {
            [Op.lt]: MAX_PUSH_ATTEMPTS,
          },
          [Op.or]: [{ expiresAt: null }, { expiresAt: { [Op.gt]: new Date() } }],
        },
        order: [["createdAt", "DESC"]],
        limit,
      });

      if (!pendingNotifications.length) {
        return {
          success: true,
          attempted: 0,
          delivered: 0,
          failed: 0,
        };
      }

      let delivered = 0;
      let failed = 0;

      for (const notification of pendingNotifications) {
        await notification.update({
          pushAttemptCount: literal('"pushAttemptCount" + 1'),
          pushLastAttemptAt: new Date(),
        });

        try {
          const stringifiedData = {};
          for (const [key, value] of Object.entries(notification.data || {})) {
            stringifiedData[key] = String(value);
          }

          const result = await pushNotificationService.sendToUser(userId, {
            title: notification.title,
            body: notification.message,
            data: {
              ...stringifiedData,
              type: String(notification.type),
              notificationId: String(notification.id),
              actionUrl: String(notification.actionUrl || ""),
            },
          });

          if (result.success && (result.successCount ?? 0) > 0) {
            delivered += 1;
            await notification.update({
              pushDeliveredAt: new Date(),
              pushLastError: null,
            });

            const broadcastLogId = notification.data?.broadcastLogId;
            if (broadcastLogId) {
              await BroadcastLog.update(
                {
                  pushSuccessCount: literal('"pushSuccessCount" + 1'),
                  pushPendingCount: literal('GREATEST("pushPendingCount" - 1, 0)'),
                },
                { where: { id: broadcastLogId } }
              );
            }
          } else {
            failed += 1;
            await notification.update({
              pushLastError: result.message || "No active device token delivered",
            });
          }
        } catch (error) {
          failed += 1;
          await notification.update({
            pushLastError: error.message || "Pending push resend failed",
          });
        }
      }

      return {
        success: true,
        attempted: pendingNotifications.length,
        delivered,
        failed,
      };
    } catch (error) {
      console.error("Error sending pending push notifications:", error);
      return {
        success: false,
        attempted: 0,
        delivered: 0,
        failed: 0,
        error: error.message,
      };
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
