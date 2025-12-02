const express = require("express");
const router = express.Router();
const {
  followAstrologer,
  unfollowAstrologer,
  getMyFollowing,
  checkIfFollowing,
  getMyFollowers,
  getFollowerCount,
  getAstrologersWithFollowStatus,
  getFollowerStats,
} = require("../../controller/follow/followController");
const checkForAuthenticationCookie = require("../../middleware/authMiddleware");

// User routes
router.post("/follow", checkForAuthenticationCookie(), followAstrologer);
router.delete("/unfollow/:astrologerId", checkForAuthenticationCookie(), unfollowAstrologer);
router.get("/my-following", checkForAuthenticationCookie(), getMyFollowing);
router.get("/check/:astrologerId", checkForAuthenticationCookie(), checkIfFollowing);
router.get("/astrologers-with-status", checkForAuthenticationCookie(), getAstrologersWithFollowStatus);

// Astrologer routes
router.get("/my-followers", getMyFollowers);
router.get("/my-stats", getFollowerStats);

// Public routes
router.get("/count/:astrologerId", getFollowerCount);

module.exports = router;
