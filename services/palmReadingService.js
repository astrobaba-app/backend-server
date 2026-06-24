const { createChatCompletion, getOpenAIClient } = require("./openaiClient");
const { logOpenAIRequest } = require("./openaiRequestLogService");
const { buildStructuredInsights } = require("./palmistryRulesService");

const PALM_DEBUG = String(process.env.PALM_DEBUG_LOGS || "").toLowerCase() === "true";

const getUserId = (metadata = {}) => metadata.user_id || metadata.userId || null;

const buildOpenAIContext = (metadata = {}, feature) => ({
  userId: getUserId(metadata),
  feature,
  metadata: {
    palmUploadId: metadata.palm_upload_id || null,
    jobId: metadata.job_id || null,
  },
});

const extractJsonObject = (value) => {
  if (value && typeof value === "object") return value;
  const raw = String(value || "").trim();
  if (!raw) throw new Error("OpenAI returned empty JSON content");

  try {
    return JSON.parse(raw);
  } catch (_) {
    const withoutFence = raw.startsWith("```")
      ? raw.replace(/^```(?:json)?/i, "").replace(/```$/i, "").trim()
      : raw;
    const firstBrace = withoutFence.indexOf("{");
    const lastBrace = withoutFence.lastIndexOf("}");
    if (firstBrace === -1 || lastBrace <= firstBrace) {
      throw new Error("OpenAI returned invalid JSON content");
    }
    return JSON.parse(withoutFence.slice(firstBrace, lastBrace + 1));
  }
};

const safeJson = (value) => JSON.stringify(value, null, 2);

const logTokenUsage = (feature, completion, extra = {}) => {
  const usage = completion?.usage || {};
  const normalized = {
    feature,
    promptTokens: usage.prompt_tokens ?? usage.promptTokens ?? null,
    completionTokens: usage.completion_tokens ?? usage.completionTokens ?? null,
    totalTokens: usage.total_tokens ?? usage.totalTokens ?? null,
    ...extra,
  };
  console.log("[PalmReport][OpenAI] token_usage", normalized);
  return normalized;
};

const aggregateTokenUsage = (items = []) =>
  items.reduce(
    (acc, item) => {
      acc.inputTokens += Number(item?.promptTokens ?? item?.inputTokens ?? 0);
      acc.outputTokens += Number(item?.completionTokens ?? item?.outputTokens ?? 0);
      acc.totalTokens += Number(item?.totalTokens ?? 0);
      acc.calls.push(item);
      return acc;
    },
    { inputTokens: 0, outputTokens: 0, totalTokens: 0, calls: [] }
  );

const getChoiceDebug = (completion) => {
  const choice = completion?.choices?.[0] || {};
  const message = choice.message || {};
  return {
    finishReason: choice.finish_reason || null,
    refusal: message.refusal || null,
    hasContent: Boolean(String(message.content || "").trim()),
  };
};

const checkPalmEngineHealth = async () => {
  if (!process.env.OPENAI_API_KEY) {
    return {
      ok: false,
      reason: "OPENAI_API_KEY is missing",
      service: "backend_palm_analysis",
    };
  }

  return {
    ok: true,
    service: "backend_palm_analysis",
  };
};

