import { createChatCompletion } from "../services/openaiClient.js";
const CHAT_MODEL = process.env.OPENAI_CHAT_MODEL || "gpt-4o-mini";

const SIGN_ORDER = [
  "Aries", "Taurus", "Gemini", "Cancer", "Leo", "Virgo",
  "Libra", "Scorpio", "Sagittarius", "Capricorn", "Aquarius", "Pisces"
];

function getHouseFromSign(transitSign, birthSign) {
  const from = SIGN_ORDER.indexOf(transitSign);
  const to = SIGN_ORDER.indexOf(birthSign);
  if (from === -1 || to === -1) return null;
  return ((from - to + 12) % 12) + 1;
}

function compactPlanet(planet, birthSign) {
  if (!planet) return null;

  return {
    sign: planet.sign ?? null,
    degree: typeof planet.degree === "number" ? Number(planet.degree.toFixed(2)) : null,
    nakshatra: planet.nakshatra?.name ?? planet.nakshatra ?? null,
    retrograde: Boolean(planet.is_retrograde),
    house_from_sign: getHouseFromSign(planet.sign, birthSign),
  };
}

// Shared Payload Builder for Daily, Weekly, Monthly, and Yearly
function buildPayloadForSign(fullData, sign) {
  const t = fullData?.transits || {};
  const l = fullData?.lord_position || {};
  const lucky = fullData?.lucky_elements || {};
  const preds = fullData?.predictions || {};
  const remedies = fullData?.remedies || [];

  // Convert the 1-5 engine rating to a 0-100 scale for the LLM
  const toScore = (rating) => (rating ? rating * 20 : 50);

  return {
    sign,
    date: fullData?.date ?? null,
    start_date: fullData?.start_date ?? null,
    end_date: fullData?.end_date ?? null,
    month: fullData?.month ?? null,
    year: fullData?.year ?? null,
    period: fullData?.period ?? "Daily",
    moon_phase: fullData?.moon_phase ?? null,
    sign_lord: fullData?.sign_lord ?? null,

    lord_position: {
      sign: l.sign ?? null,
      nakshatra: l.nakshatra ?? null,
      retrograde: Boolean(l.retrograde),
      house_from_sign: l.sign ? getHouseFromSign(l.sign, sign) : null,
    },

    key_planets: {
      Sun: compactPlanet(t.Sun, sign),
      Moon: compactPlanet(t.Moon, sign),
      Mars: compactPlanet(t.Mars, sign),
      Mercury: compactPlanet(t.Mercury, sign),
      Jupiter: compactPlanet(t.Jupiter, sign),
      Venus: compactPlanet(t.Venus, sign),
      Saturn: compactPlanet(t.Saturn, sign),
      Rahu: compactPlanet(t.Rahu, sign),
      Ketu: compactPlanet(t.Ketu, sign),
    },

    transit_strengths: fullData?.transit_strengths ?? {},
    
    // Pass engine lucky elements directly
    lucky_elements: {
      colors: lucky.colors ?? [lucky.color],
      number: lucky.number ?? null,
      time: lucky.time ?? null,
      direction: lucky.direction ?? null,
    },

    remedies: remedies,

    base_predictions: {
      overall_score: toScore(preds.overall?.rating),
      overall_summary: preds.overall?.summary ?? "",
      career_score: toScore(preds.career?.rating),
      career_summary: `${preds.career?.prediction || ''} ${preds.career?.advice || ''}`.trim(),
      love_score: toScore(preds.love?.rating),
      love_summary: `${preds.love?.prediction || ''} ${preds.love?.advice || ''}`.trim(),
      finance_score: toScore(preds.finance?.rating),
      finance_summary: `${preds.finance?.prediction || ''} ${preds.finance?.advice || ''}`.trim(),
      health_score: toScore(preds.health?.rating),
      health_summary: `${preds.health?.prediction || ''} ${preds.health?.advice || ''}`.trim(),
      energy_score: toScore(preds.emotions_mind?.rating),
      emotions_summary: `${preds.emotions_mind?.summary || ''} ${preds.emotions_mind?.advice || ''}`.trim(),
    }
  };
}

