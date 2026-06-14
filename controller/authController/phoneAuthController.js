const User = require("../../model/user/userAuth");
// const handleSendAuthOTP = require("../../mobileService/userAuthOtp");
const {
  createToken,
  createMiddlewareToken,
  createRefreshToken,
  validateRefreshToken,
  resolveActorType,
} = require("../../services/authService");
const setTokenCookie = require("../../services/setTokenCookie");
const clearTokenCookie = require("../../services/clearTokenCookie");
const { applySignupBonus } = require("../../services/signupBonusService");
const {
  validateWhatsappApiKey,
} = require("../../services/whatsappAuthSettingsService");
const {
  normalizeIndianMobile,
} = require("../../services/phoneNumberService");
const {
  createAndQueueOtp,
  verifyQueuedOtp,
} = require("../../services/otpQueueService");
const { trackUserLogin } = require("../../services/userLoginTrackingService");

const normalizeMobileNumber = (rawMobile) => {
  const digits = String(rawMobile || "").replace(/\D/g, "");
  if (!digits) return null;

  const withoutLeadingZeros = digits.replace(/^0+/, "");
  const candidates = [
    digits,
    withoutLeadingZeros,
    digits.slice(-10),
    withoutLeadingZeros.slice(-10),
  ];

  for (const candidate of candidates) {
    if (/^[6-9]\d{9}$/.test(candidate)) {
      return candidate;
    }
  }

  return null;
};

const buildFullName = ({ name, firstName, lastName }) => {
  const normalizedName = typeof name === "string" ? name.trim() : "";
  if (normalizedName) return normalizedName;

  const normalizedFirstName =
    typeof firstName === "string" ? firstName.trim() : "";
  const normalizedLastName =
    typeof lastName === "string" ? lastName.trim() : "";

  return [normalizedFirstName, normalizedLastName].filter(Boolean).join(" ");
};

const generateOtp = async (req, res) => {
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

    await createAndQueueOtp({
      actorType: "user",
      mobile: normalizedMobile,
    });

    res.status(200).json({
      success: true,
      message: "OTP sent successfully",
      mobile: normalizedMobile,
    });
  } catch (error) {
    console.error("Generate OTP error:", error);
    res.status(error.statusCode || 500).json({
      success: false,
      message: error.statusCode === 429 ? error.message : "Failed to send OTP",
      error: error.message,
    });
  }
};


const verifyOtp = async (req, res) => {
  try {
    const { mobile } = req.body;
    const otp = String(req.body.otp || "").trim();

    const verifiedMobile = normalizeIndianMobile(mobile);
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

    await verifyQueuedOtp({
      actorType: "user",
      mobile: verifiedMobile,
      otp,
    });

    // Find or create user
    let user = await User.findOne({ where: { mobile: verifiedMobile } });
    
    let isNewUser = false;
    if (!user) {
      // Create new user
      user = await User.create({
        mobile: verifiedMobile,
        isUserRequested: false,
      });
      isNewUser = true;
    }

    // Generate tokens and set cookies
    const token = createToken(user);
    const middlewareToken = createMiddlewareToken(user);
    const refreshToken = createRefreshToken(user);

    setTokenCookie(res, token, middlewareToken, refreshToken);

    await trackUserLogin(user.id, "phone", {
      invalidateTotalUsers: isNewUser,
    });

    // Apply signup bonus for new users
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
        // Don't fail the registration if bonus fails
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
    console.error("Verify OTP error:", error);
    const statusCode = error.statusCode || 500;
    res.status(statusCode).json({
      success: false,
      message: "Failed to verify OTP",
      error: error.message,
    });
  }
};


