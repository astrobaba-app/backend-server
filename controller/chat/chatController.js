const ChatSession = require("../../model/chat/chatSession");
const ChatMessage = require("../../model/chat/chatMessage");
const User = require("../../model/user/userAuth");
const Astrologer = require("../../model/astrologer/astrologer");
const { Op } = require("sequelize");
const webPushService = require("../../services/webPushService");
const pushNotificationService = require("../../services/pushNotificationService");
const {
  completeChatSessionWithBilling,
} = require("../../services/chatSessionLifecycle");

const CHAT_REQUEST_TIMEOUT_SECONDS = 30;
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

    // Reuse existing session for this user-astrologer pair if it exists
    let session = await ChatSession.findOne({
      where: {
        userId,
        astrologerId,
      },
    });

    // Create chat session if none exists yet
    if (!session) {
      session = await ChatSession.create({
        userId,
        astrologerId,
        pricePerMinute: astrologer.pricePerMinute,
        startTime: new Date(),
        // Initially mark as pending until astrologer approves the chat request
        requestStatus: "pending",
      });
    } else {
      // Reactivate existing session for a new conversation window
      await session.update({
        status: "active",
        startTime: new Date(),
        endTime: null,
        requestStatus: "pending",
      });
    }

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
          astrologerId: String(astrologerId),
          userId: String(req.user.id),
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

    const session = await ChatSession.findOne({
      where: { id: sessionId, userId },
    });

    if (!session) {
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

    if (io) {
      const { clearUserInactivityAutoEnd } = require("../../services/chatSocket");
      clearUserInactivityAutoEnd(session.id);
    }

    // Notify both sides that chat ended so UI can close/clean up instantly.
    if (io) {
      const {
        getSessionRoom,
        getUserRoom,
        getAstrologerRoom,
        mapSession,
      } = require("../../services/chatSocket");

      io.to(getSessionRoom(session.id)).emit("chat:ended", {
        sessionId: session.id,
        endedBy: "user",
        reason: "user_ended_chat",
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
    const { message, messageType = "text", replyToMessageId } = req.body;
    
    // Determine sender type and ID
    if (!req.user) {
      return res.status(401).json({
        success: false,
        message: "Authentication required",
      });
    }

    const senderId = req.user.id;
    const senderType = req.user.role === "astrologer" ? "astrologer" : "user";

    if (!message) {
      return res.status(400).json({
        success: false,
        message: "Message content is required",
      });
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

    // Get file URL if uploaded
    const fileUrl = req.fileUrl || null;

    // Create message
    const chatMessage = await ChatMessage.create({
      sessionId,
      senderId,
      senderType,
      message,
      messageType,
      fileUrl,
      replyToMessageId: replyToMessageId || null,
    });

    // Update session metadata and unread counters
    const lastMessagePreview =
      messageType === "image" || messageType === "file"
        ? "[Attachment]"
        : (message || "").slice(0, 200);

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
        getSessionRoom,
        getUserRoom,
        getAstrologerRoom,
        mapMessage,
        mapSession,
        scheduleUserInactivityAutoEnd,
      } = require("../../services/chatSocket");

      const messagePayload = mapMessage(chatMessage);
      const sessionForUser = mapSession(session, "user");
      const sessionForAstrologer = mapSession(session, "astrologer");

      io.to(getSessionRoom(sessionId)).emit("message:new", {
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

// Get user's chat sessions
const getUserChatSessions = async (req, res) => {
  try {
    const userId = req.user.id;
    const { page = 1, limit = 20, status } = req.query;
    const offset = (page - 1) * limit;

    const where = { userId };
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

    // Ensure only one session per user-astrologer pair is returned
    // by keeping the most recently created session for each astrologer.
    const dedupedMap = new Map();
    sessions.forEach((session) => {
      const key = session.astrologerId;
      const existing = dedupedMap.get(key);
      if (!existing || new Date(session.createdAt) > new Date(existing.createdAt)) {
        dedupedMap.set(key, session);
      }
    });

    const uniqueSessions = Array.from(dedupedMap.values());

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
        const { scheduleUserInactivityAutoEnd } = require("../../services/chatSocket");
        scheduleUserInactivityAutoEnd(io, session);
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

    const io = req.app.get("io");
    let chatSocketService = null;
    if (io) {
      chatSocketService = require("../../services/chatSocket");
    }

    if (activeSession) {
      await activeSession.update({
        status: "completed",
        endTime: new Date(),
      });

      if (io && chatSocketService) {
        const {
          getSessionRoom,
          getUserRoom,
          getAstrologerRoom,
          mapSession,
          clearUserInactivityAutoEnd,
        } =
          chatSocketService;

        clearUserInactivityAutoEnd(activeSession.id);

        io.to(getSessionRoom(activeSession.id)).emit("chat:ended", {
          sessionId: activeSession.id,
          endedBy: "astrologer",
          reason: "astrologer_switched_chat",
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
    }

    await session.update({
      requestStatus: "approved",
      status: "active",
      startTime: new Date(),
      endTime: null,
    });

    if (io && chatSocketService) {
      chatSocketService.scheduleUserInactivityAutoEnd(io, session);
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
      } = require("../../services/chatSocket");

      clearUserInactivityAutoEnd(session.id);

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

    if (io) {
      const { clearUserInactivityAutoEnd } = require("../../services/chatSocket");
      clearUserInactivityAutoEnd(session.id);
    }

    if (io) {
      const {
        getSessionRoom,
        getUserRoom,
        getAstrologerRoom,
        mapSession,
      } = require("../../services/chatSocket");

      io.to(getSessionRoom(session.id)).emit("chat:ended", {
        sessionId: session.id,
        endedBy: "astrologer",
        reason: "astrologer_left_chat",
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
  getUserChatSessions,
  getAstrologerChatSessions,
  getActiveSession,
  getTotalMinutesWithAstrologer,
  approveChatRequest,
  rejectChatRequest,
};
