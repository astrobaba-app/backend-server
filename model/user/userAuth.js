const { DataTypes } = require("sequelize");
const { sequelize } = require("../../dbConnection/dbConfig");

const User = sequelize.define(
  "User",
  {
    id: {
      type: DataTypes.UUID,
      defaultValue: DataTypes.UUIDV4,
      primaryKey: true,
    },
    fullName: {
      type: DataTypes.STRING,
      allowNull: true,
    },
    email: {
      type: DataTypes.STRING,
      allowNull: true,
    },
    mobile: {
      type: DataTypes.BIGINT,
      unique: true,
      allowNull: true,
    },
    gender: {
      type: DataTypes.STRING,
      allowNull: true,
    },
    dateOfbirth: {
      type: DataTypes.DATE,
      allowNull: true,
    },
    timeOfbirth: {
      type: DataTypes.STRING,
      allowNull: true,
    },
    placeOfBirth: {
      type: DataTypes.STRING,
      allowNull: true,
    },
    latitude: {
      type: DataTypes.FLOAT,
      allowNull: true,
    },
    longitude: {
      type: DataTypes.FLOAT,
      allowNull: true,
    },
    isUserRequested: {
      type: DataTypes.BOOLEAN,
      defaultValue: false,
    },
    otp: {
      type: DataTypes.STRING,
      allowNull: true,
    },
    otpExpiry: {
      type: DataTypes.DATE,
      allowNull: true,
    },
      currentAddress: {
      type: DataTypes.STRING,
      allowNull: true,
    },
        cityStateCountry: {
      type: DataTypes.STRING,
      allowNull: true,
    },
    pincode: {
      type: DataTypes.INTEGER,
      allowNull: true,
    },
  },
  {
    tableName: "users",
    timestamps: true,
  }
);

module.exports = User;
