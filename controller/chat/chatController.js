const ChatSession = require("../../model/chat/chatSession");
const ChatMessage = require("../../model/chat/chatMessage");
const User = require("../../model/user/userAuth");
const Astrologer = require("../../model/astrologer/astrologer");
const Wallet = require("../../model/wallet/wallet");
const WalletTransaction = require("../../model/wallet/walletTransaction");
const { Op } = require("sequelize");

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
      });
    }

    // Get astrologer details
    const astrologerDetails = await Astrologer.findByPk(astrologerId, {
      attributes: ["id", "fullName", "photo", "pricePerMinute", "rating"],
    });

    res.status(201).json({
      success: true,
      message: "Chat session started successfully",
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
      where: { id: sessionId, userId, status: "active" },
    });

    if (!session) {
      return res.status(404).json({
        success: false,
        message: "Active chat session not found",
      });
    }

    const endTime = new Date();
    const startTime = new Date(session.startTime);
    const durationMs = endTime - startTime;
    const currentMinutes = Math.ceil(durationMs / (1000 * 60)); // Round up to nearest minute

    const currentCost = currentMinutes * parseFloat(session.pricePerMinute);

    const accumulatedMinutes = session.totalMinutes || 0;
    const accumulatedCost = parseFloat(session.totalCost || 0);
    const totalMinutes = accumulatedMinutes + currentMinutes;
    const totalCost = accumulatedCost + currentCost;

    // Update session
    await session.update({
      endTime,
      totalMinutes,
      totalCost,
      status: "completed",
    });

    // Deduct from wallet
    const wallet = await Wallet.findOne({ where: { userId } });
    
    if (wallet.balance < currentCost) {
      return res.status(400).json({
        success: false,
        message: "Insufficient balance to complete session",
        totalCost: currentCost,
        currentBalance: parseFloat(wallet.balance),
      });
    }

    await wallet.update({
      balance: parseFloat(wallet.balance) - currentCost,
    });

    // Create wallet transaction
    await WalletTransaction.create({
      userId,
      walletId: wallet.id,
      amount: currentCost,
      type: "debit",
      status: "completed",
      description: `Chat consultation with astrologer - ${currentMinutes} minutes`,
    });

    res.status(200).json({
      success: true,
      message: "Chat session ended successfully",
      session: {
        id: session.id,
        totalMinutes,
        totalCost,
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

    const { rows: messages, count } = await ChatMessage.findAndCountAll({
      where: { sessionId },
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
          attributes: ["id", "fullName", "photo", "rating"],
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

    const where = { astrologerId };
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
          attributes: ["id", "fullName", "email"],
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
      requestStatus: "approved",
      startTime: new Date(),
    });

    // Notify both sides via Socket.IO if available
    const io = req.app.get("io");
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

    await session.update({ requestStatus: "rejected" });

    const io = req.app.get("io");
    if (io) {
      const {
        getSessionRoom,
        getUserRoom,
        getAstrologerRoom,
        mapSession,
      } = require("../../services/chatSocket");

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

module.exports = {
  startChatSession,
  endChatSession,
  sendMessage,
  getSessionMessages,
  getUserChatSessions,
  getAstrologerChatSessions,
  getActiveSession,
  getTotalMinutesWithAstrologer,
  approveChatRequest,
  rejectChatRequest,
};
