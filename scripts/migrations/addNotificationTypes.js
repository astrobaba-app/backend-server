// Migration script to add new notification types to enum
// Run with: node backend-server/scripts/migrations/addNotificationTypes.js

require("dotenv").config();
const { sequelize } = require("../../dbConnection/dbConfig");

async function migrate() {
  console.log("🔄 Running migration: Add notification types...\n");

  try {
    // Add new enum values to notifications type
    const newTypes = ["admin_broadcast", "test"];
    
    for (const type of newTypes) {
      try {
        await sequelize.query(`
          ALTER TYPE enum_notifications_type ADD VALUE IF NOT EXISTS '${type}';
        `);
        console.log(`✓ Added notification type: ${type}`);
      } catch (error) {
        if (error.message.includes("already exists")) {
          console.log(`⚠ Type '${type}' already exists, skipping...`);
        } else {
          throw error;
        }
      }
    }

    console.log("\n✅ Migration completed successfully!");
    process.exit(0);
  } catch (error) {
    console.error("\n❌ Migration failed:", error.message);
    console.error("\nFull error:", error);
    process.exit(1);
  }
}

migrate();
