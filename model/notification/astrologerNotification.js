const { DataTypes } = require("sequelize");
const { sequelize } = require("../../dbConnection/dbConfig");

const AstrologerNotification = sequelize.define(
  "AstrologerNotification",
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
    type: {
      type: DataTypes.STRING,
      allowNull: false,
      defaultValue: "admin_broadcast",
    },
    title: {
      type: DataTypes.STRING,
      allowNull: false,
    },
    message: {
      type: DataTypes.TEXT,
      allowNull: false,
    },
    data: {
      type: DataTypes.JSONB,
      allowNull: true,
    },
    isRead: {
      type: DataTypes.BOOLEAN,
      defaultValue: false,
    },
    readAt: {
      type: DataTypes.DATE,
      allowNull: true,
    },
    actionUrl: {
      type: DataTypes.STRING,
      allowNull: true,
    },
    priority: {
      type: DataTypes.ENUM("low", "medium", "high", "urgent"),
      defaultValue: "medium",
    },
    expiresAt: {
      type: DataTypes.DATE,
      allowNull: true,
    },
    pushDeliveredAt: {
      type: DataTypes.DATE,
      allowNull: true,
    },
    pushAttemptCount: {
      type: DataTypes.INTEGER,
      allowNull: false,
      defaultValue: 0,
    },
    pushLastAttemptAt: {
      type: DataTypes.DATE,
      allowNull: true,
    },
    pushLastError: {
      type: DataTypes.STRING,
      allowNull: true,
    },
  },
  {
    tableName: "astrologer_notifications",
    timestamps: true,
    indexes: [
      {
        fields: ["astrologerId"],
      },
      {
        fields: ["createdAt"],
      },
      {
        fields: ["isRead"],
      },
    ],
  }
);

module.exports = AstrologerNotification;
