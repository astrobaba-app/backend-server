const UserRequest = require("../../model/user/userRequest");
const Kundli = require("../../model/horoscope/kundli");
const SharedKundliDeletion = require("../../model/horoscope/sharedKundliDeletion");
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
      ashtakvarga: ashtakvargaPayload,
      yogas,
      horoscope,
    });

    // Generate AI-enhanced Free Report narratives in the background (non-blocking)
    // The AI generation takes 30+ seconds, so we don't want to block the response
    generateFreeReportNarratives({
      basicDetails: basicDetailsVal,
      personality: personalityVal,
      remedies,
      horoscope,
      manglikAnalysis: manglikAnalysisVal,
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

    // Return immediately without waiting for AI generation
    res.status(201).json({
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
  getKundli,
  getAllKundlis,
  deleteKundli,
  getAllUserRequests,
  checkAiReportStatus,
  refreshAshtakvarga,
  generateKundliShareLink,
  getSharedKundli,
};
