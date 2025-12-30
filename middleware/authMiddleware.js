const { validateToken } = require("../services/authService");
const { parse } = require("cookie");


function checkForAuthenticationCookie() {
  return (req, res, next) => {
    try {
      console.log('[PRODUCTION DEBUG] Auth middleware - checking authentication');
      console.log('[PRODUCTION DEBUG] Request path:', req.path);
      console.log('[PRODUCTION DEBUG] Request method:', req.method);
      let token;

      if (req.headers.cookie) {
        const parsedCookies = parse(req.headers.cookie);
        token = parsedCookies.token;
        console.log('[PRODUCTION DEBUG] Token found in cookies:', !!token);
      }
      if (!token && req.headers.authorization) {
        const authHeader = req.headers.authorization;
        if (authHeader.startsWith("Bearer ")) {
          token = authHeader.split(" ")[1];
          console.log('[PRODUCTION DEBUG] Token found in Authorization header:', !!token);
        }
      }
      if (!token) {
        console.error('[PRODUCTION DEBUG] No token found in request');
        return res.status(401).json({ error: "No token found. Please login." });
      }

      const userPayload = validateToken(token);
      if (!userPayload) {
        console.error('[PRODUCTION DEBUG] Token validation failed');
        return res.status(401).json({ error: "Invalid or expired token." });
      }

      console.log('[PRODUCTION DEBUG] Authentication successful:', {
        userId: userPayload.id,
        role: userPayload.role
      });
      req.user = userPayload;
      next();
    } catch (error) {
      console.error("[PRODUCTION DEBUG] Auth error:", {
        message: error.message,
        stack: error.stack
      });
      return res.status(500).json({ error: "Authentication failed." });
    }
  };
}

module.exports = checkForAuthenticationCookie;
