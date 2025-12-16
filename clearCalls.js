// Quick script to clear active calls
const { sequelize } = require("./dbConnection/dbConfig");

async function clearActiveCalls() {
  try {
    await sequelize.authenticate();
    console.log("Database connected");

    const result = await sequelize.query(
      `UPDATE "call_sessions" SET status = 'cancelled' WHERE status IN ('initiated', 'ringing', 'ongoing', 'accepted')`,
      { type: sequelize.QueryTypes.UPDATE }
    );

    console.log("All active calls cancelled");
    process.exit(0);
  } catch (error) {
    console.error("Error:", error.message);
    process.exit(1);
  }
}

clearActiveCalls();
