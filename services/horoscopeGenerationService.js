const axios = require('axios');
const { enhanceHoroscopeWithAI } = require('./horoscopeAiService');
const CachedHoroscope = require('../model/horoscope/cachedHoroscope');

const ASTRO_ENGINE_BASE_URL = process.env.ASTRO_ENGINE_URL || 'http://localhost:8000/api/v1';

const ZODIAC_SIGNS = [
  'aries', 'taurus', 'gemini', 'cancer',
  'leo', 'virgo', 'libra', 'scorpio',
  'sagittarius', 'capricorn', 'aquarius', 'pisces'
];

/*
 * Generate period key for caching
 */
function getPeriodKey(period, date = new Date()) {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, '0');
  const day = String(date.getDate()).padStart(2, '0');
  
  switch (period) {
    case 'daily':
      return `${year}-${month}-${day}`;
    case 'weekly':
      // ISO week number
      const weekNum = getWeekNumber(date);
      return `${year}-W${String(weekNum).padStart(2, '0')}`;
    case 'monthly':
      return `${year}-${month}`;
    case 'yearly':
      return `${year}`;
    default:
      return `${year}-${month}-${day}`;
  }
}

/**
 * Get ISO week number
 */
function getWeekNumber(date) {
  const d = new Date(Date.UTC(date.getFullYear(), date.getMonth(), date.getDate()));
  const dayNum = d.getUTCDay() || 7;
  d.setUTCDate(d.getUTCDate() + 4 - dayNum);
  const yearStart = new Date(Date.UTC(d.getUTCFullYear(), 0, 1));
  return Math.ceil((((d - yearStart) / 86400000) + 1) / 7);
}

/**
 * Calculate valid until date
 */
function getValidUntilDate(period, date = new Date()) {
  const validUntil = new Date(date);
  
  switch (period) {
    case 'daily':
      // Valid until next midnight
      validUntil.setDate(validUntil.getDate() + 1);
      validUntil.setHours(0, 0, 0, 0);
      break;
    case 'weekly':
      // Valid until next Sunday midnight
      const daysUntilSunday = (7 - validUntil.getDay()) % 7 || 7;
      validUntil.setDate(validUntil.getDate() + daysUntilSunday);
      validUntil.setHours(0, 0, 0, 0);
      break;
    case 'monthly':
      // Valid until next month
      validUntil.setMonth(validUntil.getMonth() + 1);
      validUntil.setDate(1);
      validUntil.setHours(0, 0, 0, 0);
      break;
    case 'yearly':
      // Valid until next year
      validUntil.setFullYear(validUntil.getFullYear() + 1);
      validUntil.setMonth(0);
      validUntil.setDate(1);
      validUntil.setHours(0, 0, 0, 0);
      break;
  }
  
  return validUntil;
}

/**
 * Generate and cache horoscope for a single sign and period
 */
async function generateAndCacheHoroscope(zodiacSign, period, date = new Date()) {
  try {
    const capitalizedSign = zodiacSign.charAt(0).toUpperCase() + zodiacSign.slice(1).toLowerCase();
    const periodKey = getPeriodKey(period, date);
    
    console.log(`[HoroscopeGen] Generating ${period} horoscope for ${capitalizedSign} (${periodKey})`);
    
    // Fetch from astro-engine
    let url, params = {};
    const dateStr = date.toISOString().split('T')[0];
    
    switch (period) {
      case 'daily':
        url = `${ASTRO_ENGINE_BASE_URL}/horoscope/daily/${capitalizedSign}`;
        params = { date: dateStr };
        break;
      case 'weekly':
        url = `${ASTRO_ENGINE_BASE_URL}/horoscope/weekly/${capitalizedSign}`;
        params = { start_date: dateStr };
        break;
      case 'monthly':
        url = `${ASTRO_ENGINE_BASE_URL}/horoscope/monthly/${capitalizedSign}`;
        params = { year: date.getFullYear(), month: date.getMonth() + 1 };
        break;
      case 'yearly':
        url = `${ASTRO_ENGINE_BASE_URL}/horoscope/yearly/${capitalizedSign}`;
        params = { year: date.getFullYear() };
        break;
      default:
        throw new Error(`Invalid period: ${period}`);
    }
    
    const response = await axios.get(url, { params, timeout: 30000 });
    const horoscopeData = response.data.data;
    
    // Enhance with AI
    let aiEnhanced = null;
    try {
      aiEnhanced = await enhanceHoroscopeWithAI({
        zodiacSign: capitalizedSign,
        period: period,
        horoscopeData: horoscopeData,
      });
      console.log(`[HoroscopeGen] AI enhancement successful for ${capitalizedSign} ${period}`);
    } catch (aiErr) {
      console.error(`[HoroscopeGen] AI enhancement failed for ${capitalizedSign} ${period}:`, aiErr?.message);
    }
    
    // Calculate valid until
    const validUntil = getValidUntilDate(period, date);
    
    // Check if entry already exists
    const existing = await CachedHoroscope.findOne({
      where: {
        zodiacSign: zodiacSign.toLowerCase(),
        period: period,
        periodKey: periodKey
      }
    });
    
    let cached;
    if (existing) {
      // Update existing entry
      await existing.update({
        horoscopeData: horoscopeData,
        aiEnhanced: aiEnhanced,
        generatedAt: new Date(),
        validUntil: validUntil,
        isActive: true
      });
      cached = existing;
      console.log(`[HoroscopeGen] Updated ${period} horoscope for ${capitalizedSign} (${periodKey})`);
    } else {
      // Create new entry
      cached = await CachedHoroscope.create({
        zodiacSign: zodiacSign.toLowerCase(),
        period: period,
        periodKey: periodKey,
        horoscopeData: horoscopeData,
        aiEnhanced: aiEnhanced,
        generatedAt: new Date(),
        validUntil: validUntil,
        isActive: true
      });
      console.log(`[HoroscopeGen] Created ${period} horoscope for ${capitalizedSign} (${periodKey})`);
    }
    
    console.log(`[HoroscopeGen] Cached ${period} horoscope for ${capitalizedSign} until ${validUntil.toISOString()}`);
    
    return cached;
  } catch (error) {
    console.error(`[HoroscopeGen] Error generating ${period} horoscope for ${zodiacSign}:`, error?.message || error);
    throw error;
  }
}

