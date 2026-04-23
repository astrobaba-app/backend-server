const phoneAuthApp = require("../config/firebasePhoneAuthConfig");

const shouldCheckRevoked =
  String(process.env.FIREBASE_PHONE_AUTH_CHECK_REVOKED || "false").toLowerCase() ===
  "true";
const firebasePhoneAuth = phoneAuthApp.auth();

const normalizeIndianMobile = (rawValue) => {
  const digits = String(rawValue || "").replace(/\D/g, "");
  if (!digits) return null;

  const candidates = [digits, digits.replace(/^0+/, ""), digits.slice(-10)];

  for (const candidate of candidates) {
    if (/^[6-9]\d{9}$/.test(candidate)) {
      return candidate;
    }
  }

  return null;
};

const mapTokenVerificationError = (rawError) => {
  const message = String(rawError?.message || "");

  if (
    message.includes('incorrect "aud"') ||
    message.includes("audience")
  ) {
    const mismatchMatch = message.match(/Expected "([^"]+)" but got "([^"]+)"/);
    const expectedProject = mismatchMatch?.[1] || "backend-project";
    const tokenProject = mismatchMatch?.[2] || "frontend-project";

    const error = new Error(
      `Firebase project mismatch: backend expects ${expectedProject} but token is from ${tokenProject}. Update backend service account to the same Firebase project as frontend.`
    );
    error.statusCode = 400;
    return error;
  }

  if (message.toLowerCase().includes("jwt expired")) {
    const error = new Error("Firebase ID token expired. Please request OTP again.");
    error.statusCode = 401;
    return error;
  }

  if (rawError?.code === "auth/id-token-revoked") {
    const error = new Error("Firebase ID token has been revoked. Please request OTP again.");
    error.statusCode = 401;
    return error;
  }

  const error = new Error("Failed to verify Firebase ID token");
  error.statusCode = 401;
  return error;
};

const verifyFirebasePhoneToken = async (firebaseIdToken, expectedPhoneNumber) => {
  if (!firebaseIdToken) {
    const error = new Error("Firebase ID token is required");
    error.statusCode = 400;
    throw error;
  }

  const normalizedExpected = expectedPhoneNumber
    ? normalizeIndianMobile(expectedPhoneNumber)
    : null;

  if (expectedPhoneNumber && !normalizedExpected) {
    const error = new Error("Invalid phone number format");
    error.statusCode = 400;
    throw error;
  }

  let decodedToken;
  try {
    decodedToken = await firebasePhoneAuth.verifyIdToken(
      firebaseIdToken,
      shouldCheckRevoked
    );
  } catch (error) {
    throw mapTokenVerificationError(error);
  }
  const firebasePhoneNumber = decodedToken.phone_number;

  if (!firebasePhoneNumber) {
    const error = new Error("Phone number is not present in Firebase token");
    error.statusCode = 400;
    throw error;
  }

  const verifiedMobile = normalizeIndianMobile(firebasePhoneNumber);
  if (!verifiedMobile) {
    const error = new Error("Invalid phone number received from Firebase");
    error.statusCode = 400;
    throw error;
  }

  if (normalizedExpected) {
    if (normalizedExpected !== verifiedMobile) {
      const error = new Error("Phone number mismatch");
      error.statusCode = 400;
      throw error;
    }
  }

  return {
    uid: decodedToken.uid,
    phoneNumber: firebasePhoneNumber,
    mobile: verifiedMobile,
    decodedToken,
  };
};

module.exports = {
  verifyFirebasePhoneToken,
  normalizeIndianMobile,
};
