const { DataTypes } = require("sequelize");
const { sequelize } = require("../../dbConnection/dbConfig");
const InterestIntentResult = require("./interestIntentResult");

const UserInterestScore = sequelize.define(
  "UserInterestScore",
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
    cohortType: {
      type: DataTypes.ENUM("interest", "wallet", "astro", "activity"),
      allowNull: false,
      defaultValue: "interest",
    },
    category: {
      type: DataTypes.STRING(64),
      allowNull: false,
    },
    score: {
      type: DataTypes.INTEGER,
      allowNull: false,
      defaultValue: 0,
    },
    lastIntentResultId: {
      type: DataTypes.UUID,
      allowNull: true,
      references: {
        model: "interest_intent_results",
        key: "id",
      },
      onDelete: "SET NULL",
      onUpdate: "CASCADE",
    },
    lastUpdatedAt: {
      type: DataTypes.DATE,
      allowNull: false,
      defaultValue: DataTypes.NOW,
    },
    metadata: {
      type: DataTypes.JSONB,
      allowNull: true,
    },
  },
  {
    tableName: "user_interest_scores",
    timestamps: true,
    indexes: [
      {
        name: "user_interest_scores_user_type_category_unique",
        unique: true,
        fields: ["userId", "cohortType", "category"],
      },
      {
        name: "user_interest_scores_type_category_score",
        fields: ["cohortType", "category", "score"],
      },
    ],
  }
);

module.exports = UserInterestScore;
