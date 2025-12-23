require("dotenv").config();
const express = require("express");
const cors = require("cors");
const cookieParser = require("cookie-parser");
const initDB = require("./dbConnection/dbSync");
const http = require("http");
const { WebSocketServer } = require("ws");
const { Server } = require("socket.io");
const { initializeChatSocket } = require("./services/chatSocket");
const { initializeLiveStreamSocket } = require("./services/liveStreamSocket");

const PORT = process.env.PORT || 6001;
const app = express();
const server = http.createServer(app);

// Determine allowed origins for CORS (Socket.IO + Express)
let allowedOrigins = [
  process.env.FRONTEND_URL, 
  process.env.FRONTEND_URL1,
  process.env.MOBILE_APP_ORIGIN // Add mobile app origin if configured
].filter(Boolean);

// In development, if no explicit frontend URLs are configured, default to localhost:3000
if (allowedOrigins.length === 0 && process.env.NODE_ENV !== "production") {
  allowedOrigins = ["http://localhost:3000"];
}

// Log allowed origins for debugging (especially useful in production)
console.log('[CORS] Allowed origins:', allowedOrigins);
console.log('[CORS] Environment:', process.env.NODE_ENV || 'development');

// Socket.IO server for real-time features (chat, notifications, etc.)
const io = new Server(server, {
  cors: {
    origin: (origin, callback) => {
      // Allow requests with no origin (mobile apps, same-origin requests)
      if (!origin) {
        callback(null, true);
        return;
      }
      
      // Allow configured origins
      if (allowedOrigins.includes(origin)) {
        callback(null, true);
        return;
      }
      
      // In production, log rejected origins for debugging
      if (process.env.NODE_ENV === "production") {
        console.warn(`[Socket.IO CORS] Rejected origin: ${origin}`);
      }
      
      // Reject silently (don't throw error which breaks connection)
      callback(null, false);
    },
    methods: ["GET", "POST"],
    credentials: true,
  },
});

// Make Socket.IO instance available in controllers via req.app.get('io')
app.set("io", io);
app.use(
  cors({
    origin: function (origin, callback) {
      // Allow requests with no origin (like mobile apps, Postman, or same-origin)
      if (!origin || allowedOrigins.includes(origin)) {
        callback(null, true);
      } else {
        callback(new Error("Not allowed by CORS: " + origin));
      }
    },
    credentials: true,
    methods: ["GET", "POST", "PUT", "DELETE", "PATCH"],
    allowedHeaders: ["Content-Type", "Authorization"],
  })
);

app.use(express.json());
app.use(cookieParser());
app.use(express.urlencoded({ extended: false }));

// Trust proxy to get real client IP (for production with load balancers/proxies)
app.set('trust proxy', true);


// Routes
const phoneAuthRoute = require("./routes/authRoute/phoneAuthRoute");
const userProfileRoute = require("./routes/profileRoute/userProfileRoute");
const kundliRoute = require("./routes/horoscope/kundliRoute");
const dailyHoroscopeRoute = require("./routes/horoscope/dailyHoroscopeRoute");
const kundliMatchRoute = require("./routes/horoscope/matchingRoute");
const walletRoute = require("./routes/wallet/walletRoute");
const astrologerAuthRoute = require("./routes/astrologer/astrologerAuthRoute");
const astrologerRoute = require("./routes/astrologer/astrologerRoute");
const adminRoute = require("./routes/admin/adminRoute");
const blogRoute = require("./routes/blog/blogRoute");
const reviewRoute = require("./routes/review/reviewRoute");
const chatRoute = require("./routes/chat/chatRoute");
const liveRoute = require("./routes/live/liveRoute");
const callRoute = require("./routes/call/callRoute");
const notificationRoute = require("./routes/notification/notificationRoute");
const couponRoute = require("./routes/coupon/couponRoute");
const followRoute = require("./routes/follow/followRoute");
const assistantRoute = require("./routes/assistant/assistantRoute");
const supportRoute = require("./routes/support/supportRoute");
const storeRoute = require("./routes/store/storeRoute");
const addressRoute = require("./routes/store/addressRoute");
const googleAuthRoute = require("./routes/authRoute/googleAuthRoute");
const aiChatRoute = require("./routes/aiChat/aiChatRoute");
const mapsRoute = require("./routes/maps/mapsRoute");

