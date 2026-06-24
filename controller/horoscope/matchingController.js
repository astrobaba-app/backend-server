const MatchingProfile = require("../../model/horoscope/matchingProfile");
const axios = require("axios");
const crypto = require("crypto");
const { enhanceAshtakootWithAI,enhanceManglikWithAI } = require("../../services/matchingAiService");
const {
  queueAstroProductCohortRefresh,
} = require("../../services/astroProductCohortService");

// Astro Engine configuration
const ASTRO_ENGINE_BASE_URL =
  process.env.ASTRO_ENGINE_URL || "http://localhost:8000/api/v1";

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

const buildKutaDescriptionSnapshot = (kutas = {}) => ({
  varna: {
    points: kutas?.varna?.points ?? null,
    max_points: kutas?.varna?.max_points ?? null,
    area_of_life: kutas?.varna?.area_of_life ?? null,
    description: kutas?.varna?.description ?? null,
  },
  vashya: {
    points: kutas?.vashya?.points ?? null,
    max_points: kutas?.vashya?.max_points ?? null,
    area_of_life: kutas?.vashya?.area_of_life ?? null,
    description: kutas?.vashya?.description ?? null,
  },
});

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
    const requestFingerprint = crypto
      .createHash("sha1")
      .update(
        JSON.stringify({
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
        }),
      )
      .digest("hex")
      .slice(0, 12);

    console.log("[KundliMatching][backend][create] Incoming request:", {
      requestFingerprint,
      userId,
      boyName,
      girlName,
      boyDateOfBirth,
      boyTimeOfBirth,
      girlDateOfBirth,
      girlTimeOfBirth,
    });

    // Validate required fields
    const requiredFields = { boyName, boyDateOfBirth, boyTimeOfBirth, boyPlaceOfBirth, boyLatitude, boyLongitude, girlName, girlDateOfBirth, girlTimeOfBirth, girlPlaceOfBirth, girlLatitude, girlLongitude };
    const missingFields = Object.entries(requiredFields).filter(([_, value]) => !value).map(([key]) => key);

    if (missingFields.length > 0) {
      return res.status(400).json({
        success: false,
        message: `Missing required fields: ${missingFields.join(", ")}`,
      });
    }

    // Prepare birth details for both
    const maleData = getBirthDataPayload(boyName, boyDateOfBirth, boyTimeOfBirth, boyLatitude, boyLongitude);
    const femaleData = getBirthDataPayload(girlName, girlDateOfBirth, girlTimeOfBirth, girlLatitude, girlLongitude);

    console.log("[KundliMatching][backend][create] Fetching matching data from Astro Engine...", {
      requestFingerprint,
    });

    // Call Astro Engine matching API
    const response = await axios.post(`${ASTRO_ENGINE_BASE_URL}/matching/ashtakoot`, {
      male_data: maleData,
      female_data: femaleData,
    });

    const matchingData = response.data;
    const ashtakootData = matchingData.ashtakoot_matching;
    const dashakootData = matchingData.dashakoot_matching;
    const maleMangal = matchingData.male_mangal_dosha;
    const femaleMangal = matchingData.female_mangal_dosha;

    // Optional UI Data
    const malePlanetDetails = matchingData.male_planet_details || [];
    const femalePlanetDetails = matchingData.female_planet_details || [];
    const boyLagnaChart = matchingData.male_lagna_chart || null;
    const girlLagnaChart = matchingData.female_lagna_chart || null;
    const boyAscendant = matchingData.male_ascendant || null;
    const girlAscendant = matchingData.female_ascendant || null;

    console.log("[KundliMatching][backend][astro-response] Raw kuta description snapshot:", {
      requestFingerprint,
      total_points: ashtakootData?.total_points ?? null,
      max_points: ashtakootData?.max_points ?? null,
      descriptions: buildKutaDescriptionSnapshot(ashtakootData?.kutas),
    });

    console.log("[KundliMatching][lagna-chart] Astro engine payload summary:", {
      boyName,
      girlName,
      hasBoyLagnaChart: Boolean(boyLagnaChart),
      hasGirlLagnaChart: Boolean(girlLagnaChart),
      boyLagnaChartDivision: boyLagnaChart?.division || null,
      girlLagnaChartDivision: girlLagnaChart?.division || null,
      boyLagnaPlanets: boyLagnaChart?.planets
        ? Object.keys(boyLagnaChart.planets)
        : [],
      girlLagnaPlanets: girlLagnaChart?.planets
        ? Object.keys(girlLagnaChart.planets)
        : [],
      boyAscendant,
      girlAscendant,
    });

    console.log("[MatchingAI] Firing AI enhancements in parallel...", {
      requestFingerprint,
    });

    // 🚀 FIRE BOTH AI CALLS IN PARALLEL
    const ashtakootPromise = enhanceAshtakootWithAI({ ashtakootData, boyName, girlName }).catch(err => {
      console.warn("[MatchingAI] Failed Ashtakoot:", err?.message || err);
      return null;
    });

    const manglikPromise = enhanceManglikWithAI({ maleMangal, femaleMangal, boyName, girlName }).catch(err => {
      console.warn("[MatchingAI] Failed Manglik:", err?.message || err);
      return null;
    });

    // Wait for both to finish at the exact same time
    const [enhancedKutas, enhancedManglik] = await Promise.all([ashtakootPromise, manglikPromise]);

    // --- Process Ashtakoot AI Result ---
    let aiConclusion = null;
    if (enhancedKutas && ashtakootData && ashtakootData.kutas) {
      const kutaKeys = ["varna", "bhakoot", "graha_maitri", "gana", "nadi", "vashya", "tara", "yoni"];
      kutaKeys.forEach((key) => {
        if (ashtakootData.kutas[key] && enhancedKutas[key]) {
          ashtakootData.kutas[key].area_of_life = enhancedKutas[key].area_of_life || "";
          ashtakootData.kutas[key].description = enhancedKutas[key].description || "";
          ashtakootData.kutas[key].meaning = enhancedKutas[key].meaning || "";
        }
      });
      if (enhancedKutas.conclusion) {
        aiConclusion = enhancedKutas.conclusion;
      }
    }

    console.log("[KundliMatching][backend][ai-enhanced] Final kuta description snapshot:", {
      requestFingerprint,
      descriptions: buildKutaDescriptionSnapshot(ashtakootData?.kutas),
      conclusionPreview: aiConclusion
        ? aiConclusion.slice(0, 200)
        : null,
    });

    // --- Process Manglik AI Result ---
    if (enhancedManglik) {
      if (maleMangal) {
        maleMangal.ui_aspects = enhancedManglik.male.aspects_text;
        maleMangal.ui_house = enhancedManglik.male.house_text;
        maleMangal.ui_analysis = enhancedManglik.male.analysis_text;
      }
      if (femaleMangal) {
        femaleMangal.ui_aspects = enhancedManglik.female.aspects_text;
        femaleMangal.ui_house = enhancedManglik.female.house_text;
        femaleMangal.ui_analysis = enhancedManglik.female.analysis_text;
      }
    }

    // Calculate compatibility score fallback
    let compatibilityScore = null;
    if (ashtakootData?.total_points) {
      compatibilityScore = parseFloat(((ashtakootData.total_points / 36) * 100).toFixed(2));
    }

    // Generate conclusion (AI wins, falls back to raw math)
    let conclusion = "Compatibility analysis unavailable";
    if (aiConclusion) {
      conclusion = aiConclusion;
    } else if (compatibilityScore !== null) {
      if (compatibilityScore >= 70) conclusion = "Excellent match! Very compatible for marriage.";
      else if (compatibilityScore >= 50) conclusion = "Good match! Compatible with some areas to work on.";
      else if (compatibilityScore >= 30) conclusion = "Average match. Requires understanding and adjustment.";
      else conclusion = "Below average match. Careful consideration recommended.";
    }

    // Prepare manglik details (Now fully enhanced with AI text)
    const manglikData = {
      male_manglik: maleMangal?.present || false,
      female_manglik: femaleMangal?.present || false,
      male_manglik_details: maleMangal,
      female_manglik_details: femaleMangal,
    };

    // Save to Database
    const matchingProfile = await MatchingProfile.create({
      userId,
      boyName, boyDateOfBirth, boyTimeOfBirth, boyPlaceOfBirth, boyLatitude, boyLongitude,
      girlName, girlDateOfBirth, girlTimeOfBirth, girlPlaceOfBirth, girlLatitude, girlLongitude,
      compatibilityScore,
      ashtakootDetails: ashtakootData,
      dashakootDetails: dashakootData,
      manglikDetails: manglikData,
      boyPlanetDetails: malePlanetDetails,
      girlPlanetDetails: femalePlanetDetails,
      boyLagnaChart,
      girlLagnaChart,
      boyAscendant,
      girlAscendant,
      conclusion,
    });
    queueAstroProductCohortRefresh(userId, "matching_created");

    // Attach non-persisted details for UI rendering
    const matchingJson = matchingProfile.toJSON();
    matchingJson.boyPlanetDetails = malePlanetDetails;
    matchingJson.girlPlanetDetails = femalePlanetDetails;
    matchingJson.boyLagnaChart = boyLagnaChart;
    matchingJson.girlLagnaChart = girlLagnaChart;
    matchingJson.boyAscendant = boyAscendant;
    matchingJson.girlAscendant = girlAscendant;

    console.log("[KundliMatching][backend][saved] Matching profile persisted:", {
      requestFingerprint,
      matchingId: matchingJson.id,
      descriptions: buildKutaDescriptionSnapshot(
        matchingJson?.ashtakootDetails?.kutas,
      ),
    });

  //  console.log("Kundli matching " + JSON.stringify(matchingJson));


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

    await matching.increment("viewCount", { by: 1 });
    await matching.update({ lastViewedAt: new Date() });
    queueAstroProductCohortRefresh(userId, "matching_viewed");

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
