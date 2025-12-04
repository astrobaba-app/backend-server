const express = require("express");
const router = express.Router();
const {
  createReview,
  getAstrologerReviews,
  getMyReview,
  updateReview,
  deleteReview,
  addReply,
  updateReply,
  deleteReply,
  getReviewsNeedingReply,
} = require("../../controller/review/reviewController");
const checkForAuthenticationCookie = require("../../middleware/authMiddleware");

// Public routes
router.get("/astrologer/:astrologerId", getAstrologerReviews);

// User routes (protected)
router.post("/user/create", checkForAuthenticationCookie(), createReview);
router.get("/user/my/:astrologerId", checkForAuthenticationCookie(), getMyReview);
router.put("/user/:reviewId", checkForAuthenticationCookie(), updateReview);
router.delete("/user/:reviewId", checkForAuthenticationCookie(), deleteReview);

// Astrologer routes (protected)
router.get("/astrologer/pending-replies", checkForAuthenticationCookie(), getReviewsNeedingReply);
router.post("/astrologer/:reviewId/reply",checkForAuthenticationCookie(), addReply);
router.put("/astrologer/:reviewId/reply",checkForAuthenticationCookie(), updateReply);
router.delete("/astrologer/:reviewId/reply", checkForAuthenticationCookie(), deleteReply);

module.exports = router;
