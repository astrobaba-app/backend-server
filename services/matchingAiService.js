const { createChatCompletion } = require("./openaiClient");

const CHAT_MODEL = process.env.OPENAI_CHAT_MODEL || "gpt-4o-mini";

/**
 * Enhance Ashtakoot kuta descriptions with AI-generated narratives.
 */
async function enhanceAshtakootWithAI({ ashtakootData, boyName, girlName, context = {} }) {
  try {
    if (!process.env.OPENAI_API_KEY) {
      console.warn("[MatchingAI] OpenAI API key not configured, skipping enhancement");
      return null;
    }

    if (!ashtakootData || !ashtakootData.kutas) {
      console.warn("[MatchingAI] No Ashtakoot data available for enhancement");
      return null;
    }

    const loggingContext = { feature: "matching_ai", ...context };
    const { kutas, total_points, max_points } = ashtakootData;

    const dataContext = {
      couple: { boyName, girlName },
      summary: { total_points, max_points },
      kutas: {
        varna: kutas.varna || null,
        vashya: kutas.vashya || null,
        tara: kutas.tara || null,
        yoni: kutas.yoni || null,
        graha_maitri: kutas.graha_maitri || null,
        gana: kutas.gana || null,
        bhakoot: kutas.bhakoot || null,
        nadi: kutas.nadi || null,
      },
    };

    const prompt = `You are an expert Vedic astrologer explaining a Kundli match to a modern couple. 

Given the Ashtakoot matching result, generate the text for a UI table. 
CRITICAL RULES:
- Write in rich, flowing paragraphs. Strictly NO bullet points, NO lists, and NO disjointed one-liners.
- Use simple, professional English that a beginner can easily understand. Avoid dense jargon.

For EACH of the 8 Kutas, provide:
1. "area_of_life": A short 2-5 word phrase representing what this Kuta governs.
2. "description": A descriptive 2-3 sentence paragraph explaining how the couple's specific combination and score affect their relationship. Keep it reassuring but realistic. Use the names ${boyName} and ${girlName} naturally.
3. "meaning": A rich 2-3 sentence paragraph defining what this Kuta signifies in Vedic astrology.

Also provide:
4. "conclusion": A complete 3-4 sentence paragraph for the bottom of the table stating their total score (${total_points} out of ${max_points}) and a final, thoughtful verdict on the marriage.

Ashtakoot data (JSON): ${JSON.stringify(dataContext, null, 2)}

Return ONLY a JSON object with this exact structure:
{
  "varna": { "area_of_life": "", "description": "", "meaning": "" },
  "vashya": { "area_of_life": "", "description": "", "meaning": "" },
  "tara": { "area_of_life": "", "description": "", "meaning": "" },
  "yoni": { "area_of_life": "", "description": "", "meaning": "" },
  "graha_maitri": { "area_of_life": "", "description": "", "meaning": "" },
  "gana": { "area_of_life": "", "description": "", "meaning": "" },
  "bhakoot": { "area_of_life": "", "description": "", "meaning": "" },
  "nadi": { "area_of_life": "", "description": "", "meaning": "" },
  "conclusion": ""
}`;

    const response = await createChatCompletion({
      model: CHAT_MODEL,
      messages: [
        {
          role: "system",
          content:
            "You are an expert Vedic astrologer formatting data for a UI table. Write in simple, beautiful, and professional prose. Never use bullet points. Always respond with valid JSON only.",
        },
        {
          role: "user",
          content: prompt,
        },
      ],
      temperature: 0.7,
      max_tokens: 2000,
    }, loggingContext);

    const content = response.choices[0]?.message?.content?.trim();

    if (!content) {
      console.warn("[MatchingAI] No content in OpenAI response");
      return null;
    }

    let cleanContent = content;
    if (cleanContent.startsWith("```json")) cleanContent = cleanContent.replace(/^```json\s*/, "");
    if (cleanContent.startsWith("```")) cleanContent = cleanContent.replace(/^```\s*/, "");
    cleanContent = cleanContent.replace(/\s*```$/, "");

    const enhanced = JSON.parse(cleanContent);
    console.log(`[MatchingAI] Successfully enhanced Ashtakoot explanations for ${boyName} & ${girlName}`);
    return enhanced;
  } catch (error) {
    console.error("[MatchingAI] Enhancement failed:", error?.message || error);
    return null;
  }
}

/**
 * Enhance raw Manglik Dosha arrays into beautiful UI text
 */
async function enhanceManglikWithAI({ maleMangal, femaleMangal, boyName, girlName, context = {} }) {
  try {
    if (!process.env.OPENAI_API_KEY) return null;
    
    const loggingContext = { feature: "matching_ai_manglik", ...context };

    const prompt = `You are an expert Vedic astrologer. 
I have raw Manglik (Mars Dosha) data for a couple. Translate this robotic data into clear, reassuring, and professional paragraphs.

CRITICAL RULES:
- Strictly NO bullet points and NO lists.
- Write proper, rich sentences. Ensure each field contains 2 to 3 complete, descriptive sentences.
- Use simple, easy-to-understand English suitable for someone who knows nothing about astrology.

Boy (${boyName}) Raw Data: ${JSON.stringify(maleMangal)}
Girl (${girlName}) Raw Data: ${JSON.stringify(femaleMangal)}

For EACH person, provide:
1. "aspects_text": A rich 2-3 sentence paragraph explaining how Mars's aspects impact them based on the raw arrays.
2. "house_text": A descriptive 2-3 sentence paragraph explaining Mars's house placement.
3. "analysis_text": A smooth, reassuring 2-3 sentence paragraph summarizing their Manglik status (e.g., if it is cancelled, explain why beautifully and simply).

Return ONLY a JSON object with this exact structure:
{
  "male": {
    "aspects_text": "",
    "house_text": "",
    "analysis_text": ""
  },
  "female": {
    "aspects_text": "",
    "house_text": "",
    "analysis_text": ""
  }
}`;

    const response = await createChatCompletion({
      model: CHAT_MODEL,
      messages: [
        { role: "system", content: "You are an expert Vedic astrologer writing for a consumer audience. Return only valid JSON. Write exclusively in complete, flowing paragraphs." },
        { role: "user", content: prompt }
      ],
      temperature: 0.7,
      max_tokens: 1500,
    }, loggingContext);

    const content = response.choices[0]?.message?.content?.trim();
    
    let cleanContent = content;
    if (cleanContent.startsWith("```json")) cleanContent = cleanContent.replace(/^```json\s*/, "");
    if (cleanContent.startsWith("```")) cleanContent = cleanContent.replace(/^```\s*/, "");
    cleanContent = cleanContent.replace(/\s*```$/, "");
    
    return JSON.parse(cleanContent);
  } catch (error) {
    console.error("[MatchingAI] Manglik enhancement failed:", error?.message || error);
    return null;
  }
}

module.exports = {
  enhanceAshtakootWithAI,
  enhanceManglikWithAI,
};