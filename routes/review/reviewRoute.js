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
router.post("/", checkForAuthenticationCookie(), createReview);
router.get("/my/:astrologerId", checkForAuthenticationCookie(), getMyReview);
router.put("/:reviewId", checkForAuthenticationCookie(), updateReview);
router.delete("/:reviewId", checkForAuthenticationCookie(), deleteReview);

// Astrologer routes (protected)
router.get("/pending-replies",  getReviewsNeedingReply);
router.post("/:reviewId/reply", addReply);
router.put("/:reviewId/reply", updateReply);
router.delete("/:reviewId/reply", deleteReply);

module.exports = router;
