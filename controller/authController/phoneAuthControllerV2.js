const { randomInt } = require("crypto");
const User = require("../../model/user/userAuth");
const {
  createToken,
  createMiddlewareToken,
  createRefreshToken,
} = require("../../services/authService");
const setTokenCookie = require("../../services/setTokenCookie");
const redis = require("../../config/redis/redis");
const { applySignupBonus } = require("../../services/signupBonusService");
const {
  normalizeIndianMobile,
} = require("../../services/firebasePhoneAuthService");
const { trackUserLogin } = require("../../services/userLoginTrackingService");
const sendUserOtpV2 = require("../../services/otpProviders/sendUserOtpV2");

const OTP_TTL_SECONDS_V2 = 5 * 60;

const generate4DigitOtp = () => randomInt(1000, 10000).toString();

const sendOtpV2 = async (req, res) => {
  try {
    const { mobile } = req.body;

    if (!mobile) {
      return res.status(400).json({
        success: false,
        message: "Mobile number is required",
      });
    }

    const normalizedMobile = normalizeIndianMobile(mobile);
    if (!normalizedMobile) {
      return res.status(400).json({
        success: false,
        message: "Invalid mobile number format",
      });
    }

    const otp = generate4DigitOtp();
    const otpKey = `user:v2:otp:${normalizedMobile}`;

    await redis.setex(otpKey, OTP_TTL_SECONDS_V2, {
      otp,
      mobile: normalizedMobile,
      createdAt: Date.now(),
    });

    await sendUserOtpV2({
      mobile: normalizedMobile,
      otp,
    });

    return res.status(200).json({
      success: true,
      message: "OTP sent successfully",
      mobile: normalizedMobile,
    });
  } catch (error) {
    console.error("Generate OTP V2 error:", error);
    return res.status(500).json({
      success: false,
      message: "Failed to send OTP",
      error: error.message,
    });
  }
};

const verifyOtpV2 = async (req, res) => {
  try {
    const verifiedMobile = normalizeIndianMobile(req.body.mobile);
    const otp = String(req.body.otp || "").trim();

    if (!verifiedMobile || !otp) {
      return res.status(400).json({
        success: false,
        message: "Mobile number and OTP are required",
      });
    }

    if (!/^\d{4}$/.test(otp)) {
      return res.status(400).json({
        success: false,
        message: "Please provide a valid 4-digit OTP",
      });
    }

    const otpKey = `user:v2:otp:${verifiedMobile}`;
    const storedData = await redis.get(otpKey);

    if (!storedData) {
      return res.status(400).json({
        success: false,
        message: "Invalid or expired OTP",
      });
    }

    const otpData =
      typeof storedData === "string" ? JSON.parse(storedData) : storedData;

    if (otpData.otp !== otp || otpData.mobile !== verifiedMobile) {
      return res.status(400).json({
        success: false,
        message: "Invalid or expired OTP",
      });
    }

    await redis.del(otpKey);

    // Keep the post-verification flow identical to the existing Firebase flow.
    let user = await User.findOne({ where: { mobile: verifiedMobile } });

    let isNewUser = false;
    if (!user) {
      user = await User.create({
        mobile: verifiedMobile,
        isUserRequested: false,
      });
      isNewUser = true;
    }

    const token = createToken(user);
    const middlewareToken = createMiddlewareToken(user);
    const refreshToken = createRefreshToken(user);

    setTokenCookie(res, token, middlewareToken, refreshToken);

    await trackUserLogin(user.id, "phone", {
      invalidateTotalUsers: isNewUser,
    });

    let bonusInfo = null;
    if (isNewUser) {
      try {
        const bonusResult = await applySignupBonus(user.id, "phone");
        if (bonusResult.bonusApplied) {
          bonusInfo = {
            amount: bonusResult.amount,
            message: bonusResult.message,
          };
        }
      } catch (error) {
        console.error("Failed to apply signup bonus:", error);
      }
    }

    // Keep the existing onboarding response contract unchanged.
    const profileIncomplete = !user.fullName;

    return res.status(200).json({
      success: true,
      message: isNewUser ? "Registration successful" : "Login successful",
      isNewUser: profileIncomplete,
      token: token,
      middlewareToken: middlewareToken,
      bonusInfo: bonusInfo,
      user: {
        id: user.id,
        fullName: user.fullName,
        email: user.email,
        mobile: user.mobile,
        gender: user.gender,
        dateOfbirth: user.dateOfbirth,
        isOnboarded: user.isOnboarded,
      },
    });
  } catch (error) {
    console.error("Verify OTP V2 error:", error);
    const statusCode = error.statusCode || 500;
    return res.status(statusCode).json({
      success: false,
      message: "Failed to verify OTP",
      error: error.message,
    });
  }
};

module.exports = {
  sendOtpV2,
  verifyOtpV2,
};
