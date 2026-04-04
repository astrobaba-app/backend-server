const { DataTypes } = require("sequelize");
const { sequelize } = require("../../dbConnection/dbConfig");

const SharedKundliDeletion = sequelize.define(
  "SharedKundliDeletion",
  {
    id: {
      type: DataTypes.UUID,
      defaultValue: DataTypes.UUIDV4,
      primaryKey: true,
    },
    requestId: {
      type: DataTypes.UUID,
      allowNull: false,
      unique: true,
      comment: "Deleted shared kundli requestId",
    },
    deletedByUser: {
      type: DataTypes.BOOLEAN,
      allowNull: false,
      defaultValue: true,
    },
    deletedAt: {
      type: DataTypes.DATE,
      allowNull: false,
      defaultValue: DataTypes.NOW,
    },
  },
  {
    tableName: "shared_kundli_deletions",
    timestamps: true,
  }
);

module.exports = SharedKundliDeletion;