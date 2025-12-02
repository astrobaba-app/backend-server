const Coupon = require("../../model/coupon/coupon");
const CouponUsage = require("../../model/coupon/couponUsage");
const User = require("../../model/user/userAuth");
const { Op } = require("sequelize");

// Validate and apply coupon
const validateCoupon = async (req, res) => {
  try {
    const userId = req.user.id;
    const { code, rechargeAmount } = req.body;

    if (!code || !rechargeAmount) {
      return res.status(400).json({
        success: false,
        message: "Coupon code and recharge amount are required",
      });
    }

    const amount = parseFloat(rechargeAmount);
    if (amount <= 0) {
      return res.status(400).json({
        success: false,
        message: "Invalid recharge amount",
      });
    }

    // Find coupon
    const coupon = await Coupon.findOne({
      where: {
        code: code.toUpperCase(),
        isActive: true,
      },
    });

    if (!coupon) {
      return res.status(404).json({
        success: false,
        message: "Invalid or inactive coupon code",
      });
    }

    // Check if coupon is expired
    const now = new Date();
    if (now < new Date(coupon.validFrom)) {
      return res.status(400).json({
        success: false,
        message: "Coupon is not yet valid",
        validFrom: coupon.validFrom,
      });
    }

    if (now > new Date(coupon.validUntil)) {
      return res.status(400).json({
        success: false,
        message: "Coupon has expired",
        validUntil: coupon.validUntil,
      });
    }

    // Check minimum recharge amount
    if (amount < parseFloat(coupon.minRechargeAmount)) {
      return res.status(400).json({
        success: false,
        message: `Minimum recharge amount is ₹${coupon.minRechargeAmount} to use this coupon`,
      });
    }

    // Check maximum recharge amount
    if (coupon.maxRechargeAmount && amount > parseFloat(coupon.maxRechargeAmount)) {
      return res.status(400).json({
        success: false,
        message: `Maximum recharge amount is ₹${coupon.maxRechargeAmount} for this coupon`,
      });
    }

    // Check total usage limit
    if (coupon.usageLimit && coupon.usageCount >= coupon.usageLimit) {
      return res.status(400).json({
        success: false,
        message: "Coupon usage limit reached",
      });
    }

    // Check per user limit
    const userUsageCount = await CouponUsage.count({
      where: {
        couponId: coupon.id,
        userId,
        status: "success",
      },
    });

    if (userUsageCount >= coupon.perUserLimit) {
      return res.status(400).json({
        success: false,
        message: `You have already used this coupon ${coupon.perUserLimit} time(s)`,
      });
    }

    // Check applicableFor (new_users vs existing_users)
    if (coupon.applicableFor !== "all") {
      const user = await User.findByPk(userId);
      const userCreatedDate = new Date(user.createdAt);
      const daysSinceCreation = (now - userCreatedDate) / (1000 * 60 * 60 * 24);

      if (coupon.applicableFor === "new_users" && daysSinceCreation > 7) {
        return res.status(400).json({
          success: false,
          message: "This coupon is only for new users (within 7 days of registration)",
        });
      }

      if (coupon.applicableFor === "existing_users" && daysSinceCreation <= 7) {
        return res.status(400).json({
          success: false,
          message: "This coupon is only for existing users",
        });
      }
    }

    // Calculate discount
    let discountAmount = 0;
    if (coupon.discountType === "percentage") {
      discountAmount = (amount * parseFloat(coupon.discountValue)) / 100;
      
      // Apply max discount cap
      if (coupon.maxDiscount) {
        discountAmount = Math.min(discountAmount, parseFloat(coupon.maxDiscount));
      }
    } else if (coupon.discountType === "fixed") {
      discountAmount = parseFloat(coupon.discountValue);
    }

    // Ensure discount doesn't exceed recharge amount
    discountAmount = Math.min(discountAmount, amount);

    const finalAmount = amount - discountAmount;

    res.status(200).json({
      success: true,
      message: "Coupon applied successfully",
      coupon: {
        code: coupon.code,
        description: coupon.description,
        discountType: coupon.discountType,
        discountValue: parseFloat(coupon.discountValue),
      },
      calculation: {
        rechargeAmount: amount,
        discountAmount: parseFloat(discountAmount.toFixed(2)),
        finalAmount: parseFloat(finalAmount.toFixed(2)),
        savings: parseFloat(discountAmount.toFixed(2)),
      },
    });
  } catch (error) {
    console.error("Validate coupon error:", error);
    res.status(500).json({
      success: false,
      message: "Failed to validate coupon",
      error: error.message,
    });
  }
};

