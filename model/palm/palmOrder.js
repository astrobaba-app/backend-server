const { DataTypes } = require("sequelize");
const { sequelize } = require("../../dbConnection/dbConfig");

const PalmOrder = sequelize.define(
  "PalmOrder",
  {
    id: { type: DataTypes.UUID, defaultValue: DataTypes.UUIDV4, primaryKey: true },
    userId: { type: DataTypes.UUID, allowNull: false },
    palmUploadId: { type: DataTypes.UUID, allowNull: false, unique: true },
    amount: { type: DataTypes.DECIMAL(10, 2), allowNull: false, defaultValue: 49 },
    status: {
      type: DataTypes.ENUM("pending_payment", "paid", "failed", "expired"),
      allowNull: false,
      defaultValue: "pending_payment",
    },
    paymentMethod: {
      type: DataTypes.ENUM("wallet", "razorpay"),
      allowNull: true,
    },
    walletTransactionId: { type: DataTypes.UUID, allowNull: true },
    razorpayOrderId: { type: DataTypes.STRING, allowNull: true },
    razorpayPaymentId: { type: DataTypes.STRING, allowNull: true },
    razorpaySignature: { type: DataTypes.TEXT, allowNull: true },
    idempotencyKey: { type: DataTypes.STRING, allowNull: true },
    expiresAt: { type: DataTypes.DATE, allowNull: true },
    refundStatus: {
      type: DataTypes.ENUM("none", "pending", "processing", "completed", "failed"),
      allowNull: false,
      defaultValue: "none",
    },
    refundReason: { type: DataTypes.STRING, allowNull: true },
    refundProcessedAt: { type: DataTypes.DATE, allowNull: true },
    refundRazorpayId: { type: DataTypes.STRING, allowNull: true },
  },
  {
    tableName: "palm_orders",
    timestamps: true,
    indexes: [{ fields: ["userId"] }, { fields: ["status"] }],
  }
);

module.exports = PalmOrder;
