const OpenAI = require("openai");
const { getTransitChart } = require("./astroEngineService");

const CHAT_MODEL = process.env.OPENAI_CHAT_MODEL || "gpt-4o-mini";

const SIGNS = [
  "Aries",
  "Taurus",
  "Gemini",
  "Cancer",
  "Leo",
  "Virgo",
  "Libra",
  "Scorpio",
  "Sagittarius",
  "Capricorn",
  "Aquarius",
  "Pisces",
];

const PLANETS = ["Sun", "Moon", "Mars", "Mercury", "Jupiter", "Venus", "Saturn", "Rahu", "Ketu"];

const HOUSE_THEMES = {
  1: ["personality", "health", "confidence"],
  2: ["finance", "family", "speech"],
  3: ["communication", "travel", "courage"],
  4: ["home", "emotional_peace", "education"],
  5: ["love", "education", "creativity"],
  6: ["health", "work", "competition"],
  7: ["relationships", "partnership", "business"],
  8: ["transformation", "health", "spirituality"],
  9: ["spirituality", "travel", "education"],
  10: ["career", "status", "responsibility"],
  11: ["finance", "career", "network"],
  12: ["expenses", "foreign", "spirituality", "rest"],
};

const BUCKETS = {
  daily: {
    label: "Daily kundli reading",
    houses: [1, 4, 6, 8, 10, 11, 12],
    planets: ["Moon", "Sun", "Mercury", "Saturn"],
    actions: ["Keep the day simple and focus on the most activated area.", "Avoid reacting quickly when emotions feel high."],
  },
  career: {
    label: "Career opportunities and challenges",
    houses: [2, 6, 10, 11],
    planets: ["Sun", "Saturn", "Mercury", "Jupiter", "Mars"],
    actions: ["Follow through on professional commitments.", "Keep communication disciplined with seniors and clients."],
  },
  relationships: {
    label: "Personal relationships and growth",
    houses: [4, 7, 11],
    planets: ["Venus", "Moon", "Jupiter", "Mercury"],
    actions: ["Choose patient conversation over instant judgment.", "Give important relationships practical attention."],
  },
  love: {
    label: "Love life",
    houses: [5, 7, 8],
    planets: ["Venus", "Moon", "Mars", "Jupiter"],
    actions: ["Be warm but clear in romantic communication.", "Avoid testing the other person through silence or impulse."],
  },
  finance: {
    label: "Financial growth, money and management",
    houses: [2, 8, 10, 11, 12],
    planets: ["Jupiter", "Venus", "Mercury", "Saturn", "Rahu"],
    actions: ["Review spending before making larger decisions.", "Prefer steady planning over risky shortcuts."],
  },
  health: {
    label: "Health and well-being",
    houses: [1, 6, 8, 12],
    planets: ["Sun", "Moon", "Mars", "Saturn", "Rahu", "Ketu"],
    actions: ["Prioritize rest, hydration, food discipline, and movement.", "Seek qualified care for any persistent symptoms."],
  },
  spirituality: {
    label: "Spiritual growth and exploration",
    houses: [8, 9, 12],
    planets: ["Jupiter", "Ketu", "Saturn", "Moon"],
    actions: ["Make time for prayer, meditation, journaling, or quiet reflection.", "Use discomfort as a signal to simplify."],
  },
  travel: {
    label: "Travel opportunities and experiences",
    houses: [3, 7, 9, 12],
    planets: ["Moon", "Rahu", "Jupiter", "Mercury", "Venus"],
    actions: ["Plan routes and documents carefully.", "Keep travel decisions practical when emotions are fluctuating."],
  },
  education: {
    label: "Education and learning opportunities",
    houses: [4, 5, 9],
    planets: ["Mercury", "Jupiter", "Moon", "Saturn"],
    actions: ["Set a focused study window.", "Convert curiosity into one concrete learning action."],
  },
  remedy: {
    label: "Remedy recommendations",
    houses: [1, 6, 8, 12],
    planets: ["Saturn", "Moon", "Mars", "Rahu", "Ketu"],
    actions: ["Prefer gentle mantra, seva, discipline, and grounding routines.", "Do not use expensive gemstones without astrologer review."],
  },
};

