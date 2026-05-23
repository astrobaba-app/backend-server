const OpenAI = require("openai");
const { buildInsightPayload } = require("./astroInsightEngineService");

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

function normalizeDateOnly(value = new Date()) {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return new Date().toISOString().slice(0, 10);
  return date.toISOString().slice(0, 10);
}

function buildKundliFromLegacyInput({
  basicDetails,
  personality,
  remedies,
  horoscope,
  manglikAnalysis,
  dasha,
  planetary,
  ashtakvarga,
  yogas,
}) {
  return {
    basicDetails: basicDetails || null,
    personality: personality || null,
    remedies: remedies || null,
    horoscope: horoscope || null,
    manglikAnalysis: manglikAnalysis || null,
    dasha: dasha || null,
    planetary: planetary || null,
    ashtakvarga: ashtakvarga || null,
    yogas: yogas || null,
  };
}

function fallbackNarrativeFromInsight(insightPayload) {
  const topBuckets = insightPayload.topBuckets || [];
  const natal = insightPayload?.llmPayload?.natal_summary || {};
  const mainTheme = insightPayload?.mainTheme || "daily guidance";
  const asc = natal?.lagna || "your ascendant";
  const moon = natal?.moon_sign || "your moon sign";
  const top1 = topBuckets[0]?.label || "current life priorities";
  const top2 = topBuckets[1]?.label || "relationships and routine";
  const top3 = topBuckets[2]?.label || "practical planning";

  const lineForBucket = (bucket) => {
    const supports = (bucket.supporting_factors || []).slice(0, 2).join(". ");
    const cautions = (bucket.caution_factors || []).slice(0, 2).join(". ");
    return {
      bucket: bucket.bucket,
      title: bucket.label,
      summary:
        `${bucket.label} is active with ${bucket.confidence_label} confidence. ` +
        `${supports || "Relevant chart factors are active."}` +
        (cautions ? ` Caution: ${cautions}` : ""),
      actions: bucket.recommended_actions || [],
      remedies: bucket.remedies || [],
      score: bucket.score,
      challenge_score: bucket.challenge_score,
    };
  };

  return {
    engine_version: "insight_engine_v1",
    generated_by: "deterministic_fallback",
    generated_at: new Date().toISOString(),
    insight: {
      main_theme: insightPayload.mainTheme,
      confidence_score: insightPayload.confidenceScore,
      top_buckets: topBuckets.map(lineForBucket),
      recommended_actions: insightPayload.recommendedActions || [],
      remedies: insightPayload.remedies || [],
      dasha_context: insightPayload.dashaContext || {},
      transit_context: insightPayload.transitContext || {},
      llm_payload: insightPayload.llmPayload || {},
    },
    legacy: {
      general: {
        ascendant_overview:
          `Your ascendant is ${asc}, and this gives you a practical way of approaching life, even during emotional days. ` +
          `Right now, your chart points more strongly toward ${top1.toLowerCase()}, so steady effort will work better than rushing. ` +
          `You may notice that clarity grows when you keep your day simple and focus on one meaningful priority at a time. ` +
          `Conversations with family or close people can feel more supportive when you speak clearly and stay patient. ` +
          `This is a good period to trust your natural strengths and take small consistent steps rather than waiting for perfect timing. ` +
          `Your progress is likely to build through discipline, balance, and realistic expectations.`,
        personality:
          `Your emotional style is influenced by ${moon}, so mood and mindset can shape your decisions more than usual in this phase. ` +
          `You will do best when you avoid overthinking and bring your attention back to what you can control today. ` +
          `A calm routine, clear communication, and measured responses will help you feel more centered and confident. ` +
          `If plans change suddenly, treat it as an adjustment period instead of a setback. ` +
          `Your chart suggests that maturity in speech and consistency in action can improve outcomes across multiple areas. ` +
          `Keep your approach simple, grounded, and steady for the best results this cycle.`,
        physical:
          `Your presence can feel stronger when you maintain clean daily habits and give your body proper rest. ` +
          `On busy days, do not ignore hydration, movement, and sleep, because these directly affect focus and confidence. ` +
          `Even a short self-care routine can improve your mental clarity and how you present yourself to others. ` +
          `Try to avoid irregular schedules, as they may increase restlessness or reduce motivation. ` +
          `Small lifestyle discipline now can create noticeable improvements in both energy and mood. ` +
          `Think of this period as a time to strengthen your foundation from the inside out.`,
        health:
          `This period asks for balanced routines rather than extremes, especially around rest, food timing, and stress management. ` +
          `If your mind feels overloaded, reduce unnecessary pressure and return to a simple daily structure. ` +
          `Gentle activity, better sleep hygiene, and regular hydration can make a meaningful difference. ` +
          `Try to pace your commitments so your energy stays stable across the week. ` +
          `Use mindfulness, prayer, or quiet reflection to settle emotional heaviness when needed. ` +
          `If any discomfort persists, take timely professional advice and support your body with practical care.`,
      },
      remedies: {
        overview:
          "Remedies are prioritized using active pressure planets and current bucket challenges with practical grounding actions.",
        rudraksha:
          "Rudraksha guidance is treated as supportive and should be applied with consistency and personal suitability.",
        gemstones:
          "Gemstones are not treated as mandatory purchases and should be reviewed before use.",
      },
      dosha: {
        overview:
          "Dosha interpretation is balanced with dasha and transit context so that the user receives practical guidance instead of fear-based language.",
        manglik:
          "Manglik factors are explained as manageable tendencies with focus on maturity and constructive actions.",
        kalsarpa:
          "Kaal Sarp themes are framed as patterns that can be worked with through clarity, routine and grounded choices.",
        sadesati:
          "Sade Sati is explained through discipline, emotional grounding and long-term patience.",
      },
    },
  };
}

