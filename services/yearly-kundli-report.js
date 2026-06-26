const { getCurrentDasha } = require("./astroInsightEngineService");
const { createChatCompletion } = require("./openaiClient");
const { getPanchang, getTransitChart, getKpData } = require("./astroEngineService");

const {
  extractTransitData,
  extractKPData,
  extractChartsData,
  extractDashaData
} = require("./daily-kundli-report");

const CHAT_MODEL = process.env.OPENAI_CHAT_MODEL || "gpt-4o-mini";

const NAKSHATRA_LORDS = {
  ashwini: "Ketu", bharani: "Venus", krittika: "Sun", rohini: "Moon",
  mrigashira: "Mars", mrigasira: "Mars", ardra: "Rahu", punarvasu: "Jupiter", pushya: "Saturn",
  ashlesha: "Mercury", aslesha: "Mercury", magha: "Ketu",
  "purva phalguni": "Venus", purvaphalguni: "Venus", "uttara phalguni": "Sun", uttaraphalguni: "Sun",
  hasta: "Moon", chitra: "Mars", swati: "Rahu", vishakha: "Jupiter",
  anuradha: "Saturn", jyeshtha: "Mercury", jyestha: "Mercury", mula: "Ketu", moola: "Ketu",
  "purva ashadha": "Venus", purvaashadha: "Venus", purvasadha: "Venus", "purva sadha": "Venus",
  "uttara ashadha": "Sun", xuttaraashadha: "Sun", uttarasadha: "Sun", "uttara sadha": "Sun",
  shravana: "Moon", sravana: "Moon", dhanishta: "Mars", dhanistha: "Mars",
  shatabhisha: "Rahu", satabhisha: "Rahu",
  "purva bhadrapada": "Jupiter", purvabhadrapada: "Jupiter",
  "uttara bhadrapada": "Saturn", uttarabhadrapada: "Saturn",
  revati: "Mercury"
};

function getNakshatraLordByName(name) {
  if (!name) return null;
  const key = String(name).toLowerCase().replace(/[^a-z\s]/g, "").trim();
  const cleanedKey = key.replace(/\s+/g, "");
  for (const [k, lord] of Object.entries(NAKSHATRA_LORDS)) {
    if (k.replace(/\s+/g, "") === cleanedKey) {
      return lord;
    }
  }
  return null;
}

const EXALTATION_SIGNS = {
  Sun: "Aries",
  Moon: "Taurus",
  Mars: "Capricorn",
  Mercury: "Virgo",
  Jupiter: "Cancer",
  Venus: "Pisces",
  Saturn: "Libra"
};

const DEBILITATION_SIGNS = {
  Sun: "Libra",
  Moon: "Scorpio",
  Mars: "Cancer",
  Mercury: "Pisces",
  Jupiter: "Capricorn",
  Venus: "Virgo",
  Saturn: "Aries"
};

const OWN_SIGNS = {
  Sun: ["Leo"],
  Moon: ["Cancer"],
  Mars: ["Aries", "Scorpio"],
  Mercury: ["Gemini", "Virgo"],
  Jupiter: ["Sagittarius", "Pisces"],
  Venus: ["Taurus", "Libra"],
  Saturn: ["Capricorn", "Aquarius"]
};

function getAbsoluteLongitude(p, name) {
  if (p.longitude !== undefined && p.longitude !== null) {
    return Number(p.longitude);
  }
  const SIGNS = ["Aries", "Taurus", "Gemini", "Cancer", "Leo", "Virgo", "Libra", "Scorpio", "Sagittarius", "Capricorn", "Aquarius", "Pisces"];
  const signIdx = SIGNS.map(s => s.toLowerCase()).indexOf(String(p.sign || "Aries").toLowerCase());
  const deg = p.degree ?? 0;
  return (signIdx !== -1 ? signIdx : 0) * 30 + deg;
}

function getLongitudeDifference(lon1, lon2) {
  const diff = Math.abs(lon1 - lon2) % 360;
  return diff > 180 ? 360 - diff : diff;
}

function isPlanetCombust(planetName, planetLon, sunLon, isRetrograde) {
  if (planetName === "Sun" || planetName === "Rahu" || planetName === "Ketu" || planetName === "Ascendant") {
    return false;
  }
  const diff = getLongitudeDifference(planetLon, sunLon);
  const limits = {
    Moon: 12,
    Mars: 17,
    Mercury: isRetrograde ? 12 : 14,
    Jupiter: 11,
    Venus: isRetrograde ? 8 : 10,
    Saturn: 15
  };
  const limit = limits[planetName];
  return limit ? diff <= limit : false;
}

function getPlanetaryStatus(name, p, sunLon) {
  if (name === "Ascendant") return "Direct";
  
  const statusParts = [];

  // 1. Motion
  if (name !== "Sun" && name !== "Rahu" && name !== "Ketu") {
    if (p.isRetrograde) {
      statusParts.push("Retrograde");
    } else {
      statusParts.push("Direct");
    }
  } else if (name === "Rahu" || name === "Ketu") {
    statusParts.push("Retrograde");
  } else {
    statusParts.push("Direct");
  }

  // 2. Combustion
  if (sunLon !== null && name !== "Sun") {
    const planetLon = p.absoluteLongitude;
    if (isPlanetCombust(name, planetLon, sunLon, p.isRetrograde)) {
      statusParts.push("Combust");
    }
  }

  // 3. Dignities
  const sign = p.sign;
  if (EXALTATION_SIGNS[name] === sign) {
    statusParts.push("Exalted");
  } else if (DEBILITATION_SIGNS[name] === sign) {
    statusParts.push("Debilitated");
  } else if (OWN_SIGNS[name] && OWN_SIGNS[name].includes(sign)) {
    statusParts.push("Own Sign");
  }

  return statusParts.join(", ");
}

