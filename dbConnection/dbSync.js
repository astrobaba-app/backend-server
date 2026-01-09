const { sequelize } = require("../dbConnection/dbConfig");
const { DataTypes } = require("sequelize");
const User = require("../model/user/userAuth");
const UserRequest = require("../model/user/userRequest");
const AccountDeletionRequest = require("../model/user/accountDeletionRequest");
const Kundli = require("../model/horoscope/kundli");
const MatchingProfile = require("../model/horoscope/matchingProfile");
const Wallet = require("../model/wallet/wallet");
const WalletTransaction = require("../model/wallet/walletTransaction");
const horoscope = require("../model/horoscope/horoscope");
const CachedHoroscope = require("../model/horoscope/cachedHoroscope");
const LiveChatMessage = require("../model/live/liveChatMessage");




async function ensureChatSessionColumns() {
  const queryInterface = sequelize.getQueryInterface();

  const table = await queryInterface.describeTable("chat_sessions");
  const operations = [];

  // Ensure request status columns exist and are compatible with current model/queries
  if (!table.request_status && !table.requestStatus) {
    // Primary column using snake_case
    operations.push(
      queryInterface.addColumn("chat_sessions", "request_status", {
        type: DataTypes.ENUM("pending", "approved", "rejected"),
        allowNull: false,
        defaultValue: "pending",
        comment:
          "Chat request status: pending (awaiting astrologer approval), approved (active chat), rejected (request declined)",
      })
    );
  }

  // Some parts of Sequelize may still reference the camelCase name in generated SQL
  // (e.g. "ChatSession"."requestStatus"). To avoid runtime errors like
  // "column ChatSession.requestStatus does not exist", ensure a compatible
  // camelCase column also exists, backed by the same ENUM semantics.
  if (!table.requestStatus) {
    operations.push(
      queryInterface.addColumn("chat_sessions", "requestStatus", {
        type: DataTypes.ENUM("pending", "approved", "rejected"),
        allowNull: false,
        defaultValue: "pending",
        comment:
          "Duplicate of request_status to satisfy legacy/camelCase queries",
      })
    );
  }

  if (!table.last_message_preview) {
    operations.push(
      queryInterface.addColumn("chat_sessions", "last_message_preview", {
        type: DataTypes.STRING,
        allowNull: true,
        comment: "Short preview of the last message in this chat session",
      })
    );
  }

  if (!table.last_message_at) {
    operations.push(
      queryInterface.addColumn("chat_sessions", "last_message_at", {
        type: DataTypes.DATE,
        allowNull: true,
        comment: "Timestamp of the last message in this chat session",
      })
    );
  }

  if (!table.user_unread_count) {
    operations.push(
      queryInterface.addColumn("chat_sessions", "user_unread_count", {
        type: DataTypes.INTEGER,
        allowNull: false,
        defaultValue: 0,
        comment: "Unread messages for the user in this session",
      })
    );
  }

  if (!table.astrologer_unread_count) {
    operations.push(
      queryInterface.addColumn("chat_sessions", "astrologer_unread_count", {
        type: DataTypes.INTEGER,
        allowNull: false,
        defaultValue: 0,
        comment: "Unread messages for the astrologer in this session",
      })
    );
  }

  if (operations.length) {
    await Promise.all(operations);
    console.log("Ensured chat_sessions metadata columns exist");
  }
}

async function ensureLiveChatMessageColumns() {
  const queryInterface = sequelize.getQueryInterface();

  try {
    const table = await queryInterface.describeTable("live_chat_messages");
    const operations = [];

    // Check if sender_role column exists (PostgreSQL uses lowercase)
    if (!table.sender_role && !table.senderRole) {
      console.log("Adding sender_role column to live_chat_messages...");
      operations.push(
        queryInterface.addColumn("live_chat_messages", "sender_role", {
          type: DataTypes.ENUM("user", "astrologer"),
          allowNull: true,
          comment: "Role of the message sender (user or astrologer)",
        })
      );
    }

    if (operations.length) {
      await Promise.all(operations);
      console.log("✓ Added sender_role column to live_chat_messages");
    } else {
      console.log("✓ live_chat_messages table is up to date");
    }
  } catch (error) {
    // Table doesn't exist yet, will be created by sync
    console.log("live_chat_messages table will be created by sync");
  }
}

async function ensureChatMessageColumns() {
  const queryInterface = sequelize.getQueryInterface();

  const table = await queryInterface.describeTable("chat_messages");
  const operations = [];

  if (!table.reply_to_message_id) {
    operations.push(
      queryInterface.addColumn("chat_messages", "reply_to_message_id", {
        type: DataTypes.UUID,
        allowNull: true,
        comment: "If set, this message is a reply to another message in the same session",
      })
    );
  }

  if (!table.is_deleted) {
    operations.push(
      queryInterface.addColumn("chat_messages", "is_deleted", {
        type: DataTypes.BOOLEAN,
        allowNull: false,
        defaultValue: false,
        comment: "Soft-delete flag for messages",
      })
    );
  }

  if (!table.deleted_at) {
    operations.push(
      queryInterface.addColumn("chat_messages", "deleted_at", {
        type: DataTypes.DATE,
        allowNull: true,
        comment: "Timestamp when message was soft-deleted",
      })
    );
  }

  if (operations.length) {
    await Promise.all(operations);
    console.log("Ensured chat_messages reply/delete columns exist");
  }
}

const initDB = (callback) => {
  sequelize
    .authenticate()
    .then(() => {
      console.log("Connected to PostgreSQL");
      require("../model/associations/associations");
      // Basic sync (no alter) to avoid complex ALTER TABLE for all models
      return sequelize.sync();
    })
    .then(() => ensureChatSessionColumns())
    .then(() => ensureChatMessageColumns())
    .then(() => ensureLiveChatMessageColumns())
    .then(() => {
      console.log("All models synced");
      callback();
    })
    .catch((error) => {
      console.error("Error connecting to the database:", error);
      process.exit(1);
    });
};
module.exports = initDB;