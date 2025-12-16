const Astrologer = require("../model/astrologer/astrologer");

const authorizeRoles = (roles) => {
  return async (req, res, next) => {
    try {
      let currentRole = req.user && req.user.role;

      // Backward compatibility: older tokens may not have role set.
      // If no role but the ID matches an astrologer, treat as astrologer.
      if (!currentRole && req.user && req.user.id) {
        try {
          const astrologer = await Astrologer.findByPk(req.user.id);
          if (astrologer) {
            currentRole = "astrologer";
            req.user.role = currentRole;
          }
        } catch (innerErr) {
          console.log("Error inferring role from DB:", innerErr.message);
        }
      }

      console.log("User Role (resolved):", currentRole);

      if (!roles.includes(currentRole)) {
        return res.status(403).json({
          message:
            "Unauthorized Access! , You are not authorized to access this resources ",
        });
      }

      next();
    } catch (error) {
      console.log("authorizeRoles error:", error);
      return res.status(500).json({ message: "Role authorization failed" });
    }
  };
};

module.exports = { authorizeRoles };
