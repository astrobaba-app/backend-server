const UserRequest = require("../../model/user/userRequest");
const Kundli = require("../../model/horoscope/kundli");
const SharedKundliDeletion = require("../../model/horoscope/sharedKundliDeletion");
const { createChatCompletion } = require("../../services/openaiClient");
const { Op, literal } = require("sequelize");
const { randomUUID } = require("crypto");
const AIChatSession = require("../../model/aiChat/aiChatSession");
const User = require("../../model/user/userAuth");
const { sendMessage } = require("../aiChat/aiChatController");
const {
  validateWhatsappApiKey,
} = require("../../services/whatsappAuthSettingsService");
const {
  resolveIndianCityCoordinates,
} = require("../../services/locationResolverService");
const {
  DateTimeNormalizationError,
  normalizeDobAndTob,
} = require("../../utils/dateTimeNormalizer");
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
  getCompleteHoroscope,
  getTransitChart,
} = require("../../services/astroEngineService");
const {
  queueAstroProductCohortRefresh,
} = require("../../services/astroProductCohortService");

/**
 * Shared helper — converts raw Ashtakavarga API response into the compact
 * house-rotated structure stored in the DB and consumed by the frontend.
 *
 * @param {object} ashtakvargaData  - the full object returned by getAshtakavarga()
 *                                    (includes sarvashtakavarga, analysis, transit_guide)
 * @param {number} ascLongitude     - sidereal ascendant longitude (0-360)
 * @returns {object|null}           - { sav, sun, moon, … asc } or null on failure
 */
function buildAshtakvargaPayload(ashtakvargaData, ascLongitude) {
  if (!ashtakvargaData || !ashtakvargaData.sarvashtakavarga) return null;
  try {
    const sarvashtakavarga = ashtakvargaData.sarvashtakavarga;
    const individualCharts = sarvashtakavarga.individual_charts || {};

    // Store raw sign-indexed arrays (Aries=index 0 … Pisces=index 11).
    // The frontend does the sign→house rotation using the Ascendant sign.
    const getPointsArray = (signPoints = []) =>
      signPoints.map((sp) => sp.points ?? 0);

    return {
      sav:     getPointsArray(sarvashtakavarga.sign_points || []),
      sun:     getPointsArray(individualCharts.Sun?.sign_points || []),
      moon:    getPointsArray(individualCharts.Moon?.sign_points || []),
      mars:    getPointsArray(individualCharts.Mars?.sign_points || []),
      mercury: getPointsArray(individualCharts.Mercury?.sign_points || []),
      jupiter: getPointsArray(individualCharts.Jupiter?.sign_points || []),
      venus:   getPointsArray(individualCharts.Venus?.sign_points || []),
      saturn:  getPointsArray(individualCharts.Saturn?.sign_points || []),
      asc:     getPointsArray(individualCharts.Ascendant?.sign_points || []),
    };
  } catch (err) {
    console.error("buildAshtakvargaPayload error:", err);
    return null;
  }
}

const { generateFreeReportNarratives } = require("../../services/freeReportAiService");

const KUNDLI_DOB_REGEX = /^\d{4}-\d{2}-\d{2}$/;
const KUNDLI_TOB_REGEX = /^\d{2}:\d{2}:\d{2}$/;
const UNKNOWN_WHATSAPP_TOB_DEFAULT = "00:00:00";
const UNKNOWN_WHATSAPP_TOB_TOKENS = new Set([
  "dont know",
  "don't know",
  "do not know",
  "not sure",
  "unknown",
  "not known",
  "no idea",
  "dont remember",
  "don't remember",
  "na",
  "n/a",
  "none",
]);
const DEFAULT_WHATSAPP_AI_ASTROLOGER_ID =
  process.env.WHATSAPP_AI_ASTROLOGER_ID || "ai-astrologer-devansh";
const WHATSAPP_FAST_FORMAT_MODEL =
  process.env.OPENAI_CHAT_MODEL_FAST || process.env.OPENAI_CHAT_MODEL || "gpt-4o-mini";
const WHATSAPP_FAST_FORMAT_TIMEOUT_MS = 1800;

const normalizeMobileNumber = (rawMobile) => {
  const digits = String(rawMobile || "").replace(/\D/g, "");
  if (!digits) return null;

  const withoutLeadingZeros = digits.replace(/^0+/, "");
  const candidates = [
    digits,
    withoutLeadingZeros,
    digits.slice(-10),
    withoutLeadingZeros.slice(-10),
  ];

  for (const candidate of candidates) {
    if (/^[6-9]\d{9}$/.test(candidate)) {
      return candidate;
    }
  }

  return null;
};

const extractWhatsappApiKey = (req) => {
  const requestBody = req.body || {};
  const normalizeApiKeyCandidate = (value) => {
    if (typeof value !== "string") return "";
    let normalized = value.trim();
    if (normalized.toLowerCase().startsWith("bearer ")) {
      normalized = normalized.slice(7).trim();
    }
    if (
      ((normalized.startsWith('"') && normalized.endsWith('"')) ||
        (normalized.startsWith("'") && normalized.endsWith("'"))) &&
      normalized.length >= 2
    ) {
      normalized = normalized.slice(1, -1).trim();
    }
    return normalized.replace(/\s+/g, "");
  };
  const bodyApiKey =
    typeof requestBody.apiKey === "string"
      ? normalizeApiKeyCandidate(requestBody.apiKey)
      : "";
  const headerWhatsappApiKey =
    typeof req.headers["x-whatsapp-api-key"] === "string"
      ? normalizeApiKeyCandidate(req.headers["x-whatsapp-api-key"])
      : "";
  const headerGenericApiKey =
    typeof req.headers["x-api-key"] === "string"
      ? normalizeApiKeyCandidate(req.headers["x-api-key"])
      : "";
  const authorizationHeader =
    typeof req.headers.authorization === "string"
      ? req.headers.authorization.trim()
      : "";

  const authorizationApiKey = normalizeApiKeyCandidate(authorizationHeader);

  // Prefer dedicated WhatsApp header first to avoid collisions with generic x-api-key.
  return headerWhatsappApiKey || headerGenericApiKey || authorizationApiKey || bodyApiKey;
};

