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
const { createToken, createMiddlewareToken } = require("../../services/authService");
const setTokenCookie = require("../../services/setTokenCookie");
const { applySignupBonus } = require("../../services/signupBonusService");

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
  const source = req.query.source || 'web';
  
  // Use state parameter to preserve source through OAuth flow
  const state = Buffer.from(JSON.stringify({ source })).toString('base64');

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
      const decoded = JSON.parse(Buffer.from(state, 'base64').toString('utf-8'));
      source = decoded.source || 'web';
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

    // Check if Google account is already linked
    let googleAuth = await GoogleAuth.findOne({ 
      where: { googleId },
      include: [{ model: User, as: "user" }]
    });

    let user;
    let isNewUser = false;

    if (googleAuth) {
      // User already exists with this Google ID - login
      user = googleAuth.user;
      
      // Update user info if changed
      if (user.fullName !== name || user.email !== email) {
        await user.update({ fullName: name, email });
      }
    } else {
      // Check if user exists with this email
      user = await User.findOne({ where: { email } });

      if (user) {
        // User exists with email - link Google account
        googleAuth = await GoogleAuth.create({
          userId: user.id,
          googleId,
        });
      } else {
        // New user - create user and Google auth
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

    const token = createToken(user);
    const middlewareToken = createMiddlewareToken(user);

    setTokenCookie(res, token, middlewareToken);

    // Apply signup bonus for new users
    if (isNewUser) {
      try {
        await applySignupBonus(user.id, "google");
      } catch (error) {
        console.error("Failed to apply signup bonus:", error);
        // Don't fail the registration if bonus fails
      }
    }

    // Use source parameter to determine redirect destination
    // Only redirect to app deep link if explicitly from app (source=app)
    // All web users (mobile or desktop) go to login-success page
    if (source === 'app') {
      // Redirect to app deep link
      console.log('Redirecting to app deep link');
      res.redirect(`graho://auth/callback?token=${encodeURIComponent(token)}&middlewareToken=${encodeURIComponent(middlewareToken)}`);
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

module.exports = {
  googleCallback,
  redirectToGoogle,
};