const MONTHS = [
  "January", "February", "March", "April", "May", "June",
  "July", "August", "September", "October", "November", "December"
];

// ---------------------------------------------------------------------------
// HELPER: map SAV house scores by ascendant sign
// ---------------------------------------------------------------------------
function getHouseScores(sav, ascendantSign) {
  const SIGNS = ["Aries", "Taurus", "Gemini", "Cancer", "Leo", "Virgo", "Libra", "Scorpio", "Sagittarius", "Capricorn", "Aquarius", "Pisces"];
  let ascIdx = SIGNS.map(s => s.toLowerCase()).indexOf(String(ascendantSign || "Aries").toLowerCase());
  if (ascIdx === -1) ascIdx = 0;
  const houseScores = {};
  for (let house = 1; house <= 12; house++) {
    const signIdx = (ascIdx + house - 1) % 12;
    houseScores[house] = sav ? (sav[signIdx] || 28) : 28;
  }
  return houseScores;
}

// ---------------------------------------------------------------------------
// HELPER: get a single planet's placement from birth planetary data
// ---------------------------------------------------------------------------
function getKeyPlanetPlacement(planetary, planetName) {
  const pName = String(planetName).toLowerCase();
  const planetsObj = planetary?.planets || {};
  const matchedKey = Object.keys(planetsObj).find(k => k.toLowerCase() === pName);
  if (matchedKey && planetsObj[matchedKey]) {
    const p = planetsObj[matchedKey];
    const houseMap = planetary?.planet_houses || {};
    return {
      sign: p.sign || "Unknown",
      degree: p.degree ?? (p.longitude !== undefined ? Number((p.longitude % 30).toFixed(1)) : 0),
      house: houseMap[matchedKey] || 1,
      isRetrograde: Boolean(p.is_retrograde || p.isRetrograde)
    };
  }
  return { sign: "Unknown", degree: 0, house: 1, isRetrograde: false };
}

// ---------------------------------------------------------------------------
// HELPER: extract compact divisional chart sign placements (no degree bloat)
// ---------------------------------------------------------------------------
function getDivChartSigns(charts, chartCode) {
  const chartData = charts?.[chartCode] || charts?.[chartCode.toLowerCase()] || null;
  if (!chartData) return null;
  const planets = chartData.planets || {};
  const result = {};
  Object.entries(planets).forEach(([name, p]) => {
    result[name] = p.sign || "Unknown";
  });
  return result;
}

// ---------------------------------------------------------------------------
// HELPER: derive monthly timing windows from Moon transit vs ascendant
// ---------------------------------------------------------------------------
function deriveMonthlyWindows(transitMoonSign, ascendantSign, year, monthIndex) {
  const SIGNS = ["Aries", "Taurus", "Gemini", "Cancer", "Leo", "Virgo", "Libra", "Scorpio", "Sagittarius", "Capricorn", "Aquarius", "Pisces"];
  let ascIdx = SIGNS.map(s => s.toLowerCase()).indexOf(String(ascendantSign || "Aries").toLowerCase());
  if (ascIdx === -1) ascIdx = 0;
  let moonStartIdx = SIGNS.map(s => s.toLowerCase()).indexOf(String(transitMoonSign || "Aries").toLowerCase());
  if (moonStartIdx === -1) moonStartIdx = 0;

  const daysInMonth = new Date(year, monthIndex + 1, 0).getDate();
  const supportDays = [];
  const cautionDays = [];

  for (let day = 1; day <= daysInMonth; day++) {
    const currentMoonSignIdx = Math.floor(moonStartIdx + ((day - 1) / 2.25)) % 12;
    const house = ((currentMoonSignIdx - ascIdx + 12) % 12) + 1;
    const dateStr = `${year}-${String(monthIndex + 1).padStart(2, "0")}-${String(day).padStart(2, "0")}`;
    if ([6, 8, 12].includes(house)) cautionDays.push(dateStr);
    else if ([1, 5, 9, 11].includes(house)) supportDays.push(dateStr);
  }

  return { supportDays, cautionDays };
}

// ---------------------------------------------------------------------------
// HELPER: get filtered transit planet movements
// ---------------------------------------------------------------------------
function getMonthMovements(transitRaw, allowedPlanets = []) {
  const planetsList = Array.isArray(transitRaw)
    ? transitRaw
    : Object.entries(transitRaw || {}).map(([k, v]) => ({ planet: k, ...v }));

  return planetsList
    .filter(p => {
      const name = p.planet || p.name || "";
      return allowedPlanets.map(ap => ap.toLowerCase()).includes(name.toLowerCase());
    })
    .map(p => ({
      planet: p.planet || p.name || "",
      sign: p.sign || "",
      retro: Boolean(p.is_retrograde || p.isRetrograde)
    }));
}

