const UserRequest = require("../model/user/userRequest");
const Kundli = require("../model/horoscope/kundli");
const { extractDashaData } = require("./daily-kundli-report");
const {
  getBasicDetails,
  getAstroDetails,
  getPanchang,
  getPlanetaryPositions,
  getAllCharts,
  getVimshottariDasha,
  getYoginiDasha,
  getManglikAnalysis,
  getAscendantReport,
  getGemstoneRemedies,
  getRudrakshaSuggestion,
  getAshtakavarga,
  getTransitChart,
  getCompleteHoroscope,
} = require("./astroEngineService");

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

const PALM_RELEVANT_HOUSES = {
  1: "personality, vitality, body constitution",
  2: "money habits, family values, speech",
  4: "childhood conditioning, inner comfort, home",
  5: "intelligence, creativity, romance",
  7: "marriage and partnerships",
  8: "major transformations and hidden stress",
  9: "belief, luck, spirituality",
  10: "career direction and public karma",
  11: "gains, network, wish fulfilment",
  12: "subconscious, isolation, spiritual retreat",
};

const toPlain = (record) => (record?.toJSON ? record.toJSON() : record);

const cleanString = (value) => String(value || "").trim();

const parseNumberOrNull = (value) => {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : null;
};

const assertBirthCoordinates = (userRequest) => {
  const latitude = parseNumberOrNull(userRequest?.latitude);
  const longitude = parseNumberOrNull(userRequest?.longitude);
  if (latitude === null || longitude === null) {
    throw new Error("Birth latitude and longitude are required for kundli generation");
  }
};

const loadUserRequestForPalm = async ({ userId, userRequestId }) => {
  if (!userRequestId) return null;
  const userRequest = await UserRequest.findOne({
    where: { id: userRequestId, userId },
    include: [{ model: Kundli, as: "kundli", required: false }],
  });
  if (!userRequest) {
    throw new Error("Selected kundli details were not found for this user");
  }
  return userRequest;
};

const findOrCreateUserRequestForPalm = async (userId, body = {}) => {
  if (body.userRequestId) {
    return loadUserRequestForPalm({ userId, userRequestId: body.userRequestId });
  }

  const fullName = cleanString(body.fullName);
  const gender = cleanString(body.gender);
  const dateOfbirth = cleanString(body.dateOfbirth);
  const timeOfbirth = cleanString(body.timeOfbirth);
  const placeOfBirth = cleanString(body.placeOfBirth);
  const latitude = parseNumberOrNull(body.latitude);
  const longitude = parseNumberOrNull(body.longitude);

  if (!fullName || !gender || !dateOfbirth || !timeOfbirth || !placeOfBirth) {
    throw new Error("Missing required kundli fields: fullName, gender, dateOfbirth, timeOfbirth, placeOfBirth");
  }
  if (latitude === null || longitude === null) {
    throw new Error("Birth latitude and longitude are required for palm report kundli analysis");
  }

  const parsedDob = new Date(dateOfbirth);
  if (Number.isNaN(parsedDob.getTime())) {
    throw new Error("Invalid dateOfbirth");
  }

  let userRequest = await UserRequest.findOne({
    where: {
      userId,
      fullName,
      dateOfbirth: parsedDob,
      timeOfbirth,
      placeOfBirth,
      gender,
    },
    include: [{ model: Kundli, as: "kundli", required: false }],
  });

  if (!userRequest) {
    userRequest = await UserRequest.create({
      userId,
      fullName,
      dateOfbirth: parsedDob,
      timeOfbirth,
      placeOfBirth,
      gender,
      latitude,
      longitude,
    });
    userRequest = await loadUserRequestForPalm({ userId, userRequestId: userRequest.id });
  }

  return userRequest;
};

const extractValue = (result, name) => {
  if (result.status === "fulfilled") return result.value;
  console.error(`[PalmKundli] ${name} failed:`, result.reason?.message || result.reason);
  return null;
};

const normalizeAshtakavarga = (ashtakavargaData) => {
  if (!ashtakavargaData) return null;
  if (ashtakavargaData.sav || ashtakavargaData.bav) return ashtakavargaData;
  return {
    sav: ashtakavargaData?.sarvashtakavarga?.points || ashtakavargaData?.points || [],
    raw: ashtakavargaData,
  };
};

