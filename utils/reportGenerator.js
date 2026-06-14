const { createChatCompletion } = require("../services/openaiClient");

const CHAT_MODEL = process.env.OPENAI_CHAT_MODEL || "gpt-4o-mini";

const GENERAL_REPORT_CONFIG = {
  temperature: 0.52,
  maxTokens: 4200,
  minSentencesPerSection: 5,
  maxSentencesPerSection: 8,
  enableDetailedLogging: true,
  enablePayloadValidation: true,
  fallbackMode: "enhanced",
  version: "2.1.0",
  supportedSigns: [
    "Aries", "Taurus", "Gemini", "Cancer", "Leo", "Virgo",
    "Libra", "Scorpio", "Sagittarius", "Capricorn", "Aquarius", "Pisces"
  ],
  elementMap: {
    Aries: "Fire", Taurus: "Earth", Gemini: "Air", Cancer: "Water",
    Leo: "Fire", Virgo: "Earth", Libra: "Air", Scorpio: "Water",
    Sagittarius: "Fire", Capricorn: "Earth", Aquarius: "Air", Pisces: "Water"
  },
  modalityMap: {
    Aries: "Cardinal", Taurus: "Fixed", Gemini: "Mutable", Cancer: "Cardinal",
    Leo: "Fixed", Virgo: "Mutable", Libra: "Cardinal", Scorpio: "Fixed",
    Sagittarius: "Mutable", Capricorn: "Cardinal", Aquarius: "Fixed", Pisces: "Mutable"
  }
};



function getSizeKB(obj) {
  try {
    return (Buffer.byteLength(JSON.stringify(obj || {}), 'utf8') / 1024).toFixed(2);
  } catch (e) {
    return "0.00";
  }
}

function safeStringify(obj, fallback = "{}") {
  try {
    return JSON.stringify(obj || {}, null, 2);
  } catch (e) {
    return fallback;
  }
}

function buildEnhancedLoggingContext(baseContext = {}) {
  return {
    feature: baseContext.feature || "general_details_ai",
    timestamp: new Date().toISOString(),
    serviceVersion: GENERAL_REPORT_CONFIG.version,
    ...baseContext
  };
}

function validateKundliData(kundli) {
  if (!kundli) return { valid: false, reason: "No kundli object provided" };
  
  const hasBasic = !!(kundli.basicDetails || kundli.horoscope);
  const hasPlanetary = !!(kundli.planetary && Object.keys(kundli.planetary).length > 0);
  
  return {
    valid: hasBasic || hasPlanetary,
    reason: hasBasic || hasPlanetary ? "OK" : "Missing basicDetails/horoscope and planetary data",
    hasBasic,
    hasPlanetary
  };
}

function getElementFromSign(sign) {
  if (!sign) return "Unknown";
  return GENERAL_REPORT_CONFIG.elementMap[sign] || "Unknown";
}

function getModalityFromSign(sign) {
  if (!sign) return "Unknown";
  return GENERAL_REPORT_CONFIG.modalityMap[sign] || "Unknown";
}

function calculateDominantElement(payload) {
  try {
    const signs = [];
    if (payload.ascendant) signs.push(payload.ascendant);
    if (payload.moonSign) signs.push(payload.moonSign);
    if (payload.sunSign) signs.push(payload.sunSign);
    
    if (payload.planetary && Array.isArray(payload.planetary)) {
      payload.planetary.forEach(p => {
        if (p.sign) signs.push(p.sign);
      });
    }
    
    const elementCount = { Fire: 0, Earth: 0, Air: 0, Water: 0 };
    signs.forEach(s => {
      const el = getElementFromSign(s);
      if (elementCount[el] !== undefined) elementCount[el]++;
    });
    
    let dominant = "Balanced";
    let maxCount = 0;
    Object.keys(elementCount).forEach(el => {
      if (elementCount[el] > maxCount) {
        maxCount = elementCount[el];
        dominant = el;
      }
    });
    
    return { dominant, counts: elementCount, totalSigns: signs.length };
  } catch (e) {
    return { dominant: "Unknown", counts: {}, totalSigns: 0 };
  }
}

// ==================== buildGeneralPayload ====================

function buildGeneralPayload({ basicDetails, astroDetails, planetary }) {
  const ascendantSign = 
    basicDetails?.ascendant?.sign || 
    astroDetails?.ascendant?.sign || 
    basicDetails?.ascendant || 
    astroDetails?.ascendant || 
    "Unknown";

  const sunSign = 
    basicDetails?.sun_sign || 
    astroDetails?.sun_sign || 
    "Unknown";

  const moonSign = 
    basicDetails?.moon_sign || 
    astroDetails?.moon_sign || 
    "Unknown";

  const dominantInfo = calculateDominantElement({
    ascendant: ascendantSign,
    moonSign: moonSign,
    sunSign: sunSign,
    planetary: planetary || []
  });

  return {
    ascendant: ascendantSign,
    sunSign: sunSign,
    moonSign: moonSign,
    planetary: Array.isArray(planetary) ? planetary : [],
    dominantElement: dominantInfo.dominant,
    elementCounts: dominantInfo.counts
  };
}

// ==================== FALLBACK FUNCTIONS ====================

