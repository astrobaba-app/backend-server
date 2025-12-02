const CallSession = require("../../model/call/callSession");
const Astrologer = require("../../model/astrologer/astrologer");
const User = require("../../model/user/userAuth");
const Wallet = require("../../model/wallet/wallet");
const WalletTransaction = require("../../model/wallet/walletTransaction");
const agoraService = require("../../services/agoraService");
const notificationService = require("../../services/notificationService");
const { Op } = require("sequelize");

// Initiate call (User to Astrologer)
const initiateCall = async (req, res) => {
  try {
    const userId = req.user.id;
    const { astrologerId, callType = "video" } = req.body;

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

    // Check if user has an active call
    const activeCall = await CallSession.findOne({
      where: {
        userId,
        status: { [Op.in]: ["initiated", "ringing", "accepted", "ongoing"] },
      },
    });

    if (activeCall) {
      return res.status(400).json({
        success: false,
        message: "You already have an active call",
      });
    }

    // Check wallet balance
    const wallet = await Wallet.findOne({ where: { userId } });
    if (!wallet || parseFloat(wallet.balance) < parseFloat(astrologer.pricePerMinute)) {
      return res.status(400).json({
        success: false,
        message: "Insufficient wallet balance",
        requiredAmount: parseFloat(astrologer.pricePerMinute),
        currentBalance: wallet ? parseFloat(wallet.balance) : 0,
      });
    }

    // Generate Agora channel name
    const channelName = agoraService.generateChannelName(`call_${userId}_${astrologerId}`);

    // Create call session
    const callSession = await CallSession.create({
      userId,
      astrologerId,
      callType,
      initiatedBy: "user",
      pricePerMinute: astrologer.pricePerMinute,
      agoraChannelName: channelName,
      status: "ringing",
    });

    // Get user details
    const user = await User.findByPk(userId, {
      attributes: ["id", "fullName", "email"],
    });

    // Notify astrologer
    await notificationService.notifyIncomingCall(astrologerId, callSession, user);

    res.status(201).json({
      success: true,
      message: "Call initiated successfully",
      callSession: {
        ...callSession.toJSON(),
        astrologer: {
          id: astrologer.id,
          fullName: astrologer.fullName,
          photo: astrologer.photo,
          rating: astrologer.rating,
        },
      },
    });
  } catch (error) {
    console.error("Initiate call error:", error);
    res.status(500).json({
      success: false,
      message: "Failed to initiate call",
      error: error.message,
    });
  }
};

// Accept call (Astrologer)
const acceptCall = async (req, res) => {
  try {
    const astrologerId = req.astrologer.id;
    const { callId } = req.params;

    const callSession = await CallSession.findOne({
      where: {
        id: callId,
        astrologerId,
        status: "ringing",
      },
    });

    if (!callSession) {
      return res.status(404).json({
        success: false,
        message: "Call not found or already handled",
      });
    }

    // Update call status
    await callSession.update({
      status: "accepted",
      startTime: new Date(),
    });

    res.status(200).json({
      success: true,
      message: "Call accepted successfully",
      callSession,
    });
  } catch (error) {
    console.error("Accept call error:", error);
    res.status(500).json({
      success: false,
      message: "Failed to accept call",
      error: error.message,
    });
  }
};

// Reject call (Astrologer)
const rejectCall = async (req, res) => {
  try {
    const astrologerId = req.astrologer.id;
    const { callId } = req.params;
    const { reason } = req.body;

    const callSession = await CallSession.findOne({
      where: {
        id: callId,
        astrologerId,
        status: "ringing",
      },
    });

    if (!callSession) {
      return res.status(404).json({
        success: false,
        message: "Call not found or already handled",
      });
    }

    await callSession.update({
      status: "rejected",
      rejectionReason: reason || "Astrologer is busy",
    });

    res.status(200).json({
      success: true,
      message: "Call rejected",
      callSession,
    });
  } catch (error) {
    console.error("Reject call error:", error);
    res.status(500).json({
      success: false,
      message: "Failed to reject call",
      error: error.message,
    });
  }
};

// Get Agora token for call
const getCallToken = async (req, res) => {
  try {
    const { callId } = req.params;
    let userId, astrologerId, userType;

    // Determine if user or astrologer
    if (req.user) {
      userId = req.user.id;
      userType = "user";
    } else if (req.astrologer) {
      astrologerId = req.astrologer.id;
      userType = "astrologer";
    }

    const callSession = await CallSession.findOne({
      where: {
        id: callId,
        status: { [Op.in]: ["accepted", "ongoing"] },
      },
    });

    if (!callSession) {
      return res.status(404).json({
        success: false,
        message: "Call not found or not active",
      });
    }

    // Verify participant
    if (userType === "user" && callSession.userId !== userId) {
      return res.status(403).json({
        success: false,
        message: "Access denied",
      });
    }

    if (userType === "astrologer" && callSession.astrologerId !== astrologerId) {
      return res.status(403).json({
        success: false,
        message: "Access denied",
      });
    }

    // Generate token
    const uid = agoraService.generateUid();
    const tokenData = agoraService.generateCallToken(callSession.agoraChannelName, uid);

    // Update UID in database
    if (userType === "user") {
      await callSession.update({ agoraUidUser: uid });
    } else {
      await callSession.update({ agoraUidAstrologer: uid });
    }

    // Update status to ongoing if both joined
    if (callSession.status === "accepted") {
      await callSession.update({ status: "ongoing" });
    }

    res.status(200).json({
      success: true,
      ...tokenData,
      userType,
      callType: callSession.callType,
    });
  } catch (error) {
    console.error("Get call token error:", error);
    res.status(500).json({
      success: false,
      message: "Failed to generate token",
      error: error.message,
    });
  }
};

