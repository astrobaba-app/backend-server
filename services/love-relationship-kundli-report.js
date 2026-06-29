const { createChatCompletion } = require("./openaiClient");
const { extractDashaData } = require("./daily-kundli-report");
const { getAllCharts } = require("./astroEngineService");

const CHAT_MODEL = process.env.OPENAI_CHAT_MODEL || "gpt-4o-mini";

const VIMSHOTTARI_SEQUENCE = ['Ketu', 'Venus', 'Sun', 'Moon', 'Mars', 'Rahu', 'Jupiter', 'Saturn', 'Mercury'];
const VIMSHOTTARI_PERIODS = { Ketu: 7, Venus: 20, Sun: 6, Moon: 10, Mars: 7, Rahu: 18, Jupiter: 16, Saturn: 19, Mercury: 17 };

const NAKSHATRA_LORDS = {
  "Ashwini": "Ketu", "Bharani": "Venus", "Krittika": "Sun", "Rohini": "Moon", "Mrigashira": "Mars", "Ardra": "Rahu", "Punarvasu": "Jupiter", "Pushya": "Saturn", "Ashlesha": "Mercury",
  "Magha": "Ketu", "Purva Phalguni": "Venus", "Uttara Phalguni": "Sun", "Hasta": "Moon", "Chitra": "Mars", "Swati": "Rahu", "Vishakha": "Jupiter", "Anuradha": "Saturn", "Jyeshtha": "Mercury",
  "Mula": "Ketu", "Purva Ashadha": "Venus", "Uttara Ashadha": "Sun", "Shravana": "Moon", "Dhanishta": "Mars", "Shatabhisha": "Rahu", "Purva Bhadrapada": "Jupiter", "Uttara Bhadrapada": "Saturn", "Revati": "Mercury"
};

const SIGN_LORDS = {
  Aries: "Mars", Taurus: "Venus", Gemini: "Mercury", Cancer: "Moon",
  Leo: "Sun", Virgo: "Mercury", Libra: "Venus", Scorpio: "Mars",
  Sagittarius: "Jupiter", Capricorn: "Saturn", Aquarius: "Saturn", Pisces: "Jupiter"
};

const SIGNS = ["Aries", "Taurus", "Gemini", "Cancer", "Leo", "Virgo", "Libra", "Scorpio", "Sagittarius", "Capricorn", "Aquarius", "Pisces"];

const EXALTATION_SIGNS = {
  Sun: "Aries", Moon: "Taurus", Mars: "Capricorn", Mercury: "Virgo", Jupiter: "Cancer", Venus: "Pisces", Saturn: "Libra"
};

const DEBILITATION_SIGNS = {
  Sun: "Libra", Moon: "Scorpio", Mars: "Cancer", Mercury: "Pisces", Jupiter: "Capricorn", Venus: "Virgo", Saturn: "Aries"
};

const OWN_SIGNS = {
  Sun: ["Leo"], Moon: ["Cancer"], Mars: ["Aries", "Scorpio"], Mercury: ["Gemini", "Virgo"], Jupiter: ["Sagittarius", "Pisces"], Venus: ["Taurus", "Libra"], Saturn: ["Capricorn", "Aquarius"]
};

function getNakshatraLord(nakshatraName) {
  if (!nakshatraName) return "Unknown";
  const cleanName = nakshatraName.split(" ")[0].trim();
  return NAKSHATRA_LORDS[cleanName] || "Unknown";
}

function getHouseSignAndLord(ascendant, houseNum) {
  let ascIdx = SIGNS.indexOf(ascendant);
  if (ascIdx === -1) ascIdx = 0;
  const sign = SIGNS[(ascIdx + houseNum - 1) % 12];
  return {
    sign,
    lord: SIGN_LORDS[sign]
  };
}

function getAbsoluteLongitude(p, name) {
  if (p.longitude !== undefined && p.longitude !== null) {
    return Number(p.longitude);
  }
  const signIdx = SIGNS.map(s => s.toLowerCase()).indexOf(String(p.sign || "Aries").toLowerCase());
  const deg = p.degree ?? 0;
  return (signIdx !== -1 ? signIdx : 0) * 30 + deg;
}

function getLongitudeDifference(lon1, lon2) {
  const diff = Math.abs(lon1 - lon2) % 360;
  return diff > 180 ? 360 - diff : diff;
}

