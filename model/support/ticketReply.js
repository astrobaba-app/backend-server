const { DataTypes } = require("sequelize");
const sequelize = require("../../config/database");

const TicketReply = sequelize.define(
  "TicketReply",
  {
    id: {
      type: DataTypes.UUID,
      defaultValue: DataTypes.UUIDV4,
      primaryKey: true,
    },
    ticketId: {
      type: DataTypes.UUID,
      allowNull: false,
      references: {
        model: "support_tickets",
        key: "id",
      },
      onDelete: "CASCADE",
      onUpdate: "CASCADE",
    },
    repliedBy: {
      type: DataTypes.UUID,
      allowNull: false,
      comment: "User ID or Admin ID",
    },
    repliedByType: {
      type: DataTypes.ENUM("user", "admin"),
      allowNull: false,
    },
    message: {
      type: DataTypes.TEXT,
      allowNull: false,
    },
    attachments: {
      type: DataTypes.ARRAY(DataTypes.TEXT),
      defaultValue: [],
      comment: "Array of attachment URLs",
    },
    isInternal: {
      type: DataTypes.BOOLEAN,
      defaultValue: false,
      comment: "Internal notes visible only to admins",
    },
  },
  {
    tableName: "ticket_replies",
    timestamps: true,
    indexes: [
      {
        fields: ["ticketId"],
      },
      {
        fields: ["repliedBy"],
      },
      {
        fields: ["createdAt"],
      },
    ],
  }
);

module.exports = TicketReply;
