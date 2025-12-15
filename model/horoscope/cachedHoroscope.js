const { DataTypes } = require('sequelize');
const {sequelize} = require('../../dbConnection/dbConfig');

const CachedHoroscope = sequelize.define('CachedHoroscope', {
  id: {
    type: DataTypes.INTEGER,
    primaryKey: true,
    autoIncrement: true
  },
  zodiacSign: {
    type: DataTypes.STRING(20),
    allowNull: false,
    comment: 'Zodiac sign: aries, taurus, etc.'
  },
  period: {
    type: DataTypes.ENUM('daily', 'weekly', 'monthly', 'yearly'),
    allowNull: false,
    comment: 'Horoscope time period'
  },
  periodKey: {
    type: DataTypes.STRING(50),
    allowNull: false,
    comment: 'Unique identifier: YYYY-MM-DD for daily, YYYY-WW for weekly, YYYY-MM for monthly, YYYY for yearly'
  },
  horoscopeData: {
    type: DataTypes.JSON,
    allowNull: false,
    comment: 'Complete horoscope data from astro-engine'
  },
  aiEnhanced: {
    type: DataTypes.JSON,
    allowNull: true,
    comment: 'AI-enhanced narratives for all sections'
  },
  generatedAt: {
    type: DataTypes.DATE,
    allowNull: false,
    defaultValue: DataTypes.NOW,
    comment: 'When this horoscope was generated'
  },
  validUntil: {
    type: DataTypes.DATE,
    allowNull: false,
    comment: 'When this horoscope expires'
  },
  isActive: {
    type: DataTypes.BOOLEAN,
    defaultValue: true,
    comment: 'Whether this is the current active horoscope'
  }
}, {
  tableName: 'cached_horoscopes',
  timestamps: true,
  indexes: [
    {
      unique: true,
      fields: ['zodiacSign', 'period', 'periodKey']
    },
    {
      fields: ['period', 'periodKey', 'isActive']
    },
    {
      fields: ['validUntil']
    }
  ]
});

module.exports = CachedHoroscope;