// Get all active coupons (for users to browse)
const getActiveCoupons = async (req, res) => {
  try {
    const userId = req.user.id;
    const now = new Date();

    // Get user info to check applicability
    const user = await User.findByPk(userId);
    const daysSinceCreation = (now - new Date(user.createdAt)) / (1000 * 60 * 60 * 24);

    const coupons = await Coupon.findAll({
      where: {
        isActive: true,
        validFrom: { [Op.lte]: now },
        validUntil: { [Op.gte]: now },
        [Op.or]: [
          { usageLimit: null },
          { usageCount: { [Op.lt]: sequelize.col("usageLimit") } },
        ],
      },
      attributes: [
        "id",
        "code",
        "description",
        "discountType",
        "discountValue",
        "maxDiscount",
        "minRechargeAmount",
        "maxRechargeAmount",
        "perUserLimit",
        "validUntil",
        "applicableFor",
      ],
      order: [["discountValue", "DESC"]],
    });

    // Filter coupons based on user eligibility and add usage info
    const eligibleCoupons = await Promise.all(
      coupons.map(async (coupon) => {
        // Check user applicability
        if (coupon.applicableFor === "new_users" && daysSinceCreation > 7) {
          return null;
        }
        if (coupon.applicableFor === "existing_users" && daysSinceCreation <= 7) {
          return null;
        }

        // Check user usage count
        const userUsageCount = await CouponUsage.count({
          where: {
            couponId: coupon.id,
            userId,
            status: "success",
          },
        });

        const canUse = userUsageCount < coupon.perUserLimit;
        const remainingUses = coupon.perUserLimit - userUsageCount;

        return {
          ...coupon.toJSON(),
          canUse,
          remainingUses,
          usedByUser: userUsageCount,
        };
      })
    );

    // Filter out null values (ineligible coupons)
    const filteredCoupons = eligibleCoupons.filter((c) => c !== null);

    res.status(200).json({
      success: true,
      coupons: filteredCoupons,
      total: filteredCoupons.length,
    });
  } catch (error) {
    console.error("Get active coupons error:", error);
    res.status(500).json({
      success: false,
      message: "Failed to fetch coupons",
      error: error.message,
    });
  }
};

// Get user's coupon usage history
const getMyCouponUsage = async (req, res) => {
  try {
    const userId = req.user.id;
    const { page = 1, limit = 20 } = req.query;
    const offset = (page - 1) * limit;

    const { rows: usages, count } = await CouponUsage.findAndCountAll({
      where: { userId },
      include: [
        {
          model: Coupon,
          as: "coupon",
          attributes: ["code", "description", "discountType", "discountValue"],
        },
      ],
      order: [["createdAt", "DESC"]],
      limit: parseInt(limit),
      offset: parseInt(offset),
    });

    // Calculate total savings
    const totalSavings = usages.reduce((sum, usage) => {
      if (usage.status === "success") {
        return sum + parseFloat(usage.discountAmount);
      }
      return sum;
    }, 0);

    res.status(200).json({
      success: true,
      usages,
      totalSavings: parseFloat(totalSavings.toFixed(2)),
      pagination: {
        total: count,
        page: parseInt(page),
        limit: parseInt(limit),
        totalPages: Math.ceil(count / limit),
      },
    });
  } catch (error) {
    console.error("Get coupon usage error:", error);
    res.status(500).json({
      success: false,
      message: "Failed to fetch coupon usage",
      error: error.message,
    });
  }
};

// Admin: Create coupon
const createCoupon = async (req, res) => {
  try {
    const adminId = req.admin.id;
    const {
      code,
      description,
      discountType,
      discountValue,
      maxDiscount,
      minRechargeAmount,
      maxRechargeAmount,
      usageLimit,
      perUserLimit,
      validFrom,
      validUntil,
      applicableFor,
    } = req.body;

    if (!code || !discountType || !discountValue || !validUntil) {
      return res.status(400).json({
        success: false,
        message: "Code, discount type, discount value, and valid until are required",
      });
    }

    // Check if code already exists
    const existingCoupon = await Coupon.findOne({
      where: { code: code.toUpperCase() },
    });

    if (existingCoupon) {
      return res.status(400).json({
        success: false,
        message: "Coupon code already exists",
      });
    }

    const coupon = await Coupon.create({
      code: code.toUpperCase(),
      description,
      discountType,
      discountValue,
      maxDiscount,
      minRechargeAmount: minRechargeAmount || 0,
      maxRechargeAmount,
      usageLimit,
      perUserLimit: perUserLimit || 1,
      validFrom: validFrom || new Date(),
      validUntil,
      applicableFor: applicableFor || "all",
      createdBy: adminId,
    });

    res.status(201).json({
      success: true,
      message: "Coupon created successfully",
      coupon,
    });
  } catch (error) {
    console.error("Create coupon error:", error);
    res.status(500).json({
      success: false,
      message: "Failed to create coupon",
      error: error.message,
    });
  }
};

