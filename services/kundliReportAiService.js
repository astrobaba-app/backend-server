const OpenAI = require("openai");

const openai = new OpenAI({
  apiKey: process.env.OPENAI_API_KEY,
});

/**
 * Generate enhanced Kundli report content using OpenAI
 * Generates structured data for 8-page PDF report
 * @param {Object} kundliData - Complete kundli data
 * @param {Object} userDetails - User basic details
 * @returns {Promise<Object>} Enhanced report content
 */
async function generateKundliReportContent(kundliData, userDetails) {
  try {
    const { fullName, dateOfbirth, timeOfbirth, placeOfBirth, gender } = userDetails;

    // Extract key astrological information
    const ascendant = kundliData.astroDetails?.ascendant_report?.ascendant || "Not available";
    const moonSign = kundliData.basicDetails?.moon_sign || "Not available";
    const sunSign = kundliData.basicDetails?.sun_sign || "Not available";
    
    // Get planetary positions - convert to array if it's an object
    const planetaryData = kundliData.planetary || [];
    const planets = Array.isArray(planetaryData) 
      ? planetaryData 
      : Object.values(planetaryData);
    
    // Get yogas - convert to array if it's an object
    const yogasData = kundliData.yogas || [];
    const yogas = Array.isArray(yogasData) 
      ? yogasData 
      : Object.values(yogasData);
    
    // Get dasha information
    const dashasData = kundliData.dasha?.major_dashas || [];
    const dashas = Array.isArray(dashasData) 
      ? dashasData 
      : Object.values(dashasData);
    const currentDasha = dashas[0] || null;

    const prompt = `Generate a comprehensive Yearly Vedic Astrology Report for ${fullName} for the year 2026.

Birth Details:
- Date of Birth: ${dateOfbirth}
- Time of Birth: ${timeOfbirth}
- Place of Birth: ${placeOfBirth}
- Gender: ${gender}

Astrological Information:
- Ascendant (Lagna): ${ascendant}
- Moon Sign (Rashi): ${moonSign}
- Sun Sign: ${sunSign}
- Current Major Dasha: ${currentDasha ? `${currentDasha.planet} (${currentDasha.start} to ${currentDasha.end})` : 'Not available'}

Planetary Positions Summary:
${planets.slice(0, 9).map(p => `- ${p.name || 'Planet'}: ${p.sign || 'Sign'} in ${p.house || '1'}th house`).join('\n')}

Important Yogas:
${yogas.slice(0, 3).map(y => `- ${y.name || 'Yoga'}: ${y.description || 'Beneficial combination'}`).join('\n')}

CRITICAL INSTRUCTIONS:
1. ALL content must be personalized based on the birth chart details above
2. Each description text MUST be minimum 150-200 words (approximately 5-6 lines when formatted)
3. Generate UNIQUE predictions, periods, key dates, and remedies for THIS specific person
4. Use the planetary positions, yogas, and dasha information to make predictions
5. Do NOT use generic or template text - be specific to ${fullName}'s chart
6. Return ONLY valid JSON without any markdown formatting

Please generate a detailed yearly report with the following structure:

{
  "overview": "A comprehensive 200-250 word personalized overview based on ${fullName}'s specific birth chart. Include specific planetary influences from their chart. Discuss the year 2026 in detail with transformative themes, opportunities, and challenges specific to their ascendant (${ascendant}), moon sign (${moonSign}), and current dasha period. Make predictions based on their unique planetary positions and yogas. This should be highly personalized and NOT generic.",
  
  "careerFinance": "150-200 word personalized description of career opportunities and challenges for ${fullName} in 2026. Base predictions on their 10th house, Saturn position, and career-related yogas from their chart. Discuss specific career transits, professional growth areas, and financial prospects unique to their planetary configuration. Reference their current dasha and how it affects career.",
  "careerPeriods": [
    {"period": "Jan - Mar", "focus": "Focus area based on chart", "prediction": "Specific prediction based on planetary transits for this person's chart"},
    {"period": "Apr - Jun", "focus": "Chart-specific focus", "prediction": "Personalized prediction considering their planets"},
    {"period": "Jul - Sep", "focus": "Individual focus area", "prediction": "Unique prediction for their configuration"},
    {"period": "Oct - Dec", "focus": "Personalized focus", "prediction": "Chart-specific quarterly prediction"}
  ],
  "careerKeyDates": [
    {"type": "positive", "date": "Specific date based on transits", "title": "Transit event relevant to their chart"},
    {"type": "negative", "date": "Challenging date for this person", "title": "Difficult transit specific to their planets"}
  ],
  "careerRemedies": ["Remedy 1 specific to their planetary afflictions", "Remedy 2 based on their chart weaknesses", "Remedy 3 personalized for career success"],
  
  "relationships": "150-200 word personalized description of ${fullName}'s relationships in 2026. Analyze their 7th house, Venus position, and relationship yogas. Discuss romantic prospects, family dynamics, and social connections based on their specific planetary positions. Reference moon sign (${moonSign}) influence on emotions.",
  "relationshipPeriods": [
    {"period": "Jan - Mar", "focus": "Chart-based relationship focus", "prediction": "Personalized relationship prediction"},
    {"period": "Apr - Jun", "focus": "Individual relationship area", "prediction": "Unique relationship forecast"},
    {"period": "Jul - Sep", "focus": "Specific relationship focus", "prediction": "Chart-based relationship dynamics"},
    {"period": "Oct - Dec", "focus": "Personalized focus", "prediction": "Individual relationship prediction"}
  ],
  "relationshipKeyDates": [
    {"type": "positive", "date": "Favorable date for this person", "title": "Beneficial relationship transit"},
    {"type": "negative", "date": "Challenging date", "title": "Difficult relationship transit"}
  ],
  "relationshipRemedies": ["Personalized remedy 1", "Chart-specific remedy 2", "Individual remedy 3"],
  
  "finance": "150-200 word personalized financial forecast for ${fullName} in 2026. Analyze 2nd and 11th houses, Jupiter position, and wealth yogas in their chart. Provide specific financial guidance based on their planetary configuration and dasha periods.",
  "financePeriods": [
    {"period": "Jan - Mar", "focus": "Chart-specific financial focus", "prediction": "Personalized financial prediction"},
    {"period": "Apr - Jun", "focus": "Individual financial area", "prediction": "Unique financial forecast"},
    {"period": "Jul - Sep", "focus": "Specific wealth focus", "prediction": "Chart-based financial guidance"},
    {"period": "Oct - Dec", "focus": "Personalized focus", "prediction": "Individual financial prediction"}
  ],
  "financeKeyDates": [
    {"type": "positive", "date": "Favorable financial date", "title": "Beneficial wealth transit"},
    {"type": "negative", "date": "Cautious date", "title": "Challenging financial transit"}
  ],
  "financeRemedies": ["Wealth remedy 1 for their chart", "Financial remedy 2 specific to afflictions", "Prosperity remedy 3"],
  
  "healthWellness": "150-200 word personalized health analysis for ${fullName} in 2026. Consider 1st and 6th houses, Mars position, and health indicators in their chart. Provide specific wellness guidance based on their ascendant (${ascendant}) and planetary afflictions.",
  "healthPeriods": [
    {"period": "Jan - Mar", "focus": "Chart-specific health focus", "prediction": "Personalized health prediction"},
    {"period": "Apr - Jun", "focus": "Individual wellness area", "prediction": "Unique health forecast"},
    {"period": "Jul - Sep", "focus": "Specific health focus", "prediction": "Chart-based wellness guidance"},
    {"period": "Oct - Dec", "focus": "Personalized focus", "prediction": "Individual health prediction"}
  ],
  "healthKeyDates": [
    {"type": "positive", "date": "Favorable health date", "title": "Beneficial vitality transit"},
    {"type": "negative", "date": "Cautious health date", "title": "Challenging health transit"}
  ],
  "healthRemedies": ["Health remedy 1 for their afflictions", "Wellness remedy 2 specific to chart", "Vitality remedy 3"],
  
  "spiritualGrowth": "150-200 word personalized spiritual guidance for ${fullName} in 2026. Analyze 9th and 12th houses, Jupiter and Ketu positions. Provide specific spiritual practices based on their chart's spiritual indicators and current dasha.",
  "spiritualPeriods": [
    {"period": "Jan - Mar", "focus": "Chart-specific spiritual focus", "prediction": "Personalized spiritual prediction"},
    {"period": "Apr - Jun", "focus": "Individual spiritual area", "prediction": "Unique spiritual forecast"},
    {"period": "Jul - Sep", "focus": "Specific spiritual focus", "prediction": "Chart-based spiritual guidance"},
    {"period": "Oct - Dec", "focus": "Personalized focus", "prediction": "Individual spiritual prediction"}
  ],
  "spiritualKeyDates": [
    {"type": "positive", "date": "Favorable spiritual date", "title": "Beneficial spiritual transit"},
    {"type": "positive", "date": "Auspicious date", "title": "Powerful spiritual opportunity"}
  ],
  "spiritualRemedies": ["Spiritual remedy 1 for their chart", "Practice 2 specific to spiritual growth", "Meditation remedy 3"],
  
  "travel": "150-200 word personalized travel forecast for ${fullName} in 2026. Analyze 3rd and 9th houses, travel yogas. Provide specific travel guidance based on their planetary transits and opportunities for the year.",
  "travelPeriods": [
    {"period": "Jan - Mar", "focus": "Chart-specific travel focus", "prediction": "Personalized travel prediction"},
    {"period": "Apr - Jun", "focus": "Individual travel area", "prediction": "Unique travel forecast"},
    {"period": "Jul - Sep", "focus": "Specific travel focus", "prediction": "Chart-based travel guidance"},
    {"period": "Oct - Dec", "focus": "Personalized focus", "prediction": "Individual travel prediction"}
  ],
  "travelKeyDates": [
    {"type": "positive", "date": "Favorable travel date", "title": "Beneficial journey transit"},
    {"type": "negative", "date": "Cautious travel date", "title": "Challenging travel transit"}
  ],
  "travelRemedies": ["Travel remedy 1 for their chart", "Journey remedy 2 for protection", "Safe travel remedy 3"],
  
  "education": "150-200 word personalized educational forecast for ${fullName} in 2026. Analyze 4th and 5th houses, Mercury position, and learning yogas. Provide specific educational guidance based on their chart and intellectual pursuits.",
  "educationPeriods": [
    {"period": "Jan - Mar", "focus": "Chart-specific learning focus", "prediction": "Personalized education prediction"},
    {"period": "Apr - Jun", "focus": "Individual educational area", "prediction": "Unique learning forecast"},
    {"period": "Jul - Sep", "focus": "Specific education focus", "prediction": "Chart-based learning guidance"},
    {"period": "Oct - Dec", "focus": "Personalized focus", "prediction": "Individual education prediction"}
  ],
  "educationKeyDates": [
    {"type": "positive", "date": "Favorable learning date", "title": "Beneficial education transit"},
    {"type": "negative", "date": "Challenging study date", "title": "Difficult learning transit"}
  ],
  "educationRemedies": ["Education remedy 1 for their chart", "Learning remedy 2 for focus", "Knowledge remedy 3"]
}
    {"period": "Jul - Sep", "focus": "Investment Strategy", "prediction": "Ideal time to explore..."},
    {"period": "Oct - Dec", "focus": "Stability", "prediction": "Consolidation of financial gains..."}
  ],
  "financeKeyDates": [
    {"type": "positive", "date": "January 25", "title": "Jupiter in 2nd House"},
    {"type": "negative", "date": "May 15", "title": "Saturn Retrograde"}
  ],
  "financeRemedies": ["Keep a budget journal to track expenses.", "Donate to the needy to enhance financial flow.", "Wear yellow for prosperity."],
  
  "healthWellness": "150-200 word description of health and well-being",
  "healthPeriods": [
    {"period": "Jan - Mar", "focus": "Energy Boost", "prediction": "High energy levels ideal..."},
    {"period": "Apr - Jun", "focus": "Stress Management", "prediction": "Increased stress may lead..."},
    {"period": "Jul - Sep", "focus": "Stabilization", "prediction": "Health improves as stress..."},
    {"period": "Oct - Dec", "focus": "Focus on Wellness", "prediction": "End of year brings opportunities..."}
  ],
  "healthKeyDates": [
    {"type": "positive", "date": "February 20", "title": "Mars in 1st House"},
    {"type": "negative", "date": "June 25", "title": "Saturn Retrograde Impact"}
  ],
  "healthRemedies": ["Practice yoga daily for mental clarity.", "Drink plenty of water for hydration.", "Include more green vegetables in your diet."],
  
  "spiritualGrowth": "150-200 word description of spiritual growth",
  "spiritualPeriods": [
    {"period": "Jan - Mar", "focus": "Exploration", "prediction": "Great time to explore new spiritual..."},
    {"period": "Apr - Jun", "focus": "Introspection", "prediction": "Deeper self-reflection leads..."},
    {"period": "Jul - Sep", "focus": "Philosophical Growth", "prediction": "Engage with philosophical texts..."},
    {"period": "Oct - Dec", "focus": "Reflection", "prediction": "Time for deep reflection..."}
  ],
  "spiritualKeyDates": [
    {"type": "positive", "date": "January 14", "title": "New Moon in Capricorn"},
    {"type": "positive", "date": "November 11", "title": "Full Moon in Taurus"}
  ],
  "spiritualRemedies": ["Meditate for at least 15 minutes daily.", "Read spiritual texts regularly.", "Participate in community service for spiritual fulfillment."],
  
  "travel": "150-200 word description of travel opportunities",
  "travelPeriods": [
    {"period": "Jan - Mar", "focus": "Spontaneous Travel", "prediction": "Encouraged to take spontaneous trips..."},
    {"period": "Apr - Jun", "focus": "Planning Time", "prediction": "Ideal for planning future travels..."},
    {"period": "Jul - Sep", "focus": "Execution of Plans", "prediction": "Time for travel experiences..."},
    {"period": "Oct - Dec", "focus": "Reflection on Travel", "prediction": "Reflect on experiences gained..."}
  ],
  "travelKeyDates": [
    {"type": "positive", "date": "February 15", "title": "Mars in 9th House"},
    {"type": "negative", "date": "May 30", "title": "Saturn Retrograde"}
  ],
  "travelRemedies": ["Pack a small bag of essentials before travel.", "Carry a small idol of a deity for protection during journeys.", "Travel with a positive mindset to attract good experiences."],
  
  "education": "150-200 word description of educational growth",
  "educationPeriods": [
    {"period": "Jan - Mar", "focus": "Learning Opportunities", "prediction": "Ideal time to enroll in courses..."},
    {"period": "Apr - Jun", "focus": "Focus Challenges", "prediction": "Saturn retrograde may distract..."},
    {"period": "Jul - Sep", "focus": "Application of Knowledge", "prediction": "Time to apply what you've learned..."},
    {"period": "Oct - Dec", "focus": "Certification", "prediction": "End of year may bring opportunities..."}
  ],
  "educationKeyDates": [
    {"type": "positive", "date": "January 5", "title": "Jupiter in 5th House"},
    {"type": "negative", "date": "April 15", "title": "Saturn Retrograde Impact"}
  ],
  "educationRemedies": ["Read books related to your field of interest.", "Join study groups for collaborative learning.", "Offer flowers at a local temple for knowledge enhancement."]
}

Write in a professional, insightful, and encouraging tone. Focus on empowering the native with knowledge while being realistic about challenges.`;

    const completion = await openai.chat.completions.create({
      model: "gpt-4",
      messages: [
        {
          role: "system",
          content: "You are an expert Vedic astrologer. Return ONLY valid JSON without markdown code blocks or formatting. Generate comprehensive, personalized yearly predictions based on the birth chart details provided."
        },
        {
          role: "user",
          content: prompt
        }
      ],
      temperature: 0.7,
      max_tokens: 4000,
    });

    const content = completion.choices[0].message.content.trim();
    
    // Remove markdown code blocks if present
    let jsonContent = content;
    if (content.startsWith('```json')) {
      jsonContent = content.replace(/```json\n?/g, '').replace(/```\n?/g, '');
    } else if (content.startsWith('```')) {
      jsonContent = content.replace(/```\n?/g, '');
    }
    
    // Parse the JSON response
    let reportContent;
    try {
      reportContent = JSON.parse(jsonContent);
    } catch (parseError) {
      console.warn("[AI Service] Failed to parse JSON response, using fallback structure");
      // Use fallback structure with default data
      reportContent = {
        overview: content || "The year ahead presents transformative opportunities for growth.",
        careerFinance: "Career prospects look promising with steady growth opportunities.",
        careerPeriods: [
          {period: 'Jan - Mar', focus: 'New Opportunities', prediction: 'Mars transit brings high energy and motivation.'},
          {period: 'Apr - Jun', focus: 'Caution', prediction: 'Saturn retrograde suggests careful planning.'},
          {period: 'Jul - Sep', focus: 'Growth', prediction: 'Post-retrograde opportunities for advancement.'},
          {period: 'Oct - Dec', focus: 'Stability', prediction: 'Consolidation of achievements.'}
        ],
        careerKeyDates: [
          {type: 'positive', date: 'March 15 - April 10', title: 'Sun Exalted in 10th House'},
          {type: 'negative', date: 'September 20', title: 'Rahu-Ketu Axis Tension'}
        ],
        careerRemedies: ['Offer water to Sun every morning.', 'Donate black sesame seeds on Saturdays.', 'Wear a ruby or red coral.'],
        relationships: "Relationships will see positive developments throughout the year.",
        relationshipPeriods: [
          {period: 'Jan - Mar', focus: 'Social Connections', prediction: 'Venus positively influences relationships.'},
          {period: 'Apr - Jun', focus: 'Communication Issues', prediction: 'Focus on clarity in communication.'},
          {period: 'Jul - Sep', focus: 'Conflict Resolution', prediction: 'Time to mend broken ties.'},
          {period: 'Oct - Dec', focus: 'Strengthening Bonds', prediction: 'Deepening of relationships.'}
        ],
        relationshipKeyDates: [
          {type: 'positive', date: 'February 14', title: 'Venus in Pisces'},
          {type: 'negative', date: 'June 10', title: 'Mercury Retrograde'}
        ],
        relationshipRemedies: ['Offer sweets to children.', 'Wear light blue.', 'Practice meditation.'],
        finance: "Financial stability with opportunities for growth.",
        financePeriods: [
          {period: 'Jan - Mar', focus: 'Unexpected Gains', prediction: "Jupiter's influence brings opportunities."},
          {period: 'Apr - Jun', focus: 'Budgeting', prediction: 'Careful financial planning needed.'},
          {period: 'Jul - Sep', focus: 'Investment Strategy', prediction: 'Good time for investments.'},
          {period: 'Oct - Dec', focus: 'Stability', prediction: 'Financial consolidation.'}
        ],
        financeKeyDates: [
          {type: 'positive', date: 'January 25', title: 'Jupiter in 2nd House'},
          {type: 'negative', date: 'May 15', title: 'Saturn Retrograde'}
        ],
        financeRemedies: ['Keep a budget journal.', 'Donate to the needy.', 'Wear yellow.'],
        healthWellness: "Health requires consistent attention and care.",
        healthPeriods: [
          {period: 'Jan - Mar', focus: 'Energy Boost', prediction: 'High energy levels.'},
          {period: 'Apr - Jun', focus: 'Stress Management', prediction: 'Manage stress carefully.'},
          {period: 'Jul - Sep', focus: 'Stabilization', prediction: 'Health stabilizes.'},
          {period: 'Oct - Dec', focus: 'Focus on Wellness', prediction: 'Mental health focus.'}
        ],
        healthKeyDates: [
          {type: 'positive', date: 'February 20', title: 'Mars in 1st House'},
          {type: 'negative', date: 'June 25', title: 'Saturn Retrograde Impact'}
        ],
        healthRemedies: ['Practice yoga daily.', 'Drink plenty of water.', 'Eat green vegetables.'],
        spiritualGrowth: "Significant year for spiritual development.",
        spiritualPeriods: [
          {period: 'Jan - Mar', focus: 'Exploration', prediction: 'Explore new spiritual practices.'},
          {period: 'Apr - Jun', focus: 'Introspection', prediction: 'Deep self-reflection.'},
          {period: 'Jul - Sep', focus: 'Philosophical Growth', prediction: 'Engage with philosophical texts.'},
          {period: 'Oct - Dec', focus: 'Reflection', prediction: 'Deep spiritual reflection.'}
        ],
        spiritualKeyDates: [
          {type: 'positive', date: 'January 14', title: 'New Moon in Capricorn'},
          {type: 'positive', date: 'November 11', title: 'Full Moon in Taurus'}
        ],
        spiritualRemedies: ['Meditate 15 minutes daily.', 'Read spiritual texts.', 'Do community service.'],
        travel: "Travel opportunities will arise throughout the year.",
        travelPeriods: [
          {period: 'Jan - Mar', focus: 'Spontaneous Travel', prediction: 'Spontaneous trips encouraged.'},
          {period: 'Apr - Jun', focus: 'Planning Time', prediction: 'Plan future travels.'},
          {period: 'Jul - Sep', focus: 'Execution of Plans', prediction: 'Time for travel.'},
          {period: 'Oct - Dec', focus: 'Reflection on Travel', prediction: 'Reflect on experiences.'}
        ],
        travelKeyDates: [
          {type: 'positive', date: 'February 15', title: 'Mars in 9th House'},
          {type: 'negative', date: 'May 30', title: 'Saturn Retrograde'}
        ],
        travelRemedies: ['Pack essentials.', 'Carry a deity idol.', 'Travel with positive mindset.'],
        education: "Educational pursuits will be favored.",
        educationPeriods: [
          {period: 'Jan - Mar', focus: 'Learning Opportunities', prediction: 'Enroll in courses.'},
          {period: 'Apr - Jun', focus: 'Focus Challenges', prediction: 'Stay focused despite distractions.'},
          {period: 'Jul - Sep', focus: 'Application of Knowledge', prediction: 'Apply learned skills.'},
          {period: 'Oct - Dec', focus: 'Certification', prediction: 'Certification opportunities.'}
        ],
        educationKeyDates: [
          {type: 'positive', date: 'January 5', title: 'Jupiter in 5th House'},
          {type: 'negative', date: 'April 15', title: 'Saturn Retrograde Impact'}
        ],
        educationRemedies: ['Read books.', 'Join study groups.', 'Offer flowers at temple.']
      };
    }

    return {
      success: true,
      reportContent,
      metadata: {
        generatedAt: new Date().toISOString(),
        model: "gpt-4",
      }
    };

  } catch (error) {
    console.error("[OpenAI Service] Error generating kundli report:", error);
    throw new Error(`Failed to generate report content: ${error.message}`);
  }
}

module.exports = {
  generateKundliReportContent,
};
