const Astrologer = require("../../model/astrologer/astrologer");
const redis = require("../../config/redis/redis");
const sendAstrologerOtpV2 = require("../../services/otpProviders/sendAstrologerOtpV2");
const {
  createToken,
  createMiddlewareToken,
  createRefreshToken,
} = require("../../services/authService");
const setTokenCookieAstrologer = require("../../services/setTokenCookieAstrologer");
const {
  normalizeIndianMobile,
} = require("../../services/firebasePhoneAuthService");

const OTP_TTL_SECONDS_V2 = 10 * 60;
const REGISTRATION_VERIFIED_TTL_SECONDS = 20 * 60;

const generate4DigitOTP = () =>
  Math.floor(1000 + Math.random() * 9000).toString();

const normalizeEmail = (value) => (value || "").trim().toLowerCase();

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

    const otp = generate4DigitOTP();
    const otpKey = `astrologer:v2:otp:${normalizedPhoneNumber}`;

    await redis.setex(otpKey, OTP_TTL_SECONDS_V2, {
      otp,
      phoneNumber: normalizedPhoneNumber,
      createdAt: Date.now(),
    });

    await sendAstrologerOtpV2({
      phoneNumber: normalizedPhoneNumber,
      otp,
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
    return res.status(500).json({
      success: false,
      message: "Failed to send OTP",
      error: error.message,
    });
  }
};

const verifyOTPV2 = async (req, res) => {
  try {
    const phoneNumber = normalizeIndianMobile(req.body.phoneNumber);
    const otp = (req.body.otp || "").trim();

    if (!phoneNumber || !otp) {
      return res.status(400).json({
        success: false,
        message: "Phone number and OTP are required",
      });
    }

    if (!/^\d{4}$/.test(otp)) {
      return res.status(400).json({
        success: false,
        message: "Please provide a valid 4-digit OTP",
      });
    }

    const otpKey = `astrologer:v2:otp:${phoneNumber}`;
    const storedData = await redis.get(otpKey);

    if (!storedData) {
      return res.status(400).json({
        success: false,
        message: "OTP not found or expired. Please request a new OTP",
      });
    }

    const otpData =
      typeof storedData === "string" ? JSON.parse(storedData) : storedData;
    if (otpData.otp !== otp) {
      return res.status(400).json({
        success: false,
        message: "Invalid OTP",
      });
    }

    await redis.del(otpKey);

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

    const authPayload = { id: astrologer.id, role: "astrologer" };
    const token = createToken(authPayload);
    const astrologerToken = createMiddlewareToken(authPayload);
    const refreshToken = createRefreshToken(authPayload);

    setTokenCookieAstrologer(res, token, astrologerToken, refreshToken);

    return res.status(200).json({
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
    });
  } catch (error) {
    console.error("Verify OTP V2 error:", error);
    return res.status(500).json({
      success: false,
      message: "Failed to verify OTP",
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
};
