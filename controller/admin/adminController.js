const Admin = require("../../model/admin/admin");
const Astrologer = require("../../model/astrologer/astrologer");
const User = require("../../model/user/userAuth");
const bcrypt = require("bcryptjs");
const jwt = require("jsonwebtoken");
const {
  sendAstrologerApprovalEmail,
  sendAstrologerRejectionEmail,
} = require("../../emailService/adminApproval");
const { createMiddlewareToken, createToken } = require("../../services/authService");
const setTokenCookie = require("../../services/setTokenCookie");
const clearTokenCookie = require("../../services/clearTokenCookie");
const notificationService = require("../../services/notificationService");


const register = async (req, res) => {
  try {
    const { name, email, password } = req.body;

    if (!name || !email || !password) {
      return res.status(400).json({
        success: false,
        message: "Name, email, and password are required",
      });
    }

    // Check if admin already exists
    const existingAdmin = await Admin.findOne({ where: { email } });

    if (existingAdmin) {
      return res.status(400).json({
        success: false,
        message: "Admin with this email already exists",
      });
    }

    // Hash password
    const hashedPassword = await bcrypt.hash(password, 10);

    // Create admin with default role "admin"
    const admin = await Admin.create({
      name,
      email,
      password: hashedPassword,
      role: "admin", // Default role
      isApproved: false,
    });

    res.status(201).json({
      success: true,
      message: "Admin registered successfully",
      admin: {
        id: admin.id,
        name: admin.name,
        email: admin.email,
        role: admin.role,
        isApproved: admin.isApproved,
      },
    });
  } catch (error) {
    console.error("Admin registration error:", error);
    res.status(500).json({
      success: false,
      message: "Failed to register admin",
      error: error.message,
    });
  }
};

// Login admin
const login = async (req, res) => {
  try {
    const { email, password } = req.body;

    if (!email || !password) {
      return res.status(400).json({
        success: false,
        message: "Email and password are required",
      });
    }

    // Find admin
    const admin = await Admin.findOne({ where: { email } });

    if (!admin) {
      return res.status(401).json({
        success: false,
        message: "Invalid email or password",
      });
    }

    // Check password
    const isPasswordValid = await bcrypt.compare(password, admin.password);

    if (!isPasswordValid) {
      return res.status(401).json({
        success: false,
        message: "Invalid email or password",
      });
    }

    // Check if admin is active
    if (!admin.isActive) {
      return res.status(403).json({
        success: false,
        message: "Your account has been deactivated",
      });
    }

    // Check if admin is approved
    if (!admin.isApproved) {
      return res.status(403).json({
        success: false,
        message: "Your account is not approved yet",
      });
    }

    // Check if 2FA is enabled
    if (admin.twoFactorEnabled) {
      return res.status(200).json({
        success: true,
        requires2FA: true,
        tempToken: jwt.sign({ adminId: admin.id }, process.env.JWT_SECRET, { expiresIn: '5m' }),
        message: "Please enter your 2FA code",
      });
    }

    // Update last login
    await admin.update({ lastLogin: new Date() });
    
    const token = createToken(admin);
    const middlewareToken = createMiddlewareToken(admin);

    setTokenCookie(res, token, middlewareToken);

    res.status(200).json({
      success: true,
      message: "Login successful",
      admin: {
        id: admin.id,
        name: admin.name,
        email: admin.email,
        role: admin.role,
        lastLogin: admin.lastLogin,
        twoFactorEnabled: admin.twoFactorEnabled,
      },
      token,
    });
  } catch (error) {
    console.error("Admin login error:", error);
    res.status(500).json({
      success: false,
      message: "Failed to login",
      error: error.message,
    });
  }
};

