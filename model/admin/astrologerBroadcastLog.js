const { DataTypes } = require("sequelize");
const { sequelize } = require("../../dbConnection/dbConfig");

const AstrologerBroadcastLog = sequelize.define(
  "AstrologerBroadcastLog",
  {
    id: {
      type: DataTypes.UUID,
      defaultValue: DataTypes.UUIDV4,
      primaryKey: true,
    },
    adminId: {
      type: DataTypes.UUID,
      allowNull: false,
      references: {
        model: "admins",
        key: "id",
      },
      onDelete: "CASCADE",
      onUpdate: "CASCADE",
    },
    adminName: {
      type: DataTypes.STRING,
      allowNull: false,
      defaultValue: "",
    },
    title: {
      type: DataTypes.STRING,
      allowNull: false,
    },
    message: {
      type: DataTypes.TEXT,
      allowNull: false,
    },
    actionUrl: {
      type: DataTypes.STRING,
      allowNull: true,
    },
    targetMode: {
      type: DataTypes.ENUM("all", "selected"),
      allowNull: false,
      defaultValue: "all",
    },
    targetAstrologerIds: {
      type: DataTypes.JSONB,
      allowNull: true,
      defaultValue: [],
    },
    totalAstrologers: {
      type: DataTypes.INTEGER,
      allowNull: false,
      defaultValue: 0,
    },
    pushSuccessCount: {
      type: DataTypes.INTEGER,
      allowNull: false,
      defaultValue: 0,
    },
    pushFailureCount: {
      type: DataTypes.INTEGER,
      allowNull: false,
      defaultValue: 0,
    },
  },
  {
    tableName: "astrologer_broadcast_logs",
    timestamps: true,
  }
);

module.exports = AstrologerBroadcastLog;
