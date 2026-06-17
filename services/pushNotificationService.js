const admin = require("../config/firebaseConfig");
const DeviceToken = require("../model/user/deviceToken");
const AstrologerDeviceToken = require("../model/astrologer/astrologerDeviceToken");
const User = require("../model/user/userAuth");
const { Op } = require("sequelize");

const CHAT_ALERTS_CHANNEL_ID = "graho_chat_alerts";

class PushNotificationService {

  async sendToTokenModel(TokenModel, ownerKey, ownerId, { title, body, data = {}, imageUrl = null }) {
    const tokens = await TokenModel.findAll({
      where: {
        [ownerKey]: ownerId,
        isActive: true,
      },
      attributes: ["id", "token", "deviceType"],
    });

    if (!tokens || tokens.length === 0) {
      console.log(`[FCM] No active device tokens found for ${ownerKey}=${ownerId}`);
      return { success: false, message: "No device tokens found" };
    }

    const fcmTokens = tokens.map((t) => t.token);
    const isChatRequest = data?.type === "chat_request";
    const requestExpiresAt = data?.requestExpiresAt
      ? new Date(data.requestExpiresAt).getTime()
      : null;
    const ttlMs = isChatRequest
      ? Math.max(1, Math.min(30000, requestExpiresAt ? requestExpiresAt - Date.now() : 30000))
      : undefined;

    const message = {
      notification: {
        title,
        body,
        ...(imageUrl && { imageUrl }),
      },
      data: {
        ...data,
        ownerId: String(ownerId),
        timestamp: new Date().toISOString(),
      },
      android: {
        priority: "high",
        ...(ttlMs ? { ttl: ttlMs } : {}),
        ...(isChatRequest ? { collapseKey: `chat-request-${data.sessionId}` } : {}),
        notification: {
          channelId: CHAT_ALERTS_CHANNEL_ID,
          ...(isChatRequest ? { tag: `chat-request-${data.sessionId}` } : {}),
          priority: isChatRequest ? "max" : "high",
          visibility: "public",
          defaultSound: true,
          defaultVibrateTimings: true,
          defaultLightSettings: true,
        },
      },
      apns: {
        headers: {
          "apns-priority": "10",
          ...(ttlMs ? { "apns-expiration": String(Math.floor((Date.now() + ttlMs) / 1000)) } : {}),
        },
        ...(isChatRequest
          ? {
              payload: {
                aps: {
                  sound: "default",
                  interruptionLevel: "time-sensitive",
                  category: "CHAT_REQUEST",
                },
              },
            }
          : {}),
      },
      tokens: fcmTokens,
    };

    const response = await admin.messaging().sendEachForMulticast(message);

    console.log(
      `[FCM] Sent to ${ownerKey}=${ownerId}: ${response.successCount} success, ${response.failureCount} failures`
    );

    if (response.failureCount > 0) {
      const failedTokens = [];
      response.responses.forEach((resp, idx) => {
        if (!resp.success) {
          const errorCode = resp.error?.code;
          if (
            errorCode === "messaging/invalid-registration-token" ||
            errorCode === "messaging/registration-token-not-registered"
          ) {
            failedTokens.push(tokens[idx].id);
          }
        }
      });

      if (failedTokens.length > 0) {
        await TokenModel.update(
          { isActive: false },
          { where: { id: failedTokens } }
        );
        console.log(`[FCM] Marked ${failedTokens.length} invalid tokens as inactive`);
      }
    }

    return {
      success: true,
      successCount: response.successCount,
      failureCount: response.failureCount,
    };
  }

  async sendToUser(userId, { title, body, data = {}, imageUrl = null }) {
    try {
      return await this.sendToTokenModel(DeviceToken, "userId", userId, {
        title,
        body,
        data,
        imageUrl,
      });
    } catch (error) {
      console.error("[FCM] Error sending to user:", error);
      throw error;
    }
  }

  async sendToAstrologer(astrologerId, { title, body, data = {}, imageUrl = null }) {
    try {
      return await this.sendToTokenModel(
        AstrologerDeviceToken,
        "astrologerId",
        astrologerId,
        {
          title,
          body,
          data,
          imageUrl,
        }
      );
    } catch (error) {
      console.error("[FCM] Error sending to astrologer:", error);
      throw error;
    }
  }

