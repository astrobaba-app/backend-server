const { createChatCompletion } = require("./openaiClient");
const { extractDashaData } = require("./daily-kundli-report");

const CHAT_MODEL = process.env.OPENAI_CHAT_MODEL || "gpt-4o-mini";

const NAKSHATRA_LORDS = {
  "Ashwini": "Ketu", "Bharani": "Venus", "Krittika": "Sun", "Rohini": "Moon", "Mrigashira": "Mars", "Ardra": "Rahu", "Punarvasu": "Jupiter", "Pushya": "Saturn", "Ashlesha": "Mercury",
  "Magha": "Ketu", "Purva Phalguni": "Venus", "Uttara Phalguni": "Sun", "Hasta": "Moon", "Chitra": "Mars", "Swati": "Rahu", "Vishakha": "Jupiter", "Anuradha": "Saturn", "Jyeshtha": "Mercury",
  "Mula": "Ketu", "Purva Ashadha": "Venus", "Uttara Ashadha": "Sun", "Shravana": "Moon", "Dhanishta": "Mars", "Shatabhisha": "Rahu", "Purva Bhadrapada": "Jupiter", "Uttara Bhadrapada": "Saturn", "Revati": "Mercury"
};

function getNakshatraLord(nakshatraName) {
  if (!nakshatraName) return "Unknown";
  const cleanName = nakshatraName.split(" ")[0].trim();
  return NAKSHATRA_LORDS[cleanName] || "Unknown";
}

