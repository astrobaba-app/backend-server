const { parse } = require("cookie");
const { validateToken } = require("./authService");
const ChatSession = require("../model/chat/chatSession");
const ChatMessage = require("../model/chat/chatMessage");
const Astrologer = require("../model/astrologer/astrologer");
const User = require("../model/user/userAuth");
const Wallet = require("../model/wallet/wallet");
const { Op } = require("sequelize");
const {
  completeChatSessionWithBilling,
} = require("./chatSessionLifecycle");
const { queueArchiveAndDeleteSession } = require("./chatHistoryService");
const { getWalletBalanceBreakdown } = require("./walletService");

const SESSION_ACCESS_CACHE_TTL_MS = 5 * 60 * 1000;
const USER_MESSAGE_INACTIVITY_TIMEOUT_MS = 2 * 60 * 1000;
const MAX_TIMER_DELAY_MS = 2_147_483_647;
const userInactivityTimers = new Map();
const walletLimitTimers = new Map();
const CHAT_MESSAGE_TYPES = new Set(["text", "image", "file", "voice"]);

/**
 * Extract and validate JWT token from Socket.IO handshake
 */
function authenticateSocket(socket, next) {
  try {
    let token = socket.handshake.auth?.token;

    if (!token && socket.handshake.headers?.cookie) {
      const parsedCookies = parse(socket.handshake.headers.cookie);
      token = parsedCookies.token;
    }

    if (!token && socket.handshake.headers?.authorization) {
      const authHeader = socket.handshake.headers.authorization;
      if (typeof authHeader === "string" && authHeader.startsWith("Bearer ")) {
        token = authHeader.split(" ")[1];
      }
    }

    if (!token) {
      return next(new Error("Authentication token missing"));
    }

    const payload = validateToken(token);
    if (!payload) {
      return next(new Error("Invalid or expired token"));
    }

    socket.user = payload; // { id, role }
    next();
  } catch (error) {
    console.error("Socket auth error:", error);
    next(new Error("Authentication failed"));
  }
}

function getSessionRoom(sessionId) {
  return `chat:${sessionId}`;
}

function getUserRoom(userId) {
  return `user:${userId}`;
}

function getAstrologerRoom(astrologerId) {
  return `astrologer:${astrologerId}`;
}

function getLiveSessionRoom(sessionId) {
  return `live:${sessionId}`;
}

function toSessionAccessSnapshot(session) {
  const json = session.toJSON ? session.toJSON() : session;
  return {
    id: json.id,
    userId: json.userId,
    astrologerId: json.astrologerId,
    requestStatus: json.requestStatus,
    status: json.status,
    maxDurationSeconds: json.maxDurationSeconds || null,
    maxEndTime: json.maxEndTime || null,
    walletBalanceAtApproval: json.walletBalanceAtApproval || null,
  };
}

function canAccessSession({ session, authId, isAstrologer }) {
  if (!session) return false;

  if (isAstrologer) {
    return session.astrologerId === authId;
  }

  return session.userId === authId;
}

function getSocketSessionCache(socket) {
  if (!socket.data.sessionAccessCache) {
    socket.data.sessionAccessCache = new Map();
  }

  return socket.data.sessionAccessCache;
}

function getCachedSessionAccess(socket, sessionId) {
  const cache = getSocketSessionCache(socket);
  const cached = cache.get(sessionId);
  if (!cached) return null;

  if (Date.now() - cached.cachedAt > SESSION_ACCESS_CACHE_TTL_MS) {
    cache.delete(sessionId);
    return null;
  }

  return cached;
}

function cacheSessionAccess(socket, sessionSnapshot) {
  const cache = getSocketSessionCache(socket);
  cache.set(sessionSnapshot.id, {
    ...sessionSnapshot,
    cachedAt: Date.now(),
  });
}

