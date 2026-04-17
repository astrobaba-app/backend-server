const { Op } = require("sequelize");
const { sequelize } = require("../../dbConnection/dbConfig");
const ForumPost = require("../../model/forum/forumPost");
const ForumComment = require("../../model/forum/forumComment");
const ForumPostLike = require("../../model/forum/forumPostLike");
const ForumPostReport = require("../../model/forum/forumPostReport");
const ForumPostAppeal = require("../../model/forum/forumPostAppeal");
const User = require("../../model/user/userAuth");
const { buildForumAuthorSnapshot } = require("../../services/forumIdentityService");
const {
  checkForumUserAccess,
} = require("../../services/forumModerationService");
const {
  buildDuplicateResponsePayload,
  checkExactDuplicateBeforeCreate,
  createFingerprint,
} = require("../../services/forumDuplicateService");

const SORT_OPTIONS = {
  newest: [["createdAt", "DESC"]],
  oldest: [["createdAt", "ASC"]],
  "top-liked": [["likeCount", "DESC"], ["createdAt", "DESC"]],
  "most-commented": [["commentCount", "DESC"], ["createdAt", "DESC"]],
};

const DEFAULT_PAGE_SIZE = 10;
const DEFAULT_THREAD_PAGE_SIZE = 12;
const DEFAULT_REPLY_PAGE_SIZE = 8;
const DEFAULT_INITIAL_DEPTH_CAP = 1;
const REPORT_REASONS = new Set([
  "abusive_content",
  "harassment_or_hate",
  "spam_or_scam",
  "false_information",
  "sexual_content",
  "off_topic",
  "other",
]);

const parsePositiveInt = (value, fallback) => {
  const parsed = Number.parseInt(value, 10);
  if (!Number.isFinite(parsed) || parsed <= 0) {
    return fallback;
  }
  return parsed;
};

const parseNonNegativeInt = (value, fallback) => {
  const parsed = Number.parseInt(value, 10);
  if (!Number.isFinite(parsed) || parsed < 0) {
    return fallback;
  }
  return parsed;
};

const normalizeTags = (value) => {
  if (!value) {
    return [];
  }

  let rawTags = value;
  if (typeof rawTags === "string") {
    try {
      rawTags = JSON.parse(rawTags);
    } catch {
      rawTags = rawTags.split(",");
    }
  }

  if (!Array.isArray(rawTags)) {
    return [];
  }

  return [...new Set(rawTags.map((tag) => String(tag).trim()).filter(Boolean))].slice(0, 8);
};

const createSegment = (sortOrder) => String(sortOrder).padStart(6, "0");

const formatPost = (post, likedPostIds = new Set()) => {
  const postJson = post.toJSON();
  return {
    ...postJson,
    isLikedByCurrentUser: likedPostIds.has(postJson.id),
  };
};

const formatComment = (comment) => {
  const commentJson = comment.toJSON();

  if (commentJson.isRemovedByModerator) {
    return {
      ...commentJson,
      content: "Removed by moderator",
      replies: [],
    };
  }

  if (commentJson.isDeletedByAuthor) {
    return {
      ...commentJson,
      content: "Comment deleted by author",
      replies: [],
    };
  }

  return {
    ...commentJson,
    replies: [],
  };
};

const buildCommentTree = (comments) => {
  const byId = new Map();
  const roots = [];

  comments.forEach((comment) => {
    byId.set(comment.id, comment);
  });

  comments.forEach((comment) => {
    if (comment.parentCommentId && byId.has(comment.parentCommentId)) {
      byId.get(comment.parentCommentId).replies.push(comment);
    } else {
      roots.push(comment);
    }
  });

  return roots;
};

const annotateReplyAvailability = (comments) => {
  comments.forEach((comment) => {
    comment.hasMoreReplies =
      !comment.isRemovedByModerator &&
      Number(comment.replyCount || 0) > Number(comment.replies?.length || 0);

    if (comment.replies?.length > 0) {
      annotateReplyAvailability(comment.replies);
    }
  });

  return comments;
};

