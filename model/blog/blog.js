const { DataTypes } = require("sequelize");
const sequelize = require("../../config/database");

const Blog = sequelize.define(
  "Blog",
  {
    id: {
      type: DataTypes.UUID,
      defaultValue: DataTypes.UUIDV4,
      primaryKey: true,
    },
    astrologerId: {
      type: DataTypes.UUID,
      allowNull: false,
      references: {
        model: "astrologers",
        key: "id",
      },
      onDelete: "CASCADE",
      onUpdate: "CASCADE",
    },
    title: {
      type: DataTypes.STRING,
      allowNull: false,
      validate: {
        len: [3, 200],
      },
    },
    description: {
      type: DataTypes.TEXT,
      allowNull: false,
      validate: {
        len: [10, 10000],
      },
    },
    image: {
      type: DataTypes.STRING,
      allowNull: true,
      defaultValue: null,
    },
    isPublished: {
      type: DataTypes.BOOLEAN,
      defaultValue: true,
    },
    views: {
      type: DataTypes.INTEGER,
      defaultValue: 0,
    },
    likes: {
      type: DataTypes.INTEGER,
      defaultValue: 0,
    },
  },
  {
    tableName: "blogs",
    timestamps: true,
  }
);

module.exports = Blog;
