const { DataTypes } = require("sequelize");
const { sequelize } = require("../../dbConnection/dbConfig");

const ForumPostAppeal = sequelize.define("ForumPostAppeal", {
  id: {
    type: DataTypes.UUID,
    defaultValue: DataTypes.UUIDV4,
    primaryKey: true,
  },
  postId: {
    type: DataTypes.UUID,
    allowNull: false,
    references: { model: "forum_posts", key: "id" },
    onDelete: "CASCADE",
  },
  userId: {
    type: DataTypes.UUID,
    allowNull: false,
    references: { model: "users", key: "id" },
    onDelete: "CASCADE",
  },
  message: {
    type: DataTypes.TEXT,
    allowNull: true,
    defaultValue: null,
  },
  status: {
    type: DataTypes.ENUM("pending", "approved", "rejected"),
    allowNull: false,
    defaultValue: "pending",
  },
  adminNote: {
    type: DataTypes.TEXT,
    allowNull: true,
    defaultValue: null,
  },
  reviewedByAdminId: {
    type: DataTypes.UUID,
    allowNull: true,
    references: { model: "admins", key: "id" },
    onDelete: "SET NULL",
  },
  reviewedAt: {
    type: DataTypes.DATE,
    allowNull: true,
    defaultValue: null,
  },
}, {
  tableName: "forum_post_appeals",
  timestamps: true,
  indexes: [
    { fields: ["postId"] },
    { fields: ["userId"] },
    { fields: ["status"] },
    {
      unique: true,
      fields: ["postId", "userId"],
      name: "forum_post_appeals_post_user_unique",
    },
  ],
});

module.exports = ForumPostAppeal;
