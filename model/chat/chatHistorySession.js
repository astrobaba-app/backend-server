const { DataTypes } = require("sequelize");
const { sequelize } = require("../../dbConnection/dbConfig");

const ChatHistorySession = sequelize.define(
  "ChatHistorySession",
  {
    id: {
      type: DataTypes.UUID,
      defaultValue: DataTypes.UUIDV4,
      primaryKey: true,
    },
    sourceSessionId: {
      type: DataTypes.UUID,
      allowNull: false,
      unique: true,
      field: "source_session_id",
      comment: "Original live chat session ID that was archived",
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
      type: DataTypes.ENUM("completed", "cancelled"),
      allowNull: false,
      defaultValue: "completed",
    },
    requestStatus: {
      type: DataTypes.ENUM("pending", "approved", "rejected"),
      allowNull: false,
      defaultValue: "approved",
      field: "request_status",
    },
    startTime: {
      type: DataTypes.DATE,
      allowNull: false,
      field: "start_time",
    },
    endTime: {
      type: DataTypes.DATE,
      allowNull: true,
      field: "end_time",
    },
    totalMinutes: {
      type: DataTypes.INTEGER,
      allowNull: false,
      defaultValue: 0,
      field: "total_minutes",
    },
    totalCost: {
      type: DataTypes.DECIMAL(10, 2),
      allowNull: false,
      defaultValue: 0,
      field: "total_cost",
    },
    billedAmount: {
      type: DataTypes.DECIMAL(10, 2),
      allowNull: false,
      defaultValue: 0,
      field: "billed_amount",
    },
    pricePerMinute: {
      type: DataTypes.DECIMAL(10, 2),
      allowNull: false,
      field: "price_per_minute",
    },
    endReason: {
      type: DataTypes.STRING,
      allowNull: true,
      field: "end_reason",
    },
    lastMessagePreview: {
      type: DataTypes.STRING,
      allowNull: true,
      field: "last_message_preview",
    },
    lastMessageAt: {
      type: DataTypes.DATE,
      allowNull: true,
      field: "last_message_at",
    },
  },
  {
    tableName: "chat_history_sessions",
    timestamps: true,
    indexes: [
      { fields: ["userId"] },
      { fields: ["astrologerId"] },
      { fields: ["userId", "astrologerId"] },
      { fields: ["end_time"] },
      { unique: true, fields: ["source_session_id"] },
    ],
  }
);

module.exports = ChatHistorySession;