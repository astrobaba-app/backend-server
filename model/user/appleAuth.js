const { DataTypes } = require("sequelize");
const { sequelize } = require("../../dbConnection/dbConfig");

const AppleAuth = sequelize.define(
  "AppleAuth",
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
    appleId: {
      type: DataTypes.STRING,
      allowNull: false,
      unique: true,
    },
  },
  {
    tableName: "apple_auths",
    timestamps: true,
  }
);

module.exports = AppleAuth;
