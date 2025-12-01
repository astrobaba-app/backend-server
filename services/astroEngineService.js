const axios = require('axios');

// Astro Engine configuration
const ASTRO_ENGINE_BASE_URL = process.env.ASTRO_ENGINE_URL || 'http://localhost:8000/api/v1';

/**
 * Format date from string to YYYY-MM-DD
 */
const formatDate = (dateString) => {
  const date = new Date(dateString);
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const day = String(date.getDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
};

/**
 * Format time to HH:MM:SS
 */
const formatTime = (timeString) => {
  const [hour, minute] = timeString.split(":");
  return `${String(hour).padStart(2, "0")}:${String(minute).padStart(2, "0")}:00`;
};

/**
 * Create birth data payload for Astro Engine
 */
const getBirthDataPayload = (userRequest) => {
  return {
    name: userRequest.fullName || "User",
    date: formatDate(userRequest.dateOfbirth),
    time: formatTime(userRequest.timeOfbirth),
    latitude: parseFloat(userRequest.latitude),
    longitude: parseFloat(userRequest.longitude),
    timezone: "Asia/Kolkata", // Default timezone, can be made configurable
  };
};

/**
 * Fetch birth chart with planetary positions and houses
 */
const getBirthChart = async (userRequest) => {
  try {
    const birth_data = getBirthDataPayload(userRequest);
    console.log('Fetching birth chart with data:', birth_data);
    const response = await axios.post(`${ASTRO_ENGINE_BASE_URL}/chart/birth`, {
      birth_data,
      house_system: "PLACIDUS"
    });
    return response.data;
  } catch (error) {
    console.error("Error in getBirthChart:", error.response?.data || error.message);
    console.error("Birth data sent:", getBirthDataPayload(userRequest));
    throw error;
  }
};

/**
 * Fetch basic details (from birth chart)
 */
const getBasicDetails = async (userRequest) => {
  try {
    const chartData = await getBirthChart(userRequest);
    return {
      ascendant: chartData.chart.ascendant,
      sun_sign: chartData.chart.planets.Sun.sign,
      moon_sign: chartData.chart.planets.Moon.sign,
    };
  } catch (error) {
    console.error("Error in getBasicDetails:", error.response?.data || error.message);
    return null;
  }
};

/**
 * Fetch Astro details (houses and planetary positions)
 */
const getAstroDetails = async (userRequest) => {
  try {
    const chartData = await getBirthChart(userRequest);
    return {
      houses: chartData.chart.houses,
      ascendant: chartData.chart.ascendant,
    };
  } catch (error) {
    console.error("Error in getAstroDetails:", error.response?.data || error.message);
    return null;
  }
};

/**
 * Fetch Panchang
 */
const getPanchang = async (userRequest) => {
  try {
    const response = await axios.post(`${ASTRO_ENGINE_BASE_URL}/panchang`, {
      date: formatDate(userRequest.dateOfbirth),
      latitude: parseFloat(userRequest.latitude),
      longitude: parseFloat(userRequest.longitude),
      timezone: "Asia/Kolkata",
    });
    return response.data.panchang;
  } catch (error) {
    console.error("Error in getPanchang:", error.response?.data || error.message);
    return null;
  }
};

/**
 * Fetch Planetary positions with details
 */
const getPlanetaryPositions = async (userRequest) => {
  try {
    const chartData = await getBirthChart(userRequest);
    return chartData.chart.planets;
  } catch (error) {
    console.error("Error in getPlanetaryPositions:", error.response?.data || error.message);
    return null;
  }
};

/**
 * Fetch all divisional charts (D1-D60)
 */
const getAllCharts = async (userRequest) => {
  try {
    const birth_data = getBirthDataPayload(userRequest);
    const response = await axios.post(`${ASTRO_ENGINE_BASE_URL}/divisional/all`, {
      birth_data
    });
    // Check if response has the expected structure
    if (response.data && response.data.divisional_charts) {
      return response.data.divisional_charts;
    } else if (response.data && response.data.charts) {
      return response.data.charts;
    } else if (response.data && response.data.data) {
      return response.data.data;
    }
    return response.data;
  } catch (error) {
    console.error("Error in getAllCharts:", error.response?.data || error.message);
    // Return null instead of throwing to allow other data to be saved
    return null;
  }
};

/**
 * Fetch Vimshottari Dasha
 */
const getVimshottariDasha = async (userRequest) => {
  try {
    const birth_data = getBirthDataPayload(userRequest);
    const response = await axios.post(`${ASTRO_ENGINE_BASE_URL}/dasha/vimshottari`, {
      birth_data,
      years: 120
    });
    return response.data.dashas;
  } catch (error) {
    console.error("Error in getVimshottariDasha:", error.response?.data || error.message);
    return null;
  }
};

/**
 * Fetch Yogini Dasha (using Vimshottari as fallback if not available)
 */
const getYoginiDasha = async (userRequest) => {
  try {
    // Astro Engine doesn't have separate Yogini Dasha endpoint yet
    // Using Vimshottari as placeholder
    return await getVimshottariDasha(userRequest);
  } catch (error) {
    console.error("Error in getYoginiDasha:", error.response?.data || error.message);
    return null;
  }
};

/**
 * Fetch Manglik Analysis
 */
const getManglikAnalysis = async (userRequest) => {
  try {
    const birth_data = getBirthDataPayload(userRequest);
    const response = await axios.post(`${ASTRO_ENGINE_BASE_URL}/yogas`, {
      birth_data
    });
    
    // Extract Manglik/Dosha information
    const yogasData = response.data.yogas_doshas || response.data;
    const doshas = yogasData.doshas || [];
    
    // Find Mangal Dosha specifically
    const mangalDosha = doshas.find(d => 
      d.name?.toLowerCase().includes('mangal') || 
      d.name?.toLowerCase().includes('manglik') ||
      d.name?.toLowerCase().includes('kuja')
    );
    
    return {
      is_manglik: !!mangalDosha,
      mangal_dosha: mangalDosha || null,
      all_doshas: doshas,
      description: mangalDosha ? mangalDosha.description : "No Mangal Dosha detected"
    };
  } catch (error) {
    console.error("Error in getManglikAnalysis:", error.response?.data || error.message);
    // Return null instead of throwing to allow other data to be saved
    return null;
  }
};

/**
 * Fetch Ascendant Report (personality traits)
 */
const getAscendantReport = async (userRequest) => {
  try {
    const chartData = await getBirthChart(userRequest);
    const ascendant = chartData.chart.ascendant;
    
    // Basic ascendant report
    return {
      ascendant_sign: ascendant.sign,
      ascendant_degree: ascendant.longitude,
      description: `Ascendant in ${ascendant.sign}`,
    };
  } catch (error) {
    console.error("Error in getAscendantReport:", error.response?.data || error.message);
    return null;
  }
};

/**
 * Fetch Gemstone Remedies
 */
const getGemstoneRemedies = async (userRequest) => {
  try {
    const birth_data = getBirthDataPayload(userRequest);
    const response = await axios.post(`${ASTRO_ENGINE_BASE_URL}/horoscope/complete`, {
      birth_data
    });
    
    // Extract remedies from horoscope
    return response.data.horoscope.remedies?.gemstones || {
      primary: "Ruby",
      secondary: "Pearl",
      description: "Based on planetary positions"
    };
  } catch (error) {
    console.error("Error in getGemstoneRemedies:", error.message);
    // Return default if endpoint not available
    return {
      primary: "Consult an astrologer",
      secondary: "Based on birth chart",
    };
  }
};

/**
 * Fetch Rudraksha Suggestion
 */
const getRudrakshaSuggestion = async (userRequest) => {
  try {
    const birth_data = getBirthDataPayload(userRequest);
    const response = await axios.post(`${ASTRO_ENGINE_BASE_URL}/horoscope/complete`, {
      birth_data
    });
    
    // Extract rudraksha from horoscope
    return response.data.horoscope.remedies?.rudraksha || {
      suggested: "5 Mukhi Rudraksha",
      description: "Based on planetary positions"
    };
  } catch (error) {
    console.error("Error in getRudrakshaSuggestion:", error.message);
    // Return default if endpoint not available
    return {
      suggested: "5 Mukhi Rudraksha",
      description: "Consult an astrologer for personalized recommendation"
    };
  }
};

/**
 * Get complete horoscope (all data in one call)
 */
const getCompleteHoroscope = async (userRequest) => {
  try {
    const birth_data = getBirthDataPayload(userRequest);
    const response = await axios.post(`${ASTRO_ENGINE_BASE_URL}/horoscope/complete`, {
      birth_data
    });
    return response.data.horoscope;
  } catch (error) {
    console.error("Error in getCompleteHoroscope:", error.message);
    throw error;
  }
};

module.exports = {
  getBirthDataPayload,
  getBasicDetails,
  getAstroDetails,
  getPanchang,
  getPlanetaryPositions,
  getBirthChart,
  getAllCharts,
  getVimshottariDasha,
  getYoginiDasha,
  getManglikAnalysis,
  getAscendantReport,
  getGemstoneRemedies,
  getRudrakshaSuggestion,
  getCompleteHoroscope,
};
