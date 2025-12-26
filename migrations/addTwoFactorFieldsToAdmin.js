const { Sequelize, DataTypes } = require("sequelize");

/**
 * Migration to add Two-Factor Authentication fields to admins table
 * This enables Google Authenticator based 2FA for admin accounts
 */
module.exports = {
  up: async (queryInterface) => {
    const transaction = await queryInterface.sequelize.transaction();
    
    try {
      console.log("🔄 Starting migration: Add 2FA fields to admins table...");

      // Step 1: Add twoFactorEnabled column
      await queryInterface.sequelize.query(`
        ALTER TABLE admins 
        ADD COLUMN IF NOT EXISTS "twoFactorEnabled" BOOLEAN DEFAULT false;
      `, { transaction });
      
      console.log("✅ Added 'twoFactorEnabled' column to admins table");

      // Step 2: Add twoFactorSecret column
      await queryInterface.sequelize.query(`
        ALTER TABLE admins 
        ADD COLUMN IF NOT EXISTS "twoFactorSecret" VARCHAR(255);
      `, { transaction });
      
      console.log("✅ Added 'twoFactorSecret' column to admins table");

      // Step 3: Add comments to the columns
      await queryInterface.sequelize.query(`
        COMMENT ON COLUMN admins."twoFactorEnabled" IS 'Indicates if Two-Factor Authentication is enabled for this admin';
      `, { transaction });
      
      await queryInterface.sequelize.query(`
        COMMENT ON COLUMN admins."twoFactorSecret" IS 'Secret key for Google Authenticator TOTP generation';
      `, { transaction });
      
      console.log("✅ Added comments to 2FA columns");

      await transaction.commit();
      console.log("✅ Migration completed successfully");
    } catch (error) {
      await transaction.rollback();
      console.error("❌ Migration failed:", error);
      throw error;
    }
  },

  down: async (queryInterface) => {
    const transaction = await queryInterface.sequelize.transaction();
    
    try {
      console.log("🔄 Rolling back migration: Remove 2FA fields from admins table...");

      // Remove the columns in reverse order
      await queryInterface.sequelize.query(`
        ALTER TABLE admins 
        DROP COLUMN IF EXISTS "twoFactorSecret";
      `, { transaction });
      
      console.log("✅ Removed 'twoFactorSecret' column");

      await queryInterface.sequelize.query(`
        ALTER TABLE admins 
        DROP COLUMN IF EXISTS "twoFactorEnabled";
      `, { transaction });
      
      console.log("✅ Removed 'twoFactorEnabled' column");

      await transaction.commit();
      console.log("✅ Rollback completed successfully");
    } catch (error) {
      await transaction.rollback();
      console.error("❌ Rollback failed:", error);
      throw error;
    }
  }
};
