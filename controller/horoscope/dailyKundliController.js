const Kundli = require("../../model/horoscope/kundli");
const UserRequest = require("../../model/user/userRequest");
const { getTransitChart } = require("../../services/astroEngineService");
const { createChatCompletion } = require("../../services/openaiClient");

const CHAT_MODEL = process.env.OPENAI_CHAT_MODEL || "gpt-4o-mini";

// ── helpers ──────────────────────────────────────────────────────────────────

const getUserRequestWithKundli = async (userId, userRequestId) => {
  return UserRequest.findOne({
    where: { id: userRequestId, userId },
    include: [
      {
        model: Kundli,
        as: "kundli",
        required: true,
      },
    ],
  });
};

const todayDateString = () => new Date().toISOString().slice(0, 10);

// Simple in-memory per-day cache:  key = `${userId}:${userRequestId}:${date}`
const reportCache = new Map();

const getCacheKey = (userId, userRequestId, date) =>
  `${userId}:${userRequestId}:${date}`;

const pruneOldCacheEntries = () => {
  const today = todayDateString();
  for (const [key] of reportCache) {
    if (!key.endsWith(`:${today}`)) {
      reportCache.delete(key);
    }
  }
};

// Run a prune every 30 minutes so the map doesn't grow unbounded
setInterval(pruneOldCacheEntries, 30 * 60 * 1000);

// ── checkKundliStatus ────────────────────────────────────────────────────────

const checkKundliStatus = async (req, res) => {
  try {
    const userId = req.user.id;

    const userRequests = await UserRequest.findAll({
      where: { userId },
      include: [
        {
          model: Kundli,
          as: "kundli",
          required: true,
          attributes: ["id"],
        },
      ],
      order: [["createdAt", "DESC"]],
    });

    if (!userRequests || userRequests.length === 0) {
      return res.status(200).json({
        success: true,
        hasKundli: false,
        kundlis: [],
      });
    }

    const kundlis = userRequests.map((request) => ({
      userRequestId: request.id,
      fullName: request.fullName,
      dateOfBirth: request.dateOfbirth,
      placeOfBirth: request.placeOfBirth,
      createdAt: request.createdAt,
    }));

    return res.status(200).json({
      success: true,
      hasKundli: true,
      kundlis,
    });
  } catch (error) {
    console.error("[DailyKundli] checkKundliStatus error:", error);
    return res.status(500).json({
      success: false,
      message: "Failed to check kundli status",
      error: error.message,
    });
  }
};

// ── generateDailyKundliReport ────────────────────────────────────────────────