async function getAuthorizedSessionAccess({ socket, sessionId, authId, isAstrologer }) {
  const cached = getCachedSessionAccess(socket, sessionId);
  if (cached) {
    return canAccessSession({ session: cached, authId, isAstrologer }) ? cached : null;
  }

  const session = await ChatSession.findByPk(sessionId, {
    attributes: [
      "id",
      "userId",
      "astrologerId",
      "requestStatus",
      "status",
      "maxDurationSeconds",
      "maxEndTime",
      "walletBalanceAtApproval",
    ],
  });

  if (!session) {
    return null;
  }

  const snapshot = toSessionAccessSnapshot(session);
  if (!canAccessSession({ session: snapshot, authId, isAstrologer })) {
    return null;
  }

  cacheSessionAccess(socket, snapshot);
  return snapshot;
}

function clearUserInactivityAutoEnd(sessionId) {
  const timer = userInactivityTimers.get(sessionId);
  if (timer) {
    clearTimeout(timer);
    userInactivityTimers.delete(sessionId);
  }
}

function clearWalletLimitAutoEnd(sessionId) {
  const timer = walletLimitTimers.get(sessionId);
  if (timer) {
    clearTimeout(timer);
    walletLimitTimers.delete(sessionId);
  }
}

function emitChatEnded(io, session, payload = {}) {
  if (!io || !session) return;

  const endedPayload = {
    sessionId: session.id,
    ...payload,
  };

  io
    .to(getSessionRoom(session.id))
    .to(getUserRoom(session.userId))
    .to(getAstrologerRoom(session.astrologerId))
    .emit("chat:ended", endedPayload);
}

function emitChatMessage(io, session, payload) {
  if (!io || !session || !payload) return;

  io
    .to(getSessionRoom(session.id))
    .to(getUserRoom(session.userId))
    .to(getAstrologerRoom(session.astrologerId))
    .emit("message:new", payload);
}

async function autoEndSessionForUserInactivity(io, sessionId) {
  clearUserInactivityAutoEnd(sessionId);

  try {
    const session = await ChatSession.findByPk(sessionId);
    if (!session) return;

    if (session.status !== "active" || session.requestStatus !== "approved") {
      return;
    }

    const billing = await completeChatSessionWithBilling(session, io);
    await session.reload();

    emitChatEnded(io, session, {
      endedBy: "system",
      reason: "user_inactive_timeout",
      currentMinutes: billing.currentMinutes,
      currentCost: billing.currentCost,
      totalMinutes: billing.totalMinutes,
      totalCost: billing.totalCost,
      billedAmount: billing.billedAmount,
    });

    io.to(getUserRoom(session.userId)).emit("chat:updated", {
      sessionId: session.id,
      session: mapSession(session, "user"),
    });

    io.to(getAstrologerRoom(session.astrologerId)).emit("chat:updated", {
      sessionId: session.id,
      session: mapSession(session, "astrologer"),
    });

    queueArchiveAndDeleteSession(session.id, {
      endReason: "user_inactive_timeout",
      billedAmount: billing.billedAmount,
    });
  } catch (error) {
    console.error("auto end chat inactivity error:", error);
  }
}

async function endSessionForWalletTimeLimit(io, session) {
  const billing = await completeChatSessionWithBilling(session, io, {
    endTime: session.maxEndTime || new Date(),
  });
  await session.reload();
  clearUserInactivityAutoEnd(session.id);
  clearWalletLimitAutoEnd(session.id);

  if (io) {
    emitChatEnded(io, session, {
      endedBy: "system",
      reason: "wallet_time_limit",
      currentMinutes: billing.currentMinutes,
      currentCost: billing.currentCost,
      totalMinutes: billing.totalMinutes,
      totalCost: billing.totalCost,
      billedAmount: billing.billedAmount,
      maxEndTime: session.maxEndTime,
      maxDurationSeconds: session.maxDurationSeconds,
    });

    io.to(getUserRoom(session.userId)).emit("chat:updated", {
      sessionId: session.id,
      session: mapSession(session, "user"),
    });

    io.to(getAstrologerRoom(session.astrologerId)).emit("chat:updated", {
      sessionId: session.id,
      session: mapSession(session, "astrologer"),
    });
  }

  queueArchiveAndDeleteSession(session.id, {
    endReason: "wallet_time_limit",
    billedAmount: billing.billedAmount,
  });

  return billing;
}

