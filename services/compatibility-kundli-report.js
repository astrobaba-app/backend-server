const axios = require("axios");
const { createChatCompletion } = require("./openaiClient");
const { getAllCharts } = require("./astroEngineService");

const ASTRO_ENGINE_BASE_URL = process.env.ASTRO_ENGINE_URL || "http://localhost:8000/api/v1";
const CHAT_MODEL = process.env.OPENAI_CHAT_MODEL || "gpt-4o";

/**
 * Helper to clean Markdown wrappers from JSON
 */
function cleanJsonResponse(raw) {
  if (!raw) return "";
  let clean = raw.trim();
  if (clean.startsWith("```json")) {
    clean = clean.substring(7);
  } else if (clean.startsWith("```")) {
    clean = clean.substring(3);
  }
  if (clean.endsWith("```")) {
    clean = clean.substring(0, clean.length - 3);
  }
  return clean.trim();
}

/**
 * Format Date to YYYY-MM-DD
 */
function formatDate(dateString) {
  if (!dateString) return "";
  const date = new Date(dateString);
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const day = String(date.getDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
}

/**
 * Format Time to HH:MM:SS
 */
function formatTime(timeString) {
  if (!timeString) return "00:00:00";
  const [hour, minute] = timeString.split(":");
  return `${String(hour).padStart(2, "0")}:${String(minute).padStart(2, "0")}:00`;
}

/**
 * Build Birth Data Payload for Astro Engine
 */
function getBirthDataPayload(name, dob, tob, lat, lon) {
  return {
    name: name || "User",
    date: formatDate(dob),
    time: formatTime(tob),
    latitude: parseFloat(lat),
    longitude: parseFloat(lon),
    timezone: "Asia/Kolkata",
  };
}

/**
 * Generate Compatibility Report Content using LLM in parallel batches
 */
async function generateCompatibilityReportContent(payload, userId) {
  const systemPrompt = "You are a master relationship Vedic astrologer. Return strict JSON compatibility report objects with highly descriptive sections. Ground everything in planetary placements. No emojis. Do not wrap response in markdown code blocks. Follow word count rules exactly.";

  const batch1Prompt = `
Generate Part 1 (Welcome & Blueprint) of a premium Compatibility Report for Boy (${payload.boyName}) and Girl (${payload.girlName}).
Input Data:
- Boy Moon Sign: ${payload.boyMoonSign}, Nakshatra: ${payload.boyNakshatra}, Ascendant: ${payload.boyAscendant}
- Girl Moon Sign: ${payload.girlMoonSign}, Nakshatra: ${payload.girlNakshatra}, Ascendant: ${payload.girlAscendant}
- Total Guna Score: ${payload.totalGunas}/36 (${payload.compatibilityPercent}%)
- Verdict: ${payload.verdict}

Return a JSON object matching this structure:
{
  "introduction": "An emotional preparation chapter (1200-1600 words, 40-55 sentences). Personal welcome, Destiny vs Free Will explanation, and why compatibility extends beyond a numerical score. Explain why sages created Kundli matching, how planetary energies affect long-term union. Cover subtopics: Welcome, Purpose of this Report, Why Kundli Matching Exists, How Astrology Works, 36 Gunas Explained, Importance of Individual Charts, How to Read this Report, Journey Ahead.",
  "compatibilityBlueprint": "Summary of harmony (700-900 words, 25-35 sentences). Detail what Guna score represents compared to ideal range, strongest/weakest areas, koota strength meters."
}
`;

  const batch2Prompt = `
Generate Part 2 (Kootas Part A) of a premium Compatibility Report for Boy (${payload.boyName}) and Girl (${payload.girlName}).
Input Data:
- Ashtakoot matching details:
  * Nadi: ${payload.ashtakootResults.nadi.score}/8 (Boy value: ${payload.ashtakootResults.nadi.boyValue}, Girl value: ${payload.ashtakootResults.nadi.girlValue}, Compatible: ${payload.ashtakootResults.nadi.isCompatible})
  * Bhakoot: ${payload.ashtakootResults.bhakoot.score}/7 (Boy value: ${payload.ashtakootResults.bhakoot.boyValue}, Girl value: ${payload.ashtakootResults.bhakoot.girlValue}, Compatible: ${payload.ashtakootResults.bhakoot.isCompatible})
  * Gana: ${payload.ashtakootResults.gana.score}/6 (Boy value: ${payload.ashtakootResults.gana.boyValue}, Girl value: ${payload.ashtakootResults.gana.girlValue}, Compatible: ${payload.ashtakootResults.gana.isCompatible})
  * Graha Maitri: ${payload.ashtakootResults.grahaMaitri.score}/5 (Boy value: ${payload.ashtakootResults.grahaMaitri.boyValue}, Girl value: ${payload.ashtakootResults.grahaMaitri.girlValue}, Compatible: ${payload.ashtakootResults.grahaMaitri.isCompatible})

For Nadi, Bhakoot, Gana, and Graha Maitri, you must construct a detailed chapter answering relationship questions. Each Koota analysis must contain:
  1. meaning: Educational explanation of what the Koota measures (220-300 words).
  2. score: Explanation of the score achieved (180-250 words).
  3. practical: Practical everyday translation in married life (300-400 words).
  4. strengths: Areas of natural alignment (220-300 words).
  5. challenges: Realistic difficulties and friction points (220-300 words).
  6. psychological: Triggers, attachment styles, coping, and emotional security (220-300 words).
  7. examples: Realistic, detailed daily conflict scenarios (250-350 words).
  8. guidance: Practical relationship roadmap and shared routines (300-400 words).
  9. remedies: Traditional Vedic remedies, symbolism, and inner growth connection (180-250 words).
  10. summary: Synthesis of this Koota's impact and transition (150-220 words).

Return a JSON object matching this structure:
{
  "nadiAnalysis": { "meaning": "...", "score": "...", "practical": "...", "strengths": "...", "challenges": "...", "psychological": "...", "examples": "...", "guidance": "...", "remedies": "...", "summary": "..." },
  "bhakootAnalysis": { "meaning": "...", "score": "...", "practical": "...", "strengths": "...", "challenges": "...", "psychological": "...", "examples": "...", "guidance": "...", "remedies": "...", "summary": "..." },
  "ganaAnalysis": { "meaning": "...", "score": "...", "practical": "...", "strengths": "...", "challenges": "...", "psychological": "...", "examples": "...", "guidance": "...", "remedies": "...", "summary": "..." },
  "grahaMaitriAnalysis": { "meaning": "...", "score": "...", "practical": "...", "strengths": "...", "challenges": "...", "psychological": "...", "examples": "...", "guidance": "...", "remedies": "...", "summary": "..." }
}
`;

  const batch3Prompt = `
Generate Part 3 (Kootas Part B) of a premium Compatibility Report for Boy (${payload.boyName}) and Girl (${payload.girlName}).
Input Data:
- Ashtakoot matching details:
  * Yoni: ${payload.ashtakootResults.yoni.score}/4 (Boy value: ${payload.ashtakootResults.yoni.boyValue}, Girl value: ${payload.ashtakootResults.yoni.girlValue}, Compatible: ${payload.ashtakootResults.yoni.isCompatible})
  * Tara: ${payload.ashtakootResults.tara.score}/3 (Boy value: ${payload.ashtakootResults.tara.boyValue}, Girl value: ${payload.ashtakootResults.tara.girlValue}, Compatible: ${payload.ashtakootResults.tara.isCompatible})
  * Vashya: ${payload.ashtakootResults.vashya.score}/2 (Boy value: ${payload.ashtakootResults.vashya.boyValue}, Girl value: ${payload.ashtakootResults.vashya.girlValue}, Compatible: ${payload.ashtakootResults.vashya.isCompatible})
  * Varna: ${payload.ashtakootResults.varna.score}/1 (Boy value: ${payload.ashtakootResults.varna.boyValue}, Girl value: ${payload.ashtakootResults.varna.girlValue}, Compatible: ${payload.ashtakootResults.varna.isCompatible})

For Yoni, Tara, Vashya, and Varna, you must construct a detailed chapter answering relationship questions. Each Koota analysis must contain:
  1. meaning: Educational explanation of what the Koota measures (220-300 words).
  2. score: Explanation of the score achieved (180-250 words).
  3. practical: Practical everyday translation in married life (300-400 words).
  4. strengths: Areas of natural alignment (220-300 words).
  5. challenges: Realistic difficulties and friction points (220-300 words).
  6. psychological: Triggers, attachment styles, coping, and emotional security (220-300 words).
  7. examples: Realistic, detailed daily conflict scenarios (250-350 words).
  8. guidance: Practical relationship roadmap and shared routines (300-400 words).
  9. remedies: Traditional Vedic remedies, symbolism, and inner growth connection (180-250 words).
  10. summary: Synthesis of this Koota's impact and transition (150-220 words).

Return a JSON object matching this structure:
{
  "yoniAnalysis": { "meaning": "...", "score": "...", "practical": "...", "strengths": "...", "challenges": "...", "psychological": "...", "examples": "...", "guidance": "...", "remedies": "...", "summary": "..." },
  "taraAnalysis": { "meaning": "...", "score": "...", "practical": "...", "strengths": "...", "challenges": "...", "psychological": "...", "examples": "...", "guidance": "...", "remedies": "...", "summary": "..." },
  "vashyaAnalysis": { "meaning": "...", "score": "...", "practical": "...", "strengths": "...", "challenges": "...", "psychological": "...", "examples": "...", "guidance": "...", "remedies": "...", "summary": "..." },
  "varnaAnalysis": { "meaning": "...", "score": "...", "practical": "...", "strengths": "...", "challenges": "...", "psychological": "...", "examples": "...", "guidance": "...", "remedies": "...", "summary": "..." }
}
`;

  const batch4Prompt = `
Generate Part 4 (Relationship Dynamics) of a premium Compatibility Report for Boy (${payload.boyName}) and Girl (${payload.girlName}).
Input Data:
- Boy Moon Sign: ${payload.boyMoonSign}, Nakshatra: ${payload.boyNakshatra}, Ascendant: ${payload.boyAscendant}, Venus Sign: ${payload.boyVenusSign}
- Girl Moon Sign: ${payload.girlMoonSign}, Nakshatra: ${payload.girlNakshatra}, Ascendant: ${payload.girlAscendant}, Venus Sign: ${payload.girlVenusSign}

Return a JSON object matching this structure:
{
  "emotionalCompatibility": "Emotional Needs & Attachment Analysis (1200-1600 words, 35-45 sentences). Deep analysis of emotional security, safety triggers, attachment styles, and moon sign placements for both partners.",
  "communicationCompatibility": "Communication Compatibility (1000-1400 words, 30-40 sentences). Deep analysis of conflict styles, Mercury placements, listening patterns, misunderstandings, and constructive habits.",
  "loveLanguages": "Affection Expression & Vedic Love Languages (800-1000 words, 25-30 sentences). How Venus and 5th house influences show how each partner gives and receives affection.",
  "redGreenFlags": "Balanced flags overview (800-1000 words, 25-30 sentences). Comprehensive green flags (strengths) and red/amber flags (caution zones).",
  "compatibilityHeatmapText": "Heatmap description (400-600 words, 10-15 sentences). Synthesized matrix summary of harmony across emotional, mental, spiritual, and physical dimensions."
}
`;

  const batch5Prompt = `
Generate Part 5 (Timeline & Joint Life) of a premium Compatibility Report for Boy (${payload.boyName}) and Girl (${payload.girlName}).
Input Data:
- Boy Moon Sign: ${payload.boyMoonSign}, Nakshatra: ${payload.boyNakshatra}, Ascendant: ${payload.boyAscendant}, Mars Sign: ${payload.boyMarsSign}, 7th Lord: ${payload.boy7thLord}
- Girl Moon Sign: ${payload.girlMoonSign}, Nakshatra: ${payload.girlNakshatra}, Ascendant: ${payload.girlAscendant}, Mars Sign: ${payload.girlMarsSign}, 7th Lord: ${payload.girl7thLord}

Return a JSON object matching this structure:
{
  "marriedLifeTimeline": "Married Life Timeline - First 10 Years Forecast (1500-2000 words, 45-60 sentences). Vedic lifelines and dasha timing cycles mapping key relationship phases, adjustment windows, and growth cycles.",
  "financialCompatibility": "Financial Compatibility (900-1200 words, 25-35 sentences). Spending habits, savings approaches, wealth-building alignment, and values based on 2nd/11th houses.",
  "familyInLawDynamics": "Family & In-Law Dynamics (900-1200 words, 25-35 sentences). Extended family boundaries, household roles, and family expectations governed by 4th and 10th houses.",
  "parentingCompatibility": "Parenting Compatibility (900-1200 words, 25-35 sentences). Core values, nurturing approaches, discipline styles, and family building based on 5th houses.",
  "conflictResolution": "Conflict Resolution Blueprint (900-1200 words, 25-35 sentences). Prediction of recurring disagreements and strategies for resolving them astrologically.",
  "growthPlan": "Relationship Roadmap & Daily bonding exercises (800-1000 words, 25-30 sentences). Structured bonding guidelines and habits for the couple."
}
`;

  const batch6Prompt = `
Generate Part 6 (FAQs & Final Verdict) of a premium Compatibility Report for Boy (${payload.boyName}) and Girl (${payload.girlName}).
Input Data:
- Boy Moon Sign: ${payload.boyMoonSign}, Nakshatra: ${payload.boyNakshatra}, Ascendant: ${payload.boyAscendant}
- Girl Moon Sign: ${payload.girlMoonSign}, Nakshatra: ${payload.girlNakshatra}, Ascendant: ${payload.girlAscendant}
- Total Guna Score: ${payload.totalGunas}/36 (${payload.compatibilityPercent}%)
- Verdict: ${payload.verdict}

Return a JSON object matching this structure:
{
  "faqAnswers": {
    "marriageCompatibility": "Highly personalized, specific answer based on their charts (2-3 sentences).",
    "relationshipStrengths": "Highly personalized, specific answer based on their charts (2-3 sentences).",
    "areasForEffort": "Highly personalized, specific answer based on their charts (2-3 sentences).",
    "emotionalMentalCompatibility": "Highly personalized, specific answer based on their charts (2-3 sentences).",
    "communicationConflictStyles": "Highly personalized, specific answer based on their charts (2-3 sentences).",
    "relationshipStability": "Highly personalized, specific answer based on their charts (2-3 sentences).",
    "financialCompatibility": "Highly personalized, specific answer based on their charts (2-3 sentences).",
    "physicalAttractionIntimacy": "Highly personalized, specific answer based on their charts (2-3 sentences).",
    "familyParentingDynamics": "Highly personalized, specific answer based on their charts (2-3 sentences).",
    "gunaMilanFactors": "Highly personalized, specific answer based on their charts (2-3 sentences).",
    "remediesLifestyleChanges": "Highly personalized, specific answer based on their charts (2-3 sentences).",
    "finalVerdictAdvice": "Highly personalized, specific answer based on their charts (2-3 sentences)."
  },
  "finalVerdict": "Synthesis chapter (1500-2200 words, 45-60 sentences). Comprehensive verdict. Deeply evaluate overall emotional bond, mental harmony, trust, marriage stability, family happiness, chemistry, and spiritual growth. Address challenges and list major sustaining strengths."
}

INSTRUCTIONS FOR FAQANSWERS:
- In 'faqAnswers', generate highly personalized and specific answers to each of the 12 Compatibility FAQ questions. Do NOT use generic sentences. Use both partner's birth details, Moon signs, ascendants, venus signs, mars signs, active dashas, and guna scores to provide clear, astrologically-justified explanations for *why* these answers apply specifically to their relationship.
- Answer each question with a concise, personalized paragraph of 2-3 sentences (around 30-40 words).
`;

  console.log(`[CompatibilityReportService] Triggering 6 OpenAI calls in parallel...`);
  
  let totalInputChars = 0;
  let totalOutputChars = 0;

  const callBatch = async (promptText, batchId) => {
    totalInputChars += promptText.length;
    try {
      console.log(`[CompatibilityReportService] Starting Batch ${batchId} (input chars: ${promptText.length})...`);
      const result = await createChatCompletion(
        {
          model: CHAT_MODEL,
          messages: [
            { role: "system", content: systemPrompt },
            { role: "user", content: promptText }
          ],
          temperature: 0.75,
          response_format: { type: "json_object" }
        },
        { feature: `compatibility_report_generation_batch_${batchId}`, userId }
      );
      
      const content = result?.choices?.[0]?.message?.content?.trim();
      if (!content) {
        throw new Error(`Batch ${batchId} returned empty response`);
      }
      
      totalOutputChars += content.length;
      const cleaned = cleanJsonResponse(content);
      const parsed = JSON.parse(cleaned);
      console.log(`[CompatibilityReportService] Successfully completed and parsed Batch ${batchId} (output chars: ${content.length})`);
      return parsed;
    } catch (error) {
      console.error(`[CompatibilityReportService] Error in Batch ${batchId}:`, error.message);
      throw error;
    }
  };

  const results = await Promise.all([
    callBatch(batch1Prompt, 1),
    callBatch(batch2Prompt, 2),
    callBatch(batch3Prompt, 3),
    callBatch(batch4Prompt, 4),
    callBatch(batch5Prompt, 5),
    callBatch(batch6Prompt, 6)
  ]);

  console.log("[CompatibilityReportService] Parallel Batch Completion Summary:");
  console.log(`- Total Input Characters (all prompts): ${totalInputChars}`);
  console.log(`- Total Output Characters (all responses): ${totalOutputChars}`);

  // Merge all JSON objects into a single result object
  const mergedReportData = Object.assign({}, ...results);
  return mergedReportData;
}

/**
 * Core function to gather data and generate report
 */
async function generateCompatibilityReport(payload, userRequest) {
  // Gathers data from Astro Engine
  const maleData = getBirthDataPayload(
    payload.boy.fullName,
    payload.boy.dateOfbirth,
    payload.boy.timeOfbirth,
    payload.boy.latitude,
    payload.boy.longitude
  );

  const femaleData = getBirthDataPayload(
    payload.girl.fullName,
    payload.girl.dateOfbirth,
    payload.girl.timeOfbirth,
    payload.girl.latitude,
    payload.girl.longitude
  );

  console.log("[CompatibilityReportService] Fetching Ashtakoot matching details from Astro Engine...");
  const response = await axios.post(`${ASTRO_ENGINE_BASE_URL}/matching/ashtakoot`, {
    male_data: maleData,
    female_data: femaleData
  });

  const matchingData = response.data;
  const ashtakootData = matchingData.ashtakoot_matching;
  const dashakootData = matchingData.dashakoot_matching;
  const maleMangal = matchingData.male_mangal_dosha;
  const femaleMangal = matchingData.female_mangal_dosha;
  const malePlanetDetails = matchingData.male_planet_details || [];
  const femalePlanetDetails = matchingData.female_planet_details || [];
  const boyLagnaChart = matchingData.male_lagna_chart || null;
  const girlLagnaChart = matchingData.female_lagna_chart || null;
  const boyAscendant = matchingData.male_ascendant || null;
  const girlAscendant = matchingData.female_ascendant || null;

  console.log("[CompatibilityReportService] Fetching divisional D9 charts...");
  const [boyAllCharts, girlAllCharts] = await Promise.all([
    getAllCharts({
      fullName: payload.boy.fullName,
      dateOfbirth: payload.boy.dateOfbirth,
      timeOfbirth: payload.boy.timeOfbirth,
      placeOfBirth: payload.boy.placeOfBirth,
      latitude: payload.boy.latitude,
      longitude: payload.boy.longitude,
      gender: "Male"
    }).catch((err) => {
      console.warn("Boy getAllCharts failed:", err.message);
      return null;
    }),
    getAllCharts({
      fullName: payload.girl.fullName,
      dateOfbirth: payload.girl.dateOfbirth,
      timeOfbirth: payload.girl.timeOfbirth,
      placeOfBirth: payload.girl.placeOfBirth,
      latitude: payload.girl.latitude,
      longitude: payload.girl.longitude,
      gender: "Female"
    }).catch((err) => {
      console.warn("Girl getAllCharts failed:", err.message);
      return null;
    })
  ]);

  const boyD9Chart = boyAllCharts?.D9 || boyAllCharts?.navamsa || null;
  const girlD9Chart = girlAllCharts?.D9 || girlAllCharts?.navamsa || null;

  console.log("[CompatibilityReportService] CHART VERIFICATION:");
  console.log(`- Input: Boy Lagna present: ${!!boyLagnaChart} (Keys: ${boyLagnaChart ? Object.keys(boyLagnaChart) : "none"})`);
  console.log(`- Input: Girl Lagna present: ${!!girlLagnaChart} (Keys: ${girlLagnaChart ? Object.keys(girlLagnaChart) : "none"})`);
  console.log(`- Input: Boy AllCharts keys: ${boyAllCharts ? Object.keys(boyAllCharts) : "none"}`);
  console.log(`- Input: Girl AllCharts keys: ${girlAllCharts ? Object.keys(girlAllCharts) : "none"}`);
  console.log(`- Output: Boy Lagna Chart: ${!!boyLagnaChart}`);
  console.log(`- Output: Girl Lagna Chart: ${!!girlLagnaChart}`);
  console.log(`- Output: Boy D9 Navamsa Chart: ${!!boyD9Chart}`);
  console.log(`- Output: Girl D9 Navamsa Chart: ${!!girlD9Chart}`);

  // Build Ashtakoot mapping for LLM payload
  const kutasKeys = {
    nadi: "nadi",
    bhakoot: "bhakoot",
    gana: "gana",
    grahaMaitri: "graha_maitri",
    yoni: "yoni",
    tara: "tara",
    vashya: "vashya",
    varna: "varna"
  };

  const ashtakootResults = {};
  Object.entries(kutasKeys).forEach(([key, apiKey]) => {
    const kuta = ashtakootData?.kutas?.[apiKey] || {};
    ashtakootResults[key] = {
      boyValue: kuta.male_koot_attribute || "Unknown",
      girlValue: kuta.female_koot_attribute || "Unknown",
      score: kuta.points ?? 0,
      maxScore: kuta.max_points ?? 0,
      isCompatible: (kuta.points ?? 0) > 0
    };
  });

  const totalGunas = ashtakootData?.total_points ?? 0;
  const compatibilityPercent = parseFloat(((totalGunas / 36) * 100).toFixed(2));
  
  let verdict = "Average Match";
  if (compatibilityPercent >= 70) verdict = "Excellent Match";
  else if (compatibilityPercent >= 50) verdict = "Good Match";
  else if (compatibilityPercent >= 30) verdict = "Average Match";
  else verdict = "Below Average Match";

  // Find planetary sign details for LLM
  const getPlanetSign = (planets, name) => {
    const p = planets.find(pl => pl.planet === name);
    return p ? p.sign : "Unknown";
  };

  const getPlanetLord = (planets, name) => {
    const p = planets.find(pl => pl.planet === name);
    return p ? p.lord || "Unknown" : "Unknown";
  };

  const boyVenusSign = getPlanetSign(malePlanetDetails, "Venus");
  const girlVenusSign = getPlanetSign(femalePlanetDetails, "Venus");
  const boyMarsSign = getPlanetSign(malePlanetDetails, "Mars");
  const girlMarsSign = getPlanetSign(femalePlanetDetails, "Mars");
  const boyJupiterSign = getPlanetSign(malePlanetDetails, "Jupiter");
  const girlJupiterSign = getPlanetSign(femalePlanetDetails, "Jupiter");

  // Get 7th lord and sign details from charts if available
  const boy7thLord = getPlanetLord(malePlanetDetails, "Saturn"); // Fallback check or dynamic
  const girl7thLord = getPlanetLord(femalePlanetDetails, "Mars");

  const llmPayload = {
    boyName: payload.boy.fullName,
    girlName: payload.girl.fullName,
    boyDob: payload.boy.dateOfbirth,
    girlDob: payload.girl.dateOfbirth,
    boyNakshatra: boyAscendant?.nakshatra || "Unknown",
    girlNakshatra: girlAscendant?.nakshatra || "Unknown",
    boyMoonSign: boyAscendant?.rashi || "Unknown",
    girlMoonSign: girlAscendant?.rashi || "Unknown",
    boyAscendant: boyAscendant?.ascendant || "Unknown",
    girlAscendant: girlAscendant?.ascendant || "Unknown",
    boyManglik: maleMangal?.present || false,
    girlManglik: femaleMangal?.present || false,
    ashtakootResults,
    totalGunas,
    compatibilityPercent,
    verdict,
    boyVenusSign,
    girlVenusSign,
    boyMarsSign,
    girlMarsSign,
    boyJupiterSign,
    girlJupiterSign,
    boy7thLord,
    boy7thHouseLord: boy7thLord,
    girl7thHouseLord: girl7thLord,
    boy7thHouseSign: "Unknown",
    girl7thHouseSign: "Unknown"
  };

  console.log("[CompatibilityReportService] Triggering LLM prompt...");
  const reportData = await generateCompatibilityReportContent(llmPayload, userRequest.userId);

  // Merge everything into the final cache record object
  const finalReportObj = {
    llmPayload,
    reportData,
    personalInformation: {
      boy: payload.boy,
      girl: payload.girl
    },
    ashtakootDetails: ashtakootData,
    dashakootDetails: dashakootData,
    manglikDetails: {
      male_manglik: maleMangal?.present || false,
      female_manglik: femaleMangal?.present || false,
      male_manglik_details: maleMangal,
      female_manglik_details: femaleMangal
    },
    boyPlanetDetails: malePlanetDetails,
    girlPlanetDetails: femalePlanetDetails,
    horoscopeCharts: {
      boyLagnaChart,
      girlLagnaChart,
      boyD9Chart,
      girlD9Chart
    }
  };

  return finalReportObj;
}

module.exports = {
  generateCompatibilityReportContent,
  generateCompatibilityReport
};
