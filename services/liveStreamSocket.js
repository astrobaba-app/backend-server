const LiveSession = require("../model/live/liveSession");
const LiveParticipant = require("../model/live/liveParticipant");
const Astrologer = require("../model/astrologer/astrologer");
const User = require("../model/user/userAuth");
const { parse } = require("cookie");
const { validateToken } = require("./authService");
const { getLiveSessionRoom } = require("./chatSocket");

/**
 * Live Chat Message Model (stored in memory for simplicity)
 * You can create a database model if persistence is needed
 */
const LiveChatMessage = require("../model/live/liveChatMessage");

/**
 * Format live chat message for clients
 */
function mapLiveChatMessage(message) {
  return {
    id: message.id,
    liveSessionId: message.liveSessionId,
    userId: message.userId,
    userName: message.userName,
    userPhoto: message.userPhoto,
    message: message.message,
    messageType: message.messageType || "text",
    senderRole: message.senderRole,
    timestamp: message.timestamp || message.createdAt,
  };
}

/**
 * Initialize Live Stream Socket Events
 */
function initializeLiveStreamSocket(io) {
  // Live streaming namespace
  const liveNamespace = io.of("/live");

  // Authentication middleware for live namespace
  liveNamespace.use((socket, next) => {
    try {
      let token = socket.handshake.auth?.token;

      if (!token && socket.handshake.headers?.cookie) {
        const parsedCookies = parse(socket.handshake.headers.cookie);
        token = parsedCookies.token || parsedCookies.token_astrologer;
      }

      if (!token && socket.handshake.headers?.authorization) {
        const authHeader = socket.handshake.headers.authorization;
        if (typeof authHeader === "string" && authHeader.startsWith("Bearer ")) {
          token = authHeader.split(" ")[1];
        }
      }

      if (!token) {
        console.error("[Live Socket Auth] No token found. Headers:", {
          hasAuth: !!socket.handshake.auth,
          hasCookie: !!socket.handshake.headers?.cookie,
          hasAuthHeader: !!socket.handshake.headers?.authorization,
        });
        return next(new Error("Authentication token missing"));
      }

      const payload = validateToken(token);
      if (!payload) {
        console.error("[Live Socket Auth] Invalid token");
        return next(new Error("Invalid or expired token"));
      }

      socket.user = payload; // { id, role }
      console.log(`[Live Socket Auth] Success: ${payload.id}, Role: ${payload.role}`);
      next();
    } catch (error) {
      console.error("[Live Socket Auth] Exception:", error);
      next(new Error("Authentication failed"));
    }
  });

  liveNamespace.on("connection", (socket) => {
    const { id: authId, role } = socket.user;
    const isAstrologer = role === "astrologer";
    
    // Track which session this socket is in for cleanup on disconnect
    socket.currentLiveSession = null;

    console.log(`[Live Socket] Connected: ${authId}, Role: ${role}`);

    // Join live session room
    socket.on("join_live_session", async ({ sessionId }) => {
      try {
        if (!sessionId) return;

        const liveSession = await LiveSession.findByPk(sessionId);
        if (!liveSession) {
          socket.emit("error", { message: "Live session not found" });
          return;
        }

        // Verify permissions
        if (isAstrologer && liveSession.astrologerId !== authId) {
          socket.emit("error", { message: "Not authorized" });
          return;
        }

        // Join room
        const roomName = getLiveSessionRoom(sessionId);
        socket.join(roomName);
        
        // Track current session for disconnect cleanup
        socket.currentLiveSession = sessionId;

        // Get participant count
        const participantCount = await LiveParticipant.count({
          where: { liveSessionId: sessionId, isActive: true },
        });

        console.log(`[Live Socket] ${role} ${authId} joined session ${sessionId}`);

        // Send current participant count
        socket.emit("live:joined", {
          sessionId,
          participantCount,
          role: isAstrologer ? "host" : "audience",
        });

        // Notify others about new participant (only if user, not astrologer)
        if (!isAstrologer) {
          liveNamespace.to(roomName).emit("live:participant_joined", {
            sessionId,
            participantCount,
          });
        }
      } catch (error) {
        console.error("join_live_session error:", error);
        socket.emit("error", { message: "Failed to join live session" });
      }
    });

    // Leave live session room
    socket.on("leave_live_session", async ({ sessionId }) => {
      try {
        if (!sessionId) return;

        const roomName = getLiveSessionRoom(sessionId);
        socket.leave(roomName);
        
        // Clear session tracking
        if (socket.currentLiveSession === sessionId) {
          socket.currentLiveSession = null;
        }

        // Get updated participant count
        const participantCount = await LiveParticipant.count({
          where: { liveSessionId: sessionId, isActive: true },
        });

        console.log(`[Live Socket] ${role} ${authId} left session ${sessionId}`);

        // Notify others about participant leaving
        liveNamespace.to(roomName).emit("live:participant_left", {
          sessionId,
          participantCount,
        });
      } catch (error) {
        console.error("leave_live_session error:", error);
      }
    });

    // Send live chat message
    socket.on("live_chat_message", async ({ sessionId, message, messageType }, callback) => {
      try {
        console.log(`[Live Chat] Message from ${role} ${authId} in session ${sessionId}`);
        
        if (!sessionId || !message) {
          console.error("[Live Chat] Missing data:", { sessionId: !!sessionId, message: !!message });
          if (callback) callback({ success: false, error: "Missing data" });
          return;
        }

        const liveSession = await LiveSession.findByPk(sessionId);
        if (!liveSession || liveSession.status !== "live") {
          console.error("[Live Chat] Session not active:", { found: !!liveSession, status: liveSession?.status });
          if (callback) callback({ success: false, error: "Live session not active" });
          return;
        }

        // Validate messageType
        const validMessageTypes = ["text", "emoji"];
        const finalMessageType = validMessageTypes.includes(messageType) ? messageType : "text";

        // Get user details
        let userName, userPhoto;
        if (isAstrologer) {
          if (liveSession.astrologerId !== authId) {
            if (callback) callback({ success: false, error: "Not authorized" });
            return;
          }
          const astrologer = await Astrologer.findByPk(authId, {
            attributes: ["fullName", "photo"],
          });
          userName = astrologer?.fullName || "Astrologer";
          userPhoto = astrologer?.photo || null;
        } else {
          // Verify user is a participant
          const participant = await LiveParticipant.findOne({
            where: { liveSessionId: sessionId, userId: authId, isActive: true },
          });
          if (!participant) {
            if (callback) callback({ success: false, error: "Not a participant" });
            return;
          }

          const user = await User.findByPk(authId, {
            attributes: ["fullName"],
          });
          userName = user?.fullName || "User";
          userPhoto = null; // User model doesn't have photo column
        }

        // Create message
        const chatMessage = await LiveChatMessage.create({
          liveSessionId: sessionId,
          userId: authId,
          userName,
          userPhoto,
          message,
          messageType: finalMessageType,
          senderRole: isAstrologer ? "astrologer" : "user",
        });

        const messagePayload = mapLiveChatMessage(chatMessage);

        // Broadcast to all participants in the room
        const roomName = getLiveSessionRoom(sessionId);
        liveNamespace.to(roomName).emit("live:chat_message", messagePayload);

        console.log(`[Live Chat] Message sent successfully to room ${roomName}`);

        if (callback) callback({ success: true, message: messagePayload });
      } catch (error) {
        console.error("[Live Chat] Error sending message:", error);
        if (callback) callback({ success: false, error: "Failed to send message" });
      }
    });

    // Send emoji in live chat
    socket.on("live_chat_emoji", async ({ sessionId, emoji }, callback) => {
      try {
        if (!sessionId || !emoji) {
          if (callback) callback({ success: false, error: "Missing emoji data" });
          return;
        }

        const liveSession = await LiveSession.findByPk(sessionId);
        if (!liveSession || liveSession.status !== "live") {
          if (callback) callback({ success: false, error: "Live session not active" });
          return;
        }

        // Get user details
        let userName, userPhoto, senderRole;
        if (isAstrologer) {
          if (liveSession.astrologerId !== authId) {
            if (callback) callback({ success: false, error: "Not authorized" });
            return;
          }
          const astrologer = await Astrologer.findByPk(authId, {
            attributes: ["fullName", "photo"],
          });
          userName = astrologer?.fullName || "Astrologer";
          userPhoto = astrologer?.photo || null;
          senderRole = "astrologer";
        } else {
          // Verify user is a participant
          const participant = await LiveParticipant.findOne({
            where: { liveSessionId: sessionId, userId: authId, isActive: true },
          });
          if (!participant) {
            if (callback) callback({ success: false, error: "Not a participant" });
            return;
          }

          const user = await User.findByPk(authId, {
            attributes: ["fullName"],
          });
          userName = user?.fullName || "User";
          userPhoto = null;
          senderRole = "user";
        }

        // Create emoji message
        const emojiMessage = await LiveChatMessage.create({
          liveSessionId: sessionId,
          userId: authId,
          userName,
          userPhoto,
          message: emoji,
          messageType: "emoji",
          senderRole: isAstrologer ? "astrologer" : "user",
        });

        const messagePayload = {
          ...mapLiveChatMessage(emojiMessage),
          senderRole,
        };

        // Broadcast emoji to all participants in the room
        const roomName = getLiveSessionRoom(sessionId);
        liveNamespace.to(roomName).emit("live:chat_emoji", messagePayload);

        if (callback) callback({ success: true, message: messagePayload });
      } catch (error) {
        console.error("live_chat_emoji error:", error);
        if (callback) callback({ success: false, error: "Failed to send emoji" });
      }
    });

    // Host controls - update session status
    socket.on("update_live_status", async ({ sessionId, status }) => {
      try {
        if (!isAstrologer) {
          socket.emit("error", { message: "Only host can update status" });
          return;
        }

        const liveSession = await LiveSession.findOne({
          where: { id: sessionId, astrologerId: authId },
        });

        if (!liveSession) {
          socket.emit("error", { message: "Live session not found" });
          return;
        }

        if (status === "ended") {
          await liveSession.update({
            status: "ended",
            endedAt: new Date(),
            currentViewers: 0,
          });

          // Notify all participants
          const roomName = getLiveSessionRoom(sessionId);
          liveNamespace.to(roomName).emit("live:ended", { sessionId });
        }
      } catch (error) {
        console.error("update_live_status error:", error);
        socket.emit("error", { message: "Failed to update status" });
      }
    });

    // Participant count updates
    socket.on("request_participant_count", async ({ sessionId }) => {
      try {
        const participantCount = await LiveParticipant.count({
          where: { liveSessionId: sessionId, isActive: true },
        });

        socket.emit("live:participant_count", {
          sessionId,
          participantCount,
        });
      } catch (error) {
        console.error("request_participant_count error:", error);
      }
    });

    // Handle disconnect - clean up participant status
    socket.on("disconnect", async () => {
      console.log(`[Live Socket] Disconnected: ${authId}, Role: ${role}`);
      
      try {
        // If user (not astrologer) was in a session, mark as inactive
        if (!isAstrologer && socket.currentLiveSession) {
          const sessionId = socket.currentLiveSession;
          
          // Find and update participant
          const participant = await LiveParticipant.findOne({
            where: {
              liveSessionId: sessionId,
              userId: authId,
              isActive: true,
            },
          });
          
          if (participant) {
            // Mark as inactive (don't charge - that happens on explicit leave)
            await participant.update({ isActive: false });
            
            // Update current viewers count in session
            const currentViewers = await LiveParticipant.count({
              where: { liveSessionId: sessionId, isActive: true },
            });
            
            await LiveSession.update(
              { currentViewers },
              { where: { id: sessionId } }
            );
            
            // Notify room about updated count
            const roomName = getLiveSessionRoom(sessionId);
            liveNamespace.to(roomName).emit("live:participant_left", {
              sessionId,
              participantCount: currentViewers,
            });
            
            console.log(`[Live Socket] Cleaned up participant ${authId} from session ${sessionId}. Current viewers: ${currentViewers}`);
          }
        }
      } catch (error) {
        console.error(`[Live Socket] Error cleaning up on disconnect:`, error);
      }
    });
  });

  return liveNamespace;
}

/**
 * Periodic cleanup function to sync viewer counts
 * Call this periodically to ensure accurate counts even if disconnect events fail
 */
async function syncLiveViewerCounts() {
  try {
    const activeSessions = await LiveSession.findAll({
      where: { status: "live" },
    });

    for (const session of activeSessions) {
      const currentViewers = await LiveParticipant.count({
        where: { liveSessionId: session.id, isActive: true },
      });

      if (session.currentViewers !== currentViewers) {
        await session.update({ currentViewers });
        console.log(`[Live Sync] Updated session ${session.id} viewer count: ${session.currentViewers} -> ${currentViewers}`);
      }
    }
  } catch (error) {
    console.error("[Live Sync] Error syncing viewer counts:", error);
  }
}

module.exports = {
  initializeLiveStreamSocket,
  syncLiveViewerCounts,
};
