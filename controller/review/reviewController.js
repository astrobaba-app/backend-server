const Review = require("../../model/review/review");
const User = require("../../model/user/userAuth");
const Astrologer = require("../../model/astrologer/astrologer");

// Create review (user only)
const createReview = async (req, res) => {
  try {
    const userId = req.user.id;
    const { astrologerId, rating, review } = req.body;

    if (!astrologerId || !rating || !review) {
      return res.status(400).json({
        success: false,
        message: "Astrologer ID, rating, and review are required",
      });
    }

    if (rating < 1 || rating > 5) {
      return res.status(400).json({
        success: false,
        message: "Rating must be between 1 and 5",
      });
    }

    // Check if astrologer exists
    const astrologer = await Astrologer.findByPk(astrologerId);
    if (!astrologer) {
      return res.status(404).json({
        success: false,
        message: "Astrologer not found",
      });
    }

    // Check if user already reviewed this astrologer
    const existingReview = await Review.findOne({
      where: { userId, astrologerId },
    });

    if (existingReview) {
      return res.status(400).json({
        success: false,
        message: "You have already reviewed this astrologer. You can edit your existing review.",
      });
    }

    const newReview = await Review.create({
      userId,
      astrologerId,
      rating,
      review,
    });

    // Update astrologer's average rating
    await updateAstrologerRating(astrologerId);

    // Get user details
    const user = await User.findByPk(userId, {
      attributes: ["id", "fullName", "email"],
    });

    res.status(201).json({
      success: true,
      message: "Review created successfully",
      review: {
        ...newReview.toJSON(),
        user,
      },
    });
  } catch (error) {
    console.error("Create review error:", error);
    res.status(500).json({
      success: false,
      message: "Failed to create review",
      error: error.message,
    });
  }
};

// Get reviews for an astrologer (public)
const getAstrologerReviews = async (req, res) => {
  try {
    const { astrologerId } = req.params;
    const { page = 1, limit = 10, rating } = req.query;
    const offset = (page - 1) * limit;

    const where = { astrologerId };
    if (rating) {
      where.rating = parseInt(rating);
    }

    const { rows: reviews, count } = await Review.findAndCountAll({
      where,
      limit: parseInt(limit),
      offset: parseInt(offset),
      order: [["createdAt", "DESC"]],
      include: [
        {
          model: User,
          as: "user",
          attributes: ["id", "fullName", "email"],
        },
      ],
    });

    // Calculate rating statistics
    const allReviews = await Review.findAll({
      where: { astrologerId },
      attributes: ["rating"],
    });

    const ratingStats = {
      total: allReviews.length,
      average: 0,
      distribution: {
        5: 0,
        4: 0,
        3: 0,
        2: 0,
        1: 0,
      },
    };

    if (allReviews.length > 0) {
      const sum = allReviews.reduce((acc, r) => acc + r.rating, 0);
      ratingStats.average = (sum / allReviews.length).toFixed(2);

      allReviews.forEach((r) => {
        ratingStats.distribution[r.rating]++;
      });
    }

    res.status(200).json({
      success: true,
      reviews,
      ratingStats,
      pagination: {
        total: count,
        page: parseInt(page),
        limit: parseInt(limit),
        totalPages: Math.ceil(count / limit),
      },
    });
  } catch (error) {
    console.error("Get astrologer reviews error:", error);
    res.status(500).json({
      success: false,
      message: "Failed to fetch reviews",
      error: error.message,
    });
  }
};

// Get user's review for an astrologer (user only)
const getMyReview = async (req, res) => {
  try {
    const userId = req.user.id;
    const { astrologerId } = req.params;

    const review = await Review.findOne({
      where: { userId, astrologerId },
      include: [
        {
          model: User,
          as: "user",
          attributes: ["id", "fullName", "email"],
        },
        {
          model: Astrologer,
          as: "astrologer",
          attributes: ["id", "fullName", "photo"],
        },
      ],
    });

    if (!review) {
      return res.status(404).json({
        success: false,
        message: "Review not found",
      });
    }

    res.status(200).json({
      success: true,
      review,
    });
  } catch (error) {
    console.error("Get my review error:", error);
    res.status(500).json({
      success: false,
      message: "Failed to fetch review",
      error: error.message,
    });
  }
};

// Update review (user only - own review)
const updateReview = async (req, res) => {
  try {
    const userId = req.user.id;
    const { reviewId } = req.params;
    const { rating, review } = req.body;

    const existingReview = await Review.findOne({
      where: { id: reviewId, userId },
    });

    if (!existingReview) {
      return res.status(404).json({
        success: false,
        message: "Review not found or you don't have permission to update it",
      });
    }

    const updateData = { isEdited: true };
    if (rating !== undefined) {
      if (rating < 1 || rating > 5) {
        return res.status(400).json({
          success: false,
          message: "Rating must be between 1 and 5",
        });
      }
      updateData.rating = rating;
    }
    if (review) updateData.review = review;

    await existingReview.update(updateData);

    // Update astrologer's average rating if rating changed
    if (rating !== undefined) {
      await updateAstrologerRating(existingReview.astrologerId);
    }

    res.status(200).json({
      success: true,
      message: "Review updated successfully",
      review: existingReview,
    });
  } catch (error) {
    console.error("Update review error:", error);
    res.status(500).json({
      success: false,
      message: "Failed to update review",
      error: error.message,
    });
  }
};

