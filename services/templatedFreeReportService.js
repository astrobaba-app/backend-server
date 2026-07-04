const ContentBank = require("../model/horoscope/contentBank");

let contentBankCache = {};
let isLoaded = false;

// Connectors to keep the stitched text natural
const CONNECTORS = {
  addition: ["Additionally,", "Furthermore,", "In addition to this,", "Moreover,", "Along with this,"],
  contrast: ["However,", "On the other hand,", "At the same time,", "Conversely,", "Nevertheless,"],
  reinforce: ["This is further reinforced by,", "This placement is strongly complemented by,", "This aligns with,"],
  transition: ["Regarding your daily path,", "Looking at your overall trajectory,", "On the life front,"],
  career: ["On the career front,", "In terms of professional growth,", "When it comes to career choices,"],
  relationship: ["On the relationship front,", "Regarding your personal connections,", "In love and relationship matters,"],
  moonModifier: [
    "Woven into this foundation, your Moon in",
    "Layered beneath the surface, your Moon in",
    "Adding emotional colour to this, your Moon in",
    "Shaping your inner world alongside this, your Moon in"
  ],
  elementConflict: [
    "This creates a private, often fascinating tension within you —",
    "There is an internal tug-of-war at work here —",
    "Herein lies one of your most defining internal contradictions —",
    "This is where your chart reveals its most personal complexity —"
  ]
};

function getConnector(type) {
  const list = CONNECTORS[type] || CONNECTORS.addition;
  return list[Math.floor(Math.random() * list.length)];
}

/** Returns the elemental group of a zodiac sign */
function getElement(sign) {
  const s = String(sign).toLowerCase();
  if (["aries", "leo", "sagittarius"].includes(s)) return "fire";
  if (["taurus", "virgo", "capricorn"].includes(s)) return "earth";
  if (["gemini", "libra", "aquarius"].includes(s)) return "air";
  if (["cancer", "scorpio", "pisces"].includes(s)) return "water";
  return "unknown";
}

/** Returns true if Ascendant and Moon sign are opposing elements */
function areElementsConflicting(ascSign, moonSign) {
  const a = getElement(ascSign);
  const m = getElement(moonSign);
  return (a === "fire" && m === "water") || (a === "water" && m === "fire") ||
         (a === "earth" && m === "air") || (a === "air" && m === "earth");
}

/**
 * Loads the entire Content Bank from PostgreSQL into memory cache
 */
async function loadContentBank() {
  try {
    console.log("[ContentBank] Loading content bank into memory...");
    const items = await ContentBank.findAll();
    const cache = {};
    for (const item of items) {
      cache[item.key] = item.text;
    }
    contentBankCache = cache;
    isLoaded = true;
    console.log(`[ContentBank] Successfully loaded ${items.length} items into memory.`);
    return true;
  } catch (err) {
    console.error("[ContentBank] Failed to load content bank:", err);
    return false;
  }
}

async function ensureLoaded() {
  if (!isLoaded) {
    await loadContentBank();
  }
}

/**
 * Safely fetches a key from the content bank cache with fallback patterns
 */
function lookupContent(primaryKey, fallbackKeys = [], defaultText = "") {
  if (contentBankCache[primaryKey]) {
    return contentBankCache[primaryKey];
  }
  for (const fKey of fallbackKeys) {
    if (contentBankCache[fKey]) {
      return contentBankCache[fKey];
    }
  }
  return defaultText;
}

/**
 * Helper to get sign and house details for a planet
 */
function getPlanetInfo(planetary, planetName) {
  const pName = String(planetName).toLowerCase();
  const planetsObj = planetary?.planets || {};
  const matchedKey = Object.keys(planetsObj).find(k => k.toLowerCase() === pName);
  if (matchedKey && planetsObj[matchedKey]) {
    const p = planetsObj[matchedKey];
    const houseMap = planetary?.planet_houses || {};
    return {
      sign: p.sign || "Aries",
      house: houseMap[matchedKey] || p.house || 1,
    };
  }
  return { sign: "Aries", house: 1 };
}

/**
 * Stitching general profile report
 */
