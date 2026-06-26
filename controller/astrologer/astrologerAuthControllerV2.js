const Astrologer = require("../../model/astrologer/astrologer");
const redis = require("../../config/redis/redis");
const clearTokenCookieAstrologer = require("../../services/clearTokenCookieAstrologer");
const pushNotificationService = require("../../services/pushNotificationService");
const {
  createToken,
  createMiddlewareToken,
  createRefreshToken,
} = require("../../services/authService");
const setTokenCookieAstrologer = require("../../services/setTokenCookieAstrologer");
const {
  normalizeIndianMobile,
} = require("../../services/phoneNumberService");
const {
  createAndQueueMobileOtp,
  verifyQueuedOtp,
} = require("../../services/otpQueueService");

const REGISTRATION_VERIFIED_TTL_SECONDS = 20 * 60;

const normalizeEmail = (value) => (value || "").trim().toLowerCase();

const normalizeDeviceType = (value) =>
  ["ios", "android", "web"].includes(value) ? value : "android";

const normalizeDeviceName = (deviceName, deviceType) => {
  const trimmed = (deviceName || "").trim();
  if (trimmed) return trimmed.slice(0, 120);
  return deviceType === "ios" ? "iOS device" : "Android device";
};

const buildAstrologerLoginResponse = (
  astrologer,
  phoneNumber,
  token,
  astrologerToken,
  refreshToken
) => ({
  success: true,
  message: "Login successful",
  phoneNumber,
  requiresRegistration: false,
  astrologer: {
    id: astrologer.id,
    phoneNumber: astrologer.phoneNumber,
    email: astrologer.email,
    fullName: astrologer.fullName,
    photo: astrologer.photo,
    isApproved: astrologer.isApproved,
    isActive: astrologer.isActive,
    isOnline: astrologer.isOnline,
    languages: astrologer.languages,
    skills: astrologer.skills,
    yearsOfExperience: astrologer.yearsOfExperience,
    rating: parseFloat(astrologer.rating),
    totalConsultations: astrologer.totalConsultations,
  },
  token,
  astrologerToken,
  refreshToken,
});

const toStringArray = (value) => {
  if (value === undefined || value === null) return [];
  if (Array.isArray(value)) {
    return value
      .map((item) =>
        item === undefined || item === null ? "" : String(item).trim()
      )
      .filter(Boolean);
  }

  if (typeof value === "string") {
    const trimmed = value.trim();
    if (!trimmed) return [];

    try {
      const parsed = JSON.parse(trimmed);
      if (Array.isArray(parsed)) {
        return parsed
          .map((item) =>
            item === undefined || item === null ? "" : String(item).trim()
          )
          .filter(Boolean);
      }
    } catch (error) {
      // fallback to comma-separated parsing
    }

    return trimmed
      .split(",")
      .map((item) => item.trim())
      .filter(Boolean);
  }

  return [String(value).trim()].filter(Boolean);
};

const sendRegistrationOTPV2 = async (req, res) => {
  try {
    const { phoneNumber } = req.body;

    const normalizedPhoneNumber = normalizeIndianMobile(phoneNumber);
    if (!normalizedPhoneNumber) {
      return res.status(400).json({
        success: false,
        message: "Please provide a valid 10-digit phone number",
      });
    }

    const astrologer = await Astrologer.findOne({
      where: { phoneNumber: normalizedPhoneNumber },
    });

    if (astrologer && !astrologer.isApproved) {
      return res.status(403).json({
        success: false,
        pendingApproval: true,
        message:
          "Your application is currently under review and has not been approved yet.",
      });
    }

    await createAndQueueMobileOtp({
      actorType: "astrologer",
      mobile: normalizedPhoneNumber,
    });

    return res.status(200).json({
      success: true,
      accountExists: Boolean(astrologer),
      isApproved: astrologer ? astrologer.isApproved : false,
      message: "OTP sent successfully",
      phoneNumber: normalizedPhoneNumber,
    });
  } catch (error) {
    console.error("Send registration OTP V2 error:", error);
    return res.status(error.statusCode || 500).json({
      success: false,
      message: error.statusCode === 429 ? error.message : "Failed to send OTP",
      error: error.message,
    });
  }
};

