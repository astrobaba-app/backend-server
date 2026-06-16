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
    let normalizedPeriod = period.charAt(0).toUpperCase() + period.slice(1).toLowerCase();

    // Default to 'Daily' if an unknown period is passed
    if (!GENERATORS[normalizedPeriod]) {
      console.warn(`[HoroscopeAI] Unknown period '${period}'. Defaulting to 'Daily'.`);
      normalizedPeriod = 'Daily';
    }

    // Build payload for AI without shadowing the logging context.
    const aiContext = {
      zodiacSign,
      period,
      date: horoscopeData.date || horoscopeData.start_date || horoscopeData.month || horoscopeData.year,
      moonPhase: horoscopeData.moon_phase,
      predictions: {
        overview: predictions.overall || predictions.overview,
        love: predictions.love || predictions.love_relationships,
        career: predictions.career || predictions.career_business,
        finance: predictions.finance || predictions.finance_wealth,
        health: predictions.health || predictions.health_wellness,
        emotions: predictions.emotions_mind,
        travel: predictions.travel_movement,
        personal: predictions.spiritual_growth,
      },
      luckyElements: horoscopeData.lucky_elements,
      remedies: horoscopeData.remedies,
    };

    const prompt = `You are an expert Vedic astrologer. Generate engaging, personalized horoscope narratives for ${zodiacSign} for their ${period} horoscope.

Context:
- Zodiac Sign: ${zodiacSign}
- Period: ${period}
- Date: ${aiContext.date}
- Moon Phase: ${aiContext.moonPhase || 'N/A'}

For each section below, create a 6-7 line narrative that:
1. Is warm, personal, and directly addresses the reader
2. Incorporates the key predictions and insights
3. Provides actionable advice and encouragement
4. Maintains an optimistic yet realistic tone
5. Uses conversational, easy-to-understand language

Sections to enhance:
1. Overview: ${JSON.stringify(aiContext.predictions.overview)}
2. Love & Relationships: ${JSON.stringify(aiContext.predictions.love)}
3. Personal Life: ${JSON.stringify(aiContext.predictions.personal)}
4. Career & Finance: ${JSON.stringify(aiContext.predictions.career)} + ${JSON.stringify(aiContext.predictions.finance)}
5. Health & Wellness: ${JSON.stringify(aiContext.predictions.health)}
6. Emotions & Mind: ${JSON.stringify(aiContext.predictions.emotions)}
7. Lucky Insights: ${JSON.stringify(aiContext.luckyElements)}
8. Travel & Movement: ${JSON.stringify(aiContext.predictions.travel)}
9. Remedies: ${JSON.stringify(aiContext.remedies)}`;

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