const addCurrentUserLikes = async (posts, userId) => {
  if (!userId || posts.length === 0) {
    return posts.map((post) => formatPost(post));
  }

  const likes = await ForumPostLike.findAll({
    where: {
      userId,
      postId: posts.map((post) => post.id),
    },
    attributes: ["postId"],
  });

  const likedIds = new Set(likes.map((like) => like.postId));
  return posts.map((post) => formatPost(post, likedIds));
};

const touchPostActivity = async (postId, transaction) => {
  await ForumPost.update(
    { lastActivityAt: new Date() },
    {
      where: { id: postId },
      transaction,
    }
  );
};

const getForumPosts = async (req, res) => {
  try {
    const page = parsePositiveInt(req.query.page, 1);
    const limit = parsePositiveInt(req.query.limit, DEFAULT_PAGE_SIZE);
    const sort = SORT_OPTIONS[req.query.sort] ? req.query.sort : "newest";
    const offset = (page - 1) * limit;
    const tag = typeof req.query.tag === "string" ? req.query.tag.trim() : "";

    const where = { isActive: true };
    if (tag) {
      where.tags = {
        [Op.iLike]: `%${tag}%`,
      };
    }

    const { rows, count } = await ForumPost.findAndCountAll({
      where,
      limit,
      offset,
      order: SORT_OPTIONS[sort],
    });

    const posts = await addCurrentUserLikes(rows, req.user?.id || null);

    res.status(200).json({
      success: true,
      posts,
      pagination: {
        total: count,
        page,
        limit,
        totalPages: Math.ceil(count / limit),
      },
    });
  } catch (error) {
    console.error("Get forum posts error:", error);
    res.status(500).json({
      success: false,
      message: "Failed to fetch forum posts",
      error: error.message,
    });
  }
};

const createForumPost = async (req, res) => {
  let transaction;

  try {
    const { title, description } = req.body;
    const tags = normalizeTags(req.body.tags);

    if (!title || !description) {
      return res.status(400).json({
        success: false,
        message: "Title and description are required",
      });
    }

    const user = await User.findByPk(req.user.id);
    if (!user) {
      return res.status(404).json({
        success: false,
        message: "User not found",
      });
    }

    const accessStatus = checkForumUserAccess(user);
    if (!accessStatus.allowed) {
      return res.status(403).json({
        success: false,
        message: accessStatus.message,
      });
    }

    const duplicateCheck = await checkExactDuplicateBeforeCreate({
      title,
      description,
    });

    if (duplicateCheck.hasDuplicate) {
      return res.status(409).json(
        buildDuplicateResponsePayload(duplicateCheck.matches)
      );
    }

    transaction = await sequelize.transaction();

    const userForTransaction = await User.findByPk(req.user.id, { transaction });
    const authorSnapshot = await buildForumAuthorSnapshot(userForTransaction, transaction);
    const imageUrls = req.fileUrls && req.fileUrls.length > 0 ? req.fileUrls : [];

    const post = await ForumPost.create(
      {
        ...authorSnapshot,
        title: String(title).trim(),
        description: String(description).trim(),
        image: imageUrls[0] || null,
        images: imageUrls,
        tags,
        contentFingerprint: duplicateCheck.fingerprint.hash,
        titleNormalized: duplicateCheck.fingerprint.normalizedTitle,
        duplicateCheckStatus: "pending",
        duplicateCheckReason: null,
        duplicateOfPostId: null,
        duplicateConfidence: null,
        aiModerationStatus: "pending",
        aiModerationReason: null,
        aiModeratedAt: null,
      },
      { transaction }
    );

    await transaction.commit();

    res.status(201).json({
      success: true,
      message: "Forum post created and queued for moderation",
      post,
    });
  } catch (error) {
    if (transaction) {
      await transaction.rollback();
    }
    console.error("Create forum post error:", error);
    res.status(500).json({
      success: false,
      message: "Failed to create forum post",
      error: error.message,
    });
  }
};