// ---------------------------------------------------------------------------
// 1. buildMonthlyPayload()
//    Returns a single compact unified context — no section duplication.
// ---------------------------------------------------------------------------
async function buildMonthlyPayload(
  kundli, monthName, monthIndex, year, timezone, lat, lng, userRequest
) {
  const plainUserRequest =
    userRequest && typeof userRequest.get === "function"
      ? userRequest.get({ plain: true })
      : userRequest;

  const targetDateStr = `${year}-${String(monthIndex + 1).padStart(2, "0")}-01`;

  const targetRequest = {
    ...plainUserRequest,
    dateOfbirth: targetDateStr,
    latitude: lat,
    longitude: lng,
    timezone,
  };

  // Fetch transit data concurrently
  const [panchangRaw, transitRaw] = await Promise.all([
    getPanchang(targetRequest).catch(() => null),
    getTransitChart(targetRequest, targetDateStr).catch(() => null),
  ]);

  const transitExtracted = extractTransitData(transitRaw, panchangRaw);
  const targetDasha = extractDashaData(kundli, targetDateStr);

  // Extract natal chart basics
  let ascendant = kundli?.basicDetails?.ascendant?.sign || kundli?.basicDetails?.ascendant || null;
  if (typeof ascendant === "object" && ascendant !== null) ascendant = ascendant.sign;
  if (!ascendant) ascendant = kundli?.astroDetails?.ascendant?.sign || null;

  const moonSign = kundli?.basicDetails?.moon_sign || kundli?.horoscope?.moon_sign || null;
  const transitMoonSign = transitExtracted.planetary?.moonTransit?.sign || moonSign;

  const houseScores = getHouseScores(kundli.ashtakavarga?.sav, ascendant);
  const birthPlanets = kundli.planetary || {};
  const charts = kundli.charts || {};

  const { supportDays, cautionDays } = deriveMonthlyWindows(transitMoonSign, ascendant, year, monthIndex);

  // All 9 key birth planet placements (sign + house only — no full degree for token savings)
  const sunPlacement = getKeyPlanetPlacement(birthPlanets, "Sun");
  const sunLon = sunPlacement ? getAbsoluteLongitude(sunPlacement, "Sun") : null;

  const getEnhancedPlacement = (name) => {
    const p = getKeyPlanetPlacement(birthPlanets, name);
    p.absoluteLongitude = getAbsoluteLongitude(p, name);
    p.status = getPlanetaryStatus(name, p, sunLon);
    return p;
  };

  const bp = {
    Sun: getEnhancedPlacement("Sun"),
    Moon: getEnhancedPlacement("Moon"),
    Mars: getEnhancedPlacement("Mars"),
    Mercury: getEnhancedPlacement("Mercury"),
    Jupiter: getEnhancedPlacement("Jupiter"),
    Venus: getEnhancedPlacement("Venus"),
    Saturn: getEnhancedPlacement("Saturn"),
    Rahu: getEnhancedPlacement("Rahu"),
    Ketu: getEnhancedPlacement("Ketu"),
  };

  // Current transits for all major planets (compact: planet, sign, retro flag only)
  const currentTransits = getMonthMovements(transitRaw, [
    "Sun", "Moon", "Mars", "Mercury", "Jupiter", "Venus", "Saturn", "Rahu", "Ketu"
  ]);

  // Section-specific divisional chart signs (sign only, not full degree data)
  const d1Signs = getDivChartSigns(charts, "D1");
  const d9Signs = getDivChartSigns(charts, "D9") || d1Signs;
  const d10Signs = getDivChartSigns(charts, "D10") || d1Signs;

  // Top-3 yogas
  const yogas = (Array.isArray(kundli.yogas) ? kundli.yogas : [])
    .slice(0, 3)
    .map(y => ({ name: y.name, effect: y.effects || y.description || "" }));

  // Key house scores by domain (only relevant ones per section — not all 12 repeatedly)
  const hs = houseScores;

  // UNIFIED compact context payload
  const context = {
    native: {
      name: plainUserRequest.fullName,
      dob: plainUserRequest.dateOfbirth ? new Date(plainUserRequest.dateOfbirth).toISOString().slice(0, 10) : null,
      tob: plainUserRequest.timeOfbirth,
      pob: plainUserRequest.placeOfBirth,
      gender: plainUserRequest.gender,
    },
    kundli: {
      asc: ascendant,
      moon: moonSign,
      sun: kundli?.basicDetails?.sun_sign || null,
      nakshatra: kundli?.astroDetails?.nakshatra || null,
      nakshatraLord: kundli?.astroDetails?.nakshatra_lord || null,
    },
    dasha: {
      maha: targetDasha.mahadasha,
      antar: targetDasha.antardasha,
      pratya: targetDasha.pratyantardasha ?? null,
      antarStart: targetDasha.antarStart ?? null,
      antarEnd: targetDasha.antarEnd ?? null,
    },
    month: `${monthName} ${year}`,
    // Birth planets: sign + house for each (no full chart object)
    birthPlanets: {
      Sun: { s: bp.Sun.sign, h: bp.Sun.house, status: bp.Sun.status },
      Moon: { s: bp.Moon.sign, h: bp.Moon.house, status: bp.Moon.status },
      Mars: { s: bp.Mars.sign, h: bp.Mars.house, status: bp.Mars.status },
      Mercury: { s: bp.Mercury.sign, h: bp.Mercury.house, status: bp.Mercury.status },
      Jupiter: { s: bp.Jupiter.sign, h: bp.Jupiter.house, status: bp.Jupiter.status },
      Venus: { s: bp.Venus.sign, h: bp.Venus.house, status: bp.Venus.status },
      Saturn: { s: bp.Saturn.sign, h: bp.Saturn.house, status: bp.Saturn.status },
      Rahu: { s: bp.Rahu.sign, h: bp.Rahu.house, status: bp.Rahu.status },
      Ketu: { s: bp.Ketu.sign, h: bp.Ketu.house, status: bp.Ketu.status },
    },
    // Current month transits (sign + retrograde flag)
    transits: currentTransits,
    // Panchang for this month's 1st date
    panchang: {
      tithi: panchangRaw?.tithi || null,
      nakshatra: panchangRaw?.nakshatra || null,
      yoga: panchangRaw?.yoga || null,
      karana: panchangRaw?.karana || null,
    },
    // House scores — only the domain-relevant ones listed by section
    houses: {
      health: { H1: hs[1], H6: hs[6], H8: hs[8], H12: hs[12] },
      wealth: { H2: hs[2], H5: hs[5], H8: hs[8], H11: hs[11] },
      career: { H6: hs[6], H10: hs[10], H11: hs[11] },
      cosmic: { H1: hs[1], H5: hs[5], H9: hs[9], H12: hs[12] },
    },
    // Divisional chart signs for specific sections only
    divCharts: {
      D1: d1Signs,
      D9: d9Signs,
      D10: d10Signs,
    },
    // Timing windows (top 6 support, top 6 caution)
    timing: {
      support: supportDays.slice(0, 6),
      caution: cautionDays.slice(0, 6),
    },
    // Active yogas
    yogas,
  };

  return {
    monthName,
    context,
    // Expose timing and transit data for PDF rendering (not sent to LLM, used by PDF directly)
    timingData: {
      supportDays: supportDays.slice(0, 8),
      cautionDays: cautionDays.slice(0, 8),
      transits: currentTransits,
    },
  };
}

