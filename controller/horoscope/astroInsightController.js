const Kundli = require("../../model/horoscope/kundli");
const UserRequest = require("../../model/user/userRequest");
const DailyInsightPayload = require("../../model/horoscope/dailyInsightPayload");
const { generateInsightForKundli } = require("../../services/astroInsightEngineService");

const normalizeDateOnly = (value = new Date()) => {
  const date = value ? new Date(value) : new Date();
  if (Number.isNaN(date.getTime())) return null;
  return date.toISOString().slice(0, 10);
};

const parseBoolean = (value) => value === true || value === "true" || value === "1" || value === 1;

const getUserRequestWithKundli = async (userId, userRequestId) => {
  return UserRequest.findOne({
    where: {
      id: userRequestId,
      userId,
    },
    include: [
      {
        model: Kundli,
        as: "kundli",
        required: true,
      },
    ],
  });
};

const upsertDailyInsight = async (payload) => {
  const [record, created] = await DailyInsightPayload.findOrCreate({
    where: {
      userId: payload.userId,
      userRequestId: payload.userRequestId,
      insightDate: payload.insightDate,
    },
    defaults: payload,
  });

  if (!created) {
    await record.update(payload);
  }

  return {
    record: created ? record : await record.reload(),
    created,
  };
};

const generateDailyInsight = async (req, res) => {
  try {
    const userId = req.user.id;
    const {
      userRequestId,
      date,
      freshTransit = false,
      includeNarrative = false,
      forceRegenerate = false,
    } = req.body || {};

    if (!userRequestId) {
      return res.status(400).json({
        success: false,
        message: "userRequestId is required",
      });
    }

    const insightDate = normalizeDateOnly(date || new Date());
    if (!insightDate) {
      return res.status(400).json({
        success: false,
        message: "date must be a valid date",
      });
    }

    const shouldForceRegenerate = parseBoolean(forceRegenerate);
    const shouldIncludeNarrative = parseBoolean(includeNarrative);

    if (!shouldForceRegenerate) {
      const cached = await DailyInsightPayload.findOne({
        where: {
          userId,
          userRequestId,
          insightDate,
        },
      });

      if (cached && (!shouldIncludeNarrative || cached.generatedText)) {
        return res.status(200).json({
          success: true,
          fromCache: true,
          insight: cached,
        });
      }
    }

    const userRequest = await getUserRequestWithKundli(userId, userRequestId);
    if (!userRequest) {
      return res.status(404).json({
        success: false,
        message: "Kundli not found. Please create a kundli first.",
      });
    }

    const payload = await generateInsightForKundli({
      userRequest,
      kundli: userRequest.kundli,
      date: insightDate,
      freshTransit: parseBoolean(freshTransit),
      includeNarrative: shouldIncludeNarrative,
    });

    const { record, created } = await upsertDailyInsight(payload);

    return res.status(200).json({
      success: true,
      fromCache: false,
      created,
      insight: record,
    });
  } catch (error) {
    console.error("[AstroInsight] generateDailyInsight error:", error);
    return res.status(500).json({
      success: false,
      message: "Failed to generate daily insight",
      error: error.message,
    });
  }
};

const getDailyInsight = async (req, res) => {
  try {
    const userId = req.user.id;
    const { userRequestId } = req.params;
    const insightDate = normalizeDateOnly(req.query.date || new Date());

    if (!insightDate) {
      return res.status(400).json({
        success: false,
        message: "date must be a valid date",
      });
    }

    const insight = await DailyInsightPayload.findOne({
      where: {
        userId,
        userRequestId,
        insightDate,
      },
    });

    if (!insight) {
      return res.status(404).json({
        success: false,
        message: "No daily insight found for this date",
      });
    }

    return res.status(200).json({
      success: true,
      insight,
    });
  } catch (error) {
    console.error("[AstroInsight] getDailyInsight error:", error);
    return res.status(500).json({
      success: false,
      message: "Failed to fetch daily insight",
      error: error.message,
    });
  }
};

const getStandoutInsights = async (req, res) => {
  try {
    const userId = req.user.id;
    const { userRequestId } = req.params;

    const userRequest = await getUserRequestWithKundli(userId, userRequestId);
    if (!userRequest) {
      return res.status(404).json({
        success: false,
        message: "Kundli not found",
      });
    }

    const payload = await generateInsightForKundli({
      userRequest,
      kundli: userRequest.kundli,
      date: req.query.date || new Date(),
      freshTransit: parseBoolean(req.query.freshTransit),
      includeNarrative: false,
    });

    return res.status(200).json({
      success: true,
      standoutCards: payload.llmPayload.standout_cards,
      natalSummary: payload.llmPayload.natal_summary,
      currentDasha: payload.dashaContext,
      transitSummary: {
        moon_house_from_lagna: payload.transitContext.moon_house_from_lagna,
        saturn_house_from_lagna: payload.transitContext.saturn_house_from_lagna,
        jupiter_house_from_lagna: payload.transitContext.jupiter_house_from_lagna,
        rahu_house_from_lagna: payload.transitContext.rahu_house_from_lagna,
        activated_buckets: payload.transitContext.activated_buckets,
      },
    });
  } catch (error) {
    console.error("[AstroInsight] getStandoutInsights error:", error);
    return res.status(500).json({
      success: false,
      message: "Failed to generate standout insights",
      error: error.message,
    });
  }
};

const generateOneYearInsight = async (req, res) => {
  try {
    const userId = req.user.id;
    const { userRequestId } = req.params;
    const startDate = normalizeDateOnly(req.query.startDate || new Date());

    const userRequest = await getUserRequestWithKundli(userId, userRequestId);
    if (!userRequest) {
      return res.status(404).json({
        success: false,
        message: "Kundli not found",
      });
    }

    const payload = await generateInsightForKundli({
      userRequest,
      kundli: userRequest.kundli,
      date: startDate,
      freshTransit: parseBoolean(req.query.freshTransit),
      includeNarrative: false,
    });

    const yearlyBuckets = payload.topBuckets.map((bucket) => ({
      ...bucket,
      one_year_note:
        bucket.bucket === "daily"
          ? "Use this as the present tone; slow planets and dasha should lead yearly timing."
          : "This bucket is active for the current dasha-transit window and should be reviewed monthly.",
    }));

    return res.status(200).json({
      success: true,
      period: {
        startDate,
        scope: "one_year_short_term_reading",
        regenerationAdvice: "Regenerate monthly or after major transit/dasha changes.",
      },
      natalSummary: payload.llmPayload.natal_summary,
      currentDasha: payload.dashaContext,
      topBuckets: yearlyBuckets,
      standoutCards: payload.llmPayload.standout_cards,
      recommendedActions: payload.recommendedActions,
      remedies: payload.remedies,
      safety: payload.llmPayload.safety_rules,
      confidenceScore: payload.confidenceScore,
    });
  } catch (error) {
    console.error("[AstroInsight] generateOneYearInsight error:", error);
    return res.status(500).json({
      success: false,
      message: "Failed to generate one-year insight",
      error: error.message,
    });
  }
};

module.exports = {
  generateDailyInsight,
  getDailyInsight,
  getStandoutInsights,
  generateOneYearInsight,
};
