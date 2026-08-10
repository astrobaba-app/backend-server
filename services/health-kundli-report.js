const { createChatCompletion } = require("./openaiClient");
const { extractDashaData } = require("./daily-kundli-report");

const CHAT_MODEL = process.env.OPENAI_CHAT_MODEL || "gpt-4o-mini";

const VIMSHOTTARI_SEQUENCE = ['Ketu', 'Venus', 'Sun', 'Moon', 'Mars', 'Rahu', 'Jupiter', 'Saturn', 'Mercury'];
const VIMSHOTTARI_PERIODS = { Ketu: 7, Venus: 20, Sun: 6, Moon: 10, Mars: 7, Rahu: 18, Jupiter: 16, Saturn: 19, Mercury: 17 };

function calculateAllDashas(dashaObj) {
  const dashas = Array.isArray(dashaObj?.dashas) ? dashaObj.dashas : Array.isArray(dashaObj?.major_dashas) ? dashaObj.major_dashas : [];
  if (dashas.length === 0) return [];

  return dashas.map(period => {
    const mahaPlanet = period.planet || period.lord || null;
    const mahaStartStr = period.start_date || period.start || null;
    const mahaEndStr = period.end_date || period.end || null;
    const antardashas = [];

    if (mahaPlanet && mahaStartStr && mahaEndStr) {
      try {
        const mahaStart = new Date(mahaStartStr + 'T00:00:00');
        const mahaEnd = new Date(mahaEndStr + 'T00:00:00');
        const mahaTotalDays = (mahaEnd - mahaStart) / (1000 * 60 * 60 * 24);

        const mahaStartIndex = VIMSHOTTARI_SEQUENCE.indexOf(mahaPlanet);
        if (mahaStartIndex !== -1) {
          let currentStart = new Date(mahaStart);

          for (let i = 0; i < 9; i++) {
            const planet = VIMSHOTTARI_SEQUENCE[(mahaStartIndex + i) % 9];
            const periodYears = VIMSHOTTARI_PERIODS[planet];
            const proportion = periodYears / 120;
            const antarDays = Math.round(mahaTotalDays * proportion);

            const currentEnd = new Date(currentStart);
            currentEnd.setDate(currentEnd.getDate() + antarDays);

            if (i === 8) {
              currentEnd.setTime(mahaEnd.getTime());
            }

            antardashas.push({
              planet,
              start: currentStart.toISOString().slice(0, 10),
              end: currentEnd.toISOString().slice(0, 10)
            });

            currentStart = new Date(currentEnd);
          }
        }
      } catch (err) {
        console.error("calculateAllDashas period error:", err);
      }
    }

    return {
      mahadasha: mahaPlanet,
      start: mahaStartStr,
      end: mahaEndStr,
      antardashas
    };
  });
}

const NAKSHATRA_LORDS = {
  "Ashwini": "Ketu", "Bharani": "Venus", "Krittika": "Sun", "Rohini": "Moon", "Mrigashira": "Mars", "Ardra": "Rahu", "Punarvasu": "Jupiter", "Pushya": "Saturn", "Ashlesha": "Mercury",
  "Magha": "Ketu", "Purva Phalguni": "Venus", "Uttara Phalguni": "Sun", "Hasta": "Moon", "Chitra": "Mars", "Swati": "Rahu", "Vishakha": "Jupiter", "Anuradha": "Saturn", "Jyeshtha": "Mercury",
  "Mula": "Ketu", "Purva Ashadha": "Venus", "Uttara Ashadha": "Sun", "Shravana": "Moon", "Dhanishta": "Mars", "Shatabhisha": "Rahu", "Purva Bhadrapada": "Jupiter", "Uttara Bhadrapada": "Saturn", "Revati": "Mercury"
};