// ---------------------------------------------------------------------------
// 2. buildPrompt()
//    Assembles the compact unified context into a GPT instruction prompt.
//    Key optimizations:
//      - Single JSON.stringify (no indent) for data section
//      - Output rules stated once in prompt text (not repeated in payload)
//      - All section instructions in clear prose, not duplicated JSON
// ---------------------------------------------------------------------------
function buildPrompt(monthlyPayload) {
  const ctx = monthlyPayload.context;
  // Compact JSON — no pretty-print indentation
  const dataJson = JSON.stringify(ctx);

  return `You are an elite Vedic and KP astrologer. Generate a personalised monthly horoscope for ${ctx.month}.

Prompt: Generate the yearly astrology report strictly from the supplied kundli JSON and do not invent or assume any astrological detail that is not directly supported by the data. Treat the chart data as the only source of truth. Use correct house significations: the 2nd house should cover wealth, family, speech, food habits, and accumulated resources, while education, intelligence, learning ability, creativity, children, romance, speculation, and past-life merit should be described under the 5th house. Do not mention “early education” under the 2nd house. Before mentioning any yoga in monthly or yearly predictions, verify that it exists in the provided yoga analysis and that it is relevant and active for the specific period being described; never insert Gaja Kesari Yoga or any other yoga unless it is explicitly supported by the chart data and timing logic. For planetary status, do not use only direct/retrograde motion; also calculate and display combustion and other relevant conditions such as exaltation, debilitation, own sign, and similar dignities where applicable. If Mercury is within combustion range of the Sun, mark Mercury as Combust even if its motion is Direct. Remedies must be generated from the chart condition, not from a generic template; when Mercury is significant, afflicted, combust, or dasha-relevant, include Mercury-specific remedies such as offering 21 durva grass to Lord Ganesha every Wednesday and reciting Ganpati Atharvashirsha. Keep all monthly predictions, house descriptions, yogas, and remedies fully grounded in the actual planetary positions, dasha periods, transits, ashtakavarga, and validated yoga analysis. If a statement cannot be justified from the supplied data, omit it.

ASTROLOGICAL CONTEXT (JSON):
${dataJson}

FIELD KEY: native=birth info, kundli=natal chart basics (asc=ascendant), dasha=current Vimshottari period (maha/antar/pratya), birthPlanets={s=sign,h=house,status=planetary status (including combustion/dignity)}, transits=current planet movements (retro=retrograde), houses=Ashtakvarga SAV scores by life domain, divCharts=divisional chart sign placements, timing={support=favourable dates,caution=cautious dates}, yogas=active natal yogas.

WRITING RULES:
1. NO emojis under any circumstance.
2. Every narrative field: EXACTLY 3-4 complete sentences. Be specific to this native's actual planetary data — reference signs, houses, dasha lords by name.
3. Avoid generic horoscope language. Use the actual birth planet placements and transit data provided.
4. Return STRICT JSON only — no markdown wrappers, no text before/after.

REQUIRED JSON OUTPUT:
{
  "cosmicOverview": {
    "currentCosmicEnergy": "3-4 sentences: big picture planetary energies and current dasha theme.",
    "majorYogas": "3-4 sentences: active yogas and their monthly effect.",
    "planetaryStrengths": "3-4 sentences: strongest and weakest planets by house scores and transits.",
    "houseScores": "3-4 sentences: key Ashtakvarga house score analysis for this month.",
    "spiritualGuidance": "3-4 sentences: spiritual counsel based on Rahu/Ketu/Ketu axis and dasha.",
    "tldr": "1-2 sentences: cosmic overview summary."
  },
  "transitTable": {
    "astrologicalOverview": "3-4 sentences: transit-driven changes this month.",
    "planetaryTransits": "3-4 sentences: key planet movements and house effects.",
    "currentDashaAnalysis": "3-4 sentences: mahadasha/antardasha influence this month.",
    "goldenWindows": "3-4 sentences: highest-energy windows for action.",
    "remedialGuidance": "3-4 sentences: transit-based spiritual practices.",
    "tldr": "1-2 sentences: transit summary."
  },
  "auspiciousDays": {
    "favorableTiming": "3-4 sentences: specific favourable day windows.",
    "unfavorableTiming": "3-4 sentences: caution/avoid windows.",
    "bestDatesAction": "3-4 sentences: best dates for major actions.",
    "daysAvoid": "3-4 sentences: specific days to avoid decisions.",
    "remedialGuidance": "3-4 sentences: fasting and ritual guidance.",
    "tldr": "1-2 sentences: timing summary."
  },
  "career": {
    "currentDashaImpact": "3-4 sentences: dasha lord effect on professional life.",
    "opportunitiesChallenges": "3-4 sentences: key career opportunities and challenges.",
    "luckyWeeks": "3-4 sentences: best weeks for negotiation or leadership.",
    "careerRemedies": "3-4 sentences: mantras and practical career remedies.",
    "tldr": "1-2 sentences: career outlook."
  },
  "wealth": {
    "financialOverview": "3-4 sentences: earnings, investments, savings potential.",
    "weeklyOpportunityRisk": "3-4 sentences: weekly financial risk and opportunity windows.",
    "incomeSavings": "3-4 sentences: financial discipline and budget guidance.",
    "bestTiming": "3-4 sentences: optimal dates for investments or purchases.",
    "remedies": "3-4 sentences: specific wealth remedies and charity acts.",
    "tldr": "1-2 sentences: wealth status."
  },
  "health": {
    "overview": "3-4 sentences: overall vitality, digestion, stress factors.",
    "weeklyPattern": "3-4 sentences: week-by-week health risk indicators.",
    "riskPeriods": "3-4 sentences: dates of low vitality or medical timing advice.",
    "bestTiming": "3-4 sentences: best dates for checkups or diet corrections.",
    "remedies": "3-4 sentences: health remedies, diet alignments, physical balance.",
    "tldr": "1-2 sentences: health summary."
  },
  "relationship": {
    "overview": "3-4 sentences: household harmony and communication flow.",
    "transitInfluence": "3-4 sentences: Venus/Mars transit effect on relationships.",
    "harmonyPeriods": "3-4 sentences: key days for romance and reconciliation.",
    "remedies": "3-4 sentences: remedies for interpersonal peace.",
    "tldr": "1-2 sentences: relationship summary."
  },
  "remedies": {
    "remediesByArea": "3-4 sentences: specific remedies for health, wealth, career.",
    "whoShouldFollow": "3-4 sentences: who in the family should engage these practices.",
    "tldr": "1-2 sentences: remedy guide summary."
  },
  "overallSummary": {
    "monthlySummary": "3-4 sentences: integrated monthly guidance for this native."
  }
}`;
}