const getForumPostById = async (req, res) => {
  try {
    const post = await ForumPost.findOne({
      where: {
        id: req.params.postId,
        isActive: true,
      },
    });

    if (!post) {
      return res.status(404).json({
        success: false,
        message: "Forum post not found",
      });
    }
    const [formattedPost] = await addCurrentUserLikes([post], req.user?.id || null);

    res.status(200).json({
      success: true,
      post: formattedPost,
    });
  } catch (error) {
    console.error("Get forum post detail error:", error);
    res.status(500).json({
      success: false,
      message: "Failed to fetch forum post",
      error: error.message,
    });
  }
};

const toggleForumPostLike = async (req, res) => {
  const transaction = await sequelize.transaction();

  try {
    const post = await ForumPost.findOne({
      where: {
        id: req.params.postId,
        isActive: true,
      },
      transaction,
    });
    if (!post) {
      await transaction.rollback();
      return res.status(404).json({
        success: false,
        message: "Forum post not found",
      });
    }

    const existingLike = await ForumPostLike.findOne({
      where: {
        postId: post.id,
        userId: req.user.id,
      },
      transaction,
    });

    let isLiked;

    if (existingLike) {
      await existingLike.destroy({ transaction });
      await post.decrement("likeCount", { by: 1, transaction });
      isLiked = false;
    } else {
      await ForumPostLike.create(
        {
          postId: post.id,
          userId: req.user.id,
        },
        { transaction }
      );
      await post.increment("likeCount", { by: 1, transaction });
      isLiked = true;
    }

    await touchPostActivity(post.id, transaction);
    await post.reload({ transaction });
    await transaction.commit();

    res.status(200).json({
      success: true,
      message: isLiked ? "Post liked" : "Like removed",
      likeCount: post.likeCount,
      isLiked,
    });
  } catch (error) {
    await transaction.rollback();
    console.error("Toggle forum like error:", error);
    res.status(500).json({
      success: false,
      message: "Failed to update like",
      error: error.message,
    });
  }
};

const shareForumPost = async (req, res) => {
  try {
    const post = await ForumPost.findOne({
      where: {
        id: req.params.postId,
        isActive: true,
      },
    });
    if (!post) {
      return res.status(404).json({
        success: false,
        message: "Forum post not found",
      });
    }

    await post.increment("shareCount", { by: 1 });
    await post.update({ lastActivityAt: new Date() });

    res.status(200).json({
      success: true,
      message: "Share count updated",
      shareCount: post.shareCount + 1,
    });
  } catch (error) {
    console.error("Share forum post error:", error);
    res.status(500).json({
      success: false,
      message: "Failed to update share count",
      error: error.message,
    });
  }
};

