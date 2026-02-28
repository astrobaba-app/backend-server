const express = require("express");
const { redirectToApple, appleCallback } = require("../../controller/authController/appleAuthController");

const router = express.Router();

// GET – redirect browser to Apple authentication page
router.get("/apple", redirectToApple);

// POST – Apple posts back here after the user authenticates
router.post("/apple/callback", appleCallback);

module.exports = router;
