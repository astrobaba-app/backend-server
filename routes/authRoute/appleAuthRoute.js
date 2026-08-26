const express = require("express");
const { redirectToApple, appleCallback, mobileAppleLogin } = require("../../controller/authController/appleAuthController");

const router = express.Router();

// GET – redirect browser to Apple authentication page
router.get("/apple", redirectToApple);

// POST – Apple posts back here after the user authenticates
router.post("/apple/callback", appleCallback);

// POST - Native Apple Sign-In for mobile app
router.post("/apple/mobile", mobileAppleLogin);

module.exports = router;
