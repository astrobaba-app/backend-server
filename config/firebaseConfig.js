const admin = require("firebase-admin");
const path = require("path");
const fs = require("fs");

// Initialize Firebase Admin SDK
// Load service account path from environment variable or use default
const serviceAccountPath = process.env.FIREBASE_SERVICE_ACCOUNT_PATH 
  ? path.resolve(process.env.FIREBASE_SERVICE_ACCOUNT_PATH)
  : path.join(__dirname, "../graho-fdf06-firebase-adminsdk-fbsvc-a838319195.json");

// Check if file exists
if (!fs.existsSync(serviceAccountPath)) {
  console.error(`❌ Firebase service account file not found at: ${serviceAccountPath}`);
  console.error("Set FIREBASE_SERVICE_ACCOUNT_PATH environment variable or ensure the file exists");
  process.exit(1);
}

const serviceAccount = require(serviceAccountPath);

if (!admin.apps.length) {
  admin.initializeApp({
    credential: admin.credential.cert(serviceAccount),
  });
  console.log("✓ Firebase Admin SDK initialized");
  console.log(`✓ Using service account: ${path.basename(serviceAccountPath)}`);
}

module.exports = admin;
