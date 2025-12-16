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
    console.log("=== INITIATE CALL REQUEST ===");
    console.log("User ID:", req.user?.id);
    console.log("Request body:", req.body);
    console.log("Agora App ID:", process.env.AGORA_APP_ID ? "Present" : "Missing");
    
    const userId = req.user.id;
    const { astrologerId, callType = "video" } = req.body;

    if (!astrologerId) {
      console.log("ERROR: Astrologer ID is missing");
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
      console.log("Active call found:", activeCall.toJSON());
      // Check if the call is stale (older than 2 minutes with no answer)
      const callAge = Date.now() - new Date(activeCall.createdAt).getTime();
      const twoMinutes = 2 * 60 * 1000;
      console.log(`Call age: ${callAge}ms (${Math.floor(callAge / 1000)}s), Threshold: ${twoMinutes}ms, Status: ${activeCall.status}`);
      
      if (callAge > twoMinutes && (activeCall.status === "initiated" || activeCall.status === "ringing")) {
        console.log("Stale call detected, cancelling it");
        await activeCall.update({ status: "cancelled" });
      } else {
        console.log("Returning 400 - You already have an active call");
        return res.status(400).json({
          success: false,
          message: "You already have an active call",
        });
      }
    }

    // Check wallet balance (DISABLED FOR NOW)
    // const wallet = await Wallet.findOne({ where: { userId } });
    // if (!wallet || parseFloat(wallet.balance) < parseFloat(astrologer.pricePerMinute)) {
    //   return res.status(400).json({
    //     success: false,
    //     message: "Insufficient wallet balance",
    //     requiredAmount: parseFloat(astrologer.pricePerMinute),
    //     currentBalance: wallet ? parseFloat(wallet.balance) : 0,
    //   });
    // }

    // Generate Agora channel name (must be under 64 bytes)
    // Use short hashes of IDs instead of full UUIDs
    const userHash = userId.substring(0, 8);
    const astrologerHash = astrologerId.substring(0, 8);
    const channelName = agoraService.generateChannelName(`call_${userHash}_${astrologerHash}`);

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

    // Notify astrologer (database notification) - non-blocking
    try {
      await notificationService.notifyIncomingCall(astrologerId, callSession, user);
    } catch (notifError) {
      // Log but don't fail the call if notification fails
      console.error("Failed to create database notification (non-critical):", notifError.message);
    }

    // Emit Socket.IO event for real-time notification (this is the important one)
    const io = req.app.get("io");
    if (io) {
      console.log("Emitting call:incoming to astrologer:", astrologerId);
      console.log("Room name:", `astrologer:${astrologerId}`);
      io.to(`astrologer:${astrologerId}`).emit("call:incoming", {
        callSession: {
          ...callSession.toJSON(),
          user: {
            id: user.id,
            fullName: user.fullName,
            email: user.email,
          },
        },
      });
      console.log("Socket.IO event emitted successfully");
    } else {
      console.log("ERROR: Socket.IO instance not found!");
    }

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
    const astrologerId = req.user.id;
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

    // Emit Socket.IO event to notify user
    const io = req.app.get("io");
    if (io) {
      io.to(`user:${callSession.userId}`).emit("call:accepted", {
        callSession: callSession.toJSON(),
      });
    }

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
    const astrologerId = req.user.id;
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

    // Emit Socket.IO event to notify user
    const io = req.app.get("io");
    if (io) {
      io.to(`user:${callSession.userId}`).emit("call:rejected", {
        callSession: callSession.toJSON(),
        reason: reason || "Astrologer is busy",
      });
    }

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
    const authUserId = req.user.id;

    const callSession = await CallSession.findOne({
      where: {
        id: callId,
        status: { [Op.in]: ["accepted", "ongoing", "ringing"] },
      },
    });

    if (!callSession) {
      return res.status(404).json({
        success: false,
        message: "Call not found or not active",
      });
    }

    // Determine if the authenticated user is the user or astrologer in this call
    const isUser = callSession.userId === authUserId;
    const isAstrologer = callSession.astrologerId === authUserId;
    const userType = isUser ? "user" : "astrologer";

    // Verify participant
    if (!isUser && !isAstrologer) {
      return res.status(403).json({
        success: false,
        message: "Access denied",
      });
    }

    // Generate token
    const uid = agoraService.generateUid();
    const tokenData = agoraService.generateCallToken(callSession.agoraChannelName, uid);

    // Update UID in database
    if (isUser) {
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
    console.log("=== END CALL REQUEST ===");
    const { callId } = req.params;
    console.log("Call ID:", callId);
    console.log("Auth User ID:", req.user?.id);
    
    const authUserId = req.user.id;

    const callSession = await CallSession.findOne({
      where: {
        id: callId,
        status: { [Op.in]: ["accepted", "ongoing", "completed"] },
      },
    });

    console.log("Call Session Found:", callSession ? "Yes" : "No");
    
    if (!callSession) {
      console.log("Call not found");
      return res.status(404).json({
        success: false,
        message: "Call not found",
      });
    }

    // If already completed, just return success (idempotent)
    if (callSession.status === "completed") {
      console.log("Call already completed, returning success");
      return res.status(200).json({
        success: true,
        message: "Call already ended",
        callSession: {
          id: callSession.id,
          totalMinutes: callSession.totalMinutes,
          totalCost: callSession.totalCost,
          callType: callSession.callType,
          startTime: callSession.startTime,
          endTime: callSession.endTime,
        },
      });
    }

    // Determine if the authenticated user is the user or astrologer in this call
    const isUser = callSession.userId === authUserId;
    const isAstrologer = callSession.astrologerId === authUserId;
    
    console.log("Is User:", isUser);
    console.log("Is Astrologer:", isAstrologer);

    // Verify participant
    if (!isUser && !isAstrologer) {
      console.log("Access denied - not a participant");
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

    // Billing is disabled for now per initial requirement
    // to allow calls without enforcing wallet balance.

    // Emit Socket.IO event to notify the other participant
    const io = req.app.get("io");
    if (io) {
      // Notify the other participant (user or astrologer)
      const otherParticipantRoom = isUser 
        ? `astrologer:${callSession.astrologerId}` 
        : `user:${callSession.userId}`;
      
      io.to(otherParticipantRoom).emit("call:ended", {
        callSession: callSession.toJSON(),
        endedBy: isUser ? "user" : "astrologer",
      });
      
      console.log(`[Call End] Emitted call:ended to ${otherParticipantRoom}`);
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
