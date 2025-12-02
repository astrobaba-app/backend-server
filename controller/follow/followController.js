const Follow = require("../../model/follow/follow");
const Astrologer = require("../../model/astrologer/astrologer");
const User = require("../../model/user/userAuth");
const { Op } = require("sequelize");

// Follow an astrologer (User)
const followAstrologer = async (req, res) => {
  try {
    const userId = req.user.id;
    const { astrologerId } = req.body;

    if (!astrologerId) {
      return res.status(400).json({
        success: false,
        message: "Astrologer ID is required",
      });
    }

    // Check if astrologer exists
    const astrologer = await Astrologer.findOne({
      where: { id: astrologerId, isApproved: true, isActive: true },
    });

    if (!astrologer) {
      return res.status(404).json({
        success: false,
        message: "Astrologer not found or not available",
      });
    }

    // Check if already following
    const existingFollow = await Follow.findOne({
      where: { userId, astrologerId },
    });

    if (existingFollow) {
      return res.status(400).json({
        success: false,
        message: "You are already following this astrologer",
      });
    }

    // Create follow relationship
    const follow = await Follow.create({
      userId,
      astrologerId,
    });

    res.status(201).json({
      success: true,
      message: "Successfully followed astrologer",
      follow: {
        id: follow.id,
        astrologer: {
          id: astrologer.id,
          fullName: astrologer.fullName,
          photo: astrologer.photo,
          rating: astrologer.rating,
        },
      },
    });
  } catch (error) {
    console.error("Follow astrologer error:", error);
    res.status(500).json({
      success: false,
      message: "Failed to follow astrologer",
      error: error.message,
    });
  }
};

// Unfollow an astrologer (User)
const unfollowAstrologer = async (req, res) => {
  try {
    const userId = req.user.id;
    const { astrologerId } = req.params;

    if (!astrologerId) {
      return res.status(400).json({
        success: false,
        message: "Astrologer ID is required",
      });
    }

    // Find and delete follow relationship
    const follow = await Follow.findOne({
      where: { userId, astrologerId },
    });

    if (!follow) {
      return res.status(404).json({
        success: false,
        message: "You are not following this astrologer",
      });
    }

    await follow.destroy();

    res.status(200).json({
      success: true,
      message: "Successfully unfollowed astrologer",
    });
  } catch (error) {
    console.error("Unfollow astrologer error:", error);
    res.status(500).json({
      success: false,
      message: "Failed to unfollow astrologer",
      error: error.message,
    });
  }
};

// Get all astrologers followed by user
const getMyFollowing = async (req, res) => {
  try {
    const userId = req.user.id;
    const { page = 1, limit = 20 } = req.query;
    const offset = (page - 1) * limit;

    const { rows: follows, count } = await Follow.findAndCountAll({
      where: { userId },
      include: [
        {
          model: Astrologer,
          as: "astrologer",
          attributes: [
            "id",
            "fullName",
            "photo",
            "rating",
            "yearsOfExperience",
            "pricePerMinute",
            "isOnline",
            "totalConsultations",
            "skills",
            "languages",
          ],
        },
      ],
      order: [["createdAt", "DESC"]],
      limit: parseInt(limit),
      offset: parseInt(offset),
    });

    // Extract astrologer data
    const following = follows.map((follow) => ({
      followId: follow.id,
      followedAt: follow.createdAt,
      ...follow.astrologer.toJSON(),
    }));

    res.status(200).json({
      success: true,
      following,
      totalFollowing: count,
      pagination: {
        total: count,
        page: parseInt(page),
        limit: parseInt(limit),
        totalPages: Math.ceil(count / limit),
      },
    });
  } catch (error) {
    console.error("Get following error:", error);
    res.status(500).json({
      success: false,
      message: "Failed to fetch following list",
      error: error.message,
    });
  }
};

// Check if user is following an astrologer
const checkIfFollowing = async (req, res) => {
  try {
    const userId = req.user.id;
    const { astrologerId } = req.params;

    const isFollowing = await Follow.findOne({
      where: { userId, astrologerId },
    });

    res.status(200).json({
      success: true,
      isFollowing: !!isFollowing,
      followId: isFollowing ? isFollowing.id : null,
    });
  } catch (error) {
    console.error("Check following error:", error);
    res.status(500).json({
      success: false,
      message: "Failed to check following status",
      error: error.message,
    });
  }
};

