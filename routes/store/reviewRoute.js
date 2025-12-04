const express = require("express");
const router = express.Router();
const {
  addReview,
  getProductReviews,
  getMyReviews,
  updateReview,
  deleteReview,
  markReviewHelpful,
  getAllReviews,
  updateReviewApproval,
  replyToReview,
} = require("../../controller/store/reviewController");
const checkForAuthenticationCookie = require("../../middleware/authMiddleware");

// ==================== USER ROUTES ====================
router.post("/reviews/products/:productId", checkForAuthenticationCookie(), addReview);
router.get("/reviews/my-reviews", checkForAuthenticationCookie(), getMyReviews);
router.put("/reviews/:reviewId", checkForAuthenticationCookie(), updateReview);
router.delete("/reviews/:reviewId", checkForAuthenticationCookie(), deleteReview);
router.post("/reviews/:reviewId/helpful", markReviewHelpful);

// ==================== PUBLIC ROUTES ====================
router.get("/reviews/products/:productId", getProductReviews);

// ==================== ADMIN ROUTES ====================
router.get("/admin/reviews", getAllReviews);
// router.patch("/admin/reviews/:reviewId/approval", updateReviewApproval);
// router.post("/admin/reviews/:reviewId/reply", replyToReview);

module.exports = router;
