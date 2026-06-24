const { DataTypes } = require("sequelize");
const { sequelize } = require("../../dbConnection/dbConfig");

const AIChatSession = sequelize.define(
  "AIChatSession",
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
    },
    astrologerId: {
      type: DataTypes.STRING(100),
      allowNull: true,
      comment: "Identifier for the AI astrologer (e.g., 'ai-astrologer-devansh', 'ai-astrologer-ritika', 'ai-astrologer-arjun')",
    },
    title: {
      type: DataTypes.STRING(200),
      allowNull: true,
      comment: "Auto-generated title from first message",
    },
    isActive: {
      type: DataTypes.BOOLEAN,
      defaultValue: true,
      comment: "Whether this chat session is active",
    },
    status: {
      type: DataTypes.STRING(30),
      allowNull: false,
      defaultValue: "active",
      comment: "active, completed, cancelled",
    },
    startTime: {
      type: DataTypes.DATE,
      allowNull: true,
      comment: "When billable AI chat started",
    },
    endTime: {
      type: DataTypes.DATE,
      allowNull: true,
      comment: "When billable AI chat ended",
    },
    totalMinutes: {
      type: DataTypes.INTEGER,
      allowNull: false,
      defaultValue: 0,
      comment: "Total billable AI chat minutes",
    },
    totalCost: {
      type: DataTypes.DECIMAL(10, 2),
      allowNull: false,
      defaultValue: 0,
      comment: "Total AI chat cost before available-balance cap",
    },
    billedAmount: {
      type: DataTypes.DECIMAL(10, 2),
      allowNull: false,
      defaultValue: 0,
      comment: "Amount debited from wallet for this AI chat",
    },
    pricePerMinute: {
      type: DataTypes.DECIMAL(10, 2),
      allowNull: false,
      defaultValue: 10,
      comment: "AI chat price per minute captured at session start",
    },
    maxDurationSeconds: {
      type: DataTypes.INTEGER,
      allowNull: true,
      comment: "Maximum duration allowed by wallet balance at start",
    },
    maxEndTime: {
      type: DataTypes.DATE,
      allowNull: true,
      comment: "Auto-end time calculated from wallet balance at start",
    },
    walletBalanceAtStart: {
      type: DataTypes.DECIMAL(10, 2),
      allowNull: true,
      comment: "AI-usable wallet balance captured at session start",
    },
    endReason: {
      type: DataTypes.STRING(80),
      allowNull: true,
      comment: "Reason why AI chat ended",
    },
    lastMessagePreview: {
      type: DataTypes.STRING(255),
      allowNull: true,
      comment: "Short preview of the last message",
    },
    lastMessageAt: {
      type: DataTypes.DATE,
      allowNull: true,
      comment: "Timestamp of last message in this session",
    },
    kundliUserRequestId: {
      type: DataTypes.UUID,
      allowNull: true,
      references: {
        model: "user_requests",
        key: "id",
      },
      onDelete: "SET NULL",
      onUpdate: "CASCADE",
      comment: "The Kundli (user request) linked to this chat session for personalized readings",
    },
    interestSignals: {
      type: DataTypes.JSONB,
      allowNull: true,
      defaultValue: [],
      comment: "Internal per-turn interest signals captured during AI chat for final cohort scoring",
    },
  },
  {
    tableName: "ai_chat_sessions",
    timestamps: true,
    indexes: [
      {
        fields: ["userId"],
      },
      {
        fields: ["isActive"],
      },
      {
        fields: ["lastMessageAt"],
      },
      {
        fields: ["userId", "astrologerId"],
      },
    ],
  }
);

module.exports = AIChatSession;
