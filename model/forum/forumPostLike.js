const { DataTypes } = require("sequelize");
const { sequelize } = require("../../dbConnection/dbConfig");

const ForumPostLike = sequelize.define(
  "ForumPostLike",
  {
    id: {
      type: DataTypes.UUID,
      defaultValue: DataTypes.UUIDV4,
      primaryKey: true,
    },
    postId: {
      type: DataTypes.UUID,
      allowNull: false,
      references: {
        model: "forum_posts",
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
  },
  {
    tableName: "forum_post_likes",
    timestamps: true,
    indexes: [
      {
        unique: true,
        fields: ["postId", "userId"],
      },
      {
        fields: ["userId"],
      },
    ],
  }
);

module.exports = ForumPostLike;