const SIGN_ELEMENT = {
  Aries: "Fire", Taurus: "Earth", Gemini: "Air", Cancer: "Water",
  Leo: "Fire", Virgo: "Earth", Libra: "Air", Scorpio: "Water",
  Sagittarius: "Fire", Capricorn: "Earth", Aquarius: "Air", Pisces: "Water"
};

const SIGN_BODY_PART = {
  Aries: "Head, brain, eyes", Taurus: "Throat, neck, thyroid",
  Gemini: "Lungs, arms, nervous system", Cancer: "Chest, stomach, digestion",
  Leo: "Heart, spine, circulation", Virgo: "Intestines, colon, metabolism",
  Libra: "Kidneys, lower back, skin", Scorpio: "Reproductive system, bladder, joints",
  Sagittarius: "Thighs, hips, liver", Capricorn: "Knees, bones, joints",
  Aquarius: "Ankles, circulation, nervous system", Pisces: "Feet, lymphatic system, immunity"
};

function getNakshatraLord(nakshatraName) {
  if (!nakshatraName) return "Unknown";
  const cleanName = nakshatraName.split(" ")[0].trim();
  return NAKSHATRA_LORDS[cleanName] || "Unknown";
}

/**
 * Build the two-layer health report payload from full kundli data.
 * Layer A: summary signals (LLM-ready, minimal)
 * Layer B: evidence bullets (structured, concise)
 */
