const { serialize } = require("cookie");
const ACCESS_COOKIE_MAX_AGE = Number(process.env.ACCESS_COOKIE_MAX_AGE_SECONDS);
const REFRESH_COOKIE_MAX_AGE = Number(process.env.REFRESH_COOKIE_MAX_AGE_SECONDS);
const IS_PROD = process.env.NODE_ENV === "production";
const COOKIE_DOMAIN_ENV = process.env.COOKIE_DOMAIN;
const COOKIE_DOMAIN =
  COOKIE_DOMAIN_ENV && COOKIE_DOMAIN_ENV.trim() !== ""
    ? COOKIE_DOMAIN_ENV
    : IS_PROD
      ? ".graho.in"
      : undefined;
const COOKIE_SECURE =
  typeof process.env.COOKIE_SECURE === "string"
    ? process.env.COOKIE_SECURE === "true"
    : IS_PROD;
const COOKIE_SAMESITE =
  process.env.COOKIE_SAMESITE ?? (IS_PROD ? "none" : "lax");
const setTokenCookie = (res, token, middlewareToken, refreshToken) => {
  const cookies = [
    // Secure, HttpOnly access token cookie
    serialize("token", token, {
      domain: COOKIE_DOMAIN,
      httpOnly: true,
      secure: COOKIE_SECURE,
      sameSite: COOKIE_SAMESITE,
      path: "/",
      maxAge: ACCESS_COOKIE_MAX_AGE,
    }),
    // Non-HttpOnly access token mirror for frontend middleware/auth flows
    serialize("token_middleware", middlewareToken, {
      domain: COOKIE_DOMAIN,
      httpOnly: false,
      secure: COOKIE_SECURE,
      sameSite: COOKIE_SAMESITE,
      path: "/",
      maxAge: ACCESS_COOKIE_MAX_AGE,
    }),
  ];

  if (refreshToken) {
    cookies.push(
      serialize("refresh_token", refreshToken, {
        domain: COOKIE_DOMAIN,
        httpOnly: true,
        secure: COOKIE_SECURE,
        sameSite: COOKIE_SAMESITE,
        path: "/",
        maxAge: REFRESH_COOKIE_MAX_AGE,
      })
    );
  }

  res.setHeader("Set-Cookie", cookies);
};

module.exports = setTokenCookie;