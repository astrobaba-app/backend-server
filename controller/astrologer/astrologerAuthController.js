const Astrologer = require("../../model/astrologer/astrologer");
const redis = require("../../config/redis/redis");
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
  normalizeIndianMobile,
} = require("../../services/phoneNumberService");
const {
  createAndQueueOtp,
  verifyQueuedOtp,
} = require("../../services/otpQueueService");

const REGISTRATION_VERIFIED_TTL_SECONDS = 20 * 60;

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

    const astrologer = await Astrologer.findOne({
      where: { phoneNumber: normalizedPhoneNumber },
    });

    if (astrologer && !astrologer.isApproved) {
      return res.status(403).json({
        success: false,
        pendingApproval: true,
        message:
          "Your application is currently under review and has not been approved yet. You will receive an SMS and/or email once approval is completed.",
      });
    }

    await createAndQueueOtp({
      actorType: "astrologer",
      mobile: normalizedPhoneNumber,
    });

    res.status(200).json({
      success: true,
      accountExists: Boolean(astrologer),
      isApproved: astrologer ? astrologer.isApproved : false,
      message: "OTP sent successfully",
      phoneNumber: normalizedPhoneNumber,
    });
  } catch (error) {
    console.error("Send registration OTP error:", error);
    res.status(error.statusCode || 500).json({
      success: false,
      message: error.statusCode === 429 ? error.message : "Failed to send OTP",
      error: error.message,
    });
  }
};

// Verify OTP
const verifyOTP = async (req, res) => {
  try {
    const { phoneNumber } = req.body;
    const otp = String(req.body.otp || "").trim();

    const normalizedPhoneNumber = normalizeIndianMobile(phoneNumber);
    if (!normalizedPhoneNumber || !otp) {
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

    await verifyQueuedOtp({
      actorType: "astrologer",
      mobile: normalizedPhoneNumber,
      otp,
    });
    const astrologer = await Astrologer.findOne({
      where: { phoneNumber: normalizedPhoneNumber },
    });

    if (!astrologer) {
      const verificationKey = `astrologer:registration:verified:${normalizedPhoneNumber}`;
      await redis.setex(verificationKey, REGISTRATION_VERIFIED_TTL_SECONDS, {
        phoneNumber: normalizedPhoneNumber,
        verifiedAt: Date.now(),
      });

      return res.status(200).json({
        success: true,
        requiresRegistration: true,
        message: "Phone number verified successfully",
        phoneNumber: normalizedPhoneNumber,
      });
    }

    if (!astrologer.isApproved) {
      return res.status(403).json({
        success: false,
        pendingApproval: true,
        message:
          "Your application is currently under review and has not been approved yet. You will receive an SMS and/or email once approval is completed.",
      });
    }

    if (!astrologer.isActive) {
      return res.status(403).json({
        success: false,
        message: "Your account has been deactivated. Please contact support.",
      });
    }

    const authPayload = {
      id: astrologer.id,
      role: "astrologer",
      sessionVersion: astrologer.sessionVersion,
    };
    const token = createToken(authPayload);
    const astrologerToken = createMiddlewareToken(authPayload);
    const refreshToken = createRefreshToken(authPayload);

    setTokenCookieAstrologer(res, token, astrologerToken, refreshToken);

    return res.status(200).json({
      success: true,
      message: "Login successful",
      phoneNumber: normalizedPhoneNumber,
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

// Complete registration
const completeRegistration = async (req, res) => {
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
    } = req.body;

    // Validation
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

    // Get photo URL from uploaded file (if any)
    const photo = req.fileUrl || null;

    // Create astrologer
    const astrologer = await Astrologer.create({
      phoneNumber: normalizedPhoneNumber,
      email: normalizedEmail,
      password: null,
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
    await redis.del(verificationKey);

    res.status(201).json({
      success: true,
      message:
        "Your application has been submitted successfully. You will receive an SMS and/or email once your account is approved by our team.",
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

const login = async (req, res) => {
  return res.status(410).json({
    success: false,
    message:
      "Password login has been removed. Please login using mobile OTP.",
  });
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

    const authPayload = {
      id: astrologer.id,
      role: "astrologer",
      sessionVersion: astrologer.sessionVersion,
    };
    const token = createToken(authPayload);
    const astrologerToken = createMiddlewareToken(authPayload);
    const nextRefreshToken = createRefreshToken(authPayload);

    setTokenCookieAstrologer(res, token, astrologerToken, nextRefreshToken);

    return res.status(200).json({
      success: true,
      message: "Token refreshed successfully",
      token,
      astrologerToken,
      refreshToken: nextRefreshToken,
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
};
