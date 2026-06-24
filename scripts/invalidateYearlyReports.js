const { sequelize } = require("../dbConnection/dbConfig");

async function invalidateYearlyReports() {
  try {
    await sequelize.authenticate();
    console.log("Database connected successfully.");

    // Delete all records in the yearly_reports table to invalidate the cache
    const deletedCount = await sequelize.query(
      `DELETE FROM "yearly_reports"`,
      { type: sequelize.QueryTypes.DELETE }
    );

    console.log("Successfully invalidated/cleared all cached yearly reports!");
    process.exit(0);
  } catch (error) {
    console.error("Error invalidating yearly reports:", error.message);
    process.exit(1);
  }
}

invalidateYearlyReports();