// End call
const endCall = async (req, res) => {
  try {
    const { callId } = req.params;
    let userId, astrologerId;

    if (req.user) {
      userId = req.user.id;
    } else if (req.astrologer) {
      astrologerId = req.astrologer.id;
    }

    const callSession = await CallSession.findOne({
      where: {
        id: callId,
        status: { [Op.in]: ["accepted", "ongoing"] },
      },
    });

    if (!callSession) {
      return res.status(404).json({
        success: false,
        message: "Active call not found",
      });
    }

    // Verify participant
    if (userId && callSession.userId !== userId) {
      return res.status(403).json({
        success: false,
        message: "Access denied",
      });
    }

    if (astrologerId && callSession.astrologerId !== astrologerId) {
      return res.status(403).json({
        success: false,
        message: "Access denied",
      });
    }

    // Calculate duration and cost
    const endTime = new Date();
    const startTime = new Date(callSession.startTime);
    const durationMs = endTime - startTime;
    const totalMinutes = Math.ceil(durationMs / (1000 * 60));
    const totalCost = totalMinutes * parseFloat(callSession.pricePerMinute);

    // Update call session
    await callSession.update({
      endTime,
      totalMinutes,
      totalCost,
      status: "completed",
    });

    // Deduct from wallet (only if user)
    if (userId) {
      const wallet = await Wallet.findOne({ where: { userId: callSession.userId } });

      if (!wallet || parseFloat(wallet.balance) < totalCost) {
        return res.status(400).json({
          success: false,
          message: "Insufficient balance to complete call",
          totalCost,
          currentBalance: wallet ? parseFloat(wallet.balance) : 0,
        });
      }

      await wallet.update({
        balance: parseFloat(wallet.balance) - totalCost,
      });

      await WalletTransaction.create({
        userId: callSession.userId,
        walletId: wallet.id,
        amount: totalCost,
        type: "debit",
        status: "completed",
        description: `${callSession.callType} call with astrologer - ${totalMinutes} minutes`,
      });
    }

    res.status(200).json({
      success: true,
      message: "Call ended successfully",
      callSession: {
        id: callSession.id,
        totalMinutes,
        totalCost,
        callType: callSession.callType,
        startTime: callSession.startTime,
        endTime: callSession.endTime,
      },
    });
  } catch (error) {
    console.error("End call error:", error);
    res.status(500).json({
      success: false,
      message: "Failed to end call",
      error: error.message,
    });
  }
};

// Get call history (User)
const getUserCallHistory = async (req, res) => {
  try {
    const userId = req.user.id;
    const { page = 1, limit = 20 } = req.query;
    const offset = (page - 1) * limit;

    const { rows: calls, count } = await CallSession.findAndCountAll({
      where: { userId },
      include: [
        {
          model: Astrologer,
          as: "astrologer",
          attributes: ["id", "fullName", "photo", "rating"],
        },
      ],
      order: [["createdAt", "DESC"]],
      limit: parseInt(limit),
      offset: parseInt(offset),
    });

    res.status(200).json({
      success: true,
      calls,
      pagination: {
        total: count,
        page: parseInt(page),
        limit: parseInt(limit),
        totalPages: Math.ceil(count / limit),
      },
    });
  } catch (error) {
    console.error("Get user call history error:", error);
    res.status(500).json({
      success: false,
      message: "Failed to fetch call history",
      error: error.message,
    });
  }
};

// Get call history (Astrologer)
const getAstrologerCallHistory = async (req, res) => {
  try {
    const astrologerId = req.astrologer.id;
    const { page = 1, limit = 20 } = req.query;
    const offset = (page - 1) * limit;

    const { rows: calls, count } = await CallSession.findAndCountAll({
      where: { astrologerId },
      include: [
        {
          model: User,
          as: "user",
          attributes: ["id", "fullName", "email"],
        },
      ],
      order: [["createdAt", "DESC"]],
      limit: parseInt(limit),
      offset: parseInt(offset),
    });

    res.status(200).json({
      success: true,
      calls,
      pagination: {
        total: count,
        page: parseInt(page),
        limit: parseInt(limit),
        totalPages: Math.ceil(count / limit),
      },
    });
  } catch (error) {
    console.error("Get astrologer call history error:", error);
    res.status(500).json({
      success: false,
      message: "Failed to fetch call history",
      error: error.message,
    });
  }
};

module.exports = {
  initiateCall,
  acceptCall,
  rejectCall,
  getCallToken,
  endCall,
  getUserCallHistory,
  getAstrologerCallHistory,
};
