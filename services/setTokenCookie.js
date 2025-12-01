const { serialize } = require("cookie");
const setTokenCookie = (res, token, middlewareToken) => {
  res.setHeader("Set-Cookie", [
    // Secure, HttpOnly cookie
    serialize("token", token, {
      domain:".example.com",
      httpOnly: true,
      secure: false,
      sameSite: "lax",
      path: "/",
      maxAge: 60 * 60 * 24 * 30,
    }),
    // Non-HttpOnly for middleware
    serialize("token_middleware", middlewareToken, {
      domain:".example.com",
      httpOnly: false,
      secure: false,
      sameSite: "lax",
      path: "/",
      maxAge: 60 * 60 * 24 * 30,
    }),
  ]);
};

module.exports = setTokenCookie;