const verifyOTPV2 = async (req, res) => {
  try {
    const phoneNumber = normalizeIndianMobile(req.body.phoneNumber);
    const otp = (req.body.otp || "").trim();
    const deviceId = (req.body.deviceId || "").trim();
    const forceLogout = req.body.forceLogout === true;
    const deviceType = normalizeDeviceType(req.body.deviceType);
    const deviceName = normalizeDeviceName(req.body.deviceName, deviceType);

    if (!phoneNumber || !otp) {
      return res.status(400).json({
        success: false,
        message: "Phone number and OTP are required",
      });
    }

    if (!deviceId) {
      return res.status(400).json({
        success: false,
        message: "Device id is required",
      });
    }

    if (!/^\d{4}$/.test(otp)) {
      return res.status(400).json({
        success: false,
        message: "Please provide a valid 4-digit OTP",
      });
    }

    await verifyQueuedOtp({
      actorType: "astrologer",
      mobile: phoneNumber,
      otp,
    });

    const astrologer = await Astrologer.findOne({ where: { phoneNumber } });

    if (!astrologer) {
      const verificationKey = `astrologer:registration:verified:${phoneNumber}`;
      await redis.setex(verificationKey, REGISTRATION_VERIFIED_TTL_SECONDS, {
        phoneNumber,
        verifiedAt: Date.now(),
        source: "v2",
      });

      return res.status(200).json({
        success: true,
        requiresRegistration: true,
        message: "Phone number verified successfully",
        phoneNumber,
      });
    }

    if (!astrologer.isApproved) {
      return res.status(403).json({
        success: false,
        pendingApproval: true,
        message:
          "Your application is currently under review and has not been approved yet",
      });
    }

    if (!astrologer.isActive) {
      return res.status(403).json({
        success: false,
        message: "Your account has been deactivated. Please contact support.",
      });
    }

    const hasOtherActiveDevice =
      astrologer.activeDeviceId && astrologer.activeDeviceId !== deviceId;

    if (hasOtherActiveDevice && !forceLogout) {
      return res.status(409).json({
        success: false,
        code: "ASTROLOGER_SESSION_ACTIVE",
        sessionConflict: true,
        message: `Session is already logged in the '${
          astrologer.activeDeviceName || "other device"
        }'`,
        activeSession: {
          deviceId: astrologer.activeDeviceId,
          deviceName: astrologer.activeDeviceName || "other device",
          deviceType: astrologer.activeDeviceType,
          startedAt: astrologer.activeSessionStartedAt,
        },
      });
    }

    const nextSessionVersion = forceLogout
      ? (astrologer.sessionVersion || 0) + 1
      : astrologer.sessionVersion || 0;

    if (forceLogout) {
      await pushNotificationService.deactivateAstrologerDeviceTokens(astrologer.id, {
        exceptDeviceId: deviceId,
      });
    }

    await astrologer.update({
      sessionVersion: nextSessionVersion,
      activeDeviceId: deviceId,
      activeDeviceName: deviceName,
      activeDeviceType: deviceType,
      activeSessionStartedAt: new Date(),
    });

    const authPayload = {
      id: astrologer.id,
      role: "astrologer",
      sessionVersion: astrologer.sessionVersion,
    };
    const token = createToken(authPayload);
    const astrologerToken = createMiddlewareToken(authPayload);
    const refreshToken = createRefreshToken(authPayload);

    setTokenCookieAstrologer(res, token, astrologerToken, refreshToken);

    return res
      .status(200)
      .json(
        buildAstrologerLoginResponse(
          astrologer,
          phoneNumber,
          token,
          astrologerToken,
          refreshToken
        )
      );
  } catch (error) {
    console.error("Verify OTP V2 error:", error);
    return res.status(error.statusCode || 500).json({
      success: false,
      message:
        error.statusCode && error.statusCode < 500
          ? error.message
          : "Failed to verify OTP",
      error: error.message,
    });
  }
};

const logoutV2 = async (req, res) => {
  try {
    const astrologerId = req.user.id;
    const token = (req.body.token || "").trim();
    const deviceId = (req.body.deviceId || "").trim();

    const astrologer = await Astrologer.findByPk(astrologerId);
    if (!astrologer) {
      clearTokenCookieAstrologer(res);
      return res.status(401).json({
        success: false,
        message: "Astrologer not found",
      });
    }

    if (token) {
      await pushNotificationService.removeAstrologerDeviceToken(token);
    } else if (deviceId) {
      await pushNotificationService.deactivateAstrologerDeviceTokens(astrologerId, {
        deviceId,
      });
    }

    const shouldClearActiveDevice =
      !deviceId || !astrologer.activeDeviceId || astrologer.activeDeviceId === deviceId;

    await astrologer.update({
      sessionVersion: (astrologer.sessionVersion || 0) + 1,
      isOnline: false,
      ...(shouldClearActiveDevice
        ? {
            activeDeviceId: null,
            activeDeviceName: null,
            activeDeviceType: null,
            activeSessionStartedAt: null,
          }
        : {}),
    });

    clearTokenCookieAstrologer(res);

    return res.status(200).json({
      success: true,
      message: "Logout successful",
    });
  } catch (error) {
    console.error("Logout V2 error:", error);
    return res.status(500).json({
      success: false,
      message: "Failed to logout",
      error: error.message,
    });
  }
};

