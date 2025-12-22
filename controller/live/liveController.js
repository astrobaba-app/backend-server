const LiveSession = require("../../model/live/liveSession");
const LiveParticipant = require("../../model/live/liveParticipant");
const Astrologer = require("../../model/astrologer/astrologer");
const User = require("../../model/user/userAuth");
const Wallet = require("../../model/wallet/wallet");
const WalletTransaction = require("../../model/wallet/walletTransaction");
const AstrologerEarning = require("../../model/astrologer/astrologerEarning");
const agoraService = require("../../services/agoraService");
const notificationService = require("../../services/notificationService");
const { Op } = require("sequelize");

// Create/Schedule live session (Astrologer only)
const createLiveSession = async (req, res) => {
  try {
    const astrologerId = req.user.id;
    const {
      title,
      description,
      pricePerMinute,
      sessionType = "live_stream",
      scheduledAt = null,
    } = req.body;

    if (!title || !pricePerMinute) {
      return res.status(400).json({
        success: false,
        message: "Title and price per minute are required",
      });
    }

    // Check if astrologer has an active live session
    const activeLive = await LiveSession.findOne({
      where: {
        astrologerId,
        status: { [Op.in]: ["scheduled", "live"] },
      },
    });

    if (activeLive) {
      return res.status(400).json({
        success: false,
        message: "You already have an active or scheduled live session",
      });
    }

    // Generate Agora channel name
    const channelName = agoraService.generateChannelName(`live_${astrologerId}`);

    // Get thumbnail if uploaded
    const thumbnail = req.fileUrl || null;

    // Create live session
    const liveSession = await LiveSession.create({
      astrologerId,
      title,
      description,
      thumbnail,
      sessionType,
      pricePerMinute,
      scheduledAt,
      agoraChannelName: channelName,
      agoraAppId: process.env.AGORA_APP_ID,
      status: scheduledAt ? "scheduled" : "live",
      startedAt: scheduledAt ? null : new Date(),
    });

    // Get astrologer details
    const astrologer = await Astrologer.findByPk(astrologerId, {
      attributes: ["id", "fullName", "photo"],
    });

    // Send notifications
    if (!scheduledAt) {
      // Started immediately
      await notificationService.notifyLiveStarted(liveSession, astrologer);
    } else {
      // Scheduled for later
      await notificationService.notifyLiveScheduled(liveSession, astrologer, scheduledAt);
    }

    res.status(201).json({
      success: true,
      message: scheduledAt ? "Live session scheduled successfully" : "Live session created successfully",
      liveSession: {
        ...liveSession.toJSON(),
        astrologer,
      },
    });
  } catch (error) {
    console.error("Create live session error:", error);
    res.status(500).json({
      success: false,
      message: "Failed to create live session",
      error: error.message,
    });
  }
};

// Start scheduled live session
const startLiveSession = async (req, res) => {
  try {
    const astrologerId = req.user.id;
    const { sessionId } = req.params;

    const liveSession = await LiveSession.findOne({
      where: {
        id: sessionId,
        astrologerId,
        status: "scheduled",
      },
    });

    if (!liveSession) {
      return res.status(404).json({
        success: false,
        message: "Scheduled live session not found",
      });
    }

    // Update to live
    await liveSession.update({
      status: "live",
      startedAt: new Date(),
    });

    // Get astrologer details
    const astrologer = await Astrologer.findByPk(astrologerId, {
      attributes: ["id", "fullName", "photo"],
    });

    // Send notifications
    await notificationService.notifyLiveStarted(liveSession, astrologer);

    res.status(200).json({
      success: true,
      message: "Live session started successfully",
      liveSession,
    });
  } catch (error) {
    console.error("Start live session error:", error);
    res.status(500).json({
      success: false,
      message: "Failed to start live session",
      error: error.message,
    });
  }
};

// Get Agora token for astrologer (host)
const getHostToken = async (req, res) => {
  try {
    const astrologerId = req.user.id;
    const { sessionId } = req.params;

    console.log("Getting host token - Astrologer:", astrologerId, "Session:", sessionId);

    const liveSession = await LiveSession.findOne({
      where: {
        id: sessionId,
        astrologerId,
        status: { [Op.in]: ["scheduled", "live"] },
      },
    });

    if (!liveSession) {
      console.log("Live session not found or not owned by astrologer");
      return res.status(404).json({
        success: false,
        message: "Live session not found",
      });
    }

    console.log("Live session found:", liveSession.id, "Channel:", liveSession.agoraChannelName);

    // Generate Agora token for host with uid 0 (auto-assign)
    const uid = 0; // Use 0 to let Agora auto-assign unique UID
    const tokenData = agoraService.generateLiveStreamToken(liveSession.agoraChannelName, uid);

    console.log("Token generated successfully with auto-assign uid");

    res.status(200).json({
      success: true,
      ...tokenData,
      role: "host",
    });
  } catch (error) {
    console.error("Get host token error:", error);
    res.status(500).json({
      success: false,
      message: "Failed to generate token",
      error: error.message,
    });
  }
};

