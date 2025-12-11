const { DataTypes } = require("sequelize");
const { sequelize } = require("../../dbConnection/dbConfig");

const AIChatMessage = sequelize.define(
  "AIChatMessage",
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
        model: "ai_chat_sessions",
        key: "id",
      },
      onDelete: "CASCADE",
      onUpdate: "CASCADE",
    },
    role: {
      type: DataTypes.ENUM("user", "assistant", "system"),
      allowNull: false,
      comment: "Who sent this message: user, AI assistant, or system",
    },
    content: {
      type: DataTypes.TEXT,
      allowNull: false,
      comment: "Message content",
    },
    tokens: {
      type: DataTypes.INTEGER,
      allowNull: true,
      comment: "Number of tokens used for this message",
    },
  },
  {
    tableName: "ai_chat_messages",
    timestamps: true,
    indexes: [
      {
        fields: ["sessionId"],
      },
      {
        fields: ["role"],
      },
      {
        fields: ["createdAt"],
      },
    ],
  }
);

module.exports = AIChatMessage;
