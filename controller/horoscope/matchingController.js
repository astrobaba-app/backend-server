const MatchingProfile = require("../../model/horoscope/matchingProfile");
const axios = require('axios');
const { enhanceAshtakootWithAI } = require("../../services/matchingAiService");

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

const getBirthDataPayload = (name, dob, tob, lat, lon) => {
  return {
    name: name,
    date: formatDate(dob),
    time: formatTime(tob),
    latitude: parseFloat(lat),
    longitude: parseFloat(lon),
    timezone: "Asia/Kolkata",
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

    console.log("Creating kundli matching for user:", req.body);

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
    const maleData = getBirthDataPayload(
      boyName,
      boyDateOfBirth,
      boyTimeOfBirth,
      boyLatitude,
      boyLongitude
    );

    const femaleData = getBirthDataPayload(
      girlName,
      girlDateOfBirth,
      girlTimeOfBirth,
      girlLatitude,
      girlLongitude
    );

    console.log("Fetching matching data from Astro Engine...");

    // Call Astro Engine matching API
    const response = await axios.post(`${ASTRO_ENGINE_BASE_URL}/matching/ashtakoot`, {
      male_data: maleData,
      female_data: femaleData
    });

    const matchingData = response.data;
    const ashtakootData = matchingData.ashtakoot_matching;
    const dashakootData = matchingData.dashakoot_matching;
    const maleMangal = matchingData.male_mangal_dosha;
    const femaleMangal = matchingData.female_mangal_dosha;

    // Optional: compact planet tables from Astro Engine for Planet Details tab
    const malePlanetDetails = matchingData.male_planet_details || [];
    const femalePlanetDetails = matchingData.female_planet_details || [];

    // Optional: Lagna (D1) charts and ascendant info for Lagna Chart tab
    const boyLagnaChart = matchingData.male_lagna_chart || null;
    const girlLagnaChart = matchingData.female_lagna_chart || null;
    const boyAscendant = matchingData.male_ascendant || null;
    const girlAscendant = matchingData.female_ascendant || null;

    // Optionally enhance basic Ashtakoot descriptions with OpenAI so
    // the Basic Details section can show richer 5-6 line narratives.
    try {
      const enhancedKutas = await enhanceAshtakootWithAI({
        ashtakootData,
        boyName,
        girlName,
      });

      if (enhancedKutas && ashtakootData && ashtakootData.kutas) {
        const kutaKeys = [
          "varna",
          "bhakoot",
          "graha_maitri",
          "gana",
          "nadi",
          "vashya",
          "tara",
          "yoni",
        ];

        kutaKeys.forEach((key) => {
          if (ashtakootData.kutas[key] && enhancedKutas[key]?.enhanced_description) {
            ashtakootData.kutas[key].enhanced_description = enhancedKutas[key].enhanced_description;
          }
        });
      }
    } catch (aiError) {
      console.warn("[MatchingAI] Failed to enhance Ashtakoot descriptions:", aiError?.message || aiError);
    }

    // Calculate compatibility score
    let compatibilityScore = null;
    if (ashtakootData?.total_points) {
      compatibilityScore = parseFloat(((ashtakootData.total_points / 36) * 100).toFixed(2));
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

    // Prepare manglik details
    const manglikData = {
      male_manglik: maleMangal?.present || false,
      female_manglik: femaleMangal?.present || false,
      male_manglik_details: maleMangal,
      female_manglik_details: femaleMangal
    };

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

    // Attach non-persisted planet tables so frontend can render them
    const matchingJson = matchingProfile.toJSON();
    matchingJson.boyPlanetDetails = malePlanetDetails;
    matchingJson.girlPlanetDetails = femalePlanetDetails;
    matchingJson.boyLagnaChart = boyLagnaChart;
    matchingJson.girlLagnaChart = girlLagnaChart;
    matchingJson.boyAscendant = boyAscendant;
    matchingJson.girlAscendant = girlAscendant;

    res.status(201).json({
      success: true,
      message: "Kundli matching completed successfully",
      matching: matchingJson,
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
