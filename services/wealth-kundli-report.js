const { extractDashaData } = require("./daily-kundli-report");
const { createChatCompletion } = require("./openaiClient");
const { getAllCharts, getAshtakavarga } = require("./astroEngineService");

const CHAT_MODEL = process.env.OPENAI_CHAT_MODEL || "gpt-4o-mini";

const VIMSHOTTARI_SEQUENCE = ['Ketu', 'Venus', 'Sun', 'Moon', 'Mars', 'Rahu', 'Jupiter', 'Saturn', 'Mercury'];
const VIMSHOTTARI_PERIODS = { Ketu: 7, Venus: 20, Sun: 6, Moon: 10, Mars: 7, Rahu: 18, Jupiter: 16, Saturn: 19, Mercury: 17 };

/**
 * Calculates the next two mahadasha cycles based on sequence
 */
function getNextDashas(currentMaha, mahaEndStr) {
  const next1 = { mahadasha: "Unknown", antardasha: "All Antardashas", start: "N/A", end: "N/A", wealthImpact: "Analysis by LLM" };
  const next2 = { mahadasha: "Unknown", antardasha: "All Antardashas", start: "N/A", end: "N/A", wealthImpact: "Analysis by LLM" };

  if (!currentMaha || !mahaEndStr) return [next1, next2];

  const currentIdx = VIMSHOTTARI_SEQUENCE.indexOf(currentMaha);
  if (currentIdx === -1) return [next1, next2];

  const next1_maha = VIMSHOTTARI_SEQUENCE[(currentIdx + 1) % 9];
  const next2_maha = VIMSHOTTARI_SEQUENCE[(currentIdx + 2) % 9];

  try {
    const endOffset1 = VIMSHOTTARI_PERIODS[next1_maha];
    const endOffset2 = VIMSHOTTARI_PERIODS[next2_maha];

    const start1 = new Date(mahaEndStr + 'T00:00:00');
    const end1 = new Date(start1);
    end1.setFullYear(end1.getFullYear() + endOffset1);

    const start2 = new Date(end1);
    const end2 = new Date(start2);
    end2.setFullYear(end2.getFullYear() + endOffset2);

    next1.mahadasha = next1_maha;
    next1.start = start1.toISOString().slice(0, 10);
    next1.end = end1.toISOString().slice(0, 10);

    next2.mahadasha = next2_maha;
    next2.start = start2.toISOString().slice(0, 10);
    next2.end = end2.toISOString().slice(0, 10);
  } catch (err) {
    console.error("getNextDashas error:", err);
  }

  return [next1, next2];
}

/**
 * Calculates all 9 mahadasha cycles and their respective antardashas programmatically
 */
function calculateAllDashas(dashaObj) {
  const dashas = Array.isArray(dashaObj?.dashas) ? dashaObj.dashas : Array.isArray(dashaObj?.major_dashas) ? dashaObj.major_dashas : [];
  if (dashas.length === 0) return [];

  return dashas.map(period => {
    const mahaPlanet = period.planet || period.lord || null;
    const mahaStartStr = period.start_date || period.start || null;
    const mahaEndStr = period.end_date || period.end || null;
    const antardashas = [];

    if (mahaPlanet && mahaStartStr && mahaEndStr) {
      try {
        const mahaStart = new Date(mahaStartStr + 'T00:00:00');
        const mahaEnd = new Date(mahaEndStr + 'T00:00:00');
        const mahaTotalDays = (mahaEnd - mahaStart) / (1000 * 60 * 60 * 24);

        const mahaStartIndex = VIMSHOTTARI_SEQUENCE.indexOf(mahaPlanet);
        if (mahaStartIndex !== -1) {
          let currentStart = new Date(mahaStart);

          for (let i = 0; i < 9; i++) {
            const planet = VIMSHOTTARI_SEQUENCE[(mahaStartIndex + i) % 9];
            const periodYears = VIMSHOTTARI_PERIODS[planet];
            const proportion = periodYears / 120;
            const antarDays = Math.round(mahaTotalDays * proportion);

            const currentEnd = new Date(currentStart);
            currentEnd.setDate(currentEnd.getDate() + antarDays);

            if (i === 8) {
              currentEnd.setTime(mahaEnd.getTime());
            }

            antardashas.push({
              planet,
              start: currentStart.toISOString().slice(0, 10),
              end: currentEnd.toISOString().slice(0, 10)
            });

            currentStart = new Date(currentEnd);
          }
        }
      } catch (err) {
        console.error("calculateAllDashas period error:", err);
      }
    }

    return {
      mahadasha: mahaPlanet,
      start: mahaStartStr,
      end: mahaEndStr,
      antardashas
    };
  });
}

