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
const checkForAuthenticationCookie = require("../../middleware/authMiddleware");
const { authorizeRoles } = require("../../middleware/roleMiddleware");

router.post("/orders/checkout", checkForAuthenticationCookie(), checkout);
router.get("/orders", checkForAuthenticationCookie(), getMyOrders);
router.get("/orders/:orderNumber", checkForAuthenticationCookie(), getOrderDetails);
router.get("/orders/:orderNumber/track", checkForAuthenticationCookie(), trackOrder);
router.post("/orders/:orderNumber/cancel", checkForAuthenticationCookie(), cancelOrder);

router.get("/admin/orders",checkForAuthenticationCookie(),  authorizeRoles(["admin", "superadmin", "masteradmin"]),getAllOrders);
router.get("/admin/orders/statistics",checkForAuthenticationCookie(), authorizeRoles(["admin", "superadmin", "masteradmin"]), getOrderStatistics);
router.patch("/admin/orders/:orderNumber",checkForAuthenticationCookie(), authorizeRoles(["admin", "superadmin", "masteradmin"]), updateOrderStatus);

module.exports = router;
