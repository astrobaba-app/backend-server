const {
  getCohortSummary: getCohortSummaryService,
  getUserInterestSummary,
  getUsersInInterestCohort,
  COHORT_TYPES,
  ACTIVITY_CATEGORIES,
  ASTRO_CATEGORIES,
  INTEREST_CATEGORIES,
  WALLET_CATEGORIES,
} = require("../../services/interestCohortService");
const {
  getBackfillStats,
  runManualCohortBackfill,
} = require("../../services/cohortBackfillService");

const getUserInterestSummaryForAdmin = async (req, res) => {
  try {
    const { userId } = req.params;
    const summary = await getUserInterestSummary(userId);
    res.status(200).json({
      success: true,
      userId,
      ...summary,
    });
  } catch (error) {
    console.error("Get interest summary error:", error);
    res.status(500).json({
      success: false,
      message: "Failed to fetch interest summary",
      error: error.message,
    });
  }
};

const getInterestCategories = async (_req, res) => {
  res.status(200).json({
    success: true,
    cohortTypes: COHORT_TYPES,
    categories: INTEREST_CATEGORIES,
    interestCategories: INTEREST_CATEGORIES,
    walletCategories: WALLET_CATEGORIES,
    astroCategories: ASTRO_CATEGORIES,
    activityCategories: ACTIVITY_CATEGORIES,
  });
};

const getCohortUsers = async (req, res) => {
  try {
    const { category } = req.params;
    const {
      page = 1,
      limit = 50,
      cohortType = req.params.cohortType || COHORT_TYPES.INTEREST,
    } = req.query;
    const pageNumber = Math.max(Number(page) || 1, 1);
    const pageSize = Math.min(Math.max(Number(limit) || 50, 1), 500);
    const result = await getUsersInInterestCohort(category, {
      cohortType,
      limit: pageSize,
      offset: (pageNumber - 1) * pageSize,
    });

    if (!result.category) {
      return res.status(400).json({
        success: false,
        message: "Invalid cohort category",
        interestCategories: INTEREST_CATEGORIES,
        walletCategories: WALLET_CATEGORIES,
        astroCategories: ASTRO_CATEGORIES,
        activityCategories: ACTIVITY_CATEGORIES,
      });
    }

    return res.status(200).json({
      success: true,
      ...result,
      pagination: {
        page: pageNumber,
        limit: pageSize,
        totalPages: Math.ceil(result.count / pageSize),
      },
    });
  } catch (error) {
    console.error("Get cohort users error:", error);
    return res.status(500).json({
      success: false,
      message: "Failed to fetch cohort users",
      error: error.message,
    });
  }
};

const getCohortSummary = async (_req, res) => {
  try {
    console.log("[Cohort][Admin] Cohort summary endpoint called");
    const summary = await getCohortSummaryService();
    return res.status(200).json({
      success: true,
      ...summary,
    });
  } catch (error) {
    console.error("Get cohort summary error:", error);
    return res.status(500).json({
      success: false,
      message: "Failed to fetch cohort summary",
      error: error.message,
    });
  }
};

const getCohortBackfillStats = async (_req, res) => {
  try {
    console.log("[CohortBackfill][Admin] Stats endpoint called");
    const stats = await getBackfillStats();
    return res.status(200).json({
      success: true,
      ...stats,
    });
  } catch (error) {
    console.error("Get cohort backfill stats error:", error);
    return res.status(500).json({
      success: false,
      message: "Failed to fetch cohort backfill stats",
      error: error.message,
    });
  }
};

const runCohortBackfill = async (req, res) => {
  try {
    const result = await runManualCohortBackfill(req.body || {});

    if (result.success === false) {
      return res.status(400).json({
        success: false,
        message: result.reason || "Invalid backfill request",
        ...result,
      });
    }

    return res.status(200).json({
      success: true,
      ...result,
    });
  } catch (error) {
    console.error("Run cohort backfill error:", error);
    return res.status(500).json({
      success: false,
      message: "Failed to run cohort backfill",
      error: error.message,
    });
  }
};

module.exports = {
  getCohortBackfillStats,
  getCohortSummary,
  getCohortUsers,
  getInterestCategories,
  getUserInterestSummaryForAdmin,
  runCohortBackfill,
};
