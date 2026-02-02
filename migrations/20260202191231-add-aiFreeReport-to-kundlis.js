'use strict';

module.exports = {
  up: async (queryInterface, Sequelize) => {
    await queryInterface.addColumn('kundlis', 'aiFreeReport', {
      type: Sequelize.JSON,
      allowNull: true,
      comment: 'AI-generated narrative explanations for free report sections (generated async)',
    });
  },

  down: async (queryInterface, Sequelize) => {
    await queryInterface.removeColumn('kundlis', 'aiFreeReport');
  }
};