async function openaiExtractFeatures(imageUrls, metadata = {}) {
  const prompt =
    "You are a palm feature extractor with strong fraud/quality/safety screening. Return only strict JSON with keys: " +
    "fraud_quality_checks, hand_shape, life_line, heart_line, head_line, fate_line, sun_line, mounts, " +
    "finger_proportions, thumb_structure, line_clarity, line_depth, line_curvature, major_markings, confidence_scores. " +
    "For each main line, include quality as one of deep|balanced|faint|broken and notes. " +
    "fraud_quality_checks must include: " +
    "{quality_score:0-100, blur_score:0-100, low_quality:boolean, multiple_hands:boolean, cartoon_or_illustration:boolean, " +
    "ai_generated_suspected:boolean, human_hand_detected:boolean, fake_hand_suspected:boolean, " +
    "unsafe_content_suspected:boolean, needs_moderation_fallback:boolean, " +
    "reject:boolean, reject_reasons:string[]}. " +
    "Reject if fake hand, AI-generated, low-quality, cartoon hand, multiple hands, or unsafe content is clearly detected. " +
    "Be strict on quality; do not extract palmistry insights when quality is poor.";

  const fallbackPrompt =
    "Return one strict JSON object for a user-provided right-hand palm image. This is not identity recognition. " +
    "Do not identify the person. Only inspect image quality and visible palm-line features. " +
    "Required JSON keys: fraud_quality_checks, hand_shape, life_line, heart_line, head_line, fate_line, sun_line, mounts, " +
    "finger_proportions, thumb_structure, line_clarity, line_depth, line_curvature, major_markings, confidence_scores. " +
    "fraud_quality_checks must contain quality_score, blur_score, low_quality, multiple_hands, cartoon_or_illustration, " +
    "ai_generated_suspected, human_hand_detected, fake_hand_suspected, unsafe_content_suspected, needs_moderation_fallback, reject, reject_reasons.";

  const buildContent = (textPrompt) => {
    const content = [{ type: "text", text: textPrompt }];
    for (const url of imageUrls) {
      content.push({ type: "image_url", image_url: { url } });
    }
    if (metadata && Object.keys(metadata).length) {
      content.push({ type: "text", text: `Metadata: ${JSON.stringify(metadata)}` });
    }
    return content;
  };

  const tokenUsages = [];
  const attempts = [
    { feature: "palm_reading_vision", prompt },
    { feature: "palm_reading_vision_retry_compact", prompt: fallbackPrompt },
  ];

  let lastError = null;
  for (const attempt of attempts) {
    const content = buildContent(attempt.prompt);
    const completion = await createChatCompletion(
      {
        model: process.env.OPENAI_VISION_MODEL || process.env.OPENAI_PALM_VISION_MODEL || "gpt-4o",
        messages: [{ role: "user", content }],
        temperature: 0.1,
        max_tokens: Number(process.env.OPENAI_PALM_VISION_MAX_TOKENS || 1800),
        response_format: { type: "json_object" },
      },
      buildOpenAIContext(metadata, attempt.feature)
    );

    const tokenUsage = logTokenUsage(attempt.feature, completion, {
      userId: getUserId(metadata),
      imageCount: imageUrls.length,
      choice: getChoiceDebug(completion),
    });
    tokenUsages.push(tokenUsage);
    const rawContent = completion.choices?.[0]?.message?.content || "";
    try {
      return { data: extractJsonObject(rawContent), tokenUsage: aggregateTokenUsage(tokenUsages) };
    } catch (error) {
      lastError = error;
      console.warn("[PalmReport][OpenAI] vision_empty_or_invalid_json", {
        feature: attempt.feature,
        userId: getUserId(metadata),
        jobId: metadata.job_id || null,
        palmUploadId: metadata.palm_upload_id || null,
        message: error.message,
        choice: getChoiceDebug(completion),
      });
    }
  }

  throw lastError || new Error("OpenAI returned empty JSON content");
}

async function moderationCheck(imageUrls, metadata = {}) {
  const openai = getOpenAIClient();
  if (!openai) {
    throw new Error("OpenAI API key not configured");
  }

  const input = imageUrls.map((url) => ({
    type: "image_url",
    image_url: { url },
  }));
  const model = process.env.OPENAI_MODERATION_MODEL || "omni-moderation-latest";
  const startTime = Date.now();

  try {
    const response = await openai.moderations.create({ model, input });
    await logOpenAIRequest({
      context: buildOpenAIContext(metadata, "palm_reading_nsfw"),
      openaiEndpoint: "/v1/moderations",
      requestType: "moderations.create",
      model,
      response,
      status: "success",
      durationMs: Date.now() - startTime,
    });

    const result = response.results?.[0] || {};
    return {
      flagged: Boolean(result.flagged),
      categories: result.categories || {},
      category_scores: result.category_scores || {},
    };
  } catch (error) {
    await logOpenAIRequest({
      context: buildOpenAIContext(metadata, "palm_reading_nsfw"),
      openaiEndpoint: "/v1/moderations",
      requestType: "moderations.create",
      model,
      response: null,
      status: "error",
      durationMs: Date.now() - startTime,
      error,
    });
    throw error;
  }
}

