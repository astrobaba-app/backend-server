const { DataTypes } = require("sequelize");
const { sequelize } = require("../../dbConnection/dbConfig");

const CompatibilityReport = sequelize.define(
  "CompatibilityReport",
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
    reportData: {
      type: DataTypes.JSON,
      allowNull: false,
      comment: "Cached AI-generated Compatibility Report predictions",
    },
    pdfUrl: {
      type: DataTypes.TEXT,
      allowNull: true,
      comment: "Cloudinary secure URL of generated Compatibility Report PDF",
    },
    pdfPublicId: {
      type: DataTypes.STRING,
      allowNull: true,
      comment: "Cloudinary public ID of generated Compatibility Report PDF",
    },
    pdfFileName: {
      type: DataTypes.STRING,
      allowNull: true,
      comment: "Original file name used while uploading PDF to Cloudinary",
    },
    pdfUploadedAt: {
      type: DataTypes.DATE,
      allowNull: true,
      comment: "Timestamp when PDF was uploaded to Cloudinary",
    },
    generatedAt: {
      type: DataTypes.DATE,
      allowNull: false,
      defaultValue: DataTypes.NOW,
    },
  },
  {
    tableName: "compatibility_reports",
    timestamps: true,
    indexes: [
      {
        fields: ["userId"],
      },
    ],
  }
);

module.exports = CompatibilityReport;