function fallbackGeneralDetails(payload) {
  const asc = payload?.ascendant || "your sign";
  const moon = payload?.moonSign || "your moon sign";
  const sun = payload?.sunSign || "your sun sign";

  return {
    description: `The Ascendant represents the lens through which you experience and interact with the world. Your Ascendant is ${asc}. This placement sets the fundamental tone of your personality and life approach. Combined with your Moon in ${moon} and Sun in ${sun}, it creates a unique signature that influences how you present yourself and navigate daily life. The interplay between these core placements forms the foundation of your personal expression.`,

    personality: `Your personality emerges from the dynamic interaction between your ${asc} Ascendant, ${moon} Moon, and ${sun} Sun. This combination creates both strengths and interesting internal tensions that make you who you are. You likely experience moments where different parts of your nature pull in slightly different directions, which ultimately leads to growth and self-awareness. The way these energies blend gives you a distinctive approach to challenges and relationships.`,

    physical: `Your overall presence and energetic signature are shaped by the combination of your Ascendant and the planetary influences present in your chart. You tend to project an aura that reflects both the initiative of your rising sign and the emotional tone of your Moon. Others often perceive you as having a distinctive quality that combines vitality with a certain depth or thoughtfulness, depending on the specific mix of placements.`,

    health: `Maintaining balance across the different elemental and modal qualities in your chart supports overall well-being. Paying attention to routines that honor both your need for activity and your need for emotional grounding tends to be beneficial. Simple, consistent self-care practices that align with your natural rhythms can make a meaningful difference in how you feel on a daily basis.`,

    career: `Professionally, you are likely to thrive in environments that allow you to use both your natural initiative and your capacity for thoughtful analysis. Roles that offer a mix of independence and meaningful collaboration often suit the blend of energies in your chart. Your unique combination of placements suggests you bring both vision and practicality to your work.`,

    relationship: `In relationships, you seek a balance between connection and personal space. Your emotional needs and your way of relating are influenced by the interaction of your Moon and Ascendant energies. You tend to value both intellectual or spiritual compatibility and emotional safety. The way you give and receive love reflects the complex but harmonious mix of your core placements.`
  };
}

async function generateGeneralDetails(kundli, context = {}) {
  const totalStartTime = Date.now();

  if (!kundli) {
    console.error("[ERROR] No kundli provided to generateGeneralDetails\n");
    return null;
  }

  if (GENERAL_REPORT_CONFIG.enablePayloadValidation) {
    const validation = validateKundliData(kundli);
    if (!validation.valid) {
      console.warn("[VALIDATION] Proceeding with limited data:", validation.reason);
    }
  }

  try {
    let minimalPlanetary = [];
    if (kundli.planetary && kundli.planetary.planets) {
      minimalPlanetary = Object.values(kundli.planetary.planets)
        .filter(p => p.planet && p.sign)
        .map(p => ({
          planet: p.planet,
          sign: p.sign,
          house: kundli.planetary.planet_houses?.[p.planet] || p.house || "Unknown",
          is_retrograde: Boolean(p.is_retrograde)
        }));
    }

    const payload = buildGeneralPayload({
      basicDetails: kundli.basicDetails,
      astroDetails: kundli.horoscope,
      planetary: minimalPlanetary,
    });

    if (!process.env.OPENAI_API_KEY) {
      return fallbackGeneralDetails(payload);
    }

    const loggingContext = buildEnhancedLoggingContext({
      feature: "general_details_ai",
      ...context
    });

    const systemPrompt = `You are a master Vedic astrologer writing premium General Profile reports that feel written for one specific person.

CORE RULES — FOLLOW STRICTLY:

1. Output ONLY valid JSON. No markdown or extra text.

2. Every section must have 6–8 rich, flowing sentences in premium Indian English.

3. **MULTI-FACTOR SYNTHESIS (MANDATORY)**
   - Never base any conclusion on a single placement.
   - Every important statement must be supported by the interaction of **at least 3 factors** from the payload.
   - Use clear cause-and-effect language.

4. **HOUSE-DOMAIN REASONING (CONCEPTUAL)**
   - Career section: Reason primarily through 10th house themes.
   - Relationship section: Reason primarily through 7th house themes.
   - Health & Personality: Use 1st and 6th house logic.

5. **INTEGRATE RETROGRADE PLANETS PROPERLY**
   - When Jupiter, Rahu, or Ketu appear (especially retrograde), explain their specific role and impact.

6. **IDENTIFY & WEAVE DOMINANT THEMES**
   - Identify 2–3 dominant themes from this specific combination of placements and weave them consistently.

7. **HIGHLIGHT INTERNAL TENSIONS & CONTRADICTIONS**
   - Actively point out contradictions created by the chart.

8. **PERSON-CENTRIC LANGUAGE ONLY**
   - Do NOT explain what any sign "generally means".
   - Every sentence must describe how it shows up in this person's actual life.

9. **CURRENT LIFE FEEL**
   - Make the report feel relevant to the present.

10. Before writing any section, internally map dominant themes and supporting factors.

REQUIRED JSON SCHEMA:
{
  "description": "string (6-8 flowing sentences)",
  "personality": "string (6-8 flowing sentences)",
  "physical": "string (6-8 flowing sentences — energy, presence & aura only)",
  "health": "string (6-8 flowing sentences — wellness focused)",
  "career": "string (6-8 flowing sentences — 10th house logic)",
  "relationship": "string (6-8 flowing sentences — 7th house logic)"
}

Now generate the report for the payload below.`;

    const userPrompt = `Generate the General Profile report for this exact payload following all the critical rules above. Use multi-factor causal reasoning, house-domain thinking, and weave dominant themes. Return ONLY the JSON object.

Payload:
${JSON.stringify(payload)}`;

    const completion = await createChatCompletion({
      model: CHAT_MODEL,
      messages: [
        { role: "system", content: systemPrompt },
        { role: "user", content: userPrompt },
      ],
      temperature: GENERAL_REPORT_CONFIG.temperature,
      max_tokens: GENERAL_REPORT_CONFIG.maxTokens,
      response_format: { type: "json_object" },
    }, loggingContext);

    const content = completion.choices[0]?.message?.content;

    if (!content) {
      return fallbackGeneralDetails(payload);
    }

    let parsed;
    try {
      parsed = JSON.parse(content);
    } catch (err) {
      const start = content.indexOf("{");
      const end = content.lastIndexOf("}");
      if (start !== -1 && end !== -1 && end > start) {
        parsed = JSON.parse(content.slice(start, end + 1));
      } else {
        console.error("[GeneralDetailsAI] Invalid JSON in LLM output:", err?.message || err);
        return fallbackGeneralDetails(payload);
      }
    }

    return parsed;

  } catch (error) {
    console.error("[GeneralDetailsAI] Error generating general details:", error?.message || error);
    try {
      const payload = buildGeneralPayload({
        basicDetails: kundli.basicDetails,
        astroDetails: kundli.horoscope,
      });
      return fallbackGeneralDetails(payload);
    } catch {
      return null;
    }
  }
}