function buildSadeSatiReportPayload(kundli, userRequest) {
  const sadesati = kundli.manglikAnalysis?.sadesati || {};
  const planetsObj = kundli.planetary?.planets || {};
  const planetHouses = kundli.planetary?.planet_houses || {};
  const saturn = planetsObj.Saturn || planetsObj.saturn || {};
  const saturnHouse = planetHouses.Saturn || saturn.house || 6;
  const saturnSign = saturn.sign || "Cancer";
  const saturnState = (saturn.is_retrograde || saturn.isRetrograde) ? "retrograde" : "direct";

  let saturnStrength = "moderate";
  if (saturnSign === "Libra") {
    saturnStrength = "strong";
  } else if (saturnSign === "Capricorn" || saturnSign === "Aquarius") {
    saturnStrength = "strong";
  } else if (saturnSign === "Aries") {
    saturnStrength = "challenged";
  } else if (saturnSign === "Cancer" || saturnSign === "Leo") {
    saturnStrength = "challenged";
  }

  const houseThemes = {
    1: ["self-discipline", "personal change", "identity shifts"],
    2: ["wealth management", "family responsibilities", "speech discipline"],
    3: ["courage", "sibling responsibility", "self-effort shifts"],
    4: ["domestic peace", "mother's health", "emotional security"],
    5: ["creative focus", "children responsibility", "intellectual discipline"],
    6: ["work pressure", "service", "health routines", "responsibility"],
    7: ["relationships", "business partnerships", "public interaction"],
    8: ["deep transformation", "sudden shifts", "occult learning"],
    9: ["belief system", "higher learning", "father's guidance"],
    10: ["career responsibility", "public status", "professional duties"],
    11: ["gains", "network groups", "long-term goals"],
    12: ["expenses control", "solitude", "spiritual realignment"]
  };
  const mainThemes = houseThemes[saturnHouse] || ["discipline", "responsibility", "restructuring"];

  let mahadasha = "Unknown";
  let antardasha = "Unknown";
  try {
    const dashaData = extractDashaData(kundli);
    mahadasha = dashaData.mahadasha || "Unknown";
    antardasha = dashaData.antardasha || "Unknown";
  } catch (err) {
    console.error("Error extracting dasha data for Sade Sati payload:", err);
  }

  let sadesatiStatus = "not_started";
  if (sadesati.is_sadesati) {
    sadesatiStatus = "active";
  } else if (sadesati.periods && sadesati.periods.length > 0) {
    sadesatiStatus = "completed";
  }

  const keyChartNotes = [
    "Moon is central for emotional response",
    "Saturn is the primary planet driving this report",
    "Chart shows strong focus on discipline, restructuring, and delayed rewards"
  ];
  if (saturnState === "retrograde") {
    keyChartNotes.push("Saturn is retrograde, indicating deep internal restructuring and delayed realization of efforts.");
  } else {
    keyChartNotes.push("Saturn is direct, emphasizing structural focus, duty, and practical learning.");
  }

  const planetarySummary = {};
  const PLANET_KEYS = ["sun", "moon", "mars", "mercury", "jupiter", "venus", "saturn", "rahu", "ketu"];
  const PLANET_THEMES = {
    sun: "beliefs, authority, guidance",
    moon: "mind, aspirations, emotional nature",
    mars: "effort, conflict handling, transformation",
    mercury: "study, communication, reasoning",
    jupiter: "growth through depth, hidden learning",
    venus: "relationships, comfort, values",
    saturn: "work, discipline, service",
    rahu: "ambition, courage, self-effort",
    ketu: "detachment, wisdom, belief correction"
  };
  PLANET_KEYS.forEach(pk => {
    const matchedKey = Object.keys(planetsObj).find(k => k.toLowerCase() === pk);
    const p = planetsObj[matchedKey] || {};
    planetarySummary[pk] = {
      sign: p.sign || "Unknown",
      house: planetHouses[matchedKey] || p.house || 1,
      theme: PLANET_THEMES[pk]
    };
  });

  const houseSummary = {
    "1": "self-image and personal direction need steadiness",
    "4": "inner peace and home matters need emotional grounding",
    "6": "work, routine, and health improve through discipline",
    "8": "transformation, hidden pressure, and deep change are important",
    "9": "beliefs, guidance, and learning are central",
    "10": "career direction needs patience and structure"
  };

  const sav = kundli.ashtakvarga?.sav || [];
  let ascendantSign = kundli?.basicDetails?.ascendant?.sign || kundli?.basicDetails?.ascendant || null;
  if (typeof ascendantSign === "object" && ascendantSign !== null) ascendantSign = ascendantSign.sign;
  if (!ascendantSign) ascendantSign = kundli?.astroDetails?.ascendant?.sign || "Aries";

  const SIGNS = ["Aries", "Taurus", "Gemini", "Cancer", "Leo", "Virgo", "Libra", "Scorpio", "Sagittarius", "Capricorn", "Aquarius", "Pisces"];
  let ascIdx = SIGNS.map(s => s.toLowerCase()).indexOf(String(ascendantSign).toLowerCase());
  if (ascIdx === -1) ascIdx = 0;

  const getScore = (houseNum) => {
    const signIdx = (ascIdx + houseNum - 1) % 12;
    if (Array.isArray(sav)) {
      const val = sav[signIdx];
      return typeof val === "number" ? val : (val?.points ?? 28);
    }
    return 28;
  };

  const getScoreLabel = (score) => {
    if (score >= 32) return "strong";
    if (score >= 26) return "moderate";
    return "sensitive";
  };

  const saturnSupport = getScoreLabel(getScore(saturnHouse));
  const careerSupport = getScoreLabel(getScore(10));
  const financeSupport = getScoreLabel(getScore(2));
  const relationshipSupport = getScoreLabel(getScore(7));
  const healthSupport = getScore(6) < 26 ? "needs care" : "moderate";

  let age = 30;
  if (userRequest.dateOfbirth) {
    age = new Date().getFullYear() - new Date(userRequest.dateOfbirth).getFullYear();
  }

  const cleanAsc = (typeof kundli?.basicDetails?.ascendant === "object")
    ? kundli?.basicDetails?.ascendant?.sign
    : kundli?.basicDetails?.ascendant || kundli?.astroDetails?.ascendant?.sign || "Aries";

  const nakshatra = kundli?.astroDetails?.nakshatra || "Mula";

  return {
    report_type: "sade_sati_report",
    language: "en",
    tone: "clear, premium, spiritual, practical",
    user_profile: {
      name: userRequest.fullName,
      gender: userRequest.gender,
      age,
      dob: userRequest.dateOfbirth ? new Date(userRequest.dateOfbirth).toISOString().slice(0, 10) : "",
      tob: userRequest.timeOfbirth || "",
      pob: userRequest.placeOfBirth || ""
    },
    core_birth_chart: {
      ascendant: cleanAsc,
      moon_sign: kundli?.basicDetails?.moon_sign || kundli?.horoscope?.moon_sign || "Sagittarius",
      nakshatra,
      moon_lord: getNakshatraLord(nakshatra),
      key_chart_notes: keyChartNotes
    },
    saturn_profile: {
      saturn_sign: saturnSign,
      saturn_house: saturnHouse,
      saturn_strength: saturnStrength,
      saturn_state: saturnState,
      main_themes: mainThemes,
      life_areas_affected: {
        career: sadesati.is_sadesati ? "high" : "moderate",
        health: saturnHouse === 6 || saturnHouse === 8 ? "high" : "moderate",
        finance: sadesati.is_sadesati ? "high" : "moderate",
        relationships: saturnHouse === 7 ? "high" : "moderate",
        family: "moderate"
      }
    },
    current_timing: {
      current_dasha: {
        mahadasha,
        antardasha,
        themes: [
          mahadasha === "Mercury" ? "thinking" : "discipline",
          mahadasha === "Mercury" ? "analysis" : "responsibility",
          antardasha === "Saturn" ? "pressure" : "intellect"
        ]
      },
      current_transit: {
        saturn_transit_phase: sadesati.current_phase || "Kantaka Shani",
        sade_sati_status: sadesatiStatus,
        important_transit_notes: sadesati.is_sadesati
          ? ["current period is more about testing patience than sudden change", "good for consolidation, not impulsive decisions"]
          : ["current period is about consolidating achievements", "avoid impulsive changes"]
      },
      important_future_windows: (sadesati.periods || []).map(p => ({
        period: `${p.start} to ${p.end}`,
        type: p.type || "active"
      })).slice(0, 3)
    },
    planetary_summary: planetarySummary,
    house_summary: houseSummary,
    chart_patterns: {
      dominant_modes: ["practical", "analytical", "change-oriented"],
      major_strengths: ["adaptability", "learning ability", "capacity to endure pressure"],
      major_challenges: ["overthinking", "restlessness", "delayed satisfaction"]
    },
    ashtakavarga_summary: {
      saturn_support: saturnSupport,
      career_support: careerSupport,
      finance_support: financeSupport,
      relationship_support: relationshipSupport,
      health_support: healthSupport,
      travel_support: "moderate"
    },
    personality_summary: {
      core_nature: ["serious when needed", "introspective", "goal-oriented", "sensitive to pressure"],
      decision_style: "careful but can become mentally overloaded",
      emotion_style: "private, thoughtful, slow to trust",
      communication_style: "direct but reflective",
      stress_pattern: ["withdrawal", "delay", "mental heaviness"]
    },
    manglik_summary: {
      status: kundli.manglikAnalysis?.is_manglik ? "manglik" : "not prominent",
      report_relevance: "low"
    },
    remedies: {
      gemstone: {
        recommended: false,
        reason: "not enough priority for this report unless chart logic strongly supports it"
      },
      rudraksha: {
        recommended: true,
        type: "7 Mukhi Rudraksha",
        reason: "helps with stability and focus"
      },
      spiritual_practices: [
        "Hanuman worship",
        "Saturday discipline practice",
        "regular mantra or prayer routine"
      ],
      lifestyle_practices: [
        "sleep discipline",
        "consistent routine",
        "financial caution",
        "avoid impulsive decisions"
      ]
    },
    report_requirements: {
      should_use_scales_not_numbers: true,
      scale_style: ["low", "moderate", "strong", "very strong"],
      avoid_raw_scores: true,
      avoid_overly_generic_language: true,
      focus_on_personalized_interpretation: true,
      include_practical_guidance: true,
      include_phase_wise_structure: true
    }
  };
}

