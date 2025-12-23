const admin = require("../config/firebaseConfig");
const DeviceToken = require("../model/user/deviceToken");
const User = require("../model/user/userAuth");
const { Op } = require("sequelize");

class PushNotificationService {
  /**
   * Send push notification to a single user by userId
   */
  async sendToUser(userId, { title, body, data = {}, imageUrl = null }) {
    try {
      // Get all active device tokens for this user
      const tokens = await DeviceToken.findAll({
        where: {
          userId,
          isActive: true,
        },
        attributes: ["id", "token", "deviceType"],
      });

      if (!tokens || tokens.length === 0) {
        console.log(`[FCM] No active device tokens found for user ${userId}`);
        return { success: false, message: "No device tokens found" };
      }

      const fcmTokens = tokens.map((t) => t.token);
      
      const message = {
        notification: {
          title,
          body,
          ...(imageUrl && { imageUrl }),
        },
        data: {
          ...data,
          userId: userId.toString(),
          timestamp: new Date().toISOString(),
        },
        android: {
          priority: 'high',
        },
        apns: {
          headers: {
            'apns-priority': '10',
          },
        },
        tokens: fcmTokens,
      };

      // Send multicast message
      const response = await admin.messaging().sendEachForMulticast(message);

      console.log(`[FCM] Sent to user ${userId}: ${response.successCount} success, ${response.failureCount} failures`);

      // Handle invalid tokens
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

        // Mark invalid tokens as inactive
        if (failedTokens.length > 0) {
          await DeviceToken.update(
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
    } catch (error) {
      console.error("[FCM] Error sending to user:", error);
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

      const successCount = results.filter(
        (r) => r.status === "fulfilled" && r.value.success
      ).length;

      console.log(`[FCM] Sent to ${successCount}/${userIds.length} users`);

      return {
        success: true,
        totalUsers: userIds.length,
        successCount,
        failureCount: userIds.length - successCount,
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

      return await this.sendToMultipleUsers(userIds, {
        title,
        body,
        data,
        imageUrl,
      });
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
