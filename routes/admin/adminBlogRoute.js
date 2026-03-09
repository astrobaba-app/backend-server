const express = require("express");
const router = express.Router();
const {
  createAdminBlog,
  getAllAdminBlogs,
  updateAdminBlog,
  deleteAdminBlog,
  toggleBlogPublish,
  uploadInlineImage,
} = require("../../controller/admin/adminBlogController");
const { array, single } = require("../../config/uploadConfig/supabaseUpload");
const checkForAuthenticationCookie = require("../../middleware/authMiddleware");
const { authorizeRoles } = require("../../middleware/roleMiddleware");

const adminAuth = [
  checkForAuthenticationCookie(),
  authorizeRoles(["admin", "superadmin", "masteradmin"]),
];

// Get all blogs (admin view — includes unpublished)
router.get("/", ...adminAuth, getAllAdminBlogs);

// Upload a single inline image for use inside blog content
router.post("/upload-image", ...adminAuth, ...single("image"), uploadInlineImage);

// Create a new blog with up to 5 images
router.post("/", ...adminAuth, ...array("images", 5), createAdminBlog);

// Update an existing blog (can replace images)
router.put("/:blogId", ...adminAuth, ...array("images", 5), updateAdminBlog);

// Toggle publish/unpublish status
router.patch("/:blogId/toggle", ...adminAuth, toggleBlogPublish);

// Delete a blog
router.delete("/:blogId", ...adminAuth, deleteAdminBlog);

module.exports = router;
