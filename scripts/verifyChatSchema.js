require("dotenv").config();

const { sequelize } = require("../dbConnection/dbConfig");
const ChatSession = require("../model/chat/chatSession");
const ChatMessage = require("../model/chat/chatMessage");
const { DataTypes } = require("sequelize");

async function ensureChatSessionSchema(queryInterface) {
  console.log("\nChecking chat_sessions table...");
  let table;
  try {
    table = await queryInterface.describeTable("chat_sessions");
  } catch (err) {
    console.log("chat_sessions table does not exist. Creating with ChatSession.sync()...");
    await ChatSession.sync();
    table = await queryInterface.describeTable("chat_sessions");
  }

  const missingColumns = [];

  const needed = {
    request_status: {
      type: DataTypes.ENUM("pending", "approved", "rejected"),
      allowNull: false,
      defaultValue: "pending",
    },
    last_message_preview: {
      type: DataTypes.STRING,
      allowNull: true,
    },
    last_message_at: {
      type: DataTypes.DATE,
      allowNull: true,
    },
    user_unread_count: {
      type: DataTypes.INTEGER,
      allowNull: false,
      defaultValue: 0,
    },
    astrologer_unread_count: {
      type: DataTypes.INTEGER,
      allowNull: false,
      defaultValue: 0,
    },
  };

  for (const [column, definition] of Object.entries(needed)) {
    if (!table[column]) {
      console.log(` - Missing column ${column}, adding...`);
      missingColumns.push(queryInterface.addColumn("chat_sessions", column, definition));
    }
  }

  if (missingColumns.length === 0) {
    console.log("chat_sessions schema looks OK.");
  } else {
    await Promise.all(missingColumns);
    console.log("chat_sessions schema updated.");
  }
}

async function ensureChatMessageSchema(queryInterface) {
  console.log("\nChecking chat_messages table...");
  let table;
  try {
    table = await queryInterface.describeTable("chat_messages");
  } catch (err) {
    console.log("chat_messages table does not exist. Creating with ChatMessage.sync()...");
    await ChatMessage.sync();
    table = await queryInterface.describeTable("chat_messages");
  }

  const missingColumns = [];

  const needed = {
    reply_to_message_id: {
      type: DataTypes.UUID,
      allowNull: true,
    },
    is_deleted: {
      type: DataTypes.BOOLEAN,
      allowNull: false,
      defaultValue: false,
    },
    deleted_at: {
      type: DataTypes.DATE,
      allowNull: true,
    },
  };

  for (const [column, definition] of Object.entries(needed)) {
    if (!table[column]) {
      console.log(` - Missing column ${column}, adding...`);
      missingColumns.push(queryInterface.addColumn("chat_messages", column, definition));
    }
  }

  if (missingColumns.length === 0) {
    console.log("chat_messages schema looks OK.");
  } else {
    await Promise.all(missingColumns);
    console.log("chat_messages schema updated.");
  }
}

async function main() {
  try {
    await sequelize.authenticate();
    console.log("Connected to database.");

    const queryInterface = sequelize.getQueryInterface();

    await ensureChatSessionSchema(queryInterface);
    await ensureChatMessageSchema(queryInterface);

    console.log("\nChat schema verification complete.\n");
  } catch (err) {
    console.error("Error verifying chat schema:", err);
  } finally {
    await sequelize.close();
  }
}

if (require.main === module) {
  main();
}
