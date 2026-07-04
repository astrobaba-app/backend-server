const Kundli = require("../../model/horoscope/kundli");
const UserRequest = require("../../model/user/userRequest");
const CallSession = require("../../model/call/callSession");
const ChatSession = require("../../model/chat/chatSession");
const { Op } = require("sequelize");
const { generateFreeReportNarratives } = require("../../services/freeReportAiService");

function syncRudrakshaRemedies(kundliJson, aiFreeReport) {
  // If the background AI generation passed aiFreeReport to response, merge it!
  const report = aiFreeReport || kundliJson.aiFreeReport;
  if (kundliJson && report?.rudrakshaReport) {
    const rr = report.rudrakshaReport;
    if (!kundliJson.remedies) {
      kundliJson.remedies = {};
    }
    if (!kundliJson.remedies.rudraksha) {
      kundliJson.remedies.rudraksha = {};
    }
    if (!kundliJson.remedies.rudraksha.mukhi_details) {
      kundliJson.remedies.rudraksha.mukhi_details = {};
    }

    // Clean any existing jammed recommendation/suggested in remedies
    if (typeof kundliJson.remedies.rudraksha.suggested === 'string') {
      if (kundliJson.remedies.rudraksha.suggested.includes("Rudraksha") && !kundliJson.remedies.rudraksha.suggested.includes(",")) {
        kundliJson.remedies.rudraksha.suggested = kundliJson.remedies.rudraksha.suggested.split(/(?<=Rudraksha)(?=\d)/);
      } else {
        kundliJson.remedies.rudraksha.suggested = [kundliJson.remedies.rudraksha.suggested];
      }
    }
    if (Array.isArray(kundliJson.remedies.rudraksha.suggested)) {
      kundliJson.remedies.rudraksha.suggested = kundliJson.remedies.rudraksha.suggested.map(s => s.trim()).filter(Boolean);
    }
    if (kundliJson.remedies.rudraksha.recommendation && typeof kundliJson.remedies.rudraksha.recommendation === 'string') {
      kundliJson.remedies.rudraksha.recommendation = kundliJson.remedies.rudraksha.recommendation.replace(/Rudraksha(\d)/g, 'Rudraksha, $1');
    }
    
    // Inject primary bead info
    if (rr.recommendation?.primary) {
      const primName = rr.recommendation.primary; // e.g. "17-Mukhi Rudraksha"
      const cleanPrimName = primName.replace(/\s*Rudraksha\s*/gi, "").trim(); // "17-Mukhi"
      const primData = rr.seventeenMukhi || {};
      
      kundliJson.remedies.rudraksha.mukhi_details[primName] = {
        details: primData.details || "",
        benefits: primData.benefits || [],
        how_to_wear: primData.howToWear || "",
        precautions: primData.precautions || []
      };
      kundliJson.remedies.rudraksha.mukhi_details[cleanPrimName] = kundliJson.remedies.rudraksha.mukhi_details[primName];
    }

    // Inject secondary bead info
    if (rr.recommendation?.secondary) {
      const secName = rr.recommendation.secondary; // e.g. "14-Mukhi Rudraksha"
      const cleanSecName = secName.replace(/\s*Rudraksha\s*/gi, "").trim(); // "14-Mukhi"
      const secData = rr.fourteenMukhi || {};
      
      kundliJson.remedies.rudraksha.mukhi_details[secName] = {
        details: secData.details || "",
        benefits: secData.benefits || [],
        how_to_wear: secData.howToWear || "",
        precautions: secData.precautions || []
      };
      kundliJson.remedies.rudraksha.mukhi_details[cleanSecName] = kundliJson.remedies.rudraksha.mukhi_details[secName];
    }

    // Inject suggested list
    if (rr.recommendation?.primary && rr.recommendation?.secondary) {
      kundliJson.remedies.rudraksha.suggested = [rr.recommendation.primary, rr.recommendation.secondary];
    }
  }
}


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
        status: { [Op.in]: ["accepted", "ongoing"] },
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
        status: { [Op.in]: ["accepted", "ongoing"] },
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
          context: { req, userId, feature: "free_report_ai" },
      });
    } catch (err) {
      console.error(
        "[KundliForCall] Failed to generate AI Free Report:",
        err?.message || err
      );
    }

    const kundliJson = kundli.toJSON();
    syncRudrakshaRemedies(kundliJson, aiFreeReport);

    res.status(200).json({
      success: true,
      kundli: {
        ...kundliJson,
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

/**
 * Get user's generated Kundli list for astrologer during chat session.
 */
const getUserKundlisForChat = async (req, res) => {
  try {
    const astrologerId = req.user.id;
    const { sessionId } = req.params;

    const chatSession = await ChatSession.findOne({
      where: {
        id: sessionId,
        astrologerId,
        status: "active",
        requestStatus: "approved",
      },
    });

    if (!chatSession) {
      return res.status(404).json({
        success: false,
        message: "Chat session not found or not active",
      });
    }

    const userRequests = await UserRequest.findAll({
      where: { userId: chatSession.userId },
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
    console.error("Get user kundlis for chat error:", error);
    res.status(500).json({
      success: false,
      message: "Failed to fetch user kundlis",
      error: error.message,
    });
  }
};

/**
 * Generate share-view URL for a specific user kundli in an active chat.
 * This reuses the existing Kundli report page in embedded modal view.
 */
const getKundliShareViewForChat = async (req, res) => {
  try {
    const astrologerId = req.user.id;
    const { sessionId, userRequestId } = req.params;

    const chatSession = await ChatSession.findOne({
      where: {
        id: sessionId,
        astrologerId,
        status: "active",
        requestStatus: "approved",
      },
    });

    if (!chatSession) {
      return res.status(404).json({
        success: false,
        message: "Chat session not found or not active",
      });
    }

    const userRequest = await UserRequest.findOne({
      where: {
        id: userRequestId,
        userId: chatSession.userId,
      },
    });

    if (!userRequest) {
      return res.status(404).json({
        success: false,
        message: "User request not found",
      });
    }

    const kundli = await Kundli.findOne({
      where: { requestId: userRequestId },
    });

    if (!kundli) {
      return res.status(404).json({
        success: false,
        message: "Kundli not found",
      });
    }

    if (!kundli.isPublic) {
      await kundli.update({ isPublic: true });
    }

    const frontendBaseUrl = (process.env.FRONTEND_URL || "http://localhost:3000").replace(/\/+$/, "");
    const shareUrl = `${frontendBaseUrl}/kundliReport?id=${encodeURIComponent(userRequestId)}`;

    res.status(200).json({
      success: true,
      shareUrl,
    });
  } catch (error) {
    console.error("Get kundli share view for chat error:", error);
    res.status(500).json({
      success: false,
      message: "Failed to prepare kundli view",
      error: error.message,
    });
  }
};

module.exports = {
  getUserKundlisForCall,
  getKundliForCall,
  getUserKundlisForChat,
  getKundliShareViewForChat,
};
