/**
 * Migration script to add sender_role column to live_chat_messages table
 * Run this once in production: node scripts/addSenderRoleColumn.js
 */

require("dotenv").config();
const { sequelize } = require("../dbConnection/dbConfig");

async function addSenderRoleColumn() {
  try {
    console.log("Connecting to database...");
    await sequelize.authenticate();
    console.log("✓ Connected to database");

    // Check if table exists
    const [tables] = await sequelize.query(
      "SELECT table_name FROM information_schema.tables WHERE table_schema = 'public' AND table_name = 'live_chat_messages'"
    );

    if (tables.length === 0) {
      console.log("✓ live_chat_messages table doesn't exist yet - will be created on server start");
      process.exit(0);
    }

    console.log("Checking if sender_role column exists...");

    // Check if column exists
    const [columns] = await sequelize.query(
      "SELECT column_name FROM information_schema.columns WHERE table_name = 'live_chat_messages' AND column_name = 'sender_role'"
    );

    if (columns.length > 0) {
      console.log("✓ sender_role column already exists");
      process.exit(0);
    }

    console.log("Creating sender_role enum type...");

    // Create enum type if it doesn't exist
    await sequelize.query(`
      DO $$ BEGIN
        CREATE TYPE enum_live_chat_messages_sender_role AS ENUM ('user', 'astrologer');
      EXCEPTION
        WHEN duplicate_object THEN null;
      END $$;
    `);

    console.log("Adding sender_role column...");

    // Add the column
    await sequelize.query(`
      ALTER TABLE live_chat_messages 
      ADD COLUMN sender_role enum_live_chat_messages_sender_role;
    `);

    console.log("✓ Successfully added sender_role column");

    // Update existing records - try to infer from userId if possible
    console.log("Updating existing records...");
    const [updateResult] = await sequelize.query(`
      UPDATE live_chat_messages 
      SET sender_role = CASE 
        WHEN EXISTS (SELECT 1 FROM astrologers WHERE id = live_chat_messages."userId") THEN 'astrologer'::enum_live_chat_messages_sender_role
        ELSE 'user'::enum_live_chat_messages_sender_role
      END
      WHERE sender_role IS NULL
    `);

    console.log(`✓ Updated ${updateResult} existing records`);

    console.log("\n✅ Migration completed successfully!");
    process.exit(0);
  } catch (error) {
    console.error("❌ Migration failed:", error);
    process.exit(1);
  }
}

addSenderRoleColumn();
