const { DataTypes } = require("sequelize");
const { sequelize } = require("../../dbConnection/dbConfig");

const MatchingProfile = sequelize.define(
  "MatchingProfile",
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
      onUpdate: "CASCADE",
      onDelete: "CASCADE",
    },
    // Boy's details
    boyName: {
      type: DataTypes.STRING,
      allowNull: false,
    },
    boyDateOfBirth: {
      type: DataTypes.DATEONLY,
      allowNull: false,
    },
    boyTimeOfBirth: {
      type: DataTypes.STRING,
      allowNull: false,
      comment: "Format: HH:MM",
    },
    boyPlaceOfBirth: {
      type: DataTypes.STRING,
      allowNull: false,
    },
    boyLatitude: {
      type: DataTypes.FLOAT,
      allowNull: false,
    },
    boyLongitude: {
      type: DataTypes.FLOAT,
      allowNull: false,
    },
    // Girl's details
    girlName: {
      type: DataTypes.STRING,
      allowNull: false,
    },
    girlDateOfBirth: {
      type: DataTypes.DATEONLY,
      allowNull: false,
    },
    girlTimeOfBirth: {
      type: DataTypes.STRING,
      allowNull: false,
      comment: "Format: HH:MM",
    },
    girlPlaceOfBirth: {
      type: DataTypes.STRING,
      allowNull: false,
    },
    girlLatitude: {
      type: DataTypes.FLOAT,
      allowNull: false,
    },
    girlLongitude: {
      type: DataTypes.FLOAT,
      allowNull: false,
    },
    // Matching results
    compatibilityScore: {
      type: DataTypes.FLOAT,
      allowNull: true,
      comment: "Overall compatibility percentage (0-100)",
    },
    ashtakootDetails: {
      type: DataTypes.JSON,
      allowNull: true,
      comment: "Ashtakoot 36-point matching details",
    },
    dashakootDetails: {
      type: DataTypes.JSON,
      allowNull: true,
      comment: "Dashakoot 10-point matching details",
    },
    manglikDetails: {
      type: DataTypes.JSON,
      allowNull: true,
      comment: "Manglik dosha analysis for both",
    },
    conclusion: {
      type: DataTypes.TEXT,
      allowNull: true,
      comment: "Overall matching conclusion",
    },
  },
  {
    tableName: "matching_profiles",
    timestamps: true,
  }
);

module.exports = MatchingProfile;
