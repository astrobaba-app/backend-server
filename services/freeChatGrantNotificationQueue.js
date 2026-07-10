const { literal } = require("sequelize");
const redis = require("../config/redis/redis");
const Notification = require("../model/notification/notification");
const pushNotificationService = require("./pushNotificationService");

const FREE_CHAT_GRANT_QUEUE_KEY =
  process.env.FREE_CHAT_GRANT_QUEUE_KEY || "queue:free_chat_grant_push";
const FREE_CHAT_GRANT_BATCH_SIZE = Math.max(
  1,
  Number.parseInt(process.env.FREE_CHAT_GRANT_BATCH_SIZE, 10) || 25
);
const FREE_CHAT_GRANT_MAX_ATTEMPTS = Math.max(
  1,
  Number.parseInt(process.env.FREE_CHAT_GRANT_MAX_ATTEMPTS, 10) || 3
);

let workerStarted = false;
let workerRunning = false;
let workerScheduled = false;

const buildFreeChatGrantCopy = ({
  minutes,
  applicableChatType,
  notificationTitle,
  notificationBody,
}) => {
  const safeMinutes = Math.max(1, Number.parseInt(String(minutes), 10) || 1);
  const typeLabel =
    applicableChatType === "ai"
      ? "AI astrologer"
      : applicableChatType === "real"
        ? "real astrologer"
        : "AI and real astrologer";

  return {
    title:
      (typeof notificationTitle === "string" && notificationTitle.trim()) ||
      "Free chat minutes added",
    message:
      (typeof notificationBody === "string" && notificationBody.trim()) ||
      `${safeMinutes} free chat minute${
        safeMinutes === 1 ? "" : "s"
      } added for ${typeLabel} chat.`,
  };
};

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

  const notificationRows = uniqueUserIds.map((userId) => {
    const allocation = allocationsByUserId[String(userId)];
    const copy = buildFreeChatGrantCopy({
      minutes: allocation?.minutes,
      applicableChatType: allocation?.applicableChatType,
      notificationTitle,
      notificationBody,
    });

    return {
      userId,
      type: "general",
      title: copy.title,
      message: copy.message,
      priority: "high",
      data: {
        type: "free_chat_granted",
        freeChatAllocationId: allocation?.id || null,
        minutes: String(allocation?.minutes || ""),
        applicableChatType: String(allocation?.applicableChatType || "both"),
      },
      actionUrl: "/chat",
    };
  });

  const createdNotifications = await Notification.bulkCreate(notificationRows, {
    returning: true,
  });

  const queuePayloads = createdNotifications.map((notification) =>
    JSON.stringify({
        notificationId: notification.id,
        userId: String(notification.userId),
        attempts: 0,
        queuedAt: Date.now(),
      })
  );

  if (queuePayloads.length) {
    await redis.rpush(FREE_CHAT_GRANT_QUEUE_KEY, ...queuePayloads);
  }

  scheduleFreeChatGrantQueueProcessing();

  return {
    queued: createdNotifications.length,
    createdNotifications: createdNotifications.length,
  };
};

const scheduleFreeChatGrantQueueProcessing = () => {
  if (workerScheduled || workerRunning) {
    return;
  }

  workerScheduled = true;
  setTimeout(() => {
    workerScheduled = false;
    processFreeChatGrantQueueBatch().catch((error) => {
      console.error("[FreeChatGrantPush] Scheduled batch failed:", error);
    });
  }, 0);
};

const processFreeChatGrantQueueBatch = async () => {
  if (workerRunning) {
    return;
  }

  workerRunning = true;

  try {
    for (let index = 0; index < FREE_CHAT_GRANT_BATCH_SIZE; index += 1) {
      const rawItem = await redis.lpop(FREE_CHAT_GRANT_QUEUE_KEY);
      if (!rawItem) {
        break;
      }

      let parsed = null;
      try {
        parsed =
          typeof rawItem === "string" ? JSON.parse(rawItem) : rawItem || null;
      } catch (error) {
        console.error("[FreeChatGrantPush] Invalid queue item:", error);
        continue;
      }

      if (!parsed?.notificationId || !parsed?.userId) {
        continue;
      }

      const notification = await Notification.findByPk(parsed.notificationId);
      if (!notification) {
        continue;
      }

      await notification.update({
        pushAttemptCount: literal('"pushAttemptCount" + 1'),
        pushLastAttemptAt: new Date(),
      });

      try {
        const stringifiedData = {};
        for (const [key, value] of Object.entries(notification.data || {})) {
          stringifiedData[key] = String(value);
        }

        const result = await pushNotificationService.sendToUser(parsed.userId, {
          title: notification.title,
          body: notification.message,
          data: {
            ...stringifiedData,
            type: String(notification.data?.type || "free_chat_granted"),
            notificationId: String(notification.id),
            actionUrl: String(notification.actionUrl || "/chat"),
          },
        });

        if (result.success && (result.successCount || 0) > 0) {
          await notification.update({
            pushDeliveredAt: new Date(),
            pushLastError: null,
          });
          continue;
        }

        throw new Error(result.message || "Push delivery failed");
      } catch (error) {
        const attempts = Number(parsed.attempts || 0) + 1;

        await notification.update({
          pushLastError: error.message || "Free chat push failed",
        });

        if (attempts < FREE_CHAT_GRANT_MAX_ATTEMPTS) {
          await redis.rpush(
            FREE_CHAT_GRANT_QUEUE_KEY,
            JSON.stringify({
              ...parsed,
              attempts,
              lastError: error.message || "push_failed",
            })
          );
        }
      }
    }
  } catch (error) {
    console.error("[FreeChatGrantPush] Worker batch error:", error);
  } finally {
    workerRunning = false;

    const remainingCount =
      Number(await redis.llen(FREE_CHAT_GRANT_QUEUE_KEY).catch(() => 0)) || 0;
    if (remainingCount > 0) {
      scheduleFreeChatGrantQueueProcessing();
    }
  }
};

const startFreeChatGrantNotificationWorker = () => {
  if (workerStarted) {
    return;
  }

  workerStarted = true;
  console.log("[FreeChatGrantPush] Worker initialized in on-demand mode");
};

module.exports = {
  enqueueFreeChatGrantNotifications,
  startFreeChatGrantNotificationWorker,
};