function buildHealthReportPayload(kundli, userRequest) {
  const planetsObj = kundli.planetary?.planets || {};
  const planetHouses = kundli.planetary?.planet_houses || {};

  // ── Core planets ─────────────────────────────────────────────────────────
  const getP = (name) => {
    const key = Object.keys(planetsObj).find(k => k.toLowerCase() === name.toLowerCase());
    return planetsObj[key] || {};
  };

  const sun = getP("Sun");
  const moon = getP("Moon");
  const mars = getP("Mars");
  const mercury = getP("Mercury");
  const jupiter = getP("Jupiter");
  const saturn = getP("Saturn");

  const sunSign = sun.sign || "Aries";
  const moonSign = moon.sign || "Aries";
  const marsSign = mars.sign || "Aries";
  const jupiterSign = jupiter.sign || "Aries";
  const saturnSign = saturn.sign || "Aries";
  const saturnHouse = planetHouses.Saturn || saturn.house || 6;
  const marsHouse = planetHouses.Mars || mars.house || 1;
  const jupiterHouse = planetHouses.Jupiter || jupiter.house || 1;

  // ── Ascendant ─────────────────────────────────────────────────────────────
  let ascendant = kundli?.basicDetails?.ascendant;
  if (typeof ascendant === "object" && ascendant !== null) ascendant = ascendant.sign;
  if (!ascendant) ascendant = kundli?.astroDetails?.ascendant?.sign || "Aries";

  // ── Moon nakshatra ────────────────────────────────────────────────────────
  const nakshatra = kundli?.astroDetails?.nakshatra || "Mula";
  const nakshatraLord = getNakshatraLord(nakshatra);

  // ── Dasha ─────────────────────────────────────────────────────────────────
  let mahadasha = "Unknown";
  let antardasha = "Unknown";
  try {
    const dashaData = extractDashaData(kundli);
    mahadasha = dashaData.mahadasha || "Unknown";
    antardasha = dashaData.antardasha || "Unknown";
  } catch (err) {
    console.error("[HealthReportService] Error extracting dasha data:", err);
  }

  // ── Age ───────────────────────────────────────────────────────────────────
  let age = 25;
  if (userRequest.dateOfbirth) {
    age = new Date().getFullYear() - new Date(userRequest.dateOfbirth).getFullYear();
  }

  // ── Elemental balance ─────────────────────────────────────────────────────
  const elements = [sunSign, moonSign, ascendant, marsSign, jupiterSign, saturnSign].map(s => SIGN_ELEMENT[s] || "Earth");
  const elementCounts = elements.reduce((acc, el) => { acc[el] = (acc[el] || 0) + 1; return acc; }, {});
  const dominantElements = Object.entries(elementCounts).sort((a, b) => b[1] - a[1]).slice(0, 2).map(e => e[0]);

  // ── Top 3 strong & bottom 3 weak ashtakavarga houses ─────────────────────
  const sav = kundli.ashtakvarga?.sav || [];
  let topHouses = [], weakHouses = [];
  if (Array.isArray(sav) && sav.length >= 12) {
    const SIGNS = ["Aries", "Taurus", "Gemini", "Cancer", "Leo", "Virgo", "Libra", "Scorpio", "Sagittarius", "Capricorn", "Aquarius", "Pisces"];
    let ascIdx = SIGNS.map(s => s.toLowerCase()).indexOf(String(ascendant).toLowerCase());
    if (ascIdx === -1) ascIdx = 0;
    const houseScores = Array.from({ length: 12 }, (_, i) => {
      const signIdx = (ascIdx + i) % 12;
      const val = sav[signIdx];
      return { house: i + 1, score: typeof val === "number" ? val : (val?.points ?? 28) };
    });
    topHouses = houseScores.sort((a, b) => b.score - a.score).slice(0, 3).map(h => `House ${h.house}`);
    weakHouses = houseScores.sort((a, b) => a.score - b.score).slice(0, 3).map(h => `House ${h.house}`);
  }

  // ── Conjunctions & key placements ─────────────────────────────────────────
  const dominantPatterns = [];
  if (sun.is_debilitated || (sunSign === "Libra")) dominantPatterns.push("Sun debilitated in Libra");
  if (marsHouse === 8 && jupiterHouse === 8) dominantPatterns.push("Mars + Jupiter in 8th house");
  if (saturnHouse === 6) dominantPatterns.push("Saturn in 6th house — strong service, health routine emphasis");
  if (mercury.sign) dominantPatterns.push(`Mercury in ${mercury.sign} — supports communication and structure`);
  dominantPatterns.push(`${ascendant} ascendant`);

  // ── Body risk signals from planetary placements ────────────────────────────
  const ascBodyPart = SIGN_BODY_PART[ascendant] || "General body";
  const moonBodyPart = SIGN_BODY_PART[moonSign] || "Mind and emotions";
  const sunBodyPart = SIGN_BODY_PART[sunSign] || "Vitality and heart";

  // ── Health focus derived from chart ───────────────────────────────────────
  const healthTopics = [];
  if (["Cancer", "Virgo", "Scorpio"].includes(ascendant) || ["Cancer", "Virgo"].includes(moonSign)) {
    healthTopics.push("digestion");
  }
  if (["Aquarius", "Gemini", "Virgo"].includes(ascendant)) {
    healthTopics.push("nervous system", "stress", "sleep");
  }
  if (["Aries", "Leo", "Sagittarius"].includes(sunSign) || mahadasha === "Sun" || mahadasha === "Mars") {
    healthTopics.push("circulation", "metabolism");
  }
  if (saturnHouse === 6 || saturnHouse === 1) {
    healthTopics.push("joints", "bones", "posture");
  }
  if (healthTopics.length < 4) {
    healthTopics.push("sleep", "stress", "digestion", "circulation");
  }
  const uniqueHealthTopics = [...new Set(healthTopics)].slice(0, 6);

  // ── Gemstone and rudraksha ─────────────────────────────────────────────────
  const gemstoneRec = kundli?.remedies?.gemstones?.recommendation || null;
  const rudrakshaRec = kundli?.remedies?.rudraksha?.recommendation || null;

  // ── Personality traits ────────────────────────────────────────────────────
  const personalityTraits = [];
  if (Array.isArray(kundli.personality?.traits)) {
    personalityTraits.push(...kundli.personality.traits.slice(0, 3));
  } else {
    personalityTraits.push("analytical", "resilient", "goal-oriented");
  }

  // ── Timing sensitivity ────────────────────────────────────────────────────
  const timingSensitive = [];
  if (mahadasha === "Sun" || mahadasha === "Mars") timingSensitive.push("high energy period, balance not force");
  if (mahadasha === "Saturn") timingSensitive.push("discipline and routine are critical");
  if (mahadasha === "Rahu" || mahadasha === "Ketu") timingSensitive.push("avoid overexertion, protect health");
  if (timingSensitive.length === 0) timingSensitive.push("steady phase, build healthy habits now");

  return {
    report_type: "health_astrology_report",
    language: "en",
    tone: "premium, personalized, practical, compassionate",

    // ── Layer A: Summary (LLM-ready signals) ─────────────────────────────────
    summary: {
      core_health_story: `${ascendant} ascendant with Moon in ${moonSign} (${nakshatra} nakshatra) — ${dominantElements.join(" and ")} dominant constitution. Health calls for discipline in ${uniqueHealthTopics.slice(0, 3).join(", ")}.`,
      dominant_theme: "Routine is the primary medicine. Consistent sleep, meal timing, and grounding habits will resolve most health themes.",
      current_timing: `${mahadasha} Mahadasha with ${antardasha} Antardasha — ${timingSensitive[0] || "a phase calling for mindful health choices"}.`,
      elemental_constitution: `Dominant: ${dominantElements.join(", ")}. ${["Earth", "Water"].some(e => !dominantElements.includes(e)) ? "Earth and Water elements need support through grounding and hydration." : "Balanced constitution with attention needed for nervous system."}`,
      age_phase: `At age ${age}, the body is in the ${age < 25 ? "formative" : age < 40 ? "building and consolidation" : age < 55 ? "peak responsibility" : "maturity and preservation"} phase of life.`
    },

    // ── Layer B: Evidence bullets ─────────────────────────────────────────────
    evidence: {
      profile: {
        name: userRequest.fullName,
        age,
        gender: userRequest.gender,
        dob: userRequest.dateOfbirth ? new Date(userRequest.dateOfbirth).toISOString().slice(0, 10) : "",
        tob: userRequest.timeOfbirth || "",
        pob: userRequest.placeOfBirth || ""
      },
      chart_summary: {
        lagna: ascendant,
        moon_sign: moonSign,
        moon_nakshatra: nakshatra,
        nakshatra_lord: nakshatraLord,
        sun_sign: sunSign,
        dominant_patterns: dominantPatterns.slice(0, 5),
        current_mahadasha: mahadasha,
        current_antardasha: antardasha
      },
      astro_evidence: [
        `${ascendant} ascendant — body type and constitution theme: ${ascBodyPart}`,
        `Moon in ${moonSign} (${nakshatra}) — emotional and mental health theme: ${moonBodyPart}`,
        `Sun in ${sunSign} — vitality theme: ${sunBodyPart}`,
        `Mars in ${marsSign} (House ${marsHouse}) — energy and inflammation pattern`,
        `Jupiter in ${jupiterSign} (House ${jupiterHouse}) — expansion, liver, metabolism`,
        `Saturn in ${saturnSign} (House ${saturnHouse}) — structure, bones, chronic patterns`
      ],
      health_focus: {
        top_themes: uniqueHealthTopics,
        top_strengths: ["natural resilience", "mental adaptability", "capacity to build strong routines"],
        top_watchouts: [
          "irregular meal timing",
          "restless or insufficient sleep",
          "mental overthinking and stress accumulation",
          "neck, shoulder, or joint tension",
          "skipping water intake"
        ],
        elemental_balance: {
          dominant_elements: dominantElements,
          body_risk_from_dominance: dominantElements.includes("Fire") ? "inflammation, acidity, heat" : dominantElements.includes("Air") ? "gas, bloating, dryness, nervous tension" : "heaviness, mucus, sluggishness"
        }
      },
      timing: {
        current_phase_summary: timingSensitive[0],
        next_12_month_focus: ["build consistent daily routine", "protect sleep schedule", "warm regular meals", "reduce screen overload", "grounding movement daily"],
        sensitive_windows: ["late-night activity", "skipped meals", "stress spikes", "excessive fasting", "irregular sleep timing"]
      },
      ashtakavarga_signals: {
        strong_houses: topHouses,
        weak_houses: weakHouses
      },
      remedies: {
        gemstone: gemstoneRec || "Consult astrologer based on chart",
        rudraksha: rudrakshaRec || "5 Mukhi Rudraksha for general well-being",
        daily_mantras: mahadasha === "Sun" ? ["Aditya Hridaya Stotram", "Surya Namaskar"] :
          mahadasha === "Mars" ? ["Hanuman Chalisa", "Mars Beej Mantra"] :
            mahadasha === "Saturn" ? ["Mahamrityunjaya Mantra", "Shiva Rudrashtakam"] :
              ["Mahamrityunjaya Mantra", "Gayatri Mantra"]
      }
    },

    // ── Report output requirements ────────────────────────────────────────────
    report_output_goal: {
      type: "health astrology report",
      length_target_pages: 48,
      style: "premium, deeply personalized, practical, wellness-focused",
      must_include_sections: [
        "executive summary",
        "elemental constitution",
        "kalpurush anatomy scan",
        "deep dive health diagnosis",
        "sleep and psychological analysis",
        "timing and manifestation",
        "prescribed remedies",
        "30-day wellness plan"
      ],
      avoid: [
        "raw chart dumps",
        "generic health advice not tied to the chart",
        "repeated paragraphs",
        "short sections — every field needs 25 to 35 detailed, personalized sentences"
      ]
    }
  };
}

