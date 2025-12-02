const User = require("../../model/user/userAuth");
const handleSendAuthOTP = require("../../mobileService/userAuthOtp");
const { createToken, createMiddlewareToken } = require("../../services/authService");
const setTokenCookie = require("../../services/setTokenCookie");
const clearTokenCookie = require("../../services/clearTokenCookie");
const redis = require("../../config/redis/redis");


const generateOtp = async (req, res) => {
  try {
    const { mobile } = req.body;

    if (!mobile) {
      return res.status(400).json({
        success: false,
        message: "Mobile number is required",
      });
    }

    // Validate mobile number (basic validation)
    const mobileRegex = /^[6-9]\d{9}$/;
    if (!mobileRegex.test(mobile)) {
      return res.status(400).json({
        success: false,
        message: "Invalid mobile number format",
      });
    }

    // Generate 6-digit OTP
    const otp = Math.floor(100000 + Math.random() * 900000).toString();

    // Check if user exists (for determining new vs existing user)
    let user = await User.findOne({ where: { mobile } });
    const isNewUser = !user;
    
    // Store OTP in Redis with 5 minutes expiry
    const otpKey = `user:otp:${mobile}`;
    await redis.setex(otpKey, 300, {
      otp,
      mobile,
      isNewUser,
      createdAt: Date.now()
    });

    // Send OTP via Twilio
    await handleSendAuthOTP(mobile, otp);

    res.status(200).json({
      success: true,
      message: "OTP sent successfully",
      otp: otp, // Remove in production
    });
  } catch (error) {
    console.error("Generate OTP error:", error);
    res.status(500).json({
      success: false,
      message: "Failed to send OTP",
      error: error.message,
    });
  }
};


const verifyOtp = async (req, res) => {
  try {
    const { otp } = req.body;

    if (!otp) {
      return res.status(400).json({
        success: false,
        message: "OTP is required",
      });
    }

    // Find the mobile number associated with this OTP in Redis
    // We need to scan all user OTP keys to find the matching OTP
    let mobile = null;
    let otpData = null;
    
    // Get all keys matching the pattern
    const keys = await redis.keys('user:otp:*');
    
    for (const key of keys) {
      const data = await redis.get(key);
      if (data) {
        // Upstash Redis automatically parses JSON, so data is already an object
        const parsed = typeof data === 'string' ? JSON.parse(data) : data;
        if (parsed.otp === otp) {
          mobile = parsed.mobile;
          otpData = parsed;
          // Delete OTP from Redis after successful verification
          await redis.del(key);
          break;
        }
      }
    }

    if (!otpData) {
      return res.status(400).json({
        success: false,
        message: "Invalid or expired OTP",
      });
    }

    // Find or create user
    let user = await User.findOne({ where: { mobile } });
    
    if (!user) {
      // Create new user
      user = await User.create({
        mobile,
        isUserRequested: false,
      });
    }

    // Generate tokens and set cookies
    const token = createToken(user);
    const middlewareToken = createMiddlewareToken(user);

    setTokenCookie(res, token, middlewareToken);

    // Check if this is a new user (no fullName means not completed profile)
    const isNewUser = !user.fullName;

    return res.status(200).json({
      success: true,
      message: isNewUser ? "Registration successful" : "Login successful",
      isNewUser,
      token: token,
      middlewareToken: middlewareToken,
      user: {
        id: user.id,
        fullName: user.fullName,
        email: user.email,
        mobile: user.mobile,
        gender: user.gender,
        dateOfbirth: user.dateOfbirth,
      },
    });
  } catch (error) {
    console.error("Verify OTP error:", error);
    res.status(500).json({
      success: false,
      message: "Failed to verify OTP",
      error: error.message,
    });
  }
};


const logout = async (req, res) => {
  try {
    clearTokenCookie(res);

    res.status(200).json({
      success: true,
      message: "Logout successful",
    });
  } catch (error) {
    console.error("Logout error:", error);
    res.status(500).json({
      success: false,
      message: "Failed to logout",
      error: error.message,
    });
  }
};

module.exports = {
  generateOtp,
  verifyOtp,
  logout,
};
