const { DataTypes } = require("sequelize");
const { sequelize } = require("../../dbConnection/dbConfig");

const CouponUsage = sequelize.define(
  "CouponUsage",
  {
    id: {
      type: DataTypes.UUID,
      defaultValue: DataTypes.UUIDV4,
      primaryKey: true,
    },
    couponId: {
      type: DataTypes.UUID,
      allowNull: false,
      references: {
        model: "coupons",
        key: "id",
      },
      onDelete: "CASCADE",
      onUpdate: "CASCADE",
    },
    userId: {
      type: DataTypes.UUID,
      allowNull: false,
      references: {
        model: "users",
        key: "id",
      },
      onDelete: "CASCADE",
      onUpdate: "CASCADE",
    },
    rechargeAmount: {
      type: DataTypes.DECIMAL(10, 2),
      allowNull: false,
      comment: "Original recharge amount",
    },
    discountAmount: {
      type: DataTypes.DECIMAL(10, 2),
      allowNull: false,
      comment: "Discount applied",
    },
    finalAmount: {
      type: DataTypes.DECIMAL(10, 2),
      allowNull: false,
      comment: "Amount after discount",
    },
    orderId: {
      type: DataTypes.STRING,
      allowNull: true,
      comment: "Payment order ID (Razorpay)",
    },
    status: {
      type: DataTypes.ENUM("pending", "success", "failed"),
      defaultValue: "pending",
      comment: "Usage status based on payment",
    },
  },
  {
    tableName: "coupon_usages",
    timestamps: true,
    indexes: [
      {
        fields: ["couponId", "userId"],
      },
      {
        fields: ["userId", "status"],
      },
      {
        fields: ["orderId"],
      },
    ],
  }
);

module.exports = CouponUsage;