function buildFullReportPrompt(reportInput) {
  return `You are an elite Vedic astrologer specializing in Saturn transits and Shani Sade Sati. Generate a highly detailed, premium, and comprehensive Sade Sati Report based on the provided astrological data.

=========================================
SADE SATI REPORT INPUT DATA (JSON):
${JSON.stringify(reportInput)}
=========================================

CRITICAL WRITING INSTRUCTIONS:
1. Tone must be highly premium, elite, professional, compassionate, and astro-literate.
2. The narrative text on each page must collectively sum up to around 20 sentences, totaling approximately 150-200 words per page to ensure deep, thorough, and dense coverage of each page's topic. If a page has multiple narrative fields (e.g. 2, 3, or 4 fields), distribute the sentences and words among them so they sum to around 20 sentences and approximately 150-200 words total for that page. If a page has only 1 narrative field, write a full 20-sentence detailed paragraph of around 150-200 words for that field. Do not write short sentences, bullet lists, or placeholders. Maintain this word limit strictly per page to prevent output truncation while keeping the high sentence count.
3. Reference the native's actual moon sign, ascendant, nakshatra, and Saturn placement details in the descriptions.
4. NO emojis under any circumstance.
5. Return STRICT JSON matching the expected structure. No markdown formatting or extra text outside the JSON.
6. In 'faqAnswers', generate highly personalized and specific answers to each of the 12 FAQ questions. Do NOT use generic sentences. Use the native's birth chart details (such as their natal Moon sign, Ascendant/Lagna, Nakshatra, Saturn sign, Saturn strength, house position, Ashtakavarga scores, transit timeline, and current Dasha/Bhukti) to provide clear, astrologically-justified explanations for *why* these effects, cycles, challenge levels, or remedies apply to them specifically. Answer each question with a concise, personalized paragraph of 2-3 sentences (around 30-40 words) to ensure they are deeply customized but fit within the JSON output limit.

EXPECTED JSON SCHEMA:
{
  "personalAstrologySnapshot": {
    "snapshotInterpretation": "string",
    "moonSignNakshatraExplanation": "string"
  },
  "sadeSatiStatusOverview": {
    "currentStatusAnalysis": "string",
    "mainLesson": "string",
    "mainCaution": "string"
  },
  "cosmicBlueprint": {
    "moonAsEmotionalCenter": "string",
    "nakshatraSignificance": "string",
    "whySaturnTargetsMoon": "string",
    "innerLifeEffect": "string"
  },
  "philosophyOfTransit": {
    "diamondProcessRefinement": "string",
    "removingFalseSupports": "string",
    "coreMessage": "string",
    "illusionVsReality": "string"
  },
  "saturnTeachingStyle": {
    "disciplineAndDelays": "string",
    "pressureAndAccountability": "string",
    "commonMistakes": "string",
    "bestResponse": "string"
  },
  "majorThemesSummary": {
    "overview": "string",
    "whatMayChange": "string",
    "whatShouldStay": "string"
  },
  "phase1Intro": {
    "risingPhaseOverview": "string",
    "emotionalTone": "string",
    "phaseIntent": "string",
    "likelyExperience": "string"
  },
  "phase1Detail": {
    "movementAndRestlessness": "string",
    "careerPressure": "string",
    "bodyFeetSymbolism": "string",
    "whatToAvoid": "string",
    "whatToDoInstead": "string",
    "signsOfActingTooFast": "string"
  },
  "phase1Guidance": {
    "practicalDiscipline": "string",
    "careerPatience": "string",
    "groundingHabits": "string",
    "routineSuggestion": "string",
    "careerRisk": "string",
    "careerApproach": "string",
    "financeRisk": "string",
    "financeApproach": "string",
    "healthRisk": "string",
    "healthApproach": "string"
  },
  "phase2Intro": {
    "peakPhaseOverview": "string",
    "saturnOverMoonInnerPressure": "string",
    "whatIsBeingTested": "string",
    "emotionalHeavinessWarning": "string"
  },
  "phase2Detail": {
    "anxietyAndHesitation": "string",
    "sleepAndDigestion": "string",
    "vitalityAndFatigue": "string",
    "supportRoutine": "string",
    "sleepTest": "string",
    "sleepAction": "string",
    "digestionTest": "string",
    "digestionAction": "string",
    "energyTest": "string",
    "energyAction": "string"
  },
  "phase3Intro": {
    "settingPhaseOverview": "string",
    "clarityReturns": "string",
    "maturityIndicator": "string",
    "shiftFromConfusionToClarity": "string"
  },
  "phase3LifeEffects": {
    "financialDiscipline": "string",
    "familyCommunication": "string",
    "reputationManagement": "string",
    "observeAndSpeakLess": "string",
    "wealthChallenge": "string",
    "wealthCorrection": "string",
    "familyChallenge": "string",
    "familyCorrection": "string",
    "speechChallenge": "string",
    "speechCorrection": "string"
  },
  "lifeAreaImpact": {
    "careerImpact": "string",
    "careerHealthyResponse": "string",
    "careerWhatNotToDo": "string",
    "relationshipImpact": "string",
    "relationshipHealthyResponse": "string",
    "relationshipWhatNotToDo": "string"
  },
  "minorCycles": {
    "panotiAndDhaiyaExplanation": "string",
    "whyMinorCyclesMatter": "string",
    "severityScaleExplanation": "string"
  },
  "houseWiseImpact": {
    "saturnHousePositionInterpretation": "string",
    "saturnAspectsInterpretation": "string",
    "mostAffectedHousesExplanation": "string"
  },
  "careerStudyImpact": {
    "careerDelayRestructuring": "string",
    "bestCareerStrategy": "string",
    "avoidTheseMistakes": "string",
    "workStudyRhythmSuggestion": "string"
  },
  "relationshipFamilyImpact": {
    "emotionalTiesAndBoundaries": "string",
    "familyDutiesAndDetachment": "string",
    "communicationStyleUnderStress": "string",
    "partnerTest": "string",
    "partnerAction": "string",
    "parentsTest": "string",
    "parentsAction": "string",
    "socialTest": "string",
    "socialAction": "string"
  },
  "healthEnergyGuidance": {
    "physicalSupportDuringPressure": "string",
    "sleepGuidance": "string",
    "dietGuidance": "string",
    "exerciseGuidance": "string",
    "routineGuidance": "string",
    "avoidGuidance": "string",
    "whenToSlowDown": "string"
  },
  "financeMaterialStability": {
    "moneyHabitsUnderSaturn": "string",
    "debtCautionAndMistakes": "string",
    "savingVsSpendingPlan": "string"
  },
  "remedialPathOverview": {
    "constructiveResponse": "string",
    "remedyGroupingDescription": "string"
  },
  "spiritualRemedies": {
    "hanumanWorshipInstructions": "string",
    "ramNaamChantingInstructions": "string",
    "dailyPrayerRhythm": "string",
    "howToDoItSimply": "string"
  },
  "physicalLifestyleRemedies": {
    "sweatingAndRoutineService": "string",
    "reducingInertia": "string",
    "weeklyServiceTasks": "string"
  },
  "practicalDailyActionPlan": {
    "immediate30DayRoutine": "string",
    "stressAndUncertaintyStrategy": "string",
    "morningDo": "string",
    "morningAvoid": "string",
    "speechDo": "string",
    "speechAvoid": "string",
    "financeDo": "string",
    "financeAvoid": "string",
    "lifestyleDo": "string",
    "lifestyleAvoid": "string"
  },
  "lifeAreaSummary": {
    "careerReasoning": "string",
    "relationshipsReasoning": "string",
    "healthReasoning": "string",
    "financeReasoning": "string",
    "mindReasoning": "string",
    "familyReasoning": "string"
  },
  "stabilityMap": {
    "whatMayShift": "string",
    "whatIsBeingTested": "string",
    "whatShouldBeProtected": "string",
    "whatIsStrengthened": "string"
  },
  "forecast": {
    "nearTermForecast": "string",
    "midTermForecast": "string",
    "laterTermForecast": "string",
    "keyTransitionWindows": "string"
  },
  "finalInsight": {
    "coreMessage": "string",
    "oneSentenceTruth": "string",
    "whatToRememberMost": "string"
  },
  "affirmationsList": [
    "string", "string", "string", "string", "string", "string", "string"
  ],
  "finalConclusion": {
    "closingSummary": "string",
    "movingForwardReassurance": "string",
    "maturityDefinition": "string"
  },
  "appendix": {
    "glossaryTerms": "string",
    "remedyReference": "string"
  },
  "faqAnswers": {
    "currentlyUnderInfluence": "string",
    "nextBeginAndEnd": "string",
    "mostChallengingPhase": "string",
    "mostAffectedAreas": "string",
    "careerBusinessChallenges": "string",
    "relationshipsFamilyInfluence": "string",
    "financialLossesExpenses": "string",
    "lessonsSaturnTeaches": "string",
    "mistakesToAvoid": "string",
    "effectiveRemedies": "string",
    "reliefAndPositiveResults": "string",
    "personalGrowthSuccess": "string"
  }
}`;
}

