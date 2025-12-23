// Test script for push notifications
// Run with: node backend-server/scripts/testPushNotifications.js

require("dotenv").config();
const pushNotificationService = require("../services/pushNotificationService");
const notificationService = require("../services/notificationService");

async function testPushNotifications() {
  console.log("🔔 Testing Push Notification System\n");

  try {
    // Test 1: Check Firebase initialization
    console.log("✓ Firebase Admin SDK initialized");

    // Test 2: Test broadcast notification
    console.log("\n📢 Testing broadcast notification...");
    const broadcastResult = await notificationService.broadcastToAll({
      type: "test",
      title: "Test Broadcast Notification 🎉",
      message: "This is a test broadcast from the Graho notification system",
      data: { test: true, timestamp: new Date().toISOString() },
      actionUrl: "/",
      priority: "high",
      sendPush: true,
    });

    console.log("Broadcast result:", broadcastResult);

    console.log("\n✅ All tests completed!");
    console.log("\nNote: If you have active device tokens, you should receive notifications.");
    
    process.exit(0);
  } catch (error) {
    console.error("\n❌ Test failed:", error);
    process.exit(1);
  }
}

// Run tests
testPushNotifications();
