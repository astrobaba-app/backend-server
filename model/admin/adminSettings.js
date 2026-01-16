const { DataTypes } = require("sequelize");
const { sequelize } = require("../../dbConnection/dbConfig");

const AdminSettings = sequelize.define(
  "AdminSettings",
  {
    id: {
      type: DataTypes.UUID,
      defaultValue: DataTypes.UUIDV4,
      primaryKey: true,
    },
    settingKey: {
      type: DataTypes.STRING,
      allowNull: false,
      unique: true,
      comment: "Unique identifier for the setting",
    },
    settingValue: {
      type: DataTypes.TEXT,
      allowNull: true,
      comment: "Value of the setting (stored as JSON string for complex values)",
    },
    description: {
      type: DataTypes.STRING,
      allowNull: true,
      comment: "Description of what this setting does",
    },
    isActive: {
      type: DataTypes.BOOLEAN,
      allowNull: false,
      defaultValue: true,
      comment: "Whether this setting is active/enabled",
    },
  },
  {
    tableName: "admin_settings",
    timestamps: true,
  }
);

module.exports = AdminSettings;