// ==================== VIMSHOTTARI DASHA FUNCTIONS ====================

function formatToDDMMYYYY(dateStr) {
  if (!dateStr) return "";
  try {
    const date = new Date(dateStr);
    if (isNaN(date.getTime())) return dateStr;

    const day = String(date.getDate()).padStart(2, "0");
    const month = String(date.getMonth() + 1).padStart(2, "0");
    const year = date.getFullYear();

    return `${day}-${month}-${year}`;
  } catch {
    return dateStr;
  }
}

function buildVimshottariDashaPayload({
  basicDetails,
  astroDetails,
  planetary,
  dasha,
  yogas,
}) {
  const minimalPlanets = {};
  if (planetary && planetary.planets) {
    const corePlanets = ["Sun", "Moon", "Mars", "Mercury", "Jupiter", "Venus", "Saturn", "Rahu", "Ketu"];
    corePlanets.forEach(p => {
      if (planetary.planets[p]) {
        minimalPlanets[p] = {
          sign: planetary.planets[p].sign,
          house: planetary.planet_houses?.[p] || "Unknown",
          is_retrograde: planetary.planets[p].is_retrograde || false
        };  
      }
    });
  }

  const rawDashas = dasha?.dashas || dasha?.periods || [];

  const minimalDashas = rawDashas.map(d => ({
    planet: d.planet,
    start_date: formatToDDMMYYYY(d.start_date),
    end_date: formatToDDMMYYYY(d.end_date)
  }));

  const minimalYogas = (yogas || []).map(y => ({
    name: y.name,
    description: y.description
  }));

  return {
    ascendant: basicDetails?.ascendant?.sign || astroDetails?.ascendant?.sign,
    moonSign: basicDetails?.moon_sign,
    dashaSequence: minimalDashas,
    planets: minimalPlanets,
    yogas: minimalYogas.length > 0 ? minimalYogas : undefined
  };
}

