const { serialize } = require("cookie");
const ACCESS_COOKIE_MAX_AGE = Number(process.env.ACCESS_COOKIE_MAX_AGE_SECONDS);
const REFRESH_COOKIE_MAX_AGE = Number(process.env.REFRESH_COOKIE_MAX_AGE_SECONDS);
const setTokenCookie = (res, token, middlewareToken, refreshToken) => {
  const cookies = [
    // Secure, HttpOnly access token cookie
    serialize("token", token, {
      domain: ".graho.in",
      httpOnly: true,
      secure: true,
      sameSite: "none",
      path: "/",
      maxAge: ACCESS_COOKIE_MAX_AGE,
    }),
    // Non-HttpOnly access token mirror for frontend middleware/auth flows
    serialize("token_middleware", middlewareToken, {
      domain: ".graho.in",
      httpOnly: false,
      secure: true,
      sameSite: "none",
      path: "/",
      maxAge: ACCESS_COOKIE_MAX_AGE,
    }),
  ];

  if (refreshToken) {
    cookies.push(
      serialize("refresh_token", refreshToken, {
      domain: ".graho.in",
        httpOnly: true,
        secure: true,
        sameSite: "none",
        path: "/",
        maxAge: REFRESH_COOKIE_MAX_AGE,
      })
    );
  }

  res.setHeader("Set-Cookie", cookies);
};

module.exports = setTokenCookie;