function buildHealthReportPrompt(reportInput) {
  return `You are an elite Vedic health astrologer and wellness analyst. Write a premium, highly personalized health astrology report based strictly on the provided kundli data.

=========================================
HEALTH REPORT INPUT DATA (JSON):
${JSON.stringify(reportInput)}
=========================================

WRITING REQUIREMENTS:

1. Write in a natural, fluent, human way. The report should feel like a real expert has studied this exact chart deeply.
2. Every section must be highly personalized to the native’s actual ascendant, Moon sign, nakshatra, planetary placements, house influences, aspects, and dasha/transit context if available.
3. Avoid generic astrology language. Do not use filler phrases or repeated sentence patterns.
4. Keep the tone premium, compassionate, wellness-focused, confident, and astro-literate.
5. No emojis, no markdown, no bullets unless the schema field clearly benefits from structured phrasing.
6. Return STRICT JSON only. Do not add any extra text outside the JSON.
7. Use smooth transitions and varied sentence lengths so the writing feels natural.
8. Prefer insight-rich explanations over shallow summaries.
9. Do not invent medical facts. Astrology should guide interpretation, not replace medicine.
10. When a section has many subpoints, give each subpoint its own depth instead of compressing everything.
11. Write in an expansive, highly descriptive narrative style. Do not summarize or use short placeholder sentences; instead, explain the underlying astrological dynamics and practical wellness reasoning in complete, rich, detailed paragraphs.
12. In 'faqAnswers', generate highly personalized and specific answers to each of the 12 Health FAQ questions. Do NOT use generic sentences. Use the user's birth details, ascendant, Moon sign, planetary positions, active dasha, and transits to provide clear, astrologically-justified explanations for *why* these recommendations and tendencies apply to them. Answer each question with a concise, personalized paragraph of 2-3 sentences (around 30-40 words).

DEPTH TARGETS:

- executiveSummary fields: 4 to 6 detailed, highly descriptive narrative sentences each.
- major analysis fields: 4 to 6 detailed, highly descriptive narrative sentences each.
- deepDive fields: 5 to 7 detailed, highly descriptive narrative sentences each.
- remedy and plan fields: 4 to 6 detailed, highly descriptive narrative sentences each.
- finalSummary fields: 4 to 6 detailed, highly descriptive narrative sentences each.
- affirmationsList: each affirmation in this list must be a therapeutic narrative passage of 2 to 3 sentences (about 30 to 45 words), tailored to the native's chart.

EXPECTED JSON SCHEMA:

{
  "executiveSummary": {
    "snapshotInterpretation": "string (4-6 sentences)",
    "topStrengths": "string (4-6 sentences)",
    "topWatchouts": "string (4-6 sentences)",
    "constitutionOverview": "string (4-6 sentences)",
    "currentPhaseHealth": "string (4-6 sentences)"
  },
  "elementalConstitution": {
    "overallBalance": "string (4-6 sentences)",
    "fireElementAnalysis": "string (4-6 sentences)",
    "waterElementAnalysis": "string (4-6 sentences)",
    "airElementAnalysis": "string (4-6 sentences)",
    "earthElementAnalysis": "string (4-6 sentences)",
    "spaceElementAnalysis": "string (4-6 sentences)",
    "dailyImbalancePattern": "string (4-6 sentences)"
  },
  "kalpurushAnatomy": {
    "ascendantBodyMap": "string (4-6 sentences)",
    "headBrainAnalysis": "string (4-6 sentences)",
    "heartCirculationAnalysis": "string (4-6 sentences)",
    "digestiveSystemAnalysis": "string (4-6 sentences)",
    "bonesJointsPostureAnalysis": "string (4-6 sentences)",
    "skinImmunityRecoveryAnalysis": "string (4-6 sentences)",
    "nervousSystemAnalysis": "string (4-6 sentences)"
  },
  "deepDiveDiagnosis": {
    "top5HealthThemesSummary": "string (5-7 sentences)",
    "digestiveMetabolicDeepDive": "string (5-7 sentences)",
    "sleepRestorativeDeepDive": "string (5-7 sentences)",
    "stressAnxietyDeepDive": "string (5-7 sentences)",
    "circulationCardiacDeepDive": "string (5-7 sentences)",
    "jointsBonePostureDeepDive": "string (5-7 sentences)",
    "skinDetoxDeepDive": "string (5-7 sentences)",
    "recoveryResilienceDeepDive": "string (5-7 sentences)"
  },
  "sleepPsychologicalAnalysis": {
    "sleepProfileOverview": "string (4-6 sentences)",
    "mindActivityStressResponse": "string (4-6 sentences)",
    "emotionalRegulationPattern": "string (4-6 sentences)",
    "eveningRoutineDesign": "string (4-6 sentences)",
    "psychologicalStrengths": "string (4-6 sentences)",
    "sleepImprovementPlan": "string (4-6 sentences)"
  },
  "timingManifestation": {
    "currentPeriodHealthSummary": "string (4-6 sentences)",
    "goodTimingWindowsForHealth": "string (4-6 sentences)",
    "cautionPeriodsForHealth": "string (4-6 sentences)",
    "longTermLifeRhythm": "string (4-6 sentences)",
    "manifestationThroughHabits": "string (4-6 sentences)",
    "personalTimingGuidance": "string (4-6 sentences)"
  },
  "prescribedRemedies": {
    "remedyPhilosophy": "string (4-6 sentences)",
    "dailyRemedyRoutine": "string (4-6 sentences)",
    "weeklyRemedies": "string (4-6 sentences)",
    "dietLifestyleRemedies": "string (4-6 sentences)",
    "mantrasAndSpiritualRemedies": "string (4-6 sentences)",
    "remedyMatrix": "string (4-6 sentences)"
  },
  "wellnessPlan": {
    "thirtyDayPlanOverview": "string (4-6 sentences)",
    "week1Focus": "string (4-6 sentences)",
    "week2Focus": "string (4-6 sentences)",
    "week3Focus": "string (4-6 sentences)",
    "week4Focus": "string (4-6 sentences)",
    "dailyHealthChecklist": "string (4-6 sentences)",
    "weeklyHealthChecklist": "string (4-6 sentences)"
  },
  "bodyRiskScores": {
    "digestiveScore": "string (score e.g. 8/10)",
    "sleepScore": "string (score e.g. 8/10)",
    "stressScore": "string (score e.g. 8/10)",
    "circulationScore": "string (score e.g. 8/10)",
    "jointsScore": "string (score e.g. 8/10)",
    "skinScore": "string (score e.g. 8/10)",
    "recoveryScore": "string (score e.g. 8/10)",
    "scoresInterpretation": "string (4-6 sentences)"
  },
  "redFlagsAndCare": {
    "whatAstrologyCanSuggest": "string (4-6 sentences)",
    "medicalCheckupGuidance": "string (4-6 sentences)",
    "whenToSeeADoctor": "string (4-6 sentences)",
    "responsibleDisclaimer": "string (4-6 sentences)"
  },
  "finalSummary": {
    "top5Strengths": "string (4-6 sentences)",
    "top5Watchouts": "string (4-6 sentences)",
    "top5HabitsToStart": "string (4-6 sentences)",
    "closingInsight": "string (4-6 sentences)",
    "upliftingClosingMessage": "string (4-6 sentences)"
  },
  "affirmationsList": [
    "string (2-3 sentences, therapeutic affirmation)",
    "string (2-3 sentences, therapeutic affirmation)",
    "string (2-3 sentences, therapeutic affirmation)",
    "string (2-3 sentences, therapeutic affirmation)",
    "string (2-3 sentences, therapeutic affirmation)",
    "string (2-3 sentences, therapeutic affirmation)",
    "string (2-3 sentences, therapeutic affirmation)"
  ],
  "faqAnswers": {
    "strongestHealthTraits": "string (2-3 sentences, personalized to chart)",
    "attentionRequiredAreas": "string (2-3 sentences, personalized to chart)",
    "bodySystemsSensitivity": "string (2-3 sentences, personalized to chart)",
    "elementalConstitutionInfluence": "string (2-3 sentences, personalized to chart)",
    "digestionMetabolismIndicator": "string (2-3 sentences, personalized to chart)",
    "stressEmotionalWellBeing": "string (2-3 sentences, personalized to chart)",
    "sleepQualityRecovery": "string (2-3 sentences, personalized to chart)",
    "habitsLifestylePatterns": "string (2-3 sentences, personalized to chart)",
    "favorablePeriodsHealth": "string (2-3 sentences, personalized to chart)",
    "longTermWellnessHabits": "string (2-3 sentences, personalized to chart)",
    "astrologicalRemediesMaintenance": "string (2-3 sentences, personalized to chart)",
    "preventiveMeasuresStrengths": "string (2-3 sentences, personalized to chart)"
  }
}

STYLE NOTES:
- Make each section feel distinct.
- Use deeper interpretation where the chart supports it.
- Link body, mind, timing, and remedies together naturally.
- Write as though this is a paid premium report for one specific person.
- Keep the language warm, intelligent, and confident.
- Ensure the output is internally consistent and logically grounded in the chart data.`;
}

