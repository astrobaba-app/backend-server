const { sequelize } = require("../dbConnection/dbConfig");
const addCategoriesFieldToAstrologer = require("./addCategoriesFieldToAstrologer");

async function runCategoriesMigration() {
  try {
    console.log("🔄 Starting migration: Add categories field to astrologers table...");
    console.log("================================================");

    // Run the migration
    await addCategoriesFieldToAstrologer.up(sequelize.getQueryInterface());

    console.log("================================================");
    console.log("✅ Migration completed successfully!");
    console.log("📋 The following changes were made:");
    console.log("   - Created enum type: enum_astrologers_categories");
    console.log("   - Added 'categories' column to astrologers table");
    console.log("   - Categories: Love, Relationship, Education, Health, Career, Finance, Marriage, Family, Business, Legal, Travel, Spiritual");
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
  runCategoriesMigration();
}

module.exports = runCategoriesMigration;
