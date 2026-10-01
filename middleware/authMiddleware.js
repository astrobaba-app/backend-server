const { validateToken } = require("../services/authService");
const { parse } = require("cookie");
const Astrologer = require("../model/astrologer/astrologer");
const Admin = require("../model/admin/admin");
// Remember the app language on the user so notifications sent later (cron,
// queues, other users' actions) use it. Responses only follow the header, so
// clients that don't send it (website, admin) keep getting English.
// Runs after the response so an explicit change via PUT /api/user/language
// (which sets req.skipLanguageSync) is never overwritten by a stale header.
function syncPreferredLanguage(req, user) {
  const requested = req.requestedLang;

  if (!requested || requested === user.preferredLanguage || !req.res) {
    return;
  }

  req.res.once("finish", () => {
    if (req.skipLanguageSync) return;

    user.update({ preferredLanguage: requested }).catch((error) => {
      console.error("[Auth] Failed to save preferred language:", error.message);
    });
  });
}


function checkForAuthenticationCookie() {
  return async (req, res, next) => {
    try {
      let token;
      if (req.headers.cookie) {
        const parsedCookies = parse(req.headers.cookie);
        token = parsedCookies.token;
      }
      if (!token && req.headers.authorization) {
        const authHeader = req.headers.authorization;
        if (authHeader.startsWith("Bearer ")) {
          token = authHeader.split(" ")[1];
        }
      }
      if (!token) {
        console.warn("[Auth] Missing token", {
          method: req.method,
          path: req.originalUrl,
          ip: req.ip,
        });
        return res.status(401).json({ error: "No token found. Please login." });
      }

      const userPayload = validateToken(token);
      if (!userPayload) {
        console.warn("[Auth] Invalid/expired token", {
          method: req.method,
          path: req.originalUrl,
          ip: req.ip,
        });
        return res.status(401).json({ error: "Invalid or expired token." });
      }

      req.user = userPayload;
      if (userPayload.role === "astrologer") {
        const astrologer = await Astrologer.findByPk(userPayload.id, {
          attributes: ["id", "sessionVersion", "isActive"],
        });

        if (!astrologer || astrologer.isActive === false) {
          return res.status(401).json({ error: "Invalid or expired token." });
        }

        const tokenSessionVersion = Number.isInteger(userPayload.sessionVersion)
          ? userPayload.sessionVersion
          : 0;

        if (tokenSessionVersion !== (astrologer.sessionVersion || 0)) {
          return res.status(401).json({ error: "Invalid or expired token." });
        }
      } else if (["admin", "superadmin", "masteradmin"].includes(userPayload.role)) {
        const admin = await Admin.findByPk(userPayload.id, {
          attributes: ["id", "isActive", "isApproved"],
        });

        if (!admin || admin.isActive === false || admin.isApproved === false) {
          return res.status(401).json({ error: "Invalid or expired token." });
        }
      } else {
        const User = require("../model/user/userAuth");
        const user = await User.findByPk(userPayload.id, {
          attributes: ["id", "isActive", "sessionVersion", "preferredLanguage"],
        });

        if (!user || user.isActive === false) {
          return res.status(401).json({ error: "Invalid or expired token." });
        }

        const tokenSessionVersion = Number.isInteger(userPayload.sessionVersion)
          ? userPayload.sessionVersion
          : 0;

        if (tokenSessionVersion !== (user.sessionVersion || 0)) {
          return res.status(401).json({ error: "Invalid or expired token." });
        }

        syncPreferredLanguage(req, user);
      }
      next();
    } catch (error) {
      console.error("[Auth] middleware error:", {
        method: req.method,
        path: req.originalUrl,
        message: error.message,
      });
      return res.status(500).json({ error: "Authentication failed." });
    }
  };
}

function optionalAuthenticationCookie() {
  return async (req, _res, next) => {
    try {
      let token;
      if (req.headers.cookie) {
        const parsedCookies = parse(req.headers.cookie);
        token = parsedCookies.token;
      }
      if (!token && req.headers.authorization) {
        const authHeader = req.headers.authorization;
        if (authHeader.startsWith("Bearer ")) {
          token = authHeader.split(" ")[1];
        }
      }

      if (!token) return next();

      const userPayload = validateToken(token);
      if (userPayload) {
        req.user = userPayload;
      }

      return next();
    } catch (_error) {
      return next();
    }
  };
}

checkForAuthenticationCookie.optional = optionalAuthenticationCookie;

module.exports = checkForAuthenticationCookie;