const createForumComment = async (req, res) => {
  let transaction;

  try {
    const { parentCommentId } = req.body;
    const rawContent = req.body.content ?? req.body.body;
    const content = rawContent ? String(rawContent).trim() : "";

    if (!content) {
      return res.status(400).json({
        success: false,
        message: "Comment content is required",
      });
    }

    const user = await User.findByPk(req.user.id);
    if (!user) {
      return res.status(404).json({
        success: false,
        message: "User not found",
      });
    }

    const accessStatus = checkForumUserAccess(user);
    if (!accessStatus.allowed) {
      return res.status(403).json({
        success: false,
        message: accessStatus.message,
      });
    }

    transaction = await sequelize.transaction();

    const post = await ForumPost.findOne({
      where: {
        id: req.params.postId,
        isActive: true,
      },
      transaction,
    });
    if (!post) {
      await transaction.rollback();
      return res.status(404).json({
        success: false,
        message: "Forum post not found",
      });
    }

    let parentComment = null;
    if (parentCommentId) {
      parentComment = await ForumComment.findOne({
        where: {
          id: parentCommentId,
          postId: post.id,
        },
        transaction,
      });

      if (!parentComment) {
        await transaction.rollback();
        return res.status(404).json({
          success: false,
          message: "Parent comment not found",
        });
      }

      if (parentComment.isRemovedByModerator || parentComment.isDeletedByAuthor) {
        await transaction.rollback();
        return res.status(400).json({
          success: false,
          message: "Replies are not allowed on this comment",
        });
      }
    }

    const siblingMax = await ForumComment.max("sortOrder", {
      where: {
        postId: post.id,
        parentCommentId: parentComment ? parentComment.id : null,
      },
      transaction,
    });

    const nextSortOrder = (Number.isFinite(siblingMax) ? siblingMax : 0) + 1;
    const segment = createSegment(nextSortOrder);
    const path = parentComment ? `${parentComment.path}.${segment}` : segment;

    const userForTransaction = await User.findByPk(req.user.id, { transaction });
    const authorSnapshot = await buildForumAuthorSnapshot(userForTransaction, transaction);
//ai moderation is temporarily bypassed, setting to approved with reason for now. Will implement actual moderation flow in next phase
    const comment = await ForumComment.create(
      {
        ...authorSnapshot,
        postId: post.id,
        parentCommentId: parentComment ? parentComment.id : null,
        content,
        depth: parentComment ? parentComment.depth + 1 : 0,
        sortOrder: nextSortOrder,
        path,
        aiModerationStatus: "approved",
        aiModerationReason: "Comment AI moderation temporarily bypassed",
        aiModeratedAt: new Date(),
        isRemovedByModerator: false,
      },
      { transaction }
    );

    await post.increment("commentCount", { by: 1, transaction });
    await touchPostActivity(post.id, transaction);

    if (parentComment) {
      await ForumComment.increment("replyCount", {
        by: 1,
        where: { id: parentComment.id },
        transaction,
      });

      const ancestorPaths = parentComment.path.split(".").map((_, index, items) =>
        items.slice(0, index + 1).join(".")
      );

      await ForumComment.increment("descendantCount", {
        by: 1,
        where: {
          postId: post.id,
          path: {
            [Op.in]: ancestorPaths,
          },
        },
        transaction,
      });
    }

    await transaction.commit();

    res.status(201).json({
      success: true,
      message: "Comment added and queued for moderation",
      comment,
    });
  } catch (error) {
    if (transaction) {
      await transaction.rollback();
    }
    console.error("Create forum comment error:", error);
    res.status(500).json({
      success: false,
      message: "Failed to create comment",
      error: error.message,
    });
  }
};

const getForumComments = async (req, res) => {
  try {
    const page = parsePositiveInt(req.query.page, 1);
    const limit = parsePositiveInt(req.query.limit, DEFAULT_THREAD_PAGE_SIZE);
    const depthCap = Math.min(parsePositiveInt(req.query.depthCap, DEFAULT_INITIAL_DEPTH_CAP), 6);
    const offset = (page - 1) * limit;

    const post = await ForumPost.findOne({
      where: {
        id: req.params.postId,
        isActive: true,
      },
      attributes: ["id"],
    });

    if (!post) {
      return res.status(404).json({
        success: false,
        message: "Forum post not found",
      });
    }

    const { rows: topLevelComments, count } = await ForumComment.findAndCountAll({
      where: {
        postId: post.id,
        parentCommentId: null,
      },
      order: [["sortOrder", "ASC"], ["createdAt", "ASC"]],
      limit,
      offset,
    });

    if (topLevelComments.length === 0) {
      return res.status(200).json({
        success: true,
        comments: [],
        pagination: {
          total: count,
          page,
          limit,
          totalPages: Math.ceil(count / limit),
        },
      });
    }

    const commentClauses = topLevelComments.flatMap((comment) => [
      { id: comment.id },
      {
        [Op.and]: [
          { path: { [Op.like]: `${comment.path}.%` } },
          { depth: { [Op.lte]: comment.depth + depthCap } },
        ],
      },
    ]);

    const comments = await ForumComment.findAll({
      where: {
        postId: post.id,
        [Op.or]: commentClauses,
      },
      order: [["path", "ASC"]],
    });

    const formattedComments = comments.map((comment) => formatComment(comment));
    const threadedComments = annotateReplyAvailability(buildCommentTree(formattedComments));

    res.status(200).json({
      success: true,
      comments: threadedComments,
      pagination: {
        total: count,
        page,
        limit,
        totalPages: Math.ceil(count / limit),
      },
    });
  } catch (error) {
    console.error("Get forum comments error:", error);
    res.status(500).json({
      success: false,
      message: "Failed to fetch comments",
      error: error.message,
    });
  }
};

