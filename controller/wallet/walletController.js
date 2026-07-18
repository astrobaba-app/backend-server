const Wallet = require("../../model/wallet/wallet");
const WalletTransaction = require("../../model/wallet/walletTransaction");
const User = require("../../model/user/userAuth");
const Coupon = require("../../model/coupon/coupon");
const CouponUsage = require("../../model/coupon/couponUsage");
const CouponUserAssignment = require("../../model/coupon/couponUserAssignment");
const Razorpay = require("razorpay");
const { fetchExactRazorpayInstrument } = require("../../services/razorpayInstrumentHelper");
const crypto = require("crypto");
const { Op } = require("sequelize");
const {
  getWalletBalanceBreakdown,
  buildWalletDebitPlan,
} = require("../../services/walletService");
const {
  queueAiChatInterestFinalization,
} = require("../../services/aiChatInterestService");
const {
  queueWalletCohortRefresh,
} = require("../../services/walletCohortService");

// Initialize Razorpay
const razorpay = new Razorpay({
  key_id: process.env.RAZORPAY_KEY_ID,
  key_secret: process.env.RAZORPAY_KEY_SECRET,
});



const paymentDebug = (...args) => {
  console.log('[Backend-Wallet-Debug]', new Date().toISOString(), ...args);
};

const toAmount = (value) => {
  const parsed = parseFloat(value ?? 0);
  return Number.isFinite(parsed) ? parsed : 0;
};

const WALLET_RECHARGE_GST_RATE = 0.18;

const roundMoney = (value) => Math.round(toAmount(value) * 100) / 100;

const toEnvPrice = (value, fallback) => {
  const parsed = parseFloat(value);
  return Number.isFinite(parsed) && parsed > 0 ? parsed : fallback;
};

const AI_CHAT_PRICE_PER_MINUTE = toEnvPrice(
  process.env.AI_CHAT_PRICE_PER_MINUTE,
  10
);
const AI_VOICE_PRICE_PER_MINUTE = toEnvPrice(
  process.env.AI_VOICE_PRICE_PER_MINUTE,
  15
);

const buildWalletPayload = (wallet) => {
  const { balance, signupBonusBalance, rechargeBalance } =
    getWalletBalanceBreakdown(wallet || {});

  return {
    balance,
    signupBonusBalance: 0,
    humanChatBalance: balance,
    aiUsableBalance: balance,
    totalRecharge: toAmount(wallet?.totalRecharge),
    totalSpent: toAmount(wallet?.totalSpent),
    isActive: wallet?.isActive ?? true,
  };
};


