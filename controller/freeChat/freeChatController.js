const {
  getUserFreeChatSummary,
} = require("../../services/freeChatService");

const getMyFreeChatSummary = async (req, res) => {
  try {
    const userId = req.user.id;
    const payload = await getUserFreeChatSummary(userId);

    return res.status(200).json({
      success: true,
      ...payload,
    });
  } catch (error) {
    console.error("Get free chat summary error:", error);
    return res.status(500).json({
      success: false,
      message: "Failed to fetch free chat summary",
      error: error.message,
    });
  }
};

module.exports = {
  getMyFreeChatSummary,
};
