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

    // Check if user has an active session with this astrologer
    const activeSession = await ChatSession.findOne({
      where: {
        userId,
        astrologerId,
        status: "active",
      },
    });

    if (activeSession) {
      return res.status(400).json({
        success: false,
        message: "You already have an active chat session with this astrologer",
        session: activeSession,
      });
    }

    // Check user wallet balance
    const wallet = await Wallet.findOne({ where: { userId } });
    if (!wallet || wallet.balance < astrologer.pricePerMinute) {
      return res.status(400).json({
        success: false,
        message: "Insufficient wallet balance. Please recharge your wallet.",
        requiredAmount: parseFloat(astrologer.pricePerMinute),
        currentBalance: wallet ? parseFloat(wallet.balance) : 0,
      });
    }

    // Create chat session
    const session = await ChatSession.create({
      userId,
      astrologerId,
      pricePerMinute: astrologer.pricePerMinute,
      startTime: new Date(),
    });

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

// End a chat session
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
    const totalMinutes = Math.ceil(durationMs / (1000 * 60)); // Round up to nearest minute

    const totalCost = totalMinutes * parseFloat(session.pricePerMinute);

    // Update session
    await session.update({
      endTime,
      totalMinutes,
      totalCost,
      status: "completed",
    });

    // Deduct from wallet
    const wallet = await Wallet.findOne({ where: { userId } });
    
    if (wallet.balance < totalCost) {
      return res.status(400).json({
        success: false,
        message: "Insufficient balance to complete session",
        totalCost,
        currentBalance: parseFloat(wallet.balance),
      });
    }

    await wallet.update({
      balance: parseFloat(wallet.balance) - totalCost,
    });

    // Create wallet transaction
    await WalletTransaction.create({
      userId,
      walletId: wallet.id,
      amount: totalCost,
      type: "debit",
      status: "completed",
      description: `Chat consultation with astrologer - ${totalMinutes} minutes`,
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

// Send message (user or astrologer)
const sendMessage = async (req, res) => {
  try {
    const { sessionId } = req.params;
    const { message, messageType = "text" } = req.body;
    
    // Determine sender type and ID
    let senderId, senderType;
    if (req.user) {
      senderId = req.user.id;
      senderType = "user";
    } else if (req.astrologer) {
      senderId = req.astrologer.id;
      senderType = "astrologer";
    }

    if (!message) {
      return res.status(400).json({
        success: false,
        message: "Message content is required",
      });
    }

    // Check if session exists and is active
    const session = await ChatSession.findOne({
      where: { id: sessionId, status: "active" },
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
    });

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

    // Determine if user or astrologer
    let userId, astrologerId;
    if (req.user) {
      userId = req.user.id;
    } else if (req.astrologer) {
      astrologerId = req.astrologer.id;
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

    res.status(200).json({
      success: true,
      sessions,
      pagination: {
        total: count,
        page: parseInt(page),
        limit: parseInt(limit),
        totalPages: Math.ceil(count / limit),
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

// Get astrologer's chat sessions
const getAstrologerChatSessions = async (req, res) => {
  try {
    const astrologerId = req.astrologer.id;
    const { page = 1, limit = 20, status } = req.query;
    const offset = (page - 1) * limit;

    const where = { astrologerId };
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
          model: User,
          as: "user",
          attributes: ["id", "fullName", "email"],
        },
      ],
    });

    res.status(200).json({
      success: true,
      sessions,
      pagination: {
        total: count,
        page: parseInt(page),
        limit: parseInt(limit),
        totalPages: Math.ceil(count / limit),
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

// Get active session
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

// Get total minutes chatted with an astrologer
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

module.exports = {
  startChatSession,
  endChatSession,
  sendMessage,
  getSessionMessages,
  getUserChatSessions,
  getAstrologerChatSessions,
  getActiveSession,
  getTotalMinutesWithAstrologer,
};
