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
    
    // Fetch astro engine data
    const response = await axios.get(url, { params, timeout: 30000 });
    const horoscopeData = response.data.data;
    
    // Enhance with AI immediately
    let aiEnhanced = null;
    try {
      aiEnhanced = await enhanceHoroscopeWithAI({
        zodiacSign: capitalizedSign,
        period: period,
        horoscopeData: horoscopeData,
      });

      // Validation Guardrail: Prevent caching lazy/empty AI output
      if (aiEnhanced) {
        const isLazyTemplate = 
          aiEnhanced.category_scores?.love === 0 || 
          !aiEnhanced.detailed_readings?.love || 
          aiEnhanced.detailed_readings?.love.length < 10;

        if (isLazyTemplate) {
          console.warn(`[HoroscopeGen] ⚠️ AI returned empty/lazy template for ${capitalizedSign} ${period}. Rejecting payload.`);
          aiEnhanced = null; 
        } else {
          console.log(`[HoroscopeGen] AI enhancement successful and verified for ${capitalizedSign} ${period}`);
        }
      }

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
      await existing.update({
        horoscopeData: horoscopeData,
        aiEnhanced: aiEnhanced, 
        generatedAt: new Date(),
        validUntil: validUntil,
        isActive: true
      });
      cached = existing;
      console.log(`[HoroscopeGen] Updated ${period} cache for ${capitalizedSign}`);
    } else {
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
      console.log(`[HoroscopeGen] Created ${period} cache for ${capitalizedSign}`);
    }
    
    return cached;
  } catch (error) {
    console.error(`[HoroscopeGen] Error generating ${period} horoscope for ${zodiacSign}:`, error?.message || error);
    throw error;
  }
}

/**
 * Generate horoscopes for all zodiac signs for a given period IN PARALLEL
 */
async function generateAllHoroscopesForPeriod(period, date = new Date()) {
  console.log(`\n========================================`);
  console.log(`[HoroscopeGen] Starting PARALLEL ${period.toUpperCase()} generation for all 12 signs`);
  console.log(`[HoroscopeGen] Date: ${date.toISOString()}`);
  console.log(`========================================\n`);
  
  // =======================================================================
  // TEMPORARY WIPE: Clears all broken cache data from the database
  // TODO: REMOVE THIS LINE ONCE YOUR APP HAS FETCHED FRESH DATA SUCCESSFULLY
  // =======================================================================
  await CachedHoroscope.destroy({ where: {} }); 
  console.log(`[HoroscopeGen] 🗑️ DATABASE WIPED SUCCESSFULLY 🗑️`);

  const results = {
    success: [],
    failed: []
  };
  
  // Create an array of Promises that will all execute at the exact same time
  const generationPromises = ZODIAC_SIGNS.map(async (sign) => {
    try {
      await generateAndCacheHoroscope(sign, period, date);
      return { status: 'fulfilled', sign };
    } catch (error) {
      console.error(`[HoroscopeGen] Failed to generate ${period} for ${sign}:`, error?.message);
      return { status: 'rejected', sign, error: error?.message };
    }
  });

  // Wait for all 12 simultaneous requests to finish
  const outcomes = await Promise.all(generationPromises);

  // Sort the outcomes into success/failed arrays
  outcomes.forEach(outcome => {
    if (outcome.status === 'fulfilled') {
      results.success.push(outcome.sign);
    } else {
      results.failed.push({ sign: outcome.sign, error: outcome.error });
    }
  });
  
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
  
  const cached = await CachedHoroscope.findOne({
    where: {
      zodiacSign: zodiacSign.toLowerCase(),
      period: period,
      periodKey: periodKey,
      isActive: true
    }
  });
  
  // Guardrail: Ensure aiEnhanced exists AND love score is not 0
  if (cached && new Date(cached.validUntil) > new Date() && cached.aiEnhanced && cached.aiEnhanced.category_scores?.love !== 0) {
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
  
  console.log(`[HoroscopeGen] Cache miss or invalid AI data for ${zodiacSign} ${period} (${periodKey}). Generating...`);
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