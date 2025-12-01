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

const redirectToGoogle = (req, res) => {
  const googleAuthURL =
    `https://accounts.google.com/o/oauth2/v2/auth?` +
    `client_id=${GOOGLE_CLIENT_ID}&redirect_uri=${GOOGLE_REDIRECT_URI}&response_type=code&scope=openid profile email`;
  res.redirect(googleAuthURL);
};

const googleCallback = async (req, res) => {
  const { code } = req.query;

  if (!code) {
    return res.status(400).json({ message: "Authorization code missing" });
  }

  try {
    //Get the access token from Google
    const response = await axios.post(
      "https://oauth2.googleapis.com/token",
      qs.stringify({
        code,
        client_id: GOOGLE_CLIENT_ID,
        client_secret: GOOGLE_CLIENT_SECRET,
        redirect_uri: GOOGLE_REDIRECT_URI,
        grant_type: "authorization_code",
      }),
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
      }
    }

    const token = createToken(user);
    const middlewareToken = createMiddlewareToken(user);

    setTokenCookie(res, token, middlewareToken);
    res.redirect(FRONTEND_URL);
  } catch (error) {
    console.error(error);
    res.status(500).json({ message: "Internal Server Error" });
  }
};

module.exports = {
  googleCallback,
  redirectToGoogle,
};
