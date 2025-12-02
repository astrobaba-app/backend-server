const { DataTypes } = require("sequelize");
const sequelize = require("../../config/database/database");

const ProductReview = sequelize.define(
  "ProductReview",
  {
    id: {
      type: DataTypes.UUID,
      defaultValue: DataTypes.UUIDV4,
      primaryKey: true,
    },
    productId: {
      type: DataTypes.UUID,
      allowNull: false,
      references: {
        model: "products",
        key: "id",
      },
      onDelete: "CASCADE",
    },
    userId: {
      type: DataTypes.UUID,
      allowNull: false,
      references: {
        model: "users",
        key: "id",
      },
      onDelete: "CASCADE",
    },
    orderId: {
      type: DataTypes.UUID,
      references: {
        model: "orders",
        key: "id",
      },
      onDelete: "SET NULL",
    },
    rating: {
      type: DataTypes.INTEGER,
      allowNull: false,
      validate: {
        min: 1,
        max: 5,
      },
    },
    title: {
      type: DataTypes.STRING(200),
    },
    review: {
      type: DataTypes.TEXT,
    },
    images: {
      type: DataTypes.ARRAY(DataTypes.TEXT),
      defaultValue: [],
    },
    isVerifiedPurchase: {
      type: DataTypes.BOOLEAN,
      defaultValue: false,
    },
    isApproved: {
      type: DataTypes.BOOLEAN,
      defaultValue: true, // Auto-approve or require admin approval
    },
    helpfulCount: {
      type: DataTypes.INTEGER,
      defaultValue: 0,
      comment: "Number of users who found this review helpful",
    },
    adminReply: {
      type: DataTypes.TEXT,
    },
    adminRepliedAt: {
      type: DataTypes.DATE,
    },
  },
  {
    tableName: "product_reviews",
    timestamps: true,
    indexes: [
      {
        fields: ["productId"],
      },
      {
        fields: ["userId"],
      },
      {
        fields: ["orderId"],
      },
      {
        fields: ["rating"],
      },
      {
        fields: ["isVerifiedPurchase"],
      },
      {
        fields: ["isApproved"],
      },
      {
        fields: ["createdAt"],
      },
      {
        fields: ["userId", "productId"],
        unique: true,
        name: "unique_user_product_review",
      },
    ],
  }
);

module.exports = ProductReview;
