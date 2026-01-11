const { serialize } = require("cookie");

const clearTokenCookieAstrologer = (res) => {
  res.setHeader("Set-Cookie", [
    serialize("token", "", {
  domain:".graho.in",
      httpOnly: true,
      secure: true,
      sameSite: "none",
      path: "/",
      expires: new Date(0),
    }),
    serialize("token_astrologer", "", {
 domain:".graho.in",
      httpOnly: false,
      secure: true,
      sameSite: "none",
      path: "/",
      expires: new Date(0),
    }),
  ]);
};

module.exports = clearTokenCookieAstrologer;
