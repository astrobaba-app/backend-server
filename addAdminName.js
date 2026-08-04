const { sequelize } = require("./dbConnection/dbConfig");
const { DataTypes } = require("sequelize");

const addAdminName = async () => {
  try {
    await sequelize.authenticate();
    console.log("Connected to DB.");

    const queryInterface = sequelize.getQueryInterface();

    console.log("Adding adminName to broadcast_logs...");
    await queryInterface.addColumn("broadcast_logs", "adminName", {
      type: DataTypes.STRING,
      allowNull: true,
      comment: "Snapshot of admin name at time of sending",
    });

    console.log("Column adminName added successfully.");
  } catch (error) {
    if (error.message.includes("already exists")) {
      console.log("Column already exists.");
    } else {
      console.error("Error adding column:", error.message);
    }
  } finally {
    process.exit();
  }
};

addAdminName();
