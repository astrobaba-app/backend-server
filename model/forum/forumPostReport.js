const { DataTypes } = require("sequelize");
const { sequelize } = require("../../dbConnection/dbConfig");

const ForumPostReport = sequelize.define(
  "ForumPostReport",
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
    reporterUserId: {
      type: DataTypes.UUID,
      allowNull: false,
      references: {
        model: "users",
        key: "id",
      },
      onDelete: "CASCADE",
      onUpdate: "CASCADE",
    },
    reason: {
      type: DataTypes.ENUM(
        "abusive_content",
        "harassment_or_hate",
        "spam_or_scam",
        "false_information",
        "sexual_content",
        "off_topic",
        "other"
      ),
      allowNull: false,
    },
    details: {
      type: DataTypes.TEXT,
      allowNull: true,
      defaultValue: null,
    },
    status: {
      type: DataTypes.ENUM("pending", "resolved", "dismissed"),
      allowNull: false,
      defaultValue: "pending",
    },
    reviewedByAdminId: {
      type: DataTypes.UUID,
      allowNull: true,
      references: {
        model: "admins",
        key: "id",
      },
      onDelete: "SET NULL",
      onUpdate: "CASCADE",
    },
    reviewedAt: {
      type: DataTypes.DATE,
      allowNull: true,
      defaultValue: null,
    },
    adminNote: {
      type: DataTypes.TEXT,
      allowNull: true,
      defaultValue: null,
    },
  },
  {
    tableName: "forum_post_reports",
    timestamps: true,
    indexes: [
      {
        fields: ["postId"],
      },
      {
        fields: ["reporterUserId"],
      },
      {
        fields: ["status"],
      },
      {
        unique: true,
        fields: ["postId", "reporterUserId", "status"],
        name: "forum_post_reports_post_reporter_status_unique",
      },
    ],
  }
);

module.exports = ForumPostReport;