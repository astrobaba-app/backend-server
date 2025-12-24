const Astrologer = require("../../model/astrologer/astrologer");
const Review = require("../../model/review/review");
const User = require("../../model/user/userAuth");

// Get all astrologers with basic details (public)
const getAllAstrologers = async (req, res) => {
  try {
    const { page = 1, limit = 20, skills, languages, categories, minRating, maxPrice } = req.query;
    const offset = (page - 1) * limit;

    const where = { isApproved: true, isActive: true };

    // Filter by skills
    if (skills) {
      const skillsArray = skills.split(",");
      where.skills = {
        [require("sequelize").Op.overlap]: skillsArray,
      };
    }

    // Filter by languages
    if (languages) {
      const languagesArray = languages.split(",");
      where.languages = {
        [require("sequelize").Op.overlap]: languagesArray,
      };
    }

    // Filter by categories
    if (categories) {
      const categoriesArray = categories.split(",");
      where.categories = {
        [require("sequelize").Op.overlap]: categoriesArray,
      };
    }

    // Filter by minimum rating
    if (minRating) {
      where.rating = {
        [require("sequelize").Op.gte]: parseFloat(minRating),
      };
    }

    // Filter by maximum price
    if (maxPrice) {
      where.pricePerMinute = {
        [require("sequelize").Op.lte]: parseFloat(maxPrice),
      };
    }

    const { rows: astrologers, count } = await Astrologer.findAndCountAll({
      where,
      attributes: [
        "id",
        "fullName",
        "photo",
        "skills",
        "languages",
        "categories",
        "yearsOfExperience",
        "rating",
        "pricePerMinute",
        "totalConsultations",
        "bio",
        "isOnline"
      ],
      limit: parseInt(limit),
      offset: parseInt(offset),
      order: [["rating", "DESC"], ["totalConsultations", "DESC"]],
    });

    res.status(200).json({
      success: true,
      astrologers,
      pagination: {
        total: count,
        page: parseInt(page),
        limit: parseInt(limit),
        totalPages: Math.ceil(count / limit),
      },
    });
  } catch (error) {
    console.error("Get all astrologers error:", error);
    res.status(500).json({
      success: false,
      message: "Failed to fetch astrologers",
      error: error.message,
    });
  }
};

// Get astrologer by ID with full details (public)
const getAstrologerById = async (req, res) => {
  try {
    const { astrologerId } = req.params;

    const astrologer = await Astrologer.findOne({
      where: { id: astrologerId, isApproved: true, isActive: true },
      attributes: { exclude: ["password"] },
    });

    if (!astrologer) {
      return res.status(404).json({
        success: false,
        message: "Astrologer not found or not available",
      });
    }

    // Get recent reviews with user details
    const recentReviews = await Review.findAll({
      where: { astrologerId },
      limit: 5,
      order: [["createdAt", "DESC"]],
      include: [
        {
          model: User,
          as: "user",
          attributes: ["id", "fullName"],
        },
      ],
    });

    // Get rating statistics
    const allReviews = await Review.findAll({
      where: { astrologerId },
      attributes: ["rating"],
    });

    const ratingStats = {
      total: allReviews.length,
      average: astrologer.rating,
      distribution: {
        5: 0,
        4: 0,
        3: 0,
        2: 0,
        1: 0,
      },
    };

    allReviews.forEach((r) => {
      ratingStats.distribution[r.rating]++;
    });

    res.status(200).json({
      success: true,
      astrologer: {
        ...astrologer.toJSON(),
        recentReviews,
        ratingStats,
      },
    });
  } catch (error) {
    console.error("Get astrologer by ID error:", error);
    res.status(500).json({
      success: false,
      message: "Failed to fetch astrologer details",
      error: error.message,
    });
  }
};

// Get top rated astrologers (public)
const getTopRatedAstrologers = async (req, res) => {
  try {
    const { limit = 10 } = req.query;

    const astrologers = await Astrologer.findAll({
      where: { isApproved: true, isActive: true },
      attributes: [
        "id",
        "fullName",
        "photo",
        "skills",
        "languages",
        "categories",
        "yearsOfExperience",
        "rating",
        "pricePerMinute",
        "totalConsultations",
        "isOnline",
      ],
      limit: parseInt(limit),
      order: [
        ["rating", "DESC"],
        ["totalConsultations", "DESC"],
      ],
    });

    res.status(200).json({
      success: true,
      astrologers,
    });
  } catch (error) {
    console.error("Get top rated astrologers error:", error);
    res.status(500).json({
      success: false,
      message: "Failed to fetch top rated astrologers",
      error: error.message,
    });
  }
};

// Search astrologers by name (public)
const searchAstrologers = async (req, res) => {
  try {
    const { query, page = 1, limit = 20 } = req.query;
    const offset = (page - 1) * limit;

    if (!query) {
      return res.status(400).json({
        success: false,
        message: "Search query is required",
      });
    }

    const { rows: astrologers, count } = await Astrologer.findAndCountAll({
      where: {
        isApproved: true,
        isActive: true,
        fullName: {
          [require("sequelize").Op.iLike]: `%${query}%`,
        },
      },
      attributes: [
        "id",
        "fullName",
        "photo",
        "skills",
        "languages",
        "categories",
        "yearsOfExperience",
        "rating",
        "pricePerMinute",
        "totalConsultations",
        "isOnline",
      ],
      limit: parseInt(limit),
      offset: parseInt(offset),
      order: [["rating", "DESC"]],
    });

    res.status(200).json({
      success: true,
      astrologers,
      pagination: {
        total: count,
        page: parseInt(page),
        limit: parseInt(limit),
        totalPages: Math.ceil(count / limit),
      },
    });
  } catch (error) {
    console.error("Search astrologers error:", error);
    res.status(500).json({
      success: false,
      message: "Failed to search astrologers",
      error: error.message,
    });
  }
};

module.exports = {
  getAllAstrologers,
  getAstrologerById,
  getTopRatedAstrologers,
  searchAstrologers,
};