// ---------------------------------------------------------------------------
// 3. generateMonthlyPredictions()
//    Calls OpenAI for one month's predictions.
// ---------------------------------------------------------------------------
async function generateMonthlyPredictions(monthlyPayload, userId) {
  const prompt = buildPrompt(monthlyPayload);

  console.log(`[YearlyReportService] Calling OpenAI for month: ${monthlyPayload.monthName}...`);
  // Log approximate prompt character count for monitoring
  console.log(`[YearlyReportService] Prompt chars for ${monthlyPayload.monthName}: ${prompt.length}`);

  const startTime = Date.now();
  const response = await createChatCompletion(
    {
      model: CHAT_MODEL,
      messages: [
        {
          role: "system",
          content: "You are an elite Vedic and KP astrologer. Return strict JSON predictions with exactly 3-4 sentences per narrative field. No emojis. No markdown wrappers."
        },
        {
          role: "user",
          content: prompt
        }
      ],
      temperature: 0.7,
      max_tokens: 4000,
      response_format: { type: "json_object" }
    },
    { feature: "yearly_kundali_report_month", userId }
  );

  const duration = Date.now() - startTime;
  const content = response?.choices?.[0]?.message?.content?.trim();
  if (!content) {
    throw new Error(`No prediction response returned from OpenAI for ${monthlyPayload.monthName}`);
  }

  // console.log(`[YearlyReportService] OpenAI Response for ${monthlyPayload.monthName}:`);
  // console.log(content);
  console.log(`[YearlyReportService] LLM response received successfully for ${monthlyPayload.monthName}. Time taken: ${duration} ms`);

  try {
    return JSON.parse(content);
  } catch (err) {
    console.error(`[YearlyReportService] Failed to parse GPT response for ${monthlyPayload.monthName}:`, content);
    throw new Error(`Invalid JSON returned by GPT model for ${monthlyPayload.monthName}`);
  }
}

