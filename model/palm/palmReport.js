const { DataTypes } = require("sequelize");
const { sequelize } = require("../../dbConnection/dbConfig");

const PalmReport = sequelize.define(
  "PalmReport",
  {
    id: { type: DataTypes.UUID, defaultValue: DataTypes.UUIDV4, primaryKey: true },
    palmUploadId: { type: DataTypes.UUID, allowNull: false, unique: true },
    userRequestId: { type: DataTypes.UUID, allowNull: true },
    structuredInsights: { type: DataTypes.JSON, allowNull: false, defaultValue: {} },
    finalNarrative: { type: DataTypes.TEXT, allowNull: false },
    confidenceScores: { type: DataTypes.JSON, allowNull: true, defaultValue: {} },
    reportData: { type: DataTypes.JSON, allowNull: true, defaultValue: {} },
    pdfUrl: { type: DataTypes.TEXT, allowNull: true },
    pdfPublicId: { type: DataTypes.STRING, allowNull: true },
    pdfFileName: { type: DataTypes.STRING, allowNull: true },
    pdfUploadedAt: { type: DataTypes.DATE, allowNull: true },
  },
  { tableName: "palm_reports", timestamps: true }
);

module.exports = PalmReport;

