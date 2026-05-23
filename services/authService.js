const JWT = require("jsonwebtoken");

const ACCESS_TOKEN_EXPIRES_IN = process.env.JWT_ACCESS_EXPIRES_IN;
const REFRESH_TOKEN_EXPIRES_IN = process.env.JWT_REFRESH_EXPIRES_IN;
const ADMIN_ROLES = new Set(["admin", "superadmin", "masteradmin"]);

const resolveActorType = (user = {}) => {
  if (typeof user.actorType === "string" && user.actorType.trim()) {
    return user.actorType.trim();
  }

  if (user.role === "astrologer") {
    return "astrologer";
  }

  if (user.role && ADMIN_ROLES.has(user.role)) {
    return "admin";
  }

  return "user";
};

function createToken(user) {
  try {
    if (!process.env.JWT_SECRET) {
      throw new Error("JWT_SECRET is missing in environment variables");
    }

    const payload = {
      id:user.id,
      role: user.role || null
    };
    return JWT.sign(payload, process.env.JWT_SECRET, { expiresIn: ACCESS_TOKEN_EXPIRES_IN });
  } catch (error) {
    console.error("Error creating token:", error.message);
    return null;
  }
}

const createMiddlewareToken = (user) => {
  return JWT.sign(
    { id: user.id,
      role: user.role || null
     }, 
    process.env.JWT_SECRET,
    { expiresIn: ACCESS_TOKEN_EXPIRES_IN }
  );
};

const createRefreshToken = (user) => {
  if (!process.env.JWT_SECRET) {
    throw new Error("JWT_SECRET is missing in environment variables");
  }

  return JWT.sign(
    {
      id: user.id,
      role: user.role || null,
      actorType: resolveActorType(user),
    },
    process.env.JWT_REFRESH_SECRET || process.env.JWT_SECRET,
    { expiresIn: REFRESH_TOKEN_EXPIRES_IN }
  );
};


function validateToken(token) {
  try {
    const payload = JWT.verify(token, process.env.JWT_SECRET);
    return payload;
  } catch (error) {
    console.error("Error validating token:", error.message);
    return null; 
  }
}

function validateRefreshToken(token) {
  try {
    const payload = JWT.verify(
      token,
      process.env.JWT_REFRESH_SECRET || process.env.JWT_SECRET
    );
    return payload;
  } catch (error) {
    console.error("Error validating refresh token:", error.message);
    return null;
  }
}

module.exports = {
  createToken,
  validateToken,
  createMiddlewareToken,
  createRefreshToken,
  validateRefreshToken,
  resolveActorType,
};