async function autoEndSessionForWalletTimeLimit(io, sessionId) {
  clearWalletLimitAutoEnd(sessionId);

  try {
    const session = await ChatSession.findByPk(sessionId);
    if (!session) return;

    if (session.status !== "active" || session.requestStatus !== "approved") {
      return;
    }

    if (!session.maxEndTime || Date.now() < new Date(session.maxEndTime).getTime()) {
      scheduleWalletLimitAutoEnd(io, session);
      return;
    }

    await endSessionForWalletTimeLimit(io, session);
  } catch (error) {
    console.error("auto end chat wallet limit error:", error);
  }
}

async function scheduleExistingWalletLimitSessions(io) {
  try {
    const sessions = await ChatSession.findAll({
      where: {
        status: "active",
        requestStatus: "approved",
        maxEndTime: { [Op.ne]: null },
      },
    });

    sessions.forEach((session) => scheduleWalletLimitAutoEnd(io, session));
  } catch (error) {
    console.error("schedule existing wallet limit sessions error:", error);
  }
}

function scheduleUserInactivityAutoEnd(io, sessionLike) {
  if (!io || !sessionLike?.id) return;

  if (sessionLike.status !== "active" || sessionLike.requestStatus !== "approved") {
    clearUserInactivityAutoEnd(sessionLike.id);
    return;
  }

  clearUserInactivityAutoEnd(sessionLike.id);

  const timeout = setTimeout(() => {
    autoEndSessionForUserInactivity(io, sessionLike.id);
  }, USER_MESSAGE_INACTIVITY_TIMEOUT_MS);

  userInactivityTimers.set(sessionLike.id, timeout);
}

function scheduleWalletLimitAutoEnd(io, sessionLike) {
  if (!io || !sessionLike?.id) return;

  if (sessionLike.status !== "active" || sessionLike.requestStatus !== "approved") {
    clearWalletLimitAutoEnd(sessionLike.id);
    return;
  }

  if (!sessionLike.maxEndTime) {
    clearWalletLimitAutoEnd(sessionLike.id);
    return;
  }

  clearWalletLimitAutoEnd(sessionLike.id);

  const delayMs = Math.min(
    Math.max(0, new Date(sessionLike.maxEndTime).getTime() - Date.now()),
    MAX_TIMER_DELAY_MS
  );
  const timeout = setTimeout(() => {
    autoEndSessionForWalletTimeLimit(io, sessionLike.id);
  }, delayMs);

  walletLimitTimers.set(sessionLike.id, timeout);
}

async function enforceWalletTimeLimit(io, session) {
  if (
    !session ||
    session.status !== "active" ||
    session.requestStatus !== "approved" ||
    !session.maxEndTime
  ) {
    return null;
  }

  if (Date.now() < new Date(session.maxEndTime).getTime()) {
    scheduleWalletLimitAutoEnd(io, session);
    return null;
  }

  return endSessionForWalletTimeLimit(io, session);
}

async function endSessionForInsufficientBalance(io, session) {
  const billing = await completeChatSessionWithBilling(session, io);
  await session.reload();
  clearUserInactivityAutoEnd(session.id);
  clearWalletLimitAutoEnd(session.id);

  if (io) {
    emitChatEnded(io, session, {
      endedBy: "system",
      reason: "insufficient_balance",
      currentMinutes: billing.currentMinutes,
      currentCost: billing.currentCost,
      totalMinutes: billing.totalMinutes,
      totalCost: billing.totalCost,
      billedAmount: billing.billedAmount,
    });

    io.to(getUserRoom(session.userId)).emit("chat:updated", {
      sessionId: session.id,
      session: mapSession(session, "user"),
    });

    io.to(getAstrologerRoom(session.astrologerId)).emit("chat:updated", {
      sessionId: session.id,
      session: mapSession(session, "astrologer"),
    });
  }

  queueArchiveAndDeleteSession(session.id, {
    endReason: "insufficient_balance",
    billedAmount: billing.billedAmount,
  });

  return billing;
}

