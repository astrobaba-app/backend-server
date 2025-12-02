const ProductReview = require("../../model/store/productReview");
const Product = require("../../model/store/product");
const Order = require("../../model/store/order");
const User = require("../../model/user/user");
const sequelize = require("../../config/database/database");

// Add product review
exports.addReview = async (req, res) => {
  try {
    const userId = req.user.id;
    const { productId } = req.params;
    const { rating, title, review, images, orderId } = req.body;

    if (!rating || rating < 1 || rating > 5) {
      return res.status(400).json({
        success: false,
        message: "Rating must be between 1 and 5",
      });
    }

    // Check if product exists
    const product = await Product.findByPk(productId);
    if (!product) {
      return res.status(404).json({
        success: false,
        message: "Product not found",
      });
    }

    // Check if user already reviewed this product
    const existingReview = await ProductReview.findOne({
      where: { userId, productId },
    });

    if (existingReview) {
      return res.status(400).json({
        success: false,
        message: "You have already reviewed this product",
      });
    }

    // Check if verified purchase
    let isVerifiedPurchase = false;
    if (orderId) {
      const order = await Order.findOne({
        where: {
          id: orderId,
          userId,
          orderStatus: "delivered",
        },
      });

      if (order && order.items.some((item) => item.productId === productId)) {
        isVerifiedPurchase = true;
      }
    }

    // Create review
    const productReview = await ProductReview.create({
      productId,
      userId,
      orderId: orderId || null,
      rating,
      title,
      review,
      images: images || [],
      isVerifiedPurchase,
    });

    // Update product rating
    await updateProductRating(productId);

    return res.status(201).json({
      success: true,
      message: "Review added successfully",
      review: productReview,
    });
  } catch (error) {
    console.error("Error adding review:", error);
    return res.status(500).json({
      success: false,
      message: "Failed to add review",
      error: error.message,
    });
  }
};

// Helper function to update product rating
const updateProductRating = async (productId) => {
  try {
    const stats = await ProductReview.findOne({
      attributes: [
        [sequelize.fn("AVG", sequelize.col("rating")), "avgRating"],
        [sequelize.fn("COUNT", sequelize.col("id")), "totalReviews"],
      ],
      where: { productId, isApproved: true },
      raw: true,
    });

    await Product.update(
      {
        averageRating: parseFloat(stats.avgRating || 0).toFixed(1),
        totalReviews: parseInt(stats.totalReviews || 0),
      },
      { where: { id: productId } }
    );
  } catch (error) {
    console.error("Error updating product rating:", error);
  }
};

// Get product reviews
exports.getProductReviews = async (req, res) => {
  try {
    const { productId } = req.params;
    const {
      page = 1,
      limit = 10,
      rating,
      verifiedOnly = false,
      sortBy = "createdAt",
      sortOrder = "DESC",
    } = req.query;

    const offset = (page - 1) * limit;
    const where = { productId, isApproved: true };

    if (rating) where.rating = rating;
    if (verifiedOnly === "true") where.isVerifiedPurchase = true;

    const { count, rows: reviews } = await ProductReview.findAndCountAll({
      where,
      include: [
        {
          model: User,
          as: "user",
          attributes: ["id", "fullName", "profilePicture"],
        },
      ],
      limit: parseInt(limit),
      offset: parseInt(offset),
      order: [[sortBy, sortOrder]],
    });

    // Get rating distribution
    const ratingDistribution = await ProductReview.findAll({
      attributes: [
        "rating",
        [sequelize.fn("COUNT", sequelize.col("id")), "count"],
      ],
      where: { productId, isApproved: true },
      group: ["rating"],
      raw: true,
    });

    return res.status(200).json({
      success: true,
      reviews,
      ratingDistribution,
      pagination: {
        total: count,
        page: parseInt(page),
        limit: parseInt(limit),
        totalPages: Math.ceil(count / limit),
      },
    });
  } catch (error) {
    console.error("Error fetching reviews:", error);
    return res.status(500).json({
      success: false,
      message: "Failed to fetch reviews",
      error: error.message,
    });
  }
};