const getForumCommentReplies = async (req, res) => {
  try {
    const { postId, parentCommentId } = req.params;
    const offset = parseNonNegativeInt(req.query.offset, 0);
    const limit = parsePositiveInt(req.query.limit, DEFAULT_REPLY_PAGE_SIZE);

    const post = await ForumPost.findOne({
      where: {
        id: postId,
        isActive: true,
      },
      attributes: ["id"],
    });

    if (!post) {
      return res.status(404).json({
        success: false,
        message: "Forum post not found",
      });
    }

    const parentComment = await ForumComment.findOne({
      where: {
        id: parentCommentId,
        postId: post.id,
      },
      attributes: ["id", "postId"],
    });

    if (!parentComment) {
      return res.status(404).json({
        success: false,
        message: "Parent comment not found",
      });
    }

    const { rows, count } = await ForumComment.findAndCountAll({
      where: {
        postId: post.id,
        parentCommentId: parentComment.id,
      },
      order: [["sortOrder", "ASC"], ["createdAt", "ASC"]],
      offset,
      limit,
    });

    const replies = rows.map((comment) => {
      const formatted = formatComment(comment);
      return {
        ...formatted,
        hasMoreReplies: !formatted.isRemovedByModerator && Number(formatted.replyCount || 0) > 0,
      };
    });

    res.status(200).json({
      success: true,
      parentCommentId,
      replies,
      pagination: {
        total: count,
        offset,
        limit,
        hasMore: offset + replies.length < count,
      },
    });
  } catch (error) {
    console.error("Get forum comment replies error:", error);
    res.status(500).json({
      success: false,
      message: "Failed to fetch replies",
      error: error.message,
    });
  }
};

const createForumPostReport = async (req, res) => {
  try {
    const { reason, details } = req.body;

    if (!REPORT_REASONS.has(reason)) {
      return res.status(400).json({
        success: false,
        message: "Invalid report reason selected",
      });
    }

    const post = await ForumPost.findByPk(req.params.postId);
    if (!post) {
      return res.status(404).json({
        success: false,
        message: "Forum post not found",
      });
    }

    if (post.authorUserId === req.user.id) {
      return res.status(400).json({
        success: false,
        message: "You cannot report your own post",
      });
    }

    const existingPendingReport = await ForumPostReport.findOne({
      where: {
        postId: post.id,
        reporterUserId: req.user.id,
        status: "pending",
      },
    });

    if (existingPendingReport) {
      return res.status(409).json({
        success: false,
        message: "You have already reported this post. Admin review is pending.",
      });
    }

    await ForumPostReport.create({
      postId: post.id,
      reporterUserId: req.user.id,
      reason,
      details: details ? String(details).trim().slice(0, 1000) : null,
    });

    res.status(201).json({
      success: true,
      message: "Report submitted successfully. Our moderators will review it.",
    });
  } catch (error) {
    console.error("Create forum post report error:", error);
    res.status(500).json({
      success: false,
      message: "Failed to submit report",
      error: error.message,
    });
  }
};

