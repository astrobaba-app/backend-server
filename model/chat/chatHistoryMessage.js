const { DataTypes } = require("sequelize");
const { sequelize } = require("../../dbConnection/dbConfig");

const ChatHistoryMessage = sequelize.define(
  "ChatHistoryMessage",
  {
    id: {
      type: DataTypes.UUID,
      defaultValue: DataTypes.UUIDV4,
      primaryKey: true,
    },
    historySessionId: {
      type: DataTypes.UUID,
      allowNull: false,
      references: {
        model: "chat_history_sessions",
        key: "id",
      },
      onDelete: "CASCADE",
      onUpdate: "CASCADE",
      field: "history_session_id",
    },
    senderId: {
      type: DataTypes.UUID,
      allowNull: false,
    },
    senderType: {
      type: DataTypes.ENUM("user", "astrologer"),
      allowNull: false,
    },
    message: {
      type: DataTypes.TEXT,
      allowNull: true,
    },
    messageType: {
      type: DataTypes.ENUM("text", "image", "file"),
      allowNull: false,
      defaultValue: "text",
    },
    fileUrl: {
      type: DataTypes.STRING,
      allowNull: true,
      field: "file_url",
    },
    isDeleted: {
      type: DataTypes.BOOLEAN,
      allowNull: false,
      defaultValue: false,
      field: "is_deleted",
    },
    replyToMessageId: {
      type: DataTypes.UUID,
      allowNull: true,
      field: "reply_to_message_id",
    },
    originalMessageId: {
      type: DataTypes.UUID,
      allowNull: true,
      field: "original_message_id",
    },
    originalCreatedAt: {
      type: DataTypes.DATE,
      allowNull: false,
      field: "original_created_at",
    },
  },
  {
    tableName: "chat_history_messages",
    timestamps: true,
    indexes: [
      { fields: ["history_session_id"] },
      { fields: ["original_created_at"] },
    ],
  }
);

module.exports = ChatHistoryMessage;