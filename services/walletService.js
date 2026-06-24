const Wallet = require("../model/wallet/wallet");
const WalletTransaction = require("../model/wallet/walletTransaction");
const { sequelize } = require("../dbConnection/dbConfig");
const { queueWalletCohortRefresh } = require("./walletCohortService");

const toAmount = (value) => {
  const parsed = parseFloat(value ?? 0);
  return Number.isFinite(parsed) ? parsed : 0;
};

const roundCurrency = (value) => Math.round((toAmount(value) + Number.EPSILON) * 100) / 100;

const getWalletBalanceBreakdown = (walletLike) => {
  const balance = Math.max(0, toAmount(walletLike?.balance));
  const rawSignupBonusBalance = Math.max(0, toAmount(walletLike?.signupBonusBalance));
  const signupBonusBalance = Math.min(rawSignupBonusBalance, balance);
  const rechargeBalance = Math.max(0, balance - signupBonusBalance);

  return {
    balance: roundCurrency(balance),
    signupBonusBalance: roundCurrency(signupBonusBalance),
    rechargeBalance: roundCurrency(rechargeBalance),
  };
};

const buildWalletDebitPlan = (walletLike, amount, options = {}) => {
  const { allowSignupBonusUsage = true } = options;
  const debitAmount = roundCurrency(amount);

  if (debitAmount <= 0) {
    throw new Error("Invalid debit amount");
  }

  const { balance, signupBonusBalance, rechargeBalance } =
    getWalletBalanceBreakdown(walletLike);

  if (balance < debitAmount) {
    throw new Error("Insufficient balance");
  }

  let rechargeConsumed = Math.min(rechargeBalance, debitAmount);
  let remaining = roundCurrency(debitAmount - rechargeConsumed);
  let signupBonusConsumed = 0;

  if (remaining > 0) {
    if (!allowSignupBonusUsage) {
      throw new Error("Insufficient recharge balance");
    }

    signupBonusConsumed = Math.min(signupBonusBalance, remaining);
    remaining = roundCurrency(remaining - signupBonusConsumed);
  }

  if (remaining > 0) {
    throw new Error("Insufficient balance");
  }

  const nextBalance = roundCurrency(balance - debitAmount);
  const nextSignupBonusBalance = roundCurrency(signupBonusBalance - signupBonusConsumed);
  const nextRechargeBalance = roundCurrency(nextBalance - nextSignupBonusBalance);

  return {
    debitAmount,
    rechargeConsumed: roundCurrency(rechargeConsumed),
    signupBonusConsumed: roundCurrency(signupBonusConsumed),
    previousBalance: balance,
    previousSignupBonusBalance: signupBonusBalance,
    previousRechargeBalance: rechargeBalance,
    nextBalance,
    nextSignupBonusBalance,
    nextRechargeBalance,
  };
};

/**
 * Credit amount to user's wallet
 * @param {string} userId - User ID
 * @param {number} amount - Amount to credit
 * @param {string} description - Transaction description
 * @param {string} paymentMethod - Payment method (signup_bonus, manual, bonus, etc)
 * @returns {Promise<Object>} Transaction result
 */
