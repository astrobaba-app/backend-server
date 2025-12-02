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
const { validateAdminToken } = require("../../middleware/adminMiddleware");

// ==================== ADMIN ROUTES ====================
router.post("/admin/products", validateAdminToken, createProduct);
router.put("/admin/products/:productId", validateAdminToken, updateProduct);
router.delete("/admin/products/:productId", validateAdminToken, deleteProduct);
router.patch(
  "/admin/products/:productId/toggle-status",
  validateAdminToken,
  toggleProductStatus
);

// ==================== PUBLIC ROUTES ====================
router.get("/products", getAllProducts);
router.get("/products/featured", getFeaturedProducts);
router.get("/products/categories", getCategories);
router.get("/products/:productId", getProductById);
router.get("/products/slug/:slug", getProductBySlug);

module.exports = router;