function isPlanetCombust(planetName, planetLon, sunLon, isRetrograde) {
  if (planetName === "Sun" || planetName === "Rahu" || planetName === "Ketu" || planetName === "Ascendant") {
    return false;
  }
  const diff = getLongitudeDifference(planetLon, sunLon);
  const limits = { Moon: 12, Mars: 17, Mercury: isRetrograde ? 12 : 14, Jupiter: 11, Venus: isRetrograde ? 8 : 10, Saturn: 15 };
  const limit = limits[planetName];
  return limit ? diff <= limit : false;
}

function getPlanetaryStatus(name, p, sunLon) {
  if (name === "Ascendant") return "Direct";
  const statusParts = [];
  if (name !== "Sun" && name !== "Rahu" && name !== "Ketu") {
    if (p.isRetrograde) statusParts.push("Retrograde");
    else statusParts.push("Direct");
  } else if (name === "Rahu" || name === "Ketu") {
    statusParts.push("Retrograde");
  } else {
    statusParts.push("Direct");
  }
  if (sunLon !== null && name !== "Sun") {
    const planetLon = p.absoluteLongitude;
    if (isPlanetCombust(name, planetLon, sunLon, p.isRetrograde)) {
      statusParts.push("Combust");
    }
  }
  const sign = p.sign;
  if (EXALTATION_SIGNS[name] === sign) statusParts.push("Exalted");
  else if (DEBILITATION_SIGNS[name] === sign) statusParts.push("Debilitated");
  else if (OWN_SIGNS[name] && OWN_SIGNS[name].includes(sign)) statusParts.push("Own Sign");
  return statusParts.join(", ");
}

function getKeyPlanetPlacement(planetary, planetName) {
  const pName = String(planetName).toLowerCase();
  const planetsObj = planetary?.planets || {};
  const matchedKey = Object.keys(planetsObj).find(k => k.toLowerCase() === pName);
  if (matchedKey && planetsObj[matchedKey]) {
    const p = planetsObj[matchedKey];
    const houseMap = planetary?.planet_houses || {};
    return {
      sign: p.sign || "Unknown",
      degree: p.degree ?? (p.longitude !== undefined ? Number((p.longitude % 30).toFixed(1)) : 0),
      house: houseMap[matchedKey] || p.house || 1,
      isRetrograde: Boolean(p.is_retrograde || p.isRetrograde)
    };
  }
  return { sign: "Unknown", degree: 0, house: 1, isRetrograde: false };
}

function getHousePlanets(planetary) {
  const planetsObj = planetary?.planets || {};
  const planetHouses = planetary?.planet_houses || {};

  const housePlanets = {};
  for (let h = 1; h <= 12; h++) {
    housePlanets[h] = [];
  }

  Object.entries(planetsObj).forEach(([planetName, planetVal]) => {
    if (planetName.toLowerCase() === "ascendant") return;
    const h = planetHouses[planetName] || planetVal?.house;
    if (h >= 1 && h <= 12) {
      housePlanets[h].push(planetName);
    }
  });

  return housePlanets;
}

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

function getAshtakavargaSummary(kundli, ascendant) {
  let ascIdx = SIGNS.map(s => s.toLowerCase()).indexOf(String(ascendant).toLowerCase());
  if (ascIdx === -1) ascIdx = 0;

  const sav = kundli.ashtakvarga?.sav || [];

  const getScore = (houseNum) => {
    const signIdx = (ascIdx + houseNum - 1) % 12;
    if (Array.isArray(sav)) {
      const val = sav[signIdx];
      return typeof val === "number" ? val : (val?.points ?? 28);
    }
    return 28;
  };

  return {
    house1: getScore(1),
    house5: getScore(5),
    house7: getScore(7),
    house8: getScore(8),
    house11: getScore(11),
    house12: getScore(12)
  };
}

