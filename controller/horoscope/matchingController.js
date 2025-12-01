const MatchingProfile = require("../../model/horoscope/matchingProfile");
const astro = require("../../config/astroapi/astro");


const getBirthDetailsPayload = (dob, tob, lat, lon) => {
  const [hour, minute] = tob.split(":");
  const date = new Date(dob);
  
  return {
    day: date.getDate(),
    month: date.getMonth() + 1,
    year: date.getFullYear(),
    hour: parseInt(hour),
    min: parseInt(minute),
    lat: parseFloat(lat),
    lon: parseFloat(lon),
    tzone: 5.5,
  };
};


const createMatching = async (req, res) => {
  try {
    const userId = req.user.id;
    const {
      boyName,
      boyDateOfBirth,
      boyTimeOfBirth,
      boyPlaceOfBirth,
      boyLatitude,
      boyLongitude,
      girlName,
      girlDateOfBirth,
      girlTimeOfBirth,
      girlPlaceOfBirth,
      girlLatitude,
      girlLongitude,
    } = req.body;

    // Validate required fields
    const requiredFields = {
      boyName, boyDateOfBirth, boyTimeOfBirth, boyPlaceOfBirth, boyLatitude, boyLongitude,
      girlName, girlDateOfBirth, girlTimeOfBirth, girlPlaceOfBirth, girlLatitude, girlLongitude,
    };

    const missingFields = Object.entries(requiredFields)
      .filter(([key, value]) => !value)
      .map(([key]) => key);

    if (missingFields.length > 0) {
      return res.status(400).json({
        success: false,
        message: `Missing required fields: ${missingFields.join(", ")}`,
      });
    }

    // Prepare birth details for both
    const boyDetails = getBirthDetailsPayload(
      boyDateOfBirth,
      boyTimeOfBirth,
      boyLatitude,
      boyLongitude
    );

    const girlDetails = getBirthDetailsPayload(
      girlDateOfBirth,
      girlTimeOfBirth,
      girlLatitude,
      girlLongitude
    );

    console.log("Fetching matching data from AstroAPI...");

    // Call matching APIs
    const [ashtakootMatch, dashakootMatch, manglikMatch] = await Promise.allSettled([
      astro.customRequest({
        method: "POST",
        endpoint: "match_ashtakoot_points",
        params: {
          m_day: boyDetails.day,
          m_month: boyDetails.month,
          m_year: boyDetails.year,
          m_hour: boyDetails.hour,
          m_min: boyDetails.min,
          m_lat: boyDetails.lat,
          m_lon: boyDetails.lon,
          m_tzone: boyDetails.tzone,
          f_day: girlDetails.day,
          f_month: girlDetails.month,
          f_year: girlDetails.year,
          f_hour: girlDetails.hour,
          f_min: girlDetails.min,
          f_lat: girlDetails.lat,
          f_lon: girlDetails.lon,
          f_tzone: girlDetails.tzone,
        },
      }),
      astro.customRequest({
        method: "POST",
        endpoint: "match_dashakoot_points",
        params: {
          m_day: boyDetails.day,
          m_month: boyDetails.month,
          m_year: boyDetails.year,
          m_hour: boyDetails.hour,
          m_min: boyDetails.min,
          m_lat: boyDetails.lat,
          m_lon: boyDetails.lon,
          m_tzone: boyDetails.tzone,
          f_day: girlDetails.day,
          f_month: girlDetails.month,
          f_year: girlDetails.year,
          f_hour: girlDetails.hour,
          f_min: girlDetails.min,
          f_lat: girlDetails.lat,
          f_lon: girlDetails.lon,
          f_tzone: girlDetails.tzone,
        },
      }),
      astro.customRequest({
        method: "POST",
        endpoint: "match_manglik_report",
        params: {
          m_day: boyDetails.day,
          m_month: boyDetails.month,
          m_year: boyDetails.year,
          m_hour: boyDetails.hour,
          m_min: boyDetails.min,
          m_lat: boyDetails.lat,
          m_lon: boyDetails.lon,
          m_tzone: boyDetails.tzone,
          f_day: girlDetails.day,
          f_month: girlDetails.month,
          f_year: girlDetails.year,
          f_hour: girlDetails.hour,
          f_min: girlDetails.min,
          f_lat: girlDetails.lat,
          f_lon: girlDetails.lon,
          f_tzone: girlDetails.tzone,
        },
      }),
    ]);

    // Extract values
    const extractValue = (result, name) => {
      if (result.status === "fulfilled") {
        return result.value;
      } else {
        console.error(`${name} failed:`, result.reason?.message || result.reason);
        return null;
      }
    };

    const ashtakootData = extractValue(ashtakootMatch, "Ashtakoot Match");
    const dashakootData = extractValue(dashakootMatch, "Dashakoot Match");
    const manglikData = extractValue(manglikMatch, "Manglik Match");

    // Calculate compatibility score
    let compatibilityScore = null;
    if (ashtakootData?.total) {
      compatibilityScore = parseFloat(((ashtakootData.total / 36) * 100).toFixed(2));
    }

    // Generate conclusion
    let conclusion = "Compatibility analysis unavailable";
    if (compatibilityScore !== null) {
      if (compatibilityScore >= 70) {
        conclusion = "Excellent match! Very compatible for marriage.";
      } else if (compatibilityScore >= 50) {
        conclusion = "Good match! Compatible with some areas to work on.";
      } else if (compatibilityScore >= 30) {
        conclusion = "Average match. Requires understanding and adjustment.";
      } else {
        conclusion = "Below average match. Careful consideration recommended.";
      }
    }

    // Create matching profile
    const matchingProfile = await MatchingProfile.create({
      userId,
      boyName,
      boyDateOfBirth,
      boyTimeOfBirth,
      boyPlaceOfBirth,
      boyLatitude,
      boyLongitude,
      girlName,
      girlDateOfBirth,
      girlTimeOfBirth,
      girlPlaceOfBirth,
      girlLatitude,
      girlLongitude,
      compatibilityScore,
      ashtakootDetails: ashtakootData,
      dashakootDetails: dashakootData,
      manglikDetails: manglikData,
      conclusion,
    });

    res.status(201).json({
      success: true,
      message: "Kundli matching completed successfully",
      matching: matchingProfile,
    });
  } catch (error) {
    console.error("Kundli matching error:", error);
    res.status(500).json({
      success: false,
      message: "Failed to create kundli matching",
      error: error.message,
    });
  }
};


