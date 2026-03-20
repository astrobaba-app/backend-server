const express = require("express");
const router = express.Router();
const {
  createForumComment,
  deleteForumComment,
  deleteForumPost,
  createForumPost,
  createForumPostAppeal,
  createForumPostReport,
  getForumCommentReplies,
  getForumComments,
  getForumPostById,
  getForumPosts,
  getMyForumPosts,
  shareForumPost,
  toggleForumPostLike,
  updateForumComment,
  updateForumPost,
} = require("../../controller/forum/forumController");
const checkForAuthenticationCookie = require("../../middleware/authMiddleware");
const optionalAuthentication = require("../../middleware/optionalMiddleware");
const { array } = require("../../config/uploadConfig/supabaseUpload");

router.get("/posts", optionalAuthentication(), getForumPosts);
router.get("/my-posts", checkForAuthenticationCookie(), getMyForumPosts);
router.post("/posts", checkForAuthenticationCookie(), ...array("images", 5), createForumPost);
router.put("/posts/:postId", checkForAuthenticationCookie(), updateForumPost);
router.delete("/posts/:postId", checkForAuthenticationCookie(), deleteForumPost);
router.get("/posts/:postId", optionalAuthentication(), getForumPostById);
router.post("/posts/:postId/like", checkForAuthenticationCookie(), toggleForumPostLike);
router.post("/posts/:postId/share", optionalAuthentication(), shareForumPost);
router.post("/posts/:postId/report", checkForAuthenticationCookie(), createForumPostReport);
router.post("/posts/:postId/appeal", checkForAuthenticationCookie(), createForumPostAppeal);
router.get("/posts/:postId/comments", optionalAuthentication(), getForumComments);
router.get("/posts/:postId/comments/:parentCommentId/replies", optionalAuthentication(), getForumCommentReplies);
router.post("/posts/:postId/comments", checkForAuthenticationCookie(), createForumComment);
router.put("/posts/:postId/comments/:commentId", checkForAuthenticationCookie(), updateForumComment);
router.delete("/posts/:postId/comments/:commentId", checkForAuthenticationCookie(), deleteForumComment);

module.exports = router;