// =========================================================================
// 1. CORE ENGINE: DAILY HOROSCOPE
// =========================================================================
async function coreGenerateDailyHoroscope({ sign, symbol, dateRange, element, archetype, period = 'Daily', horoscopeData, context = {} }) {
  try {
    const loggingContext = { feature: `horoscope_ai_daily_${sign.toLowerCase()}`, ...context };
    const astroPayload = buildPayloadForSign(horoscopeData, sign);

    const prompt = `You are an expert, premium Vedic astrologer writing for a highly engaging mobile app. 
Your goal is to generate a dynamic, 800–1000 word DAILY horoscope for ${sign}.

=========================================
${sign.toUpperCase()} ARCHETYPE & TONE ANCHOR:
- Element: ${element} (${archetype}).
- Tone: Deeply insightful, authentic, extremely specific, and brutally honest when necessary.
=========================================

Current Engine Payload Context:
- Sign: ${sign} ${symbol}
- Astrological Data: 
${JSON.stringify(astroPayload, null, 2)}

=========================================
CRITICAL RULES FOR HIGH QUALITY (STRICTLY ENFORCED):
1. STRICT SCORE-DRIVEN NARRATIVE: Use the 0-100 scores provided in 'base_predictions' to dictate the tone.
2. BAN ON AI CLICHES & GENERIC LANGUAGE: No "practice mindfulness", "avoid impulsive decisions". Use real-world examples.
3. FULL THEMATIC WEAVING: Generate a specific 'focus_area' and weave it heavily throughout.
4. ASTROLOGICAL GROUNDING: Explicitly connect specific planets to your predictions.
5. LUCKY DATA & REMEDIES: Use exact engine lucky data. Integrate remedies into advice.
6. COMPATIBILITY ALIGNMENT: 'daily_match.compatible_sign' MUST be the highest scored sign.
=========================================

INSTRUCTIONS FOR JSON OUTPUT:
Return strict, valid JSON. DO NOT NEST 'compatibility', 'advice', or 'cautions'. Use exact requested sentence lengths.

EXPECTED JSON SCHEMA:
{
  "meta": { "sign": "${sign}", "symbol": "${symbol}", "date_range": "${dateRange}", "element": "${element}", "ruling_planet": "", "moon_phase": "" },
  "mood": { "emoji": "", "label": "" },
  "focus_area": "",
  "category_scores": { "love": 0, "career": 0, "money": 0, "health": 0, "energy": 0 },
  "quick_tips": { "relationship": "", "career": "" },
  "daily_match": { "compatible_sign": "", "challenging_sign": "" },
  "planetary_summary": "",
  "overview": "",
  "lucky_insights": { "colors": [], "number": 0, "alphabet": "", "time": "", "direction": "", "activity": "" },
  "detailed_readings": { "love": "", "career": "", "finance": "", "emotions": "", "health": "", "travel": "" },
  "extended_readings": { "career_deep_dive": "", "love_deep_dive": "", "luck_deep_dive": "", "emotional_deep_dive": "", "health_deep_dive": "" },
  "compatibility": { "Aries": 0, "Taurus": 0, "Gemini": 0, "Cancer": 0, "Leo": 0, "Virgo": 0, "Libra": 0, "Scorpio": 0, "Sagittarius": 0, "Capricorn": 0, "Aquarius": 0, "Pisces": 0 },
  "advice": [ "", "", "" ],
  "cautions": [ "", "" ],
  "closing_motivation": ""
}`;

    const response = await createChatCompletion({
      model: CHAT_MODEL, 
      messages: [
        { role: "system", content: "You are an elite Vedic astrologer writing long-form daily content. You never use cliches." },
        { role: "user", content: prompt }
      ],
      temperature: 0.75, max_tokens: 3800, response_format: { type: "json_object" } 
    }, loggingContext);

    const content = response?.choices?.[0]?.message?.content?.trim();
    if (!content) return null;
    return JSON.parse(content);
  } catch (error) {
    console.error(`[HoroscopeAI] Daily error for ${sign}:`, error?.message || error);
    return null;
  }
}