const normalizeText = (value) =>
  typeof value === "string" ? value.trim().replace(/\s+/g, " ") : "";

const isUnknownWhatsappTob = (value) => {
  const normalized = normalizeText(value).toLowerCase();
  if (!normalized) return false;

  if (UNKNOWN_WHATSAPP_TOB_TOKENS.has(normalized)) {
    return true;
  }

  if (/\bdon'?t\s+know\b/.test(normalized)) {
    return true;
  }

  if (/\bdo\s+not\s+know\b/.test(normalized)) {
    return true;
  }

  if (/\bnot\s+sure\b/.test(normalized)) {
    return true;
  }

  return false;
};

const resolveWhatsappTob = ({ rawTob, aiTob }) => {
  const normalizedRawTob = normalizeText(rawTob);
  const normalizedAiTob = normalizeText(aiTob);

  if (isUnknownWhatsappTob(normalizedRawTob) || isUnknownWhatsappTob(normalizedAiTob)) {
    return UNKNOWN_WHATSAPP_TOB_DEFAULT;
  }

  return normalizedAiTob || normalizedRawTob;
};

const parseAiJsonContent = (content) => {
  const text = String(content || "").trim();
  if (!text) return null;

  try {
    return JSON.parse(text);
  } catch (_) {
    const fencedMatch = text.match(/\{[\s\S]*\}/);
    if (!fencedMatch) return null;

    try {
      return JSON.parse(fencedMatch[0]);
    } catch {
      return null;
    }
  }
};

const withTimeout = (promise, timeoutMs, timeoutMessage) =>
  new Promise((resolve, reject) => {
    const timer = setTimeout(() => {
      reject(new Error(timeoutMessage));
    }, timeoutMs);

    promise
      .then((value) => {
        clearTimeout(timer);
        resolve(value);
      })
      .catch((error) => {
        clearTimeout(timer);
        reject(error);
      });
  });

const normalizeGenderForKundli = (value) => {
  const normalized = normalizeText(value).toLowerCase();
  if (!normalized) return "";

  if (["m", "male", "man", "boy"].includes(normalized)) return "male";
  if (["f", "female", "woman", "girl"].includes(normalized)) return "female";
  if (["other", "others", "non-binary", "nonbinary", "nb", "transgender"].includes(normalized)) {
    return "other";
  }

  return normalized;
};

const formatWhatsappKundliInputWithOpenAI = async ({
  user_gender,
  user_dob,
  user_tob,
  user_pob,
  context = {},
}) => {
  if (!process.env.OPENAI_API_KEY) {
    return null;
  }

  const completion = await withTimeout(
    createChatCompletion({
      model: WHATSAPP_FAST_FORMAT_MODEL,
      response_format: { type: "json_object" },
      temperature: 0,
      max_tokens: 90,
      messages: [
        {
          role: "system",
          content:
            "You normalize WhatsApp kundli fields. Return ONLY JSON with keys: gender, dob, tob, place_of_birth. Rules: gender must be male/female/other. dob must be YYYY-MM-DD. tob must be HH:mm:ss in 24-hour format. If user_tob means unknown time (for example: don't know, not sure, unknown), set tob to 00:00:00. place_of_birth should be 'City, State' when possible, otherwise city. No extra keys.",
        },
        {
          role: "user",
          content: JSON.stringify({ user_gender, user_dob, user_tob, user_pob }),
        },
      ],
    }, context),
    WHATSAPP_FAST_FORMAT_TIMEOUT_MS,
    "OpenAI formatter timeout"
  );

  const parsed = parseAiJsonContent(completion?.choices?.[0]?.message?.content);
  if (!parsed || typeof parsed !== "object") {
    return null;
  }

  return {
    gender: normalizeText(parsed.gender),
    dob: normalizeText(parsed.dob),
    tob: normalizeText(parsed.tob),
    place_of_birth: normalizeText(parsed.place_of_birth),
  };
};

const getFormattedWhatsappKundliInput = async ({
  user_gender,
  user_dob,
  user_tob,
  user_pob,
  context = {},
}) => {
  const rawGender = normalizeText(user_gender);
  const rawDob = normalizeText(user_dob);
  const rawTob = normalizeText(user_tob);
  const rawPob = normalizeText(user_pob);

  let aiFormatted = null;
  try {
    aiFormatted = await formatWhatsappKundliInputWithOpenAI({
      user_gender: rawGender,
      user_dob: rawDob,
      user_tob: rawTob,
      user_pob: rawPob,
      context,
    });
  } catch (_) {
    aiFormatted = null;
  }

  const mergedGender = normalizeGenderForKundli(aiFormatted?.gender || rawGender);
  const mergedDob = normalizeText(aiFormatted?.dob || rawDob);
  const mergedTob = resolveWhatsappTob({ rawTob, aiTob: aiFormatted?.tob });
  const mergedPlace = normalizeText(aiFormatted?.place_of_birth || rawPob);

  const normalized = normalizeDobAndTob({ dob: mergedDob, tob: mergedTob });

  return {
    gender: mergedGender,
    dob: normalized.dob,
    tob: normalized.tob,
    place_of_birth: mergedPlace,
    source: aiFormatted ? "openai" : "fallback",
  };
};

