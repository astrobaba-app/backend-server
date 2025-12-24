const { sequelize } = require("../dbConnection/dbConfig");
const addGenderFieldToAstrologer = require("./addGenderFieldToAstrologer");

async function runGenderMigration() {
  try {
    console.log("🔄 Starting migration: Add gender field to astrologers table...");
    console.log("================================================");

    // Run the migration
    await addGenderFieldToAstrologer.up(sequelize.getQueryInterface());

    console.log("================================================");
    console.log("✅ Migration completed successfully!");
    console.log("📋 The following changes were made:");
    console.log("   - Created enum type: enum_astrologers_gender");
    console.log("   - Added 'gender' column to astrologers table");
    console.log("   - Valid values: Male, Female, Other");
    console.log("================================================");
    
    process.exit(0);
  } catch (error) {
    console.error("================================================");
    console.error("❌ Migration failed:", error.message);
    console.error("================================================");
    console.error(error);
    process.exit(1);
  }
}

// Check if script is being run directly
if (require.main === module) {
  runGenderMigration();
}

module.exports = runGenderMigration;
