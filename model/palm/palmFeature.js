const { DataTypes } = require("sequelize");
const { sequelize } = require("../../dbConnection/dbConfig");

const PalmFeature = sequelize.define(
  "PalmFeature",
  {
    id: { type: DataTypes.UUID, defaultValue: DataTypes.UUIDV4, primaryKey: true },
    palmUploadId: { type: DataTypes.UUID, allowNull: false, unique: true },
    features: { type: DataTypes.JSON, allowNull: false, defaultValue: {} },
    confidenceScores: { type: DataTypes.JSON, allowNull: true, defaultValue: {} },
  },
  { tableName: "palm_features", timestamps: true }
);

module.exports = PalmFeature;

