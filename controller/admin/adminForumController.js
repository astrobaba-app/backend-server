const { Op } = require("sequelize");
const ForumPost = require("../../model/forum/forumPost");
const ForumPostReport = require("../../model/forum/forumPostReport");
const ForumPostAppeal = require("../../model/forum/forumPostAppeal");
const User = require("../../model/user/userAuth");

const parsePositiveInt = (value, fallback) => {
  const parsed = Number.parseInt(value, 10);
  if (!Number.isFinite(parsed) || parsed <= 0) {
    return fallback;
  }
  return parsed;
};

const getForumPostsForAdmin = async (req, res) => {
  try {
    const page = parsePositiveInt(req.query.page, 1);
    const limit = parsePositiveInt(req.query.limit, 20);
    const offset = (page - 1) * limit;
    const status = (req.query.status || "all").toLowerCase();
    const search = String(req.query.search || "").trim();

    const where = {};

    if (status === "active") {
      where.isActive = true;
    }

    if (status === "inactive") {
      where.isActive = false;
    }

    if (search) {
      where[Op.or] = [
        { title: { [Op.iLike]: `%${search}%` } },
        { description: { [Op.iLike]: `%${search}%` } },
        { authorName: { [Op.iLike]: `%${search}%` } },
      ];
    }

    const { rows: posts, count } = await ForumPost.findAndCountAll({
      where,
      order: [["createdAt", "DESC"]],
      limit,
      offset,
      include: [
        {
          model: User,
          as: "author",
          attributes: ["id", "fullName", "mobile", "email", "forumWarningsCount", "forumIsBanned", "forumBlockedUntil"],
          required: false,
        },
      ],
    });

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
    console.error("Get admin forum posts error:", error);
    res.status(500).json({
      success: false,
      message: "Failed to fetch forum posts",
      error: error.message,
    });
  }
};

const updateForumPostStatus = async (req, res) => {
  try {
    const { postId } = req.params;
    const { isActive, reason } = req.body;

    if (typeof isActive !== "boolean") {
      return res.status(400).json({
        success: false,
        message: "isActive must be a boolean",
      });
    }

    const post = await ForumPost.findByPk(postId);
    if (!post) {
      return res.status(404).json({
        success: false,
        message: "Forum post not found",
      });
    }

    await post.update({
      isActive,
      moderationReason: reason || null,
      moderatedByAdminId: req.user.id,
      moderatedAt: new Date(),
    });

    res.status(200).json({
      success: true,
      message: isActive ? "Post activated successfully" : "Post deactivated successfully",
      post,
    });
  } catch (error) {
    console.error("Update forum post status error:", error);
    res.status(500).json({
      success: false,
      message: "Failed to update forum post status",
      error: error.message,
    });
  }
};

const updateForumUserRestriction = async (req, res) => {
  try {
    const { userId } = req.params;
    const { forumIsBanned, forumBlockedUntil, resetWarnings } = req.body;

    const user = await User.findByPk(userId);
    if (!user) {
      return res.status(404).json({
        success: false,
        message: "User not found",
      });
    }

    if (typeof forumIsBanned === "boolean") {
      user.forumIsBanned = forumIsBanned;
      if (forumIsBanned) {
        user.forumBlockedUntil = null;
      }
    }

    if (forumBlockedUntil !== undefined) {
      user.forumBlockedUntil = forumBlockedUntil ? new Date(forumBlockedUntil) : null;
    }

    if (resetWarnings === true) {
      user.forumWarningsCount = 0;
    }

    await user.save();

    res.status(200).json({
      success: true,
      message: "User forum restriction updated successfully",
      user: {
        id: user.id,
        fullName: user.fullName,
        mobile: user.mobile,
        forumWarningsCount: user.forumWarningsCount,
        forumIsBanned: user.forumIsBanned,
        forumBlockedUntil: user.forumBlockedUntil,
      },
    });
  } catch (error) {
    console.error("Update forum user restriction error:", error);
    res.status(500).json({
      success: false,
      message: "Failed to update user restriction",
      error: error.message,
    });
  }
};

