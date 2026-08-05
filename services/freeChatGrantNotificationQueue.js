const axios = require("axios");

const NOTIFICATION_SERVER_URL = process.env.NOTIFICATION_SERVER_URL || "http://localhost:6002";

const enqueueFreeChatGrantNotifications = async ({
  userIds,
  allocationsByUserId,
  notificationTitle,
  notificationBody,
}) => {
  const uniqueUserIds = Array.from(
    new Set((Array.isArray(userIds) ? userIds : []).filter(Boolean).map(String))
  );

  if (!uniqueUserIds.length) {
    return { queued: 0, createdNotifications: 0 };
  }

  try {
    // Offload all the heavy lifting (creating DB records, chunking, hitting FCM, queuing to Redis)
    // to the dedicated Notification Server so the Main Backend doesn't freeze.
    await axios.post(`${NOTIFICATION_SERVER_URL}/api/internal/notifications/free-chat-grant`, {
      userIds: uniqueUserIds,
      allocationsByUserId,
      notificationTitle,
      notificationBody
    }, {
      headers: {
        Authorization: `Bearer ${process.env.NOTIFICATION_INTERNAL_TOKEN}`
      }
    });

    return {
      queued: uniqueUserIds.length,
      createdNotifications: uniqueUserIds.length,
    };
  } catch (error) {
    console.error("[FreeChatGrantPush] Failed to proxy to Notification Server:", error.message);
    return { queued: 0, createdNotifications: 0 };
  }
};

const startFreeChatGrantNotificationWorker = () => {
  // Stub: The worker has been migrated to the Notification Server.
  // This stub exists so we don't break server.js which calls this function.
  console.log("[FreeChatGrantPush] Worker has been successfully migrated to the Notification Server.");
};

module.exports = {
  enqueueFreeChatGrantNotifications,
  startFreeChatGrantNotificationWorker,
};