const PLANET_REMEDIES = {
  Saturn: "Maintain discipline, serve elders or workers, and keep Saturday commitments humble.",
  Moon: "Prioritize sleep, hydration, journaling, and a calming Chandra mantra.",
  Mars: "Use exercise to channel heat and avoid reactive conflict.",
  Rahu: "Practice digital discipline, grounding, and avoid shortcuts.",
  Ketu: "Use Ganesha mantra, meditation, decluttering, and clarity practices.",
  Mercury: "Double-check messages, documents, and commitments.",
  Jupiter: "Study, seek wise guidance, and practice generosity.",
  Venus: "Keep relationships respectful and spending mindful.",
  Sun: "Offer morning gratitude, build healthy confidence, and respect authority without ego clashes.",
};

const ORBS = {
  Moon: 3,
  Sun: 3,
  Mars: 3,
  Mercury: 2,
  Venus: 2,
  Jupiter: 5,
  Saturn: 5,
  Rahu: 4,
  Ketu: 4,
};

let openaiClient = null;

function getOpenAIClient() {
  if (!process.env.OPENAI_API_KEY) return null;
  if (!openaiClient) openaiClient = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });
  return openaiClient;
}

function normalizeSignName(sign) {
  if (!sign) return null;
  const normalized = String(sign).trim().toLowerCase();
  return SIGNS.find((item) => item.toLowerCase() === normalized) || null;
}

function signNum(signOrNum) {
  if (Number.isInteger(signOrNum)) return signOrNum >= 1 && signOrNum <= 12 ? signOrNum : null;
  if (typeof signOrNum === "number") return signOrNum >= 1 && signOrNum <= 12 ? Math.trunc(signOrNum) : null;
  const sign = normalizeSignName(signOrNum);
  return sign ? SIGNS.indexOf(sign) + 1 : null;
}

function signFromNum(num) {
  return SIGNS[((num - 1 + 12) % 12)];
}

function houseFromSign(transitSignNum, referenceSignNum) {
  if (!transitSignNum || !referenceSignNum) return null;
  return ((transitSignNum - referenceSignNum + 12) % 12) + 1;
}

function addSigns(startSignNum, offset) {
  return ((startSignNum + offset - 2) % 12) + 1;
}

function getAspectOffsets(planet, useNodeSpecialAspects = true) {
  if (planet === "Mars") return [4, 7, 8];
  if (planet === "Jupiter") return [5, 7, 9];
  if (planet === "Saturn") return [3, 7, 10];
  if ((planet === "Rahu" || planet === "Ketu") && useNodeSpecialAspects) return [5, 7, 9];
  return [7];
}

function normalizePlanetary(planetary) {
  if (!planetary) return [];
  const values = Array.isArray(planetary) ? planetary : Object.entries(planetary).map(([name, value]) => ({ planet: name, ...value }));
  return values
    .map((item) => {
      const planet = item.planet || item.name;
      if (!planet) return null;
      const longitude = Number(item.longitude ?? item.full_degree ?? item.degree);
      return {
        ...item,
        planet,
        sign: normalizeSignName(item.sign) || item.sign,
        sign_num: signNum(item.sign_num) || signNum(item.sign),
        longitude: Number.isFinite(longitude) ? longitude : null,
        degree: Number(item.sign_degree ?? item.degree ?? (Number.isFinite(longitude) ? longitude % 30 : null)),
      };
    })
    .filter(Boolean);
}

function getCoreSigns(kundli) {
  const asc = kundli.basicDetails?.ascendant || kundli.astroDetails?.ascendant || kundli.horoscope?.birth_chart?.ascendant;
  const ascSign = normalizeSignName(asc?.sign || kundli.basicDetails?.ascendant_sign);
  const moonSign = normalizeSignName(kundli.basicDetails?.moon_sign || kundli.horoscope?.moon_sign);
  const sunSign = normalizeSignName(kundli.basicDetails?.sun_sign || kundli.horoscope?.sun_sign);

  return {
    ascendant: asc ? { ...asc, sign: ascSign || asc.sign, sign_num: signNum(ascSign || asc.sign) } : null,
    ascSign,
    ascSignNum: signNum(ascSign),
    moonSign,
    moonSignNum: signNum(moonSign),
    sunSign,
  };
}