async function assembleGeneralDetails(kundli, context) {
  await ensureLoaded();

  let ascendant = kundli?.basicDetails?.ascendant?.sign || kundli?.basicDetails?.ascendant || null;
  if (typeof ascendant === "object" && ascendant !== null) ascendant = ascendant.sign;
  if (!ascendant) ascendant = kundli?.astroDetails?.ascendant?.sign || "Aries";

  const moonSign = kundli?.basicDetails?.moon_sign || kundli?.horoscope?.moon_sign || "Aries";
  const sunSign = kundli?.basicDetails?.sun_sign || "Aries";

  const sunInfo = getPlanetInfo(kundli.planetary, "Sun");
  const moonInfo = getPlanetInfo(kundli.planetary, "Moon");
  const marsInfo = getPlanetInfo(kundli.planetary, "Mars");
  const saturnInfo = getPlanetInfo(kundli.planetary, "Saturn");
  const jupiterInfo = getPlanetInfo(kundli.planetary, "Jupiter");
  const venusInfo = getPlanetInfo(kundli.planetary, "Venus");
  const mercuryInfo = getPlanetInfo(kundli.planetary, "Mercury");

  // Determine Tenth House sign/planet for career fallback
  const SIGNS = ["Aries", "Taurus", "Gemini", "Cancer", "Leo", "Virgo", "Libra", "Scorpio", "Sagittarius", "Capricorn", "Aquarius", "Pisces"];
  let ascIdx = SIGNS.map(s => s.toLowerCase()).indexOf(String(ascendant).toLowerCase());
  if (ascIdx === -1) ascIdx = 0;

  const tenthHouseSign = SIGNS[(ascIdx + 9) % 12];
  const seventhHouseSign = SIGNS[(ascIdx + 6) % 12];

  // 1. Description: Ascendant + Moon sign (general overview)
  const descBlock1 = lookupContent(`ascendant:description:${ascendant}`, [], "The Ascendant represents your core outlook on life.");
  const descBlock2 = lookupContent(`moon:description:${moonSign}`, [], "The Moon sign governs your emotional patterns.");
  const hasConflict = areElementsConflicting(ascendant, moonSign);
  const moonConnector = hasConflict
    ? `${getConnector("elementConflict")} your Moon in ${moonSign} introduces a different emotional response.`
    : `${getConnector("moonModifier")} ${moonSign} shapes your inner emotional outlook.`;
  const description = `${descBlock1} ${moonConnector} ${descBlock2}`;

  // 2. Personality: Moon sign + Mercury placement (thinking/communication style)
  const persBlock1 = lookupContent(`moon:personality:${moonSign}`, [], "Your emotional landscape defines your personality.");
  const persBlock2 = lookupContent(`planet:Mercury:sign:${mercuryInfo.sign}:house:${mercuryInfo.house}`, [
    `planet:Mercury:sign:${mercuryInfo.sign}`,
    `planet:Mercury:house:${mercuryInfo.house}`
  ], "Mercury's position channels your communication and thinking style.");
  const personality = `${persBlock1} ${getConnector("reinforce")} ${persBlock2}`;

  // 3. Physical Presence (Aura): Ascendant + Ascendant-lord's placement (focused specifically on physical traits)
  const RULERS = {
    aries: "Mars", taurus: "Venus", gemini: "Mercury", cancer: "Moon",
    leo: "Sun", virgo: "Mercury", libra: "Venus", scorpio: "Mars",
    sagittarius: "Jupiter", capricorn: "Saturn", aquarius: "Saturn", pisces: "Jupiter"
  };
  const lagnaLord = RULERS[String(ascendant).toLowerCase()] || "Mars";
  const lordInfo = getPlanetInfo(kundli.planetary, lagnaLord);

  const physBlock1 = lookupContent(`ascendant:physical:${ascendant}`, [], "Your physical energy projects vitality.");
  const physBlock2 = lookupContent(`planet:${lagnaLord}:sign:${lordInfo.sign}:house:${lordInfo.house}`, [
    `planet:${lagnaLord}:sign:${lordInfo.sign}`,
    `planet:${lagnaLord}:house:${lordInfo.house}`
  ], `The position of your Ascendant Lord ${lagnaLord} adds key definition to your physical presence and vitality.`);
  const physical = `${physBlock1} ${getConnector("addition")} ${physBlock2}`;

  // 4. Health
  const healthBlock1 = lookupContent(`moon:health:${moonSign}`, [], "Mind and physical health are deeply interconnected.");
  const healthBlock2 = lookupContent(`planet:Saturn:sign:${saturnInfo.sign}:house:${saturnInfo.house}`, [
    `planet:Saturn:house:${saturnInfo.house}`
  ], "Saturn governs your physical resilience and longevity.");
  const health = `${healthBlock1} ${getConnector("contrast")} ${healthBlock2}`;

  // 5. Career
  const careerBlock1 = lookupContent(`planet:Saturn:sign:${saturnInfo.sign}:house:${saturnInfo.house}`, [
    `planet:Saturn:house:${saturnInfo.house}`
  ], "Saturn placement indicates professional stability and growth patterns.");
  const careerBlock2 = lookupContent(`planet:Jupiter:sign:${jupiterInfo.sign}:house:${jupiterInfo.house}`, [
    `planet:Jupiter:sign:${jupiterInfo.sign}`
  ], "Jupiter brings wisdom and expansion to your vocation.");
  const career = `${getConnector("career")} ${careerBlock1} ${getConnector("addition")} ${careerBlock2}`;

  // 6. Relationships
  const relBlock1 = lookupContent(`planet:Venus:sign:${venusInfo.sign}:house:${venusInfo.house}`, [
    `planet:Venus:sign:${venusInfo.sign}`
  ], "Venus represents your capacity for harmony and partnership.");
  const relBlock2 = lookupContent(`ascendant:relationship:${ascendant}`, [], "Your Lagna plays a key role in how you bond.");
  const relationship = `${getConnector("relationship")} ${relBlock1} ${getConnector("contrast")} ${relBlock2}`;

  // No LLM fallback — missing keys use inline defaultText from lookupContent(). Guarantees <1s.
  // To fix missing content, run: node scripts/generateContentBank.js --live --category ascendant

  return {
    description,
    personality,
    physical,
    health,
    career,
    relationship
  };
}

/**
 * Stitching Vimshottari Dasha report
 */
