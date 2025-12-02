const express = require("express");
const router = express.Router();
const {
  checkout,
  getMyOrders,
  getOrderDetails,
  trackOrder,
  cancelOrder,
  getAllOrders,
  updateOrderStatus,
  getOrderStatistics,
} = require("../../controller/store/orderController");
const {
  checkForAuthenticationCookie,
} = require("../../middleware/authMiddleware");
const { validateAdminToken } = require("../../middleware/adminMiddleware");

// ==================== USER ROUTES ====================
router.post("/orders/checkout", checkForAuthenticationCookie(), checkout);
router.get("/orders", checkForAuthenticationCookie(), getMyOrders);
router.get("/orders/:orderNumber", checkForAuthenticationCookie(), getOrderDetails);
router.get("/orders/:orderNumber/track", checkForAuthenticationCookie(), trackOrder);
router.post("/orders/:orderNumber/cancel", checkForAuthenticationCookie(), cancelOrder);

// ==================== ADMIN ROUTES ====================
router.get("/admin/orders", validateAdminToken, getAllOrders);
router.get("/admin/orders/statistics", validateAdminToken, getOrderStatistics);
router.patch("/admin/orders/:orderNumber", validateAdminToken, updateOrderStatus);

module.exports = router;
