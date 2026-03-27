const webpush = require("web-push");
const AstrologerWebPushSubscription = require("../model/notification/astrologerWebPushSubscription");

let vapidConfigured = false;

function ensureVapidConfigured() {
  if (vapidConfigured) return true;

  const publicKey = (process.env.WEB_PUSH_PUBLIC_KEY || "").trim();
  const privateKey = (process.env.WEB_PUSH_PRIVATE_KEY || "").trim();
  const subject = (process.env.WEB_PUSH_SUBJECT || "mailto:support@graho.com").trim();

  if (!publicKey || !privateKey) {
    console.warn(
      "[WebPush] Missing WEB_PUSH_PUBLIC_KEY/WEB_PUSH_PRIVATE_KEY. Web push is disabled."
    );
    return false;
  }

  webpush.setVapidDetails(subject, publicKey, privateKey);
  vapidConfigured = true;
  return true;
}

function toWebPushSubscription(record) {
  return {
    endpoint: record.endpoint,
    expirationTime: record.expirationTime || null,
    keys: {
      p256dh: record.p256dh,
      auth: record.auth,
    },
  };
}

async function upsertAstrologerSubscription({ astrologerId, subscription, userAgent }) {
  if (!subscription || !subscription.endpoint || !subscription.keys) {
    throw new Error("Invalid push subscription payload");
  }

  const endpoint = subscription.endpoint;
  const p256dh = subscription.keys.p256dh;
  const auth = subscription.keys.auth;

  if (!p256dh || !auth) {
    throw new Error("Push subscription keys are missing");
  }

  const existingByEndpoint = await AstrologerWebPushSubscription.findOne({
    where: { endpoint },
  });

  if (existingByEndpoint) {
    await existingByEndpoint.update({
      astrologerId,
      p256dh,
      auth,
      expirationTime: subscription.expirationTime || null,
      userAgent: userAgent || existingByEndpoint.userAgent,
      isActive: true,
      lastUsedAt: new Date(),
    });

    return existingByEndpoint;
  }

  return AstrologerWebPushSubscription.create({
    astrologerId,
    endpoint,
    p256dh,
    auth,
    expirationTime: subscription.expirationTime || null,
    userAgent: userAgent || null,
    isActive: true,
    lastUsedAt: new Date(),
  });
}

async function removeAstrologerSubscription({ astrologerId, endpoint }) {
  if (!endpoint) return 0;

  return AstrologerWebPushSubscription.update(
    { isActive: false },
    {
      where: {
        astrologerId,
        endpoint,
      },
    }
  );
}

async function sendToAstrologer(astrologerId, payload) {
  if (!ensureVapidConfigured()) {
    return { success: false, reason: "not_configured" };
  }

  const subscriptions = await AstrologerWebPushSubscription.findAll({
    where: {
      astrologerId,
      isActive: true,
    },
  });

  if (!subscriptions.length) {
    return { success: false, reason: "no_subscriptions" };
  }

  const message = JSON.stringify(payload || {});
  let successCount = 0;
  let failureCount = 0;

  await Promise.all(
    subscriptions.map(async (record) => {
      try {
        await webpush.sendNotification(toWebPushSubscription(record), message, {
          TTL: 60,
          urgency: "high",
        });
        successCount += 1;
        await record.update({ lastUsedAt: new Date() });
      } catch (error) {
        failureCount += 1;

        const statusCode = error && error.statusCode;
        if (statusCode === 404 || statusCode === 410) {
          await record.update({ isActive: false });
        }

        console.error("[WebPush] Send failed:", {
          astrologerId,
          endpoint: record.endpoint,
          statusCode,
          message: error && error.message,
        });
      }
    })
  );

  return {
    success: successCount > 0,
    successCount,
    failureCount,
  };
}

async function sendChatRequestPush(astrologerId, { sessionId, userName }) {
  const safeUserName = userName || "User";

  return sendToAstrologer(astrologerId, {
    title: "New Chat Invitation",
    body: `${safeUserName} wants to start a chat with you.`,
    tag: `chat-request-${sessionId}`,
    url: `/astrologer/live-chats?sessionId=${sessionId}`,
    data: {
      type: "chat_request",
      sessionId,
    },
  });
}

module.exports = {
  ensureVapidConfigured,
  upsertAstrologerSubscription,
  removeAstrologerSubscription,
  sendToAstrologer,
  sendChatRequestPush,
};
