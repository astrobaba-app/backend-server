const { parse } = require("cookie");
const { validateToken } = require("./authService");
const ChatSession = require("../model/chat/chatSession");
const ChatMessage = require("../model/chat/chatMessage");
const Astrologer = require("../model/astrologer/astrologer");
const User = require("../model/user/userAuth");

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
    lastMessagePreview: json.lastMessagePreview || null,
    lastMessageAt: json.lastMessageAt || null,
    unreadCount:
      viewerRole === "astrologer"
        ? json.astrologerUnreadCount || 0
        : json.userUnreadCount || 0,
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
    messageType === "image" || messageType === "file"
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

  const room = getSessionRoom(session.id);
  io.to(room).emit("message:new", {
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

  io.on("connection", (socket) => {
    const { id: authId, role } = socket.user;
    const isAstrologer = role === "astrologer";

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
        const session = await ChatSession.findByPk(sessionId);
        if (!session) return;

        if (
          (!isAstrologer && session.userId !== authId) ||
          (isAstrologer && session.astrologerId !== authId)
        ) {
          return;
        }

        socket.join(getSessionRoom(sessionId));
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
        const session = await ChatSession.findByPk(sessionId);
        if (!session) return;

        if (
          (!isAstrologer && session.userId !== authId) ||
          (isAstrologer && session.astrologerId !== authId)
        ) {
          return;
        }

        io.to(getSessionRoom(sessionId)).emit("typing", {
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
          if (!sessionId || !text) {
            if (callback) callback({ success: false, error: "Missing data" });
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

          // If astrologer, ensure request approved before sending
          if (isAstrologer && session.requestStatus !== "approved") {
            if (callback)
              callback({
                success: false,
                error: "Chat request not approved yet",
              });
            return;
          }

          const messagePayload = await createAndBroadcastMessage({
            io,
            session,
            senderId: authId,
            senderType: isAstrologer ? "astrologer" : "user",
            text,
            messageType,
            fileUrl,
            replyToMessageId,
          });

          if (callback) callback({ success: true, message: messagePayload });
        } catch (error) {
          console.error("send_message error:", error);
          if (callback)
            callback({ success: false, error: "Failed to send message" });
        }
      }
    );

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

        await markMessagesRead({ io, session, readerRole: isAstrologer ? "astrologer" : "user" });
      } catch (error) {
        console.error("mark_read error:", error);
      }
    });

    socket.on("approve_chat", async ({ sessionId }) => {
      try {
        if (!isAstrologer || !sessionId) return;
        const session = await ChatSession.findByPk(sessionId);
        if (!session || session.astrologerId !== authId) return;

        await session.update({
          requestStatus: "approved",
          startTime: new Date(),
        });

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
      } catch (error) {
        console.error("approve_chat error:", error);
      }
    });

    socket.on("reject_chat", async ({ sessionId }) => {
      try {
        if (!isAstrologer || !sessionId) return;
        const session = await ChatSession.findByPk(sessionId);
        if (!session || session.astrologerId !== authId) return;

        await session.update({ requestStatus: "rejected" });

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
  });
}

module.exports = {
  initializeChatSocket,
  mapSession,
  mapMessage,
  getSessionRoom,
  getUserRoom,
  getAstrologerRoom,
};
