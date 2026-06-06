const Kundli = require("../../model/horoscope/kundli");
const UserRequest = require("../../model/user/userRequest");
const { generateInsightForKundli } = require("../../services/astroInsightEngineService");
const { createChatCompletion } = require("../../services/openaiClient");

const CHAT_MODEL = process.env.OPENAI_CHAT_MODEL || "gpt-4o-mini";

//  helpers 

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

setInterval(pruneOldCacheEntries, 30 * 60 * 1000);

// ── checkKundliStatus ────────────────────────────────────────────────

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

// ── generateDailyKundliReport ────────────────────────────────────────

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

    // check cache
    const cacheKey = getCacheKey(userId, userRequestId, today);
    const cached = reportCache.get(cacheKey);
    if (cached) {
      return res.status(200).json({
        success: true,
        fromCache: true,
        report: cached,
      });
    }

    // fetch kundli
    const userRequest = await getUserRequestWithKundli(userId, userRequestId);
    if (!userRequest) {
      return res.status(404).json({
        success: false,
        message: "Kundli not found. Please create a kundli first.",
      });
    }

    const insightPayload = await generateInsightForKundli({
      userRequest,
      kundli: userRequest.kundli,
      date: today,
      freshTransit: false,
      includeNarrative: false,
    });

    console.log("[DailyKundli] Insight Engine ready — confidence:",
      insightPayload.confidenceScore, "theme:", insightPayload.mainTheme);

    const llm = insightPayload.llmPayload;
    const gptData = {
      date: today,
      ascendant: llm.natal_summary?.ascendant,
      moon_sign: llm.natal_summary?.moon_sign,
      dasha: `${llm.current_dasha?.mahadasha}-${llm.current_dasha?.antardasha}`,
      top_areas: llm.top_buckets.map((b) => `${b.label}:${b.status}(${b.score})`),
      transits: {
        moon: llm.transit_summary?.moon_house_from_lagna,
        saturn: llm.transit_summary?.saturn_house_from_lagna,
        jupiter: llm.transit_summary?.jupiter_house_from_lagna,
        rahu: llm.transit_summary?.rahu_house_from_lagna,
      },
      remedies: llm.remedies?.slice(0, 4),
    };

    console.log("[DailyKundli] GPT payload:", JSON.stringify(gptData));

    const systemPrompt = `You are a Vedic astrologer. Given pre-analysed insights (natal summary, dasha, transit houses, life-area scores), write a daily prediction. Rules: use only the data given, no invented placements, supportive language, no medical/financial advice. Return valid JSON only.`;

    const userPrompt = JSON.stringify({
      task: "daily_prediction",
      ...gptData,
      format: {
        date: today,
        dayOfWeek: "",
        overallEnergy: "High|Medium|Low",
        luckyNumber: 0,
        luckyColor: "",
        luckyDirection: "",
        auspiciousTime: "",
        planetaryHighlights: [{ planet: "", sign: "", influence: "" }],
        predictions: { health: "", finance: "", relationships: "", career: "" },
        remedies: ["", "", "", ""],
      },
    });

    const completion = await createChatCompletion(
      {
        model: CHAT_MODEL,
        temperature: 0.5,
        max_tokens: 700,
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

    // cache & respond
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