const verify2FALogin = async (req, res) => {
  try {
    const { tempToken, code } = req.body;

    if (!tempToken || !code) {
      return res.status(400).json({
        success: false,
        message: "Temporary token and verification code are required",
      });
    }

    // Verify temp token
    let decoded;
    try {
      decoded = jwt.verify(tempToken, process.env.JWT_SECRET);
    } catch (error) {
      return res.status(401).json({
        success: false,
        message: "Invalid or expired token",
      });
    }

    // Find admin
    const admin = await Admin.findByPk(decoded.adminId);

    if (!admin) {
      return res.status(404).json({
        success: false,
        message: "Admin not found",
      });
    }

    if (!admin.twoFactorEnabled || !admin.twoFactorSecret) {
      return res.status(400).json({
        success: false,
        message: "2FA is not enabled for this account",
      });
    }

    // Verify TOTP code
    const speakeasy = require('speakeasy');
    const verified = speakeasy.totp.verify({
      secret: admin.twoFactorSecret,
      encoding: 'base32',
      token: code,
      window: 2,
    });

    if (!verified) {
      return res.status(401).json({
        success: false,
        message: "Invalid verification code",
      });
    }

    // Update last login
    await admin.update({ lastLogin: new Date() });
    
    const token = createToken(admin);
    const middlewareToken = createMiddlewareToken(admin);

    setTokenCookie(res, token, middlewareToken);

    res.status(200).json({
      success: true,
      message: "Login successful",
      admin: {
        id: admin.id,
        name: admin.name,
        email: admin.email,
        role: admin.role,
        lastLogin: admin.lastLogin,
        twoFactorEnabled: admin.twoFactorEnabled,
      },
      token,
    });
  } catch (error) {
    console.error("2FA verification error:", error);
    res.status(500).json({
      success: false,
      message: "Failed to verify 2FA code",
      error: error.message,
    });
  }
};

const getAllAdmins = async (req, res) => {
  try {
    const { page = 1, limit = 20, role, isActive } = req.query;

    const where = {};
    if (role) where.role = role;
    if (isActive !== undefined) where.isActive = isActive === "true";

    const offset = (page - 1) * limit;

    const { rows: admins, count } = await Admin.findAndCountAll({
      where,
      limit: parseInt(limit),
      offset: parseInt(offset),
      order: [["createdAt", "DESC"]],
      attributes: { exclude: ["password"] },
    });

    res.status(200).json({
      success: true,
      admins,
      pagination: {
        total: count,
        page: parseInt(page),
        limit: parseInt(limit),
        totalPages: Math.ceil(count / limit),
      },
    });
  } catch (error) {
    console.error("Get all admins error:", error);
    res.status(500).json({
      success: false,
      message: "Failed to fetch admins",
      error: error.message,
    });
  }
};

// Change admin role (masteradmin only)
const changeAdminRole = async (req, res) => {
  try {
    const { adminId } = req.params;
    const { role } = req.body;

    if (!role || !["admin", "superadmin", "masteradmin"].includes(role)) {
      return res.status(400).json({
        success: false,
        message: "Valid role is required (admin, superadmin, or masteradmin)",
      });
    }

    const admin = await Admin.findByPk(adminId);

    if (!admin) {
      return res.status(404).json({
        success: false,
        message: "Admin not found",
      });
    }

    // Prevent changing own role
    if (admin.id === req.admin.id) {
      return res.status(403).json({
        success: false,
        message: "You cannot change your own role",
      });
    }

    await admin.update({ role });

    res.status(200).json({
      success: true,
      message: "Admin role updated successfully",
      admin: {
        id: admin.id,
        name: admin.name,
        email: admin.email,
        role: admin.role,
      },
    });
  } catch (error) {
    console.error("Change admin role error:", error);
    res.status(500).json({
      success: false,
      message: "Failed to change admin role",
      error: error.message,
    });
  }
};

const getAllUsers = async (req, res) => {
  try {
    const { page = 1, limit = 20 } = req.query;
    const offset = (page - 1) * limit;

    const { rows: users, count } = await User.findAndCountAll({
      limit: parseInt(limit),
      offset: parseInt(offset),
      order: [["createdAt", "DESC"]],
      attributes: { exclude: ["password"] },
    });

    res.status(200).json({
      success: true,
      users,
      pagination: {
        total: count,
        page: parseInt(page),
        limit: parseInt(limit),
        totalPages: Math.ceil(count / limit),
      },
    });
  } catch (error) {
    console.error("Get all users error:", error);
    res.status(500).json({
      success: false,
      message: "Failed to fetch users",
      error: error.message,
    });
  }
};

