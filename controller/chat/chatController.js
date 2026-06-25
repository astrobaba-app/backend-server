const ChatSession = require("../../model/chat/chatSession");
const ChatMessage = require("../../model/chat/chatMessage");
const ChatHistorySession = require("../../model/chat/chatHistorySession");
const ChatHistoryMessage = require("../../model/chat/chatHistoryMessage");
const User = require("../../model/user/userAuth");
const Astrologer = require("../../model/astrologer/astrologer");
const Wallet = require("../../model/wallet/wallet");
const { Op } = require("sequelize");
const webPushService = require("../../services/webPushService");
const pushNotificationService = require("../../services/pushNotificationService");
const {
  completeChatSessionWithBilling,
} = require("../../services/chatSessionLifecycle");
const {
  queueArchiveAndDeleteSession,
} = require("../../services/chatHistoryService");
const { getWalletBalanceBreakdown } = require("../../services/walletService");

const CHAT_REQUEST_TIMEOUT_SECONDS = 30;
const CHAT_END_REASON_ALLOWLIST = new Set([
  "user_ended_chat",
  "insufficient_balance",
]);
const HUMAN_CHAT_RECHARGE_REQUIRED_CODE = "RECHARGE_REQUIRED_FOR_HUMAN_CHAT";
const HUMAN_CHAT_RECHARGE_REQUIRED_MESSAGE =
  "Signup bonus is only for AI astrologer chat. Recharge wallet to chat with human astrologers.";
const ASTROLOGER_CHAT_USER_ATTRIBUTES = [
  "id",
  "fullName",
  "email",
  "mobile",
  "gender",
  "dateOfbirth",
  "timeOfbirth",
  "placeOfBirth",
  "city",
  "state",
  "country",
];
const CHAT_MESSAGE_TYPES = new Set(["text", "image", "file", "voice"]);
const IMAGE_MESSAGE_ALLOWED_MIME_TYPES = new Set([
  "image/jpeg",
  "image/jpg",
  "image/png",
  "image/webp",
  "image/gif",
]);
const VOICE_MESSAGE_ALLOWED_MIME_TYPES = new Set([
  "audio/webm",
  "audio/ogg",
  "audio/mp4",
  "audio/mpeg",
  "audio/mp3",
  "audio/wav",
  "audio/x-wav",
  "audio/aac",
  "audio/x-m4a",
]);
const MAX_IMAGE_MESSAGE_FILE_SIZE_BYTES = 5 * 1024 * 1024;
const MAX_VOICE_NOTE_SECONDS = 120;
const MAX_VOICE_NOTE_FILE_SIZE_BYTES = 12 * 1024 * 1024;

function isPendingRequestExpired(session) {
  if (!session || session.requestStatus !== "pending") return false;
  const startedAt = session.startTime ? new Date(session.startTime).getTime() : 0;
  const expiresAt = startedAt + CHAT_REQUEST_TIMEOUT_SECONDS * 1000;
  return Date.now() > expiresAt;
}

function getRequestExpiryIso(session) {
  const startedAt = session.startTime ? new Date(session.startTime).getTime() : Date.now();
  return new Date(startedAt + CHAT_REQUEST_TIMEOUT_SECONDS * 1000).toISOString();
}

function canAccessChatSession(reqUser, session) {
  if (!reqUser || !session) return false;
  if (reqUser.role === "astrologer") {
    return session.astrologerId === reqUser.id;
  }
  return session.userId === reqUser.id;
}

