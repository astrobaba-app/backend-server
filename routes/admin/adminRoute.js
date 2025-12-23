const express = require("express");
const router = express.Router();
const {
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
  broadcastNotification,
} = require("../../controller/admin/adminController");
const checkForAuthenticationCookie = require("../../middleware/authMiddleware");
const { authorizeRoles } = require("../../middleware/roleMiddleware");

router.post("/register", register);
router.post("/login", login);

router.post("/logout", logout);

// Master admin only routes
router.get(
  "/admins",
  checkForAuthenticationCookie(),
  authorizeRoles(["masteradmin"]),
  getAllAdmins
);
router.put(
  "/admins/:adminId/role",
  checkForAuthenticationCookie(),
  authorizeRoles([ "masteradmin"]),
  changeAdminRole
);
router.get(
  "/users",
  checkForAuthenticationCookie(),
  authorizeRoles(["admin", "superadmin", "masteradmin"]),
  getAllUsers
);
router.get(
  "/astrologers",
  checkForAuthenticationCookie(),
  authorizeRoles(["admin", "superadmin", "masteradmin"]),
  getAllAstrologers
);
router.get(
  "/astrologers/pending",
  checkForAuthenticationCookie(),
  authorizeRoles(["admin", "superadmin", "masteradmin"]),
  getPendingAstrologers
);
router.put(
  "/astrologers/:astrologerId/approve",
  checkForAuthenticationCookie(),
  authorizeRoles(["admin", "superadmin", "masteradmin"]),
  approveAstrologer
);
router.put(
  "/astrologers/:astrologerId/reject",
  checkForAuthenticationCookie(),
  authorizeRoles(["admin", "superadmin", "masteradmin"]),
  rejectAstrologer
);

// Broadcast push notification to all users
router.post(
  "/broadcast-notification",
  checkForAuthenticationCookie(),
  authorizeRoles(["admin", "superadmin", "masteradmin"]),
  broadcastNotification
);

module.exports = router;
