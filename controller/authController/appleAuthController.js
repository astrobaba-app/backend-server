require("dotenv").config();
const axios = require("axios");
const appleSignin = require("apple-signin-auth");
const qs = require("querystring");

const User = require("../../model/user/userAuth");
const AppleAuth = require("../../model/user/appleAuth");
const {
  createToken,
  createMiddlewareToken,
  createRefreshToken,
} = require("../../services/authService");
const setTokenCookie = require("../../services/setTokenCookie");
const { applySignupBonus } = require("../../services/signupBonusService");
const { trackUserLogin } = require("../../services/userLoginTrackingService");
const {
  handleNewUserOnboarding,
} = require("../../services/newUserOnboardingService");

const normalizeSource = (value) => {
  if (Array.isArray(value)) {
    return value.some((item) => String(item).toLowerCase() === "app") ? "app" : "web";
  }

  if (typeof value === "string") {
    return value.toLowerCase() === "app" ? "app" : "web";
  }

  return "web";
};

const encodeOAuthState = (payload) => {
  try {
    return Buffer.from(JSON.stringify(payload), "utf-8").toString("base64url");
  } catch {
    return "";
  }
};

const decodeOAuthState = (stateValue) => {
  if (!stateValue) {
    return null;
  }

  const rawState = String(stateValue).trim();
  const decodeAttempts = [
    () => Buffer.from(rawState, "base64url").toString("utf-8"),
    () => Buffer.from(rawState.replace(/ /g, "+"), "base64").toString("utf-8"),
  ];

  for (const attempt of decodeAttempts) {
    try {
      const decoded = attempt();
      const parsed = JSON.parse(decoded);
      if (parsed && typeof parsed === "object") {
        return parsed;
      }
    } catch {
      // Try next decoder format.
    }
  }

  return null;
};

const APPLE_TEAM_ID = process.env.APPLE_TEAM_ID;
const APPLE_CLIENT_ID = process.env.APPLE_CLIENT_ID;   // Services ID (e.g. com.graho.web)
const APPLE_KEY_ID = process.env.APPLE_KEY_ID;
const APPLE_PRIVATE_KEY = process.env.APPLE_PRIVATE_KEY; // Content of .p8 key (newlines as \n)
const APPLE_REDIRECT_URI = process.env.APPLE_REDIRECT_URI;
const FRONTEND_URL = process.env.FRONTEND_URL;

// ─── Helpers ─────────────────────────────────────────────────────────────────

/**
 * Build a short-lived Apple client secret (JWT signed with ES256 private key).
 * Apple requires this instead of a plain client secret.
 */
function buildAppleClientSecret() {
  return appleSignin.getClientSecret({
    clientID: APPLE_CLIENT_ID,
    teamID: APPLE_TEAM_ID,
    privateKey: APPLE_PRIVATE_KEY.replace(/\\n/g, "\n"), // handle env newlines
    keyIdentifier: APPLE_KEY_ID,
    expAfter: 15777000, // ~6 months in seconds
  });
}

// ─── Controllers ─────────────────────────────────────────────────────────────

/**
 * GET /api/auth/apple
 * Redirect the browser to Apple's Sign In page.
 */
const redirectToApple = (req, res) => {
  if (!APPLE_CLIENT_ID || !APPLE_REDIRECT_URI || !APPLE_TEAM_ID || !APPLE_KEY_ID || !APPLE_PRIVATE_KEY) {
    console.error("Missing Apple Sign In credentials – check .env");
    return res.status(500).json({ message: "Apple Sign In not configured properly" });
  }

  const source = normalizeSource(req.query.source);
  const state = encodeOAuthState({ source });

  const params = new URLSearchParams({
    client_id: APPLE_CLIENT_ID,
    redirect_uri: APPLE_REDIRECT_URI,
    response_type: "code id_token",
    scope: "name email",
    response_mode: "form_post", // Apple POSTs back with user info
    state,
  });

  const appleAuthURL = `https://appleid.apple.com/auth/authorize?${params.toString()}`;

  console.log("Redirecting to Apple Sign In:", {
    clientId: APPLE_CLIENT_ID,
    redirectUri: APPLE_REDIRECT_URI,
    source,
  });

  res.redirect(appleAuthURL);
};

