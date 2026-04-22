const Astrologer = require("../../model/astrologer/astrologer");
const bcrypt = require("bcryptjs");
const jwt = require("jsonwebtoken");
const crypto = require("crypto");
const redis = require("../../config/redis/redis");
const handleSendAuthOTP = require("../../mobileService/userAuthOtp");
const { sendAstrologerPasswordResetOTPEmail } = require("../../emailService/authEmail");
const {
  createToken,
  createMiddlewareToken,
  createRefreshToken,
  validateRefreshToken,
  resolveActorType,
} = require("../../services/authService");
const clearTokenCookieAstrologer = require("../../services/clearTokenCookieAstrologer");
const setTokenCookieAstrologer = require("../../services/setTokenCookieAstrologer");
const Follow = require("../../model/follow/follow");
const notificationService = require("../../services/notificationService");
const {
  verifyFirebasePhoneToken,
  normalizeIndianMobile,
} = require("../../services/firebasePhoneAuthService");
const {
  checkAndConsumeFirebaseOtpQuota,
} = require("../../services/firebaseOtpRateLimitService");

const generateOTP = () => {
  return Math.floor(100000 + Math.random() * 900000).toString();
};

const PASSWORD_RESET_OTP_TTL_SECONDS = 600;
const PASSWORD_RESET_TOKEN_TTL_SECONDS = 600;

const normalizeForgotMethod = (value) => (value || "").toLowerCase().trim();

const normalizePhoneNumber = (value) => (value || "").replace(/\D/g, "").trim();

const normalizeEmail = (value) => (value || "").trim().toLowerCase();

const sendRegistrationOTP = async (req, res) => {
  try {
    const { phoneNumber } = req.body;

    const normalizedPhoneNumber = normalizeIndianMobile(phoneNumber);
    if (!normalizedPhoneNumber) {
      return res.status(400).json({
        success: false,
        message: "Please provide a valid 10-digit phone number",
      });
    }

    const otpRateLimit = await checkAndConsumeFirebaseOtpQuota({
      mobile: normalizedPhoneNumber,
      scope: "astrologer-signup",
    });

    if (!otpRateLimit.allowed) {
      return res.status(429).json({
        success: false,
        message: `Too many OTP requests. Please try again in ${otpRateLimit.retryAfterSeconds} seconds.`,
        error: "otp-rate-limit-exceeded",
        limit: otpRateLimit.limit,
        windowSeconds: otpRateLimit.windowSeconds,
        retryAfterSeconds: otpRateLimit.retryAfterSeconds,
      });
    }

    // Twilio-based OTP flow retained for rollback/reference.
    // const otp = generateOTP();
    // const otpKey = `astrologer:otp:${normalizedPhoneNumber}`;
    // await redis.setex(otpKey, 600, {
    //   otp,
    //   type: "registration",
    //   createdAt: Date.now(),
    // });
    // await handleSendAuthOTP(normalizedPhoneNumber, otp);

    res.status(200).json({
      success: true,
      message: "Use Firebase phone authentication to receive OTP",
      phoneNumber: normalizedPhoneNumber,
      otpRateLimit: {
        limit: otpRateLimit.limit,
        windowSeconds: otpRateLimit.windowSeconds,
        remaining: otpRateLimit.remaining,
      },
    });
  } catch (error) {
    console.error("Send registration OTP error:", error);
    res.status(500).json({
      success: false,
      message: "Failed to send OTP",
      error: error.message,
    });
  }
};