/**
 * Generate horoscopes for all zodiac signs for a given period
 */
async function generateAllHoroscopesForPeriod(period, date = new Date()) {
  console.log(`\n========================================`);
  console.log(`[HoroscopeGen] Starting ${period.toUpperCase()} horoscope generation for all signs`);
  console.log(`[HoroscopeGen] Date: ${date.toISOString()}`);
  console.log(`========================================\n`);
  
  const results = {
    success: [],
    failed: []
  };
  
  for (const sign of ZODIAC_SIGNS) {
    try {
      await generateAndCacheHoroscope(sign, period, date);
      results.success.push(sign);
      
      // Add small delay to avoid overwhelming the astro-engine
      await new Promise(resolve => setTimeout(resolve, 500));
    } catch (error) {
      console.error(`[HoroscopeGen] Failed to generate ${period} for ${sign}:`, error?.message);
      results.failed.push({ sign, error: error?.message });
    }
  }
  
  console.log(`\n========================================`);
  console.log(`[HoroscopeGen] ${period.toUpperCase()} generation complete`);
  console.log(`[HoroscopeGen] Success: ${results.success.length}/${ZODIAC_SIGNS.length}`);
  console.log(`[HoroscopeGen] Failed: ${results.failed.length}`);
  if (results.failed.length > 0) {
    console.log(`[HoroscopeGen] Failed signs:`, results.failed.map(f => f.sign).join(', '));
  }
  console.log(`========================================\n`);
  
  return results;
}

/**
 * Get cached horoscope or generate if not available
 */
async function getCachedHoroscope(zodiacSign, period, date = new Date()) {
  const periodKey = getPeriodKey(period, date);
  
  // Try to get from cache
  const cached = await CachedHoroscope.findOne({
    where: {
      zodiacSign: zodiacSign.toLowerCase(),
      period: period,
      periodKey: periodKey,
      isActive: true
    }
  });
  
  if (cached && new Date(cached.validUntil) > new Date()) {
    console.log(`[HoroscopeGen] Serving cached ${period} horoscope for ${zodiacSign} (${periodKey})`);
    return {
      success: true,
      zodiacSign: zodiacSign.toLowerCase(),
      horoscope: {
        ...cached.horoscopeData,
        ai_enhanced: cached.aiEnhanced
      },
      cached: true,
      generatedAt: cached.generatedAt,
      validUntil: cached.validUntil
    };
  }
  
  // Not in cache or expired - generate new
  console.log(`[HoroscopeGen] Cache miss for ${zodiacSign} ${period} (${periodKey}). Generating...`);
  try {
    const newCache = await generateAndCacheHoroscope(zodiacSign, period, date);
    return {
      success: true,
      zodiacSign: zodiacSign.toLowerCase(),
      horoscope: {
        ...newCache.horoscopeData,
        ai_enhanced: newCache.aiEnhanced
      },
      cached: false,
      generatedAt: newCache.generatedAt,
      validUntil: newCache.validUntil
    };
  } catch (error) {
    throw error;
  }
}

/**
 * Clean up old/expired horoscopes
 */
async function cleanupExpiredHoroscopes() {
  try {
    const deleted = await CachedHoroscope.destroy({
      where: {
        validUntil: {
          [require('sequelize').Op.lt]: new Date()
        }
      }
    });
    console.log(`[HoroscopeGen] Cleaned up ${deleted} expired horoscope(s)`);
    return deleted;
  } catch (error) {
    console.error('[HoroscopeGen] Error cleaning up expired horoscopes:', error);
    throw error;
  }
}

module.exports = {
  generateAndCacheHoroscope,
  generateAllHoroscopesForPeriod,
  getCachedHoroscope,
  cleanupExpiredHoroscopes,
  getPeriodKey
};
