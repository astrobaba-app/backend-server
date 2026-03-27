const { DataTypes } = require("sequelize");
const { sequelize } = require("../../dbConnection/dbConfig");

const AstrologerPayoutRequest = sequelize.define(
  "AstrologerPayoutRequest",
  {
    id: {
      type: DataTypes.UUID,
      defaultValue: DataTypes.UUIDV4,
      primaryKey: true,
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
    },
    requestedAmount: {
      type: DataTypes.DECIMAL(10, 2),
      allowNull: false,
      validate: {
        min: 0,
      },
    },
    currency: {
      type: DataTypes.STRING,
      allowNull: false,
      defaultValue: "INR",
    },
    status: {
      type: DataTypes.ENUM("requested", "processing", "paid", "rejected"),
      allowNull: false,
      defaultValue: "requested",
    },
    earningIds: {
      type: DataTypes.JSON,
      allowNull: false,
      defaultValue: [],
      comment: "Array of astrologer_earnings IDs included in this payout request",
    },
    snapshot: {
      type: DataTypes.JSON,
      allowNull: true,
      comment: "Summary snapshot at request time",
    },
    requestedAt: {
      type: DataTypes.DATE,
      allowNull: false,
      defaultValue: DataTypes.NOW,
    },
    processedAt: {
      type: DataTypes.DATE,
      allowNull: true,
    },
    processedByAdminId: {
      type: DataTypes.UUID,
      allowNull: true,
      references: {
        model: "admins",
        key: "id",
      },
      onDelete: "SET NULL",
      onUpdate: "CASCADE",
    },
    paymentMethod: {
      type: DataTypes.STRING,
      allowNull: true,
    },
    transactionId: {
      type: DataTypes.STRING,
      allowNull: true,
    },
    notes: {
      type: DataTypes.TEXT,
      allowNull: true,
    },
  },
  {
    tableName: "astrologer_payout_requests",
    timestamps: true,
  }
);

module.exports = AstrologerPayoutRequest;
