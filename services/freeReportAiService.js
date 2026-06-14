const { generateGeneralDetails, generateVimshottariDashaReport, generateRudrakshaSuggestion, generateGemstoneSuggestion, generateDoshaReport } = require("../utils/reportGenerator");
const { buildInsightPayload } = require("./astroInsightEngineService");
const { createChatCompletion } = require("./openaiClient");

// ==================== CONFIGURATION & CONSTANTS ====================

const CHAT_MODEL = process.env.OPENAI_CHAT_MODEL || "gpt-4o-mini";

const GENERAL_REPORT_CONFIG = {
  temperature: 0.52,
  maxTokens: 4200,
  minSentencesPerSection: 5,
  maxSentencesPerSection: 8,
  enableDetailedLogging: true,
  enablePayloadValidation: true,
  fallbackMode: "enhanced",
  version: "2.1.0",
  supportedSigns: [
    "Aries", "Taurus", "Gemini", "Cancer", "Leo", "Virgo",
    "Libra", "Scorpio", "Sagittarius", "Capricorn", "Aquarius", "Pisces"
  ],
  elementMap: {
    Aries: "Fire", Taurus: "Earth", Gemini: "Air", Cancer: "Water",
    Leo: "Fire", Virgo: "Earth", Libra: "Air", Scorpio: "Water",
    Sagittarius: "Fire", Capricorn: "Earth", Aquarius: "Air", Pisces: "Water"
  },
  modalityMap: {
    Aries: "Cardinal", Taurus: "Fixed", Gemini: "Mutable", Cancer: "Cardinal",
    Leo: "Fixed", Virgo: "Mutable", Libra: "Cardinal", Scorpio: "Fixed",
    Sagittarius: "Mutable", Capricorn: "Cardinal", Aquarius: "Fixed", Pisces: "Mutable"
  }
};

// Step 1: Prepare pre-computed recommendations (from your astrology logic)
const gemstoneData = {
  lifeStone: {
    gemName: "Blue Sapphire",
    howToWear: "Gold, on middle finger",
    mantra: "Om pram prim praum sah shanaisharaya namah"
  },
  luckyStone: {
    gemName: "Emerald",
    howToWear: "Gold, on ring or little finger",
    mantra: "Om bram brim braum sah budhaya namah"
  },
  fortuneStone: {
    gemName: "Diamond",
    howToWear: "Gold or silver, on middle finger",
    mantra: "Om dram drim draum sah shukraya namah"
  }
};

// ==================== UTILITY & HELPER FUNCTIONS ====================

function getSizeKB(obj) {
  try {
    return (Buffer.byteLength(JSON.stringify(obj || {}), 'utf8') / 1024).toFixed(2);
  } catch (e) {
    return "0.00";
  }
}

function safeStringify(obj, fallback = "{}") {
  try {
    return JSON.stringify(obj || {}, null, 2);
  } catch (e) {
    return fallback;
  }
}

function validateKundliData(kundli) {
  if (!kundli) return { valid: false, reason: "No kundli object provided" };
  
  const hasBasic = !!(kundli.basicDetails || kundli.horoscope);
  const hasPlanetary = !!(kundli.planetary && Object.keys(kundli.planetary).length > 0);
  
  return {
    valid: hasBasic || hasPlanetary,
    reason: hasBasic || hasPlanetary ? "OK" : "Missing basicDetails/horoscope and planetary data",
    hasBasic,
    hasPlanetary
  };
}

function sanitizePlanetaryData(planetaryInput) {
  if (!planetaryInput || !Array.isArray(planetaryInput)) return [];
  
  return planetaryInput
    .filter(p => p && p.planet && p.sign)
    .map(p => ({
      planet: String(p.planet).trim(),
      sign: String(p.sign).trim(),
      is_retrograde: Boolean(p.is_retrograde)
    }));
}

function getElementFromSign(sign) {
  if (!sign) return "Unknown";
  return GENERAL_REPORT_CONFIG.elementMap[sign] || "Unknown";
}

function getModalityFromSign(sign) {
  if (!sign) return "Unknown";
  return GENERAL_REPORT_CONFIG.modalityMap[sign] || "Unknown";
}

