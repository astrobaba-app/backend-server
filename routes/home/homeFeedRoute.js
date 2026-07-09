const express = require("express");
const router = express.Router();
const { getHomeFeed, getShareSettings } = require("../../controller/home/homeFeedController");

// Public route — no auth middleware required
// GET /api/home/feed
router.get("/feed", getHomeFeed);

// GET /api/home/share-settings
router.get("/share-settings", getShareSettings);

module.exports = router;