const getAllMatchings = async (req, res) => {
  try {
    const userId = req.user.id;

    const matchings = await MatchingProfile.findAll({
      where: { userId },
      attributes: [
        "id",
        "boyName",
        "girlName",
        "compatibilityScore",
        "conclusion",
        "createdAt",
      ],
      order: [["createdAt", "DESC"]],
    });

    res.status(200).json({
      success: true,
      count: matchings.length,
      matchings,
    });
  } catch (error) {
    console.error("Get all matchings error:", error);
    res.status(500).json({
      success: false,
      message: "Failed to fetch matchings",
      error: error.message,
    });
  }
};


const getMatchingById = async (req, res) => {
  try {
    const userId = req.user.id;
    const { matchingId } = req.params;

    const matching = await MatchingProfile.findOne({
      where: { id: matchingId, userId },
    });

    if (!matching) {
      return res.status(404).json({
        success: false,
        message: "Matching profile not found",
      });
    }

    res.status(200).json({
      success: true,
      matching,
    });
  } catch (error) {
    console.error("Get matching by ID error:", error);
    res.status(500).json({
      success: false,
      message: "Failed to fetch matching",
      error: error.message,
    });
  }
};


const deleteMatching = async (req, res) => {
  try {
    const userId = req.user.id;
    const { matchingId } = req.params;

    const matching = await MatchingProfile.findOne({
      where: { id: matchingId, userId },
    });

    if (!matching) {
      return res.status(404).json({
        success: false,
        message: "Matching profile not found",
      });
    }

    await matching.destroy();

    res.status(200).json({
      success: true,
      message: "Matching profile deleted successfully",
    });
  } catch (error) {
    console.error("Delete matching error:", error);
    res.status(500).json({
      success: false,
      message: "Failed to delete matching",
      error: error.message,
    });
  }
};

module.exports = {
  createMatching,
  getAllMatchings,
  getMatchingById,
  deleteMatching,
};