function calculateDominantElement(payload) {
  try {
    const signs = [];
    if (payload.ascendant) signs.push(payload.ascendant);
    if (payload.moonSign) signs.push(payload.moonSign);
    if (payload.sunSign) signs.push(payload.sunSign);
    
    if (payload.planetary && Array.isArray(payload.planetary)) {
      payload.planetary.forEach(p => {
        if (p.sign) signs.push(p.sign);
      });
    }
    
    const elementCount = { Fire: 0, Earth: 0, Air: 0, Water: 0 };
    signs.forEach(s => {
      const el = getElementFromSign(s);
      if (elementCount[el] !== undefined) elementCount[el]++;
    });
    
    let dominant = "Balanced";
    let maxCount = 0;
    Object.keys(elementCount).forEach(el => {
      if (elementCount[el] > maxCount) {
        maxCount = elementCount[el];
        dominant = el;
      }
    });
    
    return { dominant, counts: elementCount, totalSigns: signs.length };
  } catch (e) {
    return { dominant: "Unknown", counts: {}, totalSigns: 0 };
  }
}

function buildEnhancedLoggingContext(baseContext = {}) {
  return {
    feature: baseContext.feature || "general_details_ai",
    timestamp: new Date().toISOString(),
    serviceVersion: GENERAL_REPORT_CONFIG.version,
    ...baseContext
  };
}

function fallbackNarrativeFromInsight(insightPayload) {
  const topBuckets = insightPayload.topBuckets || [];
  const natal = insightPayload?.llmPayload?.natal_summary || {};
  const mainTheme = insightPayload?.mainTheme || "daily guidance";
  const asc = natal?.lagna || "your ascendant";
  const moon = natal?.moon_sign || "your moon sign";
  const top1 = topBuckets[0]?.label || "current life priorities";
  const top2 = topBuckets[1]?.label || "relationships and routine";
  const top3 = topBuckets[2]?.label || "practical planning";

  const lineForBucket = (bucket) => {
    const supports = (bucket.supporting_factors || []).slice(0, 2).join(". ");
    const cautions = (bucket.caution_factors || []).slice(0, 2).join(". ");
    return {
      bucket: bucket.bucket,
      title: bucket.label,
      summary:
        `${bucket.label} is active with ${bucket.confidence_label} confidence. ` +
        `${supports || "Relevant chart factors are active."}` +
        (cautions ? ` Caution: ${cautions}` : ""),
      actions: bucket.recommended_actions || [],
      remedies: bucket.remedies || [],
      score: bucket.score,
      challenge_score: bucket.challenge_score,
    };
  };

  return {
    engine_version: "insight_engine_v1",
    generated_by: "deterministic_fallback",
    generated_at: new Date().toISOString(),
    insight: {
      main_theme: insightPayload.mainTheme,
      confidence_score: insightPayload.confidenceScore,
      top_buckets: topBuckets.map(lineForBucket),
      recommended_actions: insightPayload.recommendedActions || [],
      remedies: insightPayload.remedies || [],
      dasha_context: insightPayload.dashaContext || {},
      transit_context: insightPayload.transitContext || {},
      llm_payload: insightPayload.llmPayload || {},
    },
    legacy: {
      general: {
        ascendant_overview:
          `Your ascendant is ${asc}, and this gives you a practical way of approaching life, even during emotional days. ` +
          `Right now, your chart points more strongly toward ${top1.toLowerCase()}, so steady effort will work better than rushing. ` +
          `You may notice that clarity grows when you keep your day simple and focus on one meaningful priority at a time. ` +
          `Conversations with family or close people can feel more supportive when you speak clearly and stay patient. ` +
          `This is a good period to trust your natural strengths and take small consistent steps rather than waiting for perfect timing. ` +
          `Your progress is likely to build through discipline, balance, and realistic expectations.`,

        personality:
          `Your emotional style is influenced by ${moon}, so mood and mindset can shape your decisions more than usual in this phase. ` +
          `You will do best when you avoid overthinking and bring your attention back to what you can control today. ` +
          `A calm routine, clear communication, and measured responses will help you feel more centered and confident. ` +
          `If plans change suddenly, treat it as an adjustment period instead of a setback. ` +
          `Your chart suggests that maturity in speech and consistency in action can improve outcomes across multiple areas. ` +
          `Keep your approach simple, grounded, and steady for the best results this cycle.`,

        physical:
          `Your presence can feel stronger when you maintain clean daily habits and give your body proper rest. ` +
          `On busy days, do not ignore hydration, movement, and sleep, because these directly affect focus and confidence. ` +
          `Even a short self-care routine can improve your mental clarity and how you present yourself to others. ` +
          `Try to avoid irregular schedules, as they may increase restlessness or reduce motivation. ` +
          `Small lifestyle discipline now can create noticeable improvements in both energy and mood. ` +
          `Think of this period as a time to strengthen your foundation from the inside out.`,

        health:
          `This period asks for balanced routines rather than extremes, especially around rest, food timing, and stress management. ` +
          `If your mind feels overloaded, reduce unnecessary pressure and return to a simple daily structure. ` +
          `Gentle activity, better sleep hygiene, and regular hydration can make a meaningful difference. ` +
          `Try to pace your commitments so your energy stays stable across the week. ` +
          `Use mindfulness, prayer, or quiet reflection to settle emotional heaviness when needed. ` +
          `If any discomfort persists, take timely professional advice and support your body with practical care.`,
      },
      remedies: {
        overview:
          "Remedies are prioritized using active pressure planets and current bucket challenges with practical grounding actions.",
        rudraksha:
          "Rudraksha guidance is treated as supportive and should be applied with consistency and personal suitability.",
        gemstones:
          "Gemstones are not treated as mandatory purchases and should be reviewed before use.",
      },
      dosha: {
        overview:
          "Dosha interpretation is balanced with dasha and transit context so that the user receives practical guidance instead of fear-based language.",
        manglik:
          "Manglik factors are explained as manageable tendencies with focus on maturity and constructive actions.",
        kalsarpa:
          "Kaal Sarp themes are framed as patterns that can be worked with through clarity, routine and grounded choices.",
        sadesati:
          "Sade Sati is explained through discipline, emotional grounding and long-term patience.",
      },
    },
  };
}