/**
 * Builds house-by-house summary for critical wealth houses (2, 6, 10, 11, 12)
 */
function getHouseSummary(kundli) {
  let ascendant = kundli?.basicDetails?.ascendant?.sign || kundli?.basicDetails?.ascendant || null;
  if (typeof ascendant === "object" && ascendant !== null) ascendant = ascendant.sign;
  if (!ascendant) ascendant = kundli?.astroDetails?.ascendant?.sign || "Aries";

  const SIGNS = ["Aries", "Taurus", "Gemini", "Cancer", "Leo", "Virgo", "Libra", "Scorpio", "Sagittarius", "Capricorn", "Aquarius", "Pisces"];
  let ascIdx = SIGNS.map(s => s.toLowerCase()).indexOf(String(ascendant).toLowerCase());
  if (ascIdx === -1) ascIdx = 0;

  const houseSummary = {};
  const housePlanets = {};
  for (let h = 1; h <= 12; h++) {
    housePlanets[h] = [];
  }

  const planetsObj = kundli.planetary?.planets || {};
  const planetHouses = kundli.planetary?.planet_houses || {};
  Object.entries(planetsObj).forEach(([planetName, planetVal]) => {
    if (planetName === "Ascendant" || planetName === "ascendant") return;
    const h = planetHouses[planetName] || planetVal?.house;
    if (h >= 1 && h <= 12) {
      housePlanets[h].push(planetName);
    }
  });

  const targetHouses = [2, 6, 10, 11, 12];
  targetHouses.forEach(h => {
    const signIdx = (ascIdx + h - 1) % 12;
    const signName = SIGNS[signIdx];
    const planetsInHouse = housePlanets[h];
    houseSummary[`house${h}`] = `Sign: ${signName}. Planets: ${planetsInHouse.length > 0 ? planetsInHouse.join(", ") : "None"}`;
  });

  return houseSummary;
}

/**
 * Builds planetary position summaries for the natal chart
 */
function getPlanetSummary(kundli) {
  const planetsObj = kundli.planetary?.planets || {};
  const planetHouses = kundli.planetary?.planet_houses || {};
  const planetSummary = {};

  const PLANET_KEYS = ["sun", "moon", "mars", "mercury", "jupiter", "venus", "saturn", "rahu", "ketu"];
  PLANET_KEYS.forEach(pk => {
    const matchedKey = Object.keys(planetsObj).find(k => k.toLowerCase() === pk);
    if (matchedKey && planetsObj[matchedKey]) {
      const p = planetsObj[matchedKey];
      const h = planetHouses[matchedKey] || p.house || 1;
      const isRetro = p.is_retrograde || p.isRetrograde || false;
      planetSummary[pk] = `Placed in ${p.sign || "Unknown"} in house ${h}${isRetro ? " (Retrograde)" : ""}`;
    } else {
      planetSummary[pk] = "Placement unknown";
    }
  });

  return planetSummary;
}

/**
 * Maps Ashtakavarga scores relative to the ascendant
 */
function getAshtakavargaSummary(kundli) {
  let ascendant = kundli?.basicDetails?.ascendant?.sign || kundli?.basicDetails?.ascendant || null;
  if (typeof ascendant === "object" && ascendant !== null) ascendant = ascendant.sign;
  if (!ascendant) ascendant = kundli?.astroDetails?.ascendant?.sign || "Aries";

  const SIGNS = ["Aries", "Taurus", "Gemini", "Cancer", "Leo", "Virgo", "Libra", "Scorpio", "Sagittarius", "Capricorn", "Aquarius", "Pisces"];
  let ascIdx = SIGNS.map(s => s.toLowerCase()).indexOf(String(ascendant).toLowerCase());
  if (ascIdx === -1) ascIdx = 0;

  const sav = kundli.ashtakvarga?.sav || [];

  const getScore = (houseNum) => {
    const signIdx = (ascIdx + houseNum - 1) % 12;
    if (Array.isArray(sav)) {
      const val = sav[signIdx];
      return typeof val === "number" ? val : (val?.points ?? 28);
    }
    return 28;
  };

  const house2 = getScore(2);
  const house6 = getScore(6);
  const house10 = getScore(10);
  const house11 = getScore(11);
  const house12 = getScore(12);
  const total = (Array.isArray(sav) ? sav.reduce((sum, item) => sum + (typeof item === 'number' ? item : (item?.points ?? 0)), 0) : 337) || 337;

  return {
    total,
    house2,
    house6,
    house10,
    house11,
    house12
  };
}

