const { serialize } = require("cookie");
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

const clearTokenCookie = (res) => {
  res.setHeader("Set-Cookie", [
    serialize("token", "", {
      domain: COOKIE_DOMAIN,
      httpOnly: true,
      secure: COOKIE_SECURE,
      sameSite: COOKIE_SAMESITE,
      path: "/",
      expires: new Date(0),
    }),
    serialize("token_middleware", "", {
      domain: COOKIE_DOMAIN,
      httpOnly: false,
      secure: COOKIE_SECURE,
      sameSite: COOKIE_SAMESITE,
      path: "/",
      expires: new Date(0),
    }),
    serialize("refresh_token", "", {
      domain: COOKIE_DOMAIN,
      httpOnly: true,
      secure: COOKIE_SECURE,
      sameSite: COOKIE_SAMESITE,
      path: "/",
      expires: new Date(0),
    }),
  ]);
};

module.exports = clearTokenCookie;