const completeRegistrationV2 = async (req, res) => {
  try {
    const {
      phoneNumber,
      email,
      fullName,
      dateOfBirth,
      gender,
      languages,
      skills,
      categories,
      yearsOfExperience,
      pricePerMinute,
      bio,
      availability,
    } = req.body;

    if (!phoneNumber || !fullName) {
      return res.status(400).json({
        success: false,
        message: "Phone number and full name are required",
      });
    }

    const normalizedPhoneNumber = normalizeIndianMobile(phoneNumber);
    if (!normalizedPhoneNumber) {
      return res.status(400).json({
        success: false,
        message: "Please provide a valid 10-digit phone number",
      });
    }

    const verificationKey = `astrologer:registration:verified:${normalizedPhoneNumber}`;
    const verificationData = await redis.get(verificationKey);
    if (!verificationData) {
      return res.status(403).json({
        success: false,
        message: "Phone number verification expired. Please verify OTP again.",
      });
    }

    const languagesArray = toStringArray(languages);
    const skillsArray = toStringArray(skills);
    const categoriesArray = toStringArray(categories);

    if (!languagesArray.length) {
      return res.status(400).json({
        success: false,
        message: "Please select at least one language",
      });
    }

    if (!skillsArray.length) {
      return res.status(400).json({
        success: false,
        message: "Please select at least one skill",
      });
    }

    if (!categoriesArray.length) {
      return res.status(400).json({
        success: false,
        message: "Please select at least one consultation category",
      });
    }

    const validCategories = [
      "Love",
      "Relationship",
      "Education",
      "Health",
      "Career",
      "Finance",
      "Marriage",
      "Family",
      "Business",
      "Legal",
      "Travel",
      "Spiritual",
    ];
    const invalidCategories = categoriesArray.filter(
      (cat) => !validCategories.includes(cat)
    );
    if (invalidCategories.length > 0) {
      return res.status(400).json({
        success: false,
        message: `Invalid categories: ${invalidCategories.join(
          ", "
        )}. Valid categories are: ${validCategories.join(", ")}`,
      });
    }

    if (gender) {
      const validGenders = ["Male", "Female", "Other"];
      if (!validGenders.includes(gender)) {
        return res.status(400).json({
          success: false,
          message: `Invalid gender: ${gender}. Valid genders are: Male, Female, Other`,
        });
      }
    }

    const pricePerMin = pricePerMinute ? parseFloat(pricePerMinute) : 0.0;
    if (pricePerMin < 0) {
      return res.status(400).json({
        success: false,
        message: "Price per minute cannot be negative",
      });
    }

    const existingAstrologer = await Astrologer.findOne({
      where: { phoneNumber: normalizedPhoneNumber },
    });
    if (existingAstrologer) {
      return res.status(400).json({
        success: false,
        message: "Astrologer with this phone number already exists",
      });
    }

    const normalizedEmail = email ? normalizeEmail(email) : null;
    if (normalizedEmail) {
      const existingEmail = await Astrologer.findOne({
        where: { email: normalizedEmail },
      });
      if (existingEmail) {
        return res.status(400).json({
          success: false,
          message: "Email already registered",
        });
      }
    }

    const astrologer = await Astrologer.create({
      phoneNumber: normalizedPhoneNumber,
      email: normalizedEmail,
      password: null,
      fullName,
      photo: req.fileUrl || null,
      dateOfBirth: dateOfBirth || null,
      gender: gender || null,
      languages: languagesArray,
      skills: skillsArray,
      categories: categoriesArray,
      yearsOfExperience: yearsOfExperience || 0,
      pricePerMinute: pricePerMin,
      bio: bio || null,
      availability: availability || {},
      isApproved: false,
    });

    await redis.del(verificationKey);

    return res.status(201).json({
      success: true,
      message:
        "Your application has been submitted successfully. You will receive an SMS and/or email once your account is approved by our team.",
      astrologer: {
        id: astrologer.id,
        phoneNumber: astrologer.phoneNumber,
        email: astrologer.email,
        fullName: astrologer.fullName,
        photo: astrologer.photo,
        dateOfBirth: astrologer.dateOfBirth,
        gender: astrologer.gender,
        languages: astrologer.languages,
        skills: astrologer.skills,
        categories: astrologer.categories,
        yearsOfExperience: astrologer.yearsOfExperience,
        bio: astrologer.bio,
        pricePerMinute: astrologer.pricePerMinute,
        availability: astrologer.availability,
        isApproved: astrologer.isApproved,
      },
    });
  } catch (error) {
    console.error("Complete registration V2 error:", error);
    return res.status(500).json({
      success: false,
      message: "Failed to complete registration",
      error: error.message,
    });
  }
};

module.exports = {
  sendRegistrationOTPV2,
  verifyOTPV2,
  completeRegistrationV2,
  logoutV2,
};