// Get followers of an astrologer (Astrologer view)
const getMyFollowers = async (req, res) => {
  try {
    const astrologerId = req.astrologer.id;
    const { page = 1, limit = 20 } = req.query;
    const offset = (page - 1) * limit;

    const { rows: follows, count } = await Follow.findAndCountAll({
      where: { astrologerId },
      include: [
        {
          model: User,
          as: "user",
          attributes: ["id", "fullName", "email", "createdAt"],
        },
      ],
      order: [["createdAt", "DESC"]],
      limit: parseInt(limit),
      offset: parseInt(offset),
    });

    // Extract user data
    const followers = follows.map((follow) => ({
      followId: follow.id,
      followedAt: follow.createdAt,
      ...follow.user.toJSON(),
    }));

    res.status(200).json({
      success: true,
      followers,
      totalFollowers: count,
      pagination: {
        total: count,
        page: parseInt(page),
        limit: parseInt(limit),
        totalPages: Math.ceil(count / limit),
      },
    });
  } catch (error) {
    console.error("Get followers error:", error);
    res.status(500).json({
      success: false,
      message: "Failed to fetch followers list",
      error: error.message,
    });
  }
};

// Get follower count for an astrologer (Public)
const getFollowerCount = async (req, res) => {
  try {
    const { astrologerId } = req.params;

    const count = await Follow.count({
      where: { astrologerId },
    });

    res.status(200).json({
      success: true,
      astrologerId,
      followerCount: count,
    });
  } catch (error) {
    console.error("Get follower count error:", error);
    res.status(500).json({
      success: false,
      message: "Failed to get follower count",
      error: error.message,
    });
  }
};

// Get multiple astrologers with follow status
const getAstrologersWithFollowStatus = async (req, res) => {
  try {
    const userId = req.user.id;
    const { page = 1, limit = 20, isOnline } = req.query;
    const offset = (page - 1) * limit;

    const where = {
      isApproved: true,
      isActive: true,
    };

    if (isOnline !== undefined) {
      where.isOnline = isOnline === "true";
    }

    const { rows: astrologers, count } = await Astrologer.findAndCountAll({
      where,
      attributes: [
        "id",
        "fullName",
        "photo",
        "rating",
        "yearsOfExperience",
        "pricePerMinute",
        "isOnline",
        "totalConsultations",
        "skills",
        "languages",
      ],
      order: [
        ["isOnline", "DESC"],
        ["rating", "DESC"],
      ],
      limit: parseInt(limit),
      offset: parseInt(offset),
    });

    // Get all follow relationships for this user
    const followedIds = await Follow.findAll({
      where: { userId },
      attributes: ["astrologerId"],
    });

    const followedSet = new Set(followedIds.map((f) => f.astrologerId));

    // Get follower counts for all astrologers
    const followerCounts = await Follow.findAll({
      where: {
        astrologerId: astrologers.map((a) => a.id),
      },
      attributes: [
        "astrologerId",
        [sequelize.fn("COUNT", sequelize.col("astrologerId")), "count"],
      ],
      group: ["astrologerId"],
      raw: true,
    });

    const followerCountMap = {};
    followerCounts.forEach((fc) => {
      followerCountMap[fc.astrologerId] = parseInt(fc.count);
    });

    // Add follow status and follower count to each astrologer
    const astrologersWithStatus = astrologers.map((astrologer) => ({
      ...astrologer.toJSON(),
      isFollowing: followedSet.has(astrologer.id),
      followerCount: followerCountMap[astrologer.id] || 0,
    }));

    res.status(200).json({
      success: true,
      astrologers: astrologersWithStatus,
      pagination: {
        total: count,
        page: parseInt(page),
        limit: parseInt(limit),
        totalPages: Math.ceil(count / limit),
      },
    });
  } catch (error) {
    console.error("Get astrologers with follow status error:", error);
    res.status(500).json({
      success: false,
      message: "Failed to fetch astrologers",
      error: error.message,
    });
  }
};

// Get follower statistics for astrologer dashboard
const getFollowerStats = async (req, res) => {
  try {
    const astrologerId = req.astrologer.id;

    // Total followers
    const totalFollowers = await Follow.count({
      where: { astrologerId },
    });

    // New followers in last 7 days
    const sevenDaysAgo = new Date();
    sevenDaysAgo.setDate(sevenDaysAgo.getDate() - 7);

    const newFollowers = await Follow.count({
      where: {
        astrologerId,
        createdAt: { [Op.gte]: sevenDaysAgo },
      },
    });

    // New followers in last 30 days
    const thirtyDaysAgo = new Date();
    thirtyDaysAgo.setDate(thirtyDaysAgo.getDate() - 30);

    const followersThisMonth = await Follow.count({
      where: {
        astrologerId,
        createdAt: { [Op.gte]: thirtyDaysAgo },
      },
    });

    res.status(200).json({
      success: true,
      stats: {
        totalFollowers,
        newFollowersLast7Days: newFollowers,
        newFollowersLast30Days: followersThisMonth,
      },
    });
  } catch (error) {
    console.error("Get follower stats error:", error);
    res.status(500).json({
      success: false,
      message: "Failed to fetch follower statistics",
      error: error.message,
    });
  }
};

module.exports = {
  followAstrologer,
  unfollowAstrologer,
  getMyFollowing,
  checkIfFollowing,
  getMyFollowers,
  getFollowerCount,
  getAstrologersWithFollowStatus,
  getFollowerStats,
};
