const { DataTypes } = require("sequelize");
const sequelize = require("../../config/database");

const ChatMessage = sequelize.define(
  "ChatMessage",
  {
    id: {
      type: DataTypes.UUID,
      defaultValue: DataTypes.UUIDV4,
      primaryKey: true,
    },
    sessionId: {
      type: DataTypes.UUID,
      allowNull: false,
      references: {
        model: "chat_sessions",
        key: "id",
      },
      onDelete: "CASCADE",
      onUpdate: "CASCADE",
    },
    senderId: {
      type: DataTypes.UUID,
      allowNull: false,
      comment: "ID of user or astrologer who sent the message",
    },
    senderType: {
      type: DataTypes.ENUM("user", "astrologer"),
      allowNull: false,
    },
    message: {
      type: DataTypes.TEXT,
      allowNull: false,
    },
    messageType: {
      type: DataTypes.ENUM("text", "image", "file"),
      defaultValue: "text",
    },
    fileUrl: {
      type: DataTypes.STRING,
      allowNull: true,
      comment: "URL for image or file messages",
    },
    isRead: {
      type: DataTypes.BOOLEAN,
      defaultValue: false,
    },
    readAt: {
      type: DataTypes.DATE,
      allowNull: true,
    },
  },
  {
    tableName: "chat_messages",
    timestamps: true,
  }
);

module.exports = ChatMessage;