const getWalletBalance = async (req, res) => {
  try {
    const userId = req.user.id;

    let wallet = await Wallet.findOne({ where: { userId } });

    // Create wallet if doesn't exist
    if (!wallet) {
      wallet = await Wallet.create({ userId });
    }
    queueWalletCohortRefresh(userId, "wallet_balance_checked");

    res.status(200).json({
      success: true,
      wallet: buildWalletPayload(wallet),
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
    const { amount, couponCode, billingState } = req.body;
    const rechargeAmount = roundMoney(amount);

    paymentDebug('=== CREATE RECHARGE ORDER START ===');
    paymentDebug('User ID:', userId);
    paymentDebug('Amount:', amount);
    paymentDebug('Coupon Code:', couponCode);

    if (!rechargeAmount || rechargeAmount < 1) {
      paymentDebug('ERROR: Invalid amount', amount);
      return res.status(400).json({
        success: false,
        message: "Amount must be at least ₹1",
      });
    }

    const user = await User.findByPk(userId, { attributes: ["id"] });

    if (!user) {


      return res.status(401).json({
        success: false,
        message: "Your session has expired. Please login again before recharging your wallet.",
      });
    }

    let finalAmount = rechargeAmount;
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

      if (coupon.assignmentRequired) {
        const assignment = await CouponUserAssignment.findOne({
          where: { couponId: coupon.id, userId },
        });

        if (!assignment) {
          return res.status(403).json({
            success: false,
            message: "This coupon is not assigned to your account",
          });
        }
      }

      // Check minimum recharge amount
      if (rechargeAmount < parseFloat(coupon.minRechargeAmount)) {
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
        discountAmount = (rechargeAmount * parseFloat(coupon.discountValue)) / 100;
        if (coupon.maxDiscount) {
          discountAmount = Math.min(discountAmount, parseFloat(coupon.maxDiscount));
        }
      } else {
        discountAmount = parseFloat(coupon.discountValue);
      }

      discountAmount = roundMoney(Math.min(discountAmount, rechargeAmount));
      finalAmount = roundMoney(rechargeAmount - discountAmount);

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

    const gstAmount = roundMoney(finalAmount * WALLET_RECHARGE_GST_RATE);
    const payableAmount = roundMoney(finalAmount + gstAmount);
    const normalizedBillingState =
      typeof billingState === "string" && billingState.trim()
        ? billingState.trim()
        : null;

    // Create Razorpay order with final amount
    const timestamp = Date.now().toString().slice(-8);
    const userIdShort = userId.toString().length > 10 ? 
      crypto.createHash('md5').update(userId.toString()).digest('hex').slice(0, 8) : 
      userId.toString();
    const receipt = `rcpt_${userIdShort}_${timestamp}`;
    
    const options = {
      amount: Math.round(payableAmount * 100), // Payable amount in paise, including GST
      currency: "INR",
      receipt: receipt,
      notes: {
        userId,
        walletId: wallet.id,
        purpose: "wallet_recharge",
        originalAmount: rechargeAmount,
        discountAmount: discountAmount,
        walletCreditAmount: finalAmount,
        gstRate: WALLET_RECHARGE_GST_RATE,
        gstAmount,
        payableAmount,
        billingState: normalizedBillingState,
        couponCode: couponCode || null,
      },
    };

    paymentDebug('Creating Razorpay order:', {
      amount: options.amount,
      currency: options.currency,
      receipt: options.receipt,
      userId,
    });
    const razorpayOrder = await razorpay.orders.create(options);
    paymentDebug('Razorpay order created successfully:', razorpayOrder.id);

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
      metadata: {
        originalAmount: rechargeAmount,
        discountAmount,
        walletCreditAmount: finalAmount,
        gstRate: WALLET_RECHARGE_GST_RATE,
        gstAmount,
        payableAmount,
        billingState: normalizedBillingState,
      },
      balanceBefore: wallet.balance,
    });

    // Create pending coupon usage record if coupon applied
    if (appliedCoupon) {
      await CouponUsage.create({
        couponId: appliedCoupon.id,
        userId,
        rechargeAmount,
        discountAmount,
        finalAmount: payableAmount,
        orderId: razorpayOrder.id,
        status: "pending",
      });
    }

    paymentDebug('Transaction created in DB:', transaction.id);
    paymentDebug('=== CREATE RECHARGE ORDER SUCCESS ===');

    res.status(201).json({
      success: true,
      message: "Recharge order created successfully",
      data: {
        orderId: razorpayOrder.id,
        originalAmount: rechargeAmount,
        discountAmount: parseFloat(discountAmount),
        finalAmount: parseFloat(finalAmount),
        gstRate: WALLET_RECHARGE_GST_RATE,
        gstAmount: parseFloat(gstAmount),
        payableAmount: parseFloat(payableAmount),
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

    paymentDebug('=== VERIFY RECHARGE START ===');
    paymentDebug('User ID:', userId);
    paymentDebug('Order ID:', razorpay_order_id);
    paymentDebug('Payment ID:', razorpay_payment_id);
    paymentDebug('Signature received:', razorpay_signature ? 'Yes' : 'No');

    if (!razorpay_order_id || !razorpay_payment_id || !razorpay_signature) {
      paymentDebug('ERROR: Missing verification parameters');
      return res.status(400).json({
        success: false,
        message: "Missing payment verification parameters",
      });
    }

    // Verify signature
    paymentDebug('Verifying signature...');
    const generatedSignature = crypto
      .createHmac("sha256", process.env.RAZORPAY_KEY_SECRET)
      .update(`${razorpay_order_id}|${razorpay_payment_id}`)
      .digest("hex");

    paymentDebug('Generated signature:', generatedSignature.substring(0, 10) + '...');
    paymentDebug('Received signature:', razorpay_signature.substring(0, 10) + '...');
    paymentDebug('Signatures match:', generatedSignature === razorpay_signature);

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

    paymentDebug('Signature verified successfully');

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
      queueWalletCohortRefresh(userId, "recharge_verify_idempotent");
      return res.status(200).json({
        success: true,
        message: "Transaction already completed",
        wallet: buildWalletPayload(wallet),
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
      const newBalance = toAmount(wallet.balance) + toAmount(transaction.amount);
      const newTotalRecharge = toAmount(wallet.totalRecharge) + toAmount(transaction.amount);

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
          paymentMethod: "razorpay",
          razorpayPaymentId: razorpay_payment_id,
          razorpaySignature: razorpay_signature,
          balanceAfter: newBalance,
          metadata: {
            ...transaction.metadata,
            gatewayPaymentMethod: "Razorpay Gateway",
          },
        },
        { transaction: dbTransaction }
      );

      await dbTransaction.commit();

      // Asynchronously fetch exact payment instrument (Google Pay, PhonePe, Card) AFTER commit
      // so it never slows down or holds database locks during the user's recharge flow
      try {
        const exactMethod = await fetchExactRazorpayInstrument(razorpay_payment_id);
        if (exactMethod && exactMethod !== "Razorpay Gateway") {
          await transaction.update({
            paymentMethod: "razorpay",
            metadata: {
              ...transaction.metadata,
              gatewayPaymentMethod: exactMethod,
            },
          });
        }
      } catch (instrumentErr) {
        paymentDebug("Non-blocking error fetching exact Razorpay instrument:", instrumentErr.message);
      }

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

      paymentDebug("Wallet recharge verified successfully", {
        userId,
        transactionId: transaction.id,
        amount: transaction.amount,
        newBalance,
      });
      queueWalletCohortRefresh(userId, "recharge_verified");

      res.status(200).json({
        success: true,
        message: "Wallet recharged successfully",
        wallet: buildWalletPayload(wallet),
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
    if (status) {
      where.status = status;
    } else {
      // Exclude pending prefetch placeholders from user transaction history
      where.status = { [Op.ne]: "pending" };
    }

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

  const debitPlan = buildWalletDebitPlan(wallet, amount, {
    allowSignupBonusUsage: true,
  });
  const newTotalSpent = toAmount(wallet.totalSpent) + debitPlan.debitAmount;

  await wallet.update({
    balance: debitPlan.nextBalance,
    signupBonusBalance: debitPlan.nextSignupBonusBalance,
    totalSpent: newTotalSpent,
  });

  const transaction = await WalletTransaction.create({
    userId,
    walletId: wallet.id,
    amount: debitPlan.debitAmount,
    type: "debit",
    status: "completed",
    paymentMethod: "manual",
    description,
    balanceBefore: debitPlan.previousBalance,
    balanceAfter: debitPlan.nextBalance,
    metadata: {
      rechargeConsumed: debitPlan.rechargeConsumed,
      signupBonusConsumed: debitPlan.signupBonusConsumed,
    },
  });

  return {
    success: true,
    wallet: buildWalletPayload(wallet),
    transaction,
  };
};

/**
 * Deduct from wallet for AI chat/voice usage
 */
const deductForAIUsage = async (req, res) => {
  try {
    const userId = req.user.id;
    const { amount, type, minutes, sessionId } = req.body;
    const parsedAmount = toAmount(amount);
    const parsedMinutes = toAmount(minutes);



    if (!parsedAmount || parsedAmount <= 0) {
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

    const expectedRate =
      type === "chat" ? AI_CHAT_PRICE_PER_MINUTE : AI_VOICE_PRICE_PER_MINUTE;
    const isValidMultiple =
      Math.abs(parsedAmount / expectedRate - Math.round(parsedAmount / expectedRate)) < 1e-6;
    if (!isValidMultiple) {
      return res.status(400).json({
        success: false,
        message: `Invalid amount for ${type}. Expected multiples of ${expectedRate} per minute.`,
      });
    }

    // Get wallet
    const wallet = await Wallet.findOne({ where: { userId } });

    if (!wallet) {
      console.error('[PRODUCTION DEBUG] Wallet not found for userId:', userId);
      return res.status(404).json({
        success: false,
        message: "Wallet not found",
      });
    }



    // Check sufficient balance
    const currentBalance = parseFloat(wallet.balance);

    if (currentBalance < parsedAmount) {
      console.error('[PRODUCTION DEBUG] Insufficient balance for AI usage:', {
        userId,
        currentBalance,
        requiredAmount: parsedAmount,
        deficit: parsedAmount - currentBalance
      });
      return res.status(400).json({
        success: false,
        message: "Insufficient wallet balance",
        currentBalance: currentBalance,
      });
    }

    // Use transaction for atomicity
    const dbTransaction = await sequelize.transaction();

    try {
      const debitPlan = buildWalletDebitPlan(wallet, parsedAmount, {
        allowSignupBonusUsage: true,
      });
      const newTotalSpent = toAmount(wallet.totalSpent) + debitPlan.debitAmount;

      const sequelize = require("../../dbConnection/dbConfig").sequelize;

      // Update wallet
      await wallet.update(
        {
          balance: debitPlan.nextBalance,
          signupBonusBalance: debitPlan.nextSignupBonusBalance,
          totalSpent: newTotalSpent,
        },
        { transaction: dbTransaction }
      );
      // Create transaction record
      const transaction = await WalletTransaction.create(
        {
          userId,
          walletId: wallet.id,
          amount: debitPlan.debitAmount,
          type: "debit",
          status: "completed",
          paymentMethod: "manual",
          description: `AI ${type} usage - ${parsedMinutes.toFixed(2)} minutes`,
          balanceBefore: debitPlan.previousBalance,
          balanceAfter: debitPlan.nextBalance,
          metadata: {
            usageType: `ai_${type}`,
            durationMinutes: parsedMinutes,
            rechargeConsumed: debitPlan.rechargeConsumed,
            signupBonusConsumed: debitPlan.signupBonusConsumed,
          },
        },
        { transaction: dbTransaction }
      );

      await dbTransaction.commit();



      if (type === "chat") {
        queueAiChatInterestFinalization({
          userId,
          sessionId: sessionId || null,
          markInactive: false,
        });
      }
      queueWalletCohortRefresh(userId, "ai_wallet_deducted");

      const responseData = {
        success: true,
        message: "Amount deducted successfully",
        newBalance: debitPlan.nextBalance,
        wallet: buildWalletPayload(wallet),
        transaction: {
          id: transaction.id,
          amount: debitPlan.debitAmount,
          balanceBefore: debitPlan.previousBalance,
          balanceAfter: debitPlan.nextBalance,
          rechargeConsumed: debitPlan.rechargeConsumed,
          signupBonusConsumed: debitPlan.signupBonusConsumed,
        },
      };
      res.status(200).json(responseData);
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

const cancelRechargeOrder = async (req, res) => {
  try {
    const userId = req.user.id;
    const { orderId, reason } = req.body;

    if (!orderId) {
      return res.status(400).json({
        success: false,
        message: "Order ID is required to cancel recharge",
      });
    }

    const transaction = await WalletTransaction.findOne({
      where: { razorpayOrderId: orderId, userId },
    });

    if (!transaction) {
      return res.status(404).json({
        success: false,
        message: "Transaction not found",
      });
    }

    if (transaction.status === "pending") {
      await transaction.update({
        status: "failed",
        metadata: {
          ...transaction.metadata,
          cancelled: true,
          cancelledAt: new Date().toISOString(),
          cancelReason: reason || "User cancelled checkout",
        },
      });

      const couponUsage = await CouponUsage.findOne({
        where: {
          orderId,
          userId,
          status: "pending",
        },
      });

      if (couponUsage) {
        await couponUsage.update({ status: "failed" });
      }
    }

    return res.status(200).json({
      success: true,
      message: "Recharge order marked as cancelled",
    });
  } catch (error) {
    console.error("Cancel recharge order error:", error);
    return res.status(500).json({
      success: false,
      message: "Failed to cancel recharge order",
      error: error.message,
    });
  }
};

const createRechargeQrOrder = async (req, res) => {
  try {
    const userId = req.user?.id || req.user?.userId || req.user;
    const { amount, couponCode, billingState } = req.body;
    const rechargeAmount = roundMoney(toAmount(amount));

    if (!rechargeAmount || rechargeAmount < 1) {
      return res.status(400).json({
        success: false,
        message: "Invalid recharge amount. Minimum recharge is ₹1",
      });
    }

    let discountAmount = 0;
    let finalAmount = rechargeAmount;
    let appliedCoupon = null;

    if (couponCode) {
      const coupon = await Coupon.findOne({
        where: { code: couponCode.trim().toUpperCase(), isActive: true },
      });
      if (coupon) {
        if (coupon.discountType === "percentage") {
          discountAmount = (rechargeAmount * parseFloat(coupon.discountValue)) / 100;
          if (coupon.maxDiscount) {
            discountAmount = Math.min(discountAmount, parseFloat(coupon.maxDiscount));
          }
        } else {
          discountAmount = parseFloat(coupon.discountValue);
        }
        discountAmount = roundMoney(Math.min(discountAmount, rechargeAmount));
        finalAmount = roundMoney(rechargeAmount - discountAmount);
        appliedCoupon = { id: coupon.id, code: coupon.code, discountAmount };
      }
    }

    let wallet = await Wallet.findOne({ where: { userId } });
    if (!wallet) {
      wallet = await Wallet.create({ userId });
    }

    const gstAmount = roundMoney(finalAmount * WALLET_RECHARGE_GST_RATE);
    const payableAmount = roundMoney(finalAmount + gstAmount);
    const timestamp = Date.now().toString().slice(-8);
    const userIdShort = userId.toString().slice(0, 8);
    const receipt = `rcpt_qr_${userIdShort}_${timestamp}`;

    const options = {
      amount: Math.round(payableAmount * 100),
      currency: "INR",
      receipt: receipt,
      notes: {
        userId,
        walletId: wallet.id,
        purpose: "wallet_recharge_qr",
        originalAmount: rechargeAmount,
        discountAmount: discountAmount,
        walletCreditAmount: finalAmount,
        payableAmount,
      },
    };

    const razorpayOrder = await razorpay.orders.create(options);

    const transaction = await WalletTransaction.create({
      userId,
      walletId: wallet.id,
      amount: finalAmount,
      type: "credit",
      status: "pending",
      paymentMethod: "razorpay",
      razorpayOrderId: razorpayOrder.id,
      description: `Wallet recharge QR of ₹${rechargeAmount}`,
      metadata: {
        gatewayPaymentMethod: "upi_qr",
        originalAmount: rechargeAmount,
        discountAmount,
        walletCreditAmount: finalAmount,
        payableAmount,
      },
      balanceBefore: wallet.balance,
    });

    if (appliedCoupon) {
      await CouponUsage.create({
        couponId: appliedCoupon.id,
        userId,
        rechargeAmount,
        discountAmount,
        finalAmount: payableAmount,
        orderId: razorpayOrder.id,
        status: "pending",
      });
    }

    const upiUri = `upi://pay?pa=graho.razorpay@hdfcbank&pn=Graho&am=${payableAmount}&cu=INR&tr=${transaction.id}&tn=Graho_Wallet_Recharge`;
    let imageUrl = null;

    try {
      if (razorpay.qrCode && typeof razorpay.qrCode.create === "function") {
        const qr = await razorpay.qrCode.create({
          type: "upi_qr",
          name: "Graho Wallet Recharge",
          usage: "single_use",
          fixed_amount: true,
          payment_amount: Math.round(payableAmount * 100),
          description: `Wallet recharge ₹${payableAmount}`,
          notes: { orderId: razorpayOrder.id, transactionId: transaction.id },
        });
        if (qr && qr.image_url) {
          imageUrl = qr.image_url;
        }
      }
    } catch (e) {
      const errReason =
        e?.error?.description || e?.description || e?.message || JSON.stringify(e);
      console.log("Razorpay qrCode.create fallback to upiUri due to API/Test-mode note:", errReason);
    }

    return res.status(201).json({
      success: true,
      message: "QR recharge order created successfully",
      data: {
        orderId: razorpayOrder.id,
        transactionId: transaction.id,
        payableAmount,
        walletCreditAmount: finalAmount,
        upiUri,
        imageUrl,
      },
    });
  } catch (error) {
    console.error("Create recharge QR order error:", error);
    return res.status(500).json({
      success: false,
      message: "Failed to create QR order",
      error: error.message,
    });
  }
};

const checkRechargeStatus = async (req, res) => {
  try {
    const userId = req.user?.id || req.user?.userId || req.user;
    const { transactionId } = req.query;
    if (!transactionId) {
      return res.status(400).json({ success: false, message: "transactionId required" });
    }
    const transaction = await WalletTransaction.findOne({
      where: { id: transactionId, userId },
    });
    if (!transaction) {
      return res.status(404).json({ success: false, message: "Transaction not found" });
    }
    if (transaction.status === "completed" || transaction.status === "success") {
      const wallet = await Wallet.findOne({ where: { userId } });
      return res.status(200).json({
        success: true,
        status: "success",
        transaction: {
          id: transaction.id,
          amount: parseFloat(transaction.amount),
          status: transaction.status,
        },
        wallet: wallet ? buildWalletPayload(wallet) : null,
      });
    }
    return res.status(200).json({ success: true, status: transaction.status });
  } catch (error) {
    console.error("Check recharge status error:", error);
    return res.status(500).json({ success: false, message: "Check status error" });
  }
};

module.exports = {
  getWalletBalance,
  createRechargeOrder,
  verifyRecharge,
  cancelRechargeOrder,
  getTransactionHistory,
  deductFromWallet,
  deductForAIUsage,
  createRechargeQrOrder,
  checkRechargeStatus,
};