async function generateVimshottariDashaReport({
  basicDetails,
  astroDetails,
  planetary,
  dasha,
  yogas,
  context = {},
} = {}) {
  if (!planetary) {
    console.error("[ERROR] No planetary data provided");
    return null;
  }

  try {
    const payload = buildVimshottariDashaPayload({
      basicDetails,
      astroDetails,
      planetary,
      dasha,
      yogas
    });

    if (!process.env.OPENAI_API_KEY) {
      return { message: "OpenAI API key not found" };
    }

    const loggingContext = buildEnhancedLoggingContext({
      feature: "vimshottari_dasha_ai",
      ...context
    });

    const systemPrompt = `
You are a senior traditional Vedic astrologer writing classical Vimshottari Dasha reports.

You must generate reports for **all 9 Mahadashas** in the exact traditional style shown below.

OUTPUT FORMAT (Strictly follow this JSON structure):
{
  "mahadashaReports": [
    {
      "mahadasha": "Saturn Mahadasha",
      "period": "28-11-2004 - 29-11-2023",
      "houseDescription": "The planet Saturn is in the sixth house of the Kundli. During this Dasha period...",
      "signDescription": "The planet Saturn is camping with the Cancer sign in the Kundli. This placement..."
    },
    {
      "mahadasha": "Mercury Mahadasha",
      "period": "29-11-2023 - 28-11-2040",
      "houseDescription": "...",
      "signDescription": "..."
    }
    // ... continue for all 9 Mahadashas
  ]
}

IMPORTANT INSTRUCTIONS:
- The payload contains "dashaSequence" which is an array of objects with mahadasha periods (start and end dates) in the correct sequential order.
  Use the dashaSequence to determine the exact order of the 9 reports and to fill the "period" field accurately in "DD-MM-YYYY - DD-MM-YYYY" format.
- If dashaSequence is empty or missing, fall back to this exact order: Saturn, Mercury, Ketu, Venus, Sun, Moon, Mars, Rahu, Jupiter.
- For every Mahadasha, write **exactly two paragraphs**:
  1. houseDescription: MUST start with exactly: "The planet [PlanetName] is in the [HouseNumber] house of the Kundli. During this Dasha period, [continue...]"
  2. signDescription: MUST start with exactly: "The planet [PlanetName] is camping with the [SignName] sign in the Kundli. [continue...]"
- Use the data from payload.planets.[Planet] (house, sign, retrograde, etc.) to make every description chart-specific.
- Focus on real life outcomes: wealth, career, property, family, marriage, children, health, enemies, reputation, etc.
- Use balanced traditional Vedic language (positive points + cautions). Avoid modern psychological language.
- Make each Mahadasha feel different based on the planet and its actual placement.

WRITING RULES (Strict):
- Every houseDescription must start with the exact house sentence.
- Every signDescription must start with the exact sign sentence.
- Include both benefits and practical cautions.

Here are two full examples of the desired style, tone, length, and structure (match this exactly):

EXAMPLE 1 - Saturn Mahadasha:
{
  "mahadasha": "Saturn Mahadasha",
  "period": "28-11-2004 - 29-11-2023",
  "houseDescription": "The planet Saturn is in the sixth house of the Kundli. During this Dasha period, things would run positively for you. There shall be a rise in wealth and would attain success over enemies. Popularity and fame will be around you, and strength in all aspects of life will improve. Moreover, As the Dasha time passes, things on the table could flip its side. You might get enmities from many people while your enemies might start creating trouble in your life. Furthermore, with Saturn in the sixth house in the Dasha period, you must not sell land and properties or there would be losses. Also, fear from poison and thieves could be there too, so be safe.",
  "signDescription": "The planet Saturn is camping with the Cancer sign in the Kundli. This placement is synonymous with happiness from family and friends. The placement of Saturn in Cancer indicates a period of happiness and contentment especially in domestic and home life. The native will be surrounded by friends whom he/she likes and who are fond of him/her as well. You will also prove to be incredibly helpful to your friends and family. However, during this Dasha period, you must be extremely careful when it comes to your health. Saturn in Cancer suggests that you must be particularly wary of undue eye strain. You are susceptible to problems related to your eyes, your right eye in particular."
}

EXAMPLE 2 - Mercury Mahadasha:
{
  "mahadasha": "Mercury Mahadasha",
  "period": "29-11-2023 - 28-11-2040",
  "houseDescription": "The planet Mercury is in the fourth house of the Kundli. During this Dasha period, commencing happenings will be there in your life. You shall see success in educational pursuits and gains in property, land, and business. Your mother will stay happy and will have satisfactory good health. As the Dasha time passes, scenarios could change. You may bear deprivation of house and loss of job. However, with Mercury in the fourth house in the Dasha period, you can anticipate prosperity in domestic life as the Dasha reaches its end.",
  "signDescription": "The planet Mercury is camping with the Taurus sign in the Kundli. This placement brings a bit of bad omen to the native, especially when it comes to financial matters. The placement of Mercury in Taurus indicates that this period will be of extravagance. Your ignorance about the value of money is not good as it could disrupt your financial planning. So be careful and spend wisely if you certainly don't want to worry your family and friends. Thankfully, at the end of the period, you are to realise your responsibility and work for the good of the family. Your spouse will be your motivation and will bring you the luck that will help you attain big things in life."
}

Now generate the full report for all 9 Mahadashas following the exact rules, format, starting phrases, and style demonstrated above. Use the payload data for accurate house, sign, and other details.
`.trim();

    const userPrompt = `
Generate detailed traditional Vimshottari Dasha reports for all 9 Mahadashas using the payload below.

Payload (includes dashaSequence with periods, planetary placements with house/sign for each, yogas, ascendant, moon sign, etc.):
${JSON.stringify(payload)}
`.trim();

    const completion = await createChatCompletion({
      model: CHAT_MODEL,
      messages: [
        { role: "system", content: systemPrompt },
        { role: "user", content: userPrompt },
      ],
      temperature: 0.55,
      max_tokens: 8000,
      response_format: { type: "json_object" },
    }, loggingContext);

    const content = completion.choices[0]?.message?.content;

    if (!content) {
      return { message: "Empty response from LLM" };
    }

    let parsed;
    try {
      parsed = JSON.parse(content);
    } catch (err) {
      const start = content.indexOf("{");
      const end = content.lastIndexOf("}");
      if (start !== -1 && end !== -1) {
        parsed = JSON.parse(content.slice(start, end + 1));
      } else {
        return { message: "Invalid JSON from LLM" };
      }
    }

    if (!parsed?.mahadashaReports || !Array.isArray(parsed.mahadashaReports) || parsed.mahadashaReports.length !== 9) {
      console.warn("[DASHA_REPORT] Warning: Expected exactly 9 mahadashaReports");
    }

    return parsed;

  } catch (error) {
    console.error("[DashaReport] Error:", error?.message || error);
    return null;
  }
}

// ==================== RUDRAKSHA ====================