// Verify OTP
const verifyOTP = async (req, res) => {
  try {
    const { phoneNumber, firebaseIdToken } = req.body;

    if (!phoneNumber || !firebaseIdToken) {
      return res.status(400).json({
        success: false,
        message: "Phone number and firebaseIdToken are required",
      });
    }

    const verificationResult = await verifyFirebasePhoneToken(
      firebaseIdToken,
      phoneNumber
    );

    // Legacy Redis OTP verification retained for rollback/reference.
    // const { otp } = req.body;
    // const otpKey = `astrologer:otp:${phoneNumber}`;
    // const storedData = await redis.get(otpKey);
    // if (!storedData) {
    //   return res.status(400).json({
    //     success: false,
    //     message: "OTP not found or expired. Please request a new OTP",
    //   });
    // }
    // const otpData = typeof storedData === "string" ? JSON.parse(storedData) : storedData;
    // if (otpData.otp !== otp) {
    //   return res.status(400).json({
    //     success: false,
    //     message: "Invalid OTP",
    //   });
    // }
    // await redis.del(otpKey);

    res.status(200).json({
      success: true,
      message: "Phone number verified successfully",
      phoneNumber: verificationResult.mobile,
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

// Complete registration
const completeRegistration = async (req, res) => {
  try {
    const {
      phoneNumber,
      email,
      password,
      fullName,
      dateOfBirth,
      gender,
      languages,
      skills,
      categories,
      yearsOfExperience,
      pricePerMinute,
      bio,
    } = req.body;

    // Validation
    if (!phoneNumber || !email || !password || !fullName) {
      return res.status(400).json({
        success: false,
        message: "Phone number, email, password, and full name are required",
      });
    }

    // Ensure languages and skills are arrays
    let languagesArray = languages;
    if (typeof languages === 'string') {
      try {
        languagesArray = JSON.parse(languages);
      } catch (e) {
        languagesArray = languages.split(',').map(lang => lang.trim());
      }
    }
    if (!Array.isArray(languagesArray)) {
      languagesArray = [languagesArray];
    }

    let skillsArray = skills;
    if (typeof skills === 'string') {
      try {
        skillsArray = JSON.parse(skills);
      } catch (e) {
        skillsArray = skills.split(',').map(skill => skill.trim());
      }
    }
    if (!Array.isArray(skillsArray)) {
      skillsArray = [skillsArray];
    }

    // Ensure categories is an array
    let categoriesArray = categories;
    if (typeof categories === 'string') {
      try {
        categoriesArray = JSON.parse(categories);
      } catch (e) {
        categoriesArray = categories.split(',').map(cat => cat.trim());
      }
    }
    if (!Array.isArray(categoriesArray)) {
      categoriesArray = [categoriesArray];
    }

    if (!languagesArray || languagesArray.length === 0) {
      return res.status(400).json({
        success: false,
        message: "Please select at least one language",
      });
    }

    if (!skillsArray || skillsArray.length === 0) {
      return res.status(400).json({
        success: false,
        message: "Please select at least one skill",
      });
    }

    if (!categoriesArray || categoriesArray.length === 0) {
      return res.status(400).json({
        success: false,
        message: "Please select at least one consultation category",
      });
    }

    // Validate categories against enum values
    const validCategories = ['Love', 'Relationship', 'Education', 'Health', 'Career', 'Finance', 'Marriage', 'Family', 'Business', 'Legal', 'Travel', 'Spiritual'];
    const invalidCategories = categoriesArray.filter(cat => !validCategories.includes(cat));
    if (invalidCategories.length > 0) {
      return res.status(400).json({
        success: false,
        message: `Invalid categories: ${invalidCategories.join(', ')}. Valid categories are: ${validCategories.join(', ')}`,
      });
    }

    // Validate gender if provided
    if (gender) {
      const validGenders = ['Male', 'Female', 'Other'];
      if (!validGenders.includes(gender)) {
        return res.status(400).json({
          success: false,
          message: `Invalid gender: ${gender}. Valid genders are: Male, Female, Other`,
        });
      }
    }

    // Validate pricePerMinute
    const pricePerMin = pricePerMinute ? parseFloat(pricePerMinute) : 0.0;
    if (pricePerMin < 0) {
      return res.status(400).json({
        success: false,
        message: "Price per minute cannot be negative",
      });
    }

    // Check if astrologer already exists
    const existingAstrologer = await Astrologer.findOne({
      where: { phoneNumber },
    });

    if (existingAstrologer) {
      return res.status(400).json({
        success: false,
        message: "Astrologer with this phone number already exists",
      });
    }

    const existingEmail = await Astrologer.findOne({
      where: { email },
    });

    if (existingEmail) {
      return res.status(400).json({
        success: false,
        message: "Email already registered",
      });
    }

    // Hash password
    const hashedPassword = await bcrypt.hash(password, 10);

    // Get photo URL from uploaded file (if any)
    const photo = req.fileUrl || null;

    // Create astrologer
    const astrologer = await Astrologer.create({
      phoneNumber,
      email,
      password: hashedPassword,
      fullName,
      photo,
      dateOfBirth: dateOfBirth || null,
      gender: gender || null,
      languages: languagesArray,
      skills: skillsArray,
      categories: categoriesArray,
      yearsOfExperience: yearsOfExperience || 0,
      pricePerMinute: pricePerMin,
      bio: bio || null,
      isApproved: false,
    });

    res.status(201).json({
      success: true,
      message: "Registration successful. Your profile is pending approval.",
      astrologer: {
        id: astrologer.id,
        phoneNumber: astrologer.phoneNumber,
        email: astrologer.email,
        fullName: astrologer.fullName,
        photo: astrologer.photo,
        gender: astrologer.gender,
        isApproved: astrologer.isApproved,
        languages: astrologer.languages,
        skills: astrologer.skills,
        categories: astrologer.categories,
        pricePerMinute: astrologer.pricePerMinute,
      },
    });
  } catch (error) {
    console.error("Complete registration error:", error);
    res.status(500).json({
      success: false,
      message: "Failed to complete registration",
      error: error.message,
    });
  }
};

// Login with email and password
const login = async (req, res) => {
  try {
    const { email, password } = req.body;

    if (!email || !password) {
      return res.status(400).json({
        success: false,
        message: "Email and password are required",
      });
    }

    // Find astrologer
    const astrologer = await Astrologer.findOne({ where: { email } });

    if (!astrologer) {
      return res.status(401).json({
        success: false,
        message: "Invalid email or password",
      });
    }



    // Check password
    const isPasswordValid = await bcrypt.compare(password, astrologer.password);

    if (!isPasswordValid) {
      return res.status(401).json({
        success: false,
        message: "Invalid email or password",
      });
    }

  if (!astrologer.isApproved) {
      return res.status(403).json({
        success: false,
        message: "Your account has been Pending approval. Please wait for admin approval.",
      });
    }

    // Check if account is active
    if (!astrologer.isActive) {
      return res.status(403).json({
        success: false,
        message: "Your account has been deactivated. Please contact support.",
      });
    }

    // Generate JWT token with explicit astrologer role
    const authPayload = { id: astrologer.id, role: "astrologer" };
    const token = createToken(authPayload);
    const astrologerToken = createMiddlewareToken(authPayload);
    const refreshToken = createRefreshToken(authPayload);
  
    setTokenCookieAstrologer(res, token, astrologerToken, refreshToken);


    res.status(200).json({
      success: true,
      message: "Login successful",
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
      astrologerToken, // Add this for localStorage
    });
  } catch (error) {
    console.error("Login error:", error);
    res.status(500).json({
      success: false,
      message: "Failed to login",
      error: error.message,
    });
  }
};

// Get profile
const getProfile = async (req, res) => {
  try {
    const astrologerId = req.user.id;

    const astrologer = await Astrologer.findByPk(astrologerId, {
      attributes: { exclude: ["password"] },
    });

    if (!astrologer) {
      return res.status(404).json({
        success: false,
        message: "Astrologer not found",
      });
    }

    res.status(200).json({
      success: true,
      astrologer,
    });
  } catch (error) {
    console.error("Get profile error:", error);
    res.status(500).json({
      success: false,
      message: "Failed to fetch profile",
      error: error.message,
    });
  }
};

// Update profile
const updateProfile = async (req, res) => {
  try {
    const astrologerId = req.user.id;
    const {
      fullName,
      dateOfBirth,
      gender,
      languages,
      skills,
      categories,
      yearsOfExperience,
      bio,
      pricePerMinute,
      availability,
    } = req.body;

    const astrologer = await Astrologer.findByPk(astrologerId);

    if (!astrologer) {
      return res.status(404).json({
        success: false,
        message: "Astrologer not found",
      });
    }

    const toStringArray = (value) => {
      if (value === undefined || value === null) return undefined;
      if (Array.isArray(value)) {
        return value
          .map((item) => (item === undefined || item === null ? '' : String(item).trim()))
          .filter(Boolean);
      }

      if (typeof value === 'string') {
        const trimmed = value.trim();
        if (!trimmed) return [];

        if (trimmed.startsWith('[') && trimmed.endsWith(']')) {
          try {
            const parsed = JSON.parse(trimmed);
            if (Array.isArray(parsed)) {
              return parsed
                .map((item) => (item === undefined || item === null ? '' : String(item).trim()))
                .filter(Boolean);
            }
          } catch (e) {
            // Fall through to comma-separated parsing
          }
        }

        return trimmed
          .split(',')
          .map((item) => item.trim())
          .filter(Boolean);
      }

      return [String(value).trim()].filter(Boolean);
    };

    // Update fields
    const updateData = {};
    if (fullName) updateData.fullName = fullName;
    if (req.fileUrl) updateData.photo = req.fileUrl;
    if (dateOfBirth) updateData.dateOfBirth = dateOfBirth;
    if (gender) {
      // Validate gender
      const validGenders = ['Male', 'Female', 'Other'];
      if (!validGenders.includes(gender)) {
        return res.status(400).json({
          success: false,
          message: `Invalid gender: ${gender}. Valid genders are: Male, Female, Other`,
        });
      }
      updateData.gender = gender;
    }
    if (languages !== undefined) {
      updateData.languages = toStringArray(languages) || [];
    }

    if (skills !== undefined) {
      updateData.skills = toStringArray(skills) || [];
    }

    if (categories !== undefined) {
      // Validate categories
      const validCategories = ['Love', 'Relationship', 'Education', 'Health', 'Career', 'Finance', 'Marriage', 'Family', 'Business', 'Legal', 'Travel', 'Spiritual'];
      const categoryArray = toStringArray(categories) || [];
      const invalidCategories = categoryArray.filter(cat => !validCategories.includes(cat));
      
      if (invalidCategories.length > 0) {
        return res.status(400).json({
          success: false,
          message: `Invalid categories: ${invalidCategories.join(', ')}. Valid categories are: ${validCategories.join(', ')}`,
        });
      }
      
      updateData.categories = categoryArray;
    }
    if (yearsOfExperience !== undefined) updateData.yearsOfExperience = yearsOfExperience;
    if (bio !== undefined) updateData.bio = bio;
    if (pricePerMinute !== undefined) updateData.pricePerMinute = pricePerMinute;
    if (availability) updateData.availability = availability;
    if (req.fileUrl) updateData.photo = req.fileUrl;  

    await astrologer.update(updateData);

    res.status(200).json({
      success: true,
      message: "Profile updated successfully",
      astrologer: {
        id: astrologer.id,
        fullName: astrologer.fullName,
        photo: astrologer.photo,
        dateOfBirth: astrologer.dateOfBirth,
        gender: astrologer.gender,
        languages: astrologer.languages,
        skills: astrologer.skills,
        categories: astrologer.categories,
        yearsOfExperience: astrologer.yearsOfExperience,
        bio: astrologer.bio,
        pricePerMinute: parseFloat(astrologer.pricePerMinute),
        availability: astrologer.availability,
      },
    });
  } catch (error) {
    console.error("Update profile error:", error);
    res.status(500).json({
      success: false,
      message: "Failed to update profile",
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
    if (!refreshPayload || resolveActorType(refreshPayload) !== "astrologer") {
      clearTokenCookieAstrologer(res);
      return res.status(401).json({
        success: false,
        message: "Invalid refresh token",
      });
    }

    const astrologer = await Astrologer.findByPk(refreshPayload.id);
    if (!astrologer) {
      clearTokenCookieAstrologer(res);
      return res.status(401).json({
        success: false,
        message: "Astrologer not found",
      });
    }

    if (!astrologer.isApproved || !astrologer.isActive) {
      clearTokenCookieAstrologer(res);
      return res.status(403).json({
        success: false,
        message: "Astrologer account is not active",
      });
    }

    const authPayload = { id: astrologer.id, role: "astrologer" };
    const token = createToken(authPayload);
    const astrologerToken = createMiddlewareToken(authPayload);
    const nextRefreshToken = createRefreshToken(authPayload);

    setTokenCookieAstrologer(res, token, astrologerToken, nextRefreshToken);

    return res.status(200).json({
      success: true,
      message: "Token refreshed successfully",
      token,
      astrologerToken,
    });
  } catch (error) {
    console.error("Astrologer refresh token error:", error);
    return res.status(500).json({
      success: false,
      message: "Failed to refresh token",
      error: error.message,
    });
  }
};

// Logout
const logout = async (req, res) => {
  try {
    clearTokenCookieAstrologer(res);

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

// Toggle online/offline status
const toggleOnlineStatus = async (req, res) => {
  try {
    const astrologerId = req.user.id;

    const astrologer = await Astrologer.findByPk(astrologerId);

    if (!astrologer) {
      return res.status(404).json({
        success: false,
        message: "Astrologer not found",
      });
    }

    // Toggle the status
    const newStatus = !astrologer.isOnline;
    await astrologer.update({ isOnline: newStatus });

    // Send push notification to followers when astrologer goes online
    if (newStatus === true) {
      try {
        // Get all followers of this astrologer
        const followers = await Follow.findAll({
          where: { astrologerId },
          attributes: ['userId'],
        });

        const followerIds = followers.map(f => f.userId);

        if (followerIds.length > 0) {
          // Send notification to each follower
          await Promise.all(
            followerIds.map(userId =>
              notificationService.sendToUser(userId, {
                type: 'astrologer_online',
                title: `${astrologer.fullName} is now Online! 🟢`,
                message: `${astrologer.fullName} is available for consultation. Connect now!`,
                data: {
                  astrologerId: astrologer.id,
                  astrologerName: astrologer.fullName,
                  astrologerPhoto: astrologer.photo || '',
                },
                actionUrl: `/astrologer/${astrologer.id}`,
                priority: 'high',
                sendPush: true,
              })
            )
          );
          console.log(`[Astrologer Online] Sent notifications to ${followerIds.length} followers`);
        }
      } catch (notifError) {
        console.error('Error sending follower notifications:', notifError);
        // Don't fail the request if notifications fail
      }
    }

    res.status(200).json({
      success: true,
      message: `Status changed to ${newStatus ? "online" : "offline"}`,
      isOnline: newStatus,
    });
  } catch (error) {
    console.error("Toggle online status error:", error);
    res.status(500).json({
      success: false,
      message: "Failed to toggle online status",
      error: error.message,
    });
  }
};

// Set online status (go online)
const goOnline = async (req, res) => {
  try {
    const astrologerId = req.user.id;

    const astrologer = await Astrologer.findByPk(astrologerId);

    if (!astrologer) {
      return res.status(404).json({
        success: false,
        message: "Astrologer not found",
      });
    }

    await astrologer.update({ isOnline: true });

    // Send push notification to followers
    try {
      // Get all followers of this astrologer
      const followers = await Follow.findAll({
        where: { astrologerId },
        attributes: ['userId'],
      });

      const followerIds = followers.map(f => f.userId);

      if (followerIds.length > 0) {
        // Send notification to each follower
        await Promise.all(
          followerIds.map(userId =>
            notificationService.sendToUser(userId, {
              type: 'astrologer_online',
              title: `${astrologer.fullName} is now Online! 🟢`,
              message: `${astrologer.fullName} is available for consultation. Connect now!`,
              data: {
                astrologerId: astrologer.id,
                astrologerName: astrologer.fullName,
                astrologerPhoto: astrologer.photo || '',
              },
              actionUrl: `/astrologer/${astrologer.id}`,
              priority: 'high',
              sendPush: true,
            })
          )
        );
        console.log(`[Astrologer Online] Sent notifications to ${followerIds.length} followers`);
      }
    } catch (notifError) {
      console.error('Error sending follower notifications:', notifError);
      // Don't fail the request if notifications fail
    }

    res.status(200).json({
      success: true,
      message: "You are now online",
      isOnline: true,
    });
  } catch (error) {
    console.error("Go online error:", error);
    res.status(500).json({
      success: false,
      message: "Failed to go online",
      error: error.message,
    });
  }
};

// Set offline status (go offline)
const goOffline = async (req, res) => {
  try {
    const astrologerId = req.user.id;

    await Astrologer.update(
      { isOnline: false },
      { where: { id: astrologerId } }
    );

    res.status(200).json({
      success: true,
      message: "You are now offline",
      isOnline: false,
    });
  } catch (error) {
    console.error("Go offline error:", error);
    res.status(500).json({
      success: false,
      message: "Failed to go offline",
      error: error.message,
    });
  }
};

// Get online status
const getOnlineStatus = async (req, res) => {
  try {
    const astrologerId = req.user.id;

    const astrologer = await Astrologer.findByPk(astrologerId, {
      attributes: ["id", "fullName", "isOnline"],
    });

    if (!astrologer) {
      return res.status(404).json({
        success: false,
        message: "Astrologer not found",
      });
    }

    res.status(200).json({
      success: true,
      isOnline: astrologer.isOnline,
    });
  } catch (error) {
    console.error("Get online status error:", error);
    res.status(500).json({
      success: false,
      message: "Failed to get online status",
      error: error.message,
    });
  }
};

const sendForgotPasswordOTP = async (req, res) => {
  try {
    const method = normalizeForgotMethod(req.body.method);
    const phoneNumber = normalizePhoneNumber(req.body.phoneNumber);
    const email = normalizeEmail(req.body.email);

    if (!["mobile", "email"].includes(method)) {
      return res.status(400).json({
        success: false,
        message: "Please select a valid OTP method",
      });
    }

    let astrologer;
    let recipient;

    if (method === "mobile") {
      if (!/^\d{10}$/.test(phoneNumber)) {
        return res.status(400).json({
          success: false,
          message: "Please provide a valid 10-digit mobile number",
        });
      }

      astrologer = await Astrologer.findOne({ where: { phoneNumber } });
      recipient = phoneNumber;
    } else {
      if (!/^\S+@\S+\.\S+$/.test(email)) {
        return res.status(400).json({
          success: false,
          message: "Please provide a valid email address",
        });
      }

      astrologer = await Astrologer.findOne({ where: { email } });
      recipient = email;
    }

    if (!astrologer) {
      return res.status(404).json({
        success: false,
        message: "Astrologer account not found",
      });
    }

    if (!astrologer.isActive) {
      return res.status(403).json({
        success: false,
        message: "Your account is deactivated. Please contact support.",
      });
    }

    const otp = generateOTP();
    const otpKey = `astrologer:forgot-password:otp:${method}:${recipient}`;
    const verifiedKey = `astrologer:forgot-password:verified:${method}:${recipient}`;

    await redis.del(verifiedKey);
    await redis.setex(otpKey, PASSWORD_RESET_OTP_TTL_SECONDS, {
      otp,
      astrologerId: astrologer.id,
      method,
      recipient,
      createdAt: Date.now(),
    });

    if (method === "mobile") {
      await handleSendAuthOTP(phoneNumber, otp);
    } else {
      await sendAstrologerPasswordResetOTPEmail({
        to: astrologer.email,
        fullName: astrologer.fullName,
        otp,
      });
    }

    return res.status(200).json({
      success: true,
      message: `OTP sent successfully to your ${method === "mobile" ? "mobile number" : "email"}`,
    });
  } catch (error) {
    console.error("Send forgot password OTP error:", error);
    return res.status(500).json({
      success: false,
      message: "Failed to send OTP",
      error: error.message,
    });
  }
};

const verifyForgotPasswordOTP = async (req, res) => {
  try {
    const method = normalizeForgotMethod(req.body.method);
    const otp = (req.body.otp || "").trim();
    const phoneNumber = normalizePhoneNumber(req.body.phoneNumber);
    const email = normalizeEmail(req.body.email);

    if (!["mobile", "email"].includes(method)) {
      return res.status(400).json({
        success: false,
        message: "Please select a valid OTP method",
      });
    }

    if (!/^\d{6}$/.test(otp)) {
      return res.status(400).json({
        success: false,
        message: "Please provide a valid 6-digit OTP",
      });
    }

    const recipient = method === "mobile" ? phoneNumber : email;

    if (!recipient) {
      return res.status(400).json({
        success: false,
        message: `Please provide your ${method === "mobile" ? "mobile number" : "email"}`,
      });
    }

    const otpKey = `astrologer:forgot-password:otp:${method}:${recipient}`;
    const storedData = await redis.get(otpKey);

    if (!storedData) {
      return res.status(400).json({
        success: false,
        message: "OTP not found or expired. Please request a new OTP",
      });
    }

    const otpData = typeof storedData === "string" ? JSON.parse(storedData) : storedData;

    if (otpData.otp !== otp) {
      return res.status(400).json({
        success: false,
        message: "Invalid OTP",
      });
    }

    await redis.del(otpKey);

    const resetToken = crypto.randomBytes(32).toString("hex");
    const resetTokenKey = `astrologer:forgot-password:token:${resetToken}`;
    await redis.setex(resetTokenKey, PASSWORD_RESET_TOKEN_TTL_SECONDS, {
      astrologerId: otpData.astrologerId,
      method,
      recipient,
      verifiedAt: Date.now(),
    });

    return res.status(200).json({
      success: true,
      message: "OTP verified successfully",
      resetToken,
    });
  } catch (error) {
    console.error("Verify forgot password OTP error:", error);
    return res.status(500).json({
      success: false,
      message: "Failed to verify OTP",
      error: error.message,
    });
  }
};

const resetForgotPassword = async (req, res) => {
  try {
    const resetToken = (req.body.resetToken || "").trim();
    const newPassword = (req.body.newPassword || "").trim();
    const confirmPassword = (req.body.confirmPassword || "").trim();

    if (!resetToken) {
      return res.status(400).json({
        success: false,
        message: "Reset token is required",
      });
    }

    if (newPassword.length < 6) {
      return res.status(400).json({
        success: false,
        message: "New password must be at least 6 characters long",
      });
    }

    if (newPassword !== confirmPassword) {
      return res.status(400).json({
        success: false,
        message: "Password and confirm password do not match",
      });
    }

    const resetTokenKey = `astrologer:forgot-password:token:${resetToken}`;
    const tokenData = await redis.get(resetTokenKey);

    if (!tokenData) {
      return res.status(400).json({
        success: false,
        message: "Reset session expired. Please verify OTP again",
      });
    }

    const parsedTokenData = typeof tokenData === "string" ? JSON.parse(tokenData) : tokenData;

    const astrologer = await Astrologer.findByPk(parsedTokenData.astrologerId);
    if (!astrologer) {
      return res.status(404).json({
        success: false,
        message: "Astrologer account not found",
      });
    }

    const hashedPassword = await bcrypt.hash(newPassword, 10);
    await astrologer.update({ password: hashedPassword });

    await redis.del(resetTokenKey);

    return res.status(200).json({
      success: true,
      message: "Password reset successful. Please login with your new password",
    });
  } catch (error) {
    console.error("Reset forgot password error:", error);
    return res.status(500).json({
      success: false,
      message: "Failed to reset password",
      error: error.message,
    });
  }
};

module.exports = {
  sendRegistrationOTP,
  verifyOTP,
  completeRegistration,
  login,
  refreshAccessToken,
  getProfile,
  updateProfile,
  logout,
  toggleOnlineStatus,
  goOnline,
  goOffline,
  getOnlineStatus,
  sendForgotPasswordOTP,
  verifyForgotPasswordOTP,
  resetForgotPassword,
};