/**
 * Format a chat message payload for clients
 */
function mapMessage(message) {
  const json = message.toJSON ? message.toJSON() : message;
  return {
    id: json.id,
    sessionId: json.sessionId,
    senderId: json.senderId,
    senderType: json.senderType,
    message: json.isDeleted ? null : json.message,
    messageType: json.messageType,
    fileUrl: json.fileUrl || null,
    isRead: json.isRead,
    readAt: json.readAt,
    replyToMessageId: json.replyToMessageId || null,
    isDeleted: json.isDeleted || false,
    createdAt: json.createdAt,
    updatedAt: json.updatedAt,
  };
}

/**
 * Lightweight session summary for sidebars/lists
 */
function mapSession(session, viewerRole) {
  const json = session.toJSON ? session.toJSON() : session;
  return {
    id: json.id,
    userId: json.userId,
    astrologerId: json.astrologerId,
    status: json.status,
    requestStatus: json.requestStatus,
    startTime: json.startTime,
    endTime: json.endTime,
    totalMinutes: json.totalMinutes,
    totalCost: json.totalCost,
    pricePerMinute: json.pricePerMinute,
    maxDurationSeconds: json.maxDurationSeconds || null,
    maxEndTime: json.maxEndTime || null,
    walletBalanceAtApproval: json.walletBalanceAtApproval || null,
    lastMessagePreview: json.lastMessagePreview || null,
    lastMessageAt: json.lastMessageAt || null,
    unreadCount:
      viewerRole === "astrologer"
        ? json.astrologerUnreadCount || 0
        : json.userUnreadCount || 0,
  };
}

function calculateWalletLimitedChatTime({ rechargeBalance, pricePerMinute, startTime }) {
  const realChatBalance = parseFloat(rechargeBalance || 0);
  const rate = parseFloat(pricePerMinute || 0);

  if (!Number.isFinite(rate) || rate <= 0) {
    return {
      maxDurationSeconds: null,
      maxEndTime: null,
      walletBalanceAtApproval: realChatBalance,
    };
  }

  const maxDurationSeconds = Math.max(1, Math.floor((realChatBalance / rate) * 60));
  const startedAt = startTime instanceof Date ? startTime : new Date(startTime);

  return {
    maxDurationSeconds,
    maxEndTime: new Date(startedAt.getTime() + maxDurationSeconds * 1000),
    walletBalanceAtApproval: realChatBalance,
  };
}

/**
 * Create a chat message, update unread counts and last-message metadata,
 * and emit Socket.IO events to relevant rooms.
 */
async function createAndBroadcastMessage({
  io,
  session,
  senderId,
  senderType,
  text,
  messageType,
  fileUrl,
  replyToMessageId,
}) {
  const chatMessage = await ChatMessage.create({
    sessionId: session.id,
    senderId,
    senderType,
    message: text,
    messageType: messageType || "text",
    fileUrl: fileUrl || null,
    replyToMessageId: replyToMessageId || null,
  });

  const lastMessagePreview =
    messageType === "voice"
      ? "[Voice note]"
      : messageType === "image" || messageType === "file"
      ? "[Attachment]"
      : (text || "").slice(0, 200);

  const updates = {
    lastMessagePreview,
    lastMessageAt: new Date(),
  };

  if (senderType === "user") {
    updates.astrologerUnreadCount = (session.astrologerUnreadCount || 0) + 1;
  } else {
    updates.userUnreadCount = (session.userUnreadCount || 0) + 1;
  }

  await session.update(updates);

  const messagePayload = mapMessage(chatMessage);
  const sessionPayloadForUser = mapSession(session, "user");
  const sessionPayloadForAstrologer = mapSession(session, "astrologer");

  emitChatMessage(io, session, {
    sessionId: session.id,
    message: messagePayload,
  });

  // Update chat lists for both sides
  io.to(getUserRoom(session.userId)).emit("chat:updated", {
    sessionId: session.id,
    session: sessionPayloadForUser,
  });

  io.to(getAstrologerRoom(session.astrologerId)).emit("chat:updated", {
    sessionId: session.id,
    session: sessionPayloadForAstrologer,
  });

  return messagePayload;
}