// =========================================================================
// 2. CORE ENGINE: WEEKLY HOROSCOPE
// =========================================================================
async function coreGenerateWeeklyHoroscope({ sign, symbol, dateRange, element, archetype, period = 'Weekly', horoscopeData, context = {} }) {
  try {
    const loggingContext = { feature: `horoscope_ai_weekly_${sign.toLowerCase()}`, ...context };
    const astroPayload = buildPayloadForSign(horoscopeData, sign);

    const prompt = `You are an expert, premium Vedic astrologer writing for a highly engaging mobile app. 
Your goal is to generate a dynamic, 800–1000 word WEEKLY horoscope for ${sign}.

=========================================
${sign.toUpperCase()} ARCHETYPE & TONE ANCHOR:
- Element: ${element} (${archetype}).
- Tone: Deeply insightful, authentic, extremely specific, and brutally honest when necessary. Focus on a 7-day arc.
=========================================

Current Engine Payload Context:
- Sign: ${sign} ${symbol}
- Astrological Data: 
${JSON.stringify(astroPayload, null, 2)}

=========================================
CRITICAL RULES FOR HIGH QUALITY (STRICTLY ENFORCED):
1. STRICT SCORE-DRIVEN NARRATIVE: Use the 0-100 scores to dictate the tone for the ENTIRE WEEK.
2. BAN ON AI CLICHES & GENERIC LANGUAGE: No "practice mindfulness". Use real-world examples (e.g. "Thursday is critical for contracts").
3. FULL THEMATIC WEAVING: Generate a 'focus_area' for the week and weave it heavily throughout.
4. ASTROLOGICAL GROUNDING: Explain how transits shape the week.
5. LUCKY DATA & REMEDIES: Use exact engine lucky data.
6. COMPATIBILITY ALIGNMENT: 'daily_match' must match the highest/lowest compatibility scores for the week.
=========================================

INSTRUCTIONS FOR JSON OUTPUT:
Return strict, valid JSON. Use exact requested sentence lengths. Keep arrays and objects at the ROOT LEVEL.

EXPECTED JSON SCHEMA:
{
  "meta": { "sign": "${sign}", "symbol": "${symbol}", "date_range": "${dateRange}", "element": "${element}", "ruling_planet": "", "moon_phase": "" },
  "mood": { "emoji": "", "label": "" },
  "focus_area": "",
  "category_scores": { "love": 0, "career": 0, "money": 0, "health": 0, "energy": 0 },
  "quick_tips": { "relationship": "", "career": "" },
  "daily_match": { "compatible_sign": "", "challenging_sign": "" },
  "planetary_summary": "",
  "overview": "",
  "lucky_insights": { "colors": [], "number": 0, "alphabet": "", "time": "", "direction": "", "activity": "" },
  "detailed_readings": { "love": "", "career": "", "finance": "", "emotions": "", "health": "", "travel": "" },
  "extended_readings": { "career_deep_dive": "", "love_deep_dive": "", "luck_deep_dive": "", "emotional_deep_dive": "", "health_deep_dive": "" },
  "compatibility": { "Aries": 0, "Taurus": 0, "Gemini": 0, "Cancer": 0, "Leo": 0, "Virgo": 0, "Libra": 0, "Scorpio": 0, "Sagittarius": 0, "Capricorn": 0, "Aquarius": 0, "Pisces": 0 },
  "advice": [ "", "", "" ],
  "cautions": [ "", "" ],
  "closing_motivation": ""
}`;

    const response = await createChatCompletion({
      model: CHAT_MODEL, 
      messages: [
        { role: "system", content: "You are an elite Vedic astrologer focusing on weekly 7-day trends. You write highly specific, concrete, long-form paragraphs." },
        { role: "user", content: prompt }
      ],
      temperature: 0.75, max_tokens: 3800, response_format: { type: "json_object" } 
    }, loggingContext);

    const content = response?.choices?.[0]?.message?.content?.trim();
    if (!content) return null;
    return JSON.parse(content);
  } catch (error) {
    console.error(`[HoroscopeAI] Weekly error for ${sign}:`, error?.message || error);
    return null;
  }
}