const fallbackSection = (section = {}, insights = {}) => {
  const title = section.title || "Palmistry Guidance";
  const strengths = Array.isArray(insights.strengths) ? insights.strengths : [];
  const warnings = Array.isArray(insights.golden_warnings) ? insights.golden_warnings : [];
  const lineData = insights.line_interpretations || {};
  const firstLine = lineData && typeof lineData === "object" ? Object.values(lineData)[0] : null;
  const lineSummary = firstLine && typeof firstLine === "object" ? firstLine.summary || "" : "";
  const strengthText = strengths[0] || "steady self-development";
  const warningText = warnings[0] || "avoid rushed decisions";

  return {
    key: section.key || title.toLowerCase().replace(/\s+/g, "_"),
    title,
    opening: `This chapter studies ${title.toLowerCase()} through visible palm structures and their symbolic meaning.`,
    body: [
      `Your palm indicates ${strengthText}. This chapter should be read as a practical reflection on your choices, habits, timing, and self-awareness rather than as a fixed prediction.`,
      `${lineSummary || "The visible palm structure suggests that your strongest progress comes through patience, discipline, and repeated improvement."}`,
      "In day-to-day life, this means you benefit from slowing down before major decisions, noticing repeated emotional or career patterns, and choosing the path that supports long-term stability. The palm points toward tendencies, but your effort decides how strongly those tendencies mature.",
      "Use this section as a planning note: observe where your energy is naturally strong, where you become reactive, and where consistency can turn a small advantage into a dependable life pattern.",
    ].join("\n\n"),
    success_codes: [
      "Work with patience and consistency.",
      "Use intuition together with practical planning.",
      "Review this guidance before making major decisions.",
    ],
    golden_warnings: [warningText],
    table: insights.profile_table || [],
    fallback: true,
  };
};

const composeFinalNarrative = (sections) =>
  sections
    .map((section) => {
      const parts = [`**${section.title || "Palmistry Guidance"}**`];
      if (section.opening) parts.push(String(section.opening));
      if (section.body) parts.push(String(section.body));
      if (Array.isArray(section.success_codes) && section.success_codes.length) {
        parts.push(`Success codes: ${section.success_codes.slice(0, 5).join("; ")}`);
      }
      if (Array.isArray(section.golden_warnings) && section.golden_warnings.length) {
        parts.push(`Golden warnings: ${section.golden_warnings.slice(0, 3).join("; ")}`);
      }
      return parts.join("\n");
    })
    .join("\n\n")
    .trim();