function getCurrentDasha(dasha, date = new Date()) {
  const dashas = Array.isArray(dasha?.dashas) ? dasha.dashas : Array.isArray(dasha?.major_dashas) ? dasha.major_dashas : [];
  const target = date.toISOString().slice(0, 10);
  const current = dashas.find((period) => {
    const start = period.start_date || period.start;
    const end = period.end_date || period.end;
    return start && end && start <= target && target <= end;
  });

  if (!current) {
    return {
      system: dasha?.system || "Vimshottari",
      mahadasha: null,
      antardasha: null,
      pratyantardasha: null,
      sookshmadasha: null,
      source: "not_found",
    };
  }

  return {
    system: dasha?.system || "Vimshottari",
    mahadasha: current.planet || current.lord || null,
    antardasha: current.current_antardasha?.planet || current.antardasha || null,
    pratyantardasha: current.current_pratyantardasha?.planet || current.pratyantardasha || null,
    sookshmadasha: current.current_sookshmadasha?.planet || current.sookshmadasha || null,
    period: current,
    source: "kundli_dasha",
  };
}

function normalizeTransit(transit) {
  const root = transit?.transit || transit;
  const transits = root?.transits || root?.planets || root || {};
  return {
    datetime: root?.datetime || transit?.datetime || new Date().toISOString(),
    transits: Object.entries(transits)
      .filter(([planet, value]) => PLANETS.includes(planet) && value && typeof value === "object")
      .map(([planet, value]) => ({
        planet,
        sign: normalizeSignName(value.sign) || value.sign,
        sign_num: signNum(value.sign_num) || signNum(value.sign),
        longitude: Number(value.longitude),
        degree: Number(value.degree ?? (Number(value.longitude) % 30)),
        nakshatra: value.nakshatra?.name || value.nakshatra_name || null,
        nakshatra_lord: value.nakshatra?.lord || value.nakshatra_lord || null,
        is_retrograde: planet === "Rahu" || planet === "Ketu" ? true : Boolean(value.is_retrograde),
        speed: value.speed ?? null,
        raw: value,
      }))
      .filter((item) => item.sign_num),
  };
}

function getAshtakavargaScore(kundli, signNumber) {
  const sav = kundli.ashtakvarga?.sav;
  if (!Array.isArray(sav) || !signNumber) return null;
  const score = Number(sav[signNumber - 1]);
  return Number.isFinite(score) ? score : null;
}

function mapAshtakavargaSupport(score) {
  if (score == null) return 50;
  if (score >= 35) return 90;
  if (score >= 30) return 75;
  if (score >= 25) return 58;
  if (score >= 20) return 42;
  return 25;
}

function findNatalContacts(transitPlanet, natalPlanets) {
  return natalPlanets
    .filter((natal) => natal.sign_num === transitPlanet.sign_num && natal.planet !== "Ascendant")
    .map((natal) => {
      const orbLimit = ORBS[transitPlanet.planet] || 3;
      const orb =
        Number.isFinite(transitPlanet.degree) && Number.isFinite(natal.degree)
          ? Math.abs(transitPlanet.degree - natal.degree)
          : null;
      return {
        planet: natal.planet,
        aspect_type: "conjunction",
        orb,
        precision: orb != null && orb <= orbLimit ? "degree_orb" : "sign_based",
      };
    });
}