const getFirstProvidedBodyValue = (body, keys = []) => {
  for (const key of keys) {
    if (Object.prototype.hasOwnProperty.call(body, key)) {
      return body[key];
    }
  }

  return undefined;
};

const derivePlaceCityAndState = ({ place, state }) => {
  const normalizedPlace = normalizeText(place);
  const normalizedState = normalizeText(state);

  const placeSegments = normalizedPlace
    .split(",")
    .map((segment) => segment.trim())
    .filter(Boolean);

  const city = placeSegments[0] || "";
  const derivedState = normalizedState || placeSegments[1] || "";
  const normalizedPlaceOfBirth = derivedState ? `${city}, ${derivedState}` : city;

  return {
    city,
    state: derivedState,
    placeOfBirth: normalizedPlaceOfBirth,
  };
};

const validateKundliPayload = ({ dob, tob, placeOfBirth, latitude, longitude }) => {
  if (!KUNDLI_DOB_REGEX.test(dob)) {
    return "dob must be in YYYY-MM-DD format";
  }

  if (!KUNDLI_TOB_REGEX.test(tob)) {
    return "tob must be in HH:mm:ss (24-hour) format";
  }

  if (!normalizeText(placeOfBirth)) {
    return "place_of_birth is required";
  }

  const lat = Number(latitude);
  const lon = Number(longitude);

  if (!Number.isFinite(lat) || lat < -90 || lat > 90) {
    return "latitude must be a valid number between -90 and 90";
  }

  if (!Number.isFinite(lon) || lon < -180 || lon > 180) {
    return "longitude must be a valid number between -180 and 180";
  }

  return null;
};

const mapWhatsappApiKeyErrorStatus = (reason) => {
  if (reason === "disabled" || reason === "not_configured") {
    return 503;
  }

  return 401;
};

const mapErrorStatus = (error, defaultStatus = 500) => {
  if (!error) return defaultStatus;
  if (Number.isInteger(error.statusCode)) return error.statusCode;
  if (error instanceof DateTimeNormalizationError) return 400;
  return defaultStatus;
};

const createAiAstrologerSessionForKundli = async ({
  sessionId,
  userId,
  kundliUserRequestId,
  astrologerId,
}) => {
  const normalizedAstrologerId = normalizeText(astrologerId);

  const session = await AIChatSession.create({
    ...(sessionId ? { id: sessionId } : {}),
    userId,
    astrologerId: normalizedAstrologerId || DEFAULT_WHATSAPP_AI_ASTROLOGER_ID,
    title: "New Chat",
    isActive: true,
    lastMessageAt: new Date(),
    kundliUserRequestId,
  });

  return session.id;
};

const runWhatsappSessionQuestionInBackground = async ({
  userId,
  sessionId,
  question,
}) => {
  const delegatedRequest = {
    user: { id: userId },
    params: { sessionId },
    body: {
      message: question,
      fastMode: true,
      historyLimit: 8,
    },
  };

  const delegatedResponse = {
    status() {
      return this;
    },
    json(payload) {
      return payload;
    },
  };

  await sendMessage(delegatedRequest, delegatedResponse);
};



