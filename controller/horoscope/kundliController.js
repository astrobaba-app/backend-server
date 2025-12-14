const UserRequest = require("../../model/user/userRequest");
const Kundli = require("../../model/horoscope/kundli");
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
} = require("../../services/astroEngineService");

const { generateFreeReportNarratives } = require("../../services/freeReportAiService");



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
    const horoscope = extractValue(completeHoroscope, "Complete Horoscope");

    // Prepare compact Ashtakavarga structure expected by frontend
    let ashtakvarga = null;
    if (ashtakvargaData && ashtakvargaData.sarvashtakavarga) {
      try {
        const sarvashtakavarga = ashtakvargaData.sarvashtakavarga;
        const individualCharts = sarvashtakavarga.individual_charts || {};

        const getPointsArray = (signPoints = []) =>
          signPoints.map((sp) => sp.points ?? 0);

        ashtakvarga = {
          sav: getPointsArray(sarvashtakavarga.sign_points || []),
          sun: getPointsArray(individualCharts.Sun?.sign_points || []),
          moon: getPointsArray(individualCharts.Moon?.sign_points || []),
          mars: getPointsArray(individualCharts.Mars?.sign_points || []),
          mercury: getPointsArray(individualCharts.Mercury?.sign_points || []),
          jupiter: getPointsArray(individualCharts.Jupiter?.sign_points || []),
          venus: getPointsArray(individualCharts.Venus?.sign_points || []),
          saturn: getPointsArray(individualCharts.Saturn?.sign_points || []),
        };
      } catch (err) {
        console.error("Failed to transform Ashtakavarga data for UI:", err);
        ashtakvarga = null;
      }
    }

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
    const kundli = await Kundli.create({
      requestId: userRequest.id,
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
      ashtakvarga,
      yogas,
      horoscope,
    });

    // Generate AI-enhanced Free Report narratives (General, Remedies, Dosha)
    let aiFreeReport = null;
    try {
      aiFreeReport = await generateFreeReportNarratives({
        basicDetails: basicDetailsVal,
        personality: personalityVal,
        remedies,
        horoscope,
        manglikAnalysis: manglikAnalysisVal,
      });
    } catch (err) {
      console.error("[KundliController] Failed to generate AI Free Report:", err?.message || err);
    }

    res.status(201).json({
      success: true,
      message: "Kundli created successfully",
      userRequest,
      kundli: {
        ...kundli.toJSON(),
        aiFreeReport,
      },
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

    // Generate AI-enhanced Free Report narratives on demand for fetched kundli
    let aiFreeReport = null;
    try {
      aiFreeReport = await generateFreeReportNarratives({
        basicDetails: kundli.basicDetails,
        personality: kundli.personality,
        remedies: kundli.remedies,
        horoscope: kundli.horoscope,
        manglikAnalysis: kundli.manglikAnalysis,
      });
    } catch (err) {
      console.error("[KundliController] Failed to generate AI Free Report (getKundli):", err?.message || err);
    }

    res.status(200).json({
      success: true,
      kundli: {
        ...kundli.toJSON(),
        aiFreeReport,
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



module.exports = {
  createKundli,
  getKundli,
  getAllKundlis,
  getAllUserRequests,

};
