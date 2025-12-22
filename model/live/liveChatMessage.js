const { DataTypes } = require("sequelize");
const { sequelize } = require("../../dbConnection/dbConfig");

const LiveChatMessage = sequelize.define(
  "LiveChatMessage",
  {
    id: {
      type: DataTypes.UUID,
      defaultValue: DataTypes.UUIDV4,
      primaryKey: true,
    },
    liveSessionId: {
      type: DataTypes.UUID,
      allowNull: false,
      references: {
        model: "live_sessions",
        key: "id",
      },
      onDelete: "CASCADE",
      onUpdate: "CASCADE",
    },
    userId: {
      type: DataTypes.UUID,
      allowNull: false,
      comment: "User or Astrologer ID who sent the message",
    },
    userName: {
      type: DataTypes.STRING,
      allowNull: false,
      comment: "Display name of the sender",
    },
    userPhoto: {
      type: DataTypes.STRING,
      allowNull: true,
      comment: "Profile photo URL of the sender",
    },
    message: {
      type: DataTypes.TEXT,
      allowNull: false,
    },
    messageType: {
      type: DataTypes.ENUM("text", "emoji", "system"),
      defaultValue: "text",
    },
    timestamp: {
      type: DataTypes.DATE,
      defaultValue: DataTypes.NOW,
      allowNull: false,
    },
  },
  {
    tableName: "live_chat_messages",
    timestamps: true,
  }
);

module.exports = LiveChatMessage;
