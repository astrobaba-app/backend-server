const { DataTypes } = require("sequelize");
const { sequelize } = require("../../dbConnection/dbConfig");

const AccountDeletionRequest = sequelize.define(
  "AccountDeletionRequest",
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
    reason: {
      type: DataTypes.TEXT,
      allowNull: true,
      comment: "User's reason for account deletion"
    },
    status: {
      type: DataTypes.ENUM('pending', 'approved', 'rejected', 'completed'),
      defaultValue: 'pending',
      allowNull: false,
    },
    requestedAt: {
      type: DataTypes.DATE,
      defaultValue: DataTypes.NOW,
      allowNull: false,
    },
    processedAt: {
      type: DataTypes.DATE,
      allowNull: true,
    },
    processedBy: {
      type: DataTypes.UUID,
      allowNull: true,
      comment: "Admin ID who processed the request"
    },
    adminNotes: {
      type: DataTypes.TEXT,
      allowNull: true,
      comment: "Internal notes from admin"
    },
  },
  {
    tableName: "account_deletion_requests",
    timestamps: true,
  }
);

module.exports = AccountDeletionRequest;