const createKundli = async (req, res) => {
  try {
    const userId = req.user.id;
    const {
      fullName,
      dateOfbirth,
      timeOfbirth,
      placeOfBirth,
      gender,
      latitude,
      longitude,
    } = req.body;
    console.log("Creating kundli for user:", req.body);
    console.log("User ID:", latitude, longitude);
   console.log("User ID:", placeOfBirth);
    // Validate required fields
    if (!timeOfbirth || !placeOfBirth || !gender) {
      return res.status(400).json({
        success: false,
        message: "All birth details are required (timeOfbirth, placeOfBirth, gender)",
      });
    }

    // Step 1: Create UserRequest
    const userRequest = await UserRequest.create({
      userId,
      fullName,
      dateOfbirth,
      timeOfbirth,
      placeOfBirth,
      gender,
      latitude: latitude ? parseFloat(latitude) : null,
      longitude: longitude ? parseFloat(longitude) : null,
    });

    console.log("User request created, generating kundli data...");

    // Step 2: Generate all astrology data in parallel
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

    

    // Extract values or set to null if failed
    const extractValue = (result, name) => {
      if (result.status === "fulfilled") {
        return result.value;
      } else {
        console.error(`${name} failed:`, result.reason?.message || result.reason);
        return null;
      }
    };

    console.log("[KundliController] Vimshottari Dasha settled result:", dasha);
    console.log("[KundliController] Yogini Dasha settled result:", yogini);

    const basicDetailsVal = extractValue(basicDetails, "Basic Details");
    const astroDetailsVal = extractValue(astroDetails, "Astro Details (House Cusps)");
    const panchangVal = extractValue(panchang, "Panchang");
    const planetaryVal = extractValue(planetary, "Planetary Positions");
    const chartsVal = extractValue(charts, "Charts");
    const dashaVal = extractValue(dasha, "Vimshottari Dasha");
    const yoginiVal = extractValue(yogini, "Yogini Dasha");
    const manglikAnalysisVal = extractValue(manglikAnalysis, "Manglik Analysis");
    const personalityVal = extractValue(personality, "Personality/Ascendant Report");

    const remedies = {
      gemstones: extractValue(gemstoneRemedies, "Gemstone Remedies"),
      rudraksha: extractValue(rudrakshaSuggestion, "Rudraksha Suggestion"),
    };

    const ashtakvargaData = extractValue(ashtakavarga, "Ashtakavarga");
    const transitVal = extractValue(transit, "Transit Chart");
    const horoscope = extractValue(completeHoroscope, "Complete Horoscope");

    // Prepare compact Ashtakavarga structure expected by frontend
    const ashtakvargaPayload = buildAshtakvargaPayload(
      ashtakvargaData,
      basicDetailsVal?.ascendant?.longitude ?? 0
    );

    // Prepare yogas list from complete horoscope if available
    let yogas = null;
    if (horoscope && Array.isArray(horoscope.yoga_analysis)) {
      yogas = horoscope.yoga_analysis.map((yoga) => ({
        name: yoga.name,
        type: yoga.type,
        strength: yoga.strength,
        description: yoga.description,
        effects: yoga.effects,
      }));
    }

    // Step 3: Create kundli record
    // Merge transit data into horoscope object (safe: keeps existing `horoscope` shape)
    const finalHoroscope = (horoscope && typeof horoscope === "object") ? { ...horoscope } : {};
    if (transitVal) {
      finalHoroscope.transit = transitVal;
    }
    const kundli = await Kundli.create({
      requestId: userRequest.id,
      sessionId: req.kundliSessionId || null,
      createdBy: req.kundliCreatedBy || "user",
      basicDetails: basicDetailsVal,
      astroDetails: astroDetailsVal,
      manglikAnalysis: manglikAnalysisVal,
      panchang: panchangVal,
      charts: chartsVal,
      dasha: dashaVal,
      yogini: yoginiVal,
      personality: personalityVal,
      planetary: planetaryVal,
      remedies,
      ashtakvarga: ashtakvargaPayload,
      yogas,
      horoscope: finalHoroscope,
    });
    queueAstroProductCohortRefresh(userId, "kundli_created");

   // console.log("planetary result from kundli controller:", kundli);
    // Generate AI-enhanced Free Report narratives in the background (non-blocking)
    // The AI generation takes 30+ seconds, so we don't want to block the response
    generateFreeReportNarratives({
      userRequest: userRequest.toJSON ? userRequest.toJSON() : userRequest,
      kundli: {
        basicDetails: basicDetailsVal,
        astroDetails: astroDetailsVal,
        manglikAnalysis: manglikAnalysisVal,
        panchang: panchangVal,
        charts: chartsVal,
        dasha: dashaVal,
        yogini: yoginiVal,
        personality: personalityVal,
        planetary: planetaryVal,
        remedies,
        ashtakvarga: ashtakvargaPayload,
        yogas,
        horoscope: finalHoroscope,
      },
      context: { req, userId: userRequest.userId, feature: "free_report_ai" },
    })
      .then((aiFreeReport) => {
        if (aiFreeReport) {
          // Update the kundli record with AI report when ready
          return Kundli.update(
            { aiFreeReport },
            { where: { id: kundli.id } }
          );
        }
      })
      .catch((err) => {
        console.error("[KundliController] Background AI Free Report generation failed:", err?.message || err);
      });

    const responseStatusCode = req.responseFormat === "whatsapp-minimal" ? 200 : 201;

    // WhatsApp flow requests a compact payload for low-overhead integrations.
    if (req.responseFormat === "whatsapp-minimal") {
      const sessionId = randomUUID();

      // Create AI session in background so response is returned immediately.
      setImmediate(async () => {
        try {
          await createAiAstrologerSessionForKundli({
            sessionId,
            userId,
            kundliUserRequestId: userRequest.id,
            astrologerId: req.aiAstrologerId,
          });
        } catch (sessionError) {
          console.error("Create AI astrologer session error:", sessionError);
        }
      });

      const whatsappData = {
        success: true,
        statusCode: responseStatusCode,
        userRequestId: userRequest.id,
        kundli: {
          id: kundli.id,
        },
        sessionId,
      };

      return res.status(responseStatusCode).json({
        ...whatsappData,
        data: whatsappData,
      });
    }

    // Return immediately without waiting for AI generation
    return res.status(responseStatusCode).json({
      success: true,
      message: "Kundli created successfully",
      userRequest,
      kundli: kundli.toJSON(),
    });
  } catch (error) {
    console.error("Create Kundli error:", error);
    res.status(500).json({
      success: false,
      message: "Failed to create kundli",
      error: error.message,
    });
  }
};

