const { DataTypes } = require("sequelize");
const { sequelize } = require("../../dbConnection/dbConfig");

const AstrologerEarning = sequelize.define(
  "AstrologerEarning",
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
    },
    userId: {
      type: DataTypes.UUID,
      allowNull: false,
      references: {
        model: "users",
        key: "id",
      },
      onDelete: "CASCADE",
    },
    sessionId: {
      type: DataTypes.UUID,
      allowNull: false,
      comment: "Reference to chat/call/live session ID",
    },
    sessionType: {
      type: DataTypes.ENUM("chat", "call", "live"),
      allowNull: false,
      comment: "Type of consultation session",
    },
    durationMinutes: {
      type: DataTypes.DECIMAL(10, 2),
      allowNull: false,
      defaultValue: 0,
      comment: "Duration of session in minutes",
      validate: {
        min: 0,
      },
    },
    pricePerMinute: {
      type: DataTypes.DECIMAL(10, 2),
      allowNull: false,
      comment: "Astrologer's rate at the time of session (₹)",
      validate: {
        min: 0,
      },
    },
    totalAmount: {
      type: DataTypes.DECIMAL(10, 2),
      allowNull: false,
      comment: "Total earning = durationMinutes * pricePerMinute (₹)",
      validate: {
        min: 0,
      },
    },
    platformCommission: {
      type: DataTypes.DECIMAL(10, 2),
      allowNull: false,
      defaultValue: 0,
      comment: "Platform commission deducted (₹)",
      validate: {
        min: 0,
      },
    },
    commissionPercentage: {
      type: DataTypes.DECIMAL(5, 2),
      allowNull: false,
      defaultValue: 20,
      comment: "Platform commission percentage at time of session",
      validate: {
        min: 0,
        max: 100,
      },
    },
    netEarning: {
      type: DataTypes.DECIMAL(10, 2),
      allowNull: false,
      comment: "Net earning after commission = totalAmount - platformCommission (₹)",
      validate: {
        min: 0,
      },
    },
    paymentStatus: {
      type: DataTypes.ENUM("pending", "processing", "completed", "failed"),
      defaultValue: "pending",
      comment: "Status of payout to astrologer",
    },
    paidAt: {
      type: DataTypes.DATE,
      allowNull: true,
      comment: "Timestamp when payment was made to astrologer",
    },
    paymentMethod: {
      type: DataTypes.STRING,
      allowNull: true,
      comment: "Payment method used for payout (bank transfer, UPI, etc.)",
    },
    transactionId: {
      type: DataTypes.STRING,
      allowNull: true,
      comment: "Transaction ID for payout",
    },
    notes: {
      type: DataTypes.TEXT,
      allowNull: true,
      comment: "Additional notes about the earning/payout",
    },
    sessionStartTime: {
      type: DataTypes.DATE,
      allowNull: false,
      comment: "When the session started",
    },
    sessionEndTime: {
      type: DataTypes.DATE,
      allowNull: false,
      comment: "When the session ended",
    },
  },
  {
    tableName: "astrologer_earnings",
    timestamps: true,
    hooks: {
      beforeValidate: (earning) => {
        // Calculate totalAmount if not provided
        if (earning.durationMinutes && earning.pricePerMinute) {
          earning.totalAmount = (
            parseFloat(earning.durationMinutes) * parseFloat(earning.pricePerMinute)
          ).toFixed(2);
        }

        // Calculate platformCommission if not provided
        if (earning.totalAmount && earning.commissionPercentage) {
          earning.platformCommission = (
            (parseFloat(earning.totalAmount) * parseFloat(earning.commissionPercentage)) / 100
          ).toFixed(2);
        }

        // Calculate netEarning
        if (earning.totalAmount && earning.platformCommission) {
          earning.netEarning = (
            parseFloat(earning.totalAmount) - parseFloat(earning.platformCommission)
          ).toFixed(2);
        }
      },
    },
  }
);

module.exports = AstrologerEarning;
