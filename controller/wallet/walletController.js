const Wallet = require("../../model/wallet/wallet");
const WalletTransaction = require("../../model/wallet/walletTransaction");
const Coupon = require("../../model/coupon/coupon");
const CouponUsage = require("../../model/coupon/couponUsage");
const Razorpay = require("razorpay");
const crypto = require("crypto");
const { Op } = require("sequelize");

// Initialize Razorpay
const razorpay = new Razorpay({
  key_id: process.env.RAZORPAY_KEY_ID,
  key_secret: process.env.RAZORPAY_KEY_SECRET,
});


const getWalletBalance = async (req, res) => {
  try {
    const userId = req.user.id;

    let wallet = await Wallet.findOne({ where: { userId } });

    // Create wallet if doesn't exist
    if (!wallet) {
      wallet = await Wallet.create({ userId });
    }

    res.status(200).json({
      success: true,
      wallet: {
        balance: parseFloat(wallet.balance),
        totalRecharge: parseFloat(wallet.totalRecharge),
        totalSpent: parseFloat(wallet.totalSpent),
        isActive: wallet.isActive,
      },
    });
  } catch (error) {
    console.error("Get wallet balance error:", error);
    res.status(500).json({
      success: false,
      message: "Failed to fetch wallet balance",
      error: error.message,
    });
  }
};


const createRechargeOrder = async (req, res) => {
  try {
    const userId = req.user.id;
    const { amount, couponCode } = req.body;

    if (!amount || amount < 1) {
      return res.status(400).json({
        success: false,
        message: "Amount must be at least ₹1",
      });
    }

    let finalAmount = parseFloat(amount);
    let discountAmount = 0;
    let appliedCoupon = null;

    // If coupon code provided, validate and apply
    if (couponCode) {
      const coupon = await Coupon.findOne({
        where: {
          code: couponCode.toUpperCase(),
          isActive: true,
          validFrom: { [Op.lte]: new Date() },
          validUntil: { [Op.gte]: new Date() },
        },
      });

      if (!coupon) {
        return res.status(400).json({
          success: false,
          message: "Invalid or expired coupon code",
        });
      }

      // Check minimum recharge amount
      if (amount < parseFloat(coupon.minRechargeAmount)) {
        return res.status(400).json({
          success: false,
          message: `Minimum recharge amount is ₹${coupon.minRechargeAmount} for this coupon`,
        });
      }

      // Check usage limits
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

      // Calculate discount
      if (coupon.discountType === "percentage") {
        discountAmount = (amount * parseFloat(coupon.discountValue)) / 100;
        if (coupon.maxDiscount) {
          discountAmount = Math.min(discountAmount, parseFloat(coupon.maxDiscount));
        }
      } else {
        discountAmount = parseFloat(coupon.discountValue);
      }

      discountAmount = Math.min(discountAmount, amount);
      finalAmount = amount - discountAmount;

      appliedCoupon = {
        id: coupon.id,
        code: coupon.code,
        discountAmount,
      };
    }

    // Get or create wallet
    let wallet = await Wallet.findOne({ where: { userId } });
    if (!wallet) {
      wallet = await Wallet.create({ userId });
    }

    // Create Razorpay order with final amount
    const timestamp = Date.now().toString().slice(-8);
    const userIdShort = userId.toString().length > 10 ? 
      crypto.createHash('md5').update(userId.toString()).digest('hex').slice(0, 8) : 
      userId.toString();
    const receipt = `rcpt_${userIdShort}_${timestamp}`;
    
    const options = {
      amount: Math.round(finalAmount * 100), // Final amount in paise
      currency: "INR",
      receipt: receipt,
      notes: {
        userId,
        walletId: wallet.id,
        purpose: "wallet_recharge",
        originalAmount: amount,
        discountAmount: discountAmount,
        couponCode: couponCode || null,
      },
    };

    const razorpayOrder = await razorpay.orders.create(options);

    // Create pending transaction
    const transaction = await WalletTransaction.create({
      userId,
      walletId: wallet.id,
      amount: finalAmount, // Store final amount to be credited
      type: "credit",
      status: "pending",
      paymentMethod: "razorpay",
      razorpayOrderId: razorpayOrder.id,
      description: couponCode 
        ? `Wallet recharge of ₹${amount} (₹${discountAmount} discount with ${couponCode})`
        : `Wallet recharge of ₹${amount}`,
      balanceBefore: wallet.balance,
    });

    // Create pending coupon usage record if coupon applied
    if (appliedCoupon) {
      await CouponUsage.create({
        couponId: appliedCoupon.id,
        userId,
        rechargeAmount: amount,
        discountAmount,
        finalAmount,
        orderId: razorpayOrder.id,
        status: "pending",
      });
    }

    res.status(201).json({
      success: true,
      message: "Recharge order created successfully",
      data: {
        orderId: razorpayOrder.id,
        originalAmount: parseFloat(amount),
        discountAmount: parseFloat(discountAmount),
        finalAmount: parseFloat(finalAmount),
        amountInPaise: razorpayOrder.amount,
        currency: razorpayOrder.currency,
        transactionId: transaction.id,
        key: process.env.RAZORPAY_KEY_ID,
        couponApplied: appliedCoupon ? {
          code: appliedCoupon.code,
          discount: parseFloat(discountAmount),
        } : null,
      }
    });
  } catch (error) {
    console.error("Create recharge order error:", error);
    res.status(500).json({
      success: false,
      message: "Failed to create recharge order",
      error: error.message,
    });
  }
};