function buildPersonalizedTransits({ kundli, transit, useNodeSpecialAspects = true }) {
  const { ascSignNum, moonSignNum } = getCoreSigns(kundli);
  const natalPlanets = normalizePlanetary(kundli.planetary);
  const normalizedTransit = normalizeTransit(transit);

  return normalizedTransit.transits.map((item) => {
    const houseFromLagna = houseFromSign(item.sign_num, ascSignNum);
    const houseFromMoon = houseFromSign(item.sign_num, moonSignNum);
    const aspectSigns = getAspectOffsets(item.planet, useNodeSpecialAspects).map((offset) => addSigns(item.sign_num, offset));
    const aspectHousesFromLagna = aspectSigns.map((num) => houseFromSign(num, ascSignNum)).filter(Boolean);
    const aspectHousesFromMoon = aspectSigns.map((num) => houseFromSign(num, moonSignNum)).filter(Boolean);
    const conjunctNatalPlanets = findNatalContacts(item, natalPlanets);
    const aspectedNatalPlanets = natalPlanets
      .filter((natal) => aspectSigns.includes(natal.sign_num))
      .map((natal) => ({ planet: natal.planet, sign: natal.sign, aspect_type: "sign_aspect" }));
    const ashtakavargaSupport = getAshtakavargaScore(kundli, item.sign_num);

    const activatedBuckets = Object.entries(BUCKETS)
      .filter(([, config]) => {
        const houseHit = config.houses.includes(houseFromLagna) || aspectHousesFromLagna.some((house) => config.houses.includes(house));
        const planetHit = config.planets.includes(item.planet) || conjunctNatalPlanets.some((contact) => config.planets.includes(contact.planet));
        return houseHit || planetHit;
      })
      .map(([bucket]) => bucket);

    const baseStrength = item.planet === "Jupiter" || item.planet === "Venus" ? 65 : item.planet === "Saturn" ? 55 : 50;
    const challengeBase = ["Saturn", "Mars", "Rahu", "Ketu"].includes(item.planet) ? 60 : 35;
    const dusthanaPressure = [6, 8, 12].includes(houseFromLagna) || [6, 8, 12].includes(houseFromMoon) ? 18 : 0;
    const retrogradeModifier = item.is_retrograde && item.planet !== "Rahu" && item.planet !== "Ketu" ? 10 : 0;

    return {
      datetime: normalizedTransit.datetime,
      planet: item.planet,
      transit_sign: item.sign,
      transit_sign_num: item.sign_num,
      transit_degree: item.degree,
      transit_nakshatra: item.nakshatra,
      transit_nakshatra_lord: item.nakshatra_lord,
      is_retrograde: item.is_retrograde,
      house_from_lagna: houseFromLagna,
      house_from_moon: houseFromMoon,
      aspects_to_houses_from_lagna: aspectHousesFromLagna,
      aspects_to_houses_from_moon: aspectHousesFromMoon,
      conjunct_natal_planets: conjunctNatalPlanets,
      aspected_natal_planets: aspectedNatalPlanets,
      activates_user_buckets: activatedBuckets,
      ashtakavarga_support: ashtakavargaSupport,
      transit_strength_score: Math.min(100, baseStrength + mapAshtakavargaSupport(ashtakavargaSupport) * 0.2 + conjunctNatalPlanets.length * 5),
      transit_challenge_score: Math.min(100, challengeBase + dusthanaPressure + retrogradeModifier),
    };
  });
}

function calculateNatalSupport(kundli, bucketKey) {
  const bucket = BUCKETS[bucketKey];
  const planets = normalizePlanetary(kundli.planetary);
  const core = getCoreSigns(kundli);
  if (!bucket || !core.ascSignNum) return 40;

  const relevantPlanets = planets.filter((planet) => bucket.planets.includes(planet.planet));
  const houseHits = relevantPlanets.filter((planet) => bucket.houses.includes(houseFromSign(planet.sign_num, core.ascSignNum))).length;
  const yogaHit = Array.isArray(kundli.yogas)
    ? kundli.yogas.some((yoga) => String(yoga.type || yoga.name || "").toLowerCase().includes(bucketKey))
    : false;

  return Math.min(100, 42 + houseHits * 12 + relevantPlanets.length * 4 + (yogaHit ? 14 : 0));
}

