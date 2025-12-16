const { DataTypes } = require("sequelize");
const { sequelize } = require("../../dbConnection/dbConfig");

const ChatSession = sequelize.define(
  "ChatSession",
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
      onUpdate: "CASCADE",
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
    status: {
      type: DataTypes.ENUM("active", "completed", "cancelled"),
      defaultValue: "active",
    },
    startTime: {
      type: DataTypes.DATE,
      allowNull: false,
      defaultValue: DataTypes.NOW,
    },
    endTime: {
      type: DataTypes.DATE,
      allowNull: true,
    },
    totalMinutes: {
      type: DataTypes.INTEGER,
      defaultValue: 0,
      comment: "Total chat duration in minutes",
    },
    totalCost: {
      type: DataTypes.DECIMAL(10, 2),
      defaultValue: 0.0,
      comment: "Total cost for the chat session",
    },
    pricePerMinute: {
      type: DataTypes.DECIMAL(10, 2),
      allowNull: false,
      comment: "Price per minute at the time of session",
    },
    // Chat request / approval status for user-astrologer chat
    requestStatus: {
      type: DataTypes.ENUM("pending", "approved", "rejected"),
      allowNull: false,
      defaultValue: "pending",
      field: "request_status",
      comment:
        "Chat request status: pending (awaiting astrologer approval), approved (active chat), rejected (request declined)",
    },
    // Cached metadata for fast chat list rendering
    lastMessagePreview: {
      type: DataTypes.STRING,
      allowNull: true,
      field: "last_message_preview",
      comment: "Short preview of the last message in this chat session",
    },
    lastMessageAt: {
      type: DataTypes.DATE,
      allowNull: true,
      field: "last_message_at",
      comment: "Timestamp of the last message in this chat session",
    },
    // Unread counters per side (derived but cached for performance)
    userUnreadCount: {
      type: DataTypes.INTEGER,
      allowNull: false,
      defaultValue: 0,
      field: "user_unread_count",
      comment: "Unread messages for the user in this session",
    },
    astrologerUnreadCount: {
      type: DataTypes.INTEGER,
      allowNull: false,
      defaultValue: 0,
      field: "astrologer_unread_count",
      comment: "Unread messages for the astrologer in this session",
    },
  },
  {
    tableName: "chat_sessions",
    timestamps: true,
  }
);

module.exports = ChatSession;