const createKundliFromWhatsapp = async (req, res) => {
  try {
    const requestBody = req.body || {};
    const providedApiKey = extractWhatsappApiKey(req);

    const apiKeyValidation = await validateWhatsappApiKey(providedApiKey);

    if (!apiKeyValidation.isValid) {
      return res.status(mapWhatsappApiKeyErrorStatus(apiKeyValidation.reason)).json({
        success: false,
        message: "WhatsApp API key validation failed",
        reason: apiKeyValidation.reason,
      });
    }

    const name = normalizeText(
      requestBody.name ||
        requestBody.fullName ||
        requestBody.userName ||
        requestBody.user_name
    );
    const rawGender = normalizeText(requestBody.gender || requestBody.user_gender);
    const rawDob =
      requestBody.dob ||
      requestBody.dateOfbirth ||
      requestBody.dateOfBirth ||
      requestBody.user_dob;
    const rawTob =
      requestBody.tob ||
      requestBody.timeOfbirth ||
      requestBody.timeOfBirth ||
      requestBody.user_tob;
    const rawPlaceOfBirth =
      requestBody.place_of_birth ||
      requestBody.placeOfBirth ||
      requestBody.pob ||
      requestBody.user_pob;
    const rawState = requestBody.state;
    const rawMobile =
      requestBody.mobileNumber ||
      requestBody.mobile ||
      requestBody.destination ||
      requestBody.user_mobile ||
      requestBody.user_phone;

    const missingFields = [];
    if (!rawGender) missingFields.push("gender");
    if (!rawDob) missingFields.push("dob");
    if (!rawTob) missingFields.push("tob");
    if (!rawPlaceOfBirth) missingFields.push("place_of_birth");
    if (!rawMobile) missingFields.push("mobileNumber/mobile/destination");

    if (missingFields.length > 0) {
      return res.status(400).json({
        success: false,
        message:
          "Required fields are missing. Expected gender, dob, tob, place_of_birth and mobileNumber/mobile/destination (also supports user_gender, user_dob, user_tob, user_pob, user_mobile).",
      });
    }

    const normalizedMobile = normalizeMobileNumber(rawMobile);
    if (!normalizedMobile) {
      return res.status(400).json({
        success: false,
        message: "Invalid mobile number format",
      });
    }

    let formattedInput;
    try {
      formattedInput = await getFormattedWhatsappKundliInput({
        user_gender: rawGender,
        user_dob: rawDob,
        user_tob: rawTob,
        user_pob: rawPlaceOfBirth,
        context: { req, feature: "whatsapp_kundli_format" },
      });
    } catch (formatError) {
      return res.status(mapErrorStatus(formatError, 400)).json({
        success: false,
        message: formatError?.message || "Invalid dob/tob format",
        field: formatError?.field || null,
      });
    }

    const gender = formattedInput.gender || normalizeGenderForKundli(rawGender);
    const normalizedDob = formattedInput.dob;
    const normalizedTob = formattedInput.tob;
    const aiFormattedPlaceOfBirth =
      formattedInput.place_of_birth || normalizeText(rawPlaceOfBirth);

    const { city, state, placeOfBirth } = derivePlaceCityAndState({
      place: aiFormattedPlaceOfBirth,
      state: rawState,
    });

    if (!city) {
      return res.status(400).json({
        success: false,
        message: "place_of_birth must include at least a city name",
      });
    }

    // Critical path optimization: execute DB lookup and geocoding in parallel.
    const [userResult, locationResult] = await Promise.allSettled([
      User.findOne({
        where: { mobile: normalizedMobile },
        attributes: ["id", "fullName", "mobile"],
      }),
      resolveIndianCityCoordinates({ city, state }),
    ]);

    if (userResult.status === "rejected") {
      throw userResult.reason;
    }

    if (locationResult.status === "rejected") {
      return res.status(mapErrorStatus(locationResult.reason, 422)).json({
        success: false,
        message:
          locationResult.reason?.message ||
          "Unable to resolve latitude and longitude for place_of_birth",
      });
    }

    const existingUser = userResult.value;
    if (!existingUser) {
      return res.status(404).json({
        success: false,
        message: "User not found for provided mobile number",
      });
    }

    const latitude = locationResult.value.latitude;
    const longitude = locationResult.value.longitude;

    const validationError = validateKundliPayload({
      dob: normalizedDob,
      tob: normalizedTob,
      placeOfBirth,
      latitude,
      longitude,
    });

    if (validationError) {
      return res.status(400).json({
        success: false,
        message: validationError,
      });
    }

    const preparedKundliPayload = {
      name: name || existingUser.fullName || "User",
      gender,
      dob: normalizedDob,
      tob: normalizedTob,
      place_of_birth: placeOfBirth,
      latitude,
      longitude,
    };

    const requestedAiAstrologerId = normalizeText(
      requestBody.aiAstrologerId || requestBody.ai_astrologer_id || requestBody.astrologerId
    );

    const delegatedRequest = {
      responseFormat: "whatsapp-minimal",
      aiAstrologerId: requestedAiAstrologerId || null,
      user: { id: existingUser.id },
      body: {
        fullName: preparedKundliPayload.name,
        gender: preparedKundliPayload.gender,
        dateOfbirth: preparedKundliPayload.dob,
        timeOfbirth: preparedKundliPayload.tob,
        placeOfBirth: preparedKundliPayload.place_of_birth,
        latitude: preparedKundliPayload.latitude,
        longitude: preparedKundliPayload.longitude,
      },
    };

    // Reuse the existing Kundli creation route handler to avoid duplicating generation logic.
    return createKundli(delegatedRequest, res);
  } catch (error) {
    console.error("WhatsApp Kundli creation error:", error);
    return res.status(mapErrorStatus(error)).json({
      success: false,
      message: "Failed to create kundli from WhatsApp data",
      error: error.message,
    });
  }
};

