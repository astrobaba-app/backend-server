const { DataTypes } = require("sequelize");
const { sequelize } = require("../../dbConnection/dbConfig");

const Address = sequelize.define(
  "Address",
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
    },
    fullName: {
      type: DataTypes.STRING,
      allowNull: false,
    },
    phone: {
      type: DataTypes.STRING,
      allowNull: false,
    },
    addressLine1: {
      type: DataTypes.STRING,
      allowNull: false,
    },
    addressLine2: {
      type: DataTypes.STRING,
      allowNull: true,
    },
    city: {
      type: DataTypes.STRING,
      allowNull: false,
    },
    state: {
      type: DataTypes.STRING,
      allowNull: false,
    },
    pincode: {
      type: DataTypes.STRING,
      allowNull: false,
    },
    country: {
      type: DataTypes.STRING,
      allowNull: false,
      defaultValue: "India",
    },
    landmark: {
      type: DataTypes.STRING,
      allowNull: true,
    },
    addressType: {
      type: DataTypes.ENUM("home", "work", "other"),
      allowNull: false,
      defaultValue: "home",
    },
    isDefault: {
      type: DataTypes.BOOLEAN,
      allowNull: false,
      defaultValue: false,
    },
  },
  {
    tableName: "addresses",
    timestamps: true,
  }
);

module.exports = Address;