function calculateDashaSupport(currentDasha, bucketKey) {
  const bucket = BUCKETS[bucketKey];
  if (!bucket) return 0;
  const activePlanets = [
    currentDasha.mahadasha,
    currentDasha.antardasha,
    currentDasha.pratyantardasha,
    currentDasha.sookshmadasha,
  ].filter(Boolean);
  if (!activePlanets.length) return 35;
  const matches = activePlanets.filter((planet) => bucket.planets.includes(planet)).length;
  return Math.min(100, 35 + matches * 20);
}

function calculateTransitSupport(personalizedTransits, bucketKey) {
  const matches = personalizedTransits.filter((transit) => transit.activates_user_buckets.includes(bucketKey));
  if (!matches.length) return 30;
  const slowWeight = matches.some((item) => ["Saturn", "Jupiter", "Rahu", "Ketu"].includes(item.planet)) ? 15 : 0;
  const moonWeight = matches.some((item) => item.planet === "Moon") ? 10 : 0;
  const avg = matches.reduce((sum, item) => sum + item.transit_strength_score, 0) / matches.length;
  return Math.min(100, avg + slowWeight + moonWeight);
}

function calculateAshtakavargaSupport(personalizedTransits, bucketKey) {
  const scores = personalizedTransits
    .filter((transit) => transit.activates_user_buckets.includes(bucketKey))
    .map((transit) => mapAshtakavargaSupport(transit.ashtakavarga_support));
  if (!scores.length) return 50;
  return scores.reduce((sum, score) => sum + score, 0) / scores.length;
}

function confidenceLabel(score) {
  if (score >= 80) return "high";
  if (score >= 65) return "good";
  if (score >= 50) return "medium";
  if (score >= 35) return "low";
  return "very_low";
}

function bucketStatus(score, challengeScore) {
  if (score >= 70 && challengeScore >= 55) return "opportunity_with_responsibility";
  if (score >= 70) return "supportive";
  if (challengeScore >= 65) return "caution";
  if (score >= 50) return "mixed";
  return "mild_tendency";
}

function buildBucketAnalysis({ kundli, currentDasha, personalizedTransits }) {
  return Object.entries(BUCKETS).map(([bucket, config]) => {
    const natalSupport = calculateNatalSupport(kundli, bucket);
    const dashaSupport = calculateDashaSupport(currentDasha, bucket);
    const transitSupport = calculateTransitSupport(personalizedTransits, bucket);
    const ashtakavargaSupport = calculateAshtakavargaSupport(personalizedTransits, bucket);
    const matchingTransits = personalizedTransits.filter((item) => item.activates_user_buckets.includes(bucket));
    const challengeScore = Math.min(
      100,
      matchingTransits.length
        ? matchingTransits.reduce((sum, item) => sum + item.transit_challenge_score, 0) / matchingTransits.length
        : 35
    );
    const score = Math.round(
      natalSupport * 0.25 +
        50 * 0.2 +
        dashaSupport * 0.25 +
        transitSupport * 0.2 +
        ashtakavargaSupport * 0.1
    );

    const supportingFactors = [];
    const cautionFactors = [];
    matchingTransits.slice(0, 4).forEach((item) => {
      supportingFactors.push(
        `${item.planet} transits ${item.transit_sign}, activating house ${item.house_from_lagna} from Lagna`
      );
      if (item.transit_challenge_score >= 65) {
        cautionFactors.push(`${item.planet} adds pressure through ${HOUSE_THEMES[item.house_from_lagna]?.join(", ") || "active houses"}`);
      }
      if (item.ashtakavarga_support != null && item.ashtakavarga_support < 25) {
        cautionFactors.push(`${item.transit_sign} has lower Ashtakavarga support, so effort and caution matter`);
      }
    });
    if (dashaSupport >= 65) supportingFactors.push("Current dasha connects with this bucket");

    return {
      bucket,
      label: config.label,
      score,
      challenge_score: Math.round(challengeScore),
      confidence_score: score,
      confidence_label: confidenceLabel(score),
      status: bucketStatus(score, challengeScore),
      supporting_factors: supportingFactors.slice(0, 5),
      caution_factors: cautionFactors.slice(0, 4),
      recommended_actions: config.actions,
      remedies: matchingTransits
        .filter((item) => PLANET_REMEDIES[item.planet] && item.transit_challenge_score >= 55)
        .slice(0, 2)
        .map((item) => ({ planet: item.planet, reason: `${item.planet} pressure is active`, remedy: PLANET_REMEDIES[item.planet] })),
    };
  });
}

