const { Sequelize, DataTypes } = require("sequelize");

/**
 * Migration to add 'categories' field to astrologers table
 * This allows astrologers to select multiple consultation categories like Love, Relationship, Education, Health, etc.
 */
module.exports = {
  up: async (queryInterface) => {
    const transaction = await queryInterface.sequelize.transaction();
    
    try {
      // Step 1: Create the enum type for categories
      await queryInterface.sequelize.query(`
        DO $$ BEGIN
          CREATE TYPE enum_astrologers_categories AS ENUM (
            'Love',
            'Relationship',
            'Education',
            'Health',
            'Career',
            'Finance',
            'Marriage',
            'Family',
            'Business',
            'Legal',
            'Travel',
            'Spiritual'
          );
        EXCEPTION
          WHEN duplicate_object THEN null;
        END $$;
      `, { transaction });
      
      console.log("✅ Created enum_astrologers_categories enum type");

      // Step 2: Add the categories column as an array of enum values
      await queryInterface.sequelize.query(`
        ALTER TABLE astrologers 
        ADD COLUMN IF NOT EXISTS categories enum_astrologers_categories[] DEFAULT '{}' NOT NULL;
      `, { transaction });
      
      console.log("✅ Added 'categories' column to astrologers table");

      // Step 3: Add comment to the column
      await queryInterface.sequelize.query(`
        COMMENT ON COLUMN astrologers.categories IS 'Consultation categories: Love, Relationship, Education, Health, Career, Finance, Marriage, Family, Business, Legal, Travel, Spiritual';
      `, { transaction });
      
      console.log("✅ Added comment to categories column");

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
      // Step 1: Remove the categories column
      await queryInterface.sequelize.query(`
        ALTER TABLE astrologers 
        DROP COLUMN IF EXISTS categories;
      `, { transaction });
      
      console.log("✅ Removed 'categories' column from astrologers table");

      // Step 2: Drop the enum type
      await queryInterface.sequelize.query(`
        DROP TYPE IF EXISTS enum_astrologers_categories;
      `, { transaction });
      
      console.log("✅ Dropped enum_astrologers_categories enum type");

      await transaction.commit();
      console.log("✅ Rollback completed successfully");
    } catch (error) {
      await transaction.rollback();
      console.error("❌ Rollback failed:", error);
      throw error;
    }
  },
};
