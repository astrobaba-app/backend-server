const { getCurrentDasha } = require("./astroInsightEngineService");
const { createChatCompletion } = require("./openaiClient");
const { getPanchang, getTransitChart, getKpData } = require("./astroEngineService");

const CHAT_MODEL = process.env.OPENAI_CHAT_MODEL || "gpt-4o-mini";

/**
 * 1. extractBasicDetails()
 * Returns concise user context. Only fields useful for daily forecasting.
 */
function extractBasicDetails(kundli, userRequest, currentDate) {
  const birthDateStr = userRequest?.dateOfbirth;
  const currDate = currentDate ? new Date(currentDate) : new Date();

  let age = null;
  if (birthDateStr) {
    const match = String(birthDateStr).match(/^(\d{4})-(\d{2})-(\d{2})/);
    if (match) {
      const birthYear = parseInt(match[1], 10);
      const birthMonth = parseInt(match[2], 10);
      const birthDay = parseInt(match[3], 10);
      
      age = currDate.getFullYear() - birthYear;
      const m = (currDate.getMonth() + 1) - birthMonth;
      if (m < 0 || (m === 0 && currDate.getDate() < birthDay)) {
        age--;
      }
    } else {
      const birthDate = new Date(birthDateStr);
      if (!isNaN(birthDate.getTime())) {
        age = currDate.getFullYear() - birthDate.getFullYear();
        const m = currDate.getMonth() - birthDate.getMonth();
        if (m < 0 || (m === 0 && currDate.getDate() < birthDate.getDate())) {
          age--;
        }
      }
    }
  }

  const moonSign = kundli?.basicDetails?.moon_sign || kundli?.horoscope?.moon_sign || null;

  let ascendant = kundli?.basicDetails?.ascendant?.sign || kundli?.basicDetails?.ascendant || null;
  if (typeof ascendant === "object" && ascendant !== null) {
    ascendant = ascendant.sign;
  }
  if (!ascendant) {
    ascendant = kundli?.astroDetails?.ascendant?.sign || null;
  }

  return {
    name: userRequest?.fullName || null,
    gender: userRequest?.gender || null,
    dateOfBirth: userRequest?.dateOfbirth
      ? new Date(userRequest.dateOfbirth).toISOString().slice(0, 10)
      : null,
    timeOfBirth: userRequest?.timeOfbirth || null,
    placeOfBirth: userRequest?.placeOfBirth || null,
    age,
    moonSign,
    ascendant,
    reportDate: currentDate
      ? new Date(currentDate).toISOString().slice(0, 10)
      : new Date().toISOString().slice(0, 10),
  };
}

/**
 * 2. extractDashaData()
 * Returns full active dasha chain with sub-period dates at all three levels.
 */
function extractDashaData(kundli, currentDate) {
  const dashaObj = kundli?.dasha || {};
  const dateObj = currentDate ? new Date(currentDate) : new Date();
  const activeDasha = getCurrentDasha(dashaObj, dateObj);

  return {
    system: activeDasha.system || "Vimshottari",
    mahadasha: activeDasha.mahadasha || null,
    mahaStart: activeDasha.mahaStart || null,
    mahaEnd: activeDasha.mahaEnd || null,
    antardasha: activeDasha.antardasha || null,
    antarStart: activeDasha.antarStart || null,
    antarEnd: activeDasha.antarEnd || null,
    pratyantardasha: activeDasha.pratyantardasha || null,
    pratyStart: activeDasha.pratyStart || null,
    pratyEnd: activeDasha.pratyEnd || null,
    sookshmadasha: activeDasha.sookshmadasha || null,
  };
}

/**
 * 3. extractTransitData()
 * Returns today's transit and panchang data.
 */
