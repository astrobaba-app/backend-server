const { sequelize } = require("../dbConnection/dbConfig");
const migration = require("./addTwoFactorFieldsToAdmin");

async function runMigration() {
  try {
    console.log("🚀 Starting Two-Factor Authentication migration...\n");

    // Create a queryInterface object
    const queryInterface = sequelize.getQueryInterface();

    // Run the migration
    await migration.up(queryInterface);

    console.log("\n✅ Two-Factor Authentication migration completed successfully!");
    console.log("📋 Changes applied:");
    console.log("   - Added 'twoFactorEnabled' column (BOOLEAN, default: false)");
    console.log("   - Added 'twoFactorSecret' column (VARCHAR(255))");
    
    process.exit(0);
  } catch (error) {
    console.error("\n❌ Migration failed:", error.message);
    console.error(error);
    process.exit(1);
  }
}

// Run the migration
runMigration();