function buildRudrakshaPayload({
  basicDetails,
  horoscope,
  planetary,
  remedies,
  dasha
}) {
  const nakshatra =
    horoscope?.planetary_analysis?.Moon?.nakshatra ||
    horoscope?.dasha_predictions?.birth_nakshatra ||
    horoscope?.personality_analysis?.moon_influence?.nakshatra ||
    basicDetails?.nakshatra ||
    "Unknown";

  const moonSign =
    basicDetails?.moon_sign ||
    horoscope?.basic_details?.moon_sign ||
    "Unknown";

  const ascendant =
    basicDetails?.ascendant?.sign ||
    horoscope?.basic_details?.ascendant_sign ||
    "Unknown";

  const existingRudraksha = remedies?.rudraksha?.suggested || [];

  return {
    nakshatra,
    moonSign,
    ascendant,
    existingRecommendations: existingRudraksha.length > 0 ? existingRudraksha : undefined
  };
}

async function generateRudrakshaSuggestion({
  basicDetails,
  horoscope,
  planetary,
  remedies,
  dasha,
  context = {}
} = {}) {
  try {
    const payload = buildRudrakshaPayload({
      basicDetails,
      horoscope,
      planetary,
      remedies,
      dasha
    });

    if (!process.env.OPENAI_API_KEY) {
      return { message: "OpenAI API key not found" };
    }

    const systemPrompt = `You are a traditional Vedic astrologer writing a strict, reference-based Rudraksha Suggestion Report.
Your tone must be cautious, traditional, and advisory. Do not make absolute guarantees, and do not invent psychological interpretations.

CRITICAL RULES TO AVOID HALLUCINATIONS (FOLLOW STRICTLY):
1. BASIS FOR RECOMMENDATION: Base the recommendation SOLELY on the user's birth Nakshatra (extracted from the payload). NEVER base it on chart house placements.
2. 17-MUKHI FACTS: Ruled by Goddess Katyayani. Worn on Monday. Mantra is EXACTLY "Om Namaha Shivaya". Purified with panchaamrit/panchgaveya. Worn around the neck or kept in place of worship.
3. 14-MUKHI FACTS: Ruled by Lord Shiva & Hanuman. Worn on Monday or Shivaratri. Mantra is EXACTLY "Om Hreem Hoom Namah". Purified with Gangajal. Worn on the chest or right hand.
4. EXACT LIST COUNTS: The "benefits" and "precautions" arrays for BOTH Rudrakshas MUST contain exactly 10 to 11 short bullet points (one-liners). Use the specific traditional points provided in the structure below.
5. DISCLAIMER: You MUST include the astrologerDisclaimer exactly as written below.

IMPORTANT INSTRUCTION FOR LENGTH & QUALITY:
- Write rich, detailed, and significantly longer descriptions.
- The "introduction" should be 5–7 flowing sentences.
- The "recommendation.reason" should be 5–6 detailed sentences explaining the suitability.
- The "details" section for both seventeenMukhi and fourteenMukhi should be 6–8 rich, flowing sentences each.
- Use traditional, advisory, and insightful language. Make the content feel premium and person-centric.

REQUIRED JSON STRUCTURE (Output exactly this format):
{
  "introduction": "A short introductory paragraph stating this report suggests a Rudraksha based strictly on the native's birth Nakshatra to shield against negative energies and retain positivity.",
  "rudrakshaImportance": "Explain that Rudraksha beads (Elaeocarpus) grow in the Himalayas, have unique vibrations, grant Dharma, Artha, Kama, Moksha, and burn sins to ashes. Pleases deities like Lord Shiva, Goddess Durga, Lord Indra, Brahma, Vishnu, Ganesh, Kartikeya, and Aditya.",
  "astrologerDisclaimer": "Before opting for any of these Rudraksha, it is highly recommended that you consult an astrologer as there might be planetary combinations in your current chart based on which the Rudraksha recommendation might change for you.",
  "recommendation": {
    "nakshatra": "Insert the extracted Nakshatra from the payload (e.g., Uttara Bhadrapada)",
    "primary": "17-Mukhi Rudraksha",
    "secondary": "14-Mukhi Rudraksha",
    "reason": "Explain these are suitable for the native's Nakshatra because both are ruled by Saturn and influenced by Katyayani Devi and Lord Hanuman respectively."
  },
  "seventeenMukhi": {
    "details": "1-2 traditional paragraphs explaining it is ruled by Devi Katyayani (6th incarnation of Durga). The wearer gains strength, bonds with spouse, luck, riches, charisma, and success for workaholics. It brings worldly pleasures, honesty, moksha, and reduces tension/grief.",
    "benefits": [
      "Relieves tension and emotional depression.",
      "Advantageous for those working in speculative industries like gambling and lotteries.",
      "Makes the wearer fearless in all situations.",
      "Dismisses Saturn's negative effects and must be worn during the Sade Sati phase.",
      "Contributes greatly to the wearer's well-being and prosperity.",
      "Improves the efficiency of the Ajna chakra.",
      "Removes barriers and obstacles from the wearer's life.",
      "Facilitates finding the ideal life partner.",
      "Promises advancement in work-related activities and household duties.",
      "Aids in making wise decisions and overcoming negative past karma.",
      "Removes the dread of dying and encourages truthful actions."
    ],
    "howToWear": "Must be worn around the neck or kept in the place of worship on a Monday. Get up early, take a bath, dress in new clothes, sit facing East, and chant 'Om Namaha Shivaya' when wearing or taking it off.",
    "precautions": [
      "Every day, worship the seventeen-Mukhi rudraksha and never lose faith in it.",
      "Always have a Shiv Lingha made of Parad or Crystal in front of you when worshiping.",
      "Once in a while, clean the bead with panchaamrit or panchgaveya.",
      "Never show off your seventeen-Mukhi rudraksha beads to anyone.",
      "Do not wear a rudraksha with a broken bead.",
      "Do not give anyone your bead.",
      "Once worn, avoid using chemical soaps on it.",
      "Strictly avoid eating non-vegetarian food.",
      "Strictly avoid drinking alcohol.",
      "Maintain physical and mental purity daily."
    ]
  },
  "fourteenMukhi": {
    "details": "1-2 traditional paragraphs explaining it is influenced by Lord Hanuman and Lord Shiva. It activates the Ajna Chakra (third eye), grants strong willpower, protects against negative energies, and helps the native conquer fears.",
    "benefits": [
      "Provides powerful protection against evil spirits and negative energies.",
      "Removes the malefic effects of Sade Sati.",
      "Enhances leadership qualities and authoritative power.",
      "Instills immense courage and fearlessness through Lord Hanuman's blessings.",
      "Promotes deep spiritual growth and awakening.",
      "Helps in balancing and activating the Ajna Chakra.",
      "Aids in pacifying Mangal Dosh.",
      "Brings steadiness and unwavering focus to the mind.",
      "Shields against sudden or unseen obstacles in life.",
      "Attracts the combined protective blessings of Lord Shiva and Lord Hanuman."
    ],
    "howToWear": "Ideally worn on Monday or Shivaratri. It should be worn on the chest or the right hand. Cleanse the bead using Gangajal before wearing, and chant the mantra 'Om Hreem Hoom Namah'.",
    "precautions": [
      "Keep the bead hidden from plain view rather than displaying it.",
      "Never share a used Rudraksha with others.",
      "Dispose of broken beads properly by immersing them in flowing water.",
      "Always remove the Rudraksha before sleeping.",
      "Strictly avoid wearing it while visiting a funeral.",
      "Worship the bead daily with devotion and faith.",
      "Do not wear it with unwashed hands.",
      "Avoid using harsh chemical soaps on the bead.",
      "Strictly restrict the consumption of non-vegetarian food.",
      "Strictly restrict the consumption of alcohol."
    ]
  }
}

Return ONLY valid JSON. No extra text or markdown wrappers.`;

    const userPrompt = `Generate the strict Nakshatra-based Rudraksha Suggestion Report.

Payload:
${JSON.stringify(payload, null, 2)}`;

    const completion = await createChatCompletion({
      model: CHAT_MODEL,
      messages: [
        { role: "system", content: systemPrompt },
        { role: "user", content: userPrompt }
      ],
      temperature: 0.25,
      max_tokens: 4500,
      response_format: { type: "json_object" }
    }, {
      feature: "rudraksha_suggestion",
      ...context
    });

    const content = completion.choices[0]?.message?.content;

    if (!content) {
      return { message: "Empty response from LLM" };
    }

    let parsed;
    try {
      parsed = JSON.parse(content);
    } catch (e) {
      const start = content.indexOf("{");
      const end = content.lastIndexOf("}");
      if (start !== -1 && end !== -1) {
        parsed = JSON.parse(content.slice(start, end + 1));
      } else {
        return { message: "Invalid JSON from LLM" };
      }
    }

    return parsed;

  } catch (error) {
    console.error("[RudrakshaSuggestion] Error:", error?.message || error);
    return {
      message: "Failed to generate Rudraksha report",
      error: error?.message
    };
  }
}

