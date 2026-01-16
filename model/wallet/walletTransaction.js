const { DataTypes } = require("sequelize");
const { sequelize } = require("../../dbConnection/dbConfig");

const WalletTransaction = sequelize.define(
  "WalletTransaction",
  {
    id: {
      type: DataTypes.UUID,
      defaultValue: DataTypes.UUIDV4,
      primaryKey: true,
    },
    userId: {
      type: DataTypes.UUID,
      allowNull: false,
      references: {
        model: "users",
        key: "id",
      },
      onUpdate: "CASCADE",
      onDelete: "CASCADE",
    },
    walletId: {
      type: DataTypes.UUID,
      allowNull: false,
      references: {
        model: "wallets",
        key: "id",
      },
      onUpdate: "CASCADE",
      onDelete: "CASCADE",
    },
    amount: {
      type: DataTypes.DECIMAL(10, 2),
      allowNull: false,
      comment: "Transaction amount in INR",
    },
    type: {
      type: DataTypes.ENUM("credit", "debit"),
      allowNull: false,
      comment: "credit = money added, debit = money spent",
    },
    status: {
      type: DataTypes.ENUM("pending", "completed", "failed", "refunded"),
      allowNull: false,
      defaultValue: "pending",
    },
    paymentMethod: {
      type: DataTypes.ENUM("razorpay", "manual", "refund", "bonus", "signup_bonus"),
      allowNull: true,
      comment: "Payment method used for the transaction",
    },
    // Razorpay details
    razorpayOrderId: {
      type: DataTypes.STRING,
      allowNull: true,
      unique: true,
    },
    razorpayPaymentId: {
      type: DataTypes.STRING,
      allowNull: true,
    },
    razorpaySignature: {
      type: DataTypes.STRING,
      allowNull: true,
    },
    description: {
      type: DataTypes.STRING,
      allowNull: true,
      comment: "Transaction description",
    },
    metadata: {
      type: DataTypes.JSON,
      allowNull: true,
      comment: "Additional transaction data",
    },
    balanceBefore: {
      type: DataTypes.DECIMAL(10, 2),
      allowNull: true,
      comment: "Wallet balance before transaction",
    },
    balanceAfter: {
      type: DataTypes.DECIMAL(10, 2),
      allowNull: true,
      comment: "Wallet balance after transaction",
    },
  },
  {
    tableName: "wallet_transactions",
    timestamps: true,
  }
);

module.exports = WalletTransaction;
