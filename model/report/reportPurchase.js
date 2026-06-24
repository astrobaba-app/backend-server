const { DataTypes } = require("sequelize");
const { sequelize } = require("../../dbConnection/dbConfig");

const ReportPurchase = sequelize.define(
  "ReportPurchase",
  {
    id: {
      type: DataTypes.UUID,
      defaultValue: DataTypes.UUIDV4,
      primaryKey: true,
    },
    userId: {
      type: DataTypes.UUID,
      allowNull: false,
      references: { model: "users", key: "id" },
      onUpdate: "CASCADE",
      onDelete: "CASCADE",
    },
    reportType: {
      type: DataTypes.ENUM("daily", "yearly", "wealth", "palm"),
      allowNull: false,
    },
    amount: {
      type: DataTypes.DECIMAL(10, 2),
      allowNull: false,
    },
    currency: {
      type: DataTypes.STRING(8),
      allowNull: false,
      defaultValue: "INR",
    },
    status: {
      type: DataTypes.ENUM("pending", "paid", "consumed", "failed", "refunded"),
      allowNull: false,
      defaultValue: "pending",
    },
    paymentMethod: {
      type: DataTypes.ENUM("wallet", "razorpay"),
      allowNull: true,
    },
    accessToken: {
      type: DataTypes.UUID,
      allowNull: false,
      defaultValue: DataTypes.UUIDV4,
      unique: true,
    },
    walletTransactionId: {
      type: DataTypes.UUID,
      allowNull: true,
      references: { model: "wallet_transactions", key: "id" },
      onUpdate: "CASCADE",
      onDelete: "SET NULL",
    },
    razorpayOrderId: {
      type: DataTypes.STRING,
      allowNull: true,
    },
    razorpayPaymentId: {
      type: DataTypes.STRING,
      allowNull: true,
    },
    razorpaySignature: {
      type: DataTypes.TEXT,
      allowNull: true,
    },
    consumedAt: {
      type: DataTypes.DATE,
      allowNull: true,
    },
    metadata: {
      type: DataTypes.JSON,
      allowNull: true,
      defaultValue: {},
    },
  },
  {
    tableName: "report_purchases",
    timestamps: true,
    indexes: [
      { fields: ["userId"] },
      { fields: ["reportType"] },
      { fields: ["status"] },
      { fields: ["accessToken"] },
      { fields: ["razorpayOrderId"] },
    ],
  }
);

module.exports = ReportPurchase;