  /**
   * Send push notification to multiple users
   */
  async sendToMultipleUsers(userIds, { title, body, data = {}, imageUrl = null }) {
    try {
      const results = await Promise.allSettled(
        userIds.map((userId) =>
          this.sendToUser(userId, { title, body, data, imageUrl })
        )
      );

      const deliveredUserIds = [];
      const failedUserIds = [];

      results.forEach((result, index) => {
        const userId = userIds[index];
        const delivered =
          result.status === "fulfilled" &&
          result.value.success &&
          (result.value.successCount ?? 0) > 0;

        if (delivered) {
          deliveredUserIds.push(userId);
        } else {
          failedUserIds.push(userId);
        }
      });

      const successCount = deliveredUserIds.length;

      console.log(`[FCM] Sent to ${successCount}/${userIds.length} users`);

      return {
        success: true,
        totalUsers: userIds.length,
        successCount,
        failureCount: failedUserIds.length,
        attemptedUserIds: userIds,
        deliveredUserIds,
        failedUserIds,
      };
    } catch (error) {
      console.error("[FCM] Error sending to multiple users:", error);
      throw error;
    }
  }

  /**
   * Broadcast push notification to all users with active tokens
   */
  async broadcastToAll({ title, body, data = {}, imageUrl = null }) {
    try {
      // Get all users with active device tokens
      const activeUsers = await DeviceToken.findAll({
        where: { isActive: true },
        attributes: ["userId"],
        group: ["userId"],
        raw: true,
      });

      const userIds = activeUsers.map((u) => u.userId);

      if (userIds.length === 0) {
        console.log("[FCM] No users with active device tokens found");
        return { success: false, message: "No active users found" };
      }

      console.log(`[FCM] Broadcasting to ${userIds.length} users`);

      const result = await this.sendToMultipleUsers(userIds, {
        title,
        body,
        data,
        imageUrl,
      });

      return {
        ...result,
        activeUserIds: userIds,
      };
    } catch (error) {
      console.error("[FCM] Error broadcasting to all:", error);
      throw error;
    }
  }

  /**
   * Send notification to a specific topic
   */
  async sendToTopic(topic, { title, body, data = {}, imageUrl = null }) {
    try {
      const message = {
        notification: {
          title,
          body,
          ...(imageUrl && { imageUrl }),
        },
        data: {
          ...data,
          timestamp: new Date().toISOString(),
        },
        android: {
          priority: 'high',
          notification: {
            channelId: CHAT_ALERTS_CHANNEL_ID,
            priority: "max",
            visibility: "public",
            defaultSound: true,
            defaultVibrateTimings: true,
            defaultLightSettings: true,
          },
        },
        apns: {
          headers: {
            'apns-priority': '10',
          },
        },
        topic,
      };

      const response = await admin.messaging().send(message);
      console.log(`[FCM] Sent to topic ${topic}:`, response);

      return { success: true, messageId: response };
    } catch (error) {
      console.error("[FCM] Error sending to topic:", error);
      throw error;
    }
  }

  /**
   * Subscribe device tokens to a topic
   */
  async subscribeToTopic(tokens, topic) {
    try {
      const response = await admin.messaging().subscribeToTopic(tokens, topic);
      console.log(`[FCM] Subscribed ${response.successCount} tokens to topic ${topic}`);
      return response;
    } catch (error) {
      console.error("[FCM] Error subscribing to topic:", error);
      throw error;
    }
  }

  /**
   * Unsubscribe device tokens from a topic
   */
  async unsubscribeFromTopic(tokens, topic) {
    try {
      const response = await admin.messaging().unsubscribeFromTopic(tokens, topic);
      console.log(`[FCM] Unsubscribed ${response.successCount} tokens from topic ${topic}`);
      return response;
    } catch (error) {
      console.error("[FCM] Error unsubscribing from topic:", error);
      throw error;
    }
  }

