const { serialize } = require("cookie");

const clearTokenCookie = (res) => {
  res.setHeader("Set-Cookie", [
    serialize("token", "", {
   domain:".graho.in",
      httpOnly: true,
      secure: true,
      sameSite: "none",
      path: "/",
      expires: new Date(0),
    }),
    serialize("token_middleware", "", {
 domain:".graho.in",
      httpOnly: false,
      secure: true,
      sameSite: "none",
      path: "/",
      expires: new Date(0),
    }),
  ]);
};

module.exports = clearTokenCookie;
