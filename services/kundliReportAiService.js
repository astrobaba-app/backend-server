const OpenAI = require("openai");

const openai = new OpenAI({
  apiKey: process.env.OPENAI_API_KEY,
});

/**
 * Generate enhanced Kundli report content using OpenAI
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

    const prompt = `Generate a comprehensive Yearly Vedic Astrology Report for ${fullName}.

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

Important Yogas Present:
${yogas.slice(0, 5).map(yoga => `- ${yoga.name}: ${yoga.description || 'Significant astrological combination'}`).join('\n')}

Planetary Positions:
${planets.slice(0, 9).map(p => `- ${p.name}: ${p.sign} (${p.house}th house)`).join('\n')}

Please generate a detailed report with the following sections:

1. **Overview** (200-250 words): 
   - Transformative themes for the year
   - Key opportunities and challenges
   - General predictions for career, relationships, and personal growth
   - Emphasis on self-awareness and proactive measures

2. **Career & Finance** (150-200 words):
   - Career growth prospects and changes
   - Financial outlook and budgeting advice
   - Best periods for important decisions
   - Recommendations for career advancement

3. **Relationships** (150-200 words):
   - Romantic relationship predictions
   - Family dynamics and communication
   - Social connections and networking
   - Critical periods requiring attention

4. **Health & Wellness** (100-150 words):
   - Physical health considerations
   - Mental and emotional well-being
   - Preventive measures and lifestyle recommendations
   - Favorable periods for health improvements

5. **Spiritual Growth** (100-150 words):
   - Spiritual development opportunities
   - Recommended practices and remedies
   - Inner transformation and personal evolution
   - Connection with higher consciousness

6. **Monthly Predictions** (Brief month-wise guidance):
   - Highlight key months with significant transits
   - Best and challenging periods
   - Important dates for decisions

Please write in a professional, insightful, and encouraging tone. Focus on empowering the native with knowledge while being realistic about challenges. Use astrological terminology appropriately.

Format the response as JSON with these exact keys:
{
  "overview": "detailed overview text",
  "careerFinance": "career and finance text",
  "relationships": "relationships text",
  "healthWellness": "health and wellness text",
  "spiritualGrowth": "spiritual growth text",
  "monthlyPredictions": "monthly predictions text",
  "remedies": ["remedy 1", "remedy 2", "remedy 3"]
}`;

    const completion = await openai.chat.completions.create({
      model: "gpt-4",
      messages: [
        {
          role: "system",
          content: "You are an expert Vedic astrologer with deep knowledge of astrology, birth charts, dashas, yogas, and predictive techniques. Provide insightful, personalized, and accurate astrological analysis."
        },
        {
          role: "user",
          content: prompt
        }
      ],
      temperature: 0.7,
      max_tokens: 3000,
    });

    const content = completion.choices[0].message.content;
    
    // Parse the JSON response
    let reportContent;
    try {
      reportContent = JSON.parse(content);
    } catch (parseError) {
      // If JSON parsing fails, extract content manually
      console.warn("Failed to parse JSON response, using fallback");
      reportContent = {
        overview: content,
        careerFinance: "",
        relationships: "",
        healthWellness: "",
        spiritualGrowth: "",
        monthlyPredictions: "",
        remedies: []
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