function buildNatalSummary(kundli) {
  const core = getCoreSigns(kundli);
  const planets = normalizePlanetary(kundli.planetary);
  const strongPlanets = planets
    .filter((planet) => Number(planet.strength_score) >= 70 || ["own_sign", "exalted", "moolatrikona"].includes(planet.dignity))
    .map((planet) => planet.planet)
    .slice(0, 5);
  const sensitivePlanets = planets
    .filter((planet) => Number(planet.affliction_score) >= 50 || planet.is_combust || planet.is_retrograde)
    .map((planet) => planet.planet)
    .slice(0, 5);

  return {
    lagna: core.ascSign,
    moon_sign: core.moonSign,
    sun_sign: core.sunSign,
    birth_nakshatra: kundli.dasha?.birth_nakshatra || kundli.basicDetails?.birth_nakshatra?.name || null,
    strong_planets: strongPlanets,
    sensitive_planets: sensitivePlanets,
  };
}

function buildTransitSummary(personalizedTransits) {
  const byPlanet = Object.fromEntries(personalizedTransits.map((item) => [item.planet.toLowerCase(), item]));
  const activated = new Set();
  personalizedTransits.forEach((item) => item.activates_user_buckets.forEach((bucket) => activated.add(bucket)));

  return {
    moon_house_from_lagna: byPlanet.moon?.house_from_lagna || null,
    moon_house_from_moon: byPlanet.moon?.house_from_moon || null,
    saturn_house_from_lagna: byPlanet.saturn?.house_from_lagna || null,
    jupiter_house_from_lagna: byPlanet.jupiter?.house_from_lagna || null,
    rahu_house_from_lagna: byPlanet.rahu?.house_from_lagna || null,
    activated_buckets: Array.from(activated),
    personalized_transits: personalizedTransits,
  };
}

function buildStandoutCards(kundli, bucketAnalyses) {
  const cards = bucketAnalyses
    .filter((bucket) => bucket.score >= 65 || bucket.challenge_score >= 65)
    .slice(0, 5)
    .map((bucket) => ({
      title: bucket.challenge_score >= 65 ? `${bucket.label} Needs Attention` : `Strong ${bucket.label}`,
      category: bucket.bucket,
      importance: bucket.score >= 75 || bucket.challenge_score >= 75 ? "high" : "medium",
      supporting_factors: bucket.supporting_factors,
      caution_factors: bucket.caution_factors,
      user_message:
        bucket.challenge_score >= 65
          ? `${bucket.label} is active, but results improve through patience, discipline, and careful choices.`
          : `${bucket.label} has supportive activation now; consistent effort can turn this into useful progress.`,
    }));

  const doshas = kundli.manglikAnalysis?.all_doshas || {};
  Object.entries(doshas)
    .filter(([, value]) => value?.present)
    .slice(0, 2)
    .forEach(([name, value]) => {
      cards.push({
        title: String(name).replace(/_/g, " "),
        category: "remedy",
        importance: value.severity === "high" ? "high" : "medium",
        supporting_factors: [value.description || "Dosha indicator exists in the saved kundli"],
        caution_factors: ["Use balanced remedies; avoid fear-based interpretation"],
        user_message: "This factor should be handled with calm discipline, seva, mantra, and practical lifestyle correction.",
      });
    });

  return cards;
}