// Admin: Get all coupons
const getAllCoupons = async (req, res) => {
  try {
    const { page = 1, limit = 50, isActive, search } = req.query;
    const offset = (page - 1) * limit;

    const where = {};
    if (isActive !== undefined) {
      where.isActive = isActive === "true";
    }
    if (search) {
      where.code = { [Op.iLike]: `%${search}%` };
    }

    const { rows: coupons, count } = await Coupon.findAndCountAll({
      where,
      order: [["createdAt", "DESC"]],
      limit: parseInt(limit),
      offset: parseInt(offset),
    });

    res.status(200).json({
      success: true,
      coupons,
      pagination: {
        total: count,
        page: parseInt(page),
        limit: parseInt(limit),
        totalPages: Math.ceil(count / limit),
      },
    });
  } catch (error) {
    console.error("Get all coupons error:", error);
    res.status(500).json({
      success: false,
      message: "Failed to fetch coupons",
      error: error.message,
    });
  }
};

// Admin: Update coupon
const updateCoupon = async (req, res) => {
  try {
    const { couponId } = req.params;
    const updateData = req.body;

    const coupon = await Coupon.findByPk(couponId);
    if (!coupon) {
      return res.status(404).json({
        success: false,
        message: "Coupon not found",
      });
    }

    // Don't allow changing code if coupon has been used
    if (updateData.code && coupon.usageCount > 0) {
      return res.status(400).json({
        success: false,
        message: "Cannot change coupon code after it has been used",
      });
    }

    await coupon.update(updateData);

    res.status(200).json({
      success: true,
      message: "Coupon updated successfully",
      coupon,
    });
  } catch (error) {
    console.error("Update coupon error:", error);
    res.status(500).json({
      success: false,
      message: "Failed to update coupon",
      error: error.message,
    });
  }
};

// Admin: Delete coupon
const deleteCoupon = async (req, res) => {
  try {
    const { couponId } = req.params;

    const coupon = await Coupon.findByPk(couponId);
    if (!coupon) {
      return res.status(404).json({
        success: false,
        message: "Coupon not found",
      });
    }

    // Check if coupon has been used
    if (coupon.usageCount > 0) {
      return res.status(400).json({
        success: false,
        message: "Cannot delete coupon that has been used. Consider deactivating instead.",
      });
    }

    await coupon.destroy();

    res.status(200).json({
      success: true,
      message: "Coupon deleted successfully",
    });
  } catch (error) {
    console.error("Delete coupon error:", error);
    res.status(500).json({
      success: false,
      message: "Failed to delete coupon",
      error: error.message,
    });
  }
};

// Admin: Toggle coupon active status
const toggleCouponStatus = async (req, res) => {
  try {
    const { couponId } = req.params;

    const coupon = await Coupon.findByPk(couponId);
    if (!coupon) {
      return res.status(404).json({
        success: false,
        message: "Coupon not found",
      });
    }

    await coupon.update({ isActive: !coupon.isActive });

    res.status(200).json({
      success: true,
      message: `Coupon ${coupon.isActive ? "activated" : "deactivated"} successfully`,
      coupon,
    });
  } catch (error) {
    console.error("Toggle coupon status error:", error);
    res.status(500).json({
      success: false,
      message: "Failed to toggle coupon status",
      error: error.message,
    });
  }
};

// Admin: Get coupon usage analytics
const getCouponAnalytics = async (req, res) => {
  try {
    const { couponId } = req.params;

    const coupon = await Coupon.findByPk(couponId);
    if (!coupon) {
      return res.status(404).json({
        success: false,
        message: "Coupon not found",
      });
    }

    // Get all usages
    const usages = await CouponUsage.findAll({
      where: { couponId },
    });

    const successfulUsages = usages.filter((u) => u.status === "success");
    const totalRevenueGenerated = successfulUsages.reduce(
      (sum, u) => sum + parseFloat(u.finalAmount),
      0
    );
    const totalDiscountGiven = successfulUsages.reduce(
      (sum, u) => sum + parseFloat(u.discountAmount),
      0
    );

    res.status(200).json({
      success: true,
      analytics: {
        couponCode: coupon.code,
        totalUsages: coupon.usageCount,
        successfulUsages: successfulUsages.length,
        failedUsages: usages.length - successfulUsages.length,
        totalRevenueGenerated: parseFloat(totalRevenueGenerated.toFixed(2)),
        totalDiscountGiven: parseFloat(totalDiscountGiven.toFixed(2)),
        usageLimit: coupon.usageLimit,
        remainingUses: coupon.usageLimit ? coupon.usageLimit - coupon.usageCount : "Unlimited",
      },
    });
  } catch (error) {
    console.error("Get coupon analytics error:", error);
    res.status(500).json({
      success: false,
      message: "Failed to fetch coupon analytics",
      error: error.message,
    });
  }
};

module.exports = {
  validateCoupon,
  getActiveCoupons,
  getMyCouponUsage,
  createCoupon,
  getAllCoupons,
  updateCoupon,
  deleteCoupon,
  toggleCouponStatus,
  getCouponAnalytics,
};
