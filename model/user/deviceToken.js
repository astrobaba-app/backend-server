const { DataTypes } = require("sequelize");
const { sequelize } = require("../../dbConnection/dbConfig");

const DeviceToken = sequelize.define(
  "DeviceToken",
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
    token: {
      type: DataTypes.TEXT,
      allowNull: false,
      unique: true,
    },
    deviceType: {
      type: DataTypes.ENUM("ios", "android", "web"),
      allowNull: false,
      defaultValue: "android",
    },
    deviceId: {
      type: DataTypes.STRING,
      allowNull: true,
    },
    isActive: {
      type: DataTypes.BOOLEAN,
      defaultValue: true,
    },
    lastUsedAt: {
      type: DataTypes.DATE,
      defaultValue: DataTypes.NOW,
    },
  },
  {
    tableName: "device_tokens",
    timestamps: true,
    indexes: [
      {
        unique: false,
        fields: ["userId"],
      },
      {
        unique: true,
        fields: ["token"],
      },
      {
        fields: ["isActive"],
      },
    ],
  }
);

module.exports = DeviceToken;