async function generateOneReportSection(section, insights, metadata = {}, kundliContext = null) {
  const prompt =
    "Write one chapter of a premium palmistry and kundli-supported PDF report. Return only strict JSON with keys: " +
    "key, title, opening, body, success_codes, golden_warnings, table. " +
    "Rules: do not invent observed palm features; base palm claims only on supplied structured insights; " +
    "use the focused kundli context only for timing, temperament, karmic themes, and domain emphasis; " +
    "if palm and kundli disagree, write it as a balanced tendency, not a certainty; " +
    "write in professional second-person guidance; avoid certainty; do not mention AI or raw JSON; " +
    "body must be 260-420 words; success_codes must be 3-5 short strings; golden_warnings must be 1-3 strings; " +
    "table must be 0-4 rows with feature, observation, interpretation. " +
    "Use Hasta Samudrika style language and light Vedic context, but stay practical and modern.";

  try {
    const completion = await createChatCompletion(
      {
        model:
          process.env.OPENAI_PALM_TEXT_MODEL ||
          process.env.OPENAI_TEXT_MODEL ||
          process.env.OPENAI_CHAT_MODEL_FAST ||
          process.env.OPENAI_CHAT_MODEL ||
          "gpt-4o-mini",
        messages: [
          {
            role: "system",
            content: "You are a careful palmistry report writer producing one grounded PDF chapter at a time.",
          },
          {
            role: "user",
            content:
              `${prompt}\n` +
              `Chapter: ${safeJson(section)}\n` +
              `Structured palm insights: ${safeJson(insights)}\n` +
              `Focused kundli context: ${safeJson(kundliContext || {})}`,
          },
        ],
        temperature: 0.55,
        response_format: { type: "json_object" },
      },
      buildOpenAIContext(metadata, `palm_reading_narrative_${section.key || "section"}`)
    );

    const tokenUsage = logTokenUsage(`palm_reading_narrative_${section.key || "section"}`, completion, {
      userId: getUserId(metadata),
      section: section.key || null,
    });
    const data = extractJsonObject(completion.choices?.[0]?.message?.content || "");
    return {
      ...data,
      key: data.key || section.key,
      title: data.title || section.title,
      token_usage: tokenUsage,
    };
  } catch (error) {
    console.warn("[PalmFlow][BE] section_fallback", {
      key: section.key,
      error: error.message,
    });
    return fallbackSection(section, insights);
  }
}

const compactLineInterpretations = (insights = {}) => {
  const lines = insights.line_interpretations || {};
  return Object.fromEntries(
    Object.entries(lines).map(([key, value]) => [
      key,
      {
        label: value?.label || key,
        quality: value?.quality || null,
        score: value?.score || null,
        summary: value?.summary || null,
      },
    ])
  );
};

const compactKundliForNarrative = (kundliContext = null) => {
  if (!kundliContext) return null;
  return {
    personalDetails: kundliContext.personalDetails || null,
    birthIdentity: {
      ascendant: kundliContext.birthIdentity?.ascendant?.sign || kundliContext.birthIdentity?.ascendant || null,
      sunSign: kundliContext.birthIdentity?.sunSign || null,
      moonSign: kundliContext.birthIdentity?.moonSign || null,
      nakshatra: kundliContext.birthIdentity?.panchang?.nakshatra || null,
    },
    currentDasha: {
      mahadasha: kundliContext.currentDasha?.mahadasha || kundliContext.currentDasha?.majorDasha || null,
      antardasha: kundliContext.currentDasha?.antardasha || kundliContext.currentDasha?.subDasha || null,
    },
    relevantHouses: Array.isArray(kundliContext.relevantHouses)
      ? kundliContext.relevantHouses.map((house) => ({
          house: house.house,
          meaning: house.meaning,
          sign: house.sign,
          planets: house.planets,
        }))
      : [],
    keyPlanets: Array.isArray(kundliContext.keyPlanets)
      ? kundliContext.keyPlanets.map((planet) => ({
          planet: planet.planet,
          sign: planet.sign,
          house: planet.house,
          retrograde: planet.retrograde,
        }))
      : [],
    selectedYogas: Array.isArray(kundliContext.selectedYogas)
      ? kundliContext.selectedYogas.slice(0, 4).map((yoga) => ({
          name: yoga.name,
          type: yoga.type,
          strength: yoga.strength,
          effects: Array.isArray(yoga.effects) ? yoga.effects.slice(0, 2) : yoga.effects,
        }))
      : [],
  };
};