/**
 * Builds the compact reportInput payload
 */
const EXALTATION_SIGNS = {
  Sun: "Aries", Moon: "Taurus", Mars: "Capricorn", Mercury: "Virgo", Jupiter: "Cancer", Venus: "Pisces", Saturn: "Libra"
};

const DEBILITATION_SIGNS = {
  Sun: "Libra", Moon: "Scorpio", Mars: "Cancer", Mercury: "Pisces", Jupiter: "Capricorn", Venus: "Virgo", Saturn: "Aries"
};

const OWN_SIGNS = {
  Sun: ["Leo"], Moon: ["Cancer"], Mars: ["Aries", "Scorpio"], Mercury: ["Gemini", "Virgo"], Jupiter: ["Sagittarius", "Pisces"], Venus: ["Taurus", "Libra"], Saturn: ["Capricorn", "Aquarius"]
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
  const limits = { Moon: 12, Mars: 17, Mercury: isRetrograde ? 12 : 14, Jupiter: 11, Venus: isRetrograde ? 8 : 10, Saturn: 15 };
  const limit = limits[planetName];
  return limit ? diff <= limit : false;
}

function getPlanetaryStatus(name, p, sunLon) {
  if (name === "Ascendant") return "Direct";
  const statusParts = [];
  if (name !== "Sun" && name !== "Rahu" && name !== "Ketu") {
    if (p.isRetrograde) statusParts.push("Retrograde");
    else statusParts.push("Direct");
  } else if (name === "Rahu" || name === "Ketu") {
    statusParts.push("Retrograde");
  } else {
    statusParts.push("Direct");
  }
  if (sunLon !== null && name !== "Sun") {
    const planetLon = p.absoluteLongitude;
    if (isPlanetCombust(name, planetLon, sunLon, p.isRetrograde)) {
      statusParts.push("Combust");
    }
  }
  const sign = p.sign;
  if (EXALTATION_SIGNS[name] === sign) statusParts.push("Exalted");
  else if (DEBILITATION_SIGNS[name] === sign) statusParts.push("Debilitated");
  else if (OWN_SIGNS[name] && OWN_SIGNS[name].includes(sign)) statusParts.push("Own Sign");
  return statusParts.join(", ");
}

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

/**
 * Builds the compact reportInput payload
 */
