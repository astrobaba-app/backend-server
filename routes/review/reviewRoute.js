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

// User routes (protected)
router.post("/user/create", checkForAuthenticationCookie(), createReview);
router.get("/user/my", checkForAuthenticationCookie(), getMyReview);
router.put("/user/:reviewId", checkForAuthenticationCookie(), updateReview);
router.delete("/user/:reviewId", checkForAuthenticationCookie(), deleteReview);

// Astrologer routes (protected) - MUST come before /astrologer/:astrologerId
router.get("/astrologer/pending-replies", checkForAuthenticationCookie(), getReviewsNeedingReply);
router.post("/astrologer/:reviewId/reply",checkForAuthenticationCookie(), addReply);
router.put("/astrologer/:reviewId/reply",checkForAuthenticationCookie(), updateReply);
router.delete("/astrologer/:reviewId/reply", checkForAuthenticationCookie(), deleteReply);


router.get("/astrologer/:astrologerId", getAstrologerReviews);

module.exports = router;