const getAllAstrologers = async (req, res) => {
  try {
    const { page = 1, limit = 20, isApproved, isActive } = req.query;

    const where = {};
    if (isApproved !== undefined) where.isApproved = isApproved === "true";
    if (isActive !== undefined) where.isActive = isActive === "true";

    const offset = (page - 1) * limit;

    const { rows: astrologers, count } = await Astrologer.findAndCountAll({
      where,
      limit: parseInt(limit),
      offset: parseInt(offset),
      order: [["createdAt", "DESC"]],
      attributes: { exclude: ["password"] },
    });

    res.status(200).json({
      success: true,
      astrologers,
      pagination: {
        total: count,
        page: parseInt(page),
        limit: parseInt(limit),
        totalPages: Math.ceil(count / limit),
      },
    });
  } catch (error) {
    console.error("Get all astrologers error:", error);
    res.status(500).json({
      success: false,
      message: "Failed to fetch astrologers",
      error: error.message,
    });
  }
};

const getPendingAstrologers = async (req, res) => {
  try {
    const { page = 1, limit = 20 } = req.query;
    const offset = (page - 1) * limit;

    const { rows: astrologers, count } = await Astrologer.findAndCountAll({
      where: { isApproved: false, isActive: true },
      limit: parseInt(limit),
      offset: parseInt(offset),
      order: [["createdAt", "ASC"]],
      attributes: { exclude: ["password"] },
    });

    res.status(200).json({
      success: true,
      astrologers,
      pagination: {
        total: count,
        page: parseInt(page),
        limit: parseInt(limit),
        totalPages: Math.ceil(count / limit),
      },
    });
  } catch (error) {
    console.error("Get pending astrologers error:", error);
    res.status(500).json({
      success: false,
      message: "Failed to fetch pending astrologers",
      error: error.message,
    });
  }
};

const approveAstrologer = async (req, res) => {
  try {
    const { astrologerId } = req.params;

    const astrologer = await Astrologer.findByPk(astrologerId);

    if (!astrologer) {
      return res.status(404).json({
        success: false,
        message: "Astrologer not found",
      });
    }

    if (astrologer.isApproved) {
      return res.status(400).json({
        success: false,
        message: "Astrologer is already approved",
      });
    }

    await astrologer.update({ isApproved: true });

    // Send approval email
    await sendAstrologerApprovalEmail(astrologer);

    res.status(200).json({
      success: true,
      message: "Astrologer approved successfully and email sent",
      astrologer: {
        id: astrologer.id,
        fullName: astrologer.fullName,
        email: astrologer.email,
        isApproved: astrologer.isApproved,
      },
    });
  } catch (error) {
    console.error("Approve astrologer error:", error);
    res.status(500).json({
      success: false,
      message: "Failed to approve astrologer",
      error: error.message,
    });
  }
};

