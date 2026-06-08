const { DataTypes } = require("sequelize");
const { sequelize } = require("../../dbConnection/dbConfig");

const CouponUserAssignment = sequelize.define(
  "CouponUserAssignment",
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
    assignedBy: {
      type: DataTypes.UUID,
      allowNull: true,
      references: {
        model: "admins",
        key: "id",
      },
      onDelete: "SET NULL",
      onUpdate: "CASCADE",
    },
    note: {
      type: DataTypes.TEXT,
      allowNull: true,
    },
  },
  {
    tableName: "coupon_user_assignments",
    timestamps: true,
    indexes: [
      {
        unique: true,
        fields: ["couponId", "userId"],
      },
      {
        fields: ["userId"],
      },
    ],
  }
);

module.exports = CouponUserAssignment;
