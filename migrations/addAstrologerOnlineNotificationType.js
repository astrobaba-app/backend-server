const { Sequelize } = require("sequelize");

/**
 * Migration to add 'astrologer_online' type to notification enum
 */
module.exports = {
  up: async (queryInterface) => {
    await queryInterface.sequelize.query(`
      ALTER TYPE "enum_notifications_type" 
      ADD VALUE IF NOT EXISTS 'astrologer_online';
    `);
    console.log("✅ Added 'astrologer_online' to notification type enum");
  },

  down: async (queryInterface) => {
    // Note: PostgreSQL doesn't support removing enum values directly
    // You would need to recreate the enum type if rollback is needed
    console.log("⚠️  Cannot remove enum value in PostgreSQL without recreating the type");
  },
};
