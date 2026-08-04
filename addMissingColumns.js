const { sequelize } = require("./dbConnection/dbConfig");
const { DataTypes } = require("sequelize");

const addMissingColumns = async () => {
  try {
    await sequelize.authenticate();
    console.log("Connected to DB.");

    const queryInterface = sequelize.getQueryInterface();

    const tables = ["broadcast_logs", "astrologer_broadcast_logs"];
    const columns = [
      { name: "adminName", type: DataTypes.STRING, allowNull: true },
      { name: "actionUrl", type: DataTypes.STRING, allowNull: true },
      { name: "pushSuccessCount", type: DataTypes.INTEGER, allowNull: false, defaultValue: 0 },
      { name: "pushFailureCount", type: DataTypes.INTEGER, allowNull: false, defaultValue: 0 },
      { name: "pushPendingCount", type: DataTypes.INTEGER, allowNull: false, defaultValue: 0 },
      { name: "targetMode", type: DataTypes.STRING, allowNull: false, defaultValue: "all" },
      { name: "targetUserIds", type: DataTypes.JSON, allowNull: true }
    ];

    for (const table of tables) {
      for (const col of columns) {
        console.log(`Adding ${col.name} to ${table}...`);
        try {
          await queryInterface.addColumn(table, col.name, {
            type: col.type,
            allowNull: col.allowNull,
            defaultValue: col.defaultValue
          });
          console.log(`Column ${col.name} added successfully to ${table}.`);
        } catch (error) {
          if (error.message.includes("already exists")) {
            console.log(`Column ${col.name} already exists in ${table}.`);
          } else {
            console.error(`Error adding ${col.name} to ${table}:`, error.message);
          }
        }
      }
    }
  } catch (error) {
    console.error("Error:", error);
  } finally {
    process.exit();
  }
};

addMissingColumns();