async function markMessagesRead({ io, session, readerRole }) {
  const isUser = readerRole !== "astrologer";

  // Mark all messages sent by the other side as read
  await ChatMessage.update(
    { isRead: true, readAt: new Date() },
    {
      where: {
        sessionId: session.id,
        senderType: isUser ? "astrologer" : "user",
        isRead: false,
        isDeleted: false,
      },
    }
  );

  const updates = {};
  if (isUser) {
    updates.userUnreadCount = 0;
  } else {
    updates.astrologerUnreadCount = 0;
  }
  await session.update(updates);

  const room = getSessionRoom(session.id);
  io.to(room).emit("messages:read", {
    sessionId: session.id,
    readerRole,
  });

  io.to(getUserRoom(session.userId)).emit("unread:update", {
    sessionId: session.id,
    unreadCount: session.userUnreadCount || 0,
    viewerRole: "user",
  });

  io.to(getAstrologerRoom(session.astrologerId)).emit("unread:update", {
    sessionId: session.id,
    unreadCount: session.astrologerUnreadCount || 0,
    viewerRole: "astrologer",
  });
}

function initializeChatSocket(io) {
  io.use(authenticateSocket);
  scheduleExistingWalletLimitSessions(io);

  io.on("connection", (socket) => {
    const { id: authId, role } = socket?.user;
    const isAstrologer = role === "astrologer";
    socket.data.sessionAccessCache = new Map();

    console.log(`[Socket.IO] User connected: ${authId}, Role: ${role}`);

    if (isAstrologer) {
      const roomName = getAstrologerRoom(authId);
      socket.join(roomName);
      console.log(`[Socket.IO] Astrologer joined room: ${roomName}`);
    } else {
      const roomName = getUserRoom(authId);
      socket.join(roomName);
      console.log(`[Socket.IO] User joined room: ${roomName}`);
    }

    socket.on("join_chat", async ({ sessionId }) => {
      try {
        if (!sessionId) return;
        const sessionAccess = await getAuthorizedSessionAccess({
          socket,
          sessionId,
          authId,
          isAstrologer,
        });

        if (!sessionAccess) {
          return;
        }

        socket.join(getSessionRoom(sessionId));

        // Start/refresh inactivity timer when user joins an approved active session.
        if (!isAstrologer && sessionAccess.status === "active" && sessionAccess.requestStatus === "approved") {
          scheduleUserInactivityAutoEnd(io, sessionAccess);
          scheduleWalletLimitAutoEnd(io, sessionAccess);
        }
      } catch (error) {
        console.error("join_chat error:", error);
      }
    });

    socket.on("leave_chat", ({ sessionId }) => {
      if (!sessionId) return;
      socket.leave(getSessionRoom(sessionId));
    });

    socket.on("typing", async ({ sessionId, isTyping }) => {
      try {
        if (!sessionId) return;

        const roomName = getSessionRoom(sessionId);
        if (!socket.rooms.has(roomName)) {
          return;
        }

        const sessionAccess = await getAuthorizedSessionAccess({
          socket,
          sessionId,
          authId,
          isAstrologer,
        });

        if (!sessionAccess) {
          return;
        }

        io.to(roomName).emit("typing", {
          sessionId,
          from: isAstrologer ? "astrologer" : "user",
          isTyping: !!isTyping,
        });
      } catch (error) {
        console.error("typing event error:", error);
      }
    });

    socket.on(
      "send_message",
      async (
        { sessionId, text, messageType = "text", fileUrl, replyToMessageId },
        callback
      ) => {
        try {
          const normalizedMessageType = String(messageType || "text").toLowerCase();
          const normalizedText = String(text || "").trim();
          const isSocketAttachmentMessage =
            normalizedMessageType === "voice" ||
            normalizedMessageType === "image" ||
            normalizedMessageType === "file";

          if (!sessionId || (!normalizedText && !isSocketAttachmentMessage)) {
            if (callback) callback({ success: false, error: "Missing data" });
            return;
          }

          if (!CHAT_MESSAGE_TYPES.has(normalizedMessageType)) {
            if (callback) {
              callback({ success: false, error: "Unsupported message type" });
            }
            return;
          }

          if (isSocketAttachmentMessage && !fileUrl) {
            if (callback) {
              callback({
                success: false,
                error: "Attachment messages require uploaded file URL",
              });
            }
            return;
          }

          const session = await ChatSession.findByPk(sessionId);
          if (!session) {
            if (callback)
              callback({ success: false, error: "Chat session not found" });
            return;
          }

          if (
            (!isAstrologer && session.userId !== authId) ||
            (isAstrologer && session.astrologerId !== authId)
          ) {
            if (callback)
              callback({ success: false, error: "Not part of this session" });
            return;
          }

          cacheSessionAccess(socket, toSessionAccessSnapshot(session));

          const walletLimitBilling = await enforceWalletTimeLimit(io, session);
          if (walletLimitBilling) {
            if (callback) {
              callback({
                success: false,
                error: "Chat ended because wallet balance time limit was reached.",
                code: "CHAT_WALLET_TIME_LIMIT_REACHED",
                billing: walletLimitBilling,
              });
            }
            return;
          }

          // If astrologer, ensure request approved before sending
          if (isAstrologer && session.requestStatus !== "approved") {
            if (callback)
              callback({
                success: false,
                error: "Chat request not approved yet",
              });
            return;
          }

          if (!isAstrologer && session.status === "active" && session.requestStatus === "approved") {
            const wallet = await Wallet.findOne({ where: { userId: session.userId } });
            const walletBreakdown = getWalletBalanceBreakdown(wallet || {});

            if (walletBreakdown.rechargeBalance <= 0) {
              await endSessionForInsufficientBalance(io, session);

              const isBonusOnlyBalance =
                walletBreakdown.balance > 0 && walletBreakdown.rechargeBalance <= 0;

              if (callback) {
                callback({
                  success: false,
                  error: isBonusOnlyBalance
                    ? "Signup bonus is only for AI astrologer chat. Recharge wallet to chat with human astrologers."
                    : "Insufficient wallet balance. Chat ended.",
                  code: isBonusOnlyBalance
                    ? "RECHARGE_REQUIRED_FOR_HUMAN_CHAT"
                    : "INSUFFICIENT_BALANCE",
                });
              }
              return;
            }
          }

          const messagePayload = await createAndBroadcastMessage({
            io,
            session,
            senderId: authId,
            senderType: isAstrologer ? "astrologer" : "user",
            text:
              normalizedMessageType === "voice"
                ? normalizedText || "[Voice note]"
                : normalizedMessageType === "image"
                ? normalizedText || "[Image]"
                : normalizedMessageType === "file"
                ? normalizedText || "[Attachment]"
                : normalizedText,
            messageType: normalizedMessageType,
            fileUrl,
            replyToMessageId,
          });

          // Only user messages count as activity for inactivity auto-end logic.
          if (!isAstrologer) {
            scheduleUserInactivityAutoEnd(io, session);
          }

          if (callback) callback({ success: true, message: messagePayload });
        } catch (error) {
          console.error("send_message error:", error);
          if (callback)
            callback({ success: false, error: "Failed to send message" });
        }
      }
    );

    socket.on("end_chat", async ({ sessionId, reason }, callback) => {
      try {
        if (!sessionId) {
          if (callback) callback({ success: false, error: "Missing session id" });
          return;
        }

        const session = await ChatSession.findByPk(sessionId);
        if (!session) {
          if (callback) callback({ success: false, error: "Chat session not found" });
          return;
        }

        if (
          (!isAstrologer && session.userId !== authId) ||
          (isAstrologer && session.astrologerId !== authId)
        ) {
          if (callback) callback({ success: false, error: "Not part of this session" });
          return;
        }

        if (session.status !== "active") {
          if (callback) {
            callback({
              success: true,
              message: "Chat session already ended",
              session: mapSession(session, isAstrologer ? "astrologer" : "user"),
            });
          }
          return;
        }

        const endReason = isAstrologer
          ? reason || "astrologer_left_chat"
          : reason || "user_ended_chat";
        const billing = await completeChatSessionWithBilling(session, io);
        await session.reload();
        clearUserInactivityAutoEnd(session.id);
        clearWalletLimitAutoEnd(session.id);

        emitChatEnded(io, session, {
          endedBy: isAstrologer ? "astrologer" : "user",
          reason: endReason,
          currentMinutes: billing.currentMinutes,
          currentCost: billing.currentCost,
          totalMinutes: billing.totalMinutes,
          totalCost: billing.totalCost,
          billedAmount: billing.billedAmount,
        });

        io.to(getUserRoom(session.userId)).emit("chat:updated", {
          sessionId: session.id,
          session: mapSession(session, "user"),
        });

        io.to(getAstrologerRoom(session.astrologerId)).emit("chat:updated", {
          sessionId: session.id,
          session: mapSession(session, "astrologer"),
        });

        queueArchiveAndDeleteSession(session.id, {
          endReason,
          billedAmount: billing.billedAmount,
        });

        if (callback) {
          callback({
            success: true,
            message: "Chat session ended",
            session: {
              ...session.toJSON(),
              billedAmount: billing.billedAmount,
              billedMinutes: billing.currentMinutes,
            },
          });
        }
      } catch (error) {
        console.error("end_chat error:", error);
        if (callback) callback({ success: false, error: "Failed to end chat" });
      }
    });

    socket.on("mark_read", async ({ sessionId }) => {
      try {
        if (!sessionId) return;
        const session = await ChatSession.findByPk(sessionId);
        if (!session) return;

        if (
          (!isAstrologer && session.userId !== authId) ||
          (isAstrologer && session.astrologerId !== authId)
        ) {
          return;
        }

        cacheSessionAccess(socket, toSessionAccessSnapshot(session));

        await markMessagesRead({ io, session, readerRole: isAstrologer ? "astrologer" : "user" });
      } catch (error) {
        console.error("mark_read error:", error);
      }
    });

    socket.on("approve_chat", async ({ sessionId }, callback) => {
      try {
        if (!isAstrologer || !sessionId) return;
        const session = await ChatSession.findByPk(sessionId);
        if (!session || session.astrologerId !== authId) return;

        const approvalStartTime = new Date();
        const wallet = await Wallet.findOne({ where: { userId: session.userId } });
        const walletBreakdown = getWalletBalanceBreakdown(wallet || {});
        const pricePerMinute = parseFloat(session.pricePerMinute || 0);

        if (walletBreakdown.rechargeBalance <= 0 && pricePerMinute > 0) {
          if (callback) {
            callback({
              success: false,
              error:
                "Signup bonus is only for AI astrologer chat. Recharge wallet to chat with human astrologers.",
              code: "RECHARGE_REQUIRED_FOR_HUMAN_CHAT",
              wallet: {
                balance: walletBreakdown.balance,
                signupBonusBalance: walletBreakdown.signupBonusBalance,
                humanChatBalance: walletBreakdown.rechargeBalance,
              },
            });
          }
          return;
        }

        const walletLimit = calculateWalletLimitedChatTime({
          rechargeBalance: walletBreakdown.rechargeBalance,
          pricePerMinute,
          startTime: approvalStartTime,
        });

        await session.update({
          requestStatus: "approved",
          status: "active",
          startTime: approvalStartTime,
          endTime: null,
          maxDurationSeconds: walletLimit.maxDurationSeconds,
          maxEndTime: walletLimit.maxEndTime,
          walletBalanceAtApproval: walletLimit.walletBalanceAtApproval,
        });

        scheduleUserInactivityAutoEnd(io, session);
        scheduleWalletLimitAutoEnd(io, session);

        const sessionPayloadForUser = mapSession(session, "user");
        const sessionPayloadForAstrologer = mapSession(session, "astrologer");

        io.to(getSessionRoom(sessionId)).emit("chat:approved", {
          sessionId,
        });

        io.to(getUserRoom(session.userId)).emit("chat:updated", {
          sessionId,
          session: sessionPayloadForUser,
        });

        io.to(getAstrologerRoom(session.astrologerId)).emit("chat:updated", {
          sessionId,
          session: sessionPayloadForAstrologer,
        });

        if (callback) {
          callback({
            success: true,
            session: mapSession(session, "astrologer"),
          });
        }
      } catch (error) {
        console.error("approve_chat error:", error);
        if (callback) {
          callback({ success: false, error: "Failed to approve chat" });
        }
      }
    });

    socket.on("reject_chat", async ({ sessionId }) => {
      try {
        if (!isAstrologer || !sessionId) return;
        const session = await ChatSession.findByPk(sessionId);
        if (!session || session.astrologerId !== authId) return;

        await session.update({ requestStatus: "rejected" });
        clearUserInactivityAutoEnd(session.id);
        clearWalletLimitAutoEnd(session.id);

        const sessionPayloadForUser = mapSession(session, "user");
        const sessionPayloadForAstrologer = mapSession(session, "astrologer");

        io.to(getSessionRoom(sessionId)).emit("chat:rejected", {
          sessionId,
        });

        io.to(getUserRoom(session.userId)).emit("chat:updated", {
          sessionId,
          session: sessionPayloadForUser,
        });

        io.to(getAstrologerRoom(session.astrologerId)).emit("chat:updated", {
          sessionId,
          session: sessionPayloadForAstrologer,
        });
      } catch (error) {
        console.error("reject_chat error:", error);
      }
    });

    socket.on("delete_message", async ({ messageId }) => {
      try {
        if (!messageId) return;
        const message = await ChatMessage.findByPk(messageId);
        if (!message) return;

        const session = await ChatSession.findByPk(message.sessionId);
        if (!session) return;

        const isOwner = message.senderId === authId;
        if (!isOwner) return;

        await message.update({
          isDeleted: true,
          message: null,
          fileUrl: null,
          deletedAt: new Date(),
        });

        io.to(getSessionRoom(session.id)).emit("message:deleted", {
          sessionId: session.id,
          messageId: message.id,
        });
      } catch (error) {
        console.error("delete_message error:", error);
      }
    });

    socket.on("disconnect", () => {
      // Do not clear inactivity timers globally here; they are session-level
      // and should continue even if one client disconnects temporarily.
    });
  });
}

module.exports = {
  initializeChatSocket,
  mapSession,
  mapMessage,
  getSessionRoom,
  getUserRoom,
  getAstrologerRoom,
  getLiveSessionRoom,
  endSessionForInsufficientBalance,
  endSessionForWalletTimeLimit,
  enforceWalletTimeLimit,
  scheduleWalletLimitAutoEnd,
  scheduleUserInactivityAutoEnd,
  clearUserInactivityAutoEnd,
  clearWalletLimitAutoEnd,
};