// Join live session (User)
const joinLiveSession = async (req, res) => {
  try {
    const userId = req.user.id;
    const { sessionId } = req.params;

    // Get live session
    const liveSession = await LiveSession.findOne({
      where: {
        id: sessionId,
        status: "live",
      },
      include: [
        {
          model: Astrologer,
          as: "astrologer",
          attributes: ["id", "fullName", "photo", "rating"],
        },
      ],
    });

    if (!liveSession) {
      return res.status(404).json({
        success: false,
        message: "Live session not found or not active",
      });
    }

    // Check wallet balance
    const wallet = await Wallet.findOne({ where: { userId } });
    if (!wallet || parseFloat(wallet.balance) < parseFloat(liveSession.pricePerMinute)) {
      return res.status(400).json({
        success: false,
        message: "Insufficient wallet balance",
        requiredAmount: parseFloat(liveSession.pricePerMinute),
        currentBalance: wallet ? parseFloat(wallet.balance) : 0,
      });
    }

    // Check if already joined
    let participant = await LiveParticipant.findOne({
      where: { liveSessionId: sessionId, userId },
    });

    if (participant && participant.isActive) {
      // Already in the session - use uid 0 for auto-assign
      const uid = 0;
      const tokenData = agoraService.generateViewerToken(liveSession.agoraChannelName, uid);

      return res.status(200).json({
        success: true,
        message: "Already joined",
        ...tokenData,
        participant,
        liveSession,
      });
    }

    // Generate Agora token for viewer - use uid 0 for auto-assign
    const uid = 0;
    const tokenData = agoraService.generateViewerToken(liveSession.agoraChannelName, uid);

    // Create or update participant record
    if (participant) {
      await participant.update({
        isActive: true,
        joinedAt: new Date(),
        leftAt: null,
        agoraUid: uid,
      });
    } else {
      participant = await LiveParticipant.create({
        liveSessionId: sessionId,
        userId,
        agoraUid: uid,
      });

      // Increment total viewers
      await liveSession.update({
        totalViewers: liveSession.totalViewers + 1,
      });
    }

    // Update current viewers
    const currentViewers = await LiveParticipant.count({
      where: { liveSessionId: sessionId, isActive: true },
    });

    await liveSession.update({
      currentViewers,
      maxViewers: Math.max(liveSession.maxViewers, currentViewers),
    });

    res.status(200).json({
      success: true,
      message: "Joined live session successfully",
      ...tokenData,
      participant,
      liveSession,
      pricePerMinute: parseFloat(liveSession.pricePerMinute),
    });
  } catch (error) {
    console.error("Join live session error:", error);
    res.status(500).json({
      success: false,
      message: "Failed to join live session",
      error: error.message,
    });
  }
};

// Leave live session (User)
const leaveLiveSession = async (req, res) => {
  try {
    const userId = req.user.id;
    const { sessionId } = req.params;

    const participant = await LiveParticipant.findOne({
      where: {
        liveSessionId: sessionId,
        userId,
        isActive: true,
      },
    });

    if (!participant) {
      return res.status(404).json({
        success: false,
        message: "You are not in this live session",
      });
    }

    const liveSession = await LiveSession.findByPk(sessionId);

    // Calculate minutes and cost
    const leftAt = new Date();
    const joinedAt = new Date(participant.joinedAt);
    const durationMs = leftAt - joinedAt;
    const minutes = Math.ceil(durationMs / (1000 * 60));
    const cost = minutes * parseFloat(liveSession.pricePerMinute);

    // Update participant
    await participant.update({
      leftAt,
      totalMinutes: participant.totalMinutes + minutes,
      totalCost: parseFloat(participant.totalCost) + cost,
      isActive: false,
    });

    // Deduct from wallet
    const wallet = await Wallet.findOne({ where: { userId } });
    
    if (parseFloat(wallet.balance) < cost) {
      return res.status(400).json({
        success: false,
        message: "Insufficient balance. Please recharge.",
        amountDue: cost,
        currentBalance: parseFloat(wallet.balance),
      });
    }

    await wallet.update({
      balance: parseFloat(wallet.balance) - cost,
    });

    // Create transaction
    await WalletTransaction.create({
      userId,
      walletId: wallet.id,
      amount: cost,
      type: "debit",
      status: "completed",
      description: `Live session with ${liveSession.title} - ${minutes} minutes`,
    });

    // Update live session revenue and current viewers
    await liveSession.update({
      totalRevenue: parseFloat(liveSession.totalRevenue) + cost,
      currentViewers: Math.max(0, liveSession.currentViewers - 1),
    });

    res.status(200).json({
      success: true,
      message: "Left live session successfully",
      minutes,
      cost,
      totalMinutes: participant.totalMinutes,
      totalCost: parseFloat(participant.totalCost),
    });
  } catch (error) {
    console.error("Leave live session error:", error);
    res.status(500).json({
      success: false,
      message: "Failed to leave live session",
      error: error.message,
    });
  }
};

