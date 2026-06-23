const { DataTypes } = require("sequelize");
const { sequelize } = require("../../dbConnection/dbConfig");

const AstrologerDeviceToken = sequelize.define(
  "AstrologerDeviceToken",
  {
    id: {
      type: DataTypes.UUID,
      defaultValue: DataTypes.UUIDV4,
      primaryKey: true,
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
    deviceName: {
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
    tableName: "astrologer_device_tokens",
    timestamps: true,
    indexes: [
      {
        unique: false,
        fields: ["astrologerId"],
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

module.exports = AstrologerDeviceToken;