function buildWealthReportPayload(kundli, userRequest) {
  const dashaSummary = extractDashaData(kundli, new Date());
  const nextDashas = getNextDashas(dashaSummary.mahadasha, dashaSummary.mahaEnd);

  const houseSummary = getHouseSummary(kundli);
  const planetSummary = getPlanetSummary(kundli);
  const ashtakvargaSummary = getAshtakavargaSummary(kundli);

  // Calculate approximate age
  let age = 30;
  if (userRequest.dateOfbirth) {
    age = new Date().getFullYear() - new Date(userRequest.dateOfbirth).getFullYear();
  }

  const moonSign = kundli?.basicDetails?.moon_sign || kundli?.horoscope?.moon_sign || null;
  let ascendant = kundli?.basicDetails?.ascendant?.sign || kundli?.basicDetails?.ascendant || null;
  if (typeof ascendant === "object" && ascendant !== null) ascendant = ascendant.sign;
  if (!ascendant) ascendant = kundli?.astroDetails?.ascendant?.sign || "Aries";

  const activeYogas = (Array.isArray(kundli.yogas) ? kundli.yogas : [])
    .slice(0, 3)
    .map(y => ({
      name: y.name || "Dhana Yoga",
      strength: y.strength || "medium",
      effect: y.effects || y.description || "wealth accumulation support"
    }));

  if (activeYogas.length === 0) {
    activeYogas.push(
      { name: "Dhana Yoga", strength: "strong", effect: "wealth accumulation" },
      { name: "Lakshmi Yoga", strength: "medium", effect: "prosperity support" }
    );
  }

  // Concise remedies summary
  const gemstonesVal = kundli.remedies?.gemstones || "Wear Yellow Sapphire on Thursday for Jupiter strengths.";
  const rudrakshaVal = kundli.remedies?.rudraksha || "Wear 5 Mukhi Rudraksha.";

  return {
    reportType: "wealth",
    language: "en",
    style: {
      tone: "premium-astrology",
      role: "writer_only",
      avoidGenericFiller: true,
      useAstroTerminology: true
    },
    client: {
      name: userRequest.fullName,
      age,
      gender: userRequest.gender
    },
    astrology: {
      ascendant,
      moonSign,
      sunSign: kundli?.basicDetails?.sun_sign || null,
      nakshatra: kundli?.astroDetails?.nakshatra || null,
      currentDasha: {
        mahadasha: dashaSummary.mahadasha,
        antardasha: dashaSummary.antardasha,
        pratyantardasha: dashaSummary.pratyantardasha || null,
        start: dashaSummary.antarStart || dashaSummary.mahaStart,
        end: dashaSummary.antarEnd || dashaSummary.mahaEnd,
        wealthImpact: "Focus period for material growth"
      },
      nextImportantDashas: [
        {
          mahadasha: nextDashas[0].mahadasha,
          antardasha: nextDashas[0].antardasha,
          start: nextDashas[0].start,
          end: nextDashas[0].end,
          wealthImpact: "Transition phase for asset expansion"
        },
        {
          mahadasha: nextDashas[1].mahadasha,
          antardasha: nextDashas[1].antardasha,
          start: nextDashas[1].start,
          end: nextDashas[1].end,
          wealthImpact: "Period of compounding and stability"
        }
      ],
      wealthHouses: {
        house2: houseSummary.house2,
        house6: houseSummary.house6,
        house10: houseSummary.house10,
        house11: houseSummary.house11,
        house12: houseSummary.house12
      },
      keyPlanets: {
        sun: planetSummary.sun,
        moon: planetSummary.moon,
        mars: planetSummary.mars,
        mercury: planetSummary.mercury,
        jupiter: planetSummary.jupiter,
        venus: planetSummary.venus,
        saturn: planetSummary.saturn,
        rahu: planetSummary.rahu,
        ketu: planetSummary.ketu
      },
      wealthYogas: activeYogas,
      ashtakvarga: ashtakvargaSummary
    },
    remedies: {
      gemstones: gemstonesVal,
      rudraksha: rudrakshaVal,
      mantras: "Chant 'Om Shreem Hreem Shreem Kamale Kamalalaye Praseed Praseed' 108 times daily.",
      behavioralAdvice: "Maintain structured accounting, avoid sudden speculative borrowing, and practice financial charity on Saturdays."
    }
  };
}

/**
 * Builds instructions prompt for GPT
 */
