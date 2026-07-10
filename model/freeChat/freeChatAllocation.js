const { DataTypes } = require("sequelize");
const { sequelize } = require("../../dbConnection/dbConfig");

const FreeChatAllocation = sequelize.define(
  "FreeChatAllocation",
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
      grantedByAdminId: {
        type: DataTypes.UUID,
        allowNull: true,
        references: {
          model: "admins",
          key: "id",
        },
      onDelete: "RESTRICT",
      onUpdate: "CASCADE",
    },
    minutes: {
      type: DataTypes.INTEGER,
      allowNull: false,
      validate: {
        min: 1,
      },
    },
    applicableChatType: {
      type: DataTypes.STRING(20),
      allowNull: false,
      defaultValue: "both",
      comment: "ai, real, or both",
    },
    status: {
      type: DataTypes.STRING(20),
      allowNull: false,
      defaultValue: "active",
      comment: "active, consumed, revoked",
    },
    targetMode: {
      type: DataTypes.STRING(20),
      allowNull: false,
      defaultValue: "single",
      comment: "single, selected, all, filter",
    },
    campaignName: {
      type: DataTypes.STRING(120),
      allowNull: true,
    },
    reason: {
      type: DataTypes.STRING(255),
      allowNull: true,
    },
    expiresAt: {
      type: DataTypes.DATE,
      allowNull: true,
    },
    consumedAt: {
      type: DataTypes.DATE,
      allowNull: true,
    },
    consumedSessionId: {
      type: DataTypes.UUID,
      allowNull: true,
      comment: "Chat or AI chat session that consumed this allocation",
    },
    consumedSessionKind: {
      type: DataTypes.STRING(30),
      allowNull: true,
      comment: "human_chat or ai_chat",
    },
    consumedChatType: {
      type: DataTypes.STRING(20),
      allowNull: true,
      comment: "ai or real",
    },
    revokedAt: {
      type: DataTypes.DATE,
      allowNull: true,
    },
    revokedByAdminId: {
      type: DataTypes.UUID,
      allowNull: true,
      references: {
        model: "admins",
        key: "id",
      },
      onDelete: "SET NULL",
      onUpdate: "CASCADE",
    },
    metadata: {
      type: DataTypes.JSONB,
      allowNull: true,
      defaultValue: {},
    },
  },
  {
    tableName: "free_chat_allocations",
    timestamps: true,
    indexes: [
      { fields: ["userId"] },
      { fields: ["status"] },
      { fields: ["applicableChatType"] },
      { fields: ["createdAt"] },
      { fields: ["expiresAt"] },
    ],
  }
);

module.exports = FreeChatAllocation;