// =========================================================================
// 3. CORE ENGINE: MONTHLY HOROSCOPE
// =========================================================================
async function coreGenerateMonthlyHoroscope({ sign, symbol, dateRange, element, archetype, period = 'Monthly', horoscopeData, context = {} }) {
  try {
    const loggingContext = { feature: `horoscope_ai_monthly_${sign.toLowerCase()}`, ...context };
    const astroPayload = buildPayloadForSign(horoscopeData, sign);

    const prompt = `You are an expert, premium Vedic astrologer writing for a highly engaging mobile app. 
Your goal is to generate a dynamic, 800–1000 word MONTHLY horoscope for ${sign}.

=========================================
${sign.toUpperCase()} ARCHETYPE & TONE ANCHOR:
- Element: ${element} (${archetype}).
- Tone: Deeply insightful, authentic, extremely specific, and brutally honest when necessary. Focus on a 30-day arc.
=========================================

Current Engine Payload Context:
- Sign: ${sign} ${symbol}
- Astrological Data: 
${JSON.stringify(astroPayload, null, 2)}

=========================================
CRITICAL RULES FOR HIGH QUALITY (STRICTLY ENFORCED):
1. STRICT SCORE-DRIVEN NARRATIVE: Dictate the tone for the ENTIRE MONTH.
2. BAN ON AI CLICHES: No generic self-help. Discuss specific weeks (e.g. "by the 3rd week of the month").
3. FULL THEMATIC WEAVING: Generate a 'focus_area' for the month and weave it heavily throughout.
4. ASTROLOGICAL GROUNDING: Explain how transits shift over the 30 days.
5. LUCKY DATA & REMEDIES: Use exact engine lucky data.
6. COMPATIBILITY ALIGNMENT: 'daily_match' must match the highest/lowest compatibility scores for the month.
=========================================

INSTRUCTIONS FOR JSON OUTPUT:
Return strict, valid JSON. Use exact requested sentence lengths. Keep arrays and objects at the ROOT LEVEL.

EXPECTED JSON SCHEMA:
{
  "meta": { "sign": "${sign}", "symbol": "${symbol}", "date_range": "${dateRange}", "element": "${element}", "ruling_planet": "", "moon_phase": "" },
  "mood": { "emoji": "", "label": "" },
  "focus_area": "",
  "category_scores": { "love": 0, "career": 0, "money": 0, "health": 0, "energy": 0 },
  "quick_tips": { "relationship": "", "career": "" },
  "daily_match": { "compatible_sign": "", "challenging_sign": "" },
  "planetary_summary": "",
  "overview": "",
  "lucky_insights": { "colors": [], "number": 0, "alphabet": "", "time": "", "direction": "", "activity": "" },
  "detailed_readings": { "love": "", "career": "", "finance": "", "emotions": "", "health": "", "travel": "" },
  "extended_readings": { "career_deep_dive": "", "love_deep_dive": "", "luck_deep_dive": "", "emotional_deep_dive": "", "health_deep_dive": "" },
  "compatibility": { "Aries": 0, "Taurus": 0, "Gemini": 0, "Cancer": 0, "Leo": 0, "Virgo": 0, "Libra": 0, "Scorpio": 0, "Sagittarius": 0, "Capricorn": 0, "Aquarius": 0, "Pisces": 0 },
  "advice": [ "", "", "" ],
  "cautions": [ "", "" ],
  "closing_motivation": ""
}`;

    const response = await createChatCompletion({
      model: CHAT_MODEL, 
      messages: [
        { role: "system", content: "You are an elite Vedic astrologer focusing on 30-day monthly trends. You write highly specific, concrete paragraphs." },
        { role: "user", content: prompt }
      ],
      temperature: 0.75, max_tokens: 3800, response_format: { type: "json_object" } 
    }, loggingContext);

    const content = response?.choices?.[0]?.message?.content?.trim();
    if (!content) return null;
    return JSON.parse(content);
  } catch (error) {
    console.error(`[HoroscopeAI] Monthly error for ${sign}:`, error?.message || error);
    return null;
  }
}

// =========================================================================
// 4. CORE ENGINE: YEARLY HOROSCOPE
// =========================================================================
async function coreGenerateYearlyHoroscope({ sign, symbol, dateRange, element, archetype, period = 'Yearly', horoscopeData, context = {} }) {
  try {
    const loggingContext = { feature: `horoscope_ai_yearly_${sign.toLowerCase()}`, ...context };
    const astroPayload = buildPayloadForSign(horoscopeData, sign);

    const prompt = `You are an expert, premium Vedic astrologer writing for a highly engaging mobile app. 
Your goal is to generate a dynamic, 800–1000 word YEARLY horoscope for ${sign}.

=========================================
${sign.toUpperCase()} ARCHETYPE & TONE ANCHOR:
- Element: ${element} (${archetype}).
- Tone: Deeply insightful, macro-level, extremely specific, and brutally honest. Focus on a 12-month arc.
=========================================

Current Engine Payload Context:
- Sign: ${sign} ${symbol}
- Astrological Data: 
${JSON.stringify(astroPayload, null, 2)}

=========================================
CRITICAL RULES FOR HIGH QUALITY (STRICTLY ENFORCED):
1. STRICT SCORE-DRIVEN NARRATIVE: Dictate the macro-tone for the ENTIRE YEAR.
2. BAN ON AI CLICHES: No generic self-help. Discuss specific quarters/seasons (e.g. "by Q3", "during the winter months").
3. FULL THEMATIC WEAVING: Generate a massive overarching 'focus_area' for the year and weave it heavily throughout.
4. ASTROLOGICAL GROUNDING: Explain slow-moving transits (Saturn, Jupiter, Rahu/Ketu) and their long-term impact on the year.
5. LUCKY DATA & REMEDIES: Base the lucky elements on the entire year's vibration. Integrate remedies as year-long practices.
6. COMPATIBILITY ALIGNMENT: 'daily_match' must match the highest/lowest compatibility scores for the year (Keep JSON key as 'daily_match' for frontend compatibility).
=========================================

INSTRUCTIONS FOR JSON OUTPUT:
Return strict, valid JSON. Use exact requested sentence lengths. Keep arrays and objects at the ROOT LEVEL.

EXPECTED JSON SCHEMA:
{
  "meta": { "sign": "${sign}", "symbol": "${symbol}", "date_range": "${dateRange}", "element": "${element}", "ruling_planet": "", "moon_phase": "" },
  "mood": { "emoji": "", "label": "" },
  "focus_area": "",
  "category_scores": { "love": 0, "career": 0, "money": 0, "health": 0, "energy": 0 },
  "quick_tips": { "relationship": "", "career": "" },
  "daily_match": { "compatible_sign": "", "challenging_sign": "" },
  "planetary_summary": "",
  "overview": "",
  "lucky_insights": { "colors": [], "number": 0, "alphabet": "", "time": "", "direction": "", "activity": "" },
  "detailed_readings": { "love": "", "career": "", "finance": "", "emotions": "", "health": "", "travel": "" },
  "extended_readings": { "career_deep_dive": "", "love_deep_dive": "", "luck_deep_dive": "", "emotional_deep_dive": "", "health_deep_dive": "" },
  "compatibility": { "Aries": 0, "Taurus": 0, "Gemini": 0, "Cancer": 0, "Leo": 0, "Virgo": 0, "Libra": 0, "Scorpio": 0, "Sagittarius": 0, "Capricorn": 0, "Aquarius": 0, "Pisces": 0 },
  "advice": [ "", "", "" ],
  "cautions": [ "", "" ],
  "closing_motivation": ""
}`;

    const response = await createChatCompletion({
      model: CHAT_MODEL, 
      messages: [
        { role: "system", content: "You are an elite Vedic astrologer focusing on 12-month annual macro-trends. You write highly specific, concrete paragraphs." },
        { role: "user", content: prompt }
      ],
      temperature: 0.75, max_tokens: 3800, response_format: { type: "json_object" } 
    }, loggingContext);

    const content = response?.choices?.[0]?.message?.content?.trim();
    if (!content) return null;
    return JSON.parse(content);
  } catch (error) {
    console.error(`[HoroscopeAI] Yearly error for ${sign}:`, error?.message || error);
    return null;
  }
}

