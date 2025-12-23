const Kundli = require("../../model/horoscope/kundli");
const UserRequest = require("../../model/user/userRequest");
const CallSession = require("../../model/call/callSession");
const { generateFreeReportNarratives } = require("../../services/freeReportAiService");

/**
 * Get user's Kundlis for astrologer during a call
 * Astrologer can view all Kundlis of the user they are in a call with
 */
const getUserKundlisForCall = async (req, res) => {
  try {
    const astrologerId = req.user.id; // Astrologer making the request
    const { callId } = req.params;

    // Verify the call session exists and astrologer is part of it
    const callSession = await CallSession.findOne({
      where: {
        id: callId,
        astrologerId: astrologerId,
        status: { [require("sequelize").Op.in]: ["accepted", "ongoing"] },
      },
    });

    if (!callSession) {
      return res.status(404).json({
        success: false,
        message: "Call session not found or not active",
      });
    }

    const userId = callSession.userId;

    // Get all user requests (Kundlis) for this user
    const userRequests = await UserRequest.findAll({
      where: { userId },
      attributes: [
        "id",
        "fullName",
        "dateOfbirth",
        "timeOfbirth",
        "placeOfBirth",
        "gender",
        "createdAt",
      ],
      order: [["createdAt", "DESC"]],
    });

    res.status(200).json({
      success: true,
      userRequests,
      userName: userRequests[0]?.fullName || "User",
    });
  } catch (error) {
    console.error("Get user kundlis for call error:", error);
    res.status(500).json({
      success: false,
      message: "Failed to fetch user kundlis",
      error: error.message,
    });
  }
};

/**
 * Get specific Kundli details for astrologer during a call
 */
const getKundliForCall = async (req, res) => {
  try {
    const astrologerId = req.user.id;
    const { callId, userRequestId } = req.params;

    // Verify the call session
    const callSession = await CallSession.findOne({
      where: {
        id: callId,
        astrologerId: astrologerId,
        status: { [require("sequelize").Op.in]: ["accepted", "ongoing"] },
      },
    });

    if (!callSession) {
      return res.status(404).json({
        success: false,
        message: "Call session not found or not active",
      });
    }

    const userId = callSession.userId;

    // Verify user request belongs to the user in the call
    const userRequest = await UserRequest.findOne({
      where: { id: userRequestId, userId },
    });

    if (!userRequest) {
      return res.status(404).json({
        success: false,
        message: "User request not found",
      });
    }

    // Get the Kundli
    const kundli = await Kundli.findOne({
      where: { requestId: userRequestId },
      include: [{ model: UserRequest, as: "userRequest" }],
    });

    if (!kundli) {
      return res.status(404).json({
        success: false,
        message: "Kundli not found",
      });
    }

    // Generate AI-enhanced Free Report narratives
    let aiFreeReport = null;
    try {
      aiFreeReport = await generateFreeReportNarratives({
        basicDetails: kundli.basicDetails,
        personality: kundli.personality,
        remedies: kundli.remedies,
        horoscope: kundli.horoscope,
        manglikAnalysis: kundli.manglikAnalysis,
      });
    } catch (err) {
      console.error(
        "[KundliForCall] Failed to generate AI Free Report:",
        err?.message || err
      );
    }

    res.status(200).json({
      success: true,
      kundli: {
        ...kundli.toJSON(),
        aiFreeReport,
      },
    });
  } catch (error) {
    console.error("Get kundli for call error:", error);
    res.status(500).json({
      success: false,
      message: "Failed to fetch kundli",
      error: error.message,
    });
  }
};

module.exports = {
  getUserKundlisForCall,
  getKundliForCall,
};
