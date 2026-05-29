const { DataTypes } = require("sequelize");
const { sequelize } = require("../../dbConnection/dbConfig");

const AIJob = sequelize.define(
  "AIJob",
  {
    id: { type: DataTypes.UUID, defaultValue: DataTypes.UUIDV4, primaryKey: true },
    userId: { type: DataTypes.UUID, allowNull: false },
    palmUploadId: { type: DataTypes.UUID, allowNull: false, unique: true },
    type: { type: DataTypes.STRING, allowNull: false, defaultValue: "palm_reading" },
    status: { type: DataTypes.ENUM("queued", "processing", "completed", "failed"), allowNull: false, defaultValue: "queued" },
    stage: { type: DataTypes.STRING, allowNull: false, defaultValue: "queued" },
    progress: { type: DataTypes.INTEGER, allowNull: false, defaultValue: 5 },
    stageMessage: { type: DataTypes.STRING, allowNull: true },
    error: { type: DataTypes.TEXT, allowNull: true },
    startedAt: { type: DataTypes.DATE, allowNull: true },
    completedAt: { type: DataTypes.DATE, allowNull: true },
  },
  { tableName: "ai_jobs", timestamps: true }
);

module.exports = AIJob;
