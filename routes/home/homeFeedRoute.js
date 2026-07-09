const express = require("express");
const router = express.Router();
const { getHomeFeed } = require("../../controller/home/homeFeedController");

// Public route — no auth middleware required
// GET /api/home/feed
router.get("/feed", getHomeFeed);

module.exports = router;
