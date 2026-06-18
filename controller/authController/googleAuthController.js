require("dotenv").config();
const axios = require("axios");
const jwt = require("jsonwebtoken");

const GOOGLE_CLIENT_ID = process.env.GOOGLE_CLIENT_ID;
const GOOGLE_CLIENT_SECRET = process.env.GOOGLE_CLIENT_SECRET;
const GOOGLE_REDIRECT_URI = process.env.GOOGLE_REDIRECT_URI;
const FRONTEND_URL = process.env.FRONTEND_URL;
const JWT_SECRET = process.env.JWT_SECRET;
const qs = require("querystring");
const User = require("../../model/user/userAuth");
const GoogleAuth = require("../../model/user/googleAuth");
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

const getAllowedGoogleClientIds = () =>
  [
    process.env.GOOGLE_CLIENT_ID,
    process.env.GOOGLE_WEB_CLIENT_ID,
    process.env.GOOGLE_ANDROID_CLIENT_ID,
    process.env.GOOGLE_IOS_CLIENT_ID,
  ].filter(Boolean);

const buildUserPayload = (user) => ({
  id: user.id,
  fullName: user.fullName,
  email: user.email,
  mobile: user.mobile,
  gender: user.gender,
  dateOfbirth: user.dateOfbirth,
  timeOfbirth: user.timeOfbirth,
  placeOfBirth: user.placeOfBirth,
  latitude: user.latitude,
  longitude: user.longitude,
  isOnboarded: user.isOnboarded,
});

const findOrCreateGoogleUser = async ({ googleId, name, email }) => {
  let googleAuth = await GoogleAuth.findOne({
    where: { googleId },
    include: [{ model: User, as: "user" }],
  });

  let user;
  let isNewUser = false;

  if (googleAuth) {
    user = googleAuth.user;

    const updates = {};
    if (!user.fullName && name) {
      updates.fullName = name;
    }
    if (!user.email && email) {
      updates.email = email;
    }

    if (Object.keys(updates).length) {
      await user.update(updates);
    }
  } else {
    user = email ? await User.findOne({ where: { email } }) : null;

    if (user) {
      googleAuth = await GoogleAuth.create({
        userId: user.id,
        googleId,
      });

      if (!user.fullName && name) {
        await user.update({ fullName: name });
      }
    } else {
      user = await User.create({
        fullName: name,
        email,
        isUserRequested: false,
      });

      googleAuth = await GoogleAuth.create({
        userId: user.id,
        googleId,
      });

      isNewUser = true;
    }
  }

  return { user, isNewUser };
};