// =========================================================================
// EXPORT FUNCTIONS: DAILY
// =========================================================================
async function generateDailyHoroscopeReportForAries({ period, horoscopeData, context }) { return coreGenerateDailyHoroscope({ sign: "Aries", symbol: "♈", dateRange: "Mar 21 - Apr 19", element: "Fire", archetype: "Bold, spontaneous, moves headfirst, natural motivator", period, horoscopeData, context }); }
async function generateDailyHoroscopeReportForTaurus({ period, horoscopeData, context }) { return coreGenerateDailyHoroscope({ sign: "Taurus", symbol: "♉", dateRange: "Apr 20 - May 20", element: "Earth", archetype: "Grounded, sensual, stubborn, values stability and luxury", period, horoscopeData, context }); }
async function generateDailyHoroscopeReportForGemini({ period, horoscopeData, context }) { return coreGenerateDailyHoroscope({ sign: "Gemini", symbol: "♊", dateRange: "May 21 - Jun 20", element: "Air", archetype: "Communicative, adaptable, curious, quick-witted", period, horoscopeData, context }); }
async function generateDailyHoroscopeReportForCancer({ period, horoscopeData, context }) { return coreGenerateDailyHoroscope({ sign: "Cancer", symbol: "♋", dateRange: "Jun 21 - Jul 22", element: "Water", archetype: "Nurturing, emotional, intuitive, fiercely protective of home", period, horoscopeData, context }); }
async function generateDailyHoroscopeReportForLeo({ period, horoscopeData, context }) { return coreGenerateDailyHoroscope({ sign: "Leo", symbol: "♌", dateRange: "Jul 23 - Aug 22", element: "Fire", archetype: "Charismatic, confident, generous, loves the spotlight", period, horoscopeData, context }); }
async function generateDailyHoroscopeReportForVirgo({ period, horoscopeData, context }) { return coreGenerateDailyHoroscope({ sign: "Virgo", symbol: "♍", dateRange: "Aug 23 - Sep 22", element: "Earth", archetype: "Analytical, practical, detail-oriented, service-driven", period, horoscopeData, context }); }
async function generateDailyHoroscopeReportForLibra({ period, horoscopeData, context }) { return coreGenerateDailyHoroscope({ sign: "Libra", symbol: "♎", dateRange: "Sep 23 - Oct 22", element: "Air", archetype: "Diplomatic, charming, seeks balance and harmony, relationship-focused", period, horoscopeData, context }); }
async function generateDailyHoroscopeReportForScorpio({ period, horoscopeData, context }) { return coreGenerateDailyHoroscope({ sign: "Scorpio", symbol: "♏", dateRange: "Oct 23 - Nov 21", element: "Water", archetype: "Intense, passionate, secretive, transformative and resilient", period, horoscopeData, context }); }
async function generateDailyHoroscopeReportForSagittarius({ period, horoscopeData, context }) { return coreGenerateDailyHoroscope({ sign: "Sagittarius", symbol: "♐", dateRange: "Nov 22 - Dec 21", element: "Fire", archetype: "Adventurous, philosophical, optimistic, freedom-loving", period, horoscopeData, context }); }
async function generateDailyHoroscopeReportForCapricorn({ period, horoscopeData, context }) { return coreGenerateDailyHoroscope({ sign: "Capricorn", symbol: "♑", dateRange: "Dec 22 - Jan 19", element: "Earth", archetype: "Ambitious, disciplined, pragmatic, highly status-oriented", period, horoscopeData, context }); }
async function generateDailyHoroscopeReportForAquarius({ period, horoscopeData, context }) { return coreGenerateDailyHoroscope({ sign: "Aquarius", symbol: "♒", dateRange: "Jan 20 - Feb 18", element: "Air", archetype: "Innovative, rebellious, humanitarian, deeply intellectual", period, horoscopeData, context }); }
async function generateDailyHoroscopeReportForPisces({ period, horoscopeData, context }) { return coreGenerateDailyHoroscope({ sign: "Pisces", symbol: "♓", dateRange: "Feb 19 - Mar 20", element: "Water", archetype: "Dreamy, empathetic, artistic, mystical and highly intuitive", period, horoscopeData, context }); }