function buildPrompt(reportInput) {
  return `You are an elite Vedic financial astrologer. Generate a highly detailed, premium, and structured Wealth Report based on the provided astrological data.
  
=========================================
WEALTH REPORT INPUT DATA (JSON):
${JSON.stringify(reportInput)}
=========================================

CRITICAL WRITING INSTRUCTIONS:
1. Tone must be highly premium, elite, professional, and astro-literate.
2. Every narrative field (i.e. fields expecting text description, marked as "string" in outline) must contain exactly 10-12 high-quality sentences (~220-280 words). Do not return short sentences or generic placeholders.
3. Reference the native's actual chart details (signs, houses, planet placements) in the descriptions.
4. NO emojis under any circumstance.
5. Return STRICT JSON matching the expected structure. No markdown formatting or extra text.

EXPECTED JSON SCHEMA OUTLINES:
{
  "tableOfContents": {
    "section1": "Your Wealth Blueprint - A deep dive into core wealth traits, strengths, and areas of caution.",
    "section2": "Divisional Chart Placements - Detailed breakdowns of D1, D2, and D4 charts for money matters.",
    "section3": "Vimshottari Dasha Cycles - Overview of your Vimshottari dasha periods timeline.",
    "section4": "Money Direction & Flows - Review of how wealth flows, whether active or passive.",
    "section5": "How You Earn Best - Specific industry matching, work style, and optimal career profiles.",
    "section6": "Income Stability & Volatility - Spike curves, savings, and spikes vs salary stability.",
    "section7": "Financial Blocks & Remedies - Detailed problems, chart causes, and exact actions.",
    "section8": "Wealth Building Speed - Compounding speed, self-made potential, and windows.",
    "section9": "Risk, Loss & Debts - Speculative risk, emergency reserve, and debt metrics.",
    "section10": "Property & Assets Roadmap - Real estate holdings, luxury vehicles, and timings.",
    "section11": "Wealth Ceiling & Action Plan - Final verdict tier, best periods, 30-day and 1-year action plans."
  },
  "executiveSummary": {
    "strengths": ["string", "string", "string"],
    "risks": ["string", "string", "string"],
    "windows": ["string", "string"],
    "verdict": "string"
  },
  "wealthBlueprint": {
    "traits": "string",
    "weakPoints": "string",
    "archetype": "aggressive builder OR slow accumulator OR high-risk earner OR stable planner"
  },
  "divisionalAnalysis": {
    "d1Meaning": "string",
    "d2Meaning": "string",
    "d4Meaning": "string",
    "ashtakavargaMeaning": "string"
  },
  "moneyDirection": {
    "moneyStyle": "string (exactly 10-12 detailed, astro-literate sentences analyzing active vs passive money style)",
    "dashaEffect": "string (exactly 10-12 detailed sentences on how the active dasha cycles affect money direction)",
    "whatHelps": "string (exactly 10-12 detailed sentences on specific planetary placements accelerating wealth as lifting factors)",
    "whatSlows": "string (exactly 10-12 detailed sentences on specific planetary placements slowing down wealth as blocking factors)",
    "verdict": "string (exactly 10-12 detailed sentences outlining the money direction trajectory verdict)"
  },
  "howYouEarnBest": {
    "role": "string (exactly 10-12 detailed sentences on their optimal functional career role and activities)",
    "industry": "string (exactly 10-12 detailed sentences on aligned sectors, domains, and business/professional areas)",
    "workStyle": "string (exactly 10-12 detailed sentences on independent vs corporate/structured work style preference)",
    "topCareerPaths": ["string"],
    "bestBusinessTypes": ["string"],
    "skillsToMonetize": "string (exactly 10-12 detailed sentences listing and explaining the top astrological skills they must monetize)",
    "workEnvironments": "string (exactly 10-12 detailed sentences on ideal environment details, working conditions, and company size)",
    "whatToAvoid": "string (exactly 10-12 detailed sentences on functional roles, environments, or traps to avoid)",
    "careerMatrixTable": [
      { "type": "string", "why": "string", "strength": "string", "risk": "string" }
    ]
  },
  "incomeStability": {
    "pattern": "string",
    "preference": "string",
    "gainsArrival": "string",
    "fluctuations": "string",
    "primaryIncomeDriver": "string",
    "growthPattern": "string",
    "savingsStyle": "string",
    "riskStyle": "string",
    "managementAdvice": "string"
  },
  "wealthDashboard": {
    "earningPower": 85,
    "savingPower": 70,
    "riskLevel": 50,
    "propertyPotential": 80,
    "longTermPotential": 90,
    "oneLineSummary": "string"
  },
  "housePlanetsSummary": {
    "keyPlanetSummary": "string",
    "strongestHouse": "string",
    "weakHouse": "string",
    "liftingFactors": ["string"],
    "blockingFactors": ["string"]
  },
  "blocksRemedies": {
    "problemRemedies": [
      { "problem": "string", "cause": "string", "remedy": "string", "effect": "string" }
    ],
    "mantras": "string",
    "behaviorCorrections": "string",
    "dailyHabits": "string",
    "spiritualRemedies": "string",
    "practicalRemedies": "string"
  },
  "wealthSpeed": {
    "speedVerdict": "string (exactly 10-12 detailed sentences outlining the speed verdict and timeline factors)",
    "timelineCompound": "string (exactly 10-12 detailed sentences on compound speed milestones)",
    "sourceStyle": "string (exactly 10-12 detailed sentences on whether self-made or inheritance driven wealth potential)",
    "baseSpeed": "string (exactly 10-12 detailed sentences on baseline speed profile)",
    "currentMomentum": "string (exactly 10-12 detailed sentences on current timing acceleration indicators)",
    "compoundingAbility": "string (exactly 10-12 detailed sentences on compounding ability and long-term asset lock speed)",
    "accelerationWindow": "string (exactly 10-12 detailed sentences on the absolute best wealth acceleration windows)",
    "growthAdvice": "string (exactly 10-12 detailed sentences offering concrete advice to accelerate progress)"
  },
  "riskLossDebts": {
    "borrowingTendency": "string (exactly 10-12 detailed sentences analyzing debt and borrowing tendency profiles)",
    "speculativeRisk": "string (exactly 10-12 detailed sentences analyzing stock market, speculation, and lottery risk profiles)",
    "reserveAdvice": "string (exactly 10-12 detailed sentences advising on emergency reserve ratio and cash preservation)",
    "investmentStyle": "string (exactly 10-12 detailed sentences analyzing their optimal asset allocation and investment style)",
    "disciplineChecklist": ["string"],
    "riskLevel": "string",
    "debtToleranceTable": [
      { "type": "string", "status": "string" }
    ]
  },
  "propertyAssets": {
    "propertyPotential": "string (exactly 10-12 detailed sentences analyzing overall real estate and fixed asset purchase potential)",
    "holdingStyle": "string (exactly 10-12 detailed sentences on the best astrological asset holding structures)",
    "roadmap": "string (exactly 10-12 detailed sentences on when and how to build key fixed assets)",
    "assetPreference": [
      { "type": "string", "suitability": "string" }
    ],
    "holdingAdvice": "string (exactly 10-12 detailed sentences on preservation advice for luxury assets)",
    "bestAssetType": "string"
  },
  "finalVerdict": {
    "tier": "affluent OR modest OR comfortable OR high net worth",
    "yogaStrengths": "string (exactly 10-12 detailed sentences on overall dasha/yoga trajectory summary)",
    "realisticCeiling": "string (exactly 10-12 detailed sentences defining their realistic abundance limits)",
    "bestPeriods": "string (exactly 10-12 detailed sentences evaluating the best financial windows in their life cycle)",
    "topRecommendations": ["string"],
    "plan30Days": "string (exactly 10-12 detailed sentences on 30-day tactical asset moves)",
    "plan1Year": "string (exactly 10-12 detailed sentences on 1-year strategic growth action plan)",
    "oneLineVerdict": "string"
  }
}`;
}

