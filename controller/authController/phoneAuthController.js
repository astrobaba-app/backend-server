const User = require("../../model/user/userAuth");
// const handleSendAuthOTP = require("../../mobileService/userAuthOtp");
const {
  createToken,
  createMiddlewareToken,
  createRefreshToken,
  validateToken,
  validateRefreshToken,
  resolveActorType,
} = require("../../services/authService");
const setTokenCookie = require("../../services/setTokenCookie");
const clearTokenCookie = require("../../services/clearTokenCookie");
const { parse } = require("cookie");
const {
  grantWelcomeFreeChatForUser,
} = require("../../services/freeChatService");
const {
  validateWhatsappApiKey,
} = require("../../services/whatsappAuthSettingsService");
const {
  normalizeIndianMobile,
} = require("../../services/phoneNumberService");
const { createAndQueueOtp, verifyQueuedOtp, createStoredOtp } = require("../../services/otpQueueService");

const DUMMY_USER_PHONE = "8112590072";
const DUMMY_USER_OTP = "1111";
const { trackUserLogin } = require("../../services/userLoginTrackingService");
const { recordUserLogout } = require("../../services/userActivityCohortService");
const pushNotificationService = require("../../services/pushNotificationService");

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

    if (normalizedMobile === DUMMY_USER_PHONE) {
      await createStoredOtp({
        actorType: "user",
        mobile: normalizedMobile,
        otp: DUMMY_USER_OTP,
      });
    } else {
      await createAndQueueOtp({
        actorType: "user",
        mobile: normalizedMobile,
      });
    }

    res.status(200).json({
      success: true,
      message:
        normalizedMobile === DUMMY_USER_PHONE
          ? "Dummy OTP prepared successfully"
          : "OTP sent successfully",
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
        activeDevices: [],
      });
      isNewUser = true;
    }

    const { deviceId, deviceName, deviceType, forceLogout } = req.body;
    let finalDeviceId = deviceId ? String(deviceId).trim() : null;

    if (finalDeviceId) {
      let activeDevices = user.activeDevices || [];
      const existingDeviceIndex = activeDevices.findIndex((d) => d.deviceId === finalDeviceId);

      if (existingDeviceIndex === -1 && activeDevices.length >= 3) {
        // Sort devices by lastLoginAt ascending to find LRU
        activeDevices.sort((a, b) => new Date(a.lastLoginAt) - new Date(b.lastLoginAt));
        const lruDevice = activeDevices[0];

        if (!forceLogout) {
          return res.status(409).json({
            success: false,
            code: "MAX_DEVICES_REACHED",
            sessionConflict: true,
            message: `Maximum 3 active devices reached. Would you like to log out from the oldest device (${lruDevice.deviceName || 'Unknown'})?`,
            lruDevice: lruDevice
          });
        }

        // Force logout the LRU device
        activeDevices.shift(); // Remove LRU
        // Delete its push token
        await pushNotificationService.removeDeviceTokenByDeviceId(user.id, lruDevice.deviceId);
      }

      // Add or update the current device
      const newDeviceInfo = {
        deviceId: finalDeviceId,
        deviceName: deviceName ? String(deviceName).trim() : "Unknown Device",
        deviceType: deviceType ? String(deviceType).trim() : "unknown",
        lastLoginAt: new Date().toISOString()
      };

      if (existingDeviceIndex !== -1) {
        activeDevices[existingDeviceIndex] = newDeviceInfo;
      } else {
        activeDevices.push(newDeviceInfo);
      }
      
      user.activeDevices = activeDevices;
      await user.save();
    }

    // Generate tokens and set cookies
    const token = createToken(user, finalDeviceId);
    const middlewareToken = createMiddlewareToken(user, finalDeviceId);
    const refreshToken = createRefreshToken(user, finalDeviceId);

    setTokenCookie(res, token, middlewareToken, refreshToken);

    await trackUserLogin(user.id, "phone", {
      invalidateTotalUsers: isNewUser,
    });

    let welcomeFreeChatInfo = null;
    if (isNewUser) {
      try {
        const welcomeGrant = await grantWelcomeFreeChatForUser(user.id, {
          loginMethod: "phone",
        });
        const grantedMinutes = welcomeGrant.minutes || 2;
        welcomeFreeChatInfo = {
          minutes: grantedMinutes,
          applicableChatType: "ai",
          message: "Talk to an astrologer for free.",
        };
      } catch (error) {
        console.error("Failed to grant welcome free chat:", error);
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
      bonusInfo: null,
      welcomeFreeChatInfo,
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
      message:
        statusCode < 500 ? error.message : "Failed to verify OTP",
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
          await grantWelcomeFreeChatForUser(createdUser.id, {
            loginMethod: "phone",
          });
        } catch (welcomeError) {
          console.error("Failed to grant WhatsApp welcome free chat:", welcomeError);
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
    const refreshToken =
      req.cookies?.refresh_token ||
      req.body?.refreshToken ||
      req.headers["x-refresh-token"];

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

    const tokenDeviceId = refreshPayload.deviceId;
    if (tokenDeviceId) {
      const activeDevices = user.activeDevices || [];
      if (!activeDevices.find((d) => d.deviceId === tokenDeviceId)) {
        clearTokenCookie(res);
        return res.status(401).json({
          success: false,
          message: "Session logged out on this device.",
        });
      }
    }

    const token = createToken(user, tokenDeviceId);
    const middlewareToken = createMiddlewareToken(user, tokenDeviceId);
    const nextRefreshToken = createRefreshToken(user, tokenDeviceId);

    setTokenCookie(res, token, middlewareToken, nextRefreshToken);

    return res.status(200).json({
      success: true,
      message: "Token refreshed successfully",
      token,
      middlewareToken,
      refreshToken: nextRefreshToken,
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
    let token;
    if (req.headers.cookie) {
      const parsedCookies = parse(req.headers.cookie);
      token = parsedCookies.token;
    }
    if (!token && req.headers.authorization?.startsWith("Bearer ")) {
      token = req.headers.authorization.split(" ")[1];
    }

    const payload = token ? validateToken(token) : null;
    if (payload?.id && payload?.role !== "astrologer") {
      await recordUserLogout(payload.id);

      const deviceId = req.body.deviceId ? String(req.body.deviceId).trim() : null;
      if (deviceId) {
        const user = await User.findByPk(payload.id);
        if (user) {
          let activeDevices = user.activeDevices || [];
          activeDevices = activeDevices.filter(d => d.deviceId !== deviceId);
          user.activeDevices = activeDevices;
          await user.save();
        }
        await pushNotificationService.removeDeviceTokenByDeviceId(payload.id, deviceId);
      }
    }

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
