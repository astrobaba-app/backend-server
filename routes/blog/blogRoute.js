const express = require("express");
const router = express.Router();
const {
  createBlog,
  getAllBlogs,
  getBlogById,
  getMyBlogs,
  updateBlog,
  deleteBlog,
  likeBlog,
  checkBlogLikeStatus,
} = require("../../controller/blog/blogController");
const upload = require("../../config/uploadConfig/supabaseUpload");
const checkForAuthenticationCookie = require("../../middleware/authMiddleware");

// Public routes (all users can view)
router.get("/", getAllBlogs);
router.get("/:blogId", getBlogById);
router.post("/:blogId/like", likeBlog);
router.get("/:blogId/like-status", checkBlogLikeStatus);

// Protected routes (astrologer only)
router.post(
  "/create",
  checkForAuthenticationCookie(),
  upload.single("image"),
  createBlog
);
router.get("/my/blogs", checkForAuthenticationCookie(), getMyBlogs);
router.put(
  "/update/:blogId",
  checkForAuthenticationCookie(),
  upload.single("image"),
  updateBlog
);
router.delete("/delete/:blogId", checkForAuthenticationCookie(), deleteBlog);

module.exports = router;
