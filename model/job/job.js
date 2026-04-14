const { DataTypes } = require("sequelize");
const { sequelize } = require("../../dbConnection/dbConfig");

const Job = sequelize.define(
  "Job",
  {
    id: {
      type: DataTypes.UUID,
      defaultValue: DataTypes.UUIDV4,
      primaryKey: true,
    },
    title: {
      type: DataTypes.STRING(200),
      allowNull: false,
      validate: {
        len: [3, 200],
      },
    },
    description: {
      type: DataTypes.TEXT,
      allowNull: false,
    },
    bulletPoints: {
      type: DataTypes.ARRAY(DataTypes.STRING),
      allowNull: false,
      defaultValue: [],
    },
    mode: {
      type: DataTypes.ENUM("remote", "hybrid", "onsite"),
      allowNull: false,
      defaultValue: "remote",
    },
    type: {
      type: DataTypes.ENUM("full-time", "intern", "contract", "part-time"),
      allowNull: false,
      defaultValue: "full-time",
    },
    startDate: {
      type: DataTypes.DATEONLY,
      allowNull: true,
    },
    whatWeExpectFromYou: {
      type: DataTypes.ARRAY(DataTypes.STRING),
      allowNull: false,
      defaultValue: [],
    },
    skills: {
      type: DataTypes.ARRAY(DataTypes.STRING),
      allowNull: false,
      defaultValue: [],
    },
    isActive: {
      type: DataTypes.BOOLEAN,
      allowNull: false,
      defaultValue: true,
    },
    createdByAdminId: {
      type: DataTypes.UUID,
      allowNull: true,
      references: {
        model: "admins",
        key: "id",
      },
      onDelete: "SET NULL",
      onUpdate: "CASCADE",
    },
  },
  {
    tableName: "jobs",
    timestamps: true,
    indexes: [
      { fields: ["isActive"] },
      { fields: ["type"] },
      { fields: ["mode"] },
      { fields: ["startDate"] },
      { fields: ["createdAt"] },
    ],
  }
);

module.exports = Job;
