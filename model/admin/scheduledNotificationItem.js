const { DataTypes } = require("sequelize");
const { sequelize } = require("../../dbConnection/dbConfig");

const ScheduledNotificationItem = sequelize.define(
  "ScheduledNotificationItem",
  {
    id: {
      type: DataTypes.UUID,
      defaultValue: DataTypes.UUIDV4,
      primaryKey: true,
    },
    batchId: {
      type: DataTypes.UUID,
      allowNull: false,
    },
    adminId: {
      type: DataTypes.UUID,
      allowNull: false,
    },
    title: {
      type: DataTypes.STRING(200),
      allowNull: false,
    },
    message: {
      type: DataTypes.TEXT,
      allowNull: false,
    },
    actionUrl: {
      type: DataTypes.STRING,
      allowNull: true,
    },
    scheduledAt: {
      type: DataTypes.DATE,
      allowNull: false,
    },
    status: {
      type: DataTypes.ENUM("scheduled", "processing", "sent", "failed", "cancelled"),
      allowNull: false,
      defaultValue: "scheduled",
    },
    rowNumber: {
      type: DataTypes.INTEGER,
      allowNull: true,
    },
    contentHash: {
      type: DataTypes.STRING(64),
      allowNull: false,
    },
    lockToken: {
      type: DataTypes.STRING(64),
      allowNull: true,
    },
    lockedAt: {
      type: DataTypes.DATE,
      allowNull: true,
    },
    sentAt: {
      type: DataTypes.DATE,
      allowNull: true,
    },
    broadcastLogId: {
      type: DataTypes.UUID,
      allowNull: true,
    },
    attemptCount: {
      type: DataTypes.INTEGER,
      allowNull: false,
      defaultValue: 0,
    },
    lastError: {
      type: DataTypes.TEXT,
      allowNull: true,
    },
  },
  {
    tableName: "scheduled_notification_items",
    timestamps: true,
    indexes: [
      { fields: ["batchId"] },
      { fields: ["status", "scheduledAt"] },
      { fields: ["scheduledAt"] },
      { fields: ["contentHash"] },
      {
        unique: true,
        fields: ["batchId", "contentHash", "scheduledAt"],
        name: "scheduled_notification_items_batch_hash_time_unique",
      },
    ],
  }
);

module.exports = ScheduledNotificationItem;
