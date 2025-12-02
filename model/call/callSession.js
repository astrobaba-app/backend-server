const { DataTypes } = require("sequelize");
const sequelize = require("../../config/database");

const CallSession = sequelize.define(
  "CallSession",
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
    callType: {
      type: DataTypes.ENUM("audio", "video"),
      allowNull: false,
    },
    status: {
      type: DataTypes.ENUM("initiated", "ringing", "accepted", "ongoing", "completed", "rejected", "missed", "cancelled"),
      defaultValue: "initiated",
    },
    initiatedBy: {
      type: DataTypes.ENUM("user", "astrologer"),
      allowNull: false,
    },
    startTime: {
      type: DataTypes.DATE,
      allowNull: true,
    },
    endTime: {
      type: DataTypes.DATE,
      allowNull: true,
    },
    totalMinutes: {
      type: DataTypes.INTEGER,
      defaultValue: 0,
      comment: "Total call duration in minutes",
    },
    totalCost: {
      type: DataTypes.DECIMAL(10, 2),
      defaultValue: 0.0,
      comment: "Total cost for the call",
    },
    pricePerMinute: {
      type: DataTypes.DECIMAL(10, 2),
      allowNull: false,
      comment: "Price per minute at the time of call",
    },
    agoraChannelName: {
      type: DataTypes.STRING,
      allowNull: false,
      unique: true,
      comment: "Agora channel name for this call",
    },
    agoraUidUser: {
      type: DataTypes.INTEGER,
      allowNull: true,
      comment: "Agora UID for user",
    },
    agoraUidAstrologer: {
      type: DataTypes.INTEGER,
      allowNull: true,
      comment: "Agora UID for astrologer",
    },
    rejectionReason: {
      type: DataTypes.STRING,
      allowNull: true,
    },
    recordingEnabled: {
      type: DataTypes.BOOLEAN,
      defaultValue: false,
    },
    recordingUrl: {
      type: DataTypes.STRING,
      allowNull: true,
    },
  },
  {
    tableName: "call_sessions",
    timestamps: true,
    indexes: [
      {
        fields: ["userId", "status"],
      },
      {
        fields: ["astrologerId", "status"],
      },
      {
        fields: ["status", "startTime"],
      },
    ],
  }
);

module.exports = CallSession;