function buildInsightPayloadForReport({
  userRequest,
  kundli,
  basicDetails,
  personality,
  remedies,
  horoscope,
  manglikAnalysis,
  dasha,
  planetary,
  ashtakvarga,
  yogas,
}) {
  const normalizedUserRequest = userRequest || {
    id: "free-report",
    userId: "free-report",
    fullName: basicDetails?.name || basicDetails?.fullName || "User",
    dateOfbirth: basicDetails?.date || basicDetails?.dateOfBirth || null,
    timeOfbirth: basicDetails?.time || basicDetails?.timeOfBirth || null,
    placeOfBirth: basicDetails?.place || basicDetails?.placeOfBirth || null,
  };

  const normalizedKundli =
    kundli ||
    buildKundliFromLegacyInput({
      basicDetails,
      personality,
      remedies,
      horoscope,
      manglikAnalysis,
      dasha,
      planetary,
      ashtakvarga,
      yogas,
    });

  return buildInsightPayload({
    userRequest: normalizedUserRequest,
    kundli: normalizedKundli,
    transit: normalizedKundli?.horoscope?.transit || { datetime: new Date().toISOString(), transits: {} },
    date: normalizeDateOnly(new Date()),
  });
}

async function generateFreeReportNarratives({
  userRequest,
  kundli,
  basicDetails,
  personality,
  remedies,
  horoscope,
  manglikAnalysis,
  dasha,
  planetary,
  ashtakvarga,
  yogas,
}) {
  try {
    const insightPayload = buildInsightPayloadForReport({
      userRequest,
      kundli,
      basicDetails,
      personality,
      remedies,
      horoscope,
      manglikAnalysis,
      dasha,
      planetary,
      ashtakvarga,
      yogas,
    });

    if (!process.env.OPENAI_API_KEY) {
      return fallbackNarrativeFromInsight(insightPayload);
    }

    const openai = getOpenAIClient();
    const systemPrompt = `You are Graho's Vedic astrology report writer.
- Use ONLY the structured payload provided.
- Do not invent placements.
- Explain clearly and practically in Indian English.
- Avoid fear language and deterministic certainty.
- Keep health and money sections safety-compliant.
- Return JSON only.`;

    const userPrompt = `Generate a complete free report from this insight engine payload.
Return JSON with EXACT keys:
{
  "engine_version": "insight_engine_v1",
  "generated_by": "llm",
  "generated_at": string,
  "insight": {
    "main_theme": string,
    "confidence_score": number,
    "top_buckets": [
      {
        "bucket": string,
        "title": string,
        "summary": string,
        "actions": string[],
        "remedies": [{"planet": string, "reason": string, "remedy": string}],
        "score": number,
        "challenge_score": number
      }
    ],
    "recommended_actions": string[],
    "remedies": [{"planet": string, "reason": string, "remedy": string}],
    "dasha_context": object,
    "transit_context": object,
    "llm_payload": object
  },
  "legacy": {
    "general": {
      "ascendant_overview": string,
      "personality": string,
      "physical": string,
      "health": string
    },
    "remedies": {
      "overview": string,
      "rudraksha": string,
      "gemstones": string
    },
    "dosha": {
      "overview": string,
      "manglik": string,
      "kalsarpa": string,
      "sadesati": string
    }
  }
}

Payload:
${JSON.stringify(insightPayload)}`;

    const completion = await openai.chat.completions.create({
      model: CHAT_MODEL,
      messages: [
        { role: "system", content: systemPrompt },
        { role: "user", content: userPrompt },
      ],
      temperature: 0.45,
      max_tokens: 2500,
      response_format: { type: "json_object" },
    });

    const content = completion.choices[0]?.message?.content;
    if (!content) {
      return fallbackNarrativeFromInsight(insightPayload);
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
        console.error("[FreeReportAI] Invalid JSON in LLM output:", err?.message || err);
        return fallbackNarrativeFromInsight(insightPayload);
      }
    }

    return {
      engine_version: "insight_engine_v1",
      generated_by: "llm",
      generated_at: new Date().toISOString(),
      ...parsed,
      insight: {
        ...(parsed.insight || {}),
        main_theme: parsed?.insight?.main_theme || insightPayload.mainTheme,
        confidence_score:
          typeof parsed?.insight?.confidence_score === "number"
            ? parsed.insight.confidence_score
            : insightPayload.confidenceScore,
        llm_payload: parsed?.insight?.llm_payload || insightPayload.llmPayload,
      },
    };
  } catch (error) {
    console.error("[FreeReportAI] Error generating narratives:", error?.message || error);
    try {
      const insightPayload = buildInsightPayloadForReport({
        userRequest,
        kundli,
        basicDetails,
        personality,
        remedies,
        horoscope,
        manglikAnalysis,
        dasha,
        planetary,
        ashtakvarga,
        yogas,
      });
      return fallbackNarrativeFromInsight(insightPayload);
    } catch {
      return null;
    }
  }
}

module.exports = {
  generateFreeReportNarratives,
};
