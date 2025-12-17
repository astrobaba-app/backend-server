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
const checkForAuthenticationCookie = require("../../middleware/authMiddleware");
const { authorizeRoles } = require("../../middleware/roleMiddleware");
const upload = require("../../config/uploadConfig/supabaseUpload");

// ==================== ADMIN ROUTES ====================
router.post(
  "/admin/products/create",
  checkForAuthenticationCookie(),
  authorizeRoles(["admin", "superadmin", "masteradmin"]),
  upload.array("images", 10),
  createProduct
);
router.put(
  "/admin/products/:productId",
  checkForAuthenticationCookie(),
  authorizeRoles(["admin", "superadmin", "masteradmin"]),
  upload.array("images", 10),
  updateProduct
);
router.delete(
  "/admin/products/:productId",
  checkForAuthenticationCookie(),
  authorizeRoles(["admin", "superadmin", "masteradmin"]),
  deleteProduct
);
router.patch(
  "/admin/products/:productId/toggle-status",
  checkForAuthenticationCookie(),
  authorizeRoles(["admin", "superadmin", "masteradmin"]),
  toggleProductStatus
);

// ==================== PUBLIC ROUTES ====================
router.get("/products", getAllProducts);
router.get("/products/featured", getFeaturedProducts);
router.get("/products/categories", getCategories);
router.get("/products/:productId", getProductById);
router.get("/products/slug/:slug", getProductBySlug);

module.exports = router;