const formatWhatsappKundliInputFast = async (req, res) => {
  try {
    const requestBody = req.body || {};
    const providedApiKey = extractWhatsappApiKey(req);

    const apiKeyValidation = await validateWhatsappApiKey(providedApiKey);

    if (!apiKeyValidation.isValid) {
      return res.status(mapWhatsappApiKeyErrorStatus(apiKeyValidation.reason)).json({
        success: false,
        message: "WhatsApp API key validation failed",
        reason: apiKeyValidation.reason,
      });
    }

    const rawGender = normalizeText(requestBody.user_gender || requestBody.gender);
    const rawDob = normalizeText(requestBody.user_dob || requestBody.dob);
    const rawTob = normalizeText(requestBody.user_tob || requestBody.tob);
    const rawPob = normalizeText(
      requestBody.user_pob || requestBody.place_of_birth || requestBody.placeOfBirth
    );
    const rawState = normalizeText(requestBody.state);

    const missingFields = [];
    if (!rawGender) missingFields.push("user_gender");
    if (!rawDob) missingFields.push("user_dob");
    if (!rawTob) missingFields.push("user_tob");
    if (!rawPob) missingFields.push("user_pob");

    if (missingFields.length > 0) {
      return res.status(400).json({
        success: false,
        message: `Required fields are missing: ${missingFields.join(", ")}`,
      });
    }

    const formattedInput = await getFormattedWhatsappKundliInput({
      user_gender: rawGender,
      user_dob: rawDob,
      user_tob: rawTob,
      user_pob: rawPob,
      context: { req, feature: "whatsapp_kundli_format" },
    });

    const { city, state, placeOfBirth } = derivePlaceCityAndState({
      place: formattedInput.place_of_birth,
      state: rawState,
    });

    if (!city) {
      return res.status(400).json({
        success: false,
        message: "user_pob must include at least a city name",
      });
    }

    return res.status(200).json({
      success: true,
      statusCode: 200,
      source: formattedInput.source,
      formatted: {
        gender: formattedInput.gender,
        dateOfbirth: formattedInput.dob,
        timeOfbirth: formattedInput.tob,
        placeOfBirth,
        state: state || null,
      },
    });
  } catch (error) {
    return res.status(mapErrorStatus(error, 400)).json({
      success: false,
      message: error?.message || "Failed to format WhatsApp kundli input",
      field: error?.field || null,
    });
  }
};

const askQuestionInWhatsappSession = async (req, res) => {
  let responseStatusCode = 200;
  let resolvedSessionId = null;
  let remainingWhatsappChatLimit = null;
  const originalStatus = res.status.bind(res);
  const originalJson = res.json.bind(res);

  res.status = (statusCode) => {
    responseStatusCode = statusCode;
    return originalStatus(statusCode);
  };

  res.json = (payload) => {
    const payloadWithData =
      payload && typeof payload === "object" && !Array.isArray(payload) && !payload.data
        ? {
            ...payload,
            data: {
              success: payload.success ?? responseStatusCode < 400,
              statusCode: payload.statusCode || responseStatusCode,
              message: payload.message || null,
              sessionId: payload.sessionId || resolvedSessionId || null,
              userMessage: payload.userMessage || null,
              aiMessage: payload.aiMessage || null,
              tokensUsed: payload.tokensUsed ?? null,
              remainingWhatsappChatLimit,
            },
          }
        : payload;

    return originalJson(payloadWithData);
  };

  try {
    const requestBody = req.body || {};
    const providedApiKey = extractWhatsappApiKey(req);

    const apiKeyValidation = await validateWhatsappApiKey(providedApiKey);

    if (!apiKeyValidation.isValid) {
      return res.status(mapWhatsappApiKeyErrorStatus(apiKeyValidation.reason)).json({
        success: false,
        message: "WhatsApp API key validation failed",
        reason: apiKeyValidation.reason,
      });
    }

    const sessionIdRaw = getFirstProvidedBodyValue(requestBody, [
      "sessionId",
      "session_id",
      "session_Id",
      "sessionID",
    ]);
    const questionRaw = getFirstProvidedBodyValue(requestBody, [
      "question",
      "message",
      "user_question",
      "userQuestion",
    ]);

    const sessionId = normalizeText(sessionIdRaw);
    const question = normalizeText(questionRaw);
    resolvedSessionId = sessionId || null;
    const hasTemplatePlaceholder = (value) => /^\$[a-zA-Z_]/.test(String(value || "").trim());
    const waitForReply =
      requestBody.waitForReply === true || requestBody.wait_for_reply === true;
    const runAsync =
      requestBody.async === true || requestBody.background === true;
    const processInBackground = runAsync && !waitForReply;

    if (!sessionId || !question) {
      return res.status(400).json({
        success: false,
        message:
          "sessionId and question are required. If you are using template variables, ensure they are resolved before request is sent.",
      });
    }

    if (hasTemplatePlaceholder(sessionId) || hasTemplatePlaceholder(question)) {
      return res.status(400).json({
        success: false,
        message:
          "Template placeholders detected. Please send actual values for sessionId and question.",
      });
    }

    const session = await AIChatSession.findOne({
      where: { id: sessionId, isActive: true },
      attributes: ["id", "userId"],
    });

    if (!session) {
      return res.status(404).json({
        success: false,
        message: "Chat session not found",
      });
    }

    const [updatedCount, updatedUsers] = await User.update(
      {
        whatsappChatLimit: literal('GREATEST("whatsappChatLimit" - 1, 0)'),
      },
      {
        where: {
          id: session.userId,
          whatsappChatLimit: {
            [Op.gt]: 0,
          },
        },
        returning: true,
      }
    );

    if (!updatedCount) {
      return res.status(400).json({
        success: false,
        message: "WhatsApp chat limit exhausted. Please recharge or contact support.",
      });
    }

    remainingWhatsappChatLimit =
      updatedUsers && updatedUsers[0]
        ? Number(updatedUsers[0].whatsappChatLimit)
        : null;

    if (processInBackground) {
      // Optional async mode: acknowledge quickly and process in background.
      setImmediate(async () => {
        try {
          await runWhatsappSessionQuestionInBackground({
            userId: session.userId,
            sessionId: session.id,
            question,
          });
        } catch (backgroundError) {
          console.error("Background WhatsApp question processing error:", backgroundError);
        }
      });

      return res.status(202).json({
        success: true,
        statusCode: 202,
        sessionId: session.id,
        message: "Question accepted and processing in background",
      });
    }

    const delegatedRequest = {
      user: { id: session.userId },
      params: { sessionId: session.id },
      body: {
        message: question,
        fastMode: true,
        historyLimit: 8,
      },
    };

    // Delegate to the existing AI chat send endpoint logic.
    return sendMessage(delegatedRequest, res);
  } catch (error) {
    console.error("WhatsApp session ask error:", error);
    return res.status(mapErrorStatus(error)).json({
      success: false,
      message: "Failed to send question in WhatsApp session",
      error: error.message,
    });
  }
};


