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
  assignCouponToUsers,
  getCouponAssignments,
  removeCouponAssignment,
  getCouponAnalytics,
} = require("../../controller/coupon/couponController");
const checkForAuthenticationCookie = require("../../middleware/authMiddleware");
const { authorizeRoles } = require("../../middleware/roleMiddleware");

const adminAuth = [
  checkForAuthenticationCookie(),
  authorizeRoles(["admin", "superadmin", "masteradmin"]),
];

// User routes
router.post("/validate", checkForAuthenticationCookie(), validateCoupon);
router.get("/active", checkForAuthenticationCookie(), getActiveCoupons);
router.get("/my-usage", checkForAuthenticationCookie(), getMyCouponUsage);

// Admin routes
router.post("/admin/create", ...adminAuth, createCoupon);
router.get("/admin/all", ...adminAuth, getAllCoupons);
router.put("/admin/:couponId", ...adminAuth, updateCoupon);
router.delete("/admin/:couponId", ...adminAuth, deleteCoupon);
router.patch("/admin/:couponId/toggle", ...adminAuth, toggleCouponStatus);
router.post("/admin/:couponId/assign", ...adminAuth, assignCouponToUsers);
router.get("/admin/:couponId/assignments", ...adminAuth, getCouponAssignments);
router.delete(
  "/admin/:couponId/assignments/:userId",
  ...adminAuth,
  removeCouponAssignment
);
router.get("/admin/:couponId/analytics", ...adminAuth, getCouponAnalytics);

module.exports = router;