// End live session (Astrologer)
const endLiveSession = async (req, res) => {
  try {
    const astrologerId = req.user.id;
    const { sessionId } = req.params;

    const liveSession = await LiveSession.findOne({
      where: {
        id: sessionId,
        astrologerId,
        status: "live",
      },
      include: [
        {
          model: Astrologer,
          as: "astrologer",
          attributes: ["id", "fullName"],
        },
      ],
    });

    if (!liveSession) {
      return res.status(404).json({
        success: false,
        message: "Active live session not found",
      });
    }

    // Get Socket.IO instance
    const io = req.app.get("io");
    const liveNamespace = io.of("/live");
    const { getLiveSessionRoom } = require("../../services/chatSocket");
    const roomName = getLiveSessionRoom(sessionId);

    // Process all active participants
    const activeParticipants = await LiveParticipant.findAll({
      where: { liveSessionId: sessionId, isActive: true },
    });

    let totalRevenue = 0;

    for (const participant of activeParticipants) {
      const leftAt = new Date();
      const joinedAt = new Date(participant.joinedAt);
      const durationMs = leftAt - joinedAt;
      const minutes = Math.ceil(durationMs / (1000 * 60));
      const cost = minutes * parseFloat(liveSession.pricePerMinute);

      await participant.update({
        leftAt,
        totalMinutes: participant.totalMinutes + minutes,
        totalCost: parseFloat(participant.totalCost) + cost,
        isActive: false,
      });

      // Deduct from wallet
      const wallet = await Wallet.findOne({ where: { userId: participant.userId } });
      if (wallet) {
        const currentBalance = parseFloat(wallet.balance);
        const deductionAmount = Math.min(currentBalance, cost);

        if (deductionAmount > 0) {
          await wallet.update({
            balance: currentBalance - deductionAmount,
            totalSpent: parseFloat(wallet.totalSpent) + deductionAmount,
          });

          await WalletTransaction.create({
            userId: participant.userId,
            walletId: wallet.id,
            amount: deductionAmount,
            type: "debit",
            status: "completed",
            description: `Live session: ${liveSession.title} - ${minutes} minutes`,
            balanceBefore: currentBalance,
            balanceAfter: currentBalance - deductionAmount,
            metadata: {
              liveSessionId: liveSession.id,
              astrologerId: liveSession.astrologerId,
              durationMinutes: minutes,
              pricePerMinute: parseFloat(liveSession.pricePerMinute),
            },
          });

          totalRevenue += deductionAmount;

          // Credit to astrologer earnings
          const AstrologerEarning = require("../../model/astrologer/astrologerEarning");
          const commissionPercentage = 20; // 20% platform commission
          const platformCommission = deductionAmount * (commissionPercentage / 100);
          const netEarning = deductionAmount - platformCommission;

          await AstrologerEarning.create({
            astrologerId: liveSession.astrologerId,
            userId: participant.userId,
            sessionId: liveSession.id,
            sessionType: "live",
            durationMinutes: minutes,
            pricePerMinute: parseFloat(liveSession.pricePerMinute),
            totalAmount: deductionAmount,
            platformCommission,
            commissionPercentage,
            netEarning,
            paymentStatus: "pending",
            sessionStartTime: joinedAt,
            sessionEndTime: leftAt,
          });

          // Emit wallet update event to user
          const io = req.app.get("io");
          if (io) {
            io.to(`user:${participant.userId}`).emit("wallet:updated", {
              balance: currentBalance - deductionAmount,
              deduction: deductionAmount,
              reason: "live",
              liveSessionId: liveSession.id,
            });
          }
        }
      }
    }

    // Update live session total revenue
    await liveSession.update({
      totalRevenue: parseFloat(liveSession.totalRevenue || 0) + totalRevenue,
    });

    // End session
    await liveSession.update({
      status: "ended",
      endedAt: new Date(),
      currentViewers: 0,
    });

    // Emit socket event to all participants in the room
    liveNamespace.to(roomName).emit("live_session_ended", {
      sessionId: liveSession.id,
      message: `${liveSession.astrologer.fullName} has ended the live session`,
      astrologerName: liveSession.astrologer.fullName,
    });

    res.status(200).json({
      success: true,
      message: "Live session ended successfully",
      liveSession: {
        id: liveSession.id,
        totalViewers: liveSession.totalViewers,
        maxViewers: liveSession.maxViewers,
        totalRevenue: parseFloat(liveSession.totalRevenue),
        duration: Math.ceil((new Date(liveSession.endedAt) - new Date(liveSession.startedAt)) / (1000 * 60)),
      },
    });
  } catch (error) {
    console.error("End live session error:", error);
    res.status(500).json({
      success: false,
      message: "Failed to end live session",
      error: error.message,
    });
  }
};

