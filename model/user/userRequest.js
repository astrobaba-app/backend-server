const { DataTypes } = require("sequelize");
const { sequelize } = require("../../dbConnection/dbConfig");

const UserRequest = sequelize.define(
  "UserRequest",
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
     fullName: {
      type: DataTypes.STRING,
      allowNull: true,
    },
    dateOfbirth: {
      type: DataTypes.DATE,
      allowNull: true,
    },
    timeOfbirth: {
      type: DataTypes.STRING,
      allowNull: false,
    },
    placeOfBirth: {
      type: DataTypes.STRING,
      allowNull: false,
    },
    gender: {
      type: DataTypes.STRING,
      allowNull: false,
    },
    latitude: {
      type: DataTypes.FLOAT,
      allowNull: false,
    },
    longitude: {
      type: DataTypes.FLOAT,
      allowNull: false,
    },
  },
  {
    tableName: "user_requests",
    timestamps: true,
  }
);

module.exports = UserRequest;