function cleanJsonResponse(rawText) {
  if (!rawText) return "";
  let cleaned = rawText.trim();
  
  const startIdx = cleaned.indexOf("{");
  const endIdx = cleaned.lastIndexOf("}");
  if (startIdx !== -1 && endIdx !== -1 && endIdx > startIdx) {
    cleaned = cleaned.substring(startIdx, endIdx + 1);
  } else {
    if (cleaned.startsWith("```json")) cleaned = cleaned.substring(7);
    else if (cleaned.startsWith("```")) cleaned = cleaned.substring(3);
    if (cleaned.endsWith("```")) cleaned = cleaned.substring(0, cleaned.length - 3);
  }
  return cleaned.trim();
}

async function generateHealthReportContent(reportInput, userId) {
  console.log(`[HealthReportService] Requesting full report from OpenAI for ${reportInput.evidence?.profile?.name || "client"}...`);

  const userPrompt = buildHealthReportPrompt(reportInput);
  console.log(`[HealthReportService] INPUT character count: ${userPrompt.length}`);

  const startTime = Date.now();
  const response = await createChatCompletion(
    {
      model: CHAT_MODEL,
      messages: [
        {
          role: "system",
          content: "You are an elite Vedic health astrologer. Generate deeply personalized health astrology reports as strict JSON. Every narrative field must be a detailed, rich narrative matching the target sentence count (typically 4 to 6 sentences for standard sections and 5 to 7 sentences for deep dives). Every affirmation in the affirmationsList must be a therapeutic narrative of 2 to 3 sentences (30-45 words). Reference actual chart placements — ascendant, Moon sign, nakshatra, planetary positions. Never write literal double quotes inside JSON string values; if you need to write a quote, use single quotes instead. No generic content. No emojis. No markdown wrappers."
        },
        {
          role: "user",
          content: userPrompt
        }
      ],
      temperature: 0.72,
      max_completion_tokens: 16000,
      response_format: { type: "json_object" }
    },
    { feature: "health_report_generation_full", userId }
  );

  const duration = Date.now() - startTime;
  const content = response?.choices?.[0]?.message?.content?.trim();
  if (!content) {
    throw new Error("No Health Report response returned from OpenAI Client");
  }

  console.log(`[HealthReportService] OUTPUT character count: ${content.length}`);
  // console.log("[HealthReportService] Raw LLM response:");
  // console.log(content);
  console.log(`[HealthReportService] LLM response received successfully. Time taken: ${duration} ms`);

  const cleanedContent = cleanJsonResponse(content);
  try {
    return JSON.parse(cleanedContent);
  } catch (err) {
    console.error("[HealthReportService] Failed to parse GPT response. Error:", err.message);
    console.error("[HealthReportService] Cleaned content length:", cleanedContent.length);
    console.error("[HealthReportService] Cleaned content ending snippet:", cleanedContent.slice(-300));
    throw new Error(`Invalid JSON returned by OpenAI model: ${err.message}`);
  }
}