async function assembleVimshottariDasha(kundli, context) {
  await ensureLoaded();

  let ascendant = kundli?.basicDetails?.ascendant?.sign || kundli?.basicDetails?.ascendant || null;
  if (typeof ascendant === "object" && ascendant !== null) ascendant = ascendant.sign;
  if (!ascendant) ascendant = kundli?.astroDetails?.ascendant?.sign || "Aries";

  const dashaObj = kundli.dasha;
  const rawDashas = dashaObj?.dashas || dashaObj?.periods || [];

  // Standard Vimshottari cycle order and their durations in years
  const CYCLE = ['Ketu', 'Venus', 'Sun', 'Moon', 'Mars', 'Rahu', 'Jupiter', 'Saturn', 'Mercury'];
  const DASHA_YEARS = {
    ketu: 7, venus: 20, sun: 6, moon: 10, mars: 7, rahu: 18, jupiter: 16, saturn: 19, mercury: 17
  };

  let displayOrder = [...CYCLE];

  // Rotate the cycle order to start with the user's active birth dasha lord
  const firstRawPlanet = rawDashas.length > 0 ? (rawDashas[0].planet || rawDashas[0].lord || '') : '';
  const cleanFirstPlanet = firstRawPlanet.replace(/\s*mahadasha\s*/i, "").trim();
  const matchedIdx = CYCLE.findIndex(p => p.toLowerCase() === cleanFirstPlanet.toLowerCase());
  if (matchedIdx !== -1) {
    displayOrder = [
      ...CYCLE.slice(matchedIdx),
      ...CYCLE.slice(0, matchedIdx)
    ];
  }

  // Parse custom date strings in DD-MM-YYYY or YYYY-MM-DD format
  function parseDateStr(str) {
    if (!str) return null;
    const parts = str.split('-');
    if (parts.length === 3) {
      let day, month, year;
      if (parts[0].length === 4) { // YYYY-MM-DD
        year = parseInt(parts[0], 10);
        month = parseInt(parts[1], 10) - 1;
        day = parseInt(parts[2], 10);
      } else { // DD-MM-YYYY
        day = parseInt(parts[0], 10);
        month = parseInt(parts[1], 10) - 1;
        year = parseInt(parts[2], 10);
      }
      return new Date(Date.UTC(year, month, day));
    }
    const d = new Date(str);
    return isNaN(d.getTime()) ? null : d;
  }

  function formatDateStr(date) {
    if (!date) return "";
    const day = String(date.getUTCDate()).padStart(2, "0");
    const month = String(date.getUTCMonth() + 1).padStart(2, "0");
    const year = date.getUTCFullYear();
    return `${day}-${month}-${year}`;
  }

  // Dynamically calculate chronological dates starting from the birth dasha end date
  const periodMap = {};
  if (rawDashas.length > 0) {
    const firstD = rawDashas[0];
    const firstPlanet = (firstD.planet || firstD.lord || '').replace(/\s*mahadasha\s*/i, "").trim();
    const firstStart = firstD.start_date || firstD.start || '';
    const firstEnd = firstD.end_date || firstD.end || '';
    const firstKey = firstPlanet.toLowerCase();

    periodMap[firstKey] = `${firstStart} - ${firstEnd}`;

    let currentDate = parseDateStr(firstEnd);
    if (currentDate) {
      const displayIdx = displayOrder.findIndex(p => p.toLowerCase() === firstKey);
      if (displayIdx !== -1) {
        for (let i = 1; i < displayOrder.length; i++) {
          const nextIdx = (displayIdx + i) % displayOrder.length;
          const nextPlanet = displayOrder[nextIdx];
          const nextKey = nextPlanet.toLowerCase();
          const years = DASHA_YEARS[nextKey] || 10;

          const startStr = formatDateStr(currentDate);
          currentDate.setUTCFullYear(currentDate.getUTCFullYear() + years);
          const endStr = formatDateStr(currentDate);

          periodMap[nextKey] = `${startStr} - ${endStr}`;
        }
      }
    }
  }

  // Check if content bank has ANY dasha entries at all — if zero, fall back
  const hasDashaCache = displayOrder.some(p => {
    const pInfo = getPlanetInfo(kundli.planetary, p);
    const key = `dasha:${p}:sign:${pInfo.sign}:house:${pInfo.house}`;
    const fallback = `dasha:${p}:sign:${pInfo.sign}`;
    return contentBankCache[key] || contentBankCache[fallback];
  });

  if (!hasDashaCache) {
    console.warn(`[ContentBank] No dasha keys in cache. Run: node scripts/generateContentBank.js --live --category dasha`);
    return { mahadashaReports: [], astrologerDisclaimer: "Dasha report will be available once content bank is populated." };
  }

  const mahadashaReports = [];

  const cleanLeadIn = (text) => {
    if (!text) return "";
    let cleaned = text
      .replace(/^(During\s+the\s+[A-Za-z]+\s+Mahadasha[.,]?\s*)/i, "")
      .replace(/^(During\s+this\s+Dasha\s+period[.,]?\s*)/i, "")
      .replace(/^(During\s+this\s+period[.,]?\s*)/i, "")
      .replace(/^(With\s+[A-Za-z]+\s+positioned\s+in[A-Za-z0-9\s,]+[.,]?\s*)/i, "")
      .trim();
    // Clean up any remaining leading punctuation from split boundaries
    cleaned = cleaned.replace(/^[.,\s]+/, "").trim();
    // Capitalize first letter
    if (cleaned.length > 0) {
      cleaned = cleaned.charAt(0).toUpperCase() + cleaned.slice(1);
    }
    return cleaned;
  };

  for (const planet of displayOrder) {
    const pInfo = getPlanetInfo(kundli.planetary, planet);
    const dashaKey = `dasha:${planet}:sign:${pInfo.sign}:house:${pInfo.house}`;
    const fallbackKey1 = `dasha:${planet}:sign:${pInfo.sign}`;
    const fallbackKey2 = `dasha:${planet}:house:${pInfo.house}`;

    const narrative = lookupContent(dashaKey, [fallbackKey1, fallbackKey2], '');

    // Split narrative into three stages (early / mid / late period)
    const totalLen = narrative.length;
    let earlyPhase = narrative;
    let midPhase = "";
    let latePhase = "";

    if (totalLen > 200) {
      const third = Math.floor(totalLen / 3);
      const split1 = narrative.indexOf('. ', third);
      const split2 = narrative.indexOf('. ', third * 2);

      if (split1 !== -1 && split2 !== -1 && split2 > split1) {
        earlyPhase = narrative.slice(0, split1 + 1).trim();
        midPhase = narrative.slice(split1 + 2, split2 + 1).trim();
        latePhase = narrative.slice(split2 + 2).trim();
      } else if (split1 !== -1) {
        earlyPhase = narrative.slice(0, split1 + 1).trim();
        latePhase = narrative.slice(split1 + 2).trim();
      }
    }

    // Split narrative into two roughly equal halves for legacy format
    let housePart = narrative;
    let signPart = '';
    if (narrative.length > 100) {
      const mid = Math.floor(narrative.length / 2);
      const splitAt = narrative.indexOf('. ', mid);
      if (splitAt !== -1 && splitAt < narrative.length - 10) {
        housePart = narrative.slice(0, splitAt + 1).trim();
        signPart = narrative.slice(splitAt + 2).trim();
      } else {
        housePart = narrative.slice(0, mid).trim();
        signPart = narrative.slice(mid).trim();
      }
    }

    const ordinal = (n) => {
      const s = ['th', 'st', 'nd', 'rd'];
      const v = n % 100;
      return n + (s[(v - 20) % 10] || s[v] || s[0]);
    };
    const houseLabel = typeof pInfo.house === 'number' ? ordinal(pInfo.house) : pInfo.house;

    const cleanedHousePart = cleanLeadIn(housePart);
    const cleanedSignPart = cleanLeadIn(signPart || housePart);

    // Prevent redundant "period" phrasing (awkward double reference)
    let houseDescription = `The planet ${planet} is in the ${houseLabel} house of the Kundli. `;
    if (/^(this\s+period|the\s+period|during|with)/i.test(cleanedHousePart)) {
      houseDescription += cleanedHousePart;
    } else {
      houseDescription += `During this Dasha period, ${cleanedHousePart}`;
    }

    const signDescription = `The planet ${planet} is camping with the ${pInfo.sign} sign in the Kundli. ${cleanedSignPart}`;

    // Compute house rulership note for this Dasha planet (Ascendant-specific)
    const HOUSE_RULERSHIPS = {
      Aries:       { Sun:"5th",  Moon:"4th",  Mars:"1st,8th", Mercury:"3rd,6th", Jupiter:"9th,12th", Venus:"2nd,7th",  Saturn:"10th,11th", Rahu:"", Ketu:"" },
      Taurus:      { Sun:"4th",  Moon:"3rd",  Mars:"7th,12th",Mercury:"2nd,5th", Jupiter:"8th,11th", Venus:"1st,6th",  Saturn:"9th,10th",  Rahu:"", Ketu:"" },
      Gemini:      { Sun:"3rd",  Moon:"2nd",  Mars:"6th,11th",Mercury:"1st,4th", Jupiter:"7th,10th", Venus:"5th,12th", Saturn:"8th,9th",   Rahu:"", Ketu:"" },
      Cancer:      { Sun:"2nd",  Moon:"1st",  Mars:"5th,10th",Mercury:"3rd,12th",Jupiter:"6th,9th",  Venus:"4th,11th", Saturn:"7th,8th",   Rahu:"", Ketu:"" },
      Leo:         { Sun:"1st",  Moon:"12th", Mars:"4th,9th", Mercury:"2nd,11th",Jupiter:"5th,8th",  Venus:"3rd,10th", Saturn:"6th,7th",   Rahu:"", Ketu:"" },
      Virgo:       { Sun:"12th", Moon:"11th", Mars:"3rd,8th", Mercury:"1st,10th",Jupiter:"4th,7th",  Venus:"2nd,9th",  Saturn:"5th,6th",   Rahu:"", Ketu:"" },
      Libra:       { Sun:"11th", Moon:"10th", Mars:"2nd,7th", Mercury:"9th,12th",Jupiter:"3rd,6th",  Venus:"1st,8th",  Saturn:"4th,5th",   Rahu:"", Ketu:"" },
      Scorpio:     { Sun:"10th", Moon:"9th",  Mars:"1st,6th", Mercury:"8th,11th",Jupiter:"2nd,5th",  Venus:"7th,12th", Saturn:"3rd,4th",   Rahu:"", Ketu:"" },
      Sagittarius: { Sun:"9th",  Moon:"8th",  Mars:"5th,12th",Mercury:"7th,10th",Jupiter:"1st,4th",  Venus:"6th,11th", Saturn:"2nd,3rd",   Rahu:"", Ketu:"" },
      Capricorn:   { Sun:"8th",  Moon:"7th",  Mars:"4th,11th",Mercury:"6th,9th", Jupiter:"3rd,12th", Venus:"5th,10th", Saturn:"1st,2nd",   Rahu:"", Ketu:"" },
      Aquarius:    { Sun:"7th",  Moon:"6th",  Mars:"3rd,10th",Mercury:"5th,8th", Jupiter:"2nd,11th", Venus:"4th,9th",  Saturn:"1st,12th",  Rahu:"", Ketu:"" },
      Pisces:      { Sun:"6th",  Moon:"5th",  Mars:"2nd,9th", Mercury:"4th,7th", Jupiter:"1st,10th", Venus:"3rd,8th",  Saturn:"11th,12th", Rahu:"", Ketu:"" },
    };
    const ascKey = String(ascendant).charAt(0).toUpperCase() + String(ascendant).slice(1).toLowerCase();
    const rulership = HOUSE_RULERSHIPS[ascKey]?.[planet] || "";
    const chartNote = rulership
      ? `For your ${ascKey} Ascendant, ${planet} rules your ${rulership} house${rulership.includes(",") ? "s" : ""}, making this period especially significant for those areas.`
      : "";

    mahadashaReports.push({
      mahadasha: planet,
      planet: planet,
      period: periodMap[planet.toLowerCase()] || '',
      houseDescription,
      signDescription,
      earlyPhase: cleanLeadIn(earlyPhase),
      midPhase: cleanLeadIn(midPhase),
      latePhase: cleanLeadIn(latePhase),
      chartNote
    });
  }

  return {
    mahadashaReports,
    astrologerDisclaimer: "Before planning major life decisions based on these Dasha timings, it is highly recommended that you consult a professional Vedic astrologer to analyze sub-periods (Antardashas) and transit alignments in your chart."
  };
}

