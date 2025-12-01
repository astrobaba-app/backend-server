const { DataTypes } = require("sequelize");
const { sequelize } = require("../../dbConnection/dbConfig");

const KundliMatch = sequelize.define(
  "KundliMatch",
  {
    id: {
      type: DataTypes.UUID,
      defaultValue: DataTypes.UUIDV4,
      primaryKey: true,
    },
    request1Id: {
      type: DataTypes.UUID,
      allowNull: false,
      references: {
        model: "user_requests",
        key: "id",
      },
      onUpdate: "CASCADE",
      onDelete: "CASCADE",
    },
    request2Id: {
      type: DataTypes.UUID,
      allowNull: false,
      references: {
        model: "user_requests",
        key: "id",
      },
      onUpdate: "CASCADE",
      onDelete: "CASCADE",
    },
    compatibilityScore: {
      type: DataTypes.FLOAT,
      allowNull: true,
    },
    details: {
      type: DataTypes.JSON,
      allowNull: true,
    },
  },
  {
    tableName: "kundli_matches",
    timestamps: true,
  }
);

module.exports = KundliMatch;
