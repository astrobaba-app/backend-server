const { DataTypes } = require("sequelize");
const { sequelize } = require("../../dbConnection/dbConfig");

const INTEREST_CATEGORIES = [
  "Career",
  "Marriage",
  "Love",
  "Finance",
  "Health",
  "Education",
  "Property",
  "Business",
  "Family",
  "Spirituality",
  "Child",
  "Travel",
];

const InterestIntentResult = sequelize.define(
  "InterestIntentResult",
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
    sessionId: {
      type: DataTypes.UUID,
      allowNull: false,
    },
    sessionType: {
      type: DataTypes.ENUM("ai_chat", "human_chat"),
      allowNull: false,
    },
    primaryIntent: {
      type: DataTypes.ENUM(...INTEREST_CATEGORIES),
      allowNull: false,
    },
    secondaryIntent: {
      type: DataTypes.ENUM(...INTEREST_CATEGORIES),
      allowNull: true,
    },
    confidence: {
      type: DataTypes.FLOAT,
      allowNull: false,
      defaultValue: 0,
    },
    source: {
      type: DataTypes.ENUM(
        "ai_chat_session_end",
        "human_chat_worker",
        "ai_chat_backfill",
        "human_chat_backfill"
      ),
      allowNull: false,
    },
    processedAt: {
      type: DataTypes.DATE,
      allowNull: false,
      defaultValue: DataTypes.NOW,
    },
    metadata: {
      type: DataTypes.JSONB,
      allowNull: true,
    },
  },
  {
    tableName: "interest_intent_results",
    timestamps: true,
    indexes: [
      {
        unique: true,
        fields: ["sessionId", "sessionType"],
      },
      {
        fields: ["userId", "createdAt"],
      },
      {
        fields: ["primaryIntent"],
      },
    ],
  }
);

InterestIntentResult.INTEREST_CATEGORIES = INTEREST_CATEGORIES;

module.exports = InterestIntentResult;