// =========================================================================
// EXPORT FUNCTIONS: WEEKLY
// =========================================================================
async function generateWeeklyHoroscopeReportForAries({ period, horoscopeData, context }) { return coreGenerateWeeklyHoroscope({ sign: "Aries", symbol: "♈", dateRange: "Mar 21 - Apr 19", element: "Fire", archetype: "Bold, spontaneous, moves headfirst, natural motivator", period, horoscopeData, context }); }
async function generateWeeklyHoroscopeReportForTaurus({ period, horoscopeData, context }) { return coreGenerateWeeklyHoroscope({ sign: "Taurus", symbol: "♉", dateRange: "Apr 20 - May 20", element: "Earth", archetype: "Grounded, sensual, stubborn, values stability and luxury", period, horoscopeData, context }); }
async function generateWeeklyHoroscopeReportForGemini({ period, horoscopeData, context }) { return coreGenerateWeeklyHoroscope({ sign: "Gemini", symbol: "♊", dateRange: "May 21 - Jun 20", element: "Air", archetype: "Communicative, adaptable, curious, quick-witted", period, horoscopeData, context }); }
async function generateWeeklyHoroscopeReportForCancer({ period, horoscopeData, context }) { return coreGenerateWeeklyHoroscope({ sign: "Cancer", symbol: "♋", dateRange: "Jun 21 - Jul 22", element: "Water", archetype: "Nurturing, emotional, intuitive, fiercely protective of home", period, horoscopeData, context }); }
async function generateWeeklyHoroscopeReportForLeo({ period, horoscopeData, context }) { return coreGenerateWeeklyHoroscope({ sign: "Leo", symbol: "♌", dateRange: "Jul 23 - Aug 22", element: "Fire", archetype: "Charismatic, confident, generous, loves the spotlight", period, horoscopeData, context }); }
async function generateWeeklyHoroscopeReportForVirgo({ period, horoscopeData, context }) { return coreGenerateWeeklyHoroscope({ sign: "Virgo", symbol: "♍", dateRange: "Aug 23 - Sep 22", element: "Earth", archetype: "Analytical, practical, detail-oriented, service-driven", period, horoscopeData, context }); }
async function generateWeeklyHoroscopeReportForLibra({ period, horoscopeData, context }) { return coreGenerateWeeklyHoroscope({ sign: "Libra", symbol: "♎", dateRange: "Sep 23 - Oct 22", element: "Air", archetype: "Diplomatic, charming, seeks balance and harmony, relationship-focused", period, horoscopeData, context }); }
async function generateWeeklyHoroscopeReportForScorpio({ period, horoscopeData, context }) { return coreGenerateWeeklyHoroscope({ sign: "Scorpio", symbol: "♏", dateRange: "Oct 23 - Nov 21", element: "Water", archetype: "Intense, passionate, secretive, transformative and resilient", period, horoscopeData, context }); }
async function generateWeeklyHoroscopeReportForSagittarius({ period, horoscopeData, context }) { return coreGenerateWeeklyHoroscope({ sign: "Sagittarius", symbol: "♐", dateRange: "Nov 22 - Dec 21", element: "Fire", archetype: "Adventurous, philosophical, optimistic, freedom-loving", period, horoscopeData, context }); }
async function generateWeeklyHoroscopeReportForCapricorn({ period, horoscopeData, context }) { return coreGenerateWeeklyHoroscope({ sign: "Capricorn", symbol: "♑", dateRange: "Dec 22 - Jan 19", element: "Earth", archetype: "Ambitious, disciplined, pragmatic, highly status-oriented", period, horoscopeData, context }); }
async function generateWeeklyHoroscopeReportForAquarius({ period, horoscopeData, context }) { return coreGenerateWeeklyHoroscope({ sign: "Aquarius", symbol: "♒", dateRange: "Jan 20 - Feb 18", element: "Air", archetype: "Innovative, rebellious, humanitarian, deeply intellectual", period, horoscopeData, context }); }
async function generateWeeklyHoroscopeReportForPisces({ period, horoscopeData, context }) { return coreGenerateWeeklyHoroscope({ sign: "Pisces", symbol: "♓", dateRange: "Feb 19 - Mar 20", element: "Water", archetype: "Dreamy, empathetic, artistic, mystical and highly intuitive", period, horoscopeData, context }); }

