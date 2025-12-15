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
 * Enhance Ashtakoot kuta descriptions with AI-generated narratives.
 * Takes the raw Ashtakoot data from astro-engine and returns
 * longer 5-6 line explanations for each kuta used in the
 * Basic Details section.
 */
async function enhanceAshtakootWithAI({ ashtakootData, boyName, girlName }) {
  try {
    if (!process.env.OPENAI_API_KEY) {
      console.warn("[MatchingAI] OpenAI API key not configured, skipping enhancement");
      return null;
    }

    if (!ashtakootData || !ashtakootData.kutas) {
      console.warn("[MatchingAI] No Ashtakoot data available for enhancement");
      return null;
    }

    const openai = getOpenAIClient();

    const { kutas, total_points, max_points } = ashtakootData;

    // Build a compact context object for the AI
    const context = {
      couple: {
        boyName,
        girlName,
      },
      summary: {
        total_points,
        max_points,
      },
      kutas: {
        varna: kutas.varna || null,
        bhakoot: kutas.bhakoot || null,
        graha_maitri: kutas.graha_maitri || null,
        gana: kutas.gana || null,
        nadi: kutas.nadi || null,
        vashya: kutas.vashya || null,
        tara: kutas.tara || null,
        yoni: kutas.yoni || null,
      },
    };

    const prompt = `You are an expert Vedic astrologer.
  Given the following Ashtakoot matching result for a couple, write detailed yet easy-to-understand explanations for each kuta.

  - Use the couple's names when helpful: Boy = ${boyName}, Girl = ${girlName}.
  - Explicitly mention the score for each kuta in plain language, for example: "You scored 2 out of 2 in Vashya" or "You received 4 out of 6 points in Gana".
  - Briefly explain what that score suggests for the relationship, including both strengths and areas to handle with understanding.
  - Each explanation must be a single coherent paragraph of 5-6 lines (3-5 sentences), easy for non-astrologers to follow.
  - Tone: warm, conservative, reassuring, realistic, and practical. Avoid dramatic or fatalistic language.
  - Clearly treat all insights as traditional Vedic beliefs, not guarantees or professional advice. Avoid any strong medical, financial, or legal claims.

  Ashtakoot data (JSON): ${JSON.stringify(context, null, 2)}

  Return ONLY a JSON object (no markdown, no comments) with this exact structure:
{
  "varna": { "enhanced_description": "5-6 line explanation for Varna compatibility" },
  "bhakoot": { "enhanced_description": "5-6 line explanation for Bhakoot (Love)" },
  "graha_maitri": { "enhanced_description": "5-6 line explanation for Graha Maitri (Mental compatibility)" },
  "gana": { "enhanced_description": "5-6 line explanation for Gana (Temperament)" },
  "nadi": { "enhanced_description": "5-6 line explanation for Nadi (Health)" },
  "vashya": { "enhanced_description": "5-6 line explanation for Vashya (Dominance/attraction)" },
  "tara": { "enhanced_description": "5-6 line explanation for Tara (Destiny/birth star)" },
  "yoni": { "enhanced_description": "5-6 line explanation for Yoni (Physical compatibility)" }
}`;

    const response = await openai.chat.completions.create({
      model: CHAT_MODEL,
      messages: [
        {
          role: "system",
          content:
            "You are an expert Vedic astrologer who writes accurate but gentle compatibility explanations. Always respond with valid JSON only, matching the requested schema. Be conservative and balanced, and always frame statements as possibilities or tendencies, not certainties.",
        },
        {
          role: "user",
          content: prompt,
        },
      ],
      temperature: 0.7,
      max_tokens: 1800,
    });

    const content = response.choices[0]?.message?.content?.trim();

    if (!content) {
      console.warn("[MatchingAI] No content in OpenAI response");
      return null;
    }

    let cleanContent = content;
    if (cleanContent.startsWith("```json")) {
      cleanContent = cleanContent.replace(/^```json\s*/, "").replace(/\s*```$/, "");
    } else if (cleanContent.startsWith("```")) {
      cleanContent = cleanContent.replace(/^```\s*/, "").replace(/\s*```$/, "");
    }

    const enhanced = JSON.parse(cleanContent);
    console.log("[MatchingAI] Successfully enhanced Ashtakoot explanations for couple", boyName, "&", girlName);
    return enhanced;
  } catch (error) {
    console.error("[MatchingAI] Enhancement failed:", error?.message || error);
    return null;
  }
}

module.exports = {
  enhanceAshtakootWithAI,
};