// ==================== GEMSTONE ====================

function buildGemstonePayload({
  basicDetails,
  horoscope,
  planetary,
  preComputedRecommendations = null
}) {
  let ascendant =
    basicDetails?.ascendant?.sign ||
    horoscope?.ascendant?.sign ||
    horoscope?.basic_details?.ascendant_sign ||
    basicDetails?.ascendant ||
    "";
    
  if (ascendant.toLowerCase() === "unknown") {
    ascendant = "";
  }

  const moonSign =
    basicDetails?.moon_sign ||
    horoscope?.moon_sign ||
    horoscope?.basic_details?.moon_sign ||
    "";

  const sunSign =
    basicDetails?.sun_sign ||
    horoscope?.sun_sign ||
    "";

  return {
    ascendant,
    moonSign,
    sunSign,
    recommendations: preComputedRecommendations
  };
}

async function generateGemstoneSuggestion({
  basicDetails,
  horoscope,
  planetary,
  preComputedRecommendations = null,
  context = {}
} = {}) {
  try {
    const payload = buildGemstonePayload({
      basicDetails,
      horoscope,
      planetary,
      preComputedRecommendations
    });

    if (!process.env.OPENAI_API_KEY) {
      return { message: "OpenAI API key not found" };
    }

    const hasRecs = !!payload.recommendations;

    const systemPrompt = `You are an expert Vedic astrology content writer. Your task is to generate a personalized Gemstone Suggestion Report based STRICTLY on the provided pre-computed astrological data.

CRITICAL DIRECTIVES:
1. YOU ARE A WRITER, NOT AN ASTROLOGER: Do NOT calculate or infer which gemstone, planet, mantra, or wearing instructions are correct. You MUST use the exact data provided in the payload under 'recommendations'.
2. NO SUBSTITUTIONS: If the payload says the Lucky Stone is Emerald, you must write about Emerald. Do not change the stone, the governing planet, the finger, or the metal.
3. HINDI NAMES ONLY FOR GEMSTONES: Provide the gemstone name in English followed by its Hindi name in parentheses, for example: "Diamond (Heera)", "Emerald (Panna)". DO NOT use Hinglish in the descriptions.
4. EXACT INCLUSION: The 'howToWear' and 'mantra' fields in your output MUST be copied perfectly from the input payload without alteration.
5. MISSING ASCENDANT HANDLING: If the Ascendant is missing or empty, do not write "for Unknown". Simply write "Life Stone", "Lucky Stone", or "Fortune Stone" for the titles.
6. KEY CONCEPTS: Across the three descriptions, you MUST weave in these specific astrological themes naturally: 'wealth', 'education', 'spouse', 'intellect', and 'business'.
7. Output ONLY valid JSON.

REQUIRED JSON STRUCTURE:
{
  "lifeStone": {
    "title": "Life Stone for [Ascendant] (Omit 'for [Ascendant]' if missing)",
    "description": "Start exactly with: 'The Life stone is suggested based on the Lord governing the 1st house (Lagna) of the native's birth chart.' Then, write 2-3 sentences explaining how it acts as a protective shield, enhances vitality, and positively influences the native's self and relationships (e.g., spouse).",
    "gemName": "[English Name] ([Hindi Name])",
    "howToWear": "[Extract exactly from payload]",
    "mantra": "[Extract exactly from payload]"
  },
  "luckyStone": {
    "title": "Lucky Stone for [Ascendant] (Omit 'for [Ascendant]' if missing)",
    "description": "Start exactly with: 'The Lucky stone is suggested by astrologers based on the Lord governing the 5th house of the native's birth chart.' Then, write 2-3 sentences explaining how it effectively channels intellect, supports education, aids in higher learning, and attracts positive energy.",
    "gemName": "[English Name] ([Hindi Name])",
    "howToWear": "[Extract exactly from payload]",
    "mantra": "[Extract exactly from payload]"
  },
  "fortuneStone": {
    "title": "Fortune Stone for [Ascendant] (Omit 'for [Ascendant]' if missing)",
    "description": "Start exactly with: 'The Bhagya stone is suggested by the astrologers based on the Lord governing the 9th house of the native's birth chart. The Bhagya stone helps the native attract fortune when s/he needs it the most.' Then, write 1-2 sentences explaining how it fights obstacles and enhances prosperity, wealth, and success in business.",
    "gemName": "[English Name] ([Hindi Name])",
    "howToWear": "[Extract exactly from payload]",
    "mantra": "[Extract exactly from payload]"
  }
}`;

    const userPrompt = `Generate the Gemstone Suggestion Report.

Payload:
${JSON.stringify(payload, null, 2)}

${hasRecs 
  ? "CRITICAL: Use the EXACT stones, mantras, and wearing instructions from the 'recommendations' object. Format gem names like 'Diamond (Heera)'." 
  : "No pre-computed recommendations found. Generate general recommendations, state clearly they are general, and format gem names like 'Diamond (Heera)'."}`;

    const completion = await createChatCompletion({
      model: CHAT_MODEL,
      messages: [
        { role: "system", content: systemPrompt },
        { role: "user", content: userPrompt }
      ],
      temperature: 0.2,
      max_tokens: 2800,
      response_format: { type: "json_object" }
    }, {
      feature: "gemstone_suggestion",
      ...context
    });

    const content = completion.choices[0]?.message?.content;

    if (!content) return { message: "Empty response from LLM" };

    let parsed;
    try {
      parsed = JSON.parse(content);
    } catch (e) {
      const start = content.indexOf("{");
      const end = content.lastIndexOf("}");
      parsed = start !== -1 && end !== -1 
        ? JSON.parse(content.slice(start, end + 1)) 
        : { message: "Invalid JSON" };
    }

    return parsed;

  } catch (error) {
    console.error("[GemstoneSuggestion] Error:", error?.message || error);
    return { message: "Failed to generate Gemstone report", error: error?.message };
  }
}