// =========================================================================
// EXPORT FUNCTIONS: MONTHLY
// =========================================================================
async function generateMonthlyHoroscopeReportForAries({ period, horoscopeData, context }) { return coreGenerateMonthlyHoroscope({ sign: "Aries", symbol: "♈", dateRange: "Mar 21 - Apr 19", element: "Fire", archetype: "Bold, spontaneous, moves headfirst, natural motivator", period, horoscopeData, context }); }
async function generateMonthlyHoroscopeReportForTaurus({ period, horoscopeData, context }) { return coreGenerateMonthlyHoroscope({ sign: "Taurus", symbol: "♉", dateRange: "Apr 20 - May 20", element: "Earth", archetype: "Grounded, sensual, stubborn, values stability and luxury", period, horoscopeData, context }); }
async function generateMonthlyHoroscopeReportForGemini({ period, horoscopeData, context }) { return coreGenerateMonthlyHoroscope({ sign: "Gemini", symbol: "♊", dateRange: "May 21 - Jun 20", element: "Air", archetype: "Communicative, adaptable, curious, quick-witted", period, horoscopeData, context }); }
async function generateMonthlyHoroscopeReportForCancer({ period, horoscopeData, context }) { return coreGenerateMonthlyHoroscope({ sign: "Cancer", symbol: "♋", dateRange: "Jun 21 - Jul 22", element: "Water", archetype: "Nurturing, emotional, intuitive, fiercely protective of home", period, horoscopeData, context }); }
async function generateMonthlyHoroscopeReportForLeo({ period, horoscopeData, context }) { return coreGenerateMonthlyHoroscope({ sign: "Leo", symbol: "♌", dateRange: "Jul 23 - Aug 22", element: "Fire", archetype: "Charismatic, confident, generous, loves the spotlight", period, horoscopeData, context }); }
async function generateMonthlyHoroscopeReportForVirgo({ period, horoscopeData, context }) { return coreGenerateMonthlyHoroscope({ sign: "Virgo", symbol: "♍", dateRange: "Aug 23 - Sep 22", element: "Earth", archetype: "Analytical, practical, detail-oriented, service-driven", period, horoscopeData, context }); }
async function generateMonthlyHoroscopeReportForLibra({ period, horoscopeData, context }) { return coreGenerateMonthlyHoroscope({ sign: "Libra", symbol: "♎", dateRange: "Sep 23 - Oct 22", element: "Air", archetype: "Diplomatic, charming, seeks balance and harmony, relationship-focused", period, horoscopeData, context }); }
async function generateMonthlyHoroscopeReportForScorpio({ period, horoscopeData, context }) { return coreGenerateMonthlyHoroscope({ sign: "Scorpio", symbol: "♏", dateRange: "Oct 23 - Nov 21", element: "Water", archetype: "Intense, passionate, secretive, transformative and resilient", period, horoscopeData, context }); }
async function generateMonthlyHoroscopeReportForSagittarius({ period, horoscopeData, context }) { return coreGenerateMonthlyHoroscope({ sign: "Sagittarius", symbol: "♐", dateRange: "Nov 22 - Dec 21", element: "Fire", archetype: "Adventurous, philosophical, optimistic, freedom-loving", period, horoscopeData, context }); }
async function generateMonthlyHoroscopeReportForCapricorn({ period, horoscopeData, context }) { return coreGenerateMonthlyHoroscope({ sign: "Capricorn", symbol: "♑", dateRange: "Dec 22 - Jan 19", element: "Earth", archetype: "Ambitious, disciplined, pragmatic, highly status-oriented", period, horoscopeData, context }); }
async function generateMonthlyHoroscopeReportForAquarius({ period, horoscopeData, context }) { return coreGenerateMonthlyHoroscope({ sign: "Aquarius", symbol: "♒", dateRange: "Jan 20 - Feb 18", element: "Air", archetype: "Innovative, rebellious, humanitarian, deeply intellectual", period, horoscopeData, context }); }
async function generateMonthlyHoroscopeReportForPisces({ period, horoscopeData, context }) { return coreGenerateMonthlyHoroscope({ sign: "Pisces", symbol: "♓", dateRange: "Feb 19 - Mar 20", element: "Water", archetype: "Dreamy, empathetic, artistic, mystical and highly intuitive", period, horoscopeData, context }); }

