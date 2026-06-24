const { validateToken } = require("../services/authService");
const { parse } = require("cookie");
const Astrologer = require("../model/astrologer/astrologer");


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
          attributes: ["id", "sessionVersion"],
        });

        if (!astrologer) {
          return res.status(401).json({ error: "Invalid or expired token." });
        }

        const tokenSessionVersion = Number.isInteger(userPayload.sessionVersion)
          ? userPayload.sessionVersion
          : 0;

        if (tokenSessionVersion !== (astrologer.sessionVersion || 0)) {
          return res.status(401).json({ error: "Invalid or expired token." });
        }
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