// ==================== DOSHA ====================

function buildDoshaPayload(kundli) {
  const manglikDosha = kundli?.manglikAnalysis?.mangal_dosha;
  const isManglik = manglikDosha?.present || false;
  const marsHouse = manglikDosha?.mars_house || "Unknown";
  const manglikRemedies = manglikDosha?.remedies || [];

  const kalsarpaDosha = kundli?.manglikAnalysis?.all_doshas?.kaal_sarp_dosha;
  const isKalsarpa = kalsarpaDosha?.present || false;
  const kalsarpaType = kalsarpaDosha?.description || "Kaal Sarp Dosh";

  const sadesatiData = kundli?.manglikAnalysis?.sadesati;
  const isSadeSatiActive = sadesatiData?.is_sadesati || false;
  const sadesatiStatus = sadesatiData?.status || "";
  const sadesatiPeriods = sadesatiData?.periods || [];

  return {
    manglik: {
      isPresent: isManglik,
      marsHouse: marsHouse,
      remedies: manglikRemedies
    },
    kalsarpa: {
      isPresent: isKalsarpa,
      type: kalsarpaType
    },
    sadeSati: {
      isCurrentlyActive: isSadeSatiActive,
      statusMessage: sadesatiStatus,
      timeline: sadesatiPeriods.map(p => ({
        start: p.start_date,
        end: p.end_date,
        sign: p.sign_name,
        phase: p.type
      }))
    }
  };
}