/**
 * Calls OpenAI GPT to generate the wealth report predictions JSON
 */
async function generateWealthReportContent(reportInput, userId) {
  const prompt = buildPrompt(reportInput);
  
  console.log(`[WealthReportService] Requesting OpenAI analysis for client: ${reportInput.client.name}...`);
  console.log(`[WealthReportService] Prompt length: ${prompt.length} characters`);
  const requestStartedAt = Date.now();
  const timeoutMs = Number(
    process.env.WEALTH_REPORT_OPENAI_TIMEOUT_MS ||
      process.env.REPORT_OPENAI_TIMEOUT_MS ||
      240000
  );

  const openAiRequest = createChatCompletion(
    {
      model: CHAT_MODEL,
      messages: [
        {
          role: "system",
          content: "You are an elite Vedic financial astrologer. Return strict JSON wealth reports matching the expected schema. Every narrative field must contain exactly 10-12 high-quality sentences (~220-280 words). No emojis. No markdown wrappers."
        },
        {
          role: "user",
          content: prompt
        }
      ],
      temperature: 0.7,
      max_tokens: 10000,
      response_format: { type: "json_object" }
    },
    { feature: "wealth_report_generation", userId }
  );

  const timeout = new Promise((_, reject) => {
    setTimeout(() => {
      reject(new Error(`Wealth report OpenAI request timed out after ${timeoutMs}ms`));
    }, timeoutMs);
  });

  const response = await Promise.race([openAiRequest, timeout]);
  console.log("[WealthReportService] OpenAI analysis completed", {
    userId,
    durationMs: Date.now() - requestStartedAt,
    promptTokens: response?.usage?.prompt_tokens || null,
    completionTokens: response?.usage?.completion_tokens || null,
    totalTokens: response?.usage?.total_tokens || null,
  });

  const content = response?.choices?.[0]?.message?.content?.trim();
  if (!content) {
    throw new Error("No wealth report response returned from OpenAI Client");
  }

  try {
    console.log("[WealthReportService] Raw LLM response content:\n", content);
    const data = JSON.parse(content);
    console.log("[WealthReportService] OpenAI parsed response successfully");
    return data;
  } catch (err) {
    console.error("[WealthReportService] Failed to parse GPT response:", content);
    throw new Error("Invalid JSON returned by OpenAI model");
  }
}

