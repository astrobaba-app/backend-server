const { DataTypes } = require("sequelize");
const { sequelize } = require("../../dbConnection/dbConfig");

const PalmUpload = sequelize.define(
  "PalmUpload",
  {
    id: { type: DataTypes.UUID, defaultValue: DataTypes.UUIDV4, primaryKey: true },
    userId: { type: DataTypes.UUID, allowNull: false },
    imageUrls: { type: DataTypes.JSON, allowNull: false, defaultValue: [] },
    imageHash: { type: DataTypes.STRING(64), allowNull: true },
    metadata: { type: DataTypes.JSON, allowNull: true, defaultValue: {} },
  },
  {
    tableName: "palm_uploads",
    timestamps: true,
  }
);

module.exports = PalmUpload;
