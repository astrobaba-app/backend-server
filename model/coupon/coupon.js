const { DataTypes } = require("sequelize");
const { sequelize } = require("../../dbConnection/dbConfig");

const Coupon = sequelize.define(
  "Coupon",
  {
    id: {
      type: DataTypes.UUID,
      defaultValue: DataTypes.UUIDV4,
      primaryKey: true,
    },
    code: {
      type: DataTypes.STRING,
      allowNull: false,
      unique: true,
      comment: "Coupon code (e.g., FIRST100, DIWALI50)",
    },
    description: {
      type: DataTypes.TEXT,
      allowNull: true,
      comment: "Coupon description for users",
    },
    discountType: {
      type: DataTypes.ENUM("percentage", "fixed"),
      allowNull: false,
      comment: "percentage: % off, fixed: flat amount off",
    },
    discountValue: {
      type: DataTypes.DECIMAL(10, 2),
      allowNull: false,
      comment: "Discount value (e.g., 10 for 10% or ₹10)",
    },
    maxDiscount: {
      type: DataTypes.DECIMAL(10, 2),
      allowNull: true,
      comment: "Maximum discount amount (for percentage coupons)",
    },
    minRechargeAmount: {
      type: DataTypes.DECIMAL(10, 2),
      defaultValue: 0,
      comment: "Minimum recharge amount to use this coupon",
    },
    maxRechargeAmount: {
      type: DataTypes.DECIMAL(10, 2),
      allowNull: true,
      comment: "Maximum recharge amount for this coupon (optional)",
    },
    usageLimit: {
      type: DataTypes.INTEGER,
      allowNull: true,
      comment: "Total times this coupon can be used (null = unlimited)",
    },
    usageCount: {
      type: DataTypes.INTEGER,
      defaultValue: 0,
      comment: "Number of times coupon has been used",
    },
    perUserLimit: {
      type: DataTypes.INTEGER,
      defaultValue: 1,
      comment: "How many times each user can use this coupon",
    },
    validFrom: {
      type: DataTypes.DATE,
      allowNull: false,
      defaultValue: DataTypes.NOW,
      comment: "Coupon valid from date",
    },
    validUntil: {
      type: DataTypes.DATE,
      allowNull: false,
      comment: "Coupon expiry date",
    },
    isActive: {
      type: DataTypes.BOOLEAN,
      defaultValue: true,
      comment: "Admin can enable/disable coupon",
    },
    applicableFor: {
      type: DataTypes.ENUM("all", "new_users", "existing_users"),
      defaultValue: "all",
      comment: "Who can use this coupon",
    },
    createdBy: {
      type: DataTypes.UUID,
      allowNull: true,
      references: {
        model: "admins",
        key: "id",
      },
      comment: "Admin who created this coupon",
    },
  },
  {
    tableName: "coupons",
    timestamps: true,
    indexes: [
      {
        fields: ["code"],
        unique: true,
      },
      {
        fields: ["isActive", "validFrom", "validUntil"],
      },
    ],
  }
);

module.exports = Coupon;