// =========================================================================
// EXPORT FUNCTIONS: YEARLY
// =========================================================================
async function generateYearlyHoroscopeReportForAries({ period, horoscopeData, context }) { return coreGenerateYearlyHoroscope({ sign: "Aries", symbol: "♈", dateRange: "Mar 21 - Apr 19", element: "Fire", archetype: "Bold, spontaneous, moves headfirst, natural motivator", period, horoscopeData, context }); }
async function generateYearlyHoroscopeReportForTaurus({ period, horoscopeData, context }) { return coreGenerateYearlyHoroscope({ sign: "Taurus", symbol: "♉", dateRange: "Apr 20 - May 20", element: "Earth", archetype: "Grounded, sensual, stubborn, values stability and luxury", period, horoscopeData, context }); }
async function generateYearlyHoroscopeReportForGemini({ period, horoscopeData, context }) { return coreGenerateYearlyHoroscope({ sign: "Gemini", symbol: "♊", dateRange: "May 21 - Jun 20", element: "Air", archetype: "Communicative, adaptable, curious, quick-witted", period, horoscopeData, context }); }
async function generateYearlyHoroscopeReportForCancer({ period, horoscopeData, context }) { return coreGenerateYearlyHoroscope({ sign: "Cancer", symbol: "♋", dateRange: "Jun 21 - Jul 22", element: "Water", archetype: "Nurturing, emotional, intuitive, fiercely protective of home", period, horoscopeData, context }); }
async function generateYearlyHoroscopeReportForLeo({ period, horoscopeData, context }) { return coreGenerateYearlyHoroscope({ sign: "Leo", symbol: "♌", dateRange: "Jul 23 - Aug 22", element: "Fire", archetype: "Charismatic, confident, generous, loves the spotlight", period, horoscopeData, context }); }
async function generateYearlyHoroscopeReportForVirgo({ period, horoscopeData, context }) { return coreGenerateYearlyHoroscope({ sign: "Virgo", symbol: "♍", dateRange: "Aug 23 - Sep 22", element: "Earth", archetype: "Analytical, practical, detail-oriented, service-driven", period, horoscopeData, context }); }
async function generateYearlyHoroscopeReportForLibra({ period, horoscopeData, context }) { return coreGenerateYearlyHoroscope({ sign: "Libra", symbol: "♎", dateRange: "Sep 23 - Oct 22", element: "Air", archetype: "Diplomatic, charming, seeks balance and harmony, relationship-focused", period, horoscopeData, context }); }
async function generateYearlyHoroscopeReportForScorpio({ period, horoscopeData, context }) { return coreGenerateYearlyHoroscope({ sign: "Scorpio", symbol: "♏", dateRange: "Oct 23 - Nov 21", element: "Water", archetype: "Intense, passionate, secretive, transformative and resilient", period, horoscopeData, context }); }
async function generateYearlyHoroscopeReportForSagittarius({ period, horoscopeData, context }) { return coreGenerateYearlyHoroscope({ sign: "Sagittarius", symbol: "♐", dateRange: "Nov 22 - Dec 21", element: "Fire", archetype: "Adventurous, philosophical, optimistic, freedom-loving", period, horoscopeData, context }); }
async function generateYearlyHoroscopeReportForCapricorn({ period, horoscopeData, context }) { return coreGenerateYearlyHoroscope({ sign: "Capricorn", symbol: "♑", dateRange: "Dec 22 - Jan 19", element: "Earth", archetype: "Ambitious, disciplined, pragmatic, highly status-oriented", period, horoscopeData, context }); }
async function generateYearlyHoroscopeReportForAquarius({ period, horoscopeData, context }) { return coreGenerateYearlyHoroscope({ sign: "Aquarius", symbol: "♒", dateRange: "Jan 20 - Feb 18", element: "Air", archetype: "Innovative, rebellious, humanitarian, deeply intellectual", period, horoscopeData, context }); }
async function generateYearlyHoroscopeReportForPisces({ period, horoscopeData, context }) { return coreGenerateYearlyHoroscope({ sign: "Pisces", symbol: "♓", dateRange: "Feb 19 - Mar 20", element: "Water", archetype: "Dreamy, empathetic, artistic, mystical and highly intuitive", period, horoscopeData, context }); }

export {
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
};