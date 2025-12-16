const { DataTypes } = require("sequelize");
const { sequelize } = require("../../dbConnection/dbConfig");

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
    // Optional reply-to reference for threaded replies within a chat session
    replyToMessageId: {
      type: DataTypes.UUID,
      allowNull: true,
      references: {
        model: "chat_messages",
        key: "id",
      },
      onDelete: "SET NULL",
      onUpdate: "CASCADE",
      field: "reply_to_message_id",
      comment: "If set, this message is a reply to another message in the same session",
    },
    // Soft-delete flag for messages (content can be hidden but record kept for audit/order)
    isDeleted: {
      type: DataTypes.BOOLEAN,
      allowNull: false,
      defaultValue: false,
      field: "is_deleted",
    },
    deletedAt: {
      type: DataTypes.DATE,
      allowNull: true,
      field: "deleted_at",
    },
  },
  {
    tableName: "chat_messages",
    timestamps: true,
  }
);

module.exports = ChatMessage;
