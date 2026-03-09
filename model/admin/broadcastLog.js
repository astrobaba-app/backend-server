const { DataTypes } = require("sequelize");
const { sequelize } = require("../../dbConnection/dbConfig");

const BroadcastLog = sequelize.define(
  "BroadcastLog",
  {
    id: {
      type: DataTypes.UUID,
      defaultValue: DataTypes.UUIDV4,
      primaryKey: true,
    },
    adminId: {
      type: DataTypes.UUID,
      allowNull: false,
      comment: "ID of the admin who sent this broadcast",
    },
    adminName: {
      type: DataTypes.STRING,
      allowNull: true,
      comment: "Snapshot of admin name at time of sending",
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
    totalUsers: {
      type: DataTypes.INTEGER,
      allowNull: false,
      defaultValue: 0,
      comment: "Number of in-app notification records created",
    },
    pushSuccessCount: {
      type: DataTypes.INTEGER,
      allowNull: false,
      defaultValue: 0,
      comment: "FCM push notifications delivered successfully",
    },
    pushFailureCount: {
      type: DataTypes.INTEGER,
      allowNull: false,
      defaultValue: 0,
      comment: "FCM push notifications that failed",
    },
  },
  {
    tableName: "broadcast_logs",
    timestamps: true,
    indexes: [{ fields: ["adminId"] }, { fields: ["createdAt"] }],
  }
);

module.exports = BroadcastLog;
