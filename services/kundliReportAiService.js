const { buildInsightPayload } = require("./astroInsightEngineService");
const { generateFreeReportNarratives } = require("./freeReportAiService");

const toDateString = (value = new Date()) => {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return new Date().toISOString().slice(0, 10);
  return date.toISOString().slice(0, 10);
};

const quarterPeriods = () => [
  { period: "Jan - Mar", focus: "Foundation", prediction: "This phase is best for building stable habits and setting realistic priorities." },
  { period: "Apr - Jun", focus: "Adjustment", prediction: "Fine-tune your pace, communication, and decisions based on what is working well." },
  { period: "Jul - Sep", focus: "Growth", prediction: "Steady consistency can bring visible progress in important life areas." },
  { period: "Oct - Dec", focus: "Consolidation", prediction: "Close the year by simplifying commitments and protecting long-term momentum." },
];

const monthPeriods = () => [
  { period: "Week 1", focus: "Kickoff", prediction: "Start the month with clear priorities and a steady pace to create strong momentum." },
  { period: "Week 2", focus: "Adjustment", prediction: "Tune your actions based on early feedback and keep communication simple and direct." },
  { period: "Week 3", focus: "Expansion", prediction: "Use growing confidence to make thoughtful progress in key work and relationships." },
  { period: "Week 4", focus: "Reflection", prediction: "Review your progress, close open loops, and prepare for the next cycle with calm focus." },
];

const defaultKeyDates = () => [
  { type: "positive", date: "This Month", title: "Use this period for steady progress and disciplined action." },
  { type: "negative", date: "High-Stress Days", title: "Avoid impulsive decisions and give extra space for clarity." },
];

const getBucket = (payload, key) => {
  const buckets = payload?.topBuckets || [];
  return buckets.find((item) => String(item.bucket || "").toLowerCase() === key) || null;
};

const joinActions = (actions = []) => {
  if (!Array.isArray(actions) || actions.length === 0) return "Keep your routine simple and consistent.";
  return actions.slice(0, 3).join(" ");
};

const buildSectionText = ({ title, bucket, fallback }) => {
  if (!bucket) {
    return `${title} may progress with patience and consistent effort. ${fallback}`;
  }

  const supports = Array.isArray(bucket.supporting_factors) ? bucket.supporting_factors.slice(0, 2) : [];
  const cautions = Array.isArray(bucket.caution_factors) ? bucket.caution_factors.slice(0, 1) : [];
  const summary = String(bucket.summary || "");
  const actions = joinActions(bucket.recommended_actions);
  const tone = bucket.challenge_score >= 65 ? "This phase asks for calm discipline and thoughtful choices." : "This phase can support gradual and meaningful progress.";

  return [
    summary || `${title} is a meaningful focus in the current period.`,
    tone,
    supports.length ? `Helpful signs: ${supports.join(". ")}.` : null,
    cautions.length ? `Take care: ${cautions.join(". ")}.` : null,
    `Best approach now: ${actions}`,
    "Small, consistent actions will give better results than rushed decisions.",
  ]
    .filter(Boolean)
    .join(" ");
};

const buildRemedyList = (bucket, fallback = []) => {
  const remedies = Array.isArray(bucket?.remedies) ? bucket.remedies : [];
  const fromBucket = remedies.map((item) => item?.remedy).filter(Boolean);
  if (fromBucket.length) return fromBucket.slice(0, 3);
  return fallback.length ? fallback : ["Stay consistent with sleep, hydration, calm communication, and one grounding daily practice."];
};

function normalizeReportType(reportType) {
  const normalized = String(reportType || "yearly").toLowerCase();
  return normalized === "monthly" ? "monthly" : "yearly";
}

function buildReportOverview(reportType, payload, freeReport) {
  const basicOverview =
    freeReport?.legacy?.general?.ascendant_overview ||
    `This report is personalized from your birth chart timing and your current life trends. Right now, the strongest focus is ${payload.mainTheme?.toLowerCase() || "today's guidance"}. Keep your approach practical, stay emotionally balanced, and choose steady progress over quick shortcuts. Clear communication, regular routine, and realistic planning will help you get better outcomes.`;

  if (reportType === "monthly") {
    return `${basicOverview} This monthly forecast highlights the themes for the next four weeks and helps you move with awareness through each phase of the month.`;
  }

  return `${basicOverview} This yearly forecast highlights the major themes and opportunities for the year ahead while helping you stay steady through shifting planetary timing.`;
}

