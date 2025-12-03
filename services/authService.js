const JWT = require("jsonwebtoken");

function createToken(user) {
  try {
    if (!process.env.JWT_SECRET) {
      throw new Error("JWT_SECRET is missing in environment variables");
    }

    const payload = {
      id:user.id,
      role: user.role || null
    };
    return JWT.sign(payload, process.env.JWT_SECRET, { expiresIn: "30d" });
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
    { expiresIn: "30d" }
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

module.exports = {
  createToken,
  validateToken,
  createMiddlewareToken
};
