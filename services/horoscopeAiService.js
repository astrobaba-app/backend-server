const {
  // Daily
  generateDailyHoroscopeReportForAries, generateDailyHoroscopeReportForTaurus, generateDailyHoroscopeReportForGemini, generateDailyHoroscopeReportForCancer,
  generateDailyHoroscopeReportForLeo, generateDailyHoroscopeReportForVirgo, generateDailyHoroscopeReportForLibra, generateDailyHoroscopeReportForScorpio,
  generateDailyHoroscopeReportForSagittarius, generateDailyHoroscopeReportForCapricorn, generateDailyHoroscopeReportForAquarius, generateDailyHoroscopeReportForPisces,
  
  // Weekly
  generateWeeklyHoroscopeReportForAries, generateWeeklyHoroscopeReportForTaurus, generateWeeklyHoroscopeReportForGemini, generateWeeklyHoroscopeReportForCancer,
  generateWeeklyHoroscopeReportForLeo, generateWeeklyHoroscopeReportForVirgo, generateWeeklyHoroscopeReportForLibra, generateWeeklyHoroscopeReportForScorpio,
  generateWeeklyHoroscopeReportForSagittarius, generateWeeklyHoroscopeReportForCapricorn, generateWeeklyHoroscopeReportForAquarius, generateWeeklyHoroscopeReportForPisces,

  // Monthly
  generateMonthlyHoroscopeReportForAries, generateMonthlyHoroscopeReportForTaurus, generateMonthlyHoroscopeReportForGemini, generateMonthlyHoroscopeReportForCancer,
  generateMonthlyHoroscopeReportForLeo, generateMonthlyHoroscopeReportForVirgo, generateMonthlyHoroscopeReportForLibra, generateMonthlyHoroscopeReportForScorpio,
  generateMonthlyHoroscopeReportForSagittarius, generateMonthlyHoroscopeReportForCapricorn, generateMonthlyHoroscopeReportForAquarius, generateMonthlyHoroscopeReportForPisces,

  // Yearly
  generateYearlyHoroscopeReportForAries, generateYearlyHoroscopeReportForTaurus, generateYearlyHoroscopeReportForGemini, generateYearlyHoroscopeReportForCancer,
  generateYearlyHoroscopeReportForLeo, generateYearlyHoroscopeReportForVirgo, generateYearlyHoroscopeReportForLibra, generateYearlyHoroscopeReportForScorpio,
  generateYearlyHoroscopeReportForSagittarius, generateYearlyHoroscopeReportForCapricorn, generateYearlyHoroscopeReportForAquarius, generateYearlyHoroscopeReportForPisces
} = require("../utils/horoscopeGenerator");

