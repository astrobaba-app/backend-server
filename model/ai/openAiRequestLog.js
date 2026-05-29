const { DataTypes } = require("sequelize");
const { sequelize } = require("../../dbConnection/dbConfig");

const OpenAIRequestLog = sequelize.define(
  "OpenAIRequestLog",
  {
    id: {
      type: DataTypes.UUID,
      defaultValue: DataTypes.UUIDV4,
      primaryKey: true,
    },
    userId: {
      type: DataTypes.UUID,
      allowNull: true,
      comment: "User id associated with this OpenAI request",
    },
    developerName: {
      type: DataTypes.STRING(120),
      allowNull: true,
      comment: "Developer identity (from DEVELOPER_NAME/DEV_NAME)",
    },
    developerSecretHash: {
      type: DataTypes.STRING(128),
      allowNull: true,
      comment: "SHA-256 hash of developer secret (if provided)",
    },
    machineName: {
      type: DataTypes.STRING(255),
      allowNull: true,
      comment: "Hostname of the machine running the backend",
    },
    environment: {
      type: DataTypes.STRING(60),
      allowNull: true,
      comment: "Environment label (NODE_ENV/APP_ENV)",
    },
    serviceName: {
      type: DataTypes.STRING(120),
      allowNull: true,
      comment: "Backend service name handling the request",
    },
    gitBranch: {
      type: DataTypes.STRING(120),
      allowNull: true,
    },
    gitCommit: {
      type: DataTypes.STRING(64),
      allowNull: true,
    },
    gitEmail: {
      type: DataTypes.STRING(180),
      allowNull: true,
    },
    appEndpoint: {
      type: DataTypes.STRING(255),
      allowNull: true,
      comment: "Incoming API route that triggered the OpenAI call",
    },
    appMethod: {
      type: DataTypes.STRING(12),
      allowNull: true,
    },
    ipAddress: {
      type: DataTypes.STRING(64),
      allowNull: true,
    },
    openaiEndpoint: {
      type: DataTypes.STRING(120),
      allowNull: true,
    },
    openaiRequestId: {
      type: DataTypes.STRING(120),
      allowNull: true,
    },
    requestType: {
      type: DataTypes.STRING(120),
      allowNull: true,
      comment: "Operation name such as chat.completions.create",
    },
    model: {
      type: DataTypes.STRING(120),
      allowNull: true,
    },
    promptTokens: {
      type: DataTypes.INTEGER,
      allowNull: true,
    },
    completionTokens: {
      type: DataTypes.INTEGER,
      allowNull: true,
    },
    totalTokens: {
      type: DataTypes.INTEGER,
      allowNull: true,
    },
    durationMs: {
      type: DataTypes.INTEGER,
      allowNull: true,
    },
    status: {
      type: DataTypes.ENUM("success", "error"),
      allowNull: false,
      defaultValue: "success",
    },
    errorType: {
      type: DataTypes.STRING(120),
      allowNull: true,
    },
    errorMessage: {
      type: DataTypes.STRING(500),
      allowNull: true,
    },
    feature: {
      type: DataTypes.STRING(120),
      allowNull: true,
      comment: "Business feature that initiated the OpenAI request",
    },
  },
  {
    tableName: "openai_request_logs",
    timestamps: true,
    indexes: [
      { fields: ["createdAt"] },
      { fields: ["userId"] },
      { fields: ["developerName"] },
      { fields: ["model"] },
      { fields: ["openaiEndpoint"] },
      { fields: ["status"] },
    ],
  }
);

module.exports = OpenAIRequestLog;