const ensureKundliForUserRequest = async (userRequestRecord) => {
  const userRequest = toPlain(userRequestRecord);
  if (userRequestRecord?.kundli) {
    return toPlain(userRequestRecord.kundli);
  }

  assertBirthCoordinates(userRequest);
  console.log("[PalmKundli] Generating kundli for palm report", {
    userId: userRequest.userId,
    userRequestId: userRequest.id,
    fullName: userRequest.fullName,
  });

  const [
    basicDetails,
    astroDetails,
    panchang,
    planetary,
    charts,
    dasha,
    yogini,
    manglikAnalysis,
    personality,
    gemstoneRemedies,
    rudrakshaSuggestion,
    ashtakavarga,
    transit,
    completeHoroscope,
  ] = await Promise.allSettled([
    getBasicDetails(userRequest),
    getAstroDetails(userRequest),
    getPanchang(userRequest),
    getPlanetaryPositions(userRequest),
    getAllCharts(userRequest),
    getVimshottariDasha(userRequest),
    getYoginiDasha(userRequest),
    getManglikAnalysis(userRequest),
    getAscendantReport(userRequest),
    getGemstoneRemedies(userRequest),
    getRudrakshaSuggestion(userRequest),
    getAshtakavarga(userRequest),
    getTransitChart(userRequest),
    getCompleteHoroscope(userRequest),
  ]);

  const horoscope = extractValue(completeHoroscope, "Complete Horoscope");
  const finalHoroscope = horoscope && typeof horoscope === "object" ? { ...horoscope } : {};
  const transitVal = extractValue(transit, "Transit");
  if (transitVal) finalHoroscope.transit = transitVal;

  const yogas = Array.isArray(horoscope?.yoga_analysis)
    ? horoscope.yoga_analysis.map((yoga) => ({
        name: yoga.name,
        type: yoga.type,
        strength: yoga.strength,
        description: yoga.description,
        effects: yoga.effects,
      }))
    : null;

  const kundliData = {
    requestId: userRequest.id,
    basicDetails: extractValue(basicDetails, "Basic Details"),
    astroDetails: extractValue(astroDetails, "Astro Details"),
    manglikAnalysis: extractValue(manglikAnalysis, "Manglik"),
    panchang: extractValue(panchang, "Panchang"),
    charts: extractValue(charts, "Charts"),
    dasha: extractValue(dasha, "Vimshottari Dasha"),
    yogini: extractValue(yogini, "Yogini Dasha"),
    personality: extractValue(personality, "Personality"),
    planetary: extractValue(planetary, "Planetary"),
    remedies: {
      gemstones: extractValue(gemstoneRemedies, "Gemstones"),
      rudraksha: extractValue(rudrakshaSuggestion, "Rudraksha"),
    },
    ashtakvarga: normalizeAshtakavarga(extractValue(ashtakavarga, "Ashtakavarga")),
    yogas,
    horoscope: finalHoroscope,
  };

  const created = await Kundli.create(kundliData);
  return toPlain(created);
};

const getPlanetPlacement = (kundli, planetName) => {
  const planets = kundli?.planetary?.planets || {};
  const key = Object.keys(planets).find((name) => name.toLowerCase() === planetName.toLowerCase());
  if (!key) return null;
  const planet = planets[key] || {};
  return {
    planet: key,
    sign: planet.sign || null,
    degree: planet.degree ?? planet.sign_degree ?? null,
    house: kundli?.planetary?.planet_houses?.[key] || planet.house || null,
    retrograde: Boolean(planet.is_retrograde || planet.isRetrograde),
  };
};

const buildHouseContext = (kundli) => {
  const ascendantSign = kundli?.basicDetails?.ascendant?.sign || kundli?.astroDetails?.ascendant?.sign || null;
  const ascIdx = SIGNS.findIndex((sign) => sign.toLowerCase() === String(ascendantSign || "").toLowerCase());
  const planetHouses = kundli?.planetary?.planet_houses || {};
  return Object.entries(PALM_RELEVANT_HOUSES).map(([house, meaning]) => {
    const houseNumber = Number(house);
    const sign = ascIdx >= 0 ? SIGNS[(ascIdx + houseNumber - 1) % 12] : null;
    const planets = Object.entries(planetHouses)
      .filter(([, h]) => Number(h) === houseNumber)
      .map(([planet]) => planet);
    return { house: houseNumber, meaning, sign, planets };
  });
};

const buildDivisionalHints = (kundli) => {
  const charts = kundli?.charts || {};
  const pick = (chartKey) => {
    const chart = charts[chartKey] || charts[String(chartKey).toLowerCase()] || null;
    if (!chart || typeof chart !== "object") return null;
    return {
      chart: chartKey,
      ascendant: chart.ascendant?.sign || chart.ascendant_sign || null,
      note: chartKey === "D9" ? "relationship maturity" : chartKey === "D10" ? "career expression" : "natal structure",
    };
  };
  return [pick("D1"), pick("D9"), pick("D10")].filter(Boolean);
};

const buildPalmKundliContext = (kundli, userRequestRecord) => {
  const userRequest = toPlain(userRequestRecord);
  const planets = ["Sun", "Moon", "Mars", "Mercury", "Jupiter", "Venus", "Saturn", "Rahu", "Ketu"]
    .map((planet) => getPlanetPlacement(kundli, planet))
    .filter(Boolean);

  const context = {
    personalDetails: {
      fullName: userRequest?.fullName || null,
      gender: userRequest?.gender || null,
      dateOfbirth: userRequest?.dateOfbirth || null,
      timeOfbirth: userRequest?.timeOfbirth || null,
      placeOfBirth: userRequest?.placeOfBirth || null,
    },
    birthIdentity: {
      ascendant: kundli?.basicDetails?.ascendant || kundli?.astroDetails?.ascendant || null,
      sunSign: kundli?.basicDetails?.sun_sign || null,
      moonSign: kundli?.basicDetails?.moon_sign || null,
      panchang: {
        tithi: kundli?.panchang?.tithi || null,
        nakshatra: kundli?.panchang?.nakshatra || null,
        yoga: kundli?.panchang?.yoga || null,
        karana: kundli?.panchang?.karana || null,
      },
    },
    currentDasha: extractDashaData(kundli, new Date()),
    relevantHouses: buildHouseContext(kundli),
    keyPlanets: planets,
    divisionalHints: buildDivisionalHints(kundli),
    selectedYogas: Array.isArray(kundli?.yogas) ? kundli.yogas.slice(0, 6) : [],
    remedies: kundli?.remedies || null,
  };

  console.log("[PalmKundli] Focused kundli context built", {
    userRequestId: userRequest?.id,
    planetCount: planets.length,
    houseCount: context.relevantHouses.length,
    yogaCount: context.selectedYogas.length,
    approxChars: JSON.stringify(context).length,
  });

  return context;
};

module.exports = {
  findOrCreateUserRequestForPalm,
  loadUserRequestForPalm,
  ensureKundliForUserRequest,
  buildPalmKundliContext,
};