function cleanJsonResponse(rawText) {
  if (!rawText) return "";
  let cleaned = rawText.trim();
  if (cleaned.startsWith("```json")) {
    cleaned = cleaned.substring(7);
  } else if (cleaned.startsWith("```")) {
    cleaned = cleaned.substring(3);
  }
  if (cleaned.endsWith("```")) {
    cleaned = cleaned.substring(0, cleaned.length - 3);
  }
  return cleaned.trim();
}

async function generateSadeSatiReportContent(reportInput, userId) {
  console.log(`[SadeSatiReportService] Requesting full report from OpenAI for ${reportInput.user_profile?.name || "client"}...`);
  const startTime = Date.now();
  const response = await createChatCompletion(
    {
      model: CHAT_MODEL,
      messages: [
        {
          role: "system",
          content: "You are an elite Vedic astrologer specializing in Saturn and Sade Sati transits. Return strict JSON Sade Sati reports matching the expected schema. Every page's narrative fields must contain detailed, elaborate explanations, summing up to around 20 sentences and approximately 150-200 words total per page (summed across all fields on that page). No emojis. No markdown wrappers."
        },
        {
          role: "user",
          content: buildFullReportPrompt(reportInput)
        }
      ],
      temperature: 0.7,
      max_completion_tokens: 16000,
      response_format: { type: "json_object" }
    },
    { feature: "sadesati_report_generation_full", userId }
  );

  const duration = Date.now() - startTime;
  const content = response?.choices?.[0]?.message?.content?.trim();
  if (!content) {
    throw new Error("No Sade Sati report response returned from OpenAI Client");
  }

  console.log(`[SadeSatiReportService] LLM response received successfully. Time taken: ${duration} ms`);

  const cleanedContent = cleanJsonResponse(content);
  try {
    return JSON.parse(cleanedContent);
  } catch (err) {
    console.error("[SadeSatiReportService] Failed to parse GPT response:", content);
    throw new Error("Invalid JSON returned by OpenAI model");
  }
}

