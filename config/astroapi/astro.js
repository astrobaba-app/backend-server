require("dotenv").config();
const astrology = require("astrologyapi");

const userId = process.env.ASTRO_USER_ID;
const apiKey = process.env.ASTRO_API_KEY;

if (!userId || !apiKey) {
  console.error("Astrology API credentials missing:", {
    userId: userId ? "present" : "MISSING",
    apiKey: apiKey ? "present" : "MISSING",
  });
  throw new Error("ASTRO_USER_ID and ASTRO_API_KEY must be set in .env file");
}

const astro = new astrology({
  userId,
  apiKey,
});

module.exports = astro;
