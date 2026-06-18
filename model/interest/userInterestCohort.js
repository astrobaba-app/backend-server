const { DataTypes } = require("sequelize");
const { sequelize } = require("../../dbConnection/dbConfig");
const InterestIntentResult = require("./interestIntentResult");

const UserInterestCohort = sequelize.define(
  "UserInterestCohort",
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
    scoreAtAssignment: {
      type: DataTypes.INTEGER,
      allowNull: false,
      defaultValue: 0,
    },
    isActive: {
      type: DataTypes.BOOLEAN,
      allowNull: false,
      defaultValue: true,
    },
    assignedAt: {
      type: DataTypes.DATE,
      allowNull: false,
      defaultValue: DataTypes.NOW,
    },
    lastQualifiedAt: {
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
    tableName: "user_interest_cohorts",
    timestamps: true,
    indexes: [
      {
        name: "user_interest_cohorts_user_type_category_unique",
        unique: true,
        fields: ["userId", "cohortType", "category"],
      },
      {
        name: "user_interest_cohorts_type_category_active",
        fields: ["cohortType", "category", "isActive"],
      },
    ],
  }
);

module.exports = UserInterestCohort;
