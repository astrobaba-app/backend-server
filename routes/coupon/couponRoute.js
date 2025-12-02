const express = require("express");
const router = express.Router();
const {
  validateCoupon,
  getActiveCoupons,
  getMyCouponUsage,
  createCoupon,
  getAllCoupons,
  updateCoupon,
  deleteCoupon,
  toggleCouponStatus,
  getCouponAnalytics,
} = require("../../controller/coupon/couponController");
const checkForAuthenticationCookie = require("../../middleware/authMiddleware");

// User routes
router.post("/validate", checkForAuthenticationCookie(), validateCoupon);
router.get("/active", checkForAuthenticationCookie(), getActiveCoupons);
router.get("/my-usage", checkForAuthenticationCookie(), getMyCouponUsage);

// Admin routes
router.post("/admin/create", createCoupon);
router.get("/admin/all", getAllCoupons);
router.put("/admin/:couponId", updateCoupon);
router.delete("/admin/:couponId", deleteCoupon);
router.patch("/admin/:couponId/toggle", toggleCouponStatus);
router.get("/admin/:couponId/analytics", getCouponAnalytics);

module.exports = router;
