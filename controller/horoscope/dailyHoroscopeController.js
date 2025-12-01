const astro = require("../../config/astroapi/astro");

const getDailyHoroscope = async (req, res) => {
  try {
    const { zodiacSign } = req.params;
    
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

    // Fetch daily horoscope from AstroAPI
    const horoscope = await astro.customRequest({
      method: "POST",
      endpoint: `sun_sign_prediction/daily/${zodiacSign.toLowerCase()}`,
      params: {},
    });

    res.status(200).json({
      success: true,
      zodiacSign: zodiacSign.toLowerCase(),
      horoscope,
    });
  } catch (error) {
    console.error("Daily horoscope error:", error);
    
    // Check if it's a subscription error
    if (error.status === false || error.msg?.includes("not authorized")) {
      return res.status(403).json({
        success: false,
        message: "Daily horoscope feature is not available in your API subscription plan",
        error: error.msg || error.message,
      });
    }

    res.status(500).json({
      success: false,
      message: "Failed to fetch daily horoscope",
      error: error.message,
    });
  }
};


const getWeeklyHoroscope = async (req, res) => {
  try {
    const { zodiacSign } = req.params;
    
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

    const horoscope = await astro.customRequest({
      method: "POST",
      endpoint: `sun_sign_prediction/weekly/${zodiacSign.toLowerCase()}`,
      params: {},
    });

    res.status(200).json({
      success: true,
      zodiacSign: zodiacSign.toLowerCase(),
      horoscope,
    });
  } catch (error) {
    console.error("Weekly horoscope error:", error);
    
    if (error.status === false || error.msg?.includes("not authorized")) {
      return res.status(403).json({
        success: false,
        message: "Weekly horoscope feature is not available in your API subscription plan",
        error: error.msg || error.message,
      });
    }

    res.status(500).json({
      success: false,
      message: "Failed to fetch weekly horoscope",
      error: error.message,
    });
  }
};


const getMonthlyHoroscope = async (req, res) => {
  try {
    const { zodiacSign } = req.params;
    
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

    const horoscope = await astro.customRequest({
      method: "POST",
      endpoint: `sun_sign_prediction/monthly/${zodiacSign.toLowerCase()}`,
      params: {},
    });

    res.status(200).json({
      success: true,
      zodiacSign: zodiacSign.toLowerCase(),
      horoscope,
    });
  } catch (error) {
    console.error("Monthly horoscope error:", error);
    
    if (error.status === false || error.msg?.includes("not authorized")) {
      return res.status(403).json({
        success: false,
        message: "Monthly horoscope feature is not available in your API subscription plan",
        error: error.msg || error.message,
      });
    }

    res.status(500).json({
      success: false,
      message: "Failed to fetch monthly horoscope",
      error: error.message,
    });
  }
};


const getYearlyHoroscope = async (req, res) => {
  try {
    const { zodiacSign } = req.params;
    
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

    const horoscope = await astro.customRequest({
      method: "POST",
      endpoint: `sun_sign_prediction/yearly/${zodiacSign.toLowerCase()}`,
      params: {},
    });

    res.status(200).json({
      success: true,
      zodiacSign: zodiacSign.toLowerCase(),
      horoscope,
    });
  } catch (error) {
    console.error("Yearly horoscope error:", error);
    
    if (error.status === false || error.msg?.includes("not authorized")) {
      return res.status(403).json({
        success: false,
        message: "Yearly horoscope feature is not available in your API subscription plan",
        error: error.msg || error.message,
      });
    }

    res.status(500).json({
      success: false,
      message: "Failed to fetch yearly horoscope",
      error: error.message,
    });
  }
};

module.exports = {
  getDailyHoroscope,
  getWeeklyHoroscope,
  getMonthlyHoroscope,
  getYearlyHoroscope,
};