const getMyForumPosts = async (req, res) => {
  try {
    const page = parsePositiveInt(req.query.page, 1);
    const limit = parsePositiveInt(req.query.limit, 20);
    const offset = (page - 1) * limit;

    const { rows, count } = await ForumPost.findAndCountAll({
      where: { authorUserId: req.user.id },
      order: [["createdAt", "DESC"]],
      limit,
      offset,
    });

    const postIds = rows.map((p) => p.id);
    const appeals = postIds.length
      ? await ForumPostAppeal.findAll({
          where: { postId: { [Op.in]: postIds }, userId: req.user.id },
          attributes: ["postId", "status", "adminNote", "createdAt"],
        })
      : [];
    const appealMap = {};
    for (const a of appeals) {
      appealMap[a.postId] = { status: a.status, adminNote: a.adminNote, createdAt: a.createdAt };
    }

    const posts = rows.map((p) => ({
      id: p.id,
      title: p.title,
      description: p.description,
      tags: p.tags,
      images: p.images,
      authorDisplayMode: p.authorDisplayMode,
      authorName: p.authorName,
      likeCount: p.likeCount,
      commentCount: p.commentCount,
      shareCount: p.shareCount,
      isActive: p.isActive,
      moderationReason: p.moderationReason,
      aiModerationReason: p.aiModerationReason,
      aiModerationStatus: p.aiModerationStatus,
      duplicateCheckStatus: p.duplicateCheckStatus,
      duplicateCheckReason: p.duplicateCheckReason,
      duplicateOfPostId: p.duplicateOfPostId,
      duplicateConfidence: p.duplicateConfidence,
      duplicateOfPostUrl: p.duplicateOfPostId ? `/forum/${p.duplicateOfPostId}` : null,
      createdAt: p.createdAt,
      appeal: appealMap[p.id] || null,
    }));

    res.status(200).json({
      success: true,
      posts,
      pagination: { total: count, page, limit, totalPages: Math.ceil(count / limit) },
    });
  } catch (error) {
    console.error("Get my forum posts error:", error);
    res.status(500).json({ success: false, message: "Failed to fetch your posts", error: error.message });
  }
};

const createForumPostAppeal = async (req, res) => {
  try {
    const { postId } = req.params;
    const { message } = req.body;

    const post = await ForumPost.findOne({ where: { id: postId, authorUserId: req.user.id } });
    if (!post) {
      return res.status(404).json({ success: false, message: "Post not found or you are not the author" });
    }
    if (post.isActive) {
      return res.status(400).json({ success: false, message: "This post is still active. Appeals are only for removed posts." });
    }

    const existing = await ForumPostAppeal.findOne({ where: { postId, userId: req.user.id } });
    if (existing) {
      if (existing.status === "pending") {
        return res.status(409).json({ success: false, message: "You already have a pending appeal for this post." });
      }
      if (existing.status === "rejected") {
        return res.status(409).json({ success: false, message: "Your appeal was reviewed and rejected. No further appeals are allowed." });
      }
      if (existing.status === "approved") {
        return res.status(409).json({ success: false, message: "This post has already been approved by admin." });
      }
    }

    const appeal = await ForumPostAppeal.create({
      postId,
      userId: req.user.id,
      message: message ? String(message).trim().slice(0, 1000) : null,
      status: "pending",
    });

    res.status(201).json({
      success: true,
      message: "Your review request has been submitted. Admin will review it soon.",
      appeal,
    });
  } catch (error) {
    console.error("Create forum post appeal error:", error);
    res.status(500).json({ success: false, message: "Failed to submit appeal", error: error.message });
  }
};

const updateForumPost = async (req, res) => {
  try {
    const { postId } = req.params;
    const { title, description } = req.body;
    const tags = normalizeTags(req.body.tags);
    const normalizedTitle = String(title || "").trim();
    const normalizedDescription = String(description || "").trim();

    if (!normalizedTitle || !normalizedDescription) {
      return res.status(400).json({
        success: false,
        message: "Title and description are required",
      });
    }

    const post = await ForumPost.findOne({
      where: {
        id: postId,
        authorUserId: req.user.id,
      },
    });

    if (!post) {
      return res.status(404).json({
        success: false,
        message: "Post not found or you are not the author",
      });
    }

    if (!post.isActive) {
      return res.status(400).json({
        success: false,
        message: "Removed posts cannot be edited",
      });
    }

    const fingerprint = createFingerprint({
      title: normalizedTitle,
      description: normalizedDescription,
    });

    await post.update({
      title: normalizedTitle,
      description: normalizedDescription,
      tags,
      contentFingerprint: fingerprint.hash,
      titleNormalized: fingerprint.normalizedTitle,
      contentEmbedding: null,
      isActive: true,
      aiModerationStatus: "pending",
      aiModerationReason: null,
      aiModeratedAt: null,
      duplicateCheckStatus: "pending",
      duplicateCheckReason: null,
      duplicateOfPostId: null,
      duplicateConfidence: null,
      moderationReason: null,
      lastActivityAt: new Date(),
    });

    res.status(200).json({
      success: true,
      message: "Post updated and queued for moderation",
      post,
    });
  } catch (error) {
    console.error("Update forum post error:", error);
    res.status(500).json({
      success: false,
      message: "Failed to update post",
      error: error.message,
    });
  }
};

