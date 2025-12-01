const axios = require('axios');

// Astro Engine configuration
const ASTRO_ENGINE_BASE_URL = process.env.ASTRO_ENGINE_URL || 'http://localhost:8000/api/v1';

const getDailyHoroscope = async (req, res) => {
  try {
    const { zodiacSign } = req.params;
    const { date } = req.query; // Optional date parameter
    
    // Valid zodiac signs
    const validSigns = [
      "aries", "taurus", "gemini", "cancer", 
      "leo", "virgo", "libra", "scorpio", 
      "sagittarius", "capricorn", "aquarius", "pisces"
    ];

    if (!validSigns.includes(zodiacSign.toLowerCase())) {
      return res.status(400).json({
        success: false,
        message: "Invalid zodiac sign. Valid signs: aries, taurus, gemini, cancer, leo, virgo, libra, scorpio, sagittarius, capricorn, aquarius, pisces",
      });
    }

    // Capitalize first letter for astro-engine API
    const capitalizedSign = zodiacSign.charAt(0).toUpperCase() + zodiacSign.slice(1).toLowerCase();
    
    // Fetch daily horoscope from Astro Engine
    const url = `${ASTRO_ENGINE_BASE_URL}/horoscope/daily/${capitalizedSign}`;
    const params = date ? { date } : {};
    
    const response = await axios.get(url, { params });

    res.status(200).json({
      success: true,
      zodiacSign: zodiacSign.toLowerCase(),
      horoscope: response.data.data,
    });
  } catch (error) {
    console.error("Daily horoscope error:", error);
    
    res.status(500).json({
      success: false,
      message: "Failed to fetch daily horoscope",
      error: error.response?.data?.detail || error.message,
    });
  }
};


const getWeeklyHoroscope = async (req, res) => {
  try {
    const { zodiacSign } = req.params;
    const { start_date } = req.query; // Optional start_date parameter
    
    const validSigns = [
      "aries", "taurus", "gemini", "cancer", 
      "leo", "virgo", "libra", "scorpio", 
      "sagittarius", "capricorn", "aquarius", "pisces"
    ];

    if (!validSigns.includes(zodiacSign.toLowerCase())) {
      return res.status(400).json({
        success: false,
        message: "Invalid zodiac sign",
      });
    }

    // Capitalize first letter for astro-engine API
    const capitalizedSign = zodiacSign.charAt(0).toUpperCase() + zodiacSign.slice(1).toLowerCase();
    
    const url = `${ASTRO_ENGINE_BASE_URL}/horoscope/weekly/${capitalizedSign}`;
    const params = start_date ? { start_date } : {};
    
    const response = await axios.get(url, { params });

    res.status(200).json({
      success: true,
      zodiacSign: zodiacSign.toLowerCase(),
      horoscope: response.data.data,
    });
  } catch (error) {
    console.error("Weekly horoscope error:", error);

    res.status(500).json({
      success: false,
      message: "Failed to fetch weekly horoscope",
      error: error.response?.data?.detail || error.message,
    });
  }
};


const getMonthlyHoroscope = async (req, res) => {
  try {
    const { zodiacSign } = req.params;
    const { year, month } = req.query; // Optional year and month parameters
    
    const validSigns = [
      "aries", "taurus", "gemini", "cancer", 
      "leo", "virgo", "libra", "scorpio", 
      "sagittarius", "capricorn", "aquarius", "pisces"
    ];

    if (!validSigns.includes(zodiacSign.toLowerCase())) {
      return res.status(400).json({
        success: false,
        message: "Invalid zodiac sign",
      });
    }

    // Capitalize first letter for astro-engine API
    const capitalizedSign = zodiacSign.charAt(0).toUpperCase() + zodiacSign.slice(1).toLowerCase();
    
    const url = `${ASTRO_ENGINE_BASE_URL}/horoscope/monthly/${capitalizedSign}`;
    const params = {};
    if (year) params.year = year;
    if (month) params.month = month;
    
    const response = await axios.get(url, { params });

    res.status(200).json({
      success: true,
      zodiacSign: zodiacSign.toLowerCase(),
      horoscope: response.data.data,
    });
  } catch (error) {
    console.error("Monthly horoscope error:", error);

    res.status(500).json({
      success: false,
      message: "Failed to fetch monthly horoscope",
      error: error.response?.data?.detail || error.message,
    });
  }
};


const getYearlyHoroscope = async (req, res) => {
  try {
    const { zodiacSign } = req.params;
    const { year } = req.query; // Optional year parameter
    
    const validSigns = [
      "aries", "taurus", "gemini", "cancer", 
      "leo", "virgo", "libra", "scorpio", 
      "sagittarius", "capricorn", "aquarius", "pisces"
    ];

    if (!validSigns.includes(zodiacSign.toLowerCase())) {
      return res.status(400).json({
        success: false,
        message: "Invalid zodiac sign",
      });
    }

    // Capitalize first letter for astro-engine API
    const capitalizedSign = zodiacSign.charAt(0).toUpperCase() + zodiacSign.slice(1).toLowerCase();
    
    const url = `${ASTRO_ENGINE_BASE_URL}/horoscope/yearly/${capitalizedSign}`;
    const params = year ? { year } : {};
    
    const response = await axios.get(url, { params });

    res.status(200).json({
      success: true,
      zodiacSign: zodiacSign.toLowerCase(),
      horoscope: response.data.data,
    });
  } catch (error) {
    console.error("Yearly horoscope error:", error);

    res.status(500).json({
      success: false,
      message: "Failed to fetch yearly horoscope",
      error: error.response?.data?.detail || error.message,
    });
  }
};

module.exports = {
  getDailyHoroscope,
  getWeeklyHoroscope,
  getMonthlyHoroscope,
  getYearlyHoroscope,
};