function extractTransitData(transitData, panchangData) {
  const tithi = panchangData?.tithi || null;
  const nakshatra = panchangData?.nakshatra || null;
  const yoga = panchangData?.yoga || null;
  const karana = panchangData?.karana || null;
  const sunrise = panchangData?.sunrise || null;
  const sunset = panchangData?.sunset || null;

  const planets = transitData?.planets || transitData?.transits || transitData || {};
  const PLANETS_LIST = [
    "Sun", "Moon", "Mars", "Mercury", "Jupiter",
    "Venus", "Saturn", "Rahu", "Ketu",
  ];

  let transitPlanets = [];
  if (Array.isArray(planets)) {
    transitPlanets = planets;
  } else if (typeof planets === "object" && planets !== null) {
    transitPlanets = Object.entries(planets)
      .filter(([name]) => PLANETS_LIST.includes(name))
      .map(([name, val]) => ({ planet: name, ...val }));
  }

  const normalizedPlanets = transitPlanets.map((p) => ({
    planet: p.planet || p.name || null,
    sign: p.sign || null,
    degree: p.degree ?? (p.longitude !== undefined
      ? Number((p.longitude % 30).toFixed(2))
      : null),
    isRetrograde: Boolean(p.is_retrograde || p.isRetrograde),
  }));

  const moon = normalizedPlanets.find((p) => p.planet === "Moon");

  return {
    panchang: { tithi, nakshatra, yoga, karana, sunrise, sunset },
    planetary: {
      moonTransit: moon ? { sign: moon.sign, degree: moon.degree } : null,
      majorTransits: normalizedPlanets,
      planetaryStrengths: transitData?.planetary_strengths || null,
    },
  };
}

/**
 * 4. extractKPData()
 * Returns KP-specific forecasting signals.
 */
function extractKPData(kpDataRaw, transitData) {
  const kpChart = kpDataRaw?.kp_chart || {};
  const planetSignificators = kpChart.planet_significators || {};
  const houseAnalyses = kpChart.house_analyses || [];
  const rulingPlanets = kpChart.ruling_planets || [];

  const transitPlanets =
    transitData?.planets || transitData?.transits || transitData || {};
  const activeHousesSet = new Set();

  if (Array.isArray(transitPlanets)) {
    transitPlanets.forEach((p) => {
      if (p.house) activeHousesSet.add(p.house);
      if (p.house_from_lagna) activeHousesSet.add(p.house_from_lagna);
    });
  } else if (typeof transitPlanets === "object" && transitPlanets !== null) {
    Object.values(transitPlanets).forEach((p) => {
      if (p?.house) activeHousesSet.add(p.house);
      if (p?.house_from_lagna) activeHousesSet.add(p.house_from_lagna);
    });
  }

  const houseActivations = Array.from(activeHousesSet).sort((a, b) => a - b);

  return {
    kpSignificators: planetSignificators,
    activeHouses: houseActivations,
    rulingPlanets,
    transitImpacts: houseAnalyses
      .filter((h) => houseActivations.includes(h.house))
      .map((h) => ({
        house: h.house,
        cusp_sub_lord: h.cusp_sub_lord,
        matters: h.matters,
      })),
  };
}

/**
 * 5. extractChartsData()
 * Returns birth divisional charts minimized.
 */
function extractChartsData(kundli) {
  const charts = kundli?.charts || {};
  return {
    birthChart: charts.D1 || null,
    moonChart: charts.Moon || null,
  };
}

/**
 * 6. mergeFinalResponse()
 * Merges components into final frontend response.
 * Now includes full dasha sub-period dates at all three levels.
 */
function mergeFinalResponse(basicDetails, dailyForecast, dasha, disclaimer) {
  return {
    basicDetails,
    activeDasha: {
      system: dasha?.system || "Vimshottari",
      mahadasha: dasha?.mahadasha || null,
      mahaStart: dasha?.mahaStart || null,
      mahaEnd: dasha?.mahaEnd || null,
      antardasha: dasha?.antardasha || null,
      antarStart: dasha?.antarStart || null,
      antarEnd: dasha?.antarEnd || null,
      pratyantardasha: dasha?.pratyantardasha || null,
      pratyStart: dasha?.pratyStart || null,
      pratyEnd: dasha?.pratyEnd || null,
      sookshmadasha: dasha?.sookshmadasha || null,
    },
    moonTransit: dailyForecast?.moonTransit || null,
    dailyForecast: {
      yourDayOverview: dailyForecast?.yourDayOverview || null,
      bestTime: dailyForecast?.bestTime || null,
      riskTime: dailyForecast?.riskTime || null,
      todaysFocus: dailyForecast?.todaysFocus || [],
      luckySupport: dailyForecast?.luckySupport || null,
      hiddenOpportunity: dailyForecast?.hiddenOpportunity || null,
      actionGuide: dailyForecast?.actionGuide || null,
      smartTimeWindows: dailyForecast?.smartTimeWindows || [],
    },
    disclaimer,
  };
}

/**
 * 7. buildDailyReportPayload()
 * Primary service function to build AI-ready structured payload.
 */
