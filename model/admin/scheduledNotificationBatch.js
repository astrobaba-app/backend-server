const { DataTypes } = require("sequelize");
const { sequelize } = require("../../dbConnection/dbConfig");

const ScheduledNotificationBatch = sequelize.define(
  "ScheduledNotificationBatch",
  {
    id: {
      type: DataTypes.UUID,
      defaultValue: DataTypes.UUIDV4,
      primaryKey: true,
    },
    adminId: {
      type: DataTypes.UUID,
      allowNull: false,
    },
    adminName: {
      type: DataTypes.STRING,
      allowNull: true,
    },
    name: {
      type: DataTypes.STRING(160),
      allowNull: false,
    },
    planType: {
      type: DataTypes.ENUM("one_day", "seven_day", "thirty_day", "custom"),
      allowNull: false,
      defaultValue: "one_day",
    },
    scheduleMode: {
      type: DataTypes.ENUM("same_times", "custom_rows"),
      allowNull: false,
      defaultValue: "same_times",
    },
    timezone: {
      type: DataTypes.STRING(64),
      allowNull: false,
      defaultValue: "Asia/Kolkata",
    },
    startDate: {
      type: DataTypes.DATEONLY,
      allowNull: false,
    },
    endDate: {
      type: DataTypes.DATEONLY,
      allowNull: false,
    },
    times: {
      type: DataTypes.JSONB,
      allowNull: false,
      defaultValue: [],
    },
    sourceFileName: {
      type: DataTypes.STRING,
      allowNull: true,
    },
    totalItems: {
      type: DataTypes.INTEGER,
      allowNull: false,
      defaultValue: 0,
    },
    scheduledCount: {
      type: DataTypes.INTEGER,
      allowNull: false,
      defaultValue: 0,
    },
    sentCount: {
      type: DataTypes.INTEGER,
      allowNull: false,
      defaultValue: 0,
    },
    failedCount: {
      type: DataTypes.INTEGER,
      allowNull: false,
      defaultValue: 0,
    },
    cancelledCount: {
      type: DataTypes.INTEGER,
      allowNull: false,
      defaultValue: 0,
    },
    status: {
      type: DataTypes.ENUM("active", "completed", "cancelled", "deleted"),
      allowNull: false,
      defaultValue: "active",
    },
    cancelledAt: {
      type: DataTypes.DATE,
      allowNull: true,
    },
    deletedAt: {
      type: DataTypes.DATE,
      allowNull: true,
    },
  },
  {
    tableName: "scheduled_notification_batches",
    timestamps: true,
    indexes: [
      { fields: ["adminId"] },
      { fields: ["status"] },
      { fields: ["startDate", "endDate"] },
    ],
  }
);

module.exports = ScheduledNotificationBatch;