const buildNarrativePayload = (outline, insights = {}, kundliContext = null) => ({
  outline,
  palm: {
    personality_traits: insights.personality_traits || null,
    career_traits: insights.career_traits || null,
    love_traits: insights.love_traits || null,
    emotional_traits: insights.emotional_traits || null,
    leadership_qualities: insights.leadership_qualities || null,
    spiritual_tendencies: insights.spiritual_tendencies || null,
    financial_tendencies: insights.financial_tendencies || null,
    symbolic_interpretation: insights.symbolic_interpretation || null,
    strengths: Array.isArray(insights.strengths) ? insights.strengths.slice(0, 6) : [],
    weaknesses: Array.isArray(insights.weaknesses) ? insights.weaknesses.slice(0, 4) : [],
    profile_table: Array.isArray(insights.profile_table) ? insights.profile_table.slice(0, 8) : [],
    line_interpretations: compactLineInterpretations(insights),
    success_codes: Array.isArray(insights.success_codes) ? insights.success_codes.slice(0, 5) : [],
    golden_warnings: Array.isArray(insights.golden_warnings) ? insights.golden_warnings.slice(0, 3) : [],
  },
  kundli: compactKundliForNarrative(kundliContext),
});

async function generateAllReportSections(outline, insights, metadata = {}, kundliContext = null) {
  const payload = buildNarrativePayload(outline, insights, kundliContext);
  const prompt =
    "Write all chapters for a premium palmistry and kundli-supported PDF report. Return only strict JSON: " +
    "{sections:[{key,title,opening,body,success_codes,golden_warnings,table}]}. " +
    "Use exactly the supplied outline keys. Do not invent observed palm features. Use kundli only for timing, temperament, karmic themes, and domain emphasis. " +
    "Each body must be 420-620 words with 4-6 substantial paragraphs. Each success_codes array must have 4-5 practical strings. Each golden_warnings array must have 2-3 strings. " +
    "Each table must have 3-4 rows with feature, observation, interpretation. Avoid certainty and do not mention AI. Make every chapter page feel complete, not like a short summary.";

  const completion = await createChatCompletion(
    {
      model:
        process.env.OPENAI_PALM_TEXT_MODEL ||
        process.env.OPENAI_TEXT_MODEL ||
        process.env.OPENAI_CHAT_MODEL_FAST ||
        process.env.OPENAI_CHAT_MODEL ||
        "gpt-4o-mini",
      messages: [
        {
          role: "system",
          content: "You are a careful palmistry report writer producing grounded JSON chapters for a PDF.",
        },
        {
          role: "user",
          content: `${prompt}\nCompact report payload: ${JSON.stringify(payload)}`,
        },
      ],
      temperature: 0.5,
      max_tokens: Number(process.env.OPENAI_PALM_NARRATIVE_MAX_TOKENS || 12000),
      response_format: { type: "json_object" },
    },
    buildOpenAIContext(metadata, "palm_reading_narrative_all_sections")
  );

  const tokenUsage = logTokenUsage("palm_reading_narrative_all_sections", completion, {
    userId: getUserId(metadata),
    sectionCount: outline.length,
    compactPayloadChars: JSON.stringify(payload).length,
  });
  const data = extractJsonObject(completion.choices?.[0]?.message?.content || "");
  const sections = Array.isArray(data.sections) ? data.sections : [];
  if (!sections.length) {
    throw new Error("OpenAI returned no palm report sections");
  }
  return {
    sections: outline.map((outlineItem) => {
      const generated = sections.find((section) => section?.key === outlineItem.key) || {};
      return {
        ...generated,
        key: outlineItem.key,
        title: generated.title || outlineItem.title,
      };
    }),
    tokenUsage: [tokenUsage],
  };
}

async function generateReportSections(insights, metadata = {}, kundliContext = null) {
  const outline =
    Array.isArray(insights.report_outline) && insights.report_outline.length
      ? insights.report_outline
      : [
          { key: "personality_foundation", title: "Personality and Life Foundation" },
          { key: "career_direction", title: "Career Direction and Path" },
          { key: "love_marriage_patterns", title: "Love and Marriage Patterns" },
          { key: "life_direction_summary", title: "Life Direction Summary" },
        ];

  try {
    return await generateAllReportSections(outline, insights, metadata, kundliContext);
  } catch (error) {
    console.warn("[PalmFlow][BE] all_sections_fallback", {
      error: error.message,
      sectionCount: outline.length,
    });
    return {
      sections: outline.map((item) => fallbackSection(item, insights)),
      tokenUsage: [],
    };
  }
}

