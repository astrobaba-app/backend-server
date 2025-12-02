const express = require("express");
const router = express.Router();
const {
  createProduct,
  updateProduct,
  deleteProduct,
  toggleProductStatus,
  getAllProducts,
  getProductById,
  getProductBySlug,
  getFeaturedProducts,
  getCategories,
} = require("../../controller/store/productController");
const {
  checkForAuthenticationCookie,
} = require("../../middleware/authMiddleware");

// ==================== ADMIN ROUTES ====================
router.post("/admin/products", createProduct);
router.put("/admin/products/:productId", updateProduct);
router.delete("/admin/products/:productId", deleteProduct);
router.patch(
  "/admin/products/:productId/toggle-status",
  toggleProductStatus
);

// ==================== PUBLIC ROUTES ====================
router.get("/products", getAllProducts);
router.get("/products/featured", getFeaturedProducts);
router.get("/products/categories", getCategories);
router.get("/products/:productId", getProductById);
router.get("/products/slug/:slug", getProductBySlug);

module.exports = router;