const getKundli = async (req, res) => {
  try {
    const userId = req.user.id;
    const { userRequestId } = req.params;

    // Check if user request exists and belongs to the user
    const userRequest = await UserRequest.findOne({
      where: { id: userRequestId, userId },
    });

    if (!userRequest) {
      return res.status(404).json({
        success: false,
        message: "User request not found",
      });
    }

    const kundli = await Kundli.findOne({ 
      where: { requestId: userRequestId },
      include: [{ model: UserRequest, as: "userRequest" }],
    });

    if (!kundli) {
      return res.status(404).json({
        success: false,
        message: "Kundli not found. Please generate it first.",
      });
    }

    await kundli.increment("viewCount", { by: 1 });
    await kundli.update({ lastViewedAt: new Date() });
    queueAstroProductCohortRefresh(userId, "kundli_viewed");

    // Simply return the kundli data with whatever AI report exists (or null)
    // The frontend polling will handle getting AI content when it's ready
    res.status(200).json({
      success: true,
      kundli: {
        ...kundli.toJSON(),
      },
    });
  } catch (error) {
    console.error("Get Kundli error:", error);
    res.status(500).json({
      success: false,
      message: "Failed to fetch kundli",
      error: error.message,
    });
  }
};

const getAllUserRequests = async (req, res) => {
  try {
    const userId = req.user.id;

    const userRequests = await UserRequest.findAll({
      where: { userId },
    //   include: [{ model: Kundli, as: "kundli" }],
       attributes: [
        "id",
        "fullName",
        "dateOfbirth",
        "timeOfbirth",
        "placeOfBirth",
      ],
      order: [["createdAt", "DESC"]],
    });

    res.status(200).json({
      success: true,
      count: userRequests.length,
      userRequests,
    });
  } catch (error) {
    console.error("Get All User Requests error:", error);
    res.status(500).json({
      success: false,
      message: "Failed to fetch user requests",
      error: error.message,
    });
  }
};


const getAllKundlis = async (req, res) => {
  try {
    const userId = req.user.id;

    const userRequests = await UserRequest.findAll({
      where: { userId },
       attributes: [
        "id",
        "fullName",
        "dateOfbirth",
        "timeOfbirth",
        "placeOfBirth",
        "gender",
        "latitude",
        "longitude",
      ],
      order: [["createdAt", "DESC"]],
    });

    res.status(200).json({
      success: true,
      userRequests,
    });
  } catch (error) {
    console.error("Get All Kundlis error:", error);
    res.status(500).json({
      success: false,
      message: "Failed to fetch kundlis",
      error: error.message,
    });
  }
};

const deleteKundli = async (req, res) => {
  try {
    const userId = req.user.id;
    const { userRequestId } = req.params;

    const userRequest = await UserRequest.findOne({
      where: { id: userRequestId, userId },
    });

    if (!userRequest) {
      return res.status(404).json({
        success: false,
        message: "Kundli not found",
      });
    }

    const kundli = await Kundli.findOne({
      where: { requestId: userRequestId },
      attributes: ["id", "isPublic"],
    });

    if (kundli?.isPublic) {
      await SharedKundliDeletion.upsert({
        requestId: userRequestId,
        deletedByUser: true,
        deletedAt: new Date(),
      });
    }

    await userRequest.destroy();

    return res.status(200).json({
      success: true,
      message: "Kundli deleted successfully",
    });
  } catch (error) {
    console.error("Delete Kundli error:", error);
    return res.status(500).json({
      success: false,
      message: "Failed to delete kundli",
      error: error.message,
    });
  }
};

// Check if AI Free Report is ready (for polling)
const checkAiReportStatus = async (req, res) => {
  try {
    const userId = req.user.id;
    const { userRequestId } = req.params;

    // Verify ownership
    const userRequest = await UserRequest.findOne({
      where: { id: userRequestId, userId },
    });

    if (!userRequest) {
      return res.status(404).json({
        success: false,
        message: "User request not found",
      });
    }

    const kundli = await Kundli.findOne({ 
      where: { requestId: userRequestId },
      attributes: ['id', 'aiFreeReport'],
    });

    if (!kundli) {
      return res.status(404).json({
        success: false,
        message: "Kundli not found",
      });
    }

    res.status(200).json({
      success: true,
      isReady: !!kundli.aiFreeReport,
      aiFreeReport: kundli.aiFreeReport,
    });
  } catch (error) {
    console.error("Check AI Report Status error:", error);
    res.status(500).json({
      success: false,
      message: "Failed to check AI report status",
      error: error.message,
    });
  }
};