const deleteForumPost = async (req, res) => {
  try {
    const { postId } = req.params;

    const post = await ForumPost.findOne({
      where: {
        id: postId,
        authorUserId: req.user.id,
      },
    });

    if (!post) {
      return res.status(404).json({
        success: false,
        message: "Post not found or you are not the author",
      });
    }

    await post.destroy();

    res.status(200).json({
      success: true,
      message: "Post permanently deleted",
    });
  } catch (error) {
    console.error("Delete forum post error:", error);
    res.status(500).json({
      success: false,
      message: "Failed to delete post",
      error: error.message,
    });
  }
};

const updateForumComment = async (req, res) => {
  try {
    const { postId, commentId } = req.params;
    const rawContent = req.body.content ?? req.body.body;
    const content = rawContent ? String(rawContent).trim() : "";

    if (!content) {
      return res.status(400).json({
        success: false,
        message: "Comment content is required",
      });
    }

    const comment = await ForumComment.findOne({
      where: {
        id: commentId,
        postId,
      },
    });

    if (!comment) {
      return res.status(404).json({
        success: false,
        message: "Comment not found",
      });
    }

    if (comment.authorUserId !== req.user.id) {
      return res.status(403).json({
        success: false,
        message: "You can only edit your own comment",
      });
    }

    if (comment.isRemovedByModerator) {
      return res.status(400).json({
        success: false,
        message: "Moderated comments cannot be edited",
      });
    }

    if (comment.isDeletedByAuthor) {
      return res.status(400).json({
        success: false,
        message: "Deleted comments cannot be edited",
      });
    }

    await comment.update({
      content,
      isEdited: true,
      editedAt: new Date(),
      aiModerationStatus: "approved",
      aiModerationReason: "Comment AI moderation temporarily bypassed",
      aiModeratedAt: new Date(),
    });

    res.status(200).json({
      success: true,
      message: "Comment updated",
      comment,
    });
  } catch (error) {
    console.error("Update forum comment error:", error);
    res.status(500).json({
      success: false,
      message: "Failed to update comment",
      error: error.message,
    });
  }
};

const deleteForumComment = async (req, res) => {
  try {
    const { postId, commentId } = req.params;

    const comment = await ForumComment.findOne({
      where: {
        id: commentId,
        postId,
      },
    });

    if (!comment) {
      return res.status(404).json({
        success: false,
        message: "Comment not found",
      });
    }

    if (comment.authorUserId !== req.user.id) {
      return res.status(403).json({
        success: false,
        message: "You can only delete your own comment",
      });
    }

    if (comment.isRemovedByModerator) {
      return res.status(400).json({
        success: false,
        message: "Moderated comments cannot be deleted",
      });
    }

    if (comment.isDeletedByAuthor) {
      return res.status(200).json({
        success: true,
        message: "Comment already deleted",
      });
    }

    await comment.update({
      isDeletedByAuthor: true,
      deletedAt: new Date(),
      content: "",
      isEdited: false,
      editedAt: null,
      aiModerationStatus: "approved",
      aiModerationReason: "Deleted by author",
      aiModeratedAt: new Date(),
    });

    res.status(200).json({
      success: true,
      message: "Comment deleted",
    });
  } catch (error) {
    console.error("Delete forum comment error:", error);
    res.status(500).json({
      success: false,
      message: "Failed to delete comment",
      error: error.message,
    });
  }
};

module.exports = {
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
};