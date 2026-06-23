const { DataTypes } = require("sequelize");
const { sequelize } = require("../../dbConnection/dbConfig");

const YearlyReport = sequelize.define(
  "YearlyReport",
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
    userRequestId: {
      type: DataTypes.UUID,
      allowNull: false,
      unique: true,
      references: {
        model: "user_requests",
        key: "id",
      },
      onUpdate: "CASCADE",
      onDelete: "CASCADE",
    },
    reportData: {
      type: DataTypes.JSON,
      allowNull: false,
      comment: "Cached AI-generated yearly predictions",
    },
    pdfUrl: {
      type: DataTypes.TEXT,
      allowNull: true,
      comment: "Cloudinary secure URL of generated yearly report PDF",
    },
    pdfPublicId: {
      type: DataTypes.STRING,
      allowNull: true,
      comment: "Cloudinary public ID of generated yearly report PDF",
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
    tableName: "yearly_reports",
    timestamps: true,
    indexes: [
      {
        fields: ["userId"],
      },
      {
        unique: true,
        fields: ["userRequestId"],
      },
    ],
  }
);

module.exports = YearlyReport;
