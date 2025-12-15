const OpenAI = require("openai");

const CHAT_MODEL = process.env.OPENAI_CHAT_MODEL || "gpt-4o-mini";

let openaiClient = null;

function getOpenAIClient() {
  if (!openaiClient) {
    openaiClient = new OpenAI({
      apiKey: process.env.OPENAI_API_KEY,
    });
  }
  return openaiClient;
}

/**
 * Enhance horoscope data with AI-generated narratives
 * Converts structured predictions into 6-7 line explanations for each section
 */
async function enhanceHoroscopeWithAI({ zodiacSign, period, horoscopeData }) {
  try {
    if (!process.env.OPENAI_API_KEY) {
      console.warn('[HoroscopeAI] OpenAI API key not configured, skipping enhancement');
      return null;
    }

    const openai = getOpenAIClient();
    const predictions = horoscopeData.predictions;

    if (!predictions) {
      console.warn('[HoroscopeAI] No predictions data available');
      return null;
    }

    // Build context for AI
    const context = {
      zodiacSign,
      period,
      date: horoscopeData.date || horoscopeData.start_date || horoscopeData.month || horoscopeData.year,
      moonPhase: horoscopeData.moon_phase,
      predictions: {
        overview: predictions.overall || predictions.overview,
        love: predictions.love || predictions.love_relationships,
        career: predictions.career || predictions.career_business,
        finance: predictions.finance || predictions.finance_wealth,
        health: predictions.health || predictions.health_wellness,
        emotions: predictions.emotions_mind,
        travel: predictions.travel_movement,
        personal: predictions.spiritual_growth,
      },
      luckyElements: horoscopeData.lucky_elements,
      remedies: horoscopeData.remedies,
    };

    const prompt = `You are an expert Vedic astrologer. Generate engaging, personalized horoscope narratives for ${zodiacSign} for their ${period} horoscope.

Context:
- Zodiac Sign: ${zodiacSign}
- Period: ${period}
- Date: ${context.date}
- Moon Phase: ${context.moonPhase || 'N/A'}

For each section below, create a 6-7 line narrative that:
1. Is warm, personal, and directly addresses the reader
2. Incorporates the key predictions and insights
3. Provides actionable advice and encouragement
4. Maintains an optimistic yet realistic tone
5. Uses conversational, easy-to-understand language

Sections to enhance:
1. Overview: ${JSON.stringify(context.predictions.overview)}
2. Love & Relationships: ${JSON.stringify(context.predictions.love)}
3. Personal Life: ${JSON.stringify(context.predictions.personal)}
4. Career & Finance: ${JSON.stringify(context.predictions.career)} + ${JSON.stringify(context.predictions.finance)}
5. Health & Wellness: ${JSON.stringify(context.predictions.health)}
6. Emotions & Mind: ${JSON.stringify(context.predictions.emotions)}
7. Lucky Insights: ${JSON.stringify(context.luckyElements)}
8. Travel & Movement: ${JSON.stringify(context.predictions.travel)}
9. Remedies: ${JSON.stringify(context.remedies)}

Return ONLY a JSON object with this exact structure (no markdown, no explanation):
{
  "overview": "6-7 line narrative...",
  "love_relationships": "6-7 line narrative...",
  "personal_life": "6-7 line narrative...",
  "career_finance": "6-7 line narrative...",
  "health_wellness": "6-7 line narrative...",
  "emotions_mind": "6-7 line narrative...",
  "lucky_insights": "6-7 line narrative...",
  "travel_movement": "6-7 line narrative...",
  "remedies": "6-7 line narrative..."
}`;

    const response = await openai.chat.completions.create({
      model: CHAT_MODEL,
      messages: [
        {
          role: "system",
          content: "You are an expert Vedic astrologer who creates warm, personalized, and insightful horoscope narratives. Always respond with valid JSON only.",
        },
        {
          role: "user",
          content: prompt,
        },
      ],
      temperature: 0.7,
      max_tokens: 2000,
    });

    const content = response.choices[0]?.message?.content?.trim();
    
    if (!content) {
      console.warn('[HoroscopeAI] No content in OpenAI response');
      return null;
    }

    // Clean markdown formatting if present
    let cleanContent = content;
    if (cleanContent.startsWith('```json')) {
      cleanContent = cleanContent.replace(/^```json\s*/, '').replace(/\s*```$/, '');
    } else if (cleanContent.startsWith('```')) {
      cleanContent = cleanContent.replace(/^```\s*/, '').replace(/\s*```$/, '');
    }

    const enhanced = JSON.parse(cleanContent);
    
    console.log(`[HoroscopeAI] Successfully enhanced ${period} horoscope for ${zodiacSign}`);
    return enhanced;

  } catch (error) {
    console.error('[HoroscopeAI] Enhancement failed:', error?.message || error);
    
    // Return null instead of throwing to allow graceful degradation
    return null;
  }
}

module.exports = {
  enhanceHoroscopeWithAI,
};