const NAKSHATRA_CAUSAL_LINKS = {
  Ashwini: "Ashwini's ruling energy of swift action and healing benefits from 17-Mukhi's Katyayani influence, which channels that impulsiveness toward decisive success rather than restlessness.",
  Bharani: "Bharani's creative intensity and fierce reproductive energy are harmonized by 17-Mukhi Katyayani, grounding that power into creative focus.",
  Krittika: "Krittika's fiery, sharp intellect benefits from the protection of 17-Mukhi, channeling their critical nature into constructive projects.",
  Rohini: "Rohini's emotional sensitivity and pursuit of growth find stability through 17-Mukhi, fostering inner courage.",
  Mrigashira: "Mrigashira's constant search and curiosity are grounded by 17-Mukhi, transforming restlessness into spiritual discernment.",
  Ardra: "Ardra's intense transformative experiences are supported by 17-Mukhi Katyayani, bringing emotional calm after chaos.",
  Punarvasu: "Punarvasu's nurturing and home-loving tendencies find alignment in the Ajna activation of 14-Mukhi, expanding their vision.",
  Pushya: "Pushya's disciplined, maternal nature is strengthened by 17-Mukhi's prosperous vibration, supporting long-term commitments.",
  Ashlesha: "Ashlesha's deep mystical awareness and emotional depth are balanced by 17-Mukhi, preventing overthinking.",
  Magha: "Magha's focus on legacy and ancestral strength is supported by 17-Mukhi, translating pride into noble service.",
  "Purva Phalguni": "Purva Phalguni's aesthetic and pleasure-seeking nature is balanced by 17-Mukhi, focusing desire toward true wealth.",
  "Uttara Phalguni": "Uttara Phalguni's relationship-oriented duty is supported by 17-Mukhi, enhancing partnership stability.",
  Hasta: "Hasta's dexterous and analytical qualities are grounded by 14-Mukhi Hanuman, bringing focus to their efforts.",
  Chitra: "Chitra's artistic and structural vision is enhanced by 17-Mukhi, turning design into reality.",
  Swati: "Swati's independent, wind-like nature is balanced by 17-Mukhi, grounding their aspirations.",
  Vishakha: "Vishakha's dual focus and determination are aligned by 17-Mukhi, helping them reach their targets without exhaustion.",
  Anuradha: "Anuradha's emotional resilience and devotion are protected by 17-Mukhi, strengthening their heart against disappointments.",
  Jyeshtha: "Jyeshtha's protective, elder nature is supported by 14-Mukhi Hanuman, giving them leadership courage.",
  Mula: "Mula's deep root-striking search is stabilized by 17-Mukhi, turning existential search into material stability.",
  "Purva Ashadha": "Purva Ashadha's competitive spirit is directed by 17-Mukhi, fostering strategic success.",
  "Uttara Ashadha": "Uttara Ashadha's focus on universal values is nurtured by 17-Mukhi, ensuring public trust.",
  Shravana: "Shravana's receptive listening and memory are protected by 14-Mukhi, shielding against external stress.",
  Dhanishta: "Dhanishta's drive for material abundance is supported by 17-Mukhi, aligning wealth with spiritual balance.",
  Shatabhisha: "Shatabhisha's healing and secretive nature is grounded by 17-Mukhi, enabling self-healing.",
  "Purva Bhadrapada": "Purva Bhadrapada's intense, dualistic ideals are harmonized by 17-Mukhi, fostering mental peace.",
  "Uttara Bhadrapada": "Uttara Bhadrapada's deep meditative nature finds security through 17-Mukhi, stabilizing spiritual progress.",
  Revati: "Revati's highly sensitive, journeying nature is protected by 14-Mukhi, keeping their boundaries intact."
};

/**
 * Stitching Rudraksha suggestions
 */