/**
 * Orchestrates payload construction and LLM query
 */
async function generateWealthReport(kundli, userRequest) {
  console.log(`[WealthReportService] Processing report payload for ${userRequest.fullName}...`);
  const reportInput = buildWealthReportPayload(kundli, userRequest);

  // Call OpenAI API
  const reportData = await generateWealthReportContent(reportInput, userRequest.userId);

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

  const yogaSummary = (Array.isArray(kundli.yogas) ? kundli.yogas : [])
    .slice(0, 5)
    .map(y => ({
      name: y.name || "—",
      strength: y.strength || "Moderate",
      effect: y.effects || y.description || "—",
    }));

  let rasiChart = kundli.charts?.D1 || null;
  let horaChart = kundli.charts?.D2 || null;
  let chaturthamsaChart = kundli.charts?.D4 || null;
  let ashtakavargaChart = kundli.ashtakavarga || null;

  if (!rasiChart || !horaChart || !chaturthamsaChart) {
    console.log("[WealthReportService] Missing divisional charts from DB, calling getAllCharts...");
    try {
      const allDivisional = await getAllCharts(userRequest);
      if (allDivisional) {
        if (!rasiChart) rasiChart = allDivisional.D1 || allDivisional.rasi || null;
        if (!horaChart) horaChart = allDivisional.D2 || allDivisional.hora || null;
        if (!chaturthamsaChart) chaturthamsaChart = allDivisional.D4 || allDivisional.chaturthamsa || null;
      }
    } catch (err) {
      console.error("[WealthReportService] Failed to fetch divisional charts on fallback:", err.message);
    }
  }

  if (!ashtakavargaChart || !ashtakavargaChart.sav) {
    console.log("[WealthReportService] Missing Ashtakavarga from DB, calling getAshtakavarga...");
    try {
      const rawAshtak = await getAshtakavarga(userRequest);
      if (rawAshtak) {
        ashtakavargaChart = {
          sav: rawAshtak.sarvashtakavarga?.sign_points?.map(sp => sp.points ?? 0) || [],
        };
      }
    } catch (err) {
      console.error("[WealthReportService] Failed to fetch Ashtakavarga on fallback:", err.message);
    }
  }

  // Attach user details and base inputs
  return {
    reportInput,
    predictions: reportData,
    personalInformation: {
      fullName: userRequest.fullName,
      dateOfbirth: userRequest.dateOfbirth,
      timeOfbirth: userRequest.timeOfbirth,
      placeOfBirth: userRequest.placeOfBirth,
      gender: userRequest.gender
    },
    astrologyBasics: {
      ascendant: reportInput.astrology.ascendant,
      moonSign: reportInput.astrology.moonSign,
      sunSign: reportInput.astrology.sunSign,
      nakshatra: reportInput.astrology.nakshatra,
      currentDasha: reportInput.astrology.currentDasha,
      nextImportantDashas: reportInput.astrology.nextImportantDashas,
      ashtakvarga: reportInput.astrology.ashtakvarga,
      wealthYogas: reportInput.astrology.wealthYogas,
      allDashas: calculateAllDashas(kundli.dasha)
    },
    birthPlanetaryTable,
    yogaSummary,
    horoscopeCharts: {
      rasiChart,
      horaChart,
      chaturthamsaChart,
      ashtakavargaChart
    }
  };
}

module.exports = {
  buildWealthReportPayload,
  generateWealthReportContent,
  generateWealthReport
};