// Get all active live sessions
const getActiveLiveSessions = async (req, res) => {
  try {
    const { page = 1, limit = 20 } = req.query;
    const offset = (page - 1) * limit;

    const { rows: liveSessions, count } = await LiveSession.findAndCountAll({
      where: { status: "live" },
      include: [
        {
          model: Astrologer,
          as: "astrologer",
          attributes: ["id", "fullName", "photo", "rating", "yearsOfExperience"],
        },
      ],
      order: [["currentViewers", "DESC"], ["startedAt", "DESC"]],
      limit: parseInt(limit),
      offset: parseInt(offset),
    });

    res.status(200).json({
      success: true,
      liveSessions,
      pagination: {
        total: count,
        page: parseInt(page),
        limit: parseInt(limit),
        totalPages: Math.ceil(count / limit),
      },
    });
  } catch (error) {
    console.error("Get active live sessions error:", error);
    res.status(500).json({
      success: false,
      message: "Failed to fetch live sessions",
      error: error.message,
    });
  }
};

// Get astrologer's live sessions
const getAstrologerLiveSessions = async (req, res) => {
  try {
    const astrologerId = req.user.id;
    const { page = 1, limit = 20, status } = req.query;
    const offset = (page - 1) * limit;

    const where = { astrologerId };
    if (status) {
      where.status = status;
    }

    const { rows: liveSessions, count } = await LiveSession.findAndCountAll({
      where,
      order: [["createdAt", "DESC"]],
      limit: parseInt(limit),
      offset: parseInt(offset),
    });

    res.status(200).json({
      success: true,
      liveSessions,
      pagination: {
        total: count,
        page: parseInt(page),
        limit: parseInt(limit),
        totalPages: Math.ceil(count / limit),
      },
    });
  } catch (error) {
    console.error("Get astrologer live sessions error:", error);
    res.status(500).json({
      success: false,
      message: "Failed to fetch live sessions",
      error: error.message,
    });
  }
};

// Get live session history (for astrologer dashboard)
const getLiveHistory = async (req, res) => {
  try {
    const astrologerId = req.user.id;
    const { page = 1, limit = 20 } = req.query;
    const offset = (page - 1) * limit;

    const { rows: sessions, count } = await LiveSession.findAndCountAll({
      where: {
        astrologerId,
        status: "ended",
      },
      order: [["endedAt", "DESC"]],
      limit: parseInt(limit),
      offset: parseInt(offset),
      attributes: [
        "id",
        "title",
        "startedAt",
        "endedAt",
        "totalViewers",
        "maxViewers",
        "totalRevenue",
      ],
    });

    // Calculate duration for each session
    const sessionsWithDuration = sessions.map((session) => {
      const duration = session.endedAt && session.startedAt
        ? Math.ceil((new Date(session.endedAt) - new Date(session.startedAt)) / (1000 * 60))
        : 0;
      return {
        ...session.toJSON(),
        durationMinutes: duration,
      };
    });

    res.status(200).json({
      success: true,
      sessions: sessionsWithDuration,
      pagination: {
        total: count,
        page: parseInt(page),
        limit: parseInt(limit),
        totalPages: Math.ceil(count / limit),
      },
    });
  } catch (error) {
    console.error("Get live history error:", error);
    res.status(500).json({
      success: false,
      message: "Failed to fetch live history",
      error: error.message,
    });
  }
};

// Get live chat messages for a session
const getLiveChatMessages = async (req, res) => {
  try {
    const { sessionId } = req.params;
    const { page = 1, limit = 20 } = req.query;
    const offset = (page - 1) * limit;

    const LiveChatMessage = require("../../model/live/liveChatMessage");

    const { rows: messages, count } = await LiveChatMessage.findAndCountAll({
      where: { liveSessionId: sessionId },
      order: [["createdAt", "ASC"]],
      limit: parseInt(limit),
      offset: parseInt(offset),
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
    console.error("Get live chat messages error:", error);
    res.status(500).json({
      success: false,
      message: "Failed to fetch chat messages",
      error: error.message,
    });
  }
};

module.exports = {
  createLiveSession,
  startLiveSession,
  getHostToken,
  joinLiveSession,
  leaveLiveSession,
  endLiveSession,
  getActiveLiveSessions,
  getAstrologerLiveSessions,
  getLiveHistory,
  getLiveChatMessages,
};
