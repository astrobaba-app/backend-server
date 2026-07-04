require("dotenv").config();
const fs = require("fs");
const path = require("path");
const { sequelize } = require("../dbConnection/dbConfig");
const ContentBank = require("../model/horoscope/contentBank");

async function main() {
  try {
    await sequelize.authenticate();
    console.log("Database connected successfully.");
    
    console.log("Fetching content bank records from database...");
    const records = await ContentBank.findAll({ raw: true });
    console.log(`Found ${records.length} records.`);
    
    const outputPath = path.join(__dirname, "../content_bank_backup.json");
    fs.writeFileSync(outputPath, JSON.stringify(records, null, 2), "utf8");
    console.log(`Exported successfully to: ${outputPath}`);
  } catch (error) {
    console.error("Export failed:", error);
  } finally {
    await sequelize.close();
  }
}

main();