function buildInsightPayload({ userRequest, kundli, transit, date = new Date() }) {
  const insightDate = new Date(date);
  const currentDasha = getCurrentDasha(kundli.dasha, insightDate);
  const personalizedTransits = buildPersonalizedTransits({ kundli, transit });
  const bucketAnalyses = buildBucketAnalysis({ kundli, currentDasha, personalizedTransits })
    .sort((a, b) => b.score + b.challenge_score * 0.35 - (a.score + a.challenge_score * 0.35));
  const topBuckets = bucketAnalyses.slice(0, 3);
  const mainBucket = topBuckets[0] || bucketAnalyses[0];
  const confidenceScore = Math.round(topBuckets.reduce((sum, item) => sum + item.confidence_score, 0) / Math.max(topBuckets.length, 1));
  const natalSummary = buildNatalSummary(kundli);
  const transitSummary = buildTransitSummary(personalizedTransits);
  const remedies = topBuckets.flatMap((bucket) => bucket.remedies).slice(0, 4);
  const recommendedActions = Array.from(new Set(topBuckets.flatMap((bucket) => bucket.recommended_actions))).slice(0, 5);
  const standoutCards = buildStandoutCards(kundli, bucketAnalyses);

  const llmPayload = {
    user_context: {
      name: userRequest.fullName || "User",
      query_bucket: mainBucket?.bucket || "daily",
      tone: "supportive",
      insight_date: insightDate.toISOString().slice(0, 10),
      birth_time_confidence: userRequest.timeOfbirth === "00:00:00" ? "unknown" : "exact_or_user_provided",
    },
    natal_summary: natalSummary,
    current_dasha: currentDasha,
    bucket_analysis: mainBucket,
    top_buckets: topBuckets,
    transit_summary: transitSummary,
    recommended_actions: recommendedActions,
    remedies,
    standout_cards: standoutCards,
    safety_rules: [
      "Do not make deterministic claims",
      "No medical diagnosis or financial buy/sell advice",
      "No fear-based dosha claims",
      "Gemstones require astrologer review",
    ],
  };

  return {
    userId: userRequest.userId,
    userRequestId: userRequest.id,
    insightDate: insightDate.toISOString().slice(0, 10),
    mainTheme: mainBucket?.label || "Daily kundli reading",
    topBuckets,
    dashaContext: currentDasha,
    transitContext: transitSummary,
    recommendedActions,
    remedies,
    llmPayload,
    confidenceScore,
    generatedText: null,
  };
}

async function maybeGenerateNarrative(llmPayload) {
  const openai = getOpenAIClient();
  if (!openai) return null;

  const completion = await openai.chat.completions.create({
    model: CHAT_MODEL,
    temperature: 0.55,
    max_tokens: 650,
    messages: [
      {
        role: "system",
        content:
          "You are Graho's Vedic astrology insight writer. Use only the structured factors provided. Do not invent placements. Avoid fear, certainty, medical diagnosis, financial advice, and gemstone pressure. Return concise JSON only.",
      },
      {
        role: "user",
        content: JSON.stringify({
          task: "Create a daily user-facing insight with keys: main_insight, why, what_to_do, what_to_avoid, remedy, confidence_language.",
          payload: llmPayload,
        }),
      },
    ],
    response_format: { type: "json_object" },
  });

  const content = completion.choices[0]?.message?.content;
  if (!content) return null;
  try {
    return JSON.parse(content);
  } catch {
    return { main_insight: content };
  }
}

async function generateInsightForKundli({ userRequest, kundli, date = new Date(), freshTransit = false, includeNarrative = false }) {
  let transit = kundli.horoscope?.transit || null;

  if (freshTransit || !transit) {
    transit = await getTransitChart(userRequest, date);
  }

  if (!transit) {
    transit = { datetime: new Date(date).toISOString(), transits: {} };
  }

  const payload = buildInsightPayload({ userRequest, kundli, transit, date });

  if (includeNarrative) {
    const narrative = await maybeGenerateNarrative(payload.llmPayload);
    payload.generatedText =
      narrative && typeof narrative === "object" ? JSON.stringify(narrative) : narrative;
  }

  return payload;
}

module.exports = {
  SIGNS,
  BUCKETS,
  buildInsightPayload,
  buildPersonalizedTransits,
  generateInsightForKundli,
  maybeGenerateNarrative,
  signNum,
  signFromNum,
  houseFromSign,
  getCurrentDasha,
};