const whatsappRegisterOrCheck = async (req, res) => {
  try {
    const requestBody = req.body || {};
    const normalizeApiKeyCandidate = (value) => {
      if (typeof value !== "string") return "";
      let normalized = value.trim();
      if (normalized.toLowerCase().startsWith("bearer ")) {
        normalized = normalized.slice(7).trim();
      }
      if (
        ((normalized.startsWith('"') && normalized.endsWith('"')) ||
          (normalized.startsWith("'") && normalized.endsWith("'"))) &&
        normalized.length >= 2
      ) {
        normalized = normalized.slice(1, -1).trim();
      }
      return normalized.replace(/\s+/g, "");
    };
    const headerWhatsappApiKey =
      typeof req.headers["x-whatsapp-api-key"] === "string"
        ? normalizeApiKeyCandidate(req.headers["x-whatsapp-api-key"])
        : "";
    const headerGenericApiKey =
      typeof req.headers["x-api-key"] === "string"
        ? normalizeApiKeyCandidate(req.headers["x-api-key"])
        : "";
    const bodyApiKey =
      typeof requestBody.apiKey === "string"
        ? normalizeApiKeyCandidate(requestBody.apiKey)
        : "";
    const authorizationHeader =
      typeof req.headers.authorization === "string"
        ? req.headers.authorization.trim()
        : "";
    const authorizationApiKey = normalizeApiKeyCandidate(authorizationHeader);

    const providedApiKey =
      headerWhatsappApiKey ||
      headerGenericApiKey ||
      authorizationApiKey ||
      bodyApiKey;

    const apiKeyValidation = await validateWhatsappApiKey(providedApiKey);
    if (!apiKeyValidation.isValid) {
      const statusCode =
        apiKeyValidation.reason === "disabled" ||
        apiKeyValidation.reason === "not_configured"
          ? 503
          : 401;

      return res.status(statusCode).json({
        success: false,
        message: "WhatsApp API key validation failed",
        reason: apiKeyValidation.reason,
      });
    }

    const destination =
      typeof req.body.destination === "string"
        ? req.body.destination.trim()
        : "";
    const userName =
      typeof req.body.userName === "string" ? req.body.userName.trim() : "";

    if (!userName) {
      return res.status(400).json({
        success: false,
        message: "userName is required (user name).",
      });
    }

    if (!destination) {
      return res.status(400).json({
        success: false,
        message:
          "destination is required (phone number with country code, like +917428526285).",
      });
    }

    const mobile = normalizeMobileNumber(destination);
    if (!mobile) {
      return res.status(400).json({
        success: false,
        message: "destination must be a valid phone number",
      });
    }

    const fullName = buildFullName({
      name: req.body.name || userName,
      firstName: req.body.firstName || req.body.firstname,
      lastName: req.body.lastName || req.body.lastname,
    });

    const existingUser = await User.findOne({
      where: { mobile },
      attributes: ["id", "mobile"],
    });

    if (existingUser) {
      return res.status(200).json({
        success: true,
        exists: true,
        userCreated: false,
        userId: existingUser.id,
      });
    }

    let createdUser;
    try {
      createdUser = await User.create({
        mobile,
        fullName: fullName || null,
        isUserRequested: false,
        whatsappChatLimit: 2,
      });
    } catch (createError) {
      if (createError.name === "SequelizeUniqueConstraintError") {
        // Concurrent requests can race on the same mobile number.
        const racedUser = await User.findOne({
          where: { mobile },
          attributes: ["id"],
        });

        return res.status(200).json({
          success: true,
          exists: true,
          userCreated: false,
          userId: racedUser ? racedUser.id : null,
        });
      }

      throw createError;
    }

    // Keep response path fast; bonus credit is best-effort in background.
    setImmediate(async () => {
      try {
        await applySignupBonus(createdUser.id, "whatsapp");
      } catch (bonusError) {
        console.error("Failed to apply WhatsApp signup bonus:", bonusError);
      }
    });

    return res.status(201).json({
      success: true,
      exists: false,
      userCreated: true,
      userId: createdUser.id,
    });
  } catch (error) {
    console.error("WhatsApp register/check error:", error);
    return res.status(500).json({
      success: false,
      message: "Failed to process WhatsApp registration",
      error: error.message,
    });
  }
};


const refreshAccessToken = async (req, res) => {
  try {
    const refreshToken = req.cookies?.refresh_token;

    if (!refreshToken) {
      return res.status(401).json({
        success: false,
        message: "Refresh token not found",
      });
    }

    const refreshPayload = validateRefreshToken(refreshToken);
    if (!refreshPayload || resolveActorType(refreshPayload) !== "user") {
      clearTokenCookie(res);
      return res.status(401).json({
        success: false,
        message: "Invalid refresh token",
      });
    }

    const user = await User.findByPk(refreshPayload.id);
    if (!user) {
      clearTokenCookie(res);
      return res.status(401).json({
        success: false,
        message: "User not found",
      });
    }

    const token = createToken(user);
    const middlewareToken = createMiddlewareToken(user);
    const nextRefreshToken = createRefreshToken(user);

    setTokenCookie(res, token, middlewareToken, nextRefreshToken);

    return res.status(200).json({
      success: true,
      message: "Token refreshed successfully",
      token,
      middlewareToken,
    });
  } catch (error) {
    console.error("Refresh token error:", error);
    return res.status(500).json({
      success: false,
      message: "Failed to refresh token",
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
  whatsappRegisterOrCheck,
  refreshAccessToken,
  logout,
};