const buildQualityRejectError = (code, message, checks) => {
  const error = new Error(
    `Upload rejected: ${JSON.stringify({
      detail: {
        code,
        message,
        checks,
      },
    })}`
  );
  error.code = code;
  return error;
};

const analyzePalm = async ({ imageUrls, metadata = {}, kundliContext = null }) => {
  const startedAt = Date.now();
  const images = Array.isArray(imageUrls) ? imageUrls.filter(Boolean) : [];
  if (!images.length) {
    throw new Error("At least one palm image URL is required");
  }

  if (PALM_DEBUG) {
    console.log("[PalmFlow][BE] analyze_start", {
      userId: getUserId(metadata),
      imageCount: images.length,
      jobId: metadata.job_id || null,
      palmUploadId: metadata.palm_upload_id || null,
      hasKundliContext: Boolean(kundliContext),
    });
  }

  const visionResult = await openaiExtractFeatures(images, metadata);
  const extracted = visionResult.data;
  const qualityChecks = extracted.fraud_quality_checks || {};

  if (PALM_DEBUG) {
    console.log("[PalmFlow][BE] features_done", {
      jobId: metadata.job_id || null,
      elapsedMs: Date.now() - startedAt,
      reject: Boolean(qualityChecks.reject),
    });
  }

  if (qualityChecks.unsafe_content_suspected || qualityChecks.needs_moderation_fallback) {
    const nsfw = await moderationCheck(images, metadata);
    if (nsfw.flagged) {
      throw buildQualityRejectError("rejected_nsfw", "Upload rejected by NSFW filter.", nsfw);
    }
  }

  if (qualityChecks.reject) {
    throw buildQualityRejectError(
      "rejected_quality_or_fraud",
      "Upload rejected by fraud/quality checks.",
      qualityChecks
    );
  }

  const insights = buildStructuredInsights(extracted);
  if (kundliContext) {
    insights.kundli_context = kundliContext;
    insights.profile_table = [
      ...(Array.isArray(insights.profile_table) ? insights.profile_table : []),
      { feature: "Ascendant", observation: kundliContext.birthIdentity?.ascendant?.sign || "Available", interpretation: "Used for body temperament and life foundation." },
      { feature: "Moon Sign", observation: kundliContext.birthIdentity?.moonSign || "Available", interpretation: "Used for emotional style and mental rhythm." },
    ];
  }
  const narrativeStartedAt = Date.now();
  const narrativeResult = await generateReportSections(insights, metadata, kundliContext);
  const sections = narrativeResult.sections;
  insights.report_sections = sections;
  const finalNarrative = composeFinalNarrative(sections);
  const tokenUsage = aggregateTokenUsage([
    visionResult.tokenUsage,
    ...narrativeResult.tokenUsage,
  ]);

  console.log("[PalmFlow][BE] analyze_success", {
    userId: getUserId(metadata),
    jobId: metadata.job_id || null,
    palmUploadId: metadata.palm_upload_id || null,
    narrativeMs: Date.now() - narrativeStartedAt,
    totalMs: Date.now() - startedAt,
    confidenceKeys:
      extracted.confidence_scores && typeof extracted.confidence_scores === "object"
        ? Object.keys(extracted.confidence_scores).length
        : 0,
    tokenUsage: {
      inputTokens: tokenUsage.inputTokens,
      outputTokens: tokenUsage.outputTokens,
      totalTokens: tokenUsage.totalTokens,
    },
  });

  return {
    extracted_features: extracted,
    fraud_quality_checks: qualityChecks,
    structured_insights: insights,
    final_narrative_report: finalNarrative || "Report not generated",
    confidence_scores: extracted.confidence_scores || {},
    token_usage: tokenUsage,
  };
};

module.exports = {
  analyzePalm,
  checkPalmEngineHealth,
};