/**
 * POST /api/auth/apple/callback
 * Apple posts here after the user authenticates.
 * Body fields: code, id_token, state, user (JSON string – first login only)
 */
const appleCallback = async (req, res) => {
  const { code, id_token, state, user: userJSON } = req.body;

  if (!code || !id_token) {
    return res.status(400).json({ message: "Authorization code or id_token missing" });
  }

  // Decode state to recover source
  let source = "web";
  try {
    if (state) {
      const decoded = decodeOAuthState(state);
      source = normalizeSource(decoded?.source);
    }
  } catch (err) {
    console.error("Error decoding Apple state:", err);
  }

  try {
    // ── 1. Verify the id_token from Apple ────────────────────────────────────
    const applePayload = await appleSignin.verifyIdToken(id_token, {
      audience: APPLE_CLIENT_ID,
      ignoreExpiration: false,
    });

    const { sub: appleId, email: tokenEmail } = applePayload;

    if (!appleId) {
      return res.status(400).json({ message: "Apple ID missing from token" });
    }

    // ── 2. Parse user info (only present on FIRST login) ────────────────────
    let name = null;
    let email = tokenEmail || null;

    if (userJSON) {
      try {
        const parsedUser = typeof userJSON === "string" ? JSON.parse(userJSON) : userJSON;
        const { firstName = "", lastName = "" } = parsedUser.name || {};
        name = [firstName, lastName].filter(Boolean).join(" ") || null;
        email = parsedUser.email || email;
      } catch (err) {
        console.error("Error parsing Apple user JSON:", err);
      }
    }

    console.log("Apple Sign In payload:", { appleId, email, name, source });

    // ── 3. Find or create user ───────────────────────────────────────────────
    let appleAuth = await AppleAuth.findOne({
      where: { appleId },
      include: [{ model: User, as: "user" }],
    });

    let user;
    let isNewUser = false;

    if (appleAuth) {
      // Existing Apple user – login
      user = appleAuth.user;

      // Update email/name if we received them and they changed
      const updates = {};
      if (email && user.email !== email) updates.email = email;
      if (name && user.fullName !== name) updates.fullName = name;
      if (Object.keys(updates).length) await user.update(updates);
    } else {
      // No Apple auth record yet – check if email already exists
      if (email) {
        user = await User.findOne({ where: { email } });
      }

      if (user) {
        // Link Apple to existing account
        appleAuth = await AppleAuth.create({ userId: user.id, appleId });
      } else {
        // Completely new user
        user = await User.create({
          fullName: name || "Apple User",
          email: email || null,
          isUserRequested: false,
        });

        appleAuth = await AppleAuth.create({ userId: user.id, appleId });
        isNewUser = true;
      }
    }

    // ── 4. Issue tokens & set cookie ─────────────────────────────────────────
    const token = createToken(user);
    const middlewareToken = createMiddlewareToken(user);
    const refreshToken = createRefreshToken(user);
    setTokenCookie(res, token, middlewareToken, refreshToken);

    await trackUserLogin(user.id, "email", {
      invalidateTotalUsers: isNewUser,
    });

    // ── 5. Signup bonus for new users ────────────────────────────────────────
    if (isNewUser) {
      try {
        await applySignupBonus(user.id, "apple");
      } catch (err) {
        console.error("Failed to apply signup bonus:", err);
      }

      try {
        await handleNewUserOnboarding({
          mobile: user.mobile,
          email: user.email,
        });
      } catch (error) {
        console.error("Failed during new user onboarding notifications:", error);
      }
    }

    // ── 6. Redirect ──────────────────────────────────────────────────────────
    if (source === "app") {
      return res.redirect(
        `graho://auth/callback?token=${encodeURIComponent(token)}&middlewareToken=${encodeURIComponent(
          middlewareToken
        )}&refreshToken=${encodeURIComponent(refreshToken)}`
      );
    }

    return res.redirect(`${FRONTEND_URL}/login-success`);
  } catch (error) {
    console.error("Apple Sign In Error:", {
      message: error.message,
      response: error.response?.data,
    });

    if (error.message && error.message.includes("expired")) {
      return res.status(401).json({ message: "Apple id_token expired" });
    }

    return res.status(500).json({ message: "Internal Server Error", error: error.message });
  }
};

module.exports = { redirectToApple, appleCallback };