async function assembleRudraksha(kundli, context) {
  await ensureLoaded();

  const nakshatra = kundli?.basicDetails?.nakshatra || "Ashwini";
  const key = `rudraksha:nakshatra:${nakshatra}`;

  // No LLM fallback — static Rudraksha data renders even without a content bank key.
  // To populate: node scripts/generateContentBank.js --live --category rudraksha
  if (!contentBankCache[key]) {
    console.warn(`[ContentBank] Rudraksha key missing: ${key}. Using default intro text.`);
  }

  const intro = lookupContent(key, [], "This report suggests a Rudraksha suggestion based strictly on your birth Nakshatra.");
  const disclaimer = "Before opting for any of these Rudraksha, it is highly recommended that you consult an astrologer as there might be planetary combinations in your current chart based on which the Rudraksha recommendation might change for you.";

  const causalReason = NAKSHATRA_CAUSAL_LINKS[nakshatra] || "Both are ruled by Saturn and influenced by Katyayani Devi and Lord Hanuman respectively.";

  // Chart context note: highlight which benefits are most relevant based on active doshas
  const isManglik = kundli?.manglikAnalysis?.mangal_dosha?.present || false;
  const isSadeSati = kundli?.manglikAnalysis?.sadesati?.is_sadesati || false;
  const chartContextBenefits = [];
  if (isSadeSati) chartContextBenefits.push("Given that your Sade Sati is currently active, the 17-Mukhi's ability to dismiss Saturn's negative effects is especially relevant for you right now.");
  if (isManglik) chartContextBenefits.push("With Manglik Dosh present in your chart, the 14-Mukhi's pacification of Mangal Dosh applies directly to your situation.");
  const chartContextNote = chartContextBenefits.length > 0 ? chartContextBenefits.join(" ") : "Both beads work together to shield you from planetary negativity and strengthen your Ajna Chakra for clearer decision-making.";

  return {
    introduction: intro,
    rudrakshaImportance: "Rudraksha beads hold a sacred place in Vedic tradition. Born from the Himalayan Elaeocarpus tree, each bead carries a unique energetic frequency that aligns the wearer's aura with specific planetary forces, helping to neutralize weaknesses and amplify strengths in the natal chart.",
    chartContextNote,
    astrologerDisclaimer: disclaimer,
    recommendation: {
      nakshatra,
      primary: "17-Mukhi Rudraksha",
      secondary: "14-Mukhi Rudraksha",
      reason: `For a native born under the ${nakshatra} nakshatra, both 17-Mukhi and 14-Mukhi are highly beneficial. ${causalReason}`
    },
    seventeenMukhi: {
      details: "The seventeen-Mukhi Rudraksha is ruled by Goddess Katyayani, the sixth incarnation of Goddess Durga. The wearer of this bead is blessed with unexpected wealth, immense prosperity, and success in speculative businesses. It helps workaholics align their energy, strengthens marital bonds, and releases deep-seated tension or grief.",
      benefits: [
        "Relieves tension and emotional depression.",
        "Advantageous for those working in speculative industries like gambling and lotteries.",
        "Makes the wearer fearless in all situations.",
        "Dismisses Saturn's negative effects and must be worn during the Sade Sati phase.",
        "Contributes greatly to the wearer's well-being and prosperity.",
        "Improves the efficiency of the Ajna chakra.",
        "Removes barriers and obstacles from the wearer's life.",
        "Facilitates finding the ideal life partner.",
        "Promises advancement in work-related activities and household duties.",
        "Aids in making wise decisions and overcoming negative past karma.",
        "Removes the dread of dying and encourages truthful actions."
      ],
      howToWear: "Must be worn around the neck or kept in the place of worship on a Monday. Get up early, take a bath, dress in new clothes, sit facing East, and chant 'Om Namaha Shivaya' when wearing or taking it off.",
      precautions: [
        "Every day, worship the seventeen-Mukhi rudraksha and never lose faith in it.",
        "Always have a Shiv Lingha made of Parad or Crystal in front of you when worshiping.",
        "Once in a while, clean the bead with panchaamrit or panchgaveya.",
        "Never show off your seventeen-Mukhi rudraksha beads to anyone.",
        "Do not wear a rudraksha with a broken bead.",
        "Do not give anyone your bead.",
        "Once worn, avoid using chemical soaps on it.",
        "Strictly avoid eating non-vegetarian food.",
        "Strictly avoid drinking alcohol.",
        "Maintain physical and mental purity daily."
      ]
    },
    fourteenMukhi: {
      details: "The fourteen-Mukhi Rudraksha is classically ruled by Lord Shiva and Lord Hanuman. It is highly valued as a powerful shield against evil eye, dark forces, and negative planetary influences. It activates the Ajna Chakra, granting the wearer intense willpower, focus, and the courage to conquer obstacles.",
      benefits: [
        "Provides powerful protection against evil spirits and negative energies.",
        "Removes the malefic effects of Sade Sati.",
        "Enhances leadership qualities and authoritative power.",
        "Instills immense courage and fearlessness through Lord Hanuman's blessings.",
        "Promotes deep spiritual growth and awakening.",
        "Helps in balancing and activating the Ajna Chakra.",
        "Aids in pacifying Mangal Dosh.",
        "Brings steadiness and unwavering focus to the mind.",
        "Shields against sudden or unseen obstacles in life.",
        "Attracts the combined protective blessings of Lord Shiva and Lord Hanuman."
      ],
      howToWear: "Ideally worn on Monday or Shivaratri. It should be worn on the chest or the right hand. Cleanse the bead using Gangajal before wearing, and chant the mantra 'Om Hreem Hoom Namah'.",
      precautions: [
        "Keep the bead hidden from plain view rather than displaying it.",
        "Do not wear the bead while sleeping or visiting cremation grounds.",
        "Do not wear the bead during intercourse.",
        "Cleanse the bead periodically with Gangajal and keep it dry.",
        "Ensure the thread or string is strong and secure.",
        "Never touch the bead with dirty or unwashed hands.",
        "Do not consume non-vegetarian food while wearing this sacred bead.",
        "Do not consume alcohol while wearing this sacred bead.",
        "Worship the bead daily with devotion and respect."
      ]
    }
  };
}

/**
 * Stitching Gemstone suggestions
 */
