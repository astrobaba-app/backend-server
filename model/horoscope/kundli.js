const { DataTypes } = require("sequelize");
const { sequelize } = require("../../dbConnection/dbConfig");

const Kundli = sequelize.define(
  "Kundli",
  {
    id: {
      type: DataTypes.UUID,
      defaultValue: DataTypes.UUIDV4,
      primaryKey: true,
    },
    requestId: {
      type: DataTypes.UUID,
      allowNull: false,
      references: {
        model: "user_requests",
        key: "id",
      },
      onUpdate: "CASCADE",
      onDelete: "CASCADE",
    },
    basicDetails: {
      type: DataTypes.JSON,
      allowNull: true,
    },
    astroDetails: {
      type: DataTypes.JSON,
      allowNull: true,
      comment: "Contains house cusps, ascendant, and detailed astrological info",
    },
    manglikAnalysis: {
      type: DataTypes.JSON,
      allowNull: true,
    },
    panchang: {
      type: DataTypes.JSON,
      allowNull: true,
    },
    charts: {
      type: DataTypes.JSON,
      allowNull: true,
    },
    dasha: {
      type: DataTypes.JSON,
      allowNull: true,
    },
    yogini: {
      type: DataTypes.JSON,
      allowNull: true,
    },
    personality: {
      type: DataTypes.JSON,
      allowNull: true,
    },
    planetary: {
      type: DataTypes.JSON,
      allowNull: true,
    },
    remedies: {
      type: DataTypes.JSON,
      allowNull: true,
    },
  },
  {
    tableName: "kundlis",
    timestamps: true,
  }
);

module.exports = Kundli;
