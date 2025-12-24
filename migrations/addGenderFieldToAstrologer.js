const { Sequelize, DataTypes } = require("sequelize");

/**
 * Migration to add 'gender' field to astrologers table
 * This allows astrologers to specify their gender
 */
module.exports = {
  up: async (queryInterface) => {
    const transaction = await queryInterface.sequelize.transaction();
    
    try {
      // Step 1: Create the enum type for gender
      await queryInterface.sequelize.query(`
        DO $$ BEGIN
          CREATE TYPE enum_astrologers_gender AS ENUM (
            'Male',
            'Female',
            'Other'
          );
        EXCEPTION
          WHEN duplicate_object THEN null;
        END $$;
      `, { transaction });
      
      console.log("✅ Created enum_astrologers_gender enum type");

      // Step 2: Add the gender column
      await queryInterface.sequelize.query(`
        ALTER TABLE astrologers 
        ADD COLUMN IF NOT EXISTS gender enum_astrologers_gender;
      `, { transaction });
      
      console.log("✅ Added 'gender' column to astrologers table");

      // Step 3: Add comment to the column
      await queryInterface.sequelize.query(`
        COMMENT ON COLUMN astrologers.gender IS 'Gender of the astrologer: Male, Female, Other';
      `, { transaction });
      
      console.log("✅ Added comment to gender column");

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
      // Step 1: Remove the gender column
      await queryInterface.sequelize.query(`
        ALTER TABLE astrologers 
        DROP COLUMN IF EXISTS gender;
      `, { transaction });
      
      console.log("✅ Removed 'gender' column from astrologers table");

      // Step 2: Drop the enum type
      await queryInterface.sequelize.query(`
        DROP TYPE IF EXISTS enum_astrologers_gender;
      `, { transaction });
      
      console.log("✅ Dropped enum_astrologers_gender enum type");

      await transaction.commit();
      console.log("✅ Rollback completed successfully");
    } catch (error) {
      await transaction.rollback();
      console.error("❌ Rollback failed:", error);
      throw error;
    }
  },
};
