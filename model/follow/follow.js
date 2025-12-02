const { DataTypes } = require("sequelize");
const { sequelize } = require("../../dbConnection/dbConfig");

const Follow = sequelize.define(
  "Follow",
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
      onDelete: "CASCADE",
      onUpdate: "CASCADE",
      comment: "User who is following",
    },
    astrologerId: {
      type: DataTypes.UUID,
      allowNull: false,
      references: {
        model: "astrologers",
        key: "id",
      },
      onDelete: "CASCADE",
      onUpdate: "CASCADE",
      comment: "Astrologer being followed",
    },
  },
  {
    tableName: "follows",
    timestamps: true,
    indexes: [
      {
        fields: ["userId", "astrologerId"],
        unique: true,
        name: "unique_user_astrologer_follow",
      },
      {
        fields: ["userId"],
      },
      {
        fields: ["astrologerId"],
      },
    ],
  }
);

module.exports = Follow;