async function buildDailyReportPayload(
  kundli, currentDate, timezone, latitude, longitude, userRequest
) {
  const plainUserRequest =
    userRequest && typeof userRequest.get === "function"
      ? userRequest.get({ plain: true })
      : userRequest;

  const basicDetails = extractBasicDetails(kundli, plainUserRequest, currentDate);
  const dasha = extractDashaData(kundli, currentDate);

  const targetRequest = {
    ...plainUserRequest,
    dateOfbirth: currentDate,
    latitude,
    longitude,
    timezone,
  };

  const [panchangRaw, transitRaw, kpRaw] = await Promise.all([
    getPanchang(targetRequest),
    getTransitChart(targetRequest, currentDate),
    getKpData(targetRequest),
  ]);

  const transitExtracted = extractTransitData(transitRaw, panchangRaw);
  const kpData = extractKPData(kpRaw, transitRaw);
  const charts = extractChartsData(kundli);

  return {
    basicDetails,
    dasha,
    panchang: transitExtracted.panchang,
    planetary: transitExtracted.planetary,
    charts,
    kpData,
  };
}

/**
 * 8. buildPrompt()
 * Builds the enriched GPT prompt requiring 3-4 sentences per narrative field.
 */
function buildPrompt(payload) {
  return `You are an elite Vedic and KP astrologer. Generate a highly personalized, accurate, and specific DAILY forecast based on the user's birth details, active dasha, and today's planetary transits.

=========================================
USER CONTEXT & BIRTH DETAILS:
${JSON.stringify(payload.basicDetails, null, 2)}

ACTIVE DASHA TIMING:
${JSON.stringify(payload.dasha, null, 2)}

TODAY'S PANCHANG:
${JSON.stringify(payload.panchang, null, 2)}

TODAY'S PLANETARY TRANSITS:
${JSON.stringify(payload.planetary, null, 2)}

KP ASTROLOGICAL SIGNALS:
${JSON.stringify(payload.kpData, null, 2)}
=========================================

CRITICAL INSTRUCTIONS:
1. DAILY FORECAST ONLY: Everything must be tied directly to today's astrological alignments. No generic personality profiles or static natal readings.
2. REASONING PRIORITY:
   - Priority 1: Mahadasha / Antardasha / Pratyantardasha
   - Priority 2: Current transits over the ascendant and Moon sign
   - Priority 3: KP sub-lord activations
   - Priority 4: House activations from transits
   - Priority 5: Moon position and nakshatra
   - Priority 6: Panchang (tithi, nakshatra, yoga, karana)
3. BE SPECIFIC: Reference actual planets, houses, and chart positions. Never use generic filler like "stay hydrated" or "practice mindfulness" without tying it to a specific chart factor.
4. TIME WINDOWS: bestTime and riskTime must include exact time ranges and 2-3 sentences explaining the planetary mechanism.
5. CONTENT DEPTH — MANDATORY MINIMUMS:
   - "yourDayOverview": Exactly 4 sentences. (1) dominant Mahadasha-Antardasha theme today, (2) primary transit influence on Lagna/Moon sign, (3) Panchang quality and its practical effect, (4) one concrete, chart-specific recommendation.
   - "hiddenOpportunity": Exactly 3-4 sentences. Specific configuration, life area affected, timing window, and action to take.
   - "actionGuide.workProductivityMoney": Exactly 3-4 sentences with specific house/planet, supported task types, one financial defer with reason, one clear action.
   - "actionGuide.relationships": Exactly 3-4 sentences with house/planet influence, conversational approach, conflict-avoidance technique, beneficial activity type.
   - "actionGuide.healthAndEnergy": Exactly 3-4 sentences with 1st/6th house influence, vulnerable body system, aligned wellness practice, energy management advice.
   - Each smartTimeWindow: "favourableActivities" must be 1-2 sentences including the astrological reason. "areasForCaution" must be 1 specific sentence.
6. STRICT JSON OUTPUT: Return only raw valid JSON. No markdown, no prose outside the JSON.

EXPECTED JSON SCHEMA:
{
  "moonTransit": {
    "sign": "Transiting Moon sign (Sanskrit or English, e.g. Vrushaba)",
    "nakshatra": "Moon nakshatra with Pada (e.g. Rohini Pada 3)",
    "dayLord": "Nakshatra lord (e.g. Moon)",
    "momentLord": "KP sub lord of Moon's position (e.g. Saturn)"
  },
  "yourDayOverview": "4 complete sentences — Dasha theme + transit on Lagna/Moon + Panchang effect + specific recommendation.",
  "bestTime": {
    "time": "e.g. '10:13 AM - 01:31 PM'",
    "description": "2-3 sentences: planetary mechanism activating this window, what activities are supported, what to initiate."
  },
  "riskTime": {
    "time": "e.g. '01:32 PM - 04:29 PM'",
    "description": "2-3 sentences: the specific configuration causing challenge, most vulnerable life area, concrete avoidance strategy."
  },
  "todaysFocus": [
    "Priority 1 — chart-specific, e.g. 'Focus on financial planning; Jupiter transiting your 11th house amplifies network-based gains today.'",
    "Priority 2 — chart-specific.",
    "Priority 3 — chart-specific."
  ],
  "luckySupport": {
    "luckyColor": "e.g. White",
    "luckyNumber": 6,
    "luckyItem": "e.g. Silver"
  },
  "hiddenOpportunity": "3-4 sentences: specific configuration, life area, timing window, action to take.",
  "actionGuide": {
    "workProductivityMoney": "3-4 sentences: house/planet driving work energy, supported task types, financial decision to defer with reason, one clear action.",
    "relationships": "3-4 sentences: planetary influence on 7th/3rd house, conversational approach, conflict-avoidance technique, beneficial social activity.",
    "healthAndEnergy": "3-4 sentences: 1st/6th house planetary influence, most vulnerable body system today, aligned wellness practice, energy management advice."
  },
  "smartTimeWindows": [
    { "timeWindow": "12:00 AM – 01:17 AM", "favourableActivities": "1-2 sentences with astrological reason.", "areasForCaution": "1 specific sentence." },
    { "timeWindow": "01:18 AM – 03:02 AM", "favourableActivities": "...", "areasForCaution": "..." },
    { "timeWindow": "03:03 AM – 04:15 AM", "favourableActivities": "...", "areasForCaution": "..." },
    { "timeWindow": "04:16 AM – 07:24 AM", "favourableActivities": "...", "areasForCaution": "..." },
    { "timeWindow": "07:25 AM – 10:12 AM", "favourableActivities": "...", "areasForCaution": "..." },
    { "timeWindow": "10:13 AM – 01:31 PM", "favourableActivities": "...", "areasForCaution": "..." },
    { "timeWindow": "01:32 PM – 04:29 PM", "favourableActivities": "...", "areasForCaution": "..." },
    { "timeWindow": "04:30 PM – 05:42 PM", "favourableActivities": "...", "areasForCaution": "..." },
    { "timeWindow": "05:43 PM – 09:11 PM", "favourableActivities": "...", "areasForCaution": "..." },
    { "timeWindow": "09:12 PM – 10:14 PM", "favourableActivities": "...", "areasForCaution": "..." },
    { "timeWindow": "10:15 PM – 11:27 PM", "favourableActivities": "...", "areasForCaution": "..." },
    { "timeWindow": "11:28 PM – 11:59 PM", "favourableActivities": "...", "areasForCaution": "..." }
  ]
}`;
}

