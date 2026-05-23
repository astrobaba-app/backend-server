const { DataTypes } = require("sequelize");
const { sequelize } = require("../../dbConnection/dbConfig");

const DailyInsightPayload = sequelize.define(
  "DailyInsightPayload",
  {
    id: {
      type: DataTypes.UUID,
      defaultValue: DataTypes.UUIDV4,
      primaryKey: true,
    },
    userId: {
      type: DataTypes.UUID,
      allowNull: false,
    },
    userRequestId: {
      type: DataTypes.UUID,
      allowNull: false,
      references: {
        model: "user_requests",
        key: "id",
      },
      onUpdate: "CASCADE",
      onDelete: "CASCADE",
    },
    insightDate: {
      type: DataTypes.DATEONLY,
      allowNull: false,
    },
    mainTheme: {
      type: DataTypes.STRING,
      allowNull: true,
    },
    topBuckets: {
      type: DataTypes.JSON,
      allowNull: true,
    },
    dashaContext: {
      type: DataTypes.JSON,
      allowNull: true,
    },
    transitContext: {
      type: DataTypes.JSON,
      allowNull: true,
    },
    recommendedActions: {
      type: DataTypes.JSON,
      allowNull: true,
    },
    remedies: {
      type: DataTypes.JSON,
      allowNull: true,
    },
    llmPayload: {
      type: DataTypes.JSON,
      allowNull: true,
    },
    generatedText: {
      type: DataTypes.TEXT,
      allowNull: true,
    },
    confidenceScore: {
      type: DataTypes.FLOAT,
      allowNull: true,
    },
  },
  {
    tableName: "daily_insight_payloads",
    timestamps: true,
    indexes: [
      {
        unique: true,
        fields: ["userId", "userRequestId", "insightDate"],
      },
    ],
  }
);

module.exports = DailyInsightPayload;