// Delete review (user only - own review)
const deleteReview = async (req, res) => {
  try {
    const userId = req.user.id;
    const { reviewId } = req.params;

    const review = await Review.findOne({
      where: { id: reviewId, userId },
    });

    if (!review) {
      return res.status(404).json({
        success: false,
        message: "Review not found or you don't have permission to delete it",
      });
    }

    const astrologerId = review.astrologerId;
    await review.destroy();

    // Update astrologer's average rating
    await updateAstrologerRating(astrologerId);

    res.status(200).json({
      success: true,
      message: "Review deleted successfully",
    });
  } catch (error) {
    console.error("Delete review error:", error);
    res.status(500).json({
      success: false,
      message: "Failed to delete review",
      error: error.message,
    });
  }
};

// Add reply to review (astrologer only - own reviews)
const addReply = async (req, res) => {
  try {
    const astrologerId = req.astrologer.id;
    const { reviewId } = req.params;
    const { reply } = req.body;

    if (!reply) {
      return res.status(400).json({
        success: false,
        message: "Reply text is required",
      });
    }

    const review = await Review.findOne({
      where: { id: reviewId, astrologerId },
    });

    if (!review) {
      return res.status(404).json({
        success: false,
        message: "Review not found or not for your profile",
      });
    }

    if (review.reply) {
      return res.status(400).json({
        success: false,
        message: "Reply already exists. Use update endpoint to edit it.",
      });
    }

    await review.update({
      reply,
      repliedAt: new Date(),
      isReplyEdited: false,
    });

    res.status(200).json({
      success: true,
      message: "Reply added successfully",
      review,
    });
  } catch (error) {
    console.error("Add reply error:", error);
    res.status(500).json({
      success: false,
      message: "Failed to add reply",
      error: error.message,
    });
  }
};

// Update reply (astrologer only - own reply)
const updateReply = async (req, res) => {
  try {
    const astrologerId = req.astrologer.id;
    const { reviewId } = req.params;
    const { reply } = req.body;

    if (!reply) {
      return res.status(400).json({
        success: false,
        message: "Reply text is required",
      });
    }

    const review = await Review.findOne({
      where: { id: reviewId, astrologerId },
    });

    if (!review) {
      return res.status(404).json({
        success: false,
        message: "Review not found or not for your profile",
      });
    }

    if (!review.reply) {
      return res.status(400).json({
        success: false,
        message: "No reply exists to update. Use add reply endpoint first.",
      });
    }

    await review.update({
      reply,
      isReplyEdited: true,
    });

    res.status(200).json({
      success: true,
      message: "Reply updated successfully",
      review,
    });
  } catch (error) {
    console.error("Update reply error:", error);
    res.status(500).json({
      success: false,
      message: "Failed to update reply",
      error: error.message,
    });
  }
};

// Delete reply (astrologer only - own reply)
const deleteReply = async (req, res) => {
  try {
    const astrologerId = req.astrologer.id;
    const { reviewId } = req.params;

    const review = await Review.findOne({
      where: { id: reviewId, astrologerId },
    });

    if (!review) {
      return res.status(404).json({
        success: false,
        message: "Review not found or not for your profile",
      });
    }

    if (!review.reply) {
      return res.status(400).json({
        success: false,
        message: "No reply exists to delete",
      });
    }

    await review.update({
      reply: null,
      repliedAt: null,
      isReplyEdited: false,
    });

    res.status(200).json({
      success: true,
      message: "Reply deleted successfully",
    });
  } catch (error) {
    console.error("Delete reply error:", error);
    res.status(500).json({
      success: false,
      message: "Failed to delete reply",
      error: error.message,
    });
  }
};

// Get reviews that need reply (astrologer only)
const getReviewsNeedingReply = async (req, res) => {
  try {
    const astrologerId = req.astrologer.id;
    const { page = 1, limit = 10 } = req.query;
    const offset = (page - 1) * limit;

    const { rows: reviews, count } = await Review.findAndCountAll({
      where: { 
        astrologerId,
        reply: null,
      },
      limit: parseInt(limit),
      offset: parseInt(offset),
      order: [["createdAt", "DESC"]],
      include: [
        {
          model: User,
          as: "user",
          attributes: ["id", "fullName", "email"],
        },
      ],
    });

    res.status(200).json({
      success: true,
      reviews,
      pagination: {
        total: count,
        page: parseInt(page),
        limit: parseInt(limit),
        totalPages: Math.ceil(count / limit),
      },
    });
  } catch (error) {
    console.error("Get reviews needing reply error:", error);
    res.status(500).json({
      success: false,
      message: "Failed to fetch reviews",
      error: error.message,
    });
  }
};

// Helper function to update astrologer's average rating
async function updateAstrologerRating(astrologerId) {
  try {
    const reviews = await Review.findAll({
      where: { astrologerId },
      attributes: ["rating"],
    });

    if (reviews.length === 0) {
      await Astrologer.update(
        { rating: 0, totalConsultations: 0 },
        { where: { id: astrologerId } }
      );
      return;
    }

    const sum = reviews.reduce((acc, r) => acc + r.rating, 0);
    const average = (sum / reviews.length).toFixed(2);

    await Astrologer.update(
      { rating: average, totalConsultations: reviews.length },
      { where: { id: astrologerId } }
    );
  } catch (error) {
    console.error("Update astrologer rating error:", error);
  }
}

module.exports = {
  createReview,
  getAstrologerReviews,
  getMyReview,
  updateReview,
  deleteReview,
  addReply,
  updateReply,
  deleteReply,
  getReviewsNeedingReply,
};
