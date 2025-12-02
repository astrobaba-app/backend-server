const { DataTypes } = require("sequelize");
const { sequelize } = require("../../dbConnection/dbConfig");

const Cart = sequelize.define(
  "Cart",
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
      onDelete: "CASCADE",
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
    quantity: {
      type: DataTypes.INTEGER,
      allowNull: false,
      defaultValue: 1,
      validate: {
        min: 1,
      },
    },
    priceAtAdd: {
      type: DataTypes.DECIMAL(10, 2),
      allowNull: false,
      comment: "Price of product when added to cart (for price history)",
    },
  },
  {
    tableName: "cart",
    timestamps: true,
    indexes: [
      {
        fields: ["userId"],
      },
      {
        fields: ["productId"],
      },
      {
        fields: ["userId", "productId"],
        unique: true,
        name: "unique_user_product_cart",
      },
    ],
  }
);

module.exports = Cart;
