const Admin = require("../../model/admin/admin");
const Astrologer = require("../../model/astrologer/astrologer");
const User = require("../../model/user/userAuth");
const bcrypt = require("bcryptjs");
const jwt = require("jsonwebtoken");
const {
  sendAstrologerApprovalEmail,
  sendAstrologerRejectionEmail,
} = require("../../emailService/adminApproval");


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

module.exports = {
  register,
  login,
  getAllAdmins,
  changeAdminRole,
  getAllUsers,
  getAllAstrologers,
  getPendingAstrologers,
  approveAstrologer,
  rejectAstrologer,
  logout,
};
