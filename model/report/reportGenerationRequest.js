const { DataTypes } = require("sequelize");
const { sequelize } = require("../../dbConnection/dbConfig");

const ReportGenerationRequest = sequelize.define(
  "ReportGenerationRequest",
  {
    id: {
      type: DataTypes.UUID,
      defaultValue: DataTypes.UUIDV4,
      primaryKey: true,
    },
    userId: {
      type: DataTypes.UUID,
      allowNull: false,
      references: { model: "users", key: "id" },
      onUpdate: "CASCADE",
      onDelete: "CASCADE",
    },
    userRequestId: {
      type: DataTypes.UUID,
      allowNull: true,
      references: { model: "user_requests", key: "id" },
      onUpdate: "CASCADE",
      onDelete: "SET NULL",
    },
    kundliId: {
      type: DataTypes.UUID,
      allowNull: true,
      references: { model: "kundlis", key: "id" },
      onUpdate: "CASCADE",
      onDelete: "SET NULL",
    },
    reportType: {
      type: DataTypes.STRING,
      allowNull: false,
    },
    sourceType: {
      type: DataTypes.STRING,
      allowNull: true,
    },
    sourceId: {
      type: DataTypes.UUID,
      allowNull: true,
    },
    status: {
      type: DataTypes.STRING,
      allowNull: false,
      defaultValue: "queued",
    },
    price: {
      type: DataTypes.DECIMAL(10, 2),
      allowNull: false,
      defaultValue: 0,
    },
    currency: {
      type: DataTypes.STRING(8),
      allowNull: false,
      defaultValue: "INR",
    },
    inputTokens: {
      type: DataTypes.INTEGER,
      allowNull: false,
      defaultValue: 0,
    },
    outputTokens: {
      type: DataTypes.INTEGER,
      allowNull: false,
      defaultValue: 0,
    },
    totalTokens: {
      type: DataTypes.INTEGER,
      allowNull: false,
      defaultValue: 0,
    },
    tokenUsage: {
      type: DataTypes.JSON,
      allowNull: true,
      defaultValue: {},
    },
    requestPayload: {
      type: DataTypes.JSON,
      allowNull: true,
      defaultValue: {},
    },
    llmResponse: {
      type: DataTypes.JSON,
      allowNull: true,
      defaultValue: {},
    },
    reportData: {
      type: DataTypes.JSON,
      allowNull: true,
      defaultValue: {},
    },
    pdfUrl: {
      type: DataTypes.TEXT,
      allowNull: true,
    },
    pdfPublicId: {
      type: DataTypes.STRING,
      allowNull: true,
    },
    pdfFileName: {
      type: DataTypes.STRING,
      allowNull: true,
    },
    pdfUploadedAt: {
      type: DataTypes.DATE,
      allowNull: true,
    },
    error: {
      type: DataTypes.TEXT,
      allowNull: true,
    },
    startedAt: {
      type: DataTypes.DATE,
      allowNull: true,
    },
    completedAt: {
      type: DataTypes.DATE,
      allowNull: true,
    },
    metadata: {
      type: DataTypes.JSON,
      allowNull: true,
      defaultValue: {},
    },
  },
  {
    tableName: "report_generation_requests",
    timestamps: true,
    indexes: [
      { fields: ["userId"] },
      { fields: ["userRequestId"] },
      { fields: ["kundliId"] },
      { fields: ["reportType"] },
      { fields: ["status"] },
      { fields: ["sourceType", "sourceId"] },
    ],
  }
);

module.exports = ReportGenerationRequest;