// Reject astrologer (masteradmin only)
const rejectAstrologer = async (req, res) => {
  try {
    const { astrologerId } = req.params;
    const { reason } = req.body;

    const astrologer = await Astrologer.findByPk(astrologerId);

    if (!astrologer) {
      return res.status(404).json({
        success: false,
        message: "Astrologer not found",
      });
    }

    if (astrologer.isApproved) {
      return res.status(400).json({
        success: false,
        message: "Cannot reject an already approved astrologer",
      });
    }

    // Deactivate instead of deleting
    await astrologer.update({ isActive: false });

    // Send rejection email
    await sendAstrologerRejectionEmail(astrologer, reason);

    res.status(200).json({
      success: true,
      message: "Astrologer rejected and email sent",
      astrologer: {
        id: astrologer.id,
        fullName: astrologer.fullName,
        email: astrologer.email,
        isActive: astrologer.isActive,
      },
    });
  } catch (error) {
    console.error("Reject astrologer error:", error);
    res.status(500).json({
      success: false,
      message: "Failed to reject astrologer",
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

/**
 * Broadcast push notification to all users
 */
const broadcastNotification = async (req, res) => {
  try {
    const { title, message, actionUrl, imageUrl, data } = req.body;

    if (!title || !message) {
      return res.status(400).json({
        success: false,
        message: "Title and message are required",
      });
    }

    const result = await notificationService.broadcastToAll({
      type: "admin_broadcast",
      title,
      message,
      data: data || {},
      actionUrl,
      priority: "high",
      sendPush: true,
    });

    res.status(200).json({
      success: true,
      message: "Broadcast notification sent successfully",
      data: result,
    });
  } catch (error) {
    console.error("Broadcast notification error:", error);
    res.status(500).json({
      success: false,
      message: "Failed to send broadcast notification",
      error: error.message,
    });
  }
};

// Get admin profile
const getProfile = async (req, res) => {
  try {
    const adminId = req.user.id;

    const admin = await Admin.findByPk(adminId, {
      attributes: ["id", "name", "email", "role", "createdAt", "twoFactorEnabled"],
    });

    if (!admin) {
      return res.status(404).json({
        success: false,
        message: "Admin not found",
      });
    }

    res.status(200).json({
      success: true,
      admin,
    });
  } catch (error) {
    console.error("Get admin profile error:", error);
    res.status(500).json({
      success: false,
      message: "Failed to fetch profile",
      error: error.message,
    });
  }
};

// Update admin profile
const updateProfile = async (req, res) => {
  try {
    const adminId = req.user.id;
    const { name, email } = req.body;

    const admin = await Admin.findByPk(adminId);

    if (!admin) {
      return res.status(404).json({
        success: false,
        message: "Admin not found",
      });
    }

    // Check if email is being changed and if it's already taken
    if (email && email !== admin.email) {
      const existingAdmin = await Admin.findOne({ where: { email } });
      if (existingAdmin) {
        return res.status(400).json({
          success: false,
          message: "Email already in use",
        });
      }
    }

    // Update fields
    if (name) admin.name = name;
    if (email) admin.email = email;

    await admin.save();

    res.status(200).json({
      success: true,
      message: "Profile updated successfully",
      admin: {
        id: admin.id,
        name: admin.name,
        email: admin.email,
        role: admin.role,
      },
    });
  } catch (error) {
    console.error("Update admin profile error:", error);
    res.status(500).json({
      success: false,
      message: "Failed to update profile",
      error: error.message,
    });
  }
};

// Change admin password
const changePassword = async (req, res) => {
  try {
    const adminId = req.user.id;
    const { currentPassword, newPassword } = req.body;

    if (!currentPassword || !newPassword) {
      return res.status(400).json({
        success: false,
        message: "Current password and new password are required",
      });
    }

    if (newPassword.length < 6) {
      return res.status(400).json({
        success: false,
        message: "New password must be at least 6 characters long",
      });
    }

    const admin = await Admin.findByPk(adminId);

    if (!admin) {
      return res.status(404).json({
        success: false,
        message: "Admin not found",
      });
    }

    // Verify current password
    const isPasswordValid = await bcrypt.compare(currentPassword, admin.password);

    if (!isPasswordValid) {
      return res.status(401).json({
        success: false,
        message: "Current password is incorrect",
      });
    }

    // Hash and update new password
    const hashedPassword = await bcrypt.hash(newPassword, 10);
    admin.password = hashedPassword;
    await admin.save();

    res.status(200).json({
      success: true,
      message: "Password changed successfully",
    });
  } catch (error) {
    console.error("Change password error:", error);
    res.status(500).json({
      success: false,
      message: "Failed to change password",
      error: error.message,
    });
  }
};

// Enable 2FA - Generate secret and QR code
const enableTwoFactor = async (req, res) => {
  try {
    const speakeasy = require("speakeasy");
    const QRCode = require("qrcode");
    const adminId = req.user.id;

    const admin = await Admin.findByPk(adminId);

    if (!admin) {
      return res.status(404).json({
        success: false,
        message: "Admin not found",
      });
    }

    if (admin.twoFactorEnabled) {
      return res.status(400).json({
        success: false,
        message: "Two-factor authentication is already enabled",
      });
    }

    // Generate secret
    const secret = speakeasy.generateSecret({
      name: `Graho Admin (${admin.email})`,
      issuer: "Graho",
    });

    // Save secret temporarily (will be confirmed after verification)
    admin.twoFactorSecret = secret.base32;
    await admin.save();

    // Generate QR code
    const qrCodeUrl = await QRCode.toDataURL(secret.otpauth_url);

    res.status(200).json({
      success: true,
      message: "Scan this QR code with Google Authenticator",
      secret: secret.base32,
      qrCode: qrCodeUrl,
    });
  } catch (error) {
    console.error("Enable 2FA error:", error);
    res.status(500).json({
      success: false,
      message: "Failed to enable two-factor authentication",
      error: error.message,
    });
  }
};

// Verify and activate 2FA
const verifyTwoFactor = async (req, res) => {
  try {
    const speakeasy = require("speakeasy");
    const adminId = req.user.id;
    const { token } = req.body;

    if (!token) {
      return res.status(400).json({
        success: false,
        message: "Verification token is required",
      });
    }

    const admin = await Admin.findByPk(adminId);

    if (!admin || !admin.twoFactorSecret) {
      return res.status(400).json({
        success: false,
        message: "Two-factor setup not initiated",
      });
    }

    // Verify token
    const verified = speakeasy.totp.verify({
      secret: admin.twoFactorSecret,
      encoding: "base32",
      token: token,
      window: 2,
    });

    if (!verified) {
      return res.status(400).json({
        success: false,
        message: "Invalid verification code",
      });
    }

    // Enable 2FA
    admin.twoFactorEnabled = true;
    await admin.save();

    res.status(200).json({
      success: true,
      message: "Two-factor authentication enabled successfully",
    });
  } catch (error) {
    console.error("Verify 2FA error:", error);
    res.status(500).json({
      success: false,
      message: "Failed to verify two-factor authentication",
      error: error.message,
    });
  }
};

// Disable 2FA
const disableTwoFactor = async (req, res) => {
  try {
    const speakeasy = require("speakeasy");
    const adminId = req.user.id;
    const { token } = req.body;

    if (!token) {
      return res.status(400).json({
        success: false,
        message: "Verification token is required",
      });
    }

    const admin = await Admin.findByPk(adminId);

    if (!admin) {
      return res.status(404).json({
        success: false,
        message: "Admin not found",
      });
    }

    if (!admin.twoFactorEnabled) {
      return res.status(400).json({
        success: false,
        message: "Two-factor authentication is not enabled",
      });
    }

    // Verify token before disabling
    const verified = speakeasy.totp.verify({
      secret: admin.twoFactorSecret,
      encoding: "base32",
      token: token,
      window: 2,
    });

    if (!verified) {
      return res.status(400).json({
        success: false,
        message: "Invalid verification code",
      });
    }

    // Disable 2FA
    admin.twoFactorEnabled = false;
    admin.twoFactorSecret = null;
    await admin.save();

    res.status(200).json({
      success: true,
      message: "Two-factor authentication disabled successfully",
    });
  } catch (error) {
    console.error("Disable 2FA error:", error);
    res.status(500).json({
      success: false,
      message: "Failed to disable two-factor authentication",
      error: error.message,
    });
  }
};

module.exports = {
  register,
  login,
  verify2FALogin,
  getAllAdmins,
  changeAdminRole,
  getAllUsers,
  getAllAstrologers,
  getPendingAstrologers,
  approveAstrologer,
  rejectAstrologer,
  logout,
  broadcastNotification,
  getProfile,
  updateProfile,
  changePassword,
  enableTwoFactor,
  verifyTwoFactor,
  disableTwoFactor,
};