  /**
   * Save or update device token for a user
   */
  async saveDeviceToken(userId, token, deviceType = "android", deviceId = null) {
    try {
      // Check if token already exists
      const existingToken = await DeviceToken.findOne({
        where: { token },
      });

      if (existingToken) {
        // Update existing token
        await existingToken.update({
          userId,
          deviceType,
          deviceId,
          isActive: true,
          lastUsedAt: new Date(),
        });
        console.log(`[FCM] Updated existing token for user ${userId}`);
        return existingToken;
      } else {
        // Create new token
        const newToken = await DeviceToken.create({
          userId,
          token,
          deviceType,
          deviceId,
          isActive: true,
          lastUsedAt: new Date(),
        });
        console.log(`[FCM] Created new token for user ${userId}`);
        return newToken;
      }
    } catch (error) {
      console.error("[FCM] Error saving device token:", error);
      throw error;
    }
  }

  /**
   * Remove device token
   */
  async removeDeviceToken(token) {
    try {
      const result = await DeviceToken.destroy({
        where: { token },
      });
      console.log(`[FCM] Removed token: ${result > 0 ? "success" : "not found"}`);
      return result > 0;
    } catch (error) {
      console.error("[FCM] Error removing device token:", error);
      throw error;
    }
  }

  async saveAstrologerDeviceToken(astrologerId, token, deviceType = "android", deviceId = null, deviceName = null) {
    try {
      const existingToken = await AstrologerDeviceToken.findOne({ where: { token } });

      if (existingToken) {
        await existingToken.update({
          astrologerId,
          deviceType,
          deviceId,
          deviceName,
          isActive: true,
          lastUsedAt: new Date(),
        });
        console.log(`[FCM] Updated existing token for astrologer ${astrologerId}`);
        return existingToken;
      }

      const newToken = await AstrologerDeviceToken.create({
        astrologerId,
        token,
        deviceType,
        deviceId,
        deviceName,
        isActive: true,
        lastUsedAt: new Date(),
      });
      console.log(`[FCM] Created new token for astrologer ${astrologerId}`);
      return newToken;
    } catch (error) {
      console.error("[FCM] Error saving astrologer device token:", error);
      throw error;
    }
  }

  async removeAstrologerDeviceToken(token) {
    try {
      const result = await AstrologerDeviceToken.destroy({ where: { token } });
      console.log(`[FCM] Removed astrologer token: ${result > 0 ? "success" : "not found"}`);
      return result > 0;
    } catch (error) {
      console.error("[FCM] Error removing astrologer token:", error);
      throw error;
    }
  }

  async deactivateAstrologerDeviceTokens(astrologerId, options = {}) {
    try {
      const where = {
        astrologerId,
        isActive: true,
      };

      if (options.deviceId) {
        where.deviceId = options.deviceId;
      }

      if (options.exceptDeviceId) {
        where.deviceId = { [Op.ne]: options.exceptDeviceId };
      }

      const result = await AstrologerDeviceToken.update(
        { isActive: false },
        { where }
      );
      console.log(`[FCM] Deactivated ${result[0]} astrologer tokens`);
      return result[0];
    } catch (error) {
      console.error("[FCM] Error deactivating astrologer tokens:", error);
      throw error;
    }
  }

  async getAstrologerTokens(astrologerId) {
    try {
      return await AstrologerDeviceToken.findAll({
        where: {
          astrologerId,
          isActive: true,
        },
      });
    } catch (error) {
      console.error("[FCM] Error getting astrologer tokens:", error);
      throw error;
    }
  }

  /**
   * Get all device tokens for a user
   */
  async getUserTokens(userId) {
    try {
      const tokens = await DeviceToken.findAll({
        where: {
          userId,
          isActive: true,
        },
      });
      return tokens;
    } catch (error) {
      console.error("[FCM] Error getting user tokens:", error);
      throw error;
    }
  }

  /**
   * Deactivate old/unused tokens (older than 90 days)
   */
  async cleanupOldTokens() {
    try {
      const ninetyDaysAgo = new Date();
      ninetyDaysAgo.setDate(ninetyDaysAgo.getDate() - 90);

      const result = await DeviceToken.update(
        { isActive: false },
        {
          where: {
            lastUsedAt: {
              [Op.lt]: ninetyDaysAgo,
            },
            isActive: true,
          },
        }
      );

      console.log(`[FCM] Deactivated ${result[0]} old tokens`);
      return result[0];
    } catch (error) {
      console.error("[FCM] Error cleaning up old tokens:", error);
      throw error;
    }
  }
}

module.exports = new PushNotificationService();