async function generateDoshaReport(kundli, context = {}) {
  try {
    const payload = buildDoshaPayload(kundli);

    if (!process.env.OPENAI_API_KEY) {
      return { message: "OpenAI API key not found" };
    }

    const systemPrompt = `You are an elite Vedic Astrology Content Writer. Your job is to take the provided hard data (boolean flags, dates, and house placements) and expand them into premium, highly detailed reports.

CRITICAL DIRECTIVES FOR ACCURACY:
1. NEVER INVENT A DOSHA: You must strictly obey the 'isPresent' / 'isCurrentlyActive' boolean flags in the payload. 
2. LENGTH & DEPTH: Do NOT write 1-2 line summaries. Every description must be a rich, comprehensive paragraph of at least 150 words using traditional Indian English.
3. SADE SATI RULES: 
   - If 'isCurrentlyActive' is true, write three heavy, distinct paragraphs for the Rising, Peak, and Setting phases explaining their emotional, financial, and physical impacts. 
   - If 'isCurrentlyActive' is false, write a positive paragraph stating they are currently free from it, but if a 'timeline' is provided, gently describe the upcoming phases based on the 'statusMessage'.
   - ALWAYS map the exact timeline array provided in the payload to the 'timelineTable'.
4. MANGLIK RULES: If 'isPresent' is true, explain exactly how Mars sitting in the specific 'marsHouse' affects marriage, temperament, and relationships. USE the exact remedies array provided in the payload.
5. KALSARPA RULES: If 'isPresent' is true, write a general 150-word description of Kaal Sarp Dosh, followed by specific details on their 'type'. If false, confidently write that their chart is beautifully free of this affliction.

IMPORTANT INSTRUCTION FOR LENGTH & QUALITY:
- Write rich, detailed, and significantly longer descriptions.
- The "report" under manglikDosh should be a detailed 6–8 sentence paragraph.
- The "generalDescription" and "specificDescription" under kalsarpaDosh should each be rich 6–8 sentence paragraphs.
- Each phase under "phasesDescription" (risingPhase, peakPhase, settingPhase) should be a detailed 6–8 sentence paragraph with deep explanation of emotional, financial, and physical impact.
- Use premium, flowing, traditional Indian English. Make the content feel insightful and advisory.

REQUIRED JSON STRUCTURE:
{
  "manglikDosh": {
    "isPresent": boolean,
    "report": "Detailed 150+ word paragraph explaining the specific house placement effect, or a positive note if not present.",
    "remedies": ["Remedy 1", "Remedy 2", "Remedy 3"]
  },
  "kalsarpaDosh": {
    "isPresent": boolean,
    "kalsarpaType": "String",
    "generalDescription": "Detailed 150+ word paragraph explaining what Kaalsarp Dosh is in general. (Or positive note if false)",
    "specificDescription": "Detailed 150+ word paragraph explaining the specific type. (Empty if false)",
    "remedies": ["Suggest 3-4 traditional Kalsarpa remedies if present, otherwise empty array"]
  },
  "sadeSati": {
    "isCurrentlyActive": boolean,
    "statusMessage": "String exactly from payload",
    "timelineTable": [
      { "start": "YYYY-MM-DD", "end": "YYYY-MM-DD", "sign": "String", "phase": "String" }
    ],
    "phasesDescription": {
      "risingPhase": "Detailed 150+ word paragraph about the Rising phase (financial/relationship cautions).",
      "peakPhase": "Detailed 150+ word paragraph about the Peak phase (health/mental challenges).",
      "settingPhase": "Detailed 150+ word paragraph about the Setting phase (financial recovery/maturity)."
    }
  }
}

Output ONLY valid JSON. No markdown wrappers.`;

    const userPrompt = `Generate the premium Dosha Report based STRICTLY on this accurate data:

Payload:
${JSON.stringify(payload, null, 2)}`;

    const completion = await createChatCompletion({
      model: CHAT_MODEL,
      messages: [
        { role: "system", content: systemPrompt },
        { role: "user", content: userPrompt }
      ],
      temperature: 0.25,
      max_tokens: 4500,
      response_format: { type: "json_object" }
    }, {
      feature: "dosha_report",
      ...context
    });

    const content = completion.choices[0]?.message?.content;

    if (!content) return { message: "Empty response from LLM" };

    let parsed;
    try {
      parsed = JSON.parse(content);
    } catch (e) {
      const start = content.indexOf("{");
      const end = content.lastIndexOf("}");
      parsed = start !== -1 && end !== -1 
        ? JSON.parse(content.slice(start, end + 1)) 
        : { message: "Invalid JSON" };
    }

    return parsed;

  } catch (error) {
    console.error("[DoshaReport] Error:", error?.message || error);
    return { message: "Failed to generate Dosha report", error: error?.message };
  }
}

module.exports = {
  generateGeneralDetails,
  generateVimshottariDashaReport,
  generateRudrakshaSuggestion,
  generateGemstoneSuggestion,
  generateDoshaReport
};