app.use("/api/auth", phoneAuthRoute,googleAuthRoute);
app.use("/api/user", userProfileRoute);
app.use("/api/kundli", kundliRoute);
app.use("/api/horoscope", dailyHoroscopeRoute);
app.use("/api/kundli-matching", kundliMatchRoute);
app.use("/api/wallet", walletRoute);
app.use("/api/astrologer/auth", astrologerAuthRoute);
app.use("/api/astrologers", astrologerRoute);
app.use("/api/admin", adminRoute);
app.use("/api/blogs", blogRoute);
app.use("/api/reviews", reviewRoute);
app.use("/api/chat", chatRoute);
app.use("/api/live", liveRoute);
app.use("/api/call", callRoute);
app.use("/api/notifications", notificationRoute);
app.use("/api/coupons", couponRoute);
app.use("/api/follow", followRoute);
app.use("/api/assistant", assistantRoute);
app.use("/api/support", supportRoute);
app.use("/api/store", storeRoute);
app.use("/api/addresses", addressRoute);
app.use("/api/ai-chat", aiChatRoute);
app.use("/api/maps", mapsRoute);

// WebSocket server for AI voice calls (separate from Socket.IO)
const wss = new WebSocketServer({ server, path: '/api/ai-voice-ws' });
const { handleVoiceWebSocket } = require("./controller/aiChat/aiVoiceProxyController");
const { validateToken } = require("./services/authService");
const { parse } = require("cookie");

wss.on('connection', async (ws, req) => {
  console.log('WebSocket connection attempt');
  
  try {
    // Parse and authenticate token from cookies or headers
    let token;
    
    if (req.headers.cookie) {
      const parsedCookies = parse(req.headers.cookie);
      token = parsedCookies.token;
    }
    
    if (!token && req.headers.authorization) {
      const authHeader = req.headers.authorization;
      if (authHeader.startsWith("Bearer ")) {
        token = authHeader.split(" ")[1];
      }
    }
    
    if (!token) {
      console.error('No token found in WebSocket request');
      ws.send(JSON.stringify({ 
        type: 'auth_error', 
        error: { message: 'No token found. Please login.' } 
      }));
      ws.close();
      return;
    }
    
    const userPayload = validateToken(token);
    if (!userPayload) {
      console.error('Invalid or expired token');
      ws.send(JSON.stringify({ 
        type: 'auth_error', 
        error: { message: 'Invalid or expired token.' } 
      }));
      ws.close();
      return;
    }
    
    // Attach user to request
    req.user = userPayload;
    console.log('User authenticated:', userPayload.id);
    
    // Handle the voice WebSocket connection
    handleVoiceWebSocket(ws, req);
    
  } catch (error) {
    console.error('WebSocket authentication error:', error);
    ws.send(JSON.stringify({ 
      type: 'auth_error', 
      error: { message: 'Authentication failed.' } 
    }));
    ws.close();
  }
});

// Initialize database and start HTTP + WebSocket/Socket.IO servers
initDB(() => {
  // Attach chat-specific Socket.IO handlers
  initializeChatSocket(io);
  
  // Attach live streaming Socket.IO handlers
  initializeLiveStreamSocket(io);

  server.listen(PORT, () => {
    console.log(`Server is running on port ${PORT}`);
    console.log(`WebSocket server ready at ws://localhost:${PORT}/api/ai-voice-ws`);
    console.log(`Socket.IO server ready at http://localhost:${PORT}`);

    // Initialize horoscope scheduler with cron jobs
    const { initializeScheduler } = require("./services/horoscopeScheduler");
    initializeScheduler();
    console.log("Horoscope scheduler initialized");
  });
});
