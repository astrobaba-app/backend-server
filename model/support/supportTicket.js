const { DataTypes } = require("sequelize");
const sequelize = require("../../config/database");

const SupportTicket = sequelize.define(
  "SupportTicket",
  {
    id: {
      type: DataTypes.UUID,
      defaultValue: DataTypes.UUIDV4,
      primaryKey: true,
    },
    ticketNumber: {
      type: DataTypes.STRING(20),
      unique: true,
      allowNull: false,
      comment: "Auto-generated ticket number (e.g., TKT-2025-001234)",
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
    subject: {
      type: DataTypes.STRING(200),
      allowNull: false,
    },
    description: {
      type: DataTypes.TEXT,
      allowNull: false,
    },
    images: {
      type: DataTypes.ARRAY(DataTypes.TEXT),
      defaultValue: [],
      comment: "Array of image URLs",
    },
    status: {
      type: DataTypes.ENUM("open", "in_progress", "resolved", "closed"),
      defaultValue: "open",
    },
    priority: {
      type: DataTypes.ENUM("low", "medium", "high", "urgent"),
      defaultValue: "medium",
    },
    category: {
      type: DataTypes.ENUM(
        "technical",
        "billing",
        "account",
        "consultation",
        "general",
        "other"
      ),
      defaultValue: "general",
    },
    adminId: {
      type: DataTypes.UUID,
      allowNull: true,
      references: {
        model: "admins",
        key: "id",
      },
      comment: "Admin who is handling this ticket",
    },
    lastRepliedAt: {
      type: DataTypes.DATE,
      allowNull: true,
    },
    resolvedAt: {
      type: DataTypes.DATE,
      allowNull: true,
    },
  },
  {
    tableName: "support_tickets",
    timestamps: true,
    indexes: [
      {
        fields: ["ticketNumber"],
        unique: true,
      },
      {
        fields: ["userId"],
      },
      {
        fields: ["status"],
      },
      {
        fields: ["priority"],
      },
      {
        fields: ["adminId"],
      },
      {
        fields: ["createdAt"],
      },
    ],
  }
);

module.exports = SupportTicket;