async function assembleGemstone(kundli, context) {
  await ensureLoaded();

  let ascendant = kundli?.basicDetails?.ascendant?.sign || kundli?.basicDetails?.ascendant || "Aries";
  if (typeof ascendant === "object" && ascendant !== null) ascendant = ascendant.sign;

  const gemstones = kundli?.remedies?.gemstones || kundli?.horoscope?.remedies?.gemstones || {};

  // Helper to map English/Hindi gemstone names back to planet
  function getPlanetForGemstone(gemName) {
    const name = String(gemName || "").toLowerCase();
    if (name.includes("ruby") || name.includes("manik")) return "Sun";
    if (name.includes("pearl") || name.includes("moti")) return "Moon";
    if (name.includes("coral") || name.includes("moonga")) return "Mars";
    if (name.includes("emerald") || name.includes("panna")) return "Mercury";
    if (name.includes("yellow sapphire") || name.includes("pukhraj")) return "Jupiter";
    if (name.includes("diamond") || name.includes("heera") || name.includes("opal")) return "Venus";
    if (name.includes("blue sapphire") || name.includes("neelam")) return "Saturn";
    if (name.includes("gomed") || name.includes("hessonite")) return "Rahu";
    if (name.includes("cat's eye") || name.includes("cats eye") || name.includes("lehsunia")) return "Ketu";
    return null;
  }

  const lifePlanet = getPlanetForGemstone(gemstones.lifeStone?.gemName) || "Sun";
  const luckyPlanet = getPlanetForGemstone(gemstones.luckyStone?.gemName) || "Jupiter";
  const fortunePlanet = getPlanetForGemstone(gemstones.fortuneStone?.gemName) || "Venus";

  const lifeKey = `gemstone:ascendant:${ascendant}:weakplanet:${lifePlanet}`;
  const luckyKey = `gemstone:ascendant:${ascendant}:weakplanet:${luckyPlanet}`;
  const fortuneKey = `gemstone:ascendant:${ascendant}:weakplanet:${fortunePlanet}`;

  // No LLM fallback — missing keys use defaultText from lookupContent(). Guarantees <1s.
  // To populate: node scripts/generateContentBank.js --live --category gemstone
  if (!contentBankCache[lifeKey] || !contentBankCache[luckyKey] || !contentBankCache[fortuneKey]) {
    console.warn(`[ContentBank] Gemstone keys missing for ${ascendant}. Using default descriptions.`);
  }

  const rawLifeStone = gemstones.lifeStone?.gemName || "Ruby (Manik)";
  const rawLuckyStone = gemstones.luckyStone?.gemName || "Yellow Sapphire (Pukhraj)";
  const rawFortuneStone = gemstones.fortuneStone?.gemName || "Diamond (Heera)";

  const cleanGemstoneDesc = (text, type, asc, planet, gem) => {
    if (!text) return "";
    // Strip any lead-in that names the Ascendant sign explicitly (template leakage prevention)
    let cleaned = text
      .replace(/^For\s+a\s+native\s+with\s+[A-Za-z]+\s+Ascendant,?\s+the\s+gemstone\s+associated\s+with\s+[A-Za-z\s]+?is\s+the\s+[A-Za-z\s()]+[.,]?\s*/i, "")
      .replace(/^For\s+(?:an?\s+)?[A-Za-z]+\s+Ascendant,?\s+the\s+gemstone\s+associated\s+with\s+[A-Za-z\s]+?is\s+[A-Za-z\s()]+[.,]?\s*/i, "")
      .replace(/^For\s+(?:an?\s+)?[A-Za-z]+\s+Ascendant,?\s+the\s+gemstone\s+associated\s+with\s+[A-Za-z\s]+?namely\s+[A-Za-z\s()]+[.,]?\s*/i, "")
      // Strip any remaining Ascendant sign name that shouldn't appear (leakage catcher)
      .replace(new RegExp(`\\b(Aries|Taurus|Gemini|Cancer|Leo|Virgo|Libra|Scorpio|Sagittarius|Capricorn|Aquarius|Pisces)\\s+Ascendant\\b`, 'gi'), `${asc} Ascendant`)
      .trim();
    cleaned = cleaned.replace(/^Wearing\s+this\s+stone\s+can/i, "Wearing this stone can");
    cleaned = cleaned.replace(/^[.,\s]+/, "").trim();
    if (cleaned.length > 0) cleaned = cleaned.charAt(0).toUpperCase() + cleaned.slice(1);

    const WHY_MAP = {
      Sun:     `For ${asc} Ascendant, the Sun governs a key house in your chart. When the Sun is strengthened, `,
      Moon:    `For ${asc} Ascendant, the Moon's house governs your emotional and financial sphere. Strengthening it means `,
      Mars:    `For ${asc} Ascendant, Mars rules important houses in your chart. When Mars is strengthened, `,
      Mercury: `For ${asc} Ascendant, Mercury's house rules your intelligence and communication. Strengthening it means `,
      Jupiter: `For ${asc} Ascendant, Jupiter governs the house of wisdom and fortune. When Jupiter is strengthened, `,
      Venus:   `For ${asc} Ascendant, Venus rules the house of fortune and relationships. When Venus is strengthened, `,
      Saturn:  `For ${asc} Ascendant, Saturn rules key houses of karma and discipline. When Saturn is strengthened, `,
      Rahu:    `Rahu amplifies ambition and material drive. Wearing this stone helps channel that energy constructively so that `,
      Ketu:    `Ketu governs past karma and spiritual liberation. Wearing this stone helps ground its energy so that `,
    };
    const whyPrefix = WHY_MAP[planet] || "";
    const combinedDesc = whyPrefix ? `${whyPrefix}${cleaned}` : cleaned;

    if (type === "life") {
      return `To strengthen your core vitality and physical aura, the life stone ${gem} is recommended for ${asc} Ascendant. ${combinedDesc}`;
    }
    if (type === "lucky") {
      return `To activate higher intelligence and attract good fortune, the lucky stone ${gem} is highly beneficial for ${asc} Ascendant. ${combinedDesc}`;
    }
    if (type === "fortune") {
      return `To draw prosperity, spiritual blessings, and destiny-aligned opportunities, the fortune stone ${gem} is recommended for ${asc} Ascendant. ${combinedDesc}`;
    }
    return combinedDesc;
  };

  // Practical guidance data for each stone type
  const PRACTICAL_GUIDANCE = {
    life: {
      minimumWeight: "3–5 carats (minimum 3 carats for meaningful effect)",
      purificationRitual: "Soak in raw milk and Gangajal for 20–30 minutes before wearing. Chant the associated mantra 108 times.",
      expectedTimeframe: "Initial effects are typically felt within 40–90 days of consistent wearing.",
      authenticityNote: "Wear only a certified, untreated, natural stone. Heat-treated or synthetic stones do not carry the same energetic frequency.",
      contraindication: "Consult a Vedic astrologer before wearing if the ruling planet of this stone is a functional malefic in your chart, or if you are in a difficult sub-period of this planet's Mahadasha."
    },
    lucky: {
      minimumWeight: "4–6 carats (minimum 4 carats for full benefit)",
      purificationRitual: "Soak in Gangajal or clean water with turmeric for 20 minutes. Chant the mantra 108 times facing East on the recommended day.",
      expectedTimeframe: "Most wearers notice changes in confidence and opportunities within 45–60 days.",
      authenticityNote: "Ensure the stone is unheated and natural. Request a gemological certificate from a reputed lab before purchasing.",
      contraindication: "Avoid wearing if the ruling planet is debilitated and also a functional malefic for your Ascendant. A qualified astrologer's consultation is strongly advised."
    },
    fortune: {
      minimumWeight: "0.5–1 carat for diamond; 4–5 carats for alternative white sapphire",
      purificationRitual: "Soak in rose water and Gangajal for 30 minutes. Recite the mantra 108 times on a Friday morning.",
      expectedTimeframe: "Relationship and financial harmony improvements are generally observed within 3–6 months of consistent wearing.",
      authenticityNote: "Only natural, unheated, eye-clean diamonds or top-grade white sapphires carry the full planetary energy. Verify with certification.",
      contraindication: "Do not wear if Venus is a functional malefic for your Ascendant or if you are undergoing a Saturn-Venus period with difficult transits."
    }
  };

  const methodologyNote = "All gemstone recommendations follow the classical Lagnesh (Ascendant Lord) methodology of Vedic astrology — stones are recommended to strengthen the Lagna's ruling planet, its functional benefics, and the 9th house lord of fortune.";

  const lifeStoneDesc = cleanGemstoneDesc(lookupContent(lifeKey, [], ""), "life", ascendant, lifePlanet, rawLifeStone);
  const luckyStoneDesc = cleanGemstoneDesc(lookupContent(luckyKey, [], ""), "lucky", ascendant, luckyPlanet, rawLuckyStone);
  const fortuneStoneDesc = cleanGemstoneDesc(lookupContent(fortuneKey, [], ""), "fortune", ascendant, fortunePlanet, rawFortuneStone);

  function getCleanGemName(gemName, type) {
    let name = gemName || "";
    if (type === "fortune" && name.toLowerCase().includes("or")) {
      const parts = name.split(/\s+or\s+/i);
      const prim = parts[0] || "Diamond";
      const sec = parts[1] || "White Sapphire";
      return `${prim} (or ${sec} as a budget alternative)`;
    }
    return name;
  }

  return {
    methodologyNote,
    lifeStone: {
      title: `Life Stone for ${ascendant}`,
      description: lifeStoneDesc,
      gemName: getCleanGemName(rawLifeStone, "life"),
      howToWear: gemstones.lifeStone?.howToWear || "Gold, on ring finger",
      mantra: gemstones.lifeStone?.mantra || "Om hram hrim hraum sah suryaya namah",
      ...PRACTICAL_GUIDANCE.life
    },
    luckyStone: {
      title: `Lucky Stone for ${ascendant}`,
      description: luckyStoneDesc,
      gemName: getCleanGemName(rawLuckyStone, "lucky"),
      howToWear: gemstones.luckyStone?.howToWear || "Gold, on index finger",
      mantra: gemstones.luckyStone?.mantra || "Om gram grim graum sah gurave namah",
      ...PRACTICAL_GUIDANCE.lucky
    },
    fortuneStone: {
      title: `Fortune Stone for ${ascendant}`,
      description: fortuneStoneDesc,
      gemName: getCleanGemName(rawFortuneStone, "fortune"),
      howToWear: gemstones.fortuneStone?.howToWear || "Gold or platinum, on middle finger",
      mantra: gemstones.fortuneStone?.mantra || "Om dram drim draum sah shukraya namah",
      ...PRACTICAL_GUIDANCE.fortune
    },
    astrologerDisclaimer: "Gemstone recommendations should be worn only after confirming key planetary strengths and verifying that the planet is not a functional malefic in your specific divisional charts (such as D9 or D10)."
  };
}