// A clean mapping object to route both the period and the sign to the correct function
const GENERATORS = {
  Daily: {
    Aries: generateDailyHoroscopeReportForAries,
    Taurus: generateDailyHoroscopeReportForTaurus,
    Gemini: generateDailyHoroscopeReportForGemini,
    Cancer: generateDailyHoroscopeReportForCancer,
    Leo: generateDailyHoroscopeReportForLeo,
    Virgo: generateDailyHoroscopeReportForVirgo,
    Libra: generateDailyHoroscopeReportForLibra,
    Scorpio: generateDailyHoroscopeReportForScorpio,
    Sagittarius: generateDailyHoroscopeReportForSagittarius,
    Capricorn: generateDailyHoroscopeReportForCapricorn,
    Aquarius: generateDailyHoroscopeReportForAquarius,
    Pisces: generateDailyHoroscopeReportForPisces
  },
  Weekly: {
    Aries: generateWeeklyHoroscopeReportForAries,
    Taurus: generateWeeklyHoroscopeReportForTaurus,
    Gemini: generateWeeklyHoroscopeReportForGemini,
    Cancer: generateWeeklyHoroscopeReportForCancer,
    Leo: generateWeeklyHoroscopeReportForLeo,
    Virgo: generateWeeklyHoroscopeReportForVirgo,
    Libra: generateWeeklyHoroscopeReportForLibra,
    Scorpio: generateWeeklyHoroscopeReportForScorpio,
    Sagittarius: generateWeeklyHoroscopeReportForSagittarius,
    Capricorn: generateWeeklyHoroscopeReportForCapricorn,
    Aquarius: generateWeeklyHoroscopeReportForAquarius,
    Pisces: generateWeeklyHoroscopeReportForPisces
  },
  Monthly: {
    Aries: generateMonthlyHoroscopeReportForAries,
    Taurus: generateMonthlyHoroscopeReportForTaurus,
    Gemini: generateMonthlyHoroscopeReportForGemini,
    Cancer: generateMonthlyHoroscopeReportForCancer,
    Leo: generateMonthlyHoroscopeReportForLeo,
    Virgo: generateMonthlyHoroscopeReportForVirgo,
    Libra: generateMonthlyHoroscopeReportForLibra,
    Scorpio: generateMonthlyHoroscopeReportForScorpio,
    Sagittarius: generateMonthlyHoroscopeReportForSagittarius,
    Capricorn: generateMonthlyHoroscopeReportForCapricorn,
    Aquarius: generateMonthlyHoroscopeReportForAquarius,
    Pisces: generateMonthlyHoroscopeReportForPisces
  },
  Yearly: {
    Aries: generateYearlyHoroscopeReportForAries,
    Taurus: generateYearlyHoroscopeReportForTaurus,
    Gemini: generateYearlyHoroscopeReportForGemini,
    Cancer: generateYearlyHoroscopeReportForCancer,
    Leo: generateYearlyHoroscopeReportForLeo,
    Virgo: generateYearlyHoroscopeReportForVirgo,
    Libra: generateYearlyHoroscopeReportForLibra,
    Scorpio: generateYearlyHoroscopeReportForScorpio,
    Sagittarius: generateYearlyHoroscopeReportForSagittarius,
    Capricorn: generateYearlyHoroscopeReportForCapricorn,
    Aquarius: generateYearlyHoroscopeReportForAquarius,
    Pisces: generateYearlyHoroscopeReportForPisces
  }
};

/**
 * Enhance horoscope data with AI-generated narratives.
 * Routes the raw data to the exact sign & period archetype generator.
 */
async function enhanceHoroscopeWithAI({ zodiacSign, period = 'Daily', horoscopeData, context = {} }) {
  try {
    if (!zodiacSign) {
      console.warn('[HoroscopeAI] No zodiac sign provided to enhancer');
      return null;
    }

    // Normalize strings to match the exact casing in our mapping object
    const normalizedSign = zodiacSign.charAt(0).toUpperCase() + zodiacSign.slice(1).toLowerCase();
    let normalizedPeriod = String(period || 'Daily');
    normalizedPeriod = normalizedPeriod.charAt(0).toUpperCase() + normalizedPeriod.slice(1).toLowerCase();

    // Default to 'Daily' if an unknown period is passed
    if (!GENERATORS[normalizedPeriod]) {
      console.warn(`[HoroscopeAI] Unknown period '${period}'. Defaulting to 'Daily'.`);
      normalizedPeriod = 'Daily';
    }

    if (!horoscopeData || typeof horoscopeData !== 'object') {
      console.warn('[HoroscopeAI] No valid horoscope data provided to enhancer');
      return null;
    }

    const generatorFunction = GENERATORS[normalizedPeriod][normalizedSign];
    if (!generatorFunction) {
      console.warn(`[HoroscopeAI] Unsupported zodiac sign '${zodiacSign}'.`);
      return null;
    }

    console.log(`[HoroscopeAI] Routing request to ${normalizedPeriod} generator for ${normalizedSign}...`);

    // Call the specific function and wait for the formatted JSON response
    const enhancedReport = await generatorFunction({
      period: normalizedPeriod,
      horoscopeData,
      context
    });

    if (!enhancedReport) {
      console.warn(`[HoroscopeAI] ${normalizedPeriod} generator for ${normalizedSign} failed to return a valid report.`);
      return null;
    }

    return enhancedReport;

  } catch (error) {
    console.error(`[HoroscopeAI] Enhancement routing failed for ${zodiacSign} (${period}):`, error?.message || error);
    
    // Return null instead of throwing to allow graceful degradation in your app
    return null;
  }
}

module.exports = {
  enhanceHoroscopeWithAI,
};
