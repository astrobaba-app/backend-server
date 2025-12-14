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
 * Generate detailed, human-style narratives for the Free Report sections
 * using the existing kundli analysis data.
 *
 * This does NOT change any business logic – it only turns the
 * structured analysis into longer textual explanations.
 */
async function generateFreeReportNarratives({
  basicDetails,
  personality,
  remedies,
  horoscope,
  manglikAnalysis,
}) {
  try {
    const openai = getOpenAIClient();

    const ascInfluence = horoscope?.personality_analysis?.ascendant_influence || {};
    const overallPersonality =
      horoscope?.personality_analysis?.overall_personality ||
      personality?.personality_report ||
      null;
    const healthAnalysis = horoscope?.health_indications || {};

    const context = {
      user: {
        fullName: basicDetails?.name || basicDetails?.fullName || null,
        gender: basicDetails?.gender || null,
        dateOfBirth: basicDetails?.dateOfBirth || basicDetails?.date || null,
        timeOfBirth: basicDetails?.timeOfBirth || basicDetails?.time || null,
        placeOfBirth: basicDetails?.placeOfBirth || basicDetails?.place || null,
      },
      ascendant: {
        sign:
          ascInfluence.sign ||
          personality?.ascendant_sign ||
          basicDetails?.ascendant?.sign ||
          null,
        description: ascInfluence.description || personality?.ascendant_report || null,
        physicalAppearance:
          ascInfluence.physical_appearance ||
          personality?.physical_characteristics ||
          null,
      },
      personality: {
        overall: overallPersonality,
        health: healthAnalysis.constitution || personality?.health_report || null,
      },
      remedies: remedies || {},
      doshas: {
        manglik: manglikAnalysis || null,
        kalsarpa: manglikAnalysis?.all_doshas?.kaal_sarp_dosha || null,
        sadesati: manglikAnalysis?.sadesati || null,
      },
    };

    const systemPrompt = `You are an expert Vedic astrologer writing detailed yet simple Free Report explanations in Indian English.
- Write friendly, positive but honest guidance.
- Use only the information provided in the JSON context; do NOT invent birth details, signs or predictions that are not given.
- Each paragraph should be about 5-6 sentences (not bullet points).
- Avoid technical jargon unless it is already present; explain things in simple language that a layperson can understand.
- Do not mention that you are an AI or that this is generated.
- Do not ask questions to the user.
`;

    const userPrompt = `Using the kundli analysis data below, write detailed narrative texts for the Free Report sections.
Return a SINGLE JSON object in this exact structure (no extra keys, no commentary):
{
  "general": {
    "ascendant_overview": string,      // 5-6 sentences about ascendant and overall life approach
    "personality": string,             // 5-6 sentences about personality & mindset
    "physical": string,                // 5-6 sentences about body & physical traits
    "health": string                   // 5-6 sentences about health tendencies
  },
  "remedies": {
    "overview": string,                // overall view of remedies and how they help
    "rudraksha": string,               // 5-6 sentences about rudraksha advice
    "gemstones": string                // 5-6 sentences about gemstone advice
  },
  "dosha": {
    "overview": string,                // overall view of doshas in this chart
    "manglik": string,                 // 5-6 sentences about Manglik status (or absence)
    "kalsarpa": string,                // 5-6 sentences about Kaal Sarp (or absence)
    "sadesati": string                 // 5-6 sentences about Sadesati status (or absence)
  }
}

Use the following JSON as factual context:
${JSON.stringify(context)}
`;

    const completion = await openai.chat.completions.create({
      model: CHAT_MODEL,
      messages: [
        { role: "system", content: systemPrompt },
        { role: "user", content: userPrompt },
      ],
      temperature: 0.7,
      // Give enough room so JSON is not cut in the middle of a string
      max_tokens: 1400,
      response_format: { type: "json_object" },
    });

    let content = completion.choices[0]?.message?.content;
    if (!content) {
      return null;
    }

    // In JSON mode, content *should* be valid JSON, but be defensive
    // in case the model adds surrounding text or the response is truncated.
    let parsed;
    try {
      parsed = JSON.parse(content);
    } catch (err) {
      console.error("[FreeReportAI] Failed to parse JSON response (direct):", err?.message || err);
      // Try to salvage the JSON portion between first '{' and last '}'
      const start = content.indexOf("{");
      const end = content.lastIndexOf("}");
      if (start !== -1 && end !== -1 && end > start) {
        const jsonSlice = content.slice(start, end + 1);
        try {
          parsed = JSON.parse(jsonSlice);
        } catch (innerErr) {
          console.error(
            "[FreeReportAI] Failed to parse JSON response (slice):",
            innerErr?.message || innerErr
          );
          // Log a small prefix of the content for debugging
          console.error("[FreeReportAI] Raw content prefix:", content.slice(0, 500));
          return null;
        }
      } else {
        console.error("[FreeReportAI] Could not locate JSON object in response.");
        console.error("[FreeReportAI] Raw content prefix:", content.slice(0, 500));
        return null;
      }
    }

    return parsed;
  } catch (error) {
    console.error("[FreeReportAI] Error generating narratives:", error?.message || error);
    return null;
  }
}

module.exports = {
  generateFreeReportNarratives,
};