const generateDailyKundliReport = async (req, res) => {
  try {
    const userId = req.user.id;
    const { userRequestId } = req.body;

    if (!userRequestId) {
      return res.status(400).json({
        success: false,
        message: "userRequestId is required",
      });
    }

    const today = todayDateString();

    // ── check cache ──────────────────────────────────────────────────────
    const cacheKey = getCacheKey(userId, userRequestId, today);
    const cached = reportCache.get(cacheKey);
    if (cached) {
      return res.status(200).json({
        success: true,
        fromCache: true,
        report: cached,
      });
    }

    // ── fetch kundli ─────────────────────────────────────────────────────
    const userRequest = await getUserRequestWithKundli(userId, userRequestId);
    if (!userRequest) {
      return res.status(404).json({
        success: false,
        message: "Kundli not found. Please create a kundli first.",
      });
    }

    const kundli = userRequest.kundli;

    // ── extract lagna chart ──────────────────────────────────────────────
    // charts contains divisional charts; D1 (lagna) is the primary one
    const lagnaChart =
      kundli.charts?.D1 ||
      kundli.charts?.d1 ||
      kundli.charts?.lagna ||
      kundli.charts ||
      null;

    // ── get fresh transit ────────────────────────────────────────────────
    let transit = null;
    try {
      transit = await getTransitChart(userRequest, new Date());
      console.log("transit", JSON.stringify(transit, null, 2));
    } catch (transitError) {
      console.warn(
        "[DailyKundli] Fresh transit fetch failed, falling back to stored:",
        transitError.message
      );
    }

    if (!transit) {
      transit = kundli.horoscope?.transit || null;
    }

    // ── build context for AI ─────────────────────────────────────────────
    const birthDetails = {
      fullName: userRequest.fullName,
      dateOfBirth: userRequest.dateOfbirth,
      timeOfBirth: userRequest.timeOfbirth,
      placeOfBirth: userRequest.placeOfBirth,
    };

    const ascendant =
      kundli.basicDetails?.ascendant ||
      kundli.astroDetails?.ascendant ||
      kundli.horoscope?.birth_chart?.ascendant ||
      null;

    const moonSign =
      kundli.basicDetails?.moon_sign ||
      kundli.horoscope?.moon_sign ||
      null;

    const sunSign =
      kundli.basicDetails?.sun_sign ||
      kundli.horoscope?.sun_sign ||
      null;

    const dashaInfo = kundli.dasha || null;
    const planetaryPositions = kundli.planetary || null;

    // ── call OpenAI ──────────────────────────────────────────────────────
    const systemPrompt = `You are Graho's expert Vedic astrologer AI. You produce personalised daily kundli predictions.

RULES:
- Use ONLY the astrological data provided (lagna chart, transits, dasha, planetary positions).
- Do NOT invent planetary placements.
- Avoid deterministic claims — use supportive, practical language.
- No medical diagnosis, financial buy/sell advice, or fear-based dosha claims.
- Keep each prediction section to 2-3 sentences maximum.
- Return valid JSON only, no markdown.`;

    const userPrompt = JSON.stringify({
      task: "Generate a daily kundli prediction report for today",
      today: today,
      birth_details: birthDetails,
      ascendant: ascendant,
      moon_sign: moonSign,
      sun_sign: sunSign,
      lagna_chart: lagnaChart,
      transit: transit,
      dasha: dashaInfo,
      planetary_positions: planetaryPositions,
      required_output_format: {
        date: today,
        dayOfWeek: new Date().toLocaleDateString("en-US", { weekday: "long" }),
        overallEnergy: "High | Medium | Low",
        luckyNumber: "a single number between 1-9",
        luckyColor: "a color name",
        luckyDirection: "North | South | East | West | Northeast | Northwest | Southeast | Southwest",
        auspiciousTime: "time range e.g. 06:30 AM - 08:45 AM",
        moonPhase: "current moon phase name",
        planetaryHighlights: [
          {
            planet: "planet name",
            sign: "sign name",
            influence: "1-2 sentence influence description",
          },
        ],
        predictions: {
          health: "2-3 sentences",
          finance: "2-3 sentences",
          relationships: "2-3 sentences",
          career: "2-3 sentences",
        },
        remedies: ["remedy 1", "remedy 2", "remedy 3", "remedy 4"],
      },
    });

    const completion = await createChatCompletion(
      {
        model: CHAT_MODEL,
        temperature: 0.6,
        max_tokens: 900,
        messages: [
          { role: "system", content: systemPrompt },
          { role: "user", content: userPrompt },
        ],
        response_format: { type: "json_object" },
      },
      { feature: "daily_kundli_report", userId, userRequestId }
    );

    const rawContent = completion.choices[0]?.message?.content;
    let report;
    try {
      report = JSON.parse(rawContent);
    } catch {
      report = { raw: rawContent };
    }

    console.log("[DailyKundli] report:", JSON.stringify(report, null, 2));

    // Ensure date is always today
    report.date = today;
    report.dayOfWeek =
      report.dayOfWeek ||
      new Date().toLocaleDateString("en-US", { weekday: "long" });

    // ── cache & respond ──────────────────────────────────────────────────
    reportCache.set(cacheKey, report);

    return res.status(200).json({
      success: true,
      fromCache: false,
      report,
    });
  } catch (error) {
    console.error("[DailyKundli] generateDailyKundliReport error:", error);
    return res.status(500).json({
      success: false,
      message: "Failed to generate daily kundli report",
      error: error.message,
    });
  }
};

module.exports = {
  checkKundliStatus,
  generateDailyKundliReport,
};
