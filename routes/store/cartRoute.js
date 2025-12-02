const express = require("express");
const router = express.Router();
const {
  addToCart,
  getMyCart,
  updateCartQuantity,
  removeFromCart,
  clearCart,
  getCartCount,
} = require("../../controller/store/cartController");
const checkForAuthenticationCookie = require("../../middleware/authMiddleware");

// All cart routes require authentication
router.use(checkForAuthenticationCookie());

router.post("/cart", addToCart);
router.get("/cart", getMyCart);
router.get("/cart/count", getCartCount);
router.put("/cart/:cartItemId", updateCartQuantity);
router.delete("/cart/:cartItemId", removeFromCart);
router.delete("/cart", clearCart);

module.exports = router;
