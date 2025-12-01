const { serialize } = require("cookie");

const clearTokenCookie = (res) => {
  res.setHeader("Set-Cookie", [
    serialize("token", "", {
    domain:".example.com",
      httpOnly: true,
      secure: false,
      sameSite: "lax",
      path: "/",
      expires: new Date(0),
    }),
    serialize("token_middleware", "", {
   domain:".example.com",
      httpOnly: false,
      secure: false,
      sameSite: "lax",
      path: "/",
      expires: new Date(0),
    }),
  ]);
};

module.exports = clearTokenCookie;
