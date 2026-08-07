require("dotenv").config();
const fs = require("fs");
const path = require("path");
const { sequelize } = require("../dbConnection/dbConfig");
const ContentBank = require("../model/horoscope/contentBank");

async function main() {
  const backupPath = path.join(__dirname, "../content_bank_backup.json");
  if (!fs.existsSync(backupPath)) {
    console.error(`Backup file not found at: ${backupPath}`);
    console.error("Please run 'node scripts/exportContentBank.js' first on the source database.");
    process.exit(1);
  }

  try {
    await sequelize.authenticate();
    console.log("Database connected successfully to target.");
    
    // Ensure table structure is synced
    await ContentBank.sync();

    console.log("Reading backup file...");
    const rawData = fs.readFileSync(backupPath, "utf8");
    const records = JSON.parse(rawData);
    console.log(`Found ${records.length} records to import.`);

    let importedCount = 0;
    for (const record of records) {
      const { key, category, text, version, tags } = record;
      // Upsert record using Sequelize
      await ContentBank.upsert({
        key,
        category,
        text,
        version: version || 1,
        tags: typeof tags === "string" ? JSON.parse(tags) : tags
      });
      importedCount++;
      if (importedCount % 100 === 0) {
        console.log(`Imported ${importedCount}/${records.length} records...`);
      }
    }
    console.log(`Import completed. Successfully imported/upserted ${importedCount} records.`);
  } catch (error) {
    console.error("Import failed:", error);
  } finally {
    await sequelize.close();
  }
}

main();