async function generateHealthReport(kundli, userRequest) {
  console.log(`[HealthReportService] Processing report payload for ${userRequest.fullName}...`);
  const reportInput = buildHealthReportPayload(kundli, userRequest);
  const reportData = await generateHealthReportContent(reportInput, userRequest.userId);

  const planetsObj = kundli.planetary?.planets || {};
  const planetHouses = kundli.planetary?.planet_houses || {};

  let ascendant = kundli?.basicDetails?.ascendant;
  if (typeof ascendant === "object" && ascendant !== null) ascendant = ascendant.sign;
  if (!ascendant) ascendant = kundli?.astroDetails?.ascendant?.sign || "Aries";

  const moonSign = planetsObj.Moon?.sign || planetsObj.moon?.sign || "Sagittarius";
  const sunSign = planetsObj.Sun?.sign || planetsObj.sun?.sign || "Aries";
  const nakshatra = kundli?.astroDetails?.nakshatra || "Mula";

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
      ascendant,
      moonSign,
      sunSign,
      nakshatra,
      mahadasha: reportInput.evidence?.chart_summary?.current_mahadasha || "Unknown",
      antardasha: reportInput.evidence?.chart_summary?.current_antardasha || "Unknown",
      dominantElements: reportInput.summary?.elemental_constitution || "",
      allDashas: calculateAllDashas(kundli.dasha)
    },
    horoscopeCharts: {
      rasiChart: kundli.charts?.D1 || null,
      navamsaChart: kundli.charts?.D9 || null,
      ...(kundli.charts || {})
    }
  };
}

module.exports = {
  buildHealthReportPayload,
  generateHealthReportContent,
  generateHealthReport
};