/**
 * Stitching Dosha report
 */
async function assembleDosha(kundli, context) {
  await ensureLoaded();

  const manglikDosha = kundli?.manglikAnalysis?.mangal_dosha;
  const isManglik = manglikDosha?.present || false;
  const sadesatiData = kundli?.manglikAnalysis?.sadesati;
  const isSadeSatiActive = sadesatiData?.is_sadesati || false;
  const kalsarpaDosha = kundli?.manglikAnalysis?.all_doshas?.kaal_sarp_dosha;
  const isKalsarpa = kalsarpaDosha?.present || false;

  const mState = isManglik ? (manglikDosha?.severity === 'mild' ? 'mild' : 'heavy') : 'none';

  // Map Sade Sati to 5 phases: free, rising, peak, setting, post
  let ssPhase = 'free';
  if (isSadeSatiActive) {
    const phase = sadesatiData?.phase?.toLowerCase() || '';
    if (phase.includes('rising') || phase.includes('start')) ssPhase = 'rising';
    else if (phase.includes('peak') || phase.includes('mid')) ssPhase = 'peak';
    else if (phase.includes('setting') || phase.includes('end')) ssPhase = 'setting';
    else if (phase.includes('post') || phase.includes('over')) ssPhase = 'post';
    else ssPhase = 'peak'; // default active = peak
  }

  // Map Kaal Sarp to actual classical type name (anant, kulik, vasuki, etc.)
  const VALID_KAALSARP_TYPES = ['anant', 'kulik', 'vasuki', 'shankhapal', 'padma', 'mahapadma', 'takshak', 'karkotak', 'shankhnaad', 'patak', 'vishadhar', 'sheshnag'];
  let ksType = 'none';
  if (isKalsarpa) {
    const rawType = (kalsarpaDosha?.kalsarpa_type || kalsarpaDosha?.type || kalsarpaDosha?.description || '').toLowerCase().replace(/[\s_-]/g, '');
    const matched = VALID_KAALSARP_TYPES.find(t => rawType.includes(t));
    ksType = matched || 'anant'; // default to anant if type not parsed
  }

  const manglikKey = `dosha:manglik:${mState}`;
  const sadesatiKey = `dosha:sadesati:${ssPhase}`;
  const kaalsarpKey = `dosha:kaalsarp:${ksType}`;

  // No LLM fallback — missing keys use defaultText from lookupContent(). Guarantees <1s.
  // To populate: node scripts/generateContentBank.js --live --category dosha
  if (!contentBankCache[manglikKey] || !contentBankCache[sadesatiKey] || !contentBankCache[kaalsarpKey]) {
    console.warn(`[ContentBank] Dosha keys missing (manglik:${mState} / sadesati:${ssPhase} / kaalsarp:${ksType}). Using defaults.`);
  }

  // Mars house technical note for Manglik section
  const marsInfo = getPlanetInfo(kundli.planetary, "Mars");
  const MANGLIK_HOUSES = [1, 4, 7, 8, 12];
  const isMarsInManglikHouse = MANGLIK_HOUSES.includes(Number(marsInfo.house));
  const manglikTechnicalNote = isManglik
    ? `Mars occupies the ${marsInfo.house}th house in your chart. Manglik Dosh forms when Mars occupies the 1st, 4th, 7th, 8th, or 12th house, as these houses govern key aspects of partner compatibility. Your Mars in the ${marsInfo.house}th house activates this Dosh from the ${marsInfo.house}th house axis. Severity: ${mState === 'heavy' ? 'Heavy — Mars sits directly in one of the primary houses without positive cancellation aspects.' : 'Mild — Mars sits in a house where its intensity is reduced, or cancellation yogas are present.'}`
    : `In your chart, Mars occupies the ${marsInfo.house}th house, which is not one of the five primary Manglik placement houses (1st, 4th, 7th, 8th, 12th). This means you do not carry the Manglik affliction.`;

  // Moon sign opener for Sade Sati — always chart-specific
  const moonSign = kundli?.basicDetails?.moon_sign || kundli?.horoscope?.moon_sign || "your Moon sign";
  const ssProgressionNote = `Sade Sati unfolds in three phases as Saturn transits the signs surrounding your natal ${moonSign} sign. The Rising Phase brings early pressure and subtle shifts. The Peak Phase represents Saturn transiting directly over your Moon, demanding structural changes, maturity, and stamina. The Setting Phase initiates recovery and consolidation of the lessons learned. ${isSadeSatiActive ? `You are currently undergoing Shani Sade Sati in the ${ssPhase.toUpperCase()} phase.` : "You are currently free from Shani Sade Sati."}`;

  // Kaal Sarp chart-freedom explanation (for absent case)
  const ksAbsenceNote = !isKalsarpa
    ? "Kaal Sarp Dosh occurs when all seven classical planets are hemmed between the karmic Rahu and Ketu axis. In your chart, this pattern is absent, meaning your planets are distributed freely. This gives each planetary energy the freedom to operate independently without nodal blockage, representing a significant source of chart resilience."
    : `Kaal Sarp Dosh is present in your chart as planets are hemmed between the Rahu and Ketu axis, specifically forming the ${ksType} type of Kaal Sarp.`;

  const manglikDesc = lookupContent(manglikKey, [], "Manglik details.");
  const sadesatiDesc = lookupContent(sadesatiKey, [], "Sade Sati details.");
  const kaalsarpDesc = lookupContent(kaalsarpKey, [], "Kaal Sarp details.");

  // Consolidate Sade Sati retrograde transit splits
  const rawPeriods = sadesatiData?.periods || [];
  const sortedPeriods = [...rawPeriods].sort((a, b) => {
    const dateA = new Date(a.start_date || a.start || 0);
    const dateB = new Date(b.start_date || b.start || 0);
    return dateA - dateB;
  });

  const consolidatedPeriods = [];
  let currentPeriod = null;

  for (const p of sortedPeriods) {
    const start = p.start_date || p.start || '';
    const end = p.end_date || p.end || '';
    const sign = p.sign_name || p.sign || '';
    const phase = p.type || p.phase || '';

    if (!currentPeriod) {
      currentPeriod = { start, end, sign, phase };
    } else {
      const currentSign = String(currentPeriod.sign).trim().toLowerCase();
      const currentPhase = String(currentPeriod.phase).trim().toLowerCase();
      const pSign = String(sign).trim().toLowerCase();
      const pPhase = String(phase).trim().toLowerCase();

      if (currentSign === pSign && currentPhase === pPhase) {
        currentPeriod.end = end;
      } else {
        consolidatedPeriods.push(currentPeriod);
        currentPeriod = { start, end, sign, phase };
      }
    }
  }
  if (currentPeriod) {
    consolidatedPeriods.push(currentPeriod);
  }

  const timelineTable = consolidatedPeriods.map(p => ({
    start: p.start,
    end: p.end,
    sign: p.sign,
    phase: p.phase
  }));

  // Build the phase descriptions. If the user is currently under a specific phase,
  // we want to put the premium description in that phase, and supportive notes in others.
  const phasesDescription = {
    risingPhase: ssPhase === 'rising' ? sadesatiDesc : "This phase initiates Saturn's discipline, bringing early lessons in patience and financial planning.",
    peakPhase: ssPhase === 'peak' ? sadesatiDesc : "This phase represents the core intensity of Saturn's transit, demanding focus on health, emotional balance, and structural changes.",
    settingPhase: ssPhase === 'setting' ? sadesatiDesc : "This final phase focuses on consolidation, recovery of losses, and long-term wisdom gained from Saturn's lessons."
  };

  // If Sade Sati is not currently active, we can set the peak phase to sadesatiDesc (which represents the 'free' status explanation)
  if (!isCurrentlyActive(isSadeSatiActive)) {
    phasesDescription.peakPhase = sadesatiDesc;
  }

  function isCurrentlyActive(val) {
    return val === true || String(val).toLowerCase() === 'true';
  }

  return {
    manglikDosh: {
      isPresent: isManglik,
      marsHouse: marsInfo.house,
      severity: mState,
      technicalNote: manglikTechnicalNote,
      report: manglikDesc,
      remedies: manglikDosha?.remedies || (isManglik ? ["Chant Hanuman Chalisa", "Perform fasts on Tuesday"] : [])
    },
    kalsarpaDosh: {
      isPresent: isKalsarpa,
      kalsarpaType: isKalsarpa ? (kalsarpaDosha?.kalsarpa_type || kalsarpaDosha?.type || kalsarpaDosha?.description || "Kaal Sarp") : "None",
      generalDescription: isKalsarpa ? kaalsarpDesc : `${kaalsarpDesc} ${ksAbsenceNote}`.trim(),
      specificDescription: isKalsarpa ? `This is a specific type of Kaal Sarp Dosh (${ksType}) that influences house alignments.` : ksAbsenceNote,
      remedies: kalsarpaDosha?.remedies || (isKalsarpa ? ["Chant Maha Mrityunjaya Mantra"] : [])
    },
    sadeSati: {
      isCurrentlyActive: isCurrentlyActive(isSadeSatiActive),
      statusMessage: sadesatiData?.status || (isSadeSatiActive ? `Currently under Shani Sade Sati (${ssPhase} phase).` : "Currently free from Sade Sati."),
      progressionNote: ssProgressionNote,
      timelineTable: timelineTable,
      phasesDescription: phasesDescription
    },
    astrologerDisclaimer: "Dosha calculations and transit timelines are calculated mathematically based on planetary positions. The actual impact may vary depending on planetary aspects, conjunctions, and your current Mahadasha lord."
  };
}

