const { DataTypes } = require("sequelize");
const sequelize = require("../../config/database");

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
  },
  {
    tableName: "chat_sessions",
    timestamps: true,
  }
);

module.exports = ChatSession;