// ==================== REMAINING FUNCTIONS ====================

function normalizeDateOnly(value = new Date()) {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return new Date().toISOString().slice(0, 10);
  return date.toISOString().slice(0, 10);
}

function buildKundliFromLegacyInput({
  basicDetails,
  personality,
  remedies,
  horoscope,
  manglikAnalysis,
  dasha,
  planetary,
  ashtakvarga,
  yogas,
}) {
  return {
    basicDetails: basicDetails || null,
    personality: personality || null,
    remedies: remedies || null,
    horoscope: horoscope || null,
    manglikAnalysis: manglikAnalysis || null,
    dasha: dasha || null,
    planetary: planetary || null,
    ashtakvarga: ashtakvarga || null,
    yogas: yogas || null,
  };
}

async function generateFreeReportNarratives({
  userRequest,
  kundli,
  basicDetails,
  personality,
  remedies,
  horoscope,
  manglikAnalysis,
  dasha,
  planetary,
  ashtakvarga,
  yogas,
  context = {},
}) {
  const totalStartTime = Date.now();

  try {
    // Normalize input (supports both new Kundli object and legacy parameters)
    const normalizedKundli = kundli || buildKundliFromLegacyInput({
      basicDetails, personality, remedies, horoscope, manglikAnalysis, dasha, planetary, ashtakvarga, yogas
    });

    let gemstoneRecommendations = gemstoneData;

    // If dynamic gemstone data exists in the Kundli, prefer it
    if (normalizedKundli?.remedies?.gemstones?.lifeStone?.gemName) {
      gemstoneRecommendations = normalizedKundli.remedies.gemstones;
    }

    // Execute all report generators in parallel
    const [
      generalDetails,
      dashaReport,
      rudrakshaReport,
      gemstoneReport,
      doshaReport
    ] = await Promise.all([
      generateGeneralDetails(normalizedKundli, context),
      generateVimshottariDashaReport(normalizedKundli, context),
      generateRudrakshaSuggestion({
        basicDetails: normalizedKundli.basicDetails || basicDetails,
        horoscope: normalizedKundli.horoscope || horoscope,
        planetary: normalizedKundli.planetary || planetary,
        remedies: normalizedKundli.remedies || remedies,
        dasha: normalizedKundli.dasha || dasha,
        context
      }),
      generateGemstoneSuggestion({
        basicDetails: normalizedKundli.basicDetails || basicDetails,
        horoscope: normalizedKundli.horoscope || horoscope,
        planetary: normalizedKundli.planetary || planetary,
        preComputedRecommendations: gemstoneRecommendations,
        context
      }),
      generateDoshaReport(normalizedKundli, context)
    ]);

    // Combine all reports into final response structure
    return {
      engine_version: "insight_engine_v3_parallel",
      generated_by: "parallel_llm_agents",
      generated_at: new Date().toISOString(),

      // Root level fields (description, personality, career, etc.)
      ...(generalDetails || {}),

      // Detailed sub-reports
      dashaReport: dashaReport || null,
      rudrakshaReport: rudrakshaReport || null,
      gemstoneReport: gemstoneReport || null,
      doshaReport: doshaReport || null,
    };

  } catch (error) {
    console.error("[FreeReportAI] Error in generateFreeReportNarratives:", error?.message || error);
    return null;
  }
}

// ==================== MODULE EXPORTS ====================

module.exports = {
  generateFreeReportNarratives,
  validateKundliData,
  sanitizePlanetaryData,
};    