function buildPredesignedNarratives(kundli, userRequest) {
  const name = userRequest.fullName || "Seeker";

  const planetsObj = kundli.planetary?.planets || {};
  let ascendant = kundli?.basicDetails?.ascendant;
  if (typeof ascendant === "object" && ascendant !== null) ascendant = ascendant.sign;
  if (!ascendant) ascendant = kundli?.astroDetails?.ascendant?.sign || "Aries";

  const venus = planetsObj.Venus || planetsObj.venus || {};
  const venusSign = venus.sign || "Leo";
  const venusHouse = venus.house || 7;

  const moon = planetsObj.Moon || planetsObj.moon || {};
  const moonSign = moon.sign || "Sagittarius";
  const moonHouse = moon.house || 11;

  const sevenHouseDetails = getHouseSignAndLord(ascendant, 7);
  const seventhHouseSign = sevenHouseDetails.sign;
  const seventhLord = sevenHouseDetails.lord;
  const seventhLordPlacement = getKeyPlanetPlacement(kundli.planetary, seventhLord);
  const seventhLordSign = seventhLordPlacement.sign;
  const seventhLordHouse = seventhLordPlacement.house;

  const housePlanets = getHousePlanets(kundli.planetary);
  const activePlanetsIn7th = housePlanets[7] || [];
  const seventhHousePlanetsStr = activePlanetsIn7th.length > 0
    ? `planetary presence of ${activePlanetsIn7th.join(" and ")}`
    : "no direct planetary interference in the house itself";

  let mahadasha = "Unknown";
  let antardasha = "Unknown";
  try {
    const dashaData = extractDashaData(kundli);
    mahadasha = dashaData.mahadasha || "Unknown";
    antardasha = dashaData.antardasha || "Unknown";
  } catch (err) {
    console.error("[LoveReportService] Error extracting dasha for intros:", err);
  }

  let lagnaStyle = "passion and determination";
  if (["Taurus", "Virgo", "Capricorn"].includes(ascendant)) lagnaStyle = "stability, realism, and long-term security";
  if (["Gemini", "Libra", "Aquarius"].includes(ascendant)) lagnaStyle = "intellect, communication, and social connection";
  if (["Cancer", "Scorpio", "Pisces"].includes(ascendant)) lagnaStyle = "deep emotional sensitivity and intuition";

  return {
    loveDnaIntro: `Welcome, ${name}, to your personalized Love DNA analysis. In Vedic astrology, your emotional makeup and romantic wiring are mapped by the alignments of your Ascendant, Venus, and the Moon. Your Ascendant in ${ascendant} governs your outer personality and approach to relationships, bringing a natural focus on ${lagnaStyle}. Your Venus is placed in the expressive sign of ${venusSign} in your ${venusHouse} house, which rules your core attraction patterns and the way you seek harmony. Supported by your Moon in ${moonSign} in the ${moonHouse} house, which signifies your deepest emotional mind and unconscious relationship needs, this chapter decodes how you express affection, handle romantic challenges, and build heart-level bonds.`,
    pastLoveIntro: `Every emotional transition in our life serves as a stepping stone toward conscious relationships. In your birth chart, the relationship sector is governed by the Seventh House, which falls in the sign of ${seventhHouseSign} with ${seventhHousePlanetsStr}. The lord of this house, ${seventhLord}, is placed in the sign of ${seventhLordSign} in the ${seventhLordHouse} house. This astrological configuration, combined with the placement of Mars and key karmic nodes (Rahu-Ketu), governs how you navigate early attachments, the pain of separations, and attachment styles. This chapter explores the karmic lessons of your past connections, outlining how early love patterns have shaped your emotional resilience and capacity for intimacy.`,
    presentLoveIntro: `Love is deeply subject to timing, and the planetary cycles you are currently running dictate your current emotional capacity and relationship readiness. You are currently in the ${mahadasha} Mahadasha and ${antardasha} Antardasha. This dasha combination influences how you process your feelings, what you seek in a partner, and whether you are currently carrying subconscious defensive blocks. By evaluating these timing cycles alongside your Moon in ${moonSign}, this chapter diagnoses your present readiness, detailing how to dissolve current emotional boundaries and welcome authentic partnerships.`,
    futureLoveDirection: `Vedic astrology is a compass that points toward the natural unfoldment of your destiny. The future of your romantic journey is shaped by upcoming Vimshottari cycles and transits, which highlight the timing of romantic manifestation. In this section, we analyze your relationship-oriented houses to forecast when and how love is destined to enter your life. We outline the cosmic blueprint of the partner you are meant to attract, the long-term path of your future marriage or commitment, and how you can establish a healthy, sustainable relationship that fulfills the celestial promises in your chart.`,
    summaryIntro: `A complete romantic journey is not merely about finding a companion, but about the evolution of your own consciousness through partnership. This final chapter integrates the insights from your Love DNA, the lessons of your past attachments, your current readiness, and future paths to fulfillment into a singular, unified roadmap. Grounded in your ${ascendant} Ascendant and your ${venusSign} Venus placement, this complete journey analysis serves as a self-explanatory guide for building healthy, conscious, and lasting love.`
  };
}