/**
 * PUT /kundli/:userRequestId/refresh-ashtakvarga
 * Re-fetches Ashtakavarga from the Python engine and overwrites the stored
 * ashtakvarga field. Useful when the stored data is stale / from old code.
 */
const refreshAshtakvarga = async (req, res) => {
  try {
    const userId = req.user.id;
    const { userRequestId } = req.params;

    // Verify ownership
    const userRequest = await UserRequest.findOne({
      where: { id: userRequestId, userId },
    });
    if (!userRequest) {
      return res.status(404).json({ success: false, message: "User request not found" });
    }

    const kundli = await Kundli.findOne({ where: { requestId: userRequestId } });
    if (!kundli) {
      return res.status(404).json({ success: false, message: "Kundli not found" });
    }

    // Re-fetch from astro engine (basic details for ascendant + ashtakavarga)
    const [basicDetailsResult, ashtakvargaResult] = await Promise.allSettled([
      getBasicDetails(userRequest),
      getAshtakavarga(userRequest),
    ]);

    const basicDetailsVal = basicDetailsResult.status === "fulfilled" ? basicDetailsResult.value : null;
    const ashtakvargaData = ashtakvargaResult.status === "fulfilled" ? ashtakvargaResult.value : null;

    if (!basicDetailsVal?.ascendant?.longitude) {
      console.error("[refreshAshtakvarga] Could not get ascendant longitude", basicDetailsVal);
    }
    if (!ashtakvargaData?.sarvashtakavarga) {
      console.error("[refreshAshtakvarga] Could not get ashtakvarga data", ashtakvargaData);
      return res.status(500).json({ success: false, message: "Failed to fetch Ashtakavarga from astro engine" });
    }

    const freshPayload = buildAshtakvargaPayload(
      ashtakvargaData,
      basicDetailsVal?.ascendant?.longitude ?? 0
    );

    if (!freshPayload) {
      return res.status(500).json({ success: false, message: "Failed to build Ashtakavarga payload" });
    }

    await Kundli.update(
      { ashtakvarga: freshPayload },
      { where: { requestId: userRequestId } }
    );

    // Return full updated kundli
    const updatedKundli = await Kundli.findOne({
      where: { requestId: userRequestId },
      include: [{ model: UserRequest, as: "userRequest" }],
    });

    res.status(200).json({
      success: true,
      message: "Ashtakavarga refreshed successfully",
      kundli: updatedKundli.toJSON(),
    });
  } catch (error) {
    console.error("refreshAshtakvarga error:", error);
    res.status(500).json({ success: false, message: "Failed to refresh Ashtakavarga", error: error.message });
  }
};

const generateKundliShareLink = async (req, res) => {
  try {
    const userId = req.user.id;
    const { userRequestId } = req.params;

    if (!userRequestId) {
      return res.status(400).json({
        success: false,
        message: "userRequestId is required",
      });
    }

    const userRequest = await UserRequest.findOne({
      where: { id: userRequestId, userId },
    });

    if (!userRequest) {
      return res.status(404).json({
        success: false,
        message: "User request not found",
      });
    }

    const kundli = await Kundli.findOne({ where: { requestId: userRequestId } });
    if (!kundli) {
      return res.status(404).json({
        success: false,
        message: "Kundli not found",
      });
    }

    if (!kundli.isPublic) {
      await kundli.update({ isPublic: true });
    }

    const frontendBaseUrl = (process.env.FRONTEND_URL || "http://localhost:3000").replace(/\/+$/, "");
    const shareUrl = `${frontendBaseUrl}/kundliReport?id=${encodeURIComponent(userRequestId)}`;

    return res.status(200).json({
      success: true,
      message: "Kundli share link generated successfully",
      shareUrl,
    });
  } catch (error) {
    console.error("Generate Kundli Share Link error:", error);
    return res.status(500).json({
      success: false,
      message: "Failed to generate share link",
      error: error.message,
    });
  }
};

const getSharedKundli = async (req, res) => {
  try {
    const { userRequestId } = req.params;

    if (!userRequestId) {
      return res.status(400).json({
        success: false,
        message: "userRequestId is required",
      });
    }

    const kundli = await Kundli.findOne({
      where: { requestId: userRequestId, isPublic: true },
      include: [{ model: UserRequest, as: "userRequest" }],
    });

    if (!kundli) {
      const deletedSharedKundli = await SharedKundliDeletion.findOne({
        where: { requestId: userRequestId, deletedByUser: true },
      });

      if (deletedSharedKundli) {
        return res.status(410).json({
          success: false,
          message: "This kundli was deleted by user",
        });
      }

      return res.status(404).json({
        success: false,
        message: "Shared kundli not found",
      });
    }

    const kundliJson = kundli.toJSON();
    if (kundliJson.userRequest) {
      delete kundliJson.userRequest.userId;
    }

    return res.status(200).json({
      success: true,
      shared: true,
      kundli: kundliJson,
    });
  } catch (error) {
    console.error("Get Shared Kundli error:", error);
    return res.status(500).json({
      success: false,
      message: "Failed to fetch shared kundli",
      error: error.message,
    });
  }
};

module.exports = {
  createKundli,
  createKundliFromWhatsapp,
  formatWhatsappKundliInputFast,
  askQuestionInWhatsappSession,
  getKundli,
  getAllKundlis,
  deleteKundli,
  getAllUserRequests,
  checkAiReportStatus,
  refreshAshtakvarga,
  generateKundliShareLink,
  getSharedKundli,
};