const completeGoogleLogin = async (res, user, isNewUser) => {
  const token = createToken(user);
  const middlewareToken = createMiddlewareToken(user);
  const refreshToken = createRefreshToken(user);

  setTokenCookie(res, token, middlewareToken, refreshToken);

  await trackUserLogin(user.id, "google", {
    invalidateTotalUsers: isNewUser,
  });

  let bonusInfo = null;
  if (isNewUser) {
    try {
      const bonusResult = await applySignupBonus(user.id, "google");
      if (bonusResult.bonusApplied) {
        bonusInfo = {
          amount: bonusResult.amount,
          message: bonusResult.message,
        };
      }
    } catch (error) {
      console.error("Failed to apply signup bonus:", error);
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

  return {
    token,
    middlewareToken,
    refreshToken,
    bonusInfo,
    profileIncomplete: !user.isOnboarded,
  };
};

const verifyGoogleIdToken = async (idToken) => {
  const allowedClientIds = getAllowedGoogleClientIds();

  if (!allowedClientIds.length) {
    const error = new Error("Google mobile auth is not configured properly");
    error.statusCode = 500;
    throw error;
  }

  const response = await axios.get("https://oauth2.googleapis.com/tokeninfo", {
    params: { id_token: idToken },
  });

  const profile = response.data || {};

  if (!profile.sub) {
    const error = new Error("Google ID missing from token");
    error.statusCode = 400;
    throw error;
  }

  if (!allowedClientIds.includes(profile.aud)) {
    const error = new Error("Google token audience is not allowed");
    error.statusCode = 401;
    throw error;
  }

  if (profile.email_verified && String(profile.email_verified) !== "true") {
    const error = new Error("Google email is not verified");
    error.statusCode = 401;
    throw error;
  }

  return profile;
};

const redirectToGoogle = (req, res) => {
  // Validate environment variables
  if (!GOOGLE_CLIENT_ID || !GOOGLE_REDIRECT_URI) {
    console.error("Missing Google OAuth credentials:", {
      hasClientId: !!GOOGLE_CLIENT_ID,
      hasClientSecret: !!GOOGLE_CLIENT_SECRET,
      hasRedirectUri: !!GOOGLE_REDIRECT_URI,
    });
    return res.status(500).json({ message: "Google OAuth not configured properly" });
  }

  // Capture the source (app or web) from query parameter, default to 'web'
  const source = normalizeSource(req.query.source);
  
  // Use state parameter to preserve source through OAuth flow
  const state = encodeOAuthState({ source });

  const googleAuthURL =
    `https://accounts.google.com/o/oauth2/v2/auth?` +
    `client_id=${GOOGLE_CLIENT_ID}&redirect_uri=${encodeURIComponent(GOOGLE_REDIRECT_URI)}&response_type=code&scope=openid profile email&state=${encodeURIComponent(state)}`;
  
  console.log("Redirecting to Google with:", {
    clientId: GOOGLE_CLIENT_ID,
    redirectUri: GOOGLE_REDIRECT_URI,
    source,
  });
  
  res.redirect(googleAuthURL);
};

const googleCallback = async (req, res) => {
  const { code, state } = req.query;

  if (!code) {
    return res.status(400).json({ message: "Authorization code missing" });
  }

  // Decode state parameter to get source (app or web)
  let source = 'web';
  try {
    if (state) {
      const decoded = decodeOAuthState(state);
      source = normalizeSource(decoded?.source);
    }
  } catch (error) {
    console.error('Error decoding state parameter:', error);
  }

  // Validate environment variables
  if (!GOOGLE_CLIENT_ID || !GOOGLE_CLIENT_SECRET || !GOOGLE_REDIRECT_URI) {
    console.error("Missing Google OAuth credentials:", {
      hasClientId: !!GOOGLE_CLIENT_ID,
      hasClientSecret: !!GOOGLE_CLIENT_SECRET,
      hasRedirectUri: !!GOOGLE_REDIRECT_URI,
    });
    return res.status(500).json({ message: "Google OAuth not configured properly" });
  }

  console.log("Google callback received with code:", code.substring(0, 20) + "...");
  console.log("Using redirect_uri:", GOOGLE_REDIRECT_URI);
  console.log("Client ID:", GOOGLE_CLIENT_ID);
  console.log("Source:", source);

  try {
    //Get the access token from Google
    const tokenRequestData = {
      code,
      client_id: GOOGLE_CLIENT_ID,
      client_secret: GOOGLE_CLIENT_SECRET,
      redirect_uri: GOOGLE_REDIRECT_URI,
      grant_type: "authorization_code",
    };

    console.log("Requesting token from Google with redirect_uri:", tokenRequestData.redirect_uri);

    const response = await axios.post(
      "https://oauth2.googleapis.com/token",
      qs.stringify(tokenRequestData),
      {
        headers: {
          "Content-Type": "application/x-www-form-urlencoded",
        },
      }
    );

    const { access_token } = response.data;

    // Get user info from Google
    const userResponse = await axios.get(
      "https://www.googleapis.com/oauth2/v3/userinfo",
      {
        headers: {
          Authorization: `Bearer ${access_token}`,
        },
      }
    );

    const { sub: googleId, name, email, picture } = userResponse.data;

    if (!googleId) {
      return res
        .status(400)
        .json({ message: "Google ID missing from response" });
    }

    const { user, isNewUser } = await findOrCreateGoogleUser({
      googleId,
      name,
      email,
    });
    const { token, middlewareToken, refreshToken } = await completeGoogleLogin(
      res,
      user,
      isNewUser
    );

    // Use source parameter to determine redirect destination
    // Only redirect to app deep link if explicitly from app (source=app)
    // All web users (mobile or desktop) go to login-success page
    if (source === 'app') {
      // Redirect to app deep link
      console.log('Redirecting to app deep link');
      res.redirect(
        `graho://auth/callback?token=${encodeURIComponent(token)}&middlewareToken=${encodeURIComponent(
          middlewareToken
        )}&refreshToken=${encodeURIComponent(refreshToken)}`
      );
    } else {
      // Redirect to login-success page for all web users (mobile and desktop browsers)
      console.log('Redirecting to web login-success page');
      res.redirect(`${FRONTEND_URL}/login-success`);
    }
  } catch (error) {
    console.error("Google OAuth Error:", {
      message: error.message,
      response: error.response?.data,
      status: error.response?.status,
      config: {
        url: error.config?.url,
        method: error.config?.method,
        redirect_uri: GOOGLE_REDIRECT_URI,
      }
    });

    // Provide more specific error messages
    if (error.response?.status === 401 && error.response?.data?.error === "invalid_client") {
      return res.status(500).json({ 
        message: "Google OAuth configuration error: Invalid client credentials. Please check GOOGLE_CLIENT_ID and GOOGLE_CLIENT_SECRET in .env file.",
        error: "invalid_client"
      });
    }

    if (error.response?.status === 400 && error.response?.data?.error === "redirect_uri_mismatch") {
      return res.status(500).json({ 
        message: "Redirect URI mismatch. Please ensure the redirect URI in Google Cloud Console matches: " + GOOGLE_REDIRECT_URI,
        error: "redirect_uri_mismatch"
      });
    }

    res.status(500).json({ message: "Internal Server Error", error: error.message });
  }
};

const googleMobileLogin = async (req, res) => {
  try {
    const idToken = String(req.body.idToken || "").trim();

    if (!idToken) {
      return res.status(400).json({
        success: false,
        message: "Google ID token is required",
      });
    }

    const profile = await verifyGoogleIdToken(idToken);
    const { user, isNewUser } = await findOrCreateGoogleUser({
      googleId: profile.sub,
      name: profile.name,
      email: profile.email,
    });
    const { token, middlewareToken, bonusInfo, profileIncomplete } =
      await completeGoogleLogin(res, user, isNewUser);

    return res.status(200).json({
      success: true,
      message: isNewUser ? "Registration successful" : "Login successful",
      isNewUser: profileIncomplete,
      token,
      middlewareToken,
      bonusInfo,
      user: buildUserPayload(user),
    });
  } catch (error) {
    console.error("Google mobile login error:", {
      message: error.message,
      response: error.response?.data,
      status: error.response?.status,
    });

    const statusCode = error.statusCode || error.response?.status || 500;
    return res.status(statusCode).json({
      success: false,
      message: error.message || "Google login failed",
    });
  }
};

module.exports = {
  googleCallback,
  googleMobileLogin,
  redirectToGoogle,
};