async function generateSadeSatiReport(kundli, userRequest) {
  console.log(`[SadeSatiReportService] Processing report payload for ${userRequest.fullName}...`);
  const reportInput = buildSadeSatiReportPayload(kundli, userRequest);

  const reportData = await generateSadeSatiReportContent(reportInput, userRequest.userId);

  const sadesati = kundli.manglikAnalysis?.sadesati || {};
  const planetsObj = kundli.planetary?.planets || {};
  const planetHouses = kundli.planetary?.planet_houses || {};
  const saturn = planetsObj.Saturn || planetsObj.saturn || {};
  const saturnHouse = planetHouses.Saturn || saturn.house || 6;
  const saturnSign = saturn.sign || "Cancer";
  const saturnState = (saturn.is_retrograde || saturn.isRetrograde) ? " (Retrograde)" : "";
  const saturnPlacement = `Saturn in ${saturnSign} in house ${saturnHouse}${saturnState}`;

  return {
    reportInput,
    predictions: reportData,
    personalInformation: {
      fullName: userRequest.fullName,
      dateOfbirth: userRequest.dateOfbirth,
      timeOfbirth: userRequest.timeOfbirth,
      placeOfBirth: userRequest.placeOfBirth,
      gender: userRequest.gender
    },
    astrologyBasics: {
      ascendant: reportInput.core_birth_chart.ascendant,
      moonSign: reportInput.core_birth_chart.moon_sign,
      sunSign: reportInput.planetary_summary.sun.sign,
      nakshatra: reportInput.core_birth_chart.nakshatra,
      saturnPlacement,
      sadesati: {
        isCurrentlyActive: sadesati.is_sadesati || false,
        statusMessage: sadesati.status || "Not Active",
        currentPhase: sadesati.current_phase || null,
        periods: sadesati.periods || []
      }
    },
    horoscopeCharts: {
      rasiChart: kundli.charts?.D1 || null,
      horaChart: kundli.charts?.D2 || null,
      navamsaChart: kundli.charts?.D9 || null,
      dasamsaChart: kundli.charts?.D10 || null,
      ...(kundli.charts || {})
    }
  };
}

module.exports = {
  buildSadeSatiReportPayload,
  generateSadeSatiReportContent,
  generateSadeSatiReport
};
