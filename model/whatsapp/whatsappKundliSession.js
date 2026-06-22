const { DataTypes } = require("sequelize");
const { sequelize } = require("../../dbConnection/dbConfig");

const WhatsappKundliSession = sequelize.define(
  "WhatsappKundliSession",
  {
    id: {
      type: DataTypes.UUID,
      defaultValue: DataTypes.UUIDV4,
      primaryKey: true,
    },

    mobile: {
      type: DataTypes.STRING,
      allowNull: false,
      unique: true,
    },

    extractedData: {
      type: DataTypes.JSON,
      allowNull: false,
      defaultValue: {},
    },

    lastMissingFields: {
      type: DataTypes.JSON,
      allowNull: false,
      defaultValue: [],
    },

    failedAttempts: {
      type: DataTypes.INTEGER,
      allowNull: false,
      defaultValue: 0,
    },

    status: {
      type: DataTypes.STRING,
      allowNull: false,
      defaultValue: "IN_PROGRESS",
    },

    lastMessageAt: {
      type: DataTypes.DATE,
      allowNull: true,
    },
  },
  {
    tableName: "whatsapp_kundli_sessions",
    timestamps: true,
  }
);

module.exports = WhatsappKundliSession;