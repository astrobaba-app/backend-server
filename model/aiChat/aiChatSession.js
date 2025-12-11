const { DataTypes } = require("sequelize");
const { sequelize } = require("../../dbConnection/dbConfig");

const AIChatSession = sequelize.define(
  "AIChatSession",
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
    title: {
      type: DataTypes.STRING(200),
      allowNull: true,
      comment: "Auto-generated title from first message",
    },
    isActive: {
      type: DataTypes.BOOLEAN,
      defaultValue: true,
      comment: "Whether this chat session is active",
    },
    lastMessageAt: {
      type: DataTypes.DATE,
      allowNull: true,
      comment: "Timestamp of last message in this session",
    },
  },
  {
    tableName: "ai_chat_sessions",
    timestamps: true,
    indexes: [
      {
        fields: ["userId"],
      },
      {
        fields: ["isActive"],
      },
      {
        fields: ["lastMessageAt"],
      },
    ],
  }
);

module.exports = AIChatSession;
