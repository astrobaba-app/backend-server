const { sequelize } = require("../dbConnection/dbConfig");

async function runMigration() {
  try {
    console.log("🔄 Running migration: Add astrologer_online notification type...");

    await sequelize.query(`
      ALTER TYPE "enum_notifications_type" 
      ADD VALUE IF NOT EXISTS 'astrologer_online';
    `);

    console.log("✅ Migration completed: Added 'astrologer_online' to notification type enum");
    process.exit(0);
  } catch (error) {
    console.error("❌ Migration failed:", error.message);
    process.exit(1);
  }
}

runMigration();