async function generateKundliReportContent(kundliData, userDetails, reportType = "yearly") {
  try {
    const normalizedReportType = normalizeReportType(reportType);
    const reportLabel =
  normalizedReportType === "monthly"
    ? "Monthly"
    : "Yearly";
    const userRequest = {
      id: kundliData?.requestId || "kundli-report",
      userId: userDetails?.userId || null,
      fullName: userDetails?.fullName || "User",
      dateOfbirth: userDetails?.dateOfbirth || null,
      timeOfbirth: userDetails?.timeOfbirth || null,
      placeOfBirth: userDetails?.placeOfBirth || null,
      gender: userDetails?.gender || null,
    };

    const payload = buildInsightPayload({
      userRequest,
      kundli: kundliData || {},
      transit: kundliData?.horoscope?.transit || { datetime: new Date().toISOString(), transits: {} },
      date: toDateString(new Date()),
    });

    const freeReport = await generateFreeReportNarratives({
      userRequest,
      kundli: kundliData,
      context: { userId: userRequest.userId, feature: "kundli_report_ai" },
    });

    const careerBucket = getBucket(payload, "career");
    const relationshipBucket = getBucket(payload, "relationships") || getBucket(payload, "love");
    const financeBucket = getBucket(payload, "finance");
    const healthBucket = getBucket(payload, "health");
    const spiritualBucket = getBucket(payload, "spirituality");
    const travelBucket = getBucket(payload, "travel");
    const educationBucket = getBucket(payload, "education");
const periods =
  normalizedReportType === "monthly"
    ? monthPeriods()
    : quarterPeriods();

const overview = buildReportOverview(
  normalizedReportType,
  payload,
  freeReport);
// const reportLabel =
//   normalizedReportType === "monthly"
//     ? "Monthly"
//     : "Yearly";

    const reportContent = {
      overview,
      reportType: normalizedReportType,
      careerFinance: buildSectionText({
        title: "Career and finances",
        bucket: careerBucket || financeBucket,
        fallback:
          "Focus on work quality, realistic timelines, and thoughtful financial planning. Avoid rushing commitments.",
      }),
      careerPeriods: periods,
      careerKeyDates: defaultKeyDates(),
      careerRemedies: buildRemedyList(careerBucket, [
        "Keep a fixed work routine and clear task priorities.",
        "Respond with patience in high-pressure conversations.",
        "Review important decisions twice before finalizing.",
      ]),
      relationships: buildSectionText({
        title: "Relationships",
        bucket: relationshipBucket,
        fallback:
          "Give attention to communication tone, patience, and mutual understanding in close relationships.",
      }),
      relationshipPeriods: periods,
      relationshipKeyDates: defaultKeyDates(),
      relationshipRemedies: buildRemedyList(relationshipBucket, [
        "Speak calmly and avoid reacting in the heat of the moment.",
        "Give time and space where needed.",
        "Use small daily gestures to rebuild trust and warmth.",
      ]),
      finance: buildSectionText({
        title: "Financial planning",
        bucket: financeBucket,
        fallback:
          "Track spending, avoid emotional purchases, and make money decisions after careful review.",
      }),
      financePeriods: periods,
      financeKeyDates: defaultKeyDates(),
      financeRemedies: buildRemedyList(financeBucket, [
        "Plan spending weekly and avoid unnecessary risk.",
        "Keep an emergency buffer where possible.",
        "Stay disciplined with savings habits.",
      ]),
      healthWellness: buildSectionText({
        title: "Health and wellness",
        bucket: healthBucket,
        fallback:
          "Protect your energy with better sleep, hydration, food timing, and stress management.",
      }),
      healthPeriods: periods,
      healthKeyDates: defaultKeyDates(),
      healthRemedies: buildRemedyList(healthBucket, [
        "Sleep on time and keep hydration consistent.",
        "Include light daily movement and breathwork.",
        "Seek professional medical advice for persistent symptoms.",
      ]),
      spiritualGrowth: buildSectionText({
        title: "Spiritual growth",
        bucket: spiritualBucket,
        fallback:
          "A short daily grounding routine can improve clarity, calmness, and emotional stability.",
      }),
      spiritualPeriods: periods,
      spiritualKeyDates: [
        { type: "positive", date: "Quiet Days", title: "Use this time for reflection, gratitude, and inner balance." },
        { type: "positive", date: "Weekly Reset", title: "Create one simple spiritual routine and stay consistent." },
      ],
      spiritualRemedies: buildRemedyList(spiritualBucket, [
        "Practice 10-15 minutes of meditation or prayer daily.",
        "Write down worries and let go of one mental burden each day.",
        "Choose calm routines over constant overstimulation.",
      ]),
      travel: buildSectionText({
        title: "Travel",
        bucket: travelBucket,
        fallback:
          "Plan trips carefully, avoid last-minute rush, and keep communication/document details clear.",
      }),
      travelPeriods: periods,
      travelKeyDates: defaultKeyDates(),
      travelRemedies: buildRemedyList(travelBucket, [
        "Keep documents and essentials ready in advance.",
        "Avoid unnecessary rush during travel windows.",
        "Choose practical, well-timed travel planning.",
      ]),
      education: buildSectionText({
        title: "Education and learning",
        bucket: educationBucket,
        fallback:
          "Build learning momentum with consistency, revision, and realistic study goals.",
      }),
      educationPeriods: periods,
      educationKeyDates: defaultKeyDates(),
      educationRemedies: buildRemedyList(educationBucket, [
        "Set a fixed study slot and follow it daily.",
        "Revise regularly instead of last-minute pressure.",
        "Break large goals into smaller weekly milestones.",
      ]),
    };

    return {
      success: true,
      reportContent,
      metadata: {
        generatedAt: new Date().toISOString(),
        model: "insight_engine_v1",
      },
    };
  } catch (error) {
    console.error("[KundliReportAI] Error generating insight-engine report:", error);
    throw new Error(`Failed to generate report content: ${error.message}`);
  }
}

module.exports = {
  generateKundliReportContent,
};
