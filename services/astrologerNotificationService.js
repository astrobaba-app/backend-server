const { Op, literal } = require("sequelize");
const Astrologer = require("../model/astrologer/astrologer");
const AstrologerDeviceToken = require("../model/astrologer/astrologerDeviceToken");
const AstrologerNotification = require("../model/notification/astrologerNotification");
const pushNotificationService = require("./pushNotificationService");

class AstrologerNotificationService {
  async sendToAstrologer(
    astrologerId,
    { type, title, message, data = {}, actionUrl = null, priority = "medium", sendPush = true }
  ) {
    const astrologer = await Astrologer.findByPk(astrologerId, {
      attributes: ["id"],
    });

    if (!astrologer) {
      return null;
    }

    const notification = await AstrologerNotification.create({
      astrologerId,
      type,
      title,
      message,
      data,
      actionUrl,
      priority,
    });

    if (sendPush) {
      try {
        const stringifiedData = {};
        for (const [key, value] of Object.entries(data || {})) {
          stringifiedData[key] = String(value);
        }

        const pushResult = await pushNotificationService.sendToAstrologer(
          astrologerId,
          {
            title,
            body: message,
            data: {
              ...stringifiedData,
              type: String(type),
              notificationId: String(notification.id),
              actionUrl: String(actionUrl || ""),
            },
          }
        );

        await notification.update({
          pushAttemptCount: literal('"pushAttemptCount" + 1'),
          pushLastAttemptAt: new Date(),
          pushDeliveredAt:
            pushResult?.success && (pushResult.successCount ?? 0) > 0
              ? new Date()
              : null,
          pushLastError:
            pushResult?.success && (pushResult.successCount ?? 0) > 0
              ? null
              : pushResult?.message || "No active device token delivered",
        });
      } catch (error) {
        await notification.update({
          pushAttemptCount: literal('"pushAttemptCount" + 1'),
          pushLastAttemptAt: new Date(),
          pushLastError: error.message || "FCM delivery failed",
        });
      }
    }

    return notification;
  }

  async sendToAstrologers(
    astrologerIds,
    { type, title, message, data = {}, actionUrl = null, priority = "medium", sendPush = true }
  ) {
    const uniqueAstrologerIds = Array.from(
      new Set((astrologerIds || []).map((id) => String(id)).filter(Boolean))
    );

    if (!uniqueAstrologerIds.length) {
      return {
        success: true,
        totalSent: 0,
        pushSuccessCount: 0,
        pushFailureCount: 0,
      };
    }

    const astrologers = await Astrologer.findAll({
      where: { id: uniqueAstrologerIds },
      attributes: ["id"],
    });
    const validAstrologerIds = astrologers.map((item) => String(item.id));

    if (!validAstrologerIds.length) {
      return {
        success: true,
        totalSent: 0,
        pushSuccessCount: 0,
        pushFailureCount: 0,
      };
    }

    const notifications = await Promise.all(
      validAstrologerIds.map((astrologerId) =>
        AstrologerNotification.create({
          astrologerId,
          type,
          title,
          message,
          data,
          actionUrl,
          priority,
        })
      )
    );
    const notificationIdsByAstrologerId = new Map(
      notifications.map((notification) => [
        String(notification.astrologerId),
        notification.id,
      ])
    );

    let pushSuccessCount = 0;
    let pushFailureCount = 0;

    if (sendPush) {
      try {
        const stringifiedData = {};
        for (const [key, value] of Object.entries(data || {})) {
          stringifiedData[key] = String(value);
        }

        const pushResult = await pushNotificationService.sendToMultipleAstrologers(
          validAstrologerIds,
          {
            title,
            body: message,
            data: {
              ...stringifiedData,
              type: String(type),
              actionUrl: String(actionUrl || ""),
            },
          }
        );

        pushSuccessCount = pushResult?.successCount ?? 0;
        pushFailureCount = pushResult?.failureCount ?? 0;

        const attemptedNotificationIds = (pushResult?.attemptedAstrologerIds || [])
          .map((astrologerId) =>
            notificationIdsByAstrologerId.get(String(astrologerId))
          )
          .filter(Boolean);
        const deliveredNotificationIds = (pushResult?.deliveredAstrologerIds || [])
          .map((astrologerId) =>
            notificationIdsByAstrologerId.get(String(astrologerId))
          )
          .filter(Boolean);
        const failedNotificationIds = (pushResult?.failedAstrologerIds || [])
          .map((astrologerId) =>
            notificationIdsByAstrologerId.get(String(astrologerId))
          )
          .filter(Boolean);

        if (attemptedNotificationIds.length) {
          await AstrologerNotification.update(
            {
              pushAttemptCount: literal('"pushAttemptCount" + 1'),
              pushLastAttemptAt: new Date(),
            },
            { where: { id: attemptedNotificationIds } }
          );
        }

        if (deliveredNotificationIds.length) {
          await AstrologerNotification.update(
            {
              pushDeliveredAt: new Date(),
              pushLastError: null,
            },
            { where: { id: deliveredNotificationIds } }
          );
        }

        if (failedNotificationIds.length) {
          await AstrologerNotification.update(
            {
              pushLastError: "FCM delivery failed",
            },
            { where: { id: failedNotificationIds } }
          );
        }
      } catch (error) {
        pushFailureCount = validAstrologerIds.length;
      }
    }

    return {
      success: true,
      totalSent: validAstrologerIds.length,
      pushSuccessCount,
      pushFailureCount,
    };
  }

  async broadcastToAllAstrologers(payload) {
    const astrologers = await Astrologer.findAll({
      attributes: ["id"],
    });

    return this.sendToAstrologers(
      astrologers.map((item) => String(item.id)),
      payload
    );
  }

  async getUnreadCount(astrologerId) {
    return AstrologerNotification.count({
      where: {
        astrologerId,
        isRead: false,
      },
    });
  }

  async markAsRead(notificationId, astrologerId) {
    const notification = await AstrologerNotification.findOne({
      where: { id: notificationId, astrologerId },
    });

    if (!notification) {
      throw new Error("Notification not found");
    }

    if (!notification.isRead) {
      await notification.update({
        isRead: true,
        readAt: new Date(),
      });
    }

    return notification;
  }

  async markAllAsRead(astrologerId) {
    await AstrologerNotification.update(
      {
        isRead: true,
        readAt: new Date(),
      },
      {
        where: {
          astrologerId,
          isRead: false,
        },
      }
    );
  }
}

module.exports = new AstrologerNotificationService();