/**
 * Zero-cost synchronous personalization — replaces 3-6 second LLM call.
 * Substitutes third-person references with second-person language. Runs in <1ms.
 */
function personalizeInline(report, fullName) {
  function sub(text) {
    if (!text || typeof text !== "string") return text;
    return text
      .replace(/\bthe native\b/gi, "you")
      .replace(/\bthis native\b/gi, "you")
      .replace(/\bthe individual\b/gi, "you")
      .replace(/\bsuch individuals\b/gi, "people like you")
      .replace(/\bthose with this placement\b/gi, "you")
      .replace(/\bindividuals with this placement\b/gi, "you")
      .replace(/\bone with this placement\b/gi, "you")
      .trim();
  }
  const fields = ["description", "personality", "physical", "health", "career", "relationship"];
  for (const f of fields) {
    if (report[f]) report[f] = sub(report[f]);
  }
  return report;
}

/**
 * Main entry point for fast templated AI report generation
 */
async function generateTemplatedFreeReport({ userRequest, kundli, context = {} }) {
  const totalStartTime = Date.now();
  console.log(`[ContentBank] Commencing fast runtime assembly for ${userRequest.fullName}...`);

  try {
    const [
      generalDetails,
      dashaReport,
      rudrakshaReport,
      gemstoneReport,
      doshaReport
    ] = await Promise.all([
      assembleGeneralDetails(kundli, context),
      assembleVimshottariDasha(kundli, context),
      assembleRudraksha(kundli, context),
      assembleGemstone(kundli, context),
      assembleDosha(kundli, context)
    ]);

    // Stitching together the final result
    const stitchedResult = {
      engine_version: "insight_engine_v3_hybrid_templated",
      generated_by: "hybrid_offline_content_bank",
      generated_at: new Date().toISOString(),

      ...(generalDetails || {}),

      dashaReport: dashaReport || null,
      rudrakshaReport: rudrakshaReport || null,
      gemstoneReport: gemstoneReport || null,
      doshaReport: doshaReport || null,
    };

    // Zero-cost inline personalization — no LLM call, runs in <1ms
    const personalizedResult = personalizeInline(stitchedResult, userRequest.fullName);

    const duration = Date.now() - totalStartTime;
    console.log(`[ContentBank] Templated report assembly complete in ${duration}ms!`);

    return personalizedResult;
  } catch (err) {
    console.error("[ContentBank] Stitching/assembly failed, falling back to live LLM generation:", err);
    return null;
  }
}

module.exports = {
  loadContentBank,
  generateTemplatedFreeReport,
};