const creditWallet = async (userId, amount, description, paymentMethod = "manual") => {
  const t = await sequelize.transaction();

  try {
    // Find or create wallet
    let wallet = await Wallet.findOne({ where: { userId }, transaction: t });

    if (!wallet) {
      wallet = await Wallet.create({ userId }, { transaction: t });
    }

    const previousBalance = toAmount(wallet.balance);
    const previousTotalRecharge = toAmount(wallet.totalRecharge);
    const previousSignupBonusBalance = toAmount(wallet.signupBonusBalance);
    const creditAmount = roundCurrency(amount);
    const newBalance = roundCurrency(previousBalance + creditAmount);
    const isSignupBonusCredit = paymentMethod === "signup_bonus";
    const totalRechargeIncrement = isSignupBonusCredit ? 0 : creditAmount;
    const nextSignupBonusBalance = isSignupBonusCredit
      ? roundCurrency(previousSignupBonusBalance + creditAmount)
      : roundCurrency(previousSignupBonusBalance);

    // Update wallet balances
    await wallet.update(
      {
        balance: newBalance,
        totalRecharge: roundCurrency(previousTotalRecharge + totalRechargeIncrement),
        signupBonusBalance: nextSignupBonusBalance,
      },
      { transaction: t }
    );

    // Create transaction record
    const transaction = await WalletTransaction.create(
      {
        walletId: wallet.id,
        userId: userId,
        amount: creditAmount,
        type: "credit",
        paymentMethod: paymentMethod,
        status: "completed",
        description: description,
        balanceBefore: previousBalance,
        balanceAfter: newBalance,
      },
      { transaction: t }
    );

    await t.commit();
    queueWalletCohortRefresh(userId, "wallet_credit");

    return {
      success: true,
      wallet: {
        balance: newBalance,
        totalRecharge: toAmount(wallet.totalRecharge),
        signupBonusBalance: toAmount(wallet.signupBonusBalance),
        rechargeBalance: getWalletBalanceBreakdown(wallet).rechargeBalance,
      },
      transaction: {
        id: transaction.id,
        amount: creditAmount,
        type: "credit",
        paymentMethod: paymentMethod,
        description: description,
      },
    };
  } catch (error) {
    await t.rollback();
    console.error("Credit wallet error:", error);
    throw error;
  }
};

/**
 * Debit amount from user's wallet
 * @param {string} userId - User ID
 * @param {number} amount - Amount to debit
 * @param {string} description - Transaction description
 * @param {string} paymentMethod - Payment method
 * @returns {Promise<Object>} Transaction result
 */
const debitWallet = async (
  userId,
  amount,
  description,
  paymentMethod = "manual",
  options = {}
) => {
  const t = await sequelize.transaction();

  try {
    // Find wallet
    const wallet = await Wallet.findOne({ where: { userId }, transaction: t });

    if (!wallet) {
      throw new Error("Wallet not found");
    }

    const debitPlan = buildWalletDebitPlan(wallet, amount, {
      allowSignupBonusUsage: options.allowSignupBonusUsage !== false,
    });
    const debitAmount = debitPlan.debitAmount;
    const previousTotalSpent = toAmount(wallet.totalSpent);

    // Update wallet balance and total spent
    await wallet.update(
      {
        balance: debitPlan.nextBalance,
        signupBonusBalance: debitPlan.nextSignupBonusBalance,
        totalSpent: roundCurrency(previousTotalSpent + debitAmount),
      },
      { transaction: t }
    );

    // Create transaction record
    const transaction = await WalletTransaction.create(
      {
        walletId: wallet.id,
        userId: userId,
        amount: debitAmount,
        type: "debit",
        paymentMethod: paymentMethod,
        status: "completed",
        description: description,
        balanceBefore: debitPlan.previousBalance,
        balanceAfter: debitPlan.nextBalance,
        metadata: {
          ...(options.metadata || {}),
          rechargeConsumed: debitPlan.rechargeConsumed,
          signupBonusConsumed: debitPlan.signupBonusConsumed,
        },
      },
      { transaction: t }
    );

    await t.commit();
    queueWalletCohortRefresh(userId, "wallet_debit");

    return {
      success: true,
      wallet: {
        balance: debitPlan.nextBalance,
        signupBonusBalance: debitPlan.nextSignupBonusBalance,
        rechargeBalance: debitPlan.nextRechargeBalance,
        totalSpent: toAmount(wallet.totalSpent),
      },
      transaction: {
        id: transaction.id,
        amount: debitAmount,
        type: "debit",
        paymentMethod: paymentMethod,
        description: description,
      },
    };
  } catch (error) {
    await t.rollback();
    console.error("Debit wallet error:", error);
    throw error;
  }
};

module.exports = {
  creditWallet,
  debitWallet,
  getWalletBalanceBreakdown,
  buildWalletDebitPlan,
};
