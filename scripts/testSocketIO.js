/**
 * Quick test script to verify Socket.IO is working
 * Run: node scripts/testSocketIO.js
 */

require("dotenv").config();
const io = require("socket.io-client");

const SERVER_URL = process.env.BACKEND_URL || "http://localhost:6001";
const TEST_TOKEN = process.argv[2]; // Pass token as argument

if (!TEST_TOKEN) {
  console.error("Usage: node scripts/testSocketIO.js <YOUR_AUTH_TOKEN>");
  console.error("Example: node scripts/testSocketIO.js eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9...");
  process.exit(1);
}

console.log(`\n🔌 Testing Socket.IO connection to ${SERVER_URL}/live\n`);

const socket = io(`${SERVER_URL}/live`, {
  auth: {
    token: TEST_TOKEN,
  },
  transports: ["websocket", "polling"],
});

socket.on("connect", () => {
  console.log("✅ Connected to /live namespace");
  console.log(`   Socket ID: ${socket.id}`);
  console.log(`   Transport: ${socket.io.engine.transport.name}`);
  
  // Test joining a session (you need to provide a valid session ID)
  const TEST_SESSION_ID = process.argv[3];
  if (TEST_SESSION_ID) {
    console.log(`\n📍 Joining session: ${TEST_SESSION_ID}`);
    socket.emit("join_live_session", { sessionId: TEST_SESSION_ID });
  } else {
    console.log("\n💡 To test joining a session, pass session ID as 3rd argument");
    console.log("   Example: node scripts/testSocketIO.js TOKEN SESSION_ID");
  }
});

socket.on("connect_error", (error) => {
  console.error("❌ Connection error:", error.message);
  process.exit(1);
});

socket.on("disconnect", (reason) => {
  console.log(`\n🔌 Disconnected: ${reason}`);
  process.exit(0);
});

socket.on("error", (error) => {
  console.error("❌ Socket error:", error);
});

socket.on("live:joined", (data) => {
  console.log("✅ Successfully joined session:", data);
  
  // Test sending a message
  console.log("\n💬 Sending test message...");
  socket.emit("live_chat_message", {
    sessionId: data.sessionId,
    message: "Test message from Socket.IO test script",
    messageType: "text",
  }, (response) => {
    if (response.success) {
      console.log("✅ Message sent successfully:", response.message);
    } else {
      console.error("❌ Message failed:", response.error);
    }
  });
});

socket.on("live:chat_message", (message) => {
  console.log("\n📨 Received message:", {
    from: message.userName,
    role: message.senderRole,
    message: message.message,
  });
});

socket.on("live:participant_joined", (data) => {
  console.log("\n👥 Participant joined. Count:", data.participantCount);
});

socket.on("live:participant_left", (data) => {
  console.log("\n👋 Participant left. Count:", data.participantCount);
});

socket.on("live:ended", (data) => {
  console.log("\n🛑 Session ended:", data);
  socket.disconnect();
});

socket.on("live:session_ended", (data) => {
  console.log("\n🛑 Session ended (alt event):", data);
  socket.disconnect();
});

// Keep alive for 30 seconds then disconnect
setTimeout(() => {
  console.log("\n⏱️  Test complete. Disconnecting...");
  socket.disconnect();
}, 30000);

console.log("Waiting for connection... (will timeout in 30 seconds)");
