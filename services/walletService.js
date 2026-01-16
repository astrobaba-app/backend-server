const Wallet = require("../model/wallet/wallet");
const WalletTransaction = require("../model/wallet/walletTransaction");
const { sequelize } = require("../dbConnection/dbConfig");

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

    // Calculate new balance
    const previousBalance = parseFloat(wallet.balance);
    const creditAmount = parseFloat(amount);
    const newBalance = previousBalance + creditAmount;

    // Update wallet balance and total recharge
    await wallet.update(
      {
        balance: newBalance,
        totalRecharge: parseFloat(wallet.totalRecharge) + creditAmount,
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

    return {
      success: true,
      wallet: {
        balance: newBalance,
        totalRecharge: parseFloat(wallet.totalRecharge),
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
const debitWallet = async (userId, amount, description, paymentMethod = "manual") => {
  const t = await sequelize.transaction();

  try {
    // Find wallet
    const wallet = await Wallet.findOne({ where: { userId }, transaction: t });

    if (!wallet) {
      throw new Error("Wallet not found");
    }

    const previousBalance = parseFloat(wallet.balance);
    const debitAmount = parseFloat(amount);

    if (previousBalance < debitAmount) {
      throw new Error("Insufficient balance");
    }

    const newBalance = previousBalance - debitAmount;

    // Update wallet balance and total spent
    await wallet.update(
      {
        balance: newBalance,
        totalSpent: parseFloat(wallet.totalSpent) + debitAmount,
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
        balanceBefore: previousBalance,
        balanceAfter: newBalance,
      },
      { transaction: t }
    );

    await t.commit();

    return {
      success: true,
      wallet: {
        balance: newBalance,
        totalSpent: parseFloat(wallet.totalSpent),
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
};
