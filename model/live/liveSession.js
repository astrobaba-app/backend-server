const { DataTypes } = require("sequelize");
const { sequelize } = require("../../dbConnection/dbConfig");

const LiveSession = sequelize.define(
  "LiveSession",
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
    title: {
      type: DataTypes.STRING,
      allowNull: false,
      comment: "Live session title/topic",
    },
    description: {
      type: DataTypes.TEXT,
      allowNull: true,
    },
    thumbnail: {
      type: DataTypes.STRING,
      allowNull: true,
      comment: "Cover image for live session",
    },
    sessionType: {
      type: DataTypes.ENUM("live_stream", "one_on_one_call"),
      allowNull: false,
      comment: "live_stream: public live, one_on_one_call: private video call",
    },
    pricePerMinute: {
      type: DataTypes.DECIMAL(10, 2),
      allowNull: false,
      comment: "Price per minute for this live session",
    },
    status: {
      type: DataTypes.ENUM("scheduled", "live", "ended", "cancelled"),
      defaultValue: "scheduled",
    },
    scheduledAt: {
      type: DataTypes.DATE,
      allowNull: true,
      comment: "Scheduled start time (optional)",
    },
    startedAt: {
      type: DataTypes.DATE,
      allowNull: true,
    },
    endedAt: {
      type: DataTypes.DATE,
      allowNull: true,
    },
    agoraChannelName: {
      type: DataTypes.STRING,
      allowNull: false,
      unique: true,
      comment: "Agora channel name for this session",
    },
    agoraAppId: {
      type: DataTypes.STRING,
      allowNull: true,
      comment: "Agora App ID (from env but stored for reference)",
    },
    totalViewers: {
      type: DataTypes.INTEGER,
      defaultValue: 0,
      comment: "Total unique viewers who joined",
    },
    currentViewers: {
      type: DataTypes.INTEGER,
      defaultValue: 0,
      comment: "Current active viewers in live",
    },
    maxViewers: {
      type: DataTypes.INTEGER,
      defaultValue: 0,
      comment: "Peak concurrent viewers",
    },
    totalRevenue: {
      type: DataTypes.DECIMAL(10, 2),
      defaultValue: 0.0,
      comment: "Total earnings from this session",
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
    tableName: "live_sessions",
    timestamps: true,
  }
);

module.exports = LiveSession;
