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
} = require("../../services/astroService");



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

    // Validate required fields
    if (!timeOfbirth || !placeOfBirth || !gender || !latitude || !longitude) {
      return res.status(400).json({
        success: false,
        message: "All birth details are required (timeOfbirth, placeOfBirth, gender, latitude, longitude)",
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
      latitude,
      longitude,
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

    const remedies = {
      gemstones: extractValue(gemstoneRemedies, "Gemstone Remedies"),
      rudraksha: extractValue(rudrakshaSuggestion, "Rudraksha Suggestion"),
    };

    // Step 3: Create kundli record
    const kundli = await Kundli.create({
      requestId: userRequest.id,
      basicDetails: extractValue(basicDetails, "Basic Details"),
      astroDetails: extractValue(astroDetails, "Astro Details (House Cusps)"),
      manglikAnalysis: extractValue(manglikAnalysis, "Manglik Analysis"),
      panchang: extractValue(panchang, "Panchang"),
      charts: extractValue(charts, "Charts"),
      dasha: extractValue(dasha, "Vimshottari Dasha"),
      yogini: extractValue(yogini, "Yogini Dasha"),
      personality: extractValue(personality, "Personality/Ascendant Report"),
      planetary: extractValue(planetary, "Planetary Positions"),
      remedies,
    });

    res.status(201).json({
      success: true,
      message: "Kundli created successfully",
      userRequest,
      kundli,
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

    res.status(200).json({
      success: true,
      kundli,
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
