const { DataTypes } = require("sequelize");
const { sequelize } = require("../../dbConnection/dbConfig");

const ContentBank = sequelize.define(
  "ContentBank",
  {
    key: {
      type: DataTypes.TEXT,
      primaryKey: true,
      allowNull: false,
    },
    category: {
      type: DataTypes.TEXT,
      allowNull: false,
    },
    text: {
      type: DataTypes.TEXT,
      allowNull: false,
    },
    version: {
      type: DataTypes.INTEGER,
      allowNull: false,
      defaultValue: 1,
    },
    tags: {
      type: DataTypes.JSON,
      allowNull: true,
    },
  },
  {
    tableName: "content_bank",
    timestamps: true,
  }
);

module.exports = ContentBank;
