const { getCachedHoroscope } = require('../../services/horoscopeGenerationService');

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

    // Use cached horoscope system
    const requestDate = date ? new Date(date) : new Date();
    const result = await getCachedHoroscope(zodiacSign, 'daily', requestDate);
    
    res.status(200).json(result);
  } catch (error) {
    console.error("Daily horoscope error:", error);
    
    res.status(500).json({
      success: false,
      message: "Failed to fetch daily horoscope",
      error: error.message
    });
  }
};

const getWeeklyHoroscope = async (req, res) => {
  try {
    const { zodiacSign } = req.params;
    const { start_date } = req.query;
    
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

    // Use cached horoscope system
    const requestDate = start_date ? new Date(start_date) : new Date();
    const result = await getCachedHoroscope(zodiacSign, 'weekly', requestDate);
    
    res.status(200).json(result);
  } catch (error) {
    console.error("Weekly horoscope error:", error);
    
    res.status(500).json({
      success: false,
      message: "Failed to fetch weekly horoscope",
      error: error.message
    });
  }
};

const getMonthlyHoroscope = async (req, res) => {
  try {
    const { zodiacSign } = req.params;
    const { year, month } = req.query;
    
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

    // Use cached horoscope system
    const now = new Date();
    const requestDate = new Date(
      year ? parseInt(year) : now.getFullYear(),
      month ? parseInt(month) - 1 : now.getMonth(),
      1
    );
    const result = await getCachedHoroscope(zodiacSign, 'monthly', requestDate);
    
    res.status(200).json(result);
  } catch (error) {
    console.error("Monthly horoscope error:", error);
    
    res.status(500).json({
      success: false,
      message: "Failed to fetch monthly horoscope",
      error: error.message
    });
  }
};

const getYearlyHoroscope = async (req, res) => {
  try {
    const { zodiacSign } = req.params;
    const { year } = req.query;
    
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

    // Use cached horoscope system
    const requestDate = new Date(year ? parseInt(year) : new Date().getFullYear(), 0, 1);
    const result = await getCachedHoroscope(zodiacSign, 'yearly', requestDate);
    
    res.status(200).json(result);
  } catch (error) {
    console.error("Yearly horoscope error:", error);
    
    res.status(500).json({
      success: false,
      message: "Failed to fetch yearly horoscope",
      error: error.message
    });
  }
};

module.exports = {
  getDailyHoroscope,
  getWeeklyHoroscope,
  getMonthlyHoroscope,
  getYearlyHoroscope,
};
