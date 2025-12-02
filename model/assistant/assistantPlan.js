const { DataTypes } = require("sequelize");
const { sequelize } = require("../../dbConnection/dbConfig");

const AssistantPlan = sequelize.define(
  "AssistantPlan",
  {
    id: {
      type: DataTypes.UUID,
      defaultValue: DataTypes.UUIDV4,
      primaryKey: true,
    },
    astrologerId: {
      type: DataTypes.UUID,
      allowNull: false,
      unique: true,
      references: {
        model: "astrologers",
        key: "id",
      },
      onDelete: "CASCADE",
      onUpdate: "CASCADE",
    },
    planType: {
      type: DataTypes.ENUM("basic", "premium", "enterprise"),
      allowNull: false,
      defaultValue: "basic",
      comment: "Basic: Profile access, Premium: +Blogs, Enterprise: +Analytics",
    },
    isActive: {
      type: DataTypes.BOOLEAN,
      defaultValue: true,
    },
    startDate: {
      type: DataTypes.DATE,
      allowNull: false,
    },
    endDate: {
      type: DataTypes.DATE,
      allowNull: false,
    },
    monthlyPrice: {
      type: DataTypes.DECIMAL(10, 2),
      allowNull: false,
      comment: "Monthly subscription price",
    },
    features: {
      type: DataTypes.JSONB,
      defaultValue: {
        profileAccess: true,
        blogAccess: false,
        reviewAccess: false,
        analyticsAccess: false,
        customPrompts: false,
        maxChatsPerDay: 100,
      },
    },
    assistantName: {
      type: DataTypes.STRING(100),
      allowNull: true,
      comment: "Custom name for the assistant",
    },
    assistantDescription: {
      type: DataTypes.TEXT,
      allowNull: true,
      comment: "Custom description/personality for the assistant",
    },
    customInstructions: {
      type: DataTypes.TEXT,
      allowNull: true,
      comment: "Additional instructions for AI behavior",
    },
    totalChatsHandled: {
      type: DataTypes.INTEGER,
      defaultValue: 0,
    },
    totalRevenue: {
      type: DataTypes.DECIMAL(10, 2),
      defaultValue: 0,
      comment: "Total revenue generated from assistant chats",
    },
    lastActiveAt: {
      type: DataTypes.DATE,
      allowNull: true,
    },
  },
  {
    tableName: "assistant_plans",
    timestamps: true,
    indexes: [
      {
        fields: ["astrologerId"],
      },
      {
        fields: ["isActive"],
      },
      {
        fields: ["endDate"],
      },
    ],
  }
);

module.exports = AssistantPlan;
