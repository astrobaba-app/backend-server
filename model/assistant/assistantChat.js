const { DataTypes } = require("sequelize");
const { sequelize } = require("../../dbConnection/dbConfig");

const AssistantChat = sequelize.define(
  "AssistantChat",
  {
    id: {
      type: DataTypes.UUID,
      defaultValue: DataTypes.UUIDV4,
      primaryKey: true,
    },
    sessionId: {
      type: DataTypes.UUID,
      allowNull: false,
      comment: "Session ID to group conversation",
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
    role: {
      type: DataTypes.ENUM("user", "assistant"),
      allowNull: false,
    },
    message: {
      type: DataTypes.TEXT,
      allowNull: false,
    },
    contextUsed: {
      type: DataTypes.JSONB,
      defaultValue: {},
      comment: "What context was used: profile, blogs, reviews, etc.",
    },
    tokensUsed: {
      type: DataTypes.INTEGER,
      defaultValue: 0,
    },
  },
  {
    tableName: "assistant_chats",
    timestamps: true,
    indexes: [
      {
        fields: ["sessionId"],
      },
      {
        fields: ["userId"],
      },
      {
        fields: ["astrologerId"],
      },
      {
        fields: ["createdAt"],
      },
    ],
  }
);

module.exports = AssistantChat;