function buildLoveRelationshipPayload(kundli, userRequest) {
  const dashaSummary = extractDashaData(kundli, new Date());

  let ascendant = kundli?.basicDetails?.ascendant;
  if (typeof ascendant === "object" && ascendant !== null) ascendant = ascendant.sign;
  if (!ascendant) ascendant = kundli?.astroDetails?.ascendant?.sign || "Aries";

  const planetsObj = kundli.planetary?.planets || {};
  const moonSign = planetsObj.Moon?.sign || planetsObj.moon?.sign || "Sagittarius";
  const sunSign = planetsObj.Sun?.sign || planetsObj.sun?.sign || "Aries";
  const nakshatra = kundli?.astroDetails?.nakshatra || "Mula";
  const nakshatraLord = getNakshatraLord(nakshatra);

  const venusPl = getKeyPlanetPlacement(kundli.planetary, "Venus");
  const moonPl = getKeyPlanetPlacement(kundli.planetary, "Moon");
  const marsPl = getKeyPlanetPlacement(kundli.planetary, "Mars");
  const jupiterPl = getKeyPlanetPlacement(kundli.planetary, "Jupiter");
  const rahuPl = getKeyPlanetPlacement(kundli.planetary, "Rahu");
  const ketuPl = getKeyPlanetPlacement(kundli.planetary, "Ketu");

  const relationshipHouses = {};
  const housePlanets = getHousePlanets(kundli.planetary);
  const targetHouses = [1, 5, 7, 8, 11, 12];

  targetHouses.forEach(h => {
    const details = getHouseSignAndLord(ascendant, h);
    const planetsInHouse = housePlanets[h] || [];
    relationshipHouses[`house${h}`] = {
      sign: details.sign,
      lord: details.lord,
      planets: planetsInHouse
    };
  });

  const ashtakvargaSummary = getAshtakavargaSummary(kundli, ascendant);

  let age = 25;
  if (userRequest.dateOfbirth) {
    age = new Date().getFullYear() - new Date(userRequest.dateOfbirth).getFullYear();
  }

  const activeYogas = (Array.isArray(kundli.yogas) ? kundli.yogas : [])
    .slice(0, 3)
    .map(y => ({
      name: y.name || "Relationship Yoga",
      strength: y.strength || "medium",
      effect: y.effects || y.description || "emotional compatibility"
    }));

  return {
    reportType: "love_and_relationship",
    language: "en",
    style: {
      tone: "premium, compassionate, self-explanatory, simple English",
      depth: "highly personalized, strictly kundli-based, avoiding generic statements"
    },
    client: {
      name: userRequest.fullName,
      age,
      gender: userRequest.gender
    },
    astrology: {
      ascendant,
      moonSign,
      sunSign,
      nakshatra,
      nakshatraLord,
      currentDasha: {
        mahadasha: dashaSummary.mahadasha || "Unknown",
        antardasha: dashaSummary.antardasha || "Unknown",
        start: dashaSummary.antarStart || dashaSummary.mahaStart || "",
        end: dashaSummary.antarEnd || dashaSummary.mahaEnd || ""
      },
      placements: {
        venus: venusPl,
        moon: moonPl,
        mars: marsPl,
        jupiter: jupiterPl,
        rahu: rahuPl,
        ketu: ketuPl
      },
      relationshipHouses,
      ashtakvarga: ashtakvargaSummary,
      yogas: activeYogas,
      manglikStatus: {
        isManglik: kundli.manglikAnalysis?.is_manglik || false,
        score: kundli.manglikAnalysis?.manglik_present_36_prop ?? 0
      }
    }
  };
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

/**
 * Calls the OpenAI API using createChatCompletion and retrieves relationship analysis predictions.
 * Employs chart synthesis, scenario-based storytelling, deep psychology, and customized formatting markup.
 */
async function generateLoveRelationshipReportContent(reportPayload, userId) {
  const prompt = `You are an elite Vedic relationship astrologer. Generate a highly detailed, premium, and structured Love & Relationship Report based on the provided astrological data.

=========================================
LOVE REPORT INPUT DATA (JSON):
${JSON.stringify(reportPayload)}
=========================================
CRITICAL WRITING INSTRUCTIONS:
1. Tone must be highly premium, elite, professional, compassionate, and emotionally resonant. Write as a warm, conversational astrologer, speaking directly to the native.
2. Use simple, clear, elegant English that reaches the native's heart naturally. Address the native by first name (e.g. Satish) in the opening paragraph of each section.
3. GROUND & SYNTHESIZE: Do not describe single placements in isolation (e.g., do not say "Venus in Leo means X"). Instead, explain how placements interact (e.g. Venus, Moon, Ascendant, 7th lord, Navamsa placement, and current Dasha collectively create a relationship pattern).
4. PSYCHOLOGY OVER ASTROLOGY: Focus on emotional reality, decision-making, conflict resolution, communication style, trust building, expectations, attachment tendencies, and emotional maturity. Astrology is the reasoning behind the insight, not the main focus of the writing.
5. SCENARIO-BASED STORYTELLING: Paint vivid, realistic relationship situations (e.g., first dates, reacting to arguments, partner distance, how they apologize/forgive).
6. NO BOXES, NO GAUGES, NO SCORECARDS, NO BULLETS: Avoid using different colored boxes, emoji characters, checklists, progress bars, or structured cards. Use clean, flowing paragraphs to keep the document looking handcrafted and professional.
7. Return STRICT JSON matching the expected structure. Do not wrap the JSON in markdown code blocks or add any text outside of the JSON object.
8. Each narrative field must be divided into exactly 4 to 5 long, detailed, and beautifully written paragraphs separated by double newlines (\\n\\n) to ensure high readability.
9. STRICTLY FOR ALL FAQ ANSWERS (faqMarriageType, faqPartnerMeetingTiming, faqMarriageDelays, faqPartnerDescription, faqHowWhereMeet, faqMarriageHappiness, faqRelationshipsBeforeMarriage, faqPartnerOrigin, faqFamilySupport, faqStrengthsWeaknessesFlags, faqFavorablePeriods, faqKarmicLessonsChanges):
   - You MUST write answers strictly based on the native's Kundli.
   - NO general or vague answers. Do not use phrases like "Vedic astrology has many factors" or "It depends on various planetary dynamics."
   - Provide concrete answers by explicitly referencing specific planetary placements, signs, houses, or running dashas from the input data (e.g., "Because your 7th lord Venus is placed in the 9th house in Taurus...", "Your current Jupiter Mahadasha indicates...", "Saturn's aspect on your 7th house indicates...").
   - Each answer must be between 2 and 4 sentences. Make them compact, direct, complete, and highly personalized.

WORD COUNT TARGETS:
- loveDNAEmotionalWiring: 700-850 words. Deepest psychological chapter. How Venus defines romantic expression, how the Moon governs emotional responses, how the Ascendant influences attraction, and how these combine to create a unique love identity. Cover romantic instincts, emotional energy, preferred love language, attachment tendencies, ideal partner qualities, and internal contradictions. Include practical everyday relationship examples.
- howYouExpressLove: 500-650 words. Describe how affection is shown through words, actions, attention, loyalty, physical closeness, and emotional support. Explain communication style during attraction, how flirting develops, whether the individual usually initiates or waits, and how behavior changes after commitment. Discuss how they react during disagreements, how they rebuild trust, and what kind of partner allows natural expression. Include several realistic relationship situations.
- emotionalVulnerability: 550-700 words. Focus on emotional wounds. What hurts most, situations that create insecurity, biggest emotional triggers, fears surrounding rejection, abandonment, betrayal, and being misunderstood. Discuss emotional defense mechanisms.
- relationshipShadow: 500-650 words. Explore unconscious relationship patterns creating repeated difficulties. Discuss self-sabotage, overthinking, emotional withdrawal, unhealthy expectations, pride, jealousy, possessiveness, avoidance, trust issues, and communication habits that damage intimacy. Explain how these patterns develop and what signs warn you of this state.
- karmicLoveLessons: 450-600 words. Discuss karmic relationships, unfinished emotional lessons, repeating patterns, unresolved emotional debts, and why similar people repeatedly enter the reader's life. Explain what the soul is learning through relationships.
- firstLoveEnergy: 350-500 words. Describe emotional awakening, early romantic experiences, the purpose of first love, the lessons learned through first heartbreak, and how those experiences continue influencing current relationship choices.
- attachmentStyle: 450-550 words. Identify the dominant attachment style and explain why it develops astrologically. Describe secure, anxious, avoidant, and fearful-avoidant tendencies, highlighting which are strongest.
- currentLoveReadiness: 450-600 words. Assess emotional preparedness for a serious relationship. Discuss emotional availability, heart-versus-mind conflicts, readiness for commitment.
- currentEmotionalBlocks: 450-600 words. Explain current emotional obstacles from planetary influences — Saturn delays, Rahu confusion, Moon instability, Venus weaknesses, Ketu detachment. Explain how these combine to affect trust, vulnerability, commitment, expectations, and emotional clarity today.
- whatLoveMeansNow: 300-450 words. Focus entirely on present psychology. What kind of relationship the reader truly wants at this stage of life, how expectations have changed over time, and whether they currently seek adventure, emotional safety, companionship, marriage, or soulmate-level intimacy.
- soulmatProfile: 700-850 words. Richest chapter. Describe the destined partner's appearance, personality, communication style, emotional maturity, career tendencies, values, strengths, weaknesses, lifestyle, family background, love language, approximate age difference, and the emotional dynamic between the two. Explain why these characteristics complement the reader's chart.
- whereYoullMeet: 300-400 words. Discuss environments most likely to introduce an important partner — education, work, travel, social circles, family connections, online platforms, spiritual settings, or foreign locations. Explain reasoning from the overall chart.
- soulmateCompatibility: 500-650 words. Evaluate emotional compatibility, friendship, communication, trust, physical chemistry, family life, long-term commitment, and marriage potential.
- greenFlags: 250-350 words. Present behaviors, values, communication styles, and personality traits the reader should actively seek. Ground each flag in their birth chart using natural paragraph flow.
- redFlags: 250-350 words. Warning signs deserving caution presented as natural text. Ground each flag in their birth chart using natural paragraph flow.
- marriageDestiny: 500-650 words. Discuss the overall marriage pattern, timing tendencies, likelihood of love or arranged marriage, possibility of delay, maturity required before marriage, and the general emotional purpose of married life. Avoid absolute predictions.
- marriedLife: 600-800 words. Describe daily married life, communication patterns, finances, intimacy, parenting tendencies, family dynamics, conflict resolution, emotional support, and long-term companionship.
- spousePersonality: 600-800 words. Explore the destined spouse's personality, career, habits, emotional style, values, and lifestyle in rich detail.
- loveSummary: 400-500 words. Synthesize the entire report into a single cohesive narrative about the native's complete love journey — past patterns, present state, and future direction.
- faqMarriageType: 2-4 sentences. Will I Have a Love Marriage, Arranged Marriage, or Love-Cum-Arranged Marriage? Provide a clear answer strictly based on the Kundli data (e.g. 5th, 7th, 9th houses and their lords).
- faqPartnerMeetingTiming: 2-4 sentences. When Am I Most Likely to Meet My Life Partner and Get Married? Provide a timing forecast referencing the current or upcoming Vimshottari dasha/antardasha or major transits (Jupiter/Saturn).
- faqMarriageDelays: 2-4 sentences. Will There Be Any Delays or Major Obstacles in My Marriage? Answer strictly based on the placements of Saturn, Rahu, Ketu, or retrogrades impacting the 7th house or its lord.
- faqPartnerDescription: 2-4 sentences. What Kind of Person Will My Future Partner Be? Describe personality, values, career, and appearance traits based on the 7th house and D9 Navamsa placements.
- faqHowWhereMeet: 2-4 sentences. How and Where Am I Most Likely to Meet My Future Partner? Give specific likely settings (workplace, social settings, travel, online, etc.) based on the 7th lord's house placement.
- faqMarriageHappiness: 2-4 sentences. Will My Marriage Be Happy, Stable, and Emotionally Fulfilling? Evaluate the strength of the 7th house, Jupiter, Venus, and D9 dynamics.
- faqRelationshipsBeforeMarriage: 2-4 sentences. Will I Have More Than One Serious Relationship Before Marriage? Answer based on the 5th house, Venus, and Rahu influences.
- faqPartnerOrigin: 2-4 sentences. Will My Partner Be From My City, Another State, Abroad, or a Different Community? Evaluate using 7th, 9th, and 12th house placements.
- faqFamilySupport: 2-4 sentences. Will My Family Support My Relationship and Marriage Decisions? Evaluate based on the 2nd and 4th houses and their lords.
- faqStrengthsWeaknessesFlags: 2-4 sentences. What Are My Biggest Relationship Strengths, Weaknesses, and the Green & Red Flags I Should Watch For? Give specific Kundli-based advice.
- faqFavorablePeriods: 2-4 sentences. What Are the Most Favorable Time Periods for Love, Commitment, Engagement, and Marriage? Reference favorable transits and dasha phases.
- faqKarmicLessonsChanges: 2-4 sentences. What Important Karmic Lessons and Life Changes Will My Marriage Bring? Discuss life-altering changes referencing Rahu, Ketu, or Saturn's connection to the 7th house or lord.

EXPECTED JSON SCHEMA:
{
  "loveDNAEmotionalWiring": "string (700-850 words, Your Love DNA deep psychological analysis divided into 4-5 paragraphs)",
  "howYouExpressLove": "string (500-650 words, How You Express Love narrative divided into 4-5 paragraphs)",
  "emotionalVulnerability": "string (550-700 words, Emotional Vulnerability analysis divided into 4-5 paragraphs)",
  "relationshipShadow": "string (500-650 words, Relationship Shadow analysis divided into 4-5 paragraphs)",
  "karmicLoveLessons": "string (450-600 words, Karmic Love Lessons analysis divided into 4-5 paragraphs)",
  "firstLoveEnergy": "string (350-500 words, First Love Energy narrative divided into 4-5 paragraphs)",
  "attachmentStyle": "string (450-550 words, Attachment Style analysis divided into 4-5 paragraphs)",
  "currentLoveReadiness": "string (450-600 words, Current Love Readiness analysis divided into 4-5 paragraphs)",
  "currentEmotionalBlocks": "string (450-600 words, Current Emotional Blocks analysis divided into 4-5 paragraphs)",
  "whatLoveMeansNow": "string (300-450 words, What Love Means To You Now divided into 4-5 paragraphs)",
  "soulmatProfile": "string (700-850 words, Destined partner profile divided into 4-5 paragraphs)",
  "whereYoullMeet": "string (300-400 words, Where You'll Meet narrative divided into 4-5 paragraphs)",
  "soulmateCompatibility": "string (500-650 words, Compatibility analysis divided into 4-5 paragraphs)",
  "greenFlags": "string (250-350 words, Green Flags narrative divided into 3-4 paragraphs)",
  "redFlags": "string (250-350 words, Red Flags narrative divided into 3-4 paragraphs)",
  "marriageDestiny": "string (500-650 words, Marriage Destiny pattern divided into 4-5 paragraphs)",
  "marriedLife": "string (600-800 words, Married Life daily dynamics divided into 4-5 paragraphs)",
  "spousePersonality": "string (600-800 words, Destined spouse detailed profile divided into 4-5 paragraphs)",
  "loveSummary": "string (400-500 words, Complete Love Journey synthesis divided into 4-5 paragraphs)",
  "faqMarriageType": "string (2-4 sentences, Will I Have a Love Marriage, Arranged Marriage, or Love-Cum-Arranged Marriage?)",
  "faqPartnerMeetingTiming": "string (2-4 sentences, When Am I Most Likely to Meet My Life Partner and Get Married?)",
  "faqMarriageDelays": "string (2-4 sentences, Will There Be Any Delays or Major Obstacles in My Marriage?)",
  "faqPartnerDescription": "string (2-4 sentences, What Kind of Person Will My Future Partner Be?)",
  "faqHowWhereMeet": "string (2-4 sentences, How and Where Am I Most Likely to Meet My Future Partner?)",
  "faqMarriageHappiness": "string (2-4 sentences, Will My Marriage Be Happy, Stable, and Emotionally Fulfilling?)",
  "faqRelationshipsBeforeMarriage": "string (2-4 sentences, Will I Have More Than One Serious Relationship Before Marriage?)",
  "faqPartnerOrigin": "string (2-4 sentences, Will My Partner Be From My City, Another State, Abroad, or a Different Community?)",
  "faqFamilySupport": "string (2-4 sentences, Will My Family Support My Relationship and Marriage Decisions?)",
  "faqStrengthsWeaknessesFlags": "string (2-4 sentences, What Are My Biggest Relationship Strengths, Weaknesses, and the Green & Red Flags I Should Watch For?)",
  "faqFavorablePeriods": "string (2-4 sentences, What Are the Most Favorable Time Periods for Love, Commitment, Engagement, and Marriage?)",
  "faqKarmicLessonsChanges": "string (2-4 sentences, What Important Karmic Lessons and Life Changes Will My Marriage Bring?)"
}
`;

  const startTime = Date.now();
  const response = await createChatCompletion(
    {
      model: CHAT_MODEL,
      messages: [
        {
          role: "system",
          content: "You are an elite Vedic relationship astrologer. Return strict JSON reports with detailed narrative fields. Ground everything in planetary placements. No emojis. Do not wrap response in markdown code blocks. Follow word count targets precisely."
        },
        {
          role: "user",
          content: prompt
        }
      ],
      temperature: 0.72,
      max_tokens: 16000,
      response_format: { type: "json_object" }
    },
    { feature: "love_relationship_report_generation", userId }
  );

  const content = response?.choices?.[0]?.message?.content?.trim();
  if (!content) {
    throw new Error("No relationship report response returned from OpenAI Client");
  }

  console.log(`[LoveReportService] Input Character Count: ${prompt.length}`);
  console.log(`[LoveReportService] Output Character Count: ${content.length}`);

  const cleanedContent = cleanJsonResponse(content);

  try {
    const data = JSON.parse(cleanedContent);
    return data;
  } catch (err) {
    console.error("[LoveReportService] Failed to parse GPT response:", content);
    throw new Error(`Invalid JSON returned by OpenAI model: ${err.message}`);
  }
}

async function generateLoveRelationshipReport(kundli, userRequest) {
  const reportInput = buildLoveRelationshipPayload(kundli, userRequest);
  const reportData = await generateLoveRelationshipReportContent(reportInput, userRequest.userId);
  const predesignedNarratives = buildPredesignedNarratives(kundli, userRequest);

  const bPlanets = kundli.planetary || {};
  const sunPl = getKeyPlanetPlacement(bPlanets, "Sun");
  const sunL = sunPl ? getAbsoluteLongitude(sunPl, "Sun") : null;
  const PLANET_NAMES = ["Sun", "Moon", "Mars", "Mercury", "Jupiter", "Venus", "Saturn", "Rahu", "Ketu"];

  const birthPlanetaryTable = PLANET_NAMES.map(name => {
    const p = getKeyPlanetPlacement(bPlanets, name);
    p.absoluteLongitude = getAbsoluteLongitude(p, name);
    const status = getPlanetaryStatus(name, p, sunL);
    return {
      planet: name,
      sign: p.sign,
      house: p.house,
      degree: p.degree,
      isRetrograde: p.isRetrograde,
      status: status
    };
  });

  let rasiChart = kundli.charts?.D1 || null;
  let navamsaChart = kundli.charts?.D9 || null;

  if (!rasiChart || !navamsaChart) {
    console.log("[LoveReportService] Missing D1 or D9 charts from DB, calling getAllCharts...");
    try {
      const allDivisional = await getAllCharts(userRequest);
      if (allDivisional) {
        if (!rasiChart) rasiChart = allDivisional.D1 || allDivisional.rasi || null;
        if (!navamsaChart) navamsaChart = allDivisional.D9 || allDivisional.navamsa || null;
      }
    } catch (err) {
      console.error("[LoveReportService] Failed to fetch divisional charts on fallback:", err.message);
    }
  }

  const finalReportObj = {
    reportInput,
    predictions: {
      ...reportData,
      introductions: predesignedNarratives
    },
    predesignedNarrative: predesignedNarratives,
    personalInformation: {
      fullName: userRequest.fullName,
      dateOfbirth: userRequest.dateOfbirth,
      timeOfbirth: userRequest.timeOfbirth,
      placeOfBirth: userRequest.placeOfBirth,
      gender: userRequest.gender
    },
    astrologyBasics: {
      ascendant: reportInput.astrology.ascendant,
      moonSign: reportInput.astrology.moonSign,
      sunSign: reportInput.astrology.sunSign,
      nakshatra: reportInput.astrology.nakshatra,
      nakshatraLord: reportInput.astrology.nakshatraLord,
      mahadasha: reportInput.astrology.currentDasha?.mahadasha || "Unknown",
      antardasha: reportInput.astrology.currentDasha?.antardasha || "Unknown",
      allDashas: calculateAllDashas(kundli.dasha)
    },
    birthPlanetaryTable,
    horoscopeCharts: {
      rasiChart,
      navamsaChart,
    }
  };





  return finalReportObj;
}

module.exports = {
  buildLoveRelationshipPayload,
  generateLoveRelationshipReportContent,
  generateLoveRelationshipReport,
  buildPredesignedNarratives
};
