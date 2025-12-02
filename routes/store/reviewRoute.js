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
const {
  checkForAuthenticationCookie,
} = require("../../middleware/authMiddleware");
const { validateAdminToken } = require("../../middleware/adminMiddleware");

// ==================== USER ROUTES ====================
router.post("/reviews/products/:productId", checkForAuthenticationCookie(), addReview);
router.get("/reviews/my-reviews", checkForAuthenticationCookie(), getMyReviews);
router.put("/reviews/:reviewId", checkForAuthenticationCookie(), updateReview);
router.delete("/reviews/:reviewId", checkForAuthenticationCookie(), deleteReview);
router.post("/reviews/:reviewId/helpful", markReviewHelpful);

// ==================== PUBLIC ROUTES ====================
router.get("/reviews/products/:productId", getProductReviews);

// ==================== ADMIN ROUTES ====================
router.get("/admin/reviews", validateAdminToken, getAllReviews);
router.patch("/admin/reviews/:reviewId/approval", validateAdminToken, updateReviewApproval);
router.post("/admin/reviews/:reviewId/reply", validateAdminToken, replyToReview);

module.exports = router;