// ---------------------------------------------------------------------------
// 4. generateYearlyReport()
//    Runs 12 concurrent OpenAI completions to assemble the entire yearly report.
// ---------------------------------------------------------------------------
async function generateYearlyReport(kundli, year, timezone, lat, lng, userRequest) {
  console.log(`[YearlyReportService] Starting yearly report generation for year ${year}...`);

  // Build payloads for all 12 months in parallel
  const monthlyPayloads = await Promise.all(
    MONTHS.map((monthName, idx) =>
      buildMonthlyPayload(kundli, monthName, idx, year, timezone, lat, lng, userRequest)
    )
  );

  // Run 12 parallel OpenAI API calls
  const predictions = await Promise.all(
    monthlyPayloads.map(payload =>
      generateMonthlyPredictions(payload, userRequest.userId)
    )
  );

  // Map predictions and timing data to their respective months
  const monthlyPredictions = {};
  const monthlyTimingData = {};
  MONTHS.forEach((monthName, idx) => {
    monthlyPredictions[monthName] = predictions[idx];
    monthlyTimingData[monthName] = monthlyPayloads[idx].timingData;
  });

  // ── Extract base kundli details ─────────────────────────────────────────
  const moonSign = kundli?.basicDetails?.moon_sign || kundli?.horoscope?.moon_sign || null;
  let ascendant = kundli?.basicDetails?.ascendant?.sign || kundli?.basicDetails?.ascendant || null;
  if (typeof ascendant === "object" && ascendant !== null) ascendant = ascendant.sign;
  if (!ascendant) ascendant = kundli?.astroDetails?.ascendant?.sign || null;

  const dashaObj = kundli.dasha || {};
  const moonPlanet = kundli.planetary?.planets?.Moon || {};
  const panchangObj = kundli.panchang || {};

  // Resolve Nakshatra Name
  let nakshatra = dashaObj.birth_nakshatra || dashaObj.birthNakshatra || moonPlanet.nakshatra || null;
  if (!nakshatra && panchangObj.nakshatra) {
    nakshatra = typeof panchangObj.nakshatra === "object" ? panchangObj.nakshatra.name : panchangObj.nakshatra;
  }

  // Resolve Nakshatra Lord
  let nakshatraLord = dashaObj.birth_nakshatra_lord || dashaObj.birthNakshatraLord || moonPlanet.nakshatra_lord || moonPlanet.nakshatraLord || null;
  if (!nakshatraLord && panchangObj.nakshatra?.lord) {
    nakshatraLord = panchangObj.nakshatra.lord;
  }
  if (!nakshatraLord && nakshatra) {
    nakshatraLord = getNakshatraLordByName(nakshatra);
  }

  // Resolve Nakshatra Pada
  let nakshatraPada = dashaObj.birth_nakshatra_pada || dashaObj.birthNakshatraPada || moonPlanet.nakshatra_pada || moonPlanet.nakshatraPada || moonPlanet.pada || null;
  if (!nakshatraPada && panchangObj.nakshatra?.pada) {
    nakshatraPada = panchangObj.nakshatra.pada;
  }

  const astrologicalDetails = {
    ascendant,
    moonSign,
    sunSign: kundli?.basicDetails?.sun_sign || null,
    nakshatra,
    nakshatraLord,
    nakshatraPada,
  };

  const personalInformation = {
    fullName: userRequest.fullName,
    dateOfbirth: userRequest.dateOfbirth,
    timeOfbirth: userRequest.timeOfbirth,
    placeOfBirth: userRequest.placeOfBirth,
    gender: userRequest.gender,
  };

  const energyMetrics = {
    shadbala: {
      strongestPlanets: ["Sun", "Mercury"],
      weakestPlanets: ["Mars"],
      scores: getHouseScores(kundli.ashtakavarga?.sav, ascendant),
    },
    ashtakvarga: kundli.ashtakavarga || null,
  };

  const horoscopeCharts = {
    rasiChart: kundli.charts?.D1 || null,
    horaChart: kundli.charts?.D2 || null,
    navamsaChart: kundli.charts?.D9 || null,
    dasamsaChart: kundli.charts?.D10 || null,
  };

  const currentDasha = extractDashaData(kundli, `${year}-01-01`);

  // ── Birth Planetary Table (all 9 planets for PDF page 10) ───────────────
  const bPlanets = kundli.planetary || {};
  const sunPl = getKeyPlanetPlacement(bPlanets, "Sun");
  const sunL = sunPl ? getAbsoluteLongitude(sunPl, "Sun") : null;
  const PLANET_NAMES = ["Sun", "Moon", "Mars", "Mercury", "Jupiter", "Venus", "Saturn", "Rahu", "Ketu"];
  const birthPlanetaryTable = PLANET_NAMES.map(name => {
    const p = getKeyPlanetPlacement(bPlanets, name);
    p.absoluteLongitude = getAbsoluteLongitude(p, name);
    const status = getPlanetaryStatus(name, p, sunL);
    return {
      planet: name,
      sign: p.sign,
      house: p.house,
      degree: p.degree,
      isRetrograde: p.isRetrograde,
      status: status
    };
  });

  // ── Yoga Summary (top 5 yogas for PDF display) ──────────────────────────
  const yogaSummary = (Array.isArray(kundli.yogas) ? kundli.yogas : [])
    .slice(0, 5)
    .map(y => ({
      name: y.name || "—",
      strength: y.strength || "Moderate",
      effect: y.effects || y.description || "—",
    }));

  // ── Disclaimer ──────────────────────────────────────────────────────────
  const disclaimer = `## Disclaimer

This Yearly Vedic Astrology Report is generated using astrological calculations, planetary positions, transit analysis, and Dasha-based interpretations.

Astrology is intended to provide guidance, insights, and possible trends based on celestial patterns. It should not be considered a guarantee of future events or outcomes. Individual experiences may vary depending on personal choices, circumstances, and free will.

The information provided in this report is for informational, self-reflection, and entertainment purposes only. Any suggestions, timing guidance, or recommendations are meant to help you make more informed decisions and should not be treated as professional advice.

Graho does not provide medical, legal, financial, psychological, or other professional services. For important decisions relating to health, finances, business, legal matters, or personal safety, please consult a qualified professional.

While every effort is made to ensure accurate astrological calculations and interpretations, Graho makes no warranties regarding the completeness, accuracy, or reliability of any prediction, forecast, or recommendation. No specific result or outcome is guaranteed.

By accessing and using this report, you acknowledge that all decisions and actions taken based on its contents are solely your responsibility.

May this report serve as a source of awareness, reflection, and guidance as you navigate your year.`;

  // ── Static introductory content (pages 2-7 of the PDF) ─────────────────
  const introContent = {
    aboutReport: `Welcome to your personalised Vedic Astrology Yearly Roadmap for ${year}. This comprehensive report has been meticulously prepared using your exact birth details — date, time, and place of birth — to create a highly personalised astrological forecast.\n\nThis report analyses 12 months of your life through the lens of Vedic (Jyotish) and KP astrology. Each month covers eight critical life domains: Cosmic Overview, Transit Analysis, Auspicious Timing, Career, Wealth, Health, Relationships, and Remedies.\n\nThe predictions in this report are derived from your natal chart (Rasi), divisional charts (Hora D2, Navamsa D9, Dasamsa D10), Vimshottari Dasha cycles, Ashtakvarga scores, and real-time planetary transits computed for each month of ${year}.\n\nUse this report as a strategic guide — not a rigid destiny map. The planetary energies described here represent tendencies and opportunities. Your free will, effort, and choices ultimately shape your outcomes. May this roadmap illuminate your path forward.`,

    howToRead: `This report is divided into clearly structured sections for easy navigation. The first section presents your birth details, cosmic identity, active Dasha periods, and natal horoscope charts. This establishes the foundation upon which all predictions are built.\n\nThe monthly prediction sections form the core of this report. Each month begins with a full-page artistic illustration, followed by dedicated pages for each life domain. Every section contains detailed analysis backed by your actual planetary positions and transit data.\n\nWhen you encounter tables with dates, these represent calculated windows of opportunity or caution based on Moon transits through your houses. Favourable dates align with trinal and angular house transits, while caution dates correspond to dusthana (6th, 8th, 12th) house transits.\n\nThe remedies section at the end of each month provides actionable spiritual practices, mantras, and lifestyle adjustments tailored to your chart. These are traditional Vedic prescriptions designed to strengthen weak planetary influences and enhance positive ones.`,

    vedicAstrologyIntro: `Vedic Astrology, known as Jyotish Shastra, is one of the oldest systems of astronomical observation and prediction, originating in ancient India over 5,000 years ago. Unlike Western astrology which uses the Tropical zodiac, Vedic astrology employs the Sidereal zodiac, accounting for the precession of equinoxes.\n\nThe foundation of Jyotish lies in the belief that celestial bodies — the Sun, Moon, Mars, Mercury, Jupiter, Venus, Saturn, and the lunar nodes Rahu and Ketu — exert measurable influences on human affairs. These nine celestial bodies, called the Navagraha, govern different aspects of life through their placement in the twelve houses and signs of the zodiac.\n\nA birth chart (Kundli) is a snapshot of the sky at the exact moment and location of your birth. It maps the positions of all nine planets across twelve houses, each governing specific life domains such as personality, wealth, communication, home, creativity, health, partnerships, transformation, fortune, career, gains, and spiritual liberation.\n\nThis report also incorporates the KP (Krishnamurti Paddhati) system, a modern refinement of Vedic astrology that uses sub-lords and cuspal analysis for precise timing of events. The combination of traditional Parashari methods with KP techniques provides a comprehensive and accurate predictive framework.`,

    dashaSystems: `The Vimshottari Dasha system is the most widely used predictive timing tool in Vedic Astrology. It divides your life into planetary periods totalling 120 years, with each planet ruling a specific number of years. The sequence is: Ketu (7 years), Venus (20 years), Sun (6 years), Moon (10 years), Mars (7 years), Rahu (18 years), Jupiter (16 years), Saturn (19 years), and Mercury (17 years).\n\nYour starting Dasha is determined by the Moon's position in its birth Nakshatra at the exact moment of your birth. Each major period (Mahadasha) is further subdivided into sub-periods (Antardasha) and sub-sub-periods (Pratyantardasha), creating a layered system of planetary influence.\n\nDuring any given period, the Mahadasha lord sets the overarching theme of your life, while the Antardasha lord colours the specific experiences within that theme. The Pratyantardasha provides even finer timing for events. Understanding your current Dasha configuration is essential for interpreting the monthly predictions in this report.\n\nThe interplay between Dasha lords and transiting planets creates unique windows of opportunity and challenge. When a benefic Dasha lord is supported by favourable transits, results tend to be positive. Conversely, a malefic Dasha lord combined with challenging transits requires greater caution and the application of remedial measures.`,

    housesAndSigns: [
      { house: 1, name: "Lagna (Ascendant)", signification: "Self, personality, physical body, health, vitality, and overall life direction" },
      { house: 2, name: "Dhana Bhava", signification: "Wealth, family, speech, food habits, and accumulated resources" },
      { house: 3, name: "Sahaja Bhava", signification: "Siblings, courage, communication, short travels, skills, and self-effort" },
      { house: 4, name: "Sukha Bhava", signification: "Mother, home, property, vehicles, emotional peace, and domestic happiness" },
      { house: 5, name: "Putra Bhava", signification: "Education, intelligence, learning ability, creativity, children, romance, speculation, and past-life merit" },
      { house: 6, name: "Ripu Bhava", signification: "Enemies, diseases, debts, service, competition, and daily work routine" },
      { house: 7, name: "Kalatra Bhava", signification: "Marriage, partnerships, business associates, public dealings, and contracts" },
      { house: 8, name: "Randhra Bhava", signification: "Longevity, sudden events, inheritance, occult knowledge, and transformation" },
      { house: 9, name: "Dharma Bhava", signification: "Fortune, higher learning, father, long journeys, spirituality, and divine grace" },
      { house: 10, name: "Karma Bhava", signification: "Career, profession, reputation, authority, achievements, and public status" },
      { house: 11, name: "Labha Bhava", signification: "Gains, income, social network, elder siblings, aspirations, and fulfilment" },
      { house: 12, name: "Vyaya Bhava", signification: "Losses, expenses, foreign lands, spiritual liberation, and subconscious mind" },
    ],

    planetsGuide: [
      { planet: "Sun (Surya)", rules: "Leo", nature: "Royal, authoritative", governs: "Soul, father, government, vitality, leadership, and self-confidence" },
      { planet: "Moon (Chandra)", rules: "Cancer", nature: "Nurturing, emotional", governs: "Mind, mother, emotions, fertility, public image, and mental peace" },
      { planet: "Mars (Mangal)", rules: "Aries & Scorpio", nature: "Aggressive, courageous", governs: "Energy, siblings, property, courage, surgery, and military affairs" },
      { planet: "Mercury (Budh)", rules: "Gemini & Virgo", nature: "Intellectual, communicative", governs: "Intelligence, speech, commerce, education, writing, and analysis" },
      { planet: "Jupiter (Guru)", rules: "Sagittarius & Pisces", nature: "Benevolent, expansive", governs: "Wisdom, children, wealth, spirituality, teaching, and divine grace" },
      { planet: "Venus (Shukra)", rules: "Taurus & Libra", nature: "Luxurious, artistic", governs: "Love, marriage, beauty, art, vehicles, luxury, and material comfort" },
      { planet: "Saturn (Shani)", rules: "Capricorn & Aquarius", nature: "Disciplined, restrictive", governs: "Discipline, longevity, delays, karma, service, and hard work" },
      { planet: "Rahu (North Node)", rules: "Aquarius (Co-ruler)", nature: "Illusory, ambitious", governs: "Foreign matters, obsession, unconventional paths, and material desires" },
      { planet: "Ketu (South Node)", rules: "Scorpio (Co-ruler)", nature: "Spiritual, detaching", governs: "Spiritual liberation, past lives, mysticism, and sudden events" },
    ],
  };

  return {
    year,
    personalInformation,
    astrologicalDetails,
    coreCosmicIdentity: astrologicalDetails,
    dashaCycles: {
      mahadasha: currentDasha.mahadasha,
      antardasha: currentDasha.antardasha,
      pratyantardasha: currentDasha.pratyantardasha ?? null,
      system: currentDasha.system,
      fullDasha: currentDasha,
    },
    energyMetrics,
    horoscopeCharts,
    birthPlanetaryTable,
    yogaSummary,
    predictions: monthlyPredictions,
    monthlyTimingData,
    introContent,
    disclaimer,
  };
}

module.exports = {
  buildBasePayload: () => ({}), // kept for backward compat
  buildMonthlyPayload,
  generateMonthlyPredictions,
  generateYearlyReport,
};