const getForumReportsForAdmin = async (req, res) => {
  try {
    const page = parsePositiveInt(req.query.page, 1);
    const limit = parsePositiveInt(req.query.limit, 20);
    const offset = (page - 1) * limit;
    const status = String(req.query.status || "all").toLowerCase();

    const where = {};
    if (["pending", "resolved", "dismissed"].includes(status)) {
      where.status = status;
    }

    const { rows: reports, count } = await ForumPostReport.findAndCountAll({
      where,
      order: [["createdAt", "DESC"]],
      limit,
      offset,
      include: [
        {
          model: ForumPost,
          as: "post",
          attributes: ["id", "title", "description", "authorName", "isActive", "moderationReason", "createdAt"],
        },
        {
          model: User,
          as: "reporter",
          attributes: ["id", "fullName", "mobile"],
        },
      ],
    });

    res.status(200).json({
      success: true,
      reports,
      pagination: {
        total: count,
        page,
        limit,
        totalPages: Math.ceil(count / limit),
      },
    });
  } catch (error) {
    console.error("Get admin forum reports error:", error);
    res.status(500).json({
      success: false,
      message: "Failed to fetch forum reports",
      error: error.message,
    });
  }
};

const updateForumReportStatus = async (req, res) => {
  try {
    const { reportId } = req.params;
    const { status, adminNote } = req.body;

    if (!["resolved", "dismissed", "pending"].includes(status)) {
      return res.status(400).json({
        success: false,
        message: "Invalid report status",
      });
    }

    const report = await ForumPostReport.findByPk(reportId);
    if (!report) {
      return res.status(404).json({
        success: false,
        message: "Report not found",
      });
    }

    await report.update({
      status,
      adminNote: adminNote ? String(adminNote).trim().slice(0, 1000) : null,
      reviewedByAdminId: req.user.id,
      reviewedAt: new Date(),
    });

    res.status(200).json({
      success: true,
      message: "Report updated successfully",
      report,
    });
  } catch (error) {
    console.error("Update forum report status error:", error);
    res.status(500).json({
      success: false,
      message: "Failed to update forum report",
      error: error.message,
    });
  }
};

const getForumAppealsForAdmin = async (req, res) => {
  try {
    const page = parsePositiveInt(req.query.page, 1);
    const limit = parsePositiveInt(req.query.limit, 20);
    const offset = (page - 1) * limit;
    const status = String(req.query.status || "all").toLowerCase();

    const where = {};
    if (["pending", "approved", "rejected"].includes(status)) {
      where.status = status;
    }

    const { rows: appeals, count } = await ForumPostAppeal.findAndCountAll({
      where,
      order: [["createdAt", "DESC"]],
      limit,
      offset,
      include: [
        {
          model: ForumPost,
          as: "post",
          attributes: ["id", "title", "description", "authorName", "isActive", "moderationReason", "aiModerationReason", "authorDisplayMode", "createdAt"],
        },
        {
          model: User,
          as: "appellant",
          attributes: ["id", "fullName", "mobile", "email"],
        },
      ],
    });

    res.status(200).json({
      success: true,
      appeals,
      pagination: { total: count, page, limit, totalPages: Math.ceil(count / limit) },
    });
  } catch (error) {
    console.error("Get admin forum appeals error:", error);
    res.status(500).json({ success: false, message: "Failed to fetch forum appeals", error: error.message });
  }
};

const updateForumAppealStatus = async (req, res) => {
  try {
    const { appealId } = req.params;
    const { status, adminNote } = req.body;

    if (!["approved", "rejected"].includes(status)) {
      return res.status(400).json({ success: false, message: "Status must be 'approved' or 'rejected'" });
    }

    const appeal = await ForumPostAppeal.findByPk(appealId);
    if (!appeal) {
      return res.status(404).json({ success: false, message: "Appeal not found" });
    }

    await appeal.update({
      status,
      adminNote: adminNote ? String(adminNote).trim().slice(0, 1000) : null,
      reviewedByAdminId: req.user.id,
      reviewedAt: new Date(),
    });

    if (status === "approved") {
      await ForumPost.update(
        { isActive: true, moderationReason: null, moderatedByAdminId: req.user.id, moderatedAt: new Date() },
        { where: { id: appeal.postId } },
      );
    }

    res.status(200).json({
      success: true,
      message: status === "approved" ? "Appeal approved and post reactivated" : "Appeal rejected",
      appeal,
    });
  } catch (error) {
    console.error("Update forum appeal status error:", error);
    res.status(500).json({ success: false, message: "Failed to update appeal", error: error.message });
  }
};

module.exports = {
  getForumAppealsForAdmin,
  getForumPostsForAdmin,
  getForumReportsForAdmin,
  updateForumAppealStatus,
  updateForumPostStatus,
  updateForumReportStatus,
  updateForumUserRestriction,
};