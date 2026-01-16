const { serialize } = require("cookie");
const setTokenCookieAstrologer = (res, token, astrologerToken) => {
  res.setHeader("Set-Cookie", [
    // Secure, HttpOnly cookie
    serialize("token", token, {
      // domain:".graho.in",
      httpOnly: true,
      secure: false,
      sameSite: "none",
      path: "/",
      maxAge: 60 * 60 * 24 * 30,
    }),
    // Non-HttpOnly for middleware
    serialize("token_astrologer", astrologerToken, {
      // domain:".graho.in",
      httpOnly: false,
      secure: false,
      sameSite: "none",
      path: "/",
      maxAge: 60 * 60 * 24 * 30,
    }),
  ]);
};

module.exports = setTokenCookieAstrologer;