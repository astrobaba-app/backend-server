const asString = (value) => {
  if (value === null || value === undefined) return "";
  if (typeof value === "string") return value;
  if (typeof value === "object") {
    for (const key of ["quality", "type", "value"]) {
      if (typeof value[key] === "string") return value[key];
    }
    return "";
  }
  return String(value);
};

const score = (value, mapping, fallback = 50) =>
  mapping[asString(value).toLowerCase()] ?? fallback;

const lineQuality = (features, key) =>
  asString((features[key] || {}).quality) || "balanced";

const lineNotes = (features, key, fallback) => {
  const value = features[key] || {};
  if (value && typeof value === "object" && typeof value.notes === "string" && value.notes.trim()) {
    return value.notes.trim();
  }
  return fallback;
};

const scoreLabel = (value) => {
  if (value >= 78) return "strong";
  if (value >= 62) return "balanced";
  if (value >= 48) return "developing";
  return "sensitive";
};

const tableRow = (feature, observation, interpretation) => ({
  feature,
  observation,
  interpretation,
});

const defaultSuccessCodes = () => [
  "Build habits before chasing outcomes; your progress improves through repetition.",
  "Use intuition as a signal, then confirm it through practical facts.",
  "Protect your energy during transitions instead of forcing every result.",
  "Turn skill development into a daily discipline.",
  "Choose long-term stability over short bursts of excitement.",
];

function buildStructuredInsights(features = {}) {
  const handShape = asString(features.hand_shape).toLowerCase();
  const lifeLine = lineQuality(features, "life_line");
  const heartLine = lineQuality(features, "heart_line");
  const headLine = lineQuality(features, "head_line");
  const fateLine = lineQuality(features, "fate_line");
  const sunLine = lineQuality(features, "sun_line");
  const thumb = asString(features.thumb_structure).toLowerCase();
  const mounts = features.mounts || {};

  const personality = score(handShape, { earth: 75, air: 65, water: 70, fire: 80 });
  const emotional = score(heartLine, { deep: 80, balanced: 70, faint: 45, broken: 35 });
  const intellect = score(headLine, { deep: 82, balanced: 70, faint: 48, broken: 35 });
  const vitality = score(lifeLine, { deep: 83, balanced: 72, faint: 50, broken: 35 });
  const career = score(fateLine, { deep: 80, balanced: 68, faint: 48, broken: 40 });
  const recognition = score(sunLine, { deep: 78, balanced: 66, faint: 44, broken: 38 });
  const willpower = score(thumb, { strong: 82, balanced: 70, flexible: 62, weak: 40 });

  const leadership = Math.trunc((personality + willpower + career) / 3);
  const spiritual = 60 + (["high", "prominent"].includes(asString(mounts.moon).toLowerCase()) ? 10 : 0);
  const financial = Math.trunc((career + recognition + intellect) / 3);

  const strengths = [];
  const weaknesses = [];
  if (vitality >= 75) strengths.push("Strong resilience and recovery ability");
  if (intellect >= 75) strengths.push("Clear strategic thinking and planning");
  if (leadership >= 75) strengths.push("Natural leadership and decision confidence");
  if (emotional < 50) weaknesses.push("May struggle with emotional openness");
  if (career < 50) weaknesses.push("Career path may include frequent shifts");
  if (willpower < 50) weaknesses.push("Consistency may drop under stress");

  const lineInterpretations = {
    love_line: {
      label: "Love / Heart Line",
      image: "/images/love-line.png",
      quality: heartLine,
      summary: lineNotes(
        features,
        "heart_line",
        "Shows emotional expression, attachment style, sincerity, and expectations in close relationships."
      ),
      score: emotional,
    },
    wisdom_line: {
      label: "Wisdom / Head Line",
      image: "/images/wisdom-line.png",
      quality: headLine,
      summary: lineNotes(
        features,
        "head_line",
        "Shows decision style, mental clarity, learning rhythm, imagination, and practical judgment."
      ),
      score: intellect,
    },
    fate_line: {
      label: "Fate / Career Line",
      image: "/images/fate-line.png",
      quality: fateLine,
      summary: lineNotes(
        features,
        "fate_line",
        "Shows professional direction, responsibility, career turning points, and self-made progress."
      ),
      score: career,
    },
    life_line: {
      label: "Life Line",
      image: "/images/life-line.png",
      quality: lifeLine,
      summary: lineNotes(
        features,
        "life_line",
        "Shows vitality, stamina, recovery pattern, major life movement, and grounding."
      ),
      score: vitality,
    },
    summary_line: {
      label: "Life Direction Summary",
      image: "/images/summary-line.png",
      quality: "synthesis",
      summary: "Combines the major line patterns into a practical direction for choices, discipline, relationships, and growth.",
      score: Math.trunc((vitality + intellect + career + emotional) / 4),
    },
  };

  let moneyTriangle = "developing";
  const majorMarkings = features.major_markings || {};
  if (majorMarkings && typeof majorMarkings === "object" && !Array.isArray(majorMarkings)) {
    moneyTriangle = asString(majorMarkings.money_triangle) || moneyTriangle;
  } else if (Array.isArray(majorMarkings)) {
    const joined = majorMarkings.map((item) => String(item).toLowerCase()).join(" ");
    if (joined.includes("triangle")) moneyTriangle = "present";
  }

  const profileTable = [
    tableRow("Hand Shape", handShape || "balanced", `${scoreLabel(personality)} temperament and outer expression`),
    tableRow("Life Line", lifeLine, `${scoreLabel(vitality)} vitality and recovery rhythm`),
    tableRow("Head Line", headLine, `${scoreLabel(intellect)} thinking style and planning capacity`),
    tableRow("Heart Line", heartLine, `${scoreLabel(emotional)} emotional clarity and relationship style`),
    tableRow("Fate Line", fateLine, `${scoreLabel(career)} career direction and responsibility pattern`),
    tableRow("Money Triangle", moneyTriangle, "Financial retention, asset discipline, and cash-flow behavior"),
  ];

  const reportOutline = [
    { key: "personality_foundation", title: "Personality and Life Foundation" },
    { key: "childhood_conditioning", title: "Childhood and Conditioning" },
    { key: "thinking_emotional_style", title: "Thinking and Emotional Style" },
    { key: "career_direction", title: "Career Direction and Path" },
    { key: "wealth_asset_pattern", title: "Wealth, Money and Asset Pattern" },
    { key: "love_marriage_patterns", title: "Love and Marriage Patterns" },
    { key: "major_life_shifts", title: "Major Life Shifts" },
    { key: "life_direction_summary", title: "Life Direction Summary" },
    { key: "golden_warnings_success_codes", title: "Golden Warnings and Success Codes" },
  ];

  return {
    personality_traits: { score: personality, summary: "Core temperament and outer expression" },
    career_traits: { score: career, summary: "Career direction and work stability" },
    love_traits: { score: emotional, summary: "Relationship style and attachment pattern" },
    emotional_traits: { score: emotional, summary: "Emotional regulation and sensitivity" },
    strengths: strengths.length ? strengths : ["Balanced temperament with adaptive behavior"],
    weaknesses: weaknesses.length ? weaknesses : ["Occasional overthinking during major transitions"],
    leadership_qualities: { score: leadership, summary: "Influence, initiative, and responsibility" },
    spiritual_tendencies: { score: spiritual, summary: "Intuition and inner reflection potential" },
    financial_tendencies: { score: financial, summary: "Money planning and growth outlook" },
    symbolic_interpretation: {
      vitality,
      intellect,
      recognition,
      willpower,
    },
    line_interpretations: lineInterpretations,
    profile_table: profileTable,
    report_outline: reportOutline,
    success_codes: defaultSuccessCodes(),
    golden_warnings: [
      "Avoid impulsive life or career shifts when the mind is tired or emotionally reactive.",
      "Do not ignore rest, physical routine, and mental recovery during high-pressure phases.",
      "Protect savings and long-term commitments from short-term excitement.",
    ],
    pdf_blueprint: {
      cover_image: "/images/palmistry-report.png",
      static_line_images: [
        "/images/love-line.png",
        "/images/wisdom-line.png",
        "/images/fate-line.png",
        "/images/life-line.png",
        "/images/summary-line.png",
      ],
      font_family: "Cinzel for headings, Inter for body",
      brand_url: "graho.in",
      disclaimer_title: "Important Disclaimer",
      disclaimer:
        "Palmistry offers reflective guidance based on visible patterns, tendencies, and symbolic interpretation. It does not guarantee fixed outcomes and should not replace medical, legal, financial, psychological, or career advice from qualified professionals. Your choices, effort, and circumstances remain central.",
    },
  };
}

module.exports = {
  buildStructuredInsights,
};
