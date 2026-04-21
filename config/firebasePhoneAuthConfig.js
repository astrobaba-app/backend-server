const admin = require("firebase-admin");
const fs = require("fs");
const path = require("path");

const phoneAuthServiceAccountPath =
  process.env.FIREBASE_PHONE_AUTH_SERVICE_ACCOUNT_PATH
    ? path.resolve(process.env.FIREBASE_PHONE_AUTH_SERVICE_ACCOUNT_PATH)
    : process.env.FIREBASE_SERVICE_ACCOUNT_PATH
      ? path.resolve(process.env.FIREBASE_SERVICE_ACCOUNT_PATH)
      : path.join(
          __dirname,
          "../graho-fdf06-firebase-adminsdk-fbsvc-a838319195.json"
        );

if (!fs.existsSync(phoneAuthServiceAccountPath)) {
  const error = new Error(
    `Firebase phone auth service account file not found at: ${phoneAuthServiceAccountPath}`
  );
  error.code = "firebase-phone-auth-config-missing";
  throw error;
}

const serviceAccount = require(phoneAuthServiceAccountPath);
const phoneAuthAppName = process.env.FIREBASE_PHONE_AUTH_APP_NAME || "phone-auth";

let phoneAuthApp;
try {
  phoneAuthApp = admin.app(phoneAuthAppName);
} catch (error) {
  phoneAuthApp = admin.initializeApp(
    {
      credential: admin.credential.cert(serviceAccount),
    },
    phoneAuthAppName
  );
  console.log(`✓ Firebase Phone Auth SDK initialized (${phoneAuthAppName})`);
  console.log(
    `✓ Phone Auth service account: ${path.basename(phoneAuthServiceAccountPath)}`
  );
}

module.exports = phoneAuthApp;