const verifyRecharge = async (req, res) => {
  try {
    const userId = req.user.id;
    const { razorpay_order_id, razorpay_payment_id, razorpay_signature } = req.body;

    if (!razorpay_order_id || !razorpay_payment_id || !razorpay_signature) {
      return res.status(400).json({
        success: false,
        message: "Missing payment verification parameters",
      });
    }

    // Verify signature
    const generatedSignature = crypto
      .createHmac("sha256", process.env.RAZORPAY_KEY_SECRET)
      .update(`${razorpay_order_id}|${razorpay_payment_id}`)
      .digest("hex");

    if (generatedSignature !== razorpay_signature) {
      return res.status(400).json({
        success: false,
        message: "Invalid payment signature",
      });
    }

    // Find transaction
    const transaction = await WalletTransaction.findOne({
      where: { razorpayOrderId: razorpay_order_id, userId },
    });

    if (!transaction) {
      return res.status(404).json({
        success: false,
        message: "Transaction not found",
      });
    }

    if (transaction.status === "completed") {
      return res.status(400).json({
        success: false,
        message: "Transaction already completed",
      });
    }

    // Get wallet
    const wallet = await Wallet.findOne({ where: { id: transaction.walletId } });

    // Update wallet balance
    const newBalance = parseFloat(wallet.balance) + parseFloat(transaction.amount);
    const newTotalRecharge = parseFloat(wallet.totalRecharge) + parseFloat(transaction.amount);

    await wallet.update({
      balance: newBalance,
      totalRecharge: newTotalRecharge,
    });

    // Update transaction
    await transaction.update({
      status: "completed",
      razorpayPaymentId: razorpay_payment_id,
      razorpaySignature: razorpay_signature,
      balanceAfter: newBalance,
    });

    // Update coupon usage if exists
    const couponUsage = await CouponUsage.findOne({
      where: {
        orderId: razorpay_order_id,
        userId,
        status: "pending",
      },
    });

    if (couponUsage) {
      await couponUsage.update({ status: "success" });

      // Increment coupon usage count
      const coupon = await Coupon.findByPk(couponUsage.couponId);
      if (coupon) {
        await coupon.update({
          usageCount: coupon.usageCount + 1,
        });
      }
    }

    res.status(200).json({
      success: true,
      message: "Wallet recharged successfully",
      wallet: {
        balance: newBalance,
        totalRecharge: newTotalRecharge,
      },
      transaction: {
        id: transaction.id,
        amount: parseFloat(transaction.amount),
        status: transaction.status,
      },
    });
  } catch (error) {
    console.error("Verify recharge error:", error);
    res.status(500).json({
      success: false,
      message: "Failed to verify recharge",
      error: error.message,
    });
  }
};

const getTransactionHistory = async (req, res) => {
  try {
    const userId = req.user.id;
    const { page = 1, limit = 20, type, status } = req.query;

    const where = { userId };
    if (type) where.type = type;
    if (status) where.status = status;

    const offset = (page - 1) * limit;

    const { rows: transactions, count } = await WalletTransaction.findAndCountAll({
      where,
      limit: parseInt(limit),
      offset: parseInt(offset),
      order: [["createdAt", "DESC"]],
      attributes: [
        "id",
        "amount",
        "type",
        "status",
        "paymentMethod",
        "description",
        "balanceBefore",
        "balanceAfter",
        "createdAt",
      ],
    });

    res.status(200).json({
      success: true,
      transactions,
      pagination: {
        total: count,
        page: parseInt(page),
        limit: parseInt(limit),
        totalPages: Math.ceil(count / limit),
      },
    });
  } catch (error) {
    console.error("Get transaction history error:", error);
    res.status(500).json({
      success: false,
      message: "Failed to fetch transaction history",
      error: error.message,
    });
  }
};


const deductFromWallet = async (userId, amount, description = "Payment") => {
  const wallet = await Wallet.findOne({ where: { userId } });

  if (!wallet) {
    throw new Error("Wallet not found");
  }

  if (parseFloat(wallet.balance) < amount) {
    throw new Error("Insufficient wallet balance");
  }

  const balanceBefore = parseFloat(wallet.balance);
  const newBalance = balanceBefore - amount;
  const newTotalSpent = parseFloat(wallet.totalSpent) + amount;

  await wallet.update({
    balance: newBalance,
    totalSpent: newTotalSpent,
  });

  const transaction = await WalletTransaction.create({
    userId,
    walletId: wallet.id,
    amount,
    type: "debit",
    status: "completed",
    paymentMethod: "manual",
    description,
    balanceBefore,
    balanceAfter: newBalance,
  });

  return {
    success: true,
    wallet,
    transaction,
  };
};

module.exports = {
  getWalletBalance,
  createRechargeOrder,
  verifyRecharge,
  getTransactionHistory,
  deductFromWallet,
};
