const { DataTypes } = require("sequelize");
const { sequelize } = require("../../dbConnection/dbConfig");

const Notification = sequelize.define(
  "Notification",
  {
    id: {
      type: DataTypes.UUID,
      defaultValue: DataTypes.UUIDV4,
      primaryKey: true,
    },
    userId: {
      type: DataTypes.UUID,
      allowNull: true,
      references: {
        model: "users",
        key: "id",
      },
      onDelete: "CASCADE",
      onUpdate: "CASCADE",
      comment: "Null means broadcast to all users",
    },
    type: {
      type: DataTypes.ENUM(
        "live_started",
        "live_scheduled",
        "call_incoming",
        "call_missed",
        "chat_request",
        "review_reply",
        "wallet_credited",
        "admin_broadcast",
        "astrologer_online",
        "test",
        "general"
      ),
      allowNull: false,
    },
    title: {
      type: DataTypes.STRING,
      allowNull: false,
    },
    message: {
      type: DataTypes.TEXT,
      allowNull: false,
    },
    data: {
      type: DataTypes.JSONB,
      allowNull: true,
      comment: "Additional data like liveSessionId, astrologerId, etc.",
    },
    isRead: {
      type: DataTypes.BOOLEAN,
      defaultValue: false,
    },
    readAt: {
      type: DataTypes.DATE,
      allowNull: true,
    },
    actionUrl: {
      type: DataTypes.STRING,
      allowNull: true,
      comment: "Deep link or URL to navigate when clicked",
    },
    priority: {
      type: DataTypes.ENUM("low", "medium", "high", "urgent"),
      defaultValue: "medium",
    },
    expiresAt: {
      type: DataTypes.DATE,
      allowNull: true,
      comment: "Notification expiry for time-sensitive notifications",
    },
    pushDeliveredAt: {
      type: DataTypes.DATE,
      allowNull: true,
      comment: "When the push notification was successfully delivered to FCM",
    },
    pushAttemptCount: {
      type: DataTypes.INTEGER,
      allowNull: false,
      defaultValue: 0,
      comment: "Number of push delivery attempts made for this notification",
    },
    pushLastAttemptAt: {
      type: DataTypes.DATE,
      allowNull: true,
      comment: "Most recent push delivery attempt time",
    },
    pushLastError: {
      type: DataTypes.STRING,
      allowNull: true,
      comment: "Most recent push delivery error, if any",
    },
  },
  {
    tableName: "notifications",
    timestamps: true,
  }
);

module.exports = Notification;
