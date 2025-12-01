const { DataTypes } = require("sequelize");
const { sequelize } = require("../../dbConnection/dbConfig");

const GoogleAuth = sequelize.define(
  "GoogleAuth",
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
    googleId: {
      type: DataTypes.STRING,
      allowNull: false,
      unique: true,
    },
  },
  {
    tableName: "google_auths",
    timestamps: true,
  }
);

module.exports = GoogleAuth;
