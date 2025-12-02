const { DataTypes } = require("sequelize");
const { sequelize } = require("../../dbConnection/dbConfig");

const LiveParticipant = sequelize.define(
  "LiveParticipant",
  {
    id: {
      type: DataTypes.UUID,
      defaultValue: DataTypes.UUIDV4,
      primaryKey: true,
    },
    liveSessionId: {
      type: DataTypes.UUID,
      allowNull: false,
      references: {
        model: "live_sessions",
        key: "id",
      },
      onDelete: "CASCADE",
      onUpdate: "CASCADE",
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
    joinedAt: {
      type: DataTypes.DATE,
      allowNull: false,
      defaultValue: DataTypes.NOW,
    },
    leftAt: {
      type: DataTypes.DATE,
      allowNull: true,
    },
    totalMinutes: {
      type: DataTypes.INTEGER,
      defaultValue: 0,
      comment: "Total minutes participated in this session",
    },
    totalCost: {
      type: DataTypes.DECIMAL(10, 2),
      defaultValue: 0.0,
      comment: "Total amount charged for participation",
    },
    isActive: {
      type: DataTypes.BOOLEAN,
      defaultValue: true,
      comment: "Currently in the live session",
    },
    agoraUid: {
      type: DataTypes.INTEGER,
      allowNull: true,
      comment: "Agora user ID for this participant",
    },
  },
  {
    tableName: "live_participants",
    timestamps: true,
  }
);

module.exports = LiveParticipant;