function getSessionStatusMeta(session) {
  if (!session || session.status !== "active" || session.requestStatus !== "pending") {
    return {};
  }

  return {
    requestTimeoutSeconds: CHAT_REQUEST_TIMEOUT_SECONDS,
    requestExpiresAt: getRequestExpiryIso(session),
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

function emitChatEnded(io, session, payload = {}) {
  if (!io || !session) return;

  const {
    getSessionRoom,
    getUserRoom,
    getAstrologerRoom,
  } = require("../../services/chatSocket");

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

  const {
    getSessionRoom,
    getUserRoom,
    getAstrologerRoom,
  } = require("../../services/chatSocket");

  io
    .to(getSessionRoom(session.id))
    .to(getUserRoom(session.userId))
    .to(getAstrologerRoom(session.astrologerId))
    .emit("message:new", payload);
}

function mapHistoryMessages(messages = []) {
  return messages
    .map((message) => {
      const json = message.toJSON ? message.toJSON() : message;
      return {
        id: json.originalMessageId || json.id,
        historyMessageId: json.id,
        sessionId: json.historySessionId,
        senderId: json.senderId,
        senderType: json.senderType,
        message: json.isDeleted ? null : json.message,
        messageType: json.messageType,
        fileUrl: json.fileUrl || null,
        isDeleted: json.isDeleted || false,
        replyToMessageId: json.replyToMessageId || null,
        createdAt: json.originalCreatedAt || json.createdAt,
        updatedAt: json.updatedAt,
      };
    })
    .sort(
      (a, b) =>
        new Date(a.createdAt || 0).getTime() -
        new Date(b.createdAt || 0).getTime()
    );
}

// Start a chat session (user only)
const startChatSession = async (req, res) => {
  try {
    const userId = req.user.id;
    const { astrologerId } = req.body;

    if (!astrologerId) {
      return res.status(400).json({
        success: false,
        message: "Astrologer ID is required",
      });
    }

    // Check if astrologer exists and is available
    const astrologer = await Astrologer.findOne({
      where: { id: astrologerId, isApproved: true, isActive: true },
    });

    if (!astrologer) {
      return res.status(404).json({
        success: false,
        message: "Astrologer not found or not available",
      });
    }

    if (!astrologer.isOnline) {
      return res.status(400).json({
        success: false,
        message: "Astrologer is currently offline",
      });
    }

    const wallet = await Wallet.findOne({ where: { userId } });
    const walletBreakdown = getWalletBalanceBreakdown(wallet || {});

    if (walletBreakdown.rechargeBalance <= 0) {
      return res.status(402).json({
        success: false,
        message: HUMAN_CHAT_RECHARGE_REQUIRED_MESSAGE,
        code: HUMAN_CHAT_RECHARGE_REQUIRED_CODE,
        redirectTo: "/aichat",
        wallet: {
          balance: walletBreakdown.balance,
          signupBonusBalance: walletBreakdown.signupBonusBalance,
          humanChatBalance: walletBreakdown.rechargeBalance,
        },
      });
    }

    const session = await ChatSession.create({
      userId,
      astrologerId,
      pricePerMinute: astrologer.pricePerMinute,
      startTime: new Date(),
      // Every new chat starts as a fresh pending request.
      requestStatus: "pending",
    });

    // Get astrologer details
    const astrologerDetails = await Astrologer.findByPk(astrologerId, {
      attributes: ["id", "fullName", "photo", "pricePerMinute", "rating"],
    });

    // Notify astrologer immediately, regardless of current page.
    const io = req.app.get("io");
    if (io) {
      const {
        getAstrologerRoom,
        getSessionRoom,
        mapSession,
        clearUserInactivityAutoEnd,
      } = require("../../services/chatSocket");

      // Pending session should never keep an inactivity timer from a previous run.
      clearUserInactivityAutoEnd(session.id);

      const payload = {
        sessionId: session.id,
        expiresAt: getRequestExpiryIso(session),
        session: mapSession(session, "astrologer"),
        user: {
          id: req.user.id,
          fullName: req.user.fullName || "User",
          email: req.user.email || null,
        },
      };

      io.to(getAstrologerRoom(astrologerId)).emit("chat:request:new", payload);
      io.to(getSessionRoom(session.id)).emit("chat:request:new", payload);
    }

    try {
      await webPushService.sendChatRequestPush(astrologerId, {
        sessionId: session.id,
        userName: req.user.fullName || "User",
      });
    } catch (pushError) {
      // Push delivery should not fail chat request creation.
      console.error("Failed to send web push for chat request:", pushError);
    }

    try {
      await pushNotificationService.sendToAstrologer(astrologerId, {
        title: "New Chat Invitation",
        body: `${req.user.fullName || "User"} wants to start a chat with you.`,
        data: {
          type: "chat_request",
          sessionId: String(session.id),
          requestExpiresAt: getRequestExpiryIso(session),
          astrologerId: String(astrologerId),
          userId: String(req.user.id),
          userName: String(req.user.fullName || "User"),
          clickAction: "/astrologer/live-chats",
          url: `https://graho.in/astrologer/live-chats?sessionId=${session.id}`,
        },
      });
    } catch (mobilePushError) {
      // Mobile push failure should not break chat request creation.
      console.error("Failed to send astrologer mobile push:", mobilePushError);
    }

    res.status(201).json({
      success: true,
      message: "Chat request sent. Waiting for astrologer approval.",
      requestTimeoutSeconds: CHAT_REQUEST_TIMEOUT_SECONDS,
      requestExpiresAt: getRequestExpiryIso(session),
      session: {
        ...session.toJSON(),
        astrologer: astrologerDetails,
      },
    });
  } catch (error) {
    console.error("Start chat session error:", error);
    res.status(500).json({
      success: false,
      message: "Failed to start chat session",
      error: error.message,
    });
  }
};

// End a chat session (billing oriented, session record is reused for future conversations)
const endChatSession = async (req, res) => {
  try {
    const { sessionId } = req.params;
    const userId = req.user.id;
    const requestedReason = req.body?.reason;
    const endReason = CHAT_END_REASON_ALLOWLIST.has(requestedReason)
      ? requestedReason
      : "user_ended_chat";

    const session = await ChatSession.findOne({
      where: { id: sessionId, userId },
    });

    if (!session) {
      const archived = await ChatHistorySession.findOne({
        where: { sourceSessionId: sessionId, userId },
      });

      if (archived) {
        return res.status(200).json({
          success: true,
          message: "Chat session already ended",
          session: {
            id: sessionId,
            totalMinutes: archived.totalMinutes || 0,
            totalCost: parseFloat(archived.totalCost || 0),
            billedAmount: parseFloat(archived.billedAmount || 0),
            pricePerMinute: parseFloat(archived.pricePerMinute || 0),
            startTime: archived.startTime,
            endTime: archived.endTime,
          },
        });
      }

      return res.status(404).json({
        success: false,
        message: "Chat session not found",
      });
    }

    if (session.status !== "active") {
      return res.status(200).json({
        success: true,
        message: "Chat session already ended",
        session: {
          id: session.id,
          totalMinutes: session.totalMinutes || 0,
          totalCost: parseFloat(session.totalCost || 0),
          billedAmount: 0,
          pricePerMinute: parseFloat(session.pricePerMinute),
          startTime: session.startTime,
          endTime: session.endTime,
        },
      });
    }

    const io = req.app.get("io");
    const billing = await completeChatSessionWithBilling(session, io);
    await session.reload();

    if (io) {
      const {
        clearUserInactivityAutoEnd,
        clearWalletLimitAutoEnd,
      } = require("../../services/chatSocket");
      clearUserInactivityAutoEnd(session.id);
      clearWalletLimitAutoEnd(session.id);
    }

    // Notify both sides that chat ended so UI can close/clean up instantly.
    if (io) {
      const {
        getUserRoom,
        getAstrologerRoom,
        mapSession,
      } = require("../../services/chatSocket");

      emitChatEnded(io, session, {
        endedBy: "user",
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
    }

    queueArchiveAndDeleteSession(session.id, {
      endReason,
      billedAmount: billing.billedAmount,
    });

    res.status(200).json({
      success: true,
      message: "Chat session ended successfully",
      session: {
        id: session.id,
        totalMinutes: billing.totalMinutes,
        totalCost: billing.totalCost,
        billedAmount: billing.billedAmount,
        pricePerMinute: parseFloat(session.pricePerMinute),
        startTime: session.startTime,
        endTime: session.endTime,
      },
    });
  } catch (error) {
    console.error("End chat session error:", error);
    res.status(500).json({
      success: false,
      message: "Failed to end chat session",
      error: error.message,
    });
  }
};

// Send message (user or astrologer) via HTTP API
const sendMessage = async (req, res) => {
  try {
    const { sessionId } = req.params;
    const { message, messageType = "text", replyToMessageId, voiceDurationSec } = req.body;
    
    // Determine sender type and ID
    if (!req.user) {
      return res.status(401).json({
        success: false,
        message: "Authentication required",
      });
    }

    const senderId = req.user.id;
    const senderType = req.user.role === "astrologer" ? "astrologer" : "user";

    const normalizedMessageType = String(messageType || "text").toLowerCase();
    if (!CHAT_MESSAGE_TYPES.has(normalizedMessageType)) {
      return res.status(400).json({
        success: false,
        message: "Unsupported message type",
      });
    }

    const trimmedMessage = String(message || "").trim();
    const isVoiceMessage = normalizedMessageType === "voice";
    const isImageMessage = normalizedMessageType === "image";
    const isFileMessage = normalizedMessageType === "file";
    const isAttachmentMessage = isVoiceMessage || isImageMessage || isFileMessage;

    if (!isAttachmentMessage && !trimmedMessage) {
      return res.status(400).json({
        success: false,
        message: "Message content is required",
      });
    }

    if ((isImageMessage || isFileMessage) && !req.file) {
      return res.status(400).json({
        success: false,
        message: "Attachment file is required",
      });
    }

    if (isImageMessage) {
      if (!IMAGE_MESSAGE_ALLOWED_MIME_TYPES.has(req.file.mimetype)) {
        return res.status(415).json({
          success: false,
          message: "Unsupported image format",
        });
      }

      if ((req.file.size || 0) > MAX_IMAGE_MESSAGE_FILE_SIZE_BYTES) {
        return res.status(413).json({
          success: false,
          message: "Image is too large. Maximum size is 5MB.",
        });
      }
    }

    if (isVoiceMessage) {
      if (!req.file) {
        return res.status(400).json({
          success: false,
          message: "Voice note file is required",
        });
      }

      if (!VOICE_MESSAGE_ALLOWED_MIME_TYPES.has(req.file.mimetype)) {
        return res.status(415).json({
          success: false,
          message: "Unsupported voice note format",
        });
      }

      if ((req.file.size || 0) > MAX_VOICE_NOTE_FILE_SIZE_BYTES) {
        return res.status(413).json({
          success: false,
          message: "Voice note is too large",
        });
      }

      const parsedDuration = Number(voiceDurationSec);
      if (!Number.isFinite(parsedDuration) || parsedDuration <= 0) {
        return res.status(400).json({
          success: false,
          message: "Voice note duration is required",
        });
      }

      if (parsedDuration > MAX_VOICE_NOTE_SECONDS) {
        return res.status(400).json({
          success: false,
          message: "Voice note cannot exceed 2 minutes",
        });
      }
    }

    // Check if session exists and is active
    const session = await ChatSession.findOne({
      where: { id: sessionId },
    });

    if (!session) {
      return res.status(404).json({
        success: false,
        message: "Active chat session not found",
      });
    }

    // Verify sender is part of this session
    if (senderType === "user" && session.userId !== senderId) {
      return res.status(403).json({
        success: false,
        message: "You are not part of this chat session",
      });
    }

    if (senderType === "astrologer" && session.astrologerId !== senderId) {
      return res.status(403).json({
        success: false,
        message: "You are not part of this chat session",
      });
    }

    // If astrologer is sending a message, ensure the chat request is approved
    if (senderType === "astrologer" && session.requestStatus !== "approved") {
      return res.status(400).json({
        success: false,
        message: "Chat request has not been approved yet",
      });
    }

    if (session.status === "active" && session.requestStatus === "approved") {
      const io = req.app.get("io");
      const { enforceWalletTimeLimit } = require("../../services/chatSocket");
      const walletLimitBilling = await enforceWalletTimeLimit(io, session);

      if (walletLimitBilling) {
        return res.status(402).json({
          success: false,
          message: "Chat ended because wallet balance time limit was reached.",
          code: "CHAT_WALLET_TIME_LIMIT_REACHED",
          session: {
            id: session.id,
            totalMinutes: walletLimitBilling.totalMinutes,
            totalCost: walletLimitBilling.totalCost,
            billedAmount: walletLimitBilling.billedAmount,
            pricePerMinute: parseFloat(session.pricePerMinute || 0),
          },
        });
      }
    }

    if (senderType === "user" && session.status === "active" && session.requestStatus === "approved") {
      const wallet = await Wallet.findOne({ where: { userId: senderId } });
      const walletBreakdown = getWalletBalanceBreakdown(wallet || {});

      if (walletBreakdown.rechargeBalance <= 0) {
        const io = req.app.get("io");
        const { endSessionForInsufficientBalance } = require("../../services/chatSocket");
        const billing = await endSessionForInsufficientBalance(io, session);

        const isBonusOnlyBalance =
          walletBreakdown.balance > 0 && walletBreakdown.rechargeBalance <= 0;

        return res.status(402).json({
          success: false,
          message: isBonusOnlyBalance
            ? HUMAN_CHAT_RECHARGE_REQUIRED_MESSAGE
            : "Insufficient wallet balance. Chat ended. Please recharge to continue.",
          code: isBonusOnlyBalance
            ? HUMAN_CHAT_RECHARGE_REQUIRED_CODE
            : "INSUFFICIENT_BALANCE",
          redirectTo: isBonusOnlyBalance ? "/aichat" : undefined,
          session: {
            id: session.id,
            totalMinutes: billing.totalMinutes,
            totalCost: billing.totalCost,
            billedAmount: billing.billedAmount,
            pricePerMinute: parseFloat(session.pricePerMinute || 0),
          },
          wallet: {
            balance: walletBreakdown.balance,
            signupBonusBalance: walletBreakdown.signupBonusBalance,
            humanChatBalance: walletBreakdown.rechargeBalance,
          },
        });
      }
    }

    // Get file URL if uploaded
    const fileUrl = req.fileUrl || null;

    // Create message
    const safeMessage = isVoiceMessage
      ? trimmedMessage || "[Voice note]"
      : isImageMessage
      ? trimmedMessage || "[Image]"
      : isFileMessage
      ? trimmedMessage || "[Attachment]"
      : trimmedMessage;

    const chatMessage = await ChatMessage.create({
      sessionId,
      senderId,
      senderType,
      message: safeMessage,
      messageType: normalizedMessageType,
      fileUrl,
      replyToMessageId: replyToMessageId || null,
    });

    // Update session metadata and unread counters
    const lastMessagePreview =
      normalizedMessageType === "voice"
        ? "[Voice note]"
        : normalizedMessageType === "image" || normalizedMessageType === "file"
        ? "[Attachment]"
        : safeMessage.slice(0, 200);

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

    // Broadcast via Socket.IO if available
    const io = req.app.get("io");
    if (io) {
      const {
        getUserRoom,
        getAstrologerRoom,
        mapMessage,
        mapSession,
        scheduleUserInactivityAutoEnd,
      } = require("../../services/chatSocket");

      const messagePayload = mapMessage(chatMessage);
      const sessionForUser = mapSession(session, "user");
      const sessionForAstrologer = mapSession(session, "astrologer");

      emitChatMessage(io, session, {
        sessionId,
        message: messagePayload,
      });

      io.to(getUserRoom(session.userId)).emit("chat:updated", {
        sessionId,
        session: sessionForUser,
      });

      io.to(getAstrologerRoom(session.astrologerId)).emit("chat:updated", {
        sessionId,
        session: sessionForAstrologer,
      });

      if (senderType === "user") {
        scheduleUserInactivityAutoEnd(io, session);
      }
    }

    res.status(201).json({
      success: true,
      message: "Message sent successfully",
      chatMessage,
    });
  } catch (error) {
    console.error("Send message error:", error);
    res.status(500).json({
      success: false,
      message: "Failed to send message",
      error: error.message,
    });
  }
};

// Get messages for a session
const getSessionMessages = async (req, res) => {
  try {
    const { sessionId } = req.params;
    const { page = 1, limit = 50 } = req.query;
    const offset = (page - 1) * limit;

    // Determine if the caller is a user or an astrologer
    let userId, astrologerId;
    if (req.user) {
      const role = req.user.role;

      if (role === "astrologer") {
        astrologerId = req.user.id;
      } else {
        // Default to treating as normal user
        userId = req.user.id;
      }
    }

    // Verify access to session
    const session = await ChatSession.findByPk(sessionId);
    if (!session) {
      return res.status(404).json({
        success: false,
        message: "Chat session not found",
      });
    }

    if (userId && session.userId !== userId) {
      return res.status(403).json({
        success: false,
        message: "Access denied to this chat session",
      });
    }

    if (astrologerId && session.astrologerId !== astrologerId) {
      return res.status(403).json({
        success: false,
        message: "Access denied to this chat session",
      });
    }

    const messageWhere = { sessionId };

    // Astrologer sees only current conversation window (fresh start after each approval).
    // User keeps full chat history for the same astrologer.
    if (astrologerId && session.startTime) {
      messageWhere.createdAt = { [Op.gte]: new Date(session.startTime) };
    }

    const { rows: messages, count } = await ChatMessage.findAndCountAll({
      where: messageWhere,
      limit: parseInt(limit),
      offset: parseInt(offset),
      order: [["createdAt", "ASC"]],
    });

    res.status(200).json({
      success: true,
      messages,
      pagination: {
        total: count,
        page: parseInt(page),
        limit: parseInt(limit),
        totalPages: Math.ceil(count / limit),
      },
    });
  } catch (error) {
    console.error("Get session messages error:", error);
    res.status(500).json({
      success: false,
      message: "Failed to fetch messages",
      error: error.message,
    });
  }
};

// v2: Get one chat session by id with both participants, for mobile resync/polling.
const getChatSessionStatusV2 = async (req, res) => {
  try {
    const { sessionId } = req.params;

    const session = await ChatSession.findByPk(sessionId, {
      include: [
        {
          model: User,
          as: "user",
          attributes: ASTROLOGER_CHAT_USER_ATTRIBUTES,
        },
        {
          model: Astrologer,
          as: "astrologer",
          attributes: ["id", "fullName", "photo", "pricePerMinute", "rating"],
        },
      ],
    });

    if (session) {
      if (!canAccessChatSession(req.user, session)) {
        return res.status(403).json({
          success: false,
          message: "Access denied to this chat session",
        });
      }

      if (session.status === "active" && session.requestStatus === "approved") {
        const io = req.app.get("io");
        const { enforceWalletTimeLimit } = require("../../services/chatSocket");
        await enforceWalletTimeLimit(io, session);
        await session.reload();
      }

      const now = new Date();
      const startTime = session.startTime ? new Date(session.startTime) : now;
      const currentMinutes = Math.max(
        0,
        Math.ceil((now - startTime) / (1000 * 60))
      );
      const currentCost = currentMinutes * parseFloat(session.pricePerMinute || 0);

      return res.status(200).json({
        success: true,
        session: {
          ...session.toJSON(),
          currentMinutes,
          currentCost,
        },
        ...getSessionStatusMeta(session),
      });
    }

    const archived = await ChatHistorySession.findOne({
      where: { sourceSessionId: sessionId },
      include: [
        {
          model: User,
          as: "user",
          attributes: ASTROLOGER_CHAT_USER_ATTRIBUTES,
        },
        {
          model: Astrologer,
          as: "astrologer",
          attributes: ["id", "fullName", "photo", "pricePerMinute", "rating"],
        },
      ],
    });

    if (!archived) {
      return res.status(404).json({
        success: false,
        message: "Chat session not found",
      });
    }

    if (!canAccessChatSession(req.user, archived)) {
      return res.status(403).json({
        success: false,
        message: "Access denied to this chat session",
      });
    }

    return res.status(200).json({
      success: true,
      session: {
        ...archived.toJSON(),
        id: sessionId,
        archived: true,
        status: archived.status || "completed",
        requestStatus: archived.requestStatus || "approved",
      },
    });
  } catch (error) {
    console.error("Get chat session status v2 error:", error);
    res.status(500).json({
      success: false,
      message: "Failed to fetch chat session status",
      error: error.message,
    });
  }
};

// Get user's active/pending chat sessions (live inbox)
const getUserChatSessions = async (req, res) => {
  try {
    const userId = req.user.id;
    const { page = 1, limit = 20, status } = req.query;
    const offset = (page - 1) * limit;

    const where = {
      userId,
      status: "active",
    };
    if (status) {
      where.status = status;
    }

    const { rows: sessions, count } = await ChatSession.findAndCountAll({
      where,
      limit: parseInt(limit),
      offset: parseInt(offset),
      order: [["createdAt", "DESC"]],
      include: [
        {
          model: Astrologer,
          as: "astrologer",
          attributes: ["id", "fullName", "photo", "rating", "pricePerMinute"],
        },
      ],
    });

    const uniqueSessions = sessions;

    // Update sessions with 0 pricePerMinute to use current astrologer rate
    for (const session of uniqueSessions) {
      if (session.pricePerMinute <= 0 && session.astrologer?.pricePerMinute > 0) {
        console.log(`Updating session ${session.id} pricePerMinute from ${session.pricePerMinute} to ${session.astrologer.pricePerMinute}`);
        await session.update({ pricePerMinute: session.astrologer.pricePerMinute });
        session.pricePerMinute = session.astrologer.pricePerMinute; // Update in-memory for response
      }
    }

    // Debug logging for price information
    console.log('=== USER CHAT SESSION DEBUG ===');
    uniqueSessions.forEach((session, index) => {
      console.log(`Session ${index + 1}:`);
      console.log('  Session ID:', session.id);
      console.log('  Session pricePerMinute:', session.pricePerMinute);
      console.log('  Astrologer ID:', session.astrologerId);
      console.log('  Astrologer name:', session.astrologer?.fullName);
      console.log('  Astrologer pricePerMinute:', session.astrologer?.pricePerMinute);
      console.log('---');
    });

    res.status(200).json({
      success: true,
      sessions: uniqueSessions,
      pagination: {
        total: uniqueSessions.length,
        page: parseInt(page),
        limit: parseInt(limit),
        totalPages: Math.ceil(uniqueSessions.length / limit),
      },
    });
  } catch (error) {
    console.error("Get user chat sessions error:", error);
    res.status(500).json({
      success: false,
      message: "Failed to fetch chat sessions",
      error: error.message,
    });
  }
};

// Get astrologer's chat sessions (with optional requestStatus filter)
const getAstrologerChatSessions = async (req, res) => {
  try {
    const astrologerId = req.user.id;
    const { page = 1, limit = 20, status, requestStatus } = req.query;
    const offset = (page - 1) * limit;

    const where = { astrologerId, status: "active" };
    if (status) {
      where.status = status;
    }
    if (requestStatus) {
      where.requestStatus = requestStatus;
    }

    const { rows: sessions, count } = await ChatSession.findAndCountAll({
      where,
      limit: parseInt(limit),
      offset: parseInt(offset),
      order: [["createdAt", "DESC"]],
      include: [
        {
          model: User,
          as: "user",
          attributes: ASTROLOGER_CHAT_USER_ATTRIBUTES,
        },
      ],
    });

    // Ensure only one session per user-astrologer pair is returned
    // by keeping the most recently created session for each user.
    const dedupedMap = new Map();
    sessions.forEach((session) => {
      const key = session.userId;
      const existing = dedupedMap.get(key);
      if (!existing || new Date(session.createdAt) > new Date(existing.createdAt)) {
        dedupedMap.set(key, session);
      }
    });

    const uniqueSessions = Array.from(dedupedMap.values());

    res.status(200).json({
      success: true,
      sessions: uniqueSessions,
      pagination: {
        total: uniqueSessions.length,
        page: parseInt(page),
        limit: parseInt(limit),
        totalPages: Math.ceil(uniqueSessions.length / limit),
      },
    });
  } catch (error) {
    console.error("Get astrologer chat sessions error:", error);
    res.status(500).json({
      success: false,
      message: "Failed to fetch chat sessions",
      error: error.message,
    });
  }
};

// Get active session between a user and an astrologer
const getActiveSession = async (req, res) => {
  try {
    const { astrologerId } = req.params;
    const userId = req.user.id;

    const session = await ChatSession.findOne({
      where: {
        userId,
        astrologerId,
        status: "active",
      },
      include: [
        {
          model: Astrologer,
          as: "astrologer",
          attributes: ["id", "fullName", "photo", "pricePerMinute", "rating"],
        },
      ],
    });

    if (!session) {
      return res.status(404).json({
        success: false,
        message: "No active chat session found",
      });
    }

    if (session.status === "active" && session.requestStatus === "approved") {
      const io = req.app.get("io");
      const { enforceWalletTimeLimit } = require("../../services/chatSocket");
      await enforceWalletTimeLimit(io, session);
      await session.reload();
    }

    // Calculate current duration
    const now = new Date();
    const startTime = new Date(session.startTime);
    const durationMs = now - startTime;
    const currentMinutes = Math.ceil(durationMs / (1000 * 60));
    const currentCost = currentMinutes * parseFloat(session.pricePerMinute);

    res.status(200).json({
      success: true,
      session: {
        ...session.toJSON(),
        currentMinutes,
        currentCost,
      },
    });
  } catch (error) {
    console.error("Get active session error:", error);
    res.status(500).json({
      success: false,
      message: "Failed to fetch active session",
      error: error.message,
    });
  }
};

// Get total minutes chatted with an astrologer (aggregated over the reused session)
const getTotalMinutesWithAstrologer = async (req, res) => {
  try {
    const userId = req.user.id;
    const { astrologerId } = req.params;

    const sessions = await ChatSession.findAll({
      where: {
        userId,
        astrologerId,
        status: "completed",
      },
      attributes: ["totalMinutes", "totalCost"],
    });

    const totalMinutes = sessions.reduce((sum, session) => sum + session.totalMinutes, 0);
    const totalCost = sessions.reduce((sum, session) => sum + parseFloat(session.totalCost), 0);
    const totalSessions = sessions.length;

    res.status(200).json({
      success: true,
      astrologerId,
      totalMinutes,
      totalCost,
      totalSessions,
    });
  } catch (error) {
    console.error("Get total minutes error:", error);
    res.status(500).json({
      success: false,
      message: "Failed to fetch total minutes",
      error: error.message,
    });
  }
};

// Approve a chat request (astrologer only)
const approveChatRequest = async (req, res) => {
  try {
    const astrologerId = req.user.id;
    const { sessionId } = req.params;
    const { forceAccept = false } = req.body || {};

    const session = await ChatSession.findOne({
      where: { id: sessionId, astrologerId },
    });

    if (!session) {
      return res.status(404).json({
        success: false,
        message: "Chat session not found",
      });
    }

    if (session.requestStatus === "approved") {
      const io = req.app.get("io");
      if (io) {
        const {
          enforceWalletTimeLimit,
          scheduleUserInactivityAutoEnd,
          scheduleWalletLimitAutoEnd,
        } = require("../../services/chatSocket");
        const walletLimitBilling = await enforceWalletTimeLimit(io, session);

        if (walletLimitBilling) {
          return res.status(402).json({
            success: false,
            message: "Chat ended because wallet balance time limit was reached.",
            code: "CHAT_WALLET_TIME_LIMIT_REACHED",
            session: {
              id: session.id,
              totalMinutes: walletLimitBilling.totalMinutes,
              totalCost: walletLimitBilling.totalCost,
              billedAmount: walletLimitBilling.billedAmount,
              pricePerMinute: parseFloat(session.pricePerMinute || 0),
            },
          });
        }

        scheduleUserInactivityAutoEnd(io, session);
        scheduleWalletLimitAutoEnd(io, session);
      }

      return res.status(200).json({
        success: true,
        message: "Chat request already approved",
        session,
      });
    }

    if (isPendingRequestExpired(session)) {
      await session.update({
        requestStatus: "rejected",
        status: "cancelled",
        endTime: new Date(),
      });

      return res.status(410).json({
        success: false,
        message: "Chat request expired. Ask user to start chat again.",
        code: "CHAT_REQUEST_EXPIRED",
      });
    }

    const activeSession = await ChatSession.findOne({
      where: {
        astrologerId,
        id: { [Op.ne]: sessionId },
        status: "active",
        requestStatus: "approved",
      },
      include: [
        {
          model: User,
          as: "user",
          attributes: ASTROLOGER_CHAT_USER_ATTRIBUTES,
        },
      ],
    });

    if (activeSession && !forceAccept) {
      return res.status(409).json({
        success: false,
        message:
          "You already have an active chat. Accepting this request will end the current chat.",
        code: "ACTIVE_CHAT_EXISTS",
        requiresForce: true,
        activeSession: {
          id: activeSession.id,
          userId: activeSession.userId,
          userName: activeSession.user?.fullName || "Current user",
        },
      });
    }

    const approvalStartTime = new Date();
    const wallet = await Wallet.findOne({ where: { userId: session.userId } });
    const walletBreakdown = getWalletBalanceBreakdown(wallet || {});
    const pricePerMinute = parseFloat(session.pricePerMinute || 0);

    if (walletBreakdown.rechargeBalance <= 0 && pricePerMinute > 0) {
      return res.status(402).json({
        success: false,
        message: HUMAN_CHAT_RECHARGE_REQUIRED_MESSAGE,
        code: HUMAN_CHAT_RECHARGE_REQUIRED_CODE,
        redirectTo: "/aichat",
        wallet: {
          balance: walletBreakdown.balance,
          signupBonusBalance: walletBreakdown.signupBonusBalance,
          humanChatBalance: walletBreakdown.rechargeBalance,
        },
      });
    }

    const walletLimit = calculateWalletLimitedChatTime({
      rechargeBalance: walletBreakdown.rechargeBalance,
      pricePerMinute,
      startTime: approvalStartTime,
    });

    const io = req.app.get("io");
    let chatSocketService = null;
    if (io) {
      chatSocketService = require("../../services/chatSocket");
    }

    if (activeSession) {
      const switchedBilling = await completeChatSessionWithBilling(activeSession, io);
      await activeSession.reload();

      if (io && chatSocketService) {
        const {
          getUserRoom,
          getAstrologerRoom,
          mapSession,
          clearUserInactivityAutoEnd,
          clearWalletLimitAutoEnd,
        } =
          chatSocketService;

        clearUserInactivityAutoEnd(activeSession.id);
        clearWalletLimitAutoEnd(activeSession.id);

        emitChatEnded(io, activeSession, {
          endedBy: "astrologer",
          reason: "astrologer_switched_chat",
          currentMinutes: switchedBilling.currentMinutes,
          currentCost: switchedBilling.currentCost,
          totalMinutes: switchedBilling.totalMinutes,
          totalCost: switchedBilling.totalCost,
          billedAmount: switchedBilling.billedAmount,
        });

        io.to(getUserRoom(activeSession.userId)).emit("chat:updated", {
          sessionId: activeSession.id,
          session: mapSession(activeSession, "user"),
        });

        io.to(getAstrologerRoom(activeSession.astrologerId)).emit("chat:updated", {
          sessionId: activeSession.id,
          session: mapSession(activeSession, "astrologer"),
        });
      }

      queueArchiveAndDeleteSession(activeSession.id, {
        endReason: "astrologer_switched_chat",
        billedAmount: switchedBilling.billedAmount,
      });
    }

    await session.update({
      requestStatus: "approved",
      status: "active",
      startTime: approvalStartTime,
      endTime: null,
      maxDurationSeconds: walletLimit.maxDurationSeconds,
      maxEndTime: walletLimit.maxEndTime,
      walletBalanceAtApproval: walletLimit.walletBalanceAtApproval,
    });

    if (io && chatSocketService) {
      chatSocketService.scheduleUserInactivityAutoEnd(io, session);
      chatSocketService.scheduleWalletLimitAutoEnd(io, session);
    }

    // Notify both sides via Socket.IO if available
    if (io) {
      const {
        getSessionRoom,
        getUserRoom,
        getAstrologerRoom,
        mapSession,
      } = require("../../services/chatSocket");

      const sessionForUser = mapSession(session, "user");
      const sessionForAstrologer = mapSession(session, "astrologer");

      io.to(getSessionRoom(sessionId)).emit("chat:approved", { sessionId });

      io.to(getUserRoom(session.userId)).emit("chat:updated", {
        sessionId,
        session: sessionForUser,
      });

      io.to(getAstrologerRoom(session.astrologerId)).emit("chat:updated", {
        sessionId,
        session: sessionForAstrologer,
      });
    }

    return res.status(200).json({
      success: true,
      message: "Chat request approved",
      session,
    });
  } catch (error) {
    console.error("Approve chat request error:", error);
    res.status(500).json({
      success: false,
      message: "Failed to approve chat request",
      error: error.message,
    });
  }
};

// Reject a chat request (astrologer only)
const rejectChatRequest = async (req, res) => {
  try {
    const astrologerId = req.user.id;
    const { sessionId } = req.params;

    const session = await ChatSession.findOne({
      where: { id: sessionId, astrologerId },
    });

    if (!session) {
      return res.status(404).json({
        success: false,
        message: "Chat session not found",
      });
    }

    await session.update({
      requestStatus: "rejected",
      status: "cancelled",
      endTime: new Date(),
    });

    const io = req.app.get("io");
    if (io) {
      const {
        getSessionRoom,
        getUserRoom,
        getAstrologerRoom,
        mapSession,
        clearUserInactivityAutoEnd,
        clearWalletLimitAutoEnd,
      } = require("../../services/chatSocket");

      clearUserInactivityAutoEnd(session.id);
      clearWalletLimitAutoEnd(session.id);

      const sessionForUser = mapSession(session, "user");
      const sessionForAstrologer = mapSession(session, "astrologer");

      io.to(getSessionRoom(sessionId)).emit("chat:rejected", { sessionId });

      io.to(getUserRoom(session.userId)).emit("chat:updated", {
        sessionId,
        session: sessionForUser,
      });

      io.to(getAstrologerRoom(session.astrologerId)).emit("chat:updated", {
        sessionId,
        session: sessionForAstrologer,
      });
    }

    return res.status(200).json({
      success: true,
      message: "Chat request rejected",
      session,
    });
  } catch (error) {
    console.error("Reject chat request error:", error);
    res.status(500).json({
      success: false,
      message: "Failed to reject chat request",
      error: error.message,
    });
  }
};

const getUserChatHistory = async (req, res) => {
  try {
    const userId = req.user.id;
    const { page = 1, limit = 5 } = req.query;
    const pageNumber = Math.max(parseInt(page, 10) || 1, 1);
    const pageSize = Math.max(parseInt(limit, 10) || 5, 1);
    const offset = (pageNumber - 1) * pageSize;

    const { rows: historySessions, count } = await ChatHistorySession.findAndCountAll({
      where: { userId },
      distinct: true,
      col: "id",
      limit: pageSize,
      offset,
      order: [["endTime", "DESC"], ["createdAt", "DESC"]],
      include: [
        {
          model: Astrologer,
          as: "astrologer",
          attributes: ["id", "fullName", "photo", "rating", "pricePerMinute"],
        },
      ],
    });

    res.status(200).json({
      success: true,
      historySessions,
      pagination: {
        total: count,
        page: pageNumber,
        limit: pageSize,
        totalPages: Math.ceil(count / pageSize),
      },
    });
  } catch (error) {
    console.error("Get user chat history error:", error);
    res.status(500).json({
      success: false,
      message: "Failed to fetch chat history",
      error: error.message,
    });
  }
};

const getUserAstrologerChatHistory = async (req, res) => {
  try {
    const userId = req.user.id;
    const { astrologerId } = req.params;
    const { page = 1, limit = 3 } = req.query;
    const pageNumber = Math.max(parseInt(page, 10) || 1, 1);
    const pageSize = Math.max(parseInt(limit, 10) || 3, 1);
    const offset = (pageNumber - 1) * pageSize;

    const { rows: historySessions, count } = await ChatHistorySession.findAndCountAll({
      where: { userId, astrologerId },
      distinct: true,
      col: "id",
      limit: pageSize,
      offset,
      order: [["endTime", "DESC"], ["createdAt", "DESC"]],
      include: [
        {
          model: Astrologer,
          as: "astrologer",
          attributes: ["id", "fullName", "photo", "rating", "pricePerMinute"],
        },
        {
          model: ChatHistoryMessage,
          as: "messages",
          required: false,
          order: [["originalCreatedAt", "ASC"]],
        },
      ],
    });

    const formattedSessions = historySessions.map((session) => {
      const json = session.toJSON();
      const sortedMessages = (json.messages || []).sort(
        (a, b) =>
          new Date(a.originalCreatedAt).getTime() -
          new Date(b.originalCreatedAt).getTime()
      );

      return {
        ...json,
        messages: sortedMessages,
      };
    });

    res.status(200).json({
      success: true,
      historySessions: formattedSessions,
      pagination: {
        total: count,
        page: pageNumber,
        limit: pageSize,
        totalPages: Math.ceil(count / pageSize),
      },
    });
  } catch (error) {
    console.error("Get user astrologer chat history error:", error);
    res.status(500).json({
      success: false,
      message: "Failed to fetch astrologer chat history",
      error: error.message,
    });
  }
};

const getChatHistorySessionV2 = async (req, res) => {
  try {
    const { historySessionId } = req.params;

    const historySession = await ChatHistorySession.findByPk(historySessionId, {
      include: [
        {
          model: User,
          as: "user",
          attributes: ASTROLOGER_CHAT_USER_ATTRIBUTES,
        },
        {
          model: Astrologer,
          as: "astrologer",
          attributes: ["id", "fullName", "photo", "rating", "pricePerMinute"],
        },
        {
          model: ChatHistoryMessage,
          as: "messages",
          required: false,
        },
      ],
      order: [[{ model: ChatHistoryMessage, as: "messages" }, "originalCreatedAt", "ASC"]],
    });

    if (!historySession) {
      return res.status(404).json({
        success: false,
        message: "Chat history session not found",
      });
    }

    if (!canAccessChatSession(req.user, historySession)) {
      return res.status(403).json({
        success: false,
        message: "Access denied to this chat history session",
      });
    }

    const json = historySession.toJSON();

    return res.status(200).json({
      success: true,
      historySession: {
        ...json,
        messages: mapHistoryMessages(json.messages || []),
      },
    });
  } catch (error) {
    console.error("Get chat history session v2 error:", error);
    res.status(500).json({
      success: false,
      message: "Failed to fetch chat history session",
      error: error.message,
    });
  }
};

const getAstrologerChatHistory = async (req, res) => {
  try {
    const astrologerId = req.user.id;
    const { page = 1, limit = 20 } = req.query;
    const pageNumber = Math.max(parseInt(page, 10) || 1, 1);
    const pageSize = Math.max(parseInt(limit, 10) || 20, 1);
    const offset = (pageNumber - 1) * pageSize;

    const { rows: historySessions, count } = await ChatHistorySession.findAndCountAll({
      where: { astrologerId },
      distinct: true,
      col: "id",
      limit: pageSize,
      offset,
      order: [["endTime", "DESC"], ["createdAt", "DESC"]],
      include: [
        {
          model: User,
          as: "user",
          attributes: ASTROLOGER_CHAT_USER_ATTRIBUTES,
        },
      ],
    });

    res.status(200).json({
      success: true,
      historySessions,
      pagination: {
        total: count,
        page: pageNumber,
        limit: pageSize,
        totalPages: Math.ceil(count / pageSize),
      },
    });
  } catch (error) {
    console.error("Get astrologer chat history error:", error);
    res.status(500).json({
      success: false,
      message: "Failed to fetch astrologer chat history",
      error: error.message,
    });
  }
};

// End an active chat session from astrologer side
const endAstrologerChatSession = async (req, res) => {
  try {
    const astrologerId = req.user.id;
    const { sessionId } = req.params;

    const session = await ChatSession.findOne({
      where: {
        id: sessionId,
        astrologerId,
      },
    });

    if (!session) {
      const archived = await ChatHistorySession.findOne({
        where: { sourceSessionId: sessionId, astrologerId },
      });

      if (archived) {
        return res.status(200).json({
          success: true,
          message: "Chat session already ended",
          session: {
            id: sessionId,
            totalMinutes: archived.totalMinutes || 0,
            totalCost: parseFloat(archived.totalCost || 0),
            billedAmount: parseFloat(archived.billedAmount || 0),
            pricePerMinute: parseFloat(archived.pricePerMinute || 0),
            startTime: archived.startTime,
            endTime: archived.endTime,
          },
        });
      }

      return res.status(404).json({
        success: false,
        message: "Chat session not found",
      });
    }

    if (session.status !== "active") {
      return res.status(200).json({
        success: true,
        message: "Chat session already ended",
        session: {
          ...session.toJSON(),
          billedAmount: 0,
          billedMinutes: 0,
        },
      });
    }

    const io = req.app.get("io");
    const billing = await completeChatSessionWithBilling(session, io);
    await session.reload();

    if (io) {
      const {
        clearUserInactivityAutoEnd,
        clearWalletLimitAutoEnd,
      } = require("../../services/chatSocket");
      clearUserInactivityAutoEnd(session.id);
      clearWalletLimitAutoEnd(session.id);
    }

    if (io) {
      const {
        getUserRoom,
        getAstrologerRoom,
        mapSession,
      } = require("../../services/chatSocket");

      emitChatEnded(io, session, {
        endedBy: "astrologer",
        reason: "astrologer_left_chat",
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
      endReason: "astrologer_left_chat",
      billedAmount: billing.billedAmount,
    });

    return res.status(200).json({
      success: true,
      message: "Chat session ended",
      session: {
        ...session.toJSON(),
        billedAmount: billing.billedAmount,
        billedMinutes: billing.currentMinutes,
      },
    });
  } catch (error) {
    console.error("End astrologer chat session error:", error);
    return res.status(500).json({
      success: false,
      message: "Failed to end chat session",
      error: error.message,
    });
  }
};

module.exports = {
  startChatSession,
  endChatSession,
  endAstrologerChatSession,
  sendMessage,
  getSessionMessages,
  getChatSessionStatusV2,
  getUserChatSessions,
  getUserChatHistory,
  getUserAstrologerChatHistory,
  getChatHistorySessionV2,
  getAstrologerChatHistory,
  getAstrologerChatSessions,
  getActiveSession,
  getTotalMinutesWithAstrologer,
  approveChatRequest,
  rejectChatRequest,
};
