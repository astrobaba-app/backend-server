const { DataTypes } = require("sequelize");
const { sequelize } = require("../../dbConnection/dbConfig");

const JobApplication = sequelize.define(
  "JobApplication",
  {
    id: {
      type: DataTypes.UUID,
      defaultValue: DataTypes.UUIDV4,
      primaryKey: true,
    },
    jobId: {
      type: DataTypes.UUID,
      allowNull: false,
      references: {
        model: "jobs",
        key: "id",
      },
      onDelete: "CASCADE",
      onUpdate: "CASCADE",
    },
    profession: {
      type: DataTypes.STRING(140),
      allowNull: false,
    },
    fullName: {
      type: DataTypes.STRING(160),
      allowNull: false,
    },
    email: {
      type: DataTypes.STRING(160),
      allowNull: false,
      validate: {
        isEmail: true,
      },
    },
    phone: {
      type: DataTypes.STRING(32),
      allowNull: false,
    },
    linkedInUrl: {
      type: DataTypes.TEXT,
      allowNull: true,
    },
    portfolioUrl: {
      type: DataTypes.TEXT,
      allowNull: true,
    },
    gender: {
      type: DataTypes.ENUM("male", "female", "other"),
      allowNull: false,
    },
    resumeUrl: {
      type: DataTypes.TEXT,
      allowNull: false,
    },
    resumePublicId: {
      type: DataTypes.STRING,
      allowNull: true,
    },
    resumeFileName: {
      type: DataTypes.STRING,
      allowNull: true,
    },
    consentForJobUpdates: {
      type: DataTypes.BOOLEAN,
      allowNull: false,
      defaultValue: false,
    },
    emailStatus: {
      type: DataTypes.ENUM("pending", "processing", "sent", "failed"),
      allowNull: false,
      defaultValue: "pending",
    },
    emailAttempts: {
      type: DataTypes.INTEGER,
      allowNull: false,
      defaultValue: 0,
    },
    emailLastError: {
      type: DataTypes.TEXT,
      allowNull: true,
    },
    emailSentAt: {
      type: DataTypes.DATE,
      allowNull: true,
    },
  },
  {
    tableName: "job_applications",
    timestamps: true,
    indexes: [
      { fields: ["jobId"] },
      { fields: ["email"] },
      { fields: ["createdAt"] },
      { fields: ["emailStatus"] },
    ],
  }
);

module.exports = JobApplication;
