const { DataTypes } = require("sequelize");
const { sequelize } = require("../../dbConnection/dbConfig");

const PalmReport = sequelize.define(
  "PalmReport",
  {
    id: { type: DataTypes.UUID, defaultValue: DataTypes.UUIDV4, primaryKey: true },
    palmUploadId: { type: DataTypes.UUID, allowNull: false, unique: true },
    structuredInsights: { type: DataTypes.JSON, allowNull: false, defaultValue: {} },
    finalNarrative: { type: DataTypes.TEXT, allowNull: false },
    confidenceScores: { type: DataTypes.JSON, allowNull: true, defaultValue: {} },
  },
  { tableName: "palm_reports", timestamps: true }
);

module.exports = PalmReport;