/**
 * 9. generateDailyReport()
 * Calls OpenAI GPT to generate the daily report JSON.
 */
async function generateDailyReport(payload, userRequest, options = {}) {
  const prompt = buildPrompt(payload);

  const response = await createChatCompletion(
    {
      model: CHAT_MODEL,
      messages: [
        {
          role: "system",
          content:
            "You are an elite Vedic and KP astrologer returning strict JSON daily reports. Every narrative field must contain minimum 3-4 substantive sentences with specific chart references. Never return single-sentence narrative fields.",
        },
        { role: "user", content: prompt },
      ],
      temperature: 0.7,
      max_tokens: 4000,
      response_format: { type: "json_object" },
    },
    { feature: "daily_kundali_report", userId: userRequest?.userId }
  );

  const content = response?.choices?.[0]?.message?.content?.trim();
  if (!content) {
    throw new Error("No daily report response returned from OpenAI Client");
  }

  try {
    const parsed = JSON.parse(content);
    console.log("[DailyKundliReport] GPT response received:", parsed);
    if (options.includeMeta) {
      return {
        data: parsed,
        tokenUsage: {
          inputTokens: response?.usage?.prompt_tokens || 0,
          outputTokens: response?.usage?.completion_tokens || 0,
          totalTokens: response?.usage?.total_tokens || 0,
          raw: response?.usage || {},
        },
      };
    }
    return parsed;
  } catch (error) {
    console.error("[DailyKundliReport] Failed to parse GPT response:", content);
    throw new Error("Invalid JSON structure returned by GPT model");
  }
}

module.exports = {
  extractBasicDetails,
  extractDashaData,
  extractTransitData,
  extractKPData,
  extractChartsData,
  mergeFinalResponse,
  buildDailyReportPayload,
  generateDailyReport,
};
