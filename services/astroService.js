const astro = require("../config/astroapi/astro");


const formatDate = (dateString) => {
  const date = new Date(dateString);
  const day = String(date.getDate()).padStart(2, "0");
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const year = date.getFullYear();
  return `${day}/${month}/${year}`;
};


const parseTime = (timeString) => {
  const [hour, minute] = timeString.split(":");
  return { hour: parseInt(hour), minute: parseInt(minute) };
};


const getBirthDetailsPayload = (userRequest) => {
  const { hour, minute } = parseTime(userRequest.timeOfbirth);
  
  return {
    day: new Date(userRequest.dateOfbirth).getDate(),
    month: new Date(userRequest.dateOfbirth).getMonth() + 1,
    year: new Date(userRequest.dateOfbirth).getFullYear(),
    hour,
    min: minute,
    lat: userRequest.latitude,
    lon: userRequest.longitude,
    tzone: 5.5, // IST timezone (adjust if needed)
  };
};


const getBasicDetails = async (userRequest) => {
  try {
    const payload = getBirthDetailsPayload(userRequest);
    const result = await astro.vedic.getBirthDetails(payload);
    return result;
  } catch (error) {
    console.error("Error in getBasicDetails:", error.message);
    throw error;
  }
};

/**
 * Fetch Astro details (includes house cusps, ascendant, etc.)
 */
const getAstroDetails = async (userRequest) => {
  const payload = getBirthDetailsPayload(userRequest);
  return await astro.vedic.getAstroDetails(payload);
};

/**
 * Fetch Basic Panchang (free tier)
 */
const getPanchang = async (userRequest) => {
  const payload = getBirthDetailsPayload(userRequest);
  // Try basic_panchang first (might be available in free tier)
  try {
    return await astro.customRequest({
      method: "POST",
      endpoint: "basic_panchang",
      params: payload,
    });
  } catch (error) {
    // Fallback to advanced_panchang
    return await astro.customRequest({
      method: "POST",
      endpoint: "advanced_panchang",
      params: payload,
    });
  }
};

/**
 * Fetch Planetary positions with details
 */
const getPlanetaryPositions = async (userRequest) => {
  const payload = getBirthDetailsPayload(userRequest);
  return await astro.vedic.getPlanets(payload);
};


const getBirthChart = async (userRequest) => {
  const payload = getBirthDetailsPayload(userRequest);
  return await astro.vedic.getHoroChartD1(payload);
};


const getNavamsaChart = async (userRequest) => {
  const payload = getBirthDetailsPayload(userRequest);
  return await astro.customRequest({
    method: "POST",
    endpoint: "horo_chart/D9",
    params: payload,
  });
};


const getAllCharts = async (userRequest) => {
  const payload = getBirthDetailsPayload(userRequest);
  const chartTypes = ["D1", "D2", "D3", "D4", "D7", "D9", "D10", "D12", "D16", "D20", "D24", "D27", "D30", "D40", "D45", "D60"];
  
  const charts = {};
  for (const chartType of chartTypes) {
    try {
      const response = await astro.customRequest({
        method: "POST",
        endpoint: `horo_chart/${chartType}`,
        params: payload,
      });
      charts[chartType] = response;
    } catch (error) {
      console.error(`Error fetching ${chartType}:`, error.message);
      charts[chartType] = null;
    }
  }
  
  return charts;
};


const getVimshottariDasha = async (userRequest) => {
  const payload = getBirthDetailsPayload(userRequest);
  return await astro.customRequest({
    method: "POST",
    endpoint: "major_vdasha",
    params: payload,
  });
};


const getYoginiDasha = async (userRequest) => {
  const payload = getBirthDetailsPayload(userRequest);
  return await astro.customRequest({
    method: "POST",
    endpoint: "major_yogini_dasha",
    params: payload,
  });
};


const getManglikAnalysis = async (userRequest) => {
  const payload = getBirthDetailsPayload(userRequest);
  return await astro.customRequest({
    method: "POST",
    endpoint: "manglik",
    params: payload,
  });
};


const getAscendantReport = async (userRequest) => {
  const payload = getBirthDetailsPayload(userRequest);
  return await astro.customRequest({
    method: "POST",
    endpoint: "general_ascendant_report",
    params: payload,
  });
};


const getPlanetReport = async (userRequest, planet = "sun") => {
  const payload = getBirthDetailsPayload(userRequest);
  return await astro.customRequest({
    method: "POST",
    endpoint: `planet_report/${planet}`,
    params: payload,
  });
};


const getBasicPanchang = async (userRequest) => {
  const payload = getBirthDetailsPayload(userRequest);
  return await astro.customRequest({
    method: "POST",
    endpoint: "basic_panchang",
    params: payload,
  });
};


const getGemstoneRemedies = async (userRequest) => {
  const payload = getBirthDetailsPayload(userRequest);
  return await astro.customRequest({
    method: "POST",
    endpoint: "basic_gem_suggestion",
    params: payload,
  });
};


const getRudrakshaSuggestion = async (userRequest) => {
  const payload = getBirthDetailsPayload(userRequest);
  return await astro.customRequest({
    method: "POST",
    endpoint: "rudraksha_suggestion",
    params: payload,
  });
};

module.exports = {
  getBirthDetailsPayload,
  getBasicDetails,
  getAstroDetails,
  getPanchang,
  getPlanetaryPositions,
  getBirthChart,
  getNavamsaChart,
  getAllCharts,
  getVimshottariDasha,
  getYoginiDasha,
  getManglikAnalysis,
  getAscendantReport,
  getPlanetReport,
  getBasicPanchang,
  getGemstoneRemedies,
  getRudrakshaSuggestion,
};