// Get my reviews
exports.getMyReviews = async (req, res) => {
  try {
    const userId = req.user.id;
    const { page = 1, limit = 10 } = req.query;

    const offset = (page - 1) * limit;

    const { count, rows: reviews } = await ProductReview.findAndCountAll({
      where: { userId },
      include: [
        {
          model: Product,
          as: "product",
          attributes: ["id", "productName", "slug", "images", "price"],
        },
      ],
      limit: parseInt(limit),
      offset: parseInt(offset),
      order: [["createdAt", "DESC"]],
    });

    return res.status(200).json({
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
    console.error("Error fetching my reviews:", error);
    return res.status(500).json({
      success: false,
      message: "Failed to fetch reviews",
      error: error.message,
    });
  }
};

// Update review
exports.updateReview = async (req, res) => {
  try {
    const userId = req.user.id;
    const { reviewId } = req.params;
    const { rating, title, review, images } = req.body;

    const productReview = await ProductReview.findOne({
      where: { id: reviewId, userId },
    });

    if (!productReview) {
      return res.status(404).json({
        success: false,
        message: "Review not found",
      });
    }

    const updateData = {};
    if (rating) updateData.rating = rating;
    if (title) updateData.title = title;
    if (review) updateData.review = review;
    if (images) updateData.images = images;

    await productReview.update(updateData);

    // Update product rating if rating changed
    if (rating) {
      await updateProductRating(productReview.productId);
    }

    return res.status(200).json({
      success: true,
      message: "Review updated successfully",
      review: productReview,
    });
  } catch (error) {
    console.error("Error updating review:", error);
    return res.status(500).json({
      success: false,
      message: "Failed to update review",
      error: error.message,
    });
  }
};

// Delete review
exports.deleteReview = async (req, res) => {
  try {
    const userId = req.user.id;
    const { reviewId } = req.params;

    const productReview = await ProductReview.findOne({
      where: { id: reviewId, userId },
    });

    if (!productReview) {
      return res.status(404).json({
        success: false,
        message: "Review not found",
      });
    }

    const productId = productReview.productId;
    await productReview.destroy();

    // Update product rating
    await updateProductRating(productId);

    return res.status(200).json({
      success: true,
      message: "Review deleted successfully",
    });
  } catch (error) {
    console.error("Error deleting review:", error);
    return res.status(500).json({
      success: false,
      message: "Failed to delete review",
      error: error.message,
    });
  }
};

// Mark review as helpful
exports.markReviewHelpful = async (req, res) => {
  try {
    const { reviewId } = req.params;

    const review = await ProductReview.findByPk(reviewId);
    if (!review) {
      return res.status(404).json({
        success: false,
        message: "Review not found",
      });
    }

    await review.update({ helpfulCount: review.helpfulCount + 1 });

    return res.status(200).json({
      success: true,
      message: "Review marked as helpful",
      helpfulCount: review.helpfulCount,
    });
  } catch (error) {
    console.error("Error marking review as helpful:", error);
    return res.status(500).json({
      success: false,
      message: "Failed to mark review as helpful",
      error: error.message,
    });
  }
};

// ==================== ADMIN: Review Management ====================

// Get all reviews (admin)
exports.getAllReviews = async (req, res) => {
  try {
    const {
      page = 1,
      limit = 20,
      isApproved,
      rating,
      productId,
    } = req.query;

    const offset = (page - 1) * limit;
    const where = {};

    if (isApproved !== undefined) where.isApproved = isApproved === "true";
    if (rating) where.rating = rating;
    if (productId) where.productId = productId;

    const { count, rows: reviews } = await ProductReview.findAndCountAll({
      where,
      include: [
        {
          model: User,
          as: "user",
          attributes: ["id", "fullName", "email"],
        },
        {
          model: Product,
          as: "product",
          attributes: ["id", "productName", "slug"],
        },
      ],
      limit: parseInt(limit),
      offset: parseInt(offset),
      order: [["createdAt", "DESC"]],
    });

    return res.status(200).json({
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
    console.error("Error fetching reviews:", error);
    return res.status(500).json({
      success: false,
      message: "Failed to fetch reviews",
      error: error.message,
    });
  }
};

// Approve/reject review (admin)
exports.updateReviewApproval = async (req, res) => {
  try {
    const { reviewId } = req.params;
    const { isApproved } = req.body;

    const review = await ProductReview.findByPk(reviewId);
    if (!review) {
      return res.status(404).json({
        success: false,
        message: "Review not found",
      });
    }

    await review.update({ isApproved });

    // Update product rating
    await updateProductRating(review.productId);

    return res.status(200).json({
      success: true,
      message: `Review ${isApproved ? "approved" : "rejected"} successfully`,
      review,
    });
  } catch (error) {
    console.error("Error updating review approval:", error);
    return res.status(500).json({
      success: false,
      message: "Failed to update review approval",
      error: error.message,
    });
  }
};

// Reply to review (admin)
exports.replyToReview = async (req, res) => {
  try {
    const { reviewId } = req.params;
    const { adminReply } = req.body;

    const review = await ProductReview.findByPk(reviewId);
    if (!review) {
      return res.status(404).json({
        success: false,
        message: "Review not found",
      });
    }

    await review.update({
      adminReply,
      adminRepliedAt: new Date(),
    });

    return res.status(200).json({
      success: true,
      message: "Reply added successfully",
      review,
    });
  } catch (error) {
    console.error("Error replying to review:", error);
    return res.status(500).json({
      success: false,
      message: "Failed to reply to review",
      error: error.message,
    });
  }
};
