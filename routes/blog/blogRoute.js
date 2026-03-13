const express = require("express");
const router = express.Router();
const {
  createBlog,
  getAllBlogs,
  getBlogById,
  getMyBlogs,
  updateBlog,
  deleteBlog,
  toggleBlogPublish,
  uploadInlineImage,
  likeBlog,
  checkBlogLikeStatus,
} = require("../../controller/blog/blogController");
const { array, single } = require("../../config/uploadConfig/supabaseUpload");
const checkForAuthenticationCookie = require("../../middleware/authMiddleware");

const astrologerAuth = [checkForAuthenticationCookie()];

// Protected routes (astrologer only)
router.get("/my/blogs", ...astrologerAuth, getMyBlogs);
router.post("/upload-image", ...astrologerAuth, ...single("image"), uploadInlineImage);

// New REST-style endpoints (mirrors admin blog API style)
router.post("/", ...astrologerAuth, ...array("images", 5), createBlog);
router.put("/:blogId", ...astrologerAuth, ...array("images", 5), updateBlog);
router.patch("/:blogId/toggle", ...astrologerAuth, toggleBlogPublish);
router.delete("/:blogId", ...astrologerAuth, deleteBlog);

// Backward-compatible endpoints
router.post("/create", ...astrologerAuth, ...array("images", 5), createBlog);
router.put("/update/:blogId", ...astrologerAuth, ...array("images", 5), updateBlog);
router.delete("/delete/:blogId", ...astrologerAuth, deleteBlog);

// Public routes (all users can view)
router.get("/", getAllBlogs);
router.get("/:blogId", getBlogById);
router.post("/:blogId/like", likeBlog);
router.get("/:blogId/like-status", checkBlogLikeStatus);

module.exports = router;
