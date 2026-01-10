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

// Log Razorpay initialization status (without exposing full credentials)
console.log('[Razorpay] Initialization status:', {
  keyIdPresent: !!process.env.RAZORPAY_KEY_ID,
  keySecretPresent: !!process.env.RAZORPAY_KEY_SECRET,
  keyIdPrefix: process.env.RAZORPAY_KEY_ID ? process.env.RAZORPAY_KEY_ID.substring(0, 8) + '...' : 'NOT SET'
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

    console.log('=== CREATE RECHARGE ORDER START ===');
    console.log('User ID:', userId);
    console.log('Amount:', amount);
    console.log('Coupon Code:', couponCode);

    if (!amount || amount < 1) {
      console.log('ERROR: Invalid amount', amount);
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

    console.log('Creating Razorpay order with options:', JSON.stringify(options, null, 2));
    const razorpayOrder = await razorpay.orders.create(options);
    console.log('Razorpay order created successfully:', razorpayOrder.id);

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

    console.log('Transaction created in DB:', transaction.id);
    console.log('=== CREATE RECHARGE ORDER SUCCESS ===');

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
    console.error("=== CREATE RECHARGE ORDER ERROR ===");
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

    console.log('=== VERIFY RECHARGE START ===');
    console.log('User ID:', userId);
    console.log('Order ID:', razorpay_order_id);
    console.log('Payment ID:', razorpay_payment_id);
    console.log('Signature received:', razorpay_signature ? 'Yes' : 'No');

    if (!razorpay_order_id || !razorpay_payment_id || !razorpay_signature) {
      console.log('ERROR: Missing verification parameters');
      return res.status(400).json({
        success: false,
        message: "Missing payment verification parameters",
      });
    }

    // Verify signature
    console.log('Verifying signature...');
    const generatedSignature = crypto
      .createHmac("sha256", process.env.RAZORPAY_KEY_SECRET)
      .update(`${razorpay_order_id}|${razorpay_payment_id}`)
      .digest("hex");

    console.log('Generated signature:', generatedSignature.substring(0, 10) + '...');
    console.log('Received signature:', razorpay_signature.substring(0, 10) + '...');
    console.log('Signatures match:', generatedSignature === razorpay_signature);

    if (generatedSignature !== razorpay_signature) {
      // Log invalid signature attempt
      console.error("=== SIGNATURE VERIFICATION FAILED ===");
      console.error("Invalid payment signature attempt", {
        orderId: razorpay_order_id,
        paymentId: razorpay_payment_id,
        userId,
      });
      return res.status(400).json({
        success: false,
        message: "Invalid payment signature",
      });
    }

    console.log('✓ Signature verified successfully');

    // Find transaction
    const transaction = await WalletTransaction.findOne({
      where: { razorpayOrderId: razorpay_order_id, userId },
    });

    if (!transaction) {
      console.error("Transaction not found", {
        orderId: razorpay_order_id,
        userId,
      });
      return res.status(404).json({
        success: false,
        message: "Transaction not found",
      });
    }

    // Idempotency check - if already completed, return success with existing data
    if (transaction.status === "completed") {
      const wallet = await Wallet.findOne({ where: { id: transaction.walletId } });
      return res.status(200).json({
        success: true,
        message: "Transaction already completed",
        wallet: {
          balance: parseFloat(wallet.balance),
          totalRecharge: parseFloat(wallet.totalRecharge),
        },
        transaction: {
          id: transaction.id,
          amount: parseFloat(transaction.amount),
          status: transaction.status,
        },
      });
    }

    // Get wallet
    const wallet = await Wallet.findOne({ where: { id: transaction.walletId } });

    if (!wallet) {
      console.error("Wallet not found", {
        walletId: transaction.walletId,
        userId,
      });
      return res.status(404).json({
        success: false,
        message: "Wallet not found",
      });
    }

    // Use transaction to ensure atomicity
    const sequelize = require("../../dbConnection/dbConfig").sequelize;
    const dbTransaction = await sequelize.transaction();

    try {
      // Update wallet balance
      const newBalance = parseFloat(wallet.balance) + parseFloat(transaction.amount);
      const newTotalRecharge = parseFloat(wallet.totalRecharge) + parseFloat(transaction.amount);

      await wallet.update(
        {
          balance: newBalance,
          totalRecharge: newTotalRecharge,
        },
        { transaction: dbTransaction }
      );

      // Update transaction
      await transaction.update(
        {
          status: "completed",
          razorpayPaymentId: razorpay_payment_id,
          razorpaySignature: razorpay_signature,
          balanceAfter: newBalance,
        },
        { transaction: dbTransaction }
      );

      await dbTransaction.commit();

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

      console.log("Wallet recharge verified successfully", {
        userId,
        transactionId: transaction.id,
        amount: transaction.amount,
        newBalance,
      });

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
    } catch (dbError) {
      await dbTransaction.rollback();
      console.error("Database transaction error during wallet recharge", dbError);
      throw dbError;
    }
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

/**
 * Deduct from wallet for AI chat/voice usage
 */
const deductForAIUsage = async (req, res) => {
  try {
    const userId = req.user.id;
    const { amount, type, minutes } = req.body;

    console.log('=== AI WALLET DEDUCTION START ===');
    console.log('[PRODUCTION DEBUG] Timestamp:', new Date().toISOString());
    console.log('[PRODUCTION DEBUG] User ID:', userId);
    console.log('[PRODUCTION DEBUG] User object:', JSON.stringify(req.user));
    console.log('[PRODUCTION DEBUG] Amount:', amount, 'Type:', typeof amount);
    console.log('[PRODUCTION DEBUG] Type:', type);
    console.log('[PRODUCTION DEBUG] Minutes:', minutes);
    console.log('[PRODUCTION DEBUG] Request body:', JSON.stringify(req.body));
    console.log('[PRODUCTION DEBUG] Request headers:', JSON.stringify(req.headers));

    if (!amount || amount <= 0) {
      console.error('[PRODUCTION DEBUG] Invalid amount validation failed:', { amount, type: typeof amount });
      return res.status(400).json({
        success: false,
        message: "Invalid amount",
      });
    }

    if (!type || !['chat', 'voice'].includes(type)) {
      console.error('[PRODUCTION DEBUG] Invalid type validation failed:', { type, validTypes: ['chat', 'voice'] });
      return res.status(400).json({
        success: false,
        message: "Type must be 'chat' or 'voice'",
      });
    }

    // Get wallet
    console.log('[PRODUCTION DEBUG] Fetching wallet for userId:', userId);
    const wallet = await Wallet.findOne({ where: { userId } });

    if (!wallet) {
      console.error('[PRODUCTION DEBUG] Wallet not found for userId:', userId);
      return res.status(404).json({
        success: false,
        message: "Wallet not found",
      });
    }

    console.log('[PRODUCTION DEBUG] Wallet found:', {
      walletId: wallet.id,
      balance: wallet.balance,
      balanceType: typeof wallet.balance,
      parsedBalance: parseFloat(wallet.balance),
      totalSpent: wallet.totalSpent
    });

    // Check sufficient balance
    const currentBalance = parseFloat(wallet.balance);
    console.log('[PRODUCTION DEBUG] Balance check:', {
      currentBalance,
      requiredAmount: amount,
      hasSufficientBalance: currentBalance >= amount
    });

    if (currentBalance < amount) {
      console.error('[PRODUCTION DEBUG] Insufficient balance for AI usage:', {
        userId,
        currentBalance,
        requiredAmount: amount,
        deficit: amount - currentBalance
      });
      return res.status(400).json({
        success: false,
        message: "Insufficient wallet balance",
        currentBalance: currentBalance,
      });
    }

    // Use transaction for atomicity
    const sequelize = require("../../dbConnection/dbConfig").sequelize;
    console.log('[PRODUCTION DEBUG] Starting database transaction');
    const dbTransaction = await sequelize.transaction();

    try {
      const balanceBefore = parseFloat(wallet.balance);
      const newBalance = balanceBefore - amount;
      const newTotalSpent = parseFloat(wallet.totalSpent) + amount;

      console.log('[PRODUCTION DEBUG] Calculating new balances:', {
        balanceBefore,
        amount,
        newBalance,
        currentTotalSpent: wallet.totalSpent,
        newTotalSpent
      });

      // Update wallet
      console.log('[PRODUCTION DEBUG] Updating wallet in database');
      await wallet.update(
        {
          balance: newBalance,
          totalSpent: newTotalSpent,
        },
        { transaction: dbTransaction }
      );
      console.log('[PRODUCTION DEBUG] Wallet updated successfully');

      // Create transaction record
      console.log('[PRODUCTION DEBUG] Creating transaction record');
      const transaction = await WalletTransaction.create(
        {
          userId,
          walletId: wallet.id,
          amount,
          type: "debit",
          status: "completed",
          paymentMethod: "manual",
          description: `AI ${type} usage - ${minutes.toFixed(2)} minutes`,
          balanceBefore,
          balanceAfter: newBalance,
        },
        { transaction: dbTransaction }
      );
      console.log('[PRODUCTION DEBUG] Transaction record created:', {
        transactionId: transaction.id,
        amount: transaction.amount,
        description: transaction.description
      });

      console.log('[PRODUCTION DEBUG] Committing database transaction');
      await dbTransaction.commit();
      console.log('[PRODUCTION DEBUG] Database transaction committed successfully');

      console.log('[PRODUCTION DEBUG] AI wallet deduction successful:', {
        userId,
        amount,
        type,
        minutes,
        balanceBefore,
        newBalance,
        transactionId: transaction.id
      });

      const responseData = {
        success: true,
        message: "Amount deducted successfully",
        newBalance,
        transaction: {
          id: transaction.id,
          amount,
          balanceBefore,
          balanceAfter: newBalance,
        },
      };
      console.log('[PRODUCTION DEBUG] Sending success response:', JSON.stringify(responseData));
      res.status(200).json(responseData);
      console.log('[PRODUCTION DEBUG] === AI WALLET DEDUCTION SUCCESS ===');
    } catch (dbError) {
      console.error('[PRODUCTION DEBUG] Database error, rolling back transaction');
      await dbTransaction.rollback();
      console.error('[PRODUCTION DEBUG] Database error during AI wallet deduction:', {
        error: dbError.message,
        stack: dbError.stack,
        userId,
        amount,
        type
      });
      throw dbError;
    }
  } catch (error) {
    console.error("=== AI WALLET DEDUCTION ERROR ===");
    console.error("[PRODUCTION DEBUG] Deduct for AI usage error:", {
      message: error.message,
      stack: error.stack,
      userId: req.user?.id,
      body: req.body
    });
    res.status(500).json({
      success: false,
      message: "Failed to deduct from wallet",
      error: error.message,
    });
  }
};

module.exports = {
  getWalletBalance,
  createRechargeOrder,
  verifyRecharge,
  getTransactionHistory,
  deductFromWallet,
  deductForAIUsage,
};
