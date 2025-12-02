const AssistantPlan = require("../../model/assistant/assistantPlan");
const AssistantChat = require("../../model/assistant/assistantChat");
const Astrologer = require("../../model/astrologer/astrologer");
const User = require("../../model/user/userAuth");
const Wallet = require("../../model/wallet/wallet");
const WalletTransaction = require("../../model/wallet/walletTransaction");
const assistantService = require("../../services/assistantService");
const { v4: uuidv4 } = require("uuid");
const { Op } = require("sequelize");
const sequelize = require("../../config/database");
const OpenAI = require("openai");

const openai = new OpenAI({
  apiKey: process.env.OPENAI_API_KEY,
});

// Note: You'll need to integrate with an AI API (OpenAI, Anthropic, Gemini, etc.)
// For now, this includes the structure. Add your AI API integration in sendMessage function

/**
 * Send message to astrologer's assistant (User)
 */
const sendMessage = async (req, res) => {
  try {
    const userId = req.user.id;
    const { astrologerId, message, sessionId } = req.body;

    if (!astrologerId || !message) {
      return res.status(400).json({
        success: false,
        message: "Astrologer ID and message are required",
      });
    }

    // Check if astrologer exists and is active
    const astrologer = await Astrologer.findOne({
      where: { id: astrologerId, isApproved: true, isActive: true },
    });

    if (!astrologer) {
      return res.status(404).json({
        success: false,
        message: "Astrologer not found or not available",
      });
    }

    // Check if astrologer has active assistant plan
    const assistantPlan = await AssistantPlan.findOne({
      where: {
        astrologerId,
        isActive: true,
        endDate: { [Op.gte]: new Date() },
      },
    });

    if (!assistantPlan) {
      return res.status(403).json({
        success: false,
        message: "This astrologer does not have an active AI assistant",
      });
    }

    // Check user wallet balance (charge same as astrologer's per minute rate)
    const wallet = await Wallet.findOne({ where: { userId } });
    const estimatedCost = astrologer.pricePerMinute; // Estimate 1 minute per message

    if (!wallet || wallet.balance < estimatedCost) {
      return res.status(402).json({
        success: false,
        message: `Insufficient wallet balance. Please recharge at least ₹${estimatedCost}`,
        required: estimatedCost,
        current: wallet ? wallet.balance : 0,
      });
    }

    // Check daily limit
    const limitCheck = await assistantService.checkDailyLimit(
      astrologerId,
      assistantPlan
    );

    if (limitCheck.exceeded) {
      return res.status(429).json({
        success: false,
        message: "Daily chat limit reached for this assistant. Please try again tomorrow.",
        limit: limitCheck,
      });
    }

    // Generate or use existing session ID
    const chatSessionId = sessionId || uuidv4();

    // Save user message
    await assistantService.saveChatMessage(
      chatSessionId,
      userId,
      astrologerId,
      "user",
      message
    );

    // Build context for AI
    const context = await assistantService.buildAssistantContext(
      astrologerId,
      assistantPlan
    );

    // Generate system prompt
    const systemPrompt = assistantService.generateSystemPrompt(
      astrologer,
      assistantPlan,
      context
    );

    // Get chat history
    const chatHistory = await assistantService.getChatHistory(chatSessionId, 20);

    // Format for AI API
    const messages = assistantService.formatConversationForAI(
      systemPrompt,
      chatHistory
    );

    // Call OpenAI API
    let aiResponse;
    let tokensUsed = 0;

    try {
      const response = await openai.chat.completions.create({
        model: process.env.OPENAI_CHAT_MODEL || "gpt-4o-mini",
        messages: messages,
        temperature: 0.7,
        max_tokens: 500,
      });

      aiResponse = response.choices[0].message.content;
      tokensUsed = response.usage.total_tokens;
    } catch (error) {
      console.error("OpenAI API error:", error);
      return res.status(500).json({
        success: false,
        message: "Failed to generate AI response",
        error: error.message,
      });
    }

    // Calculate cost (same as astrologer's rate per minute)
    const chatCost = astrologer.pricePerMinute;

    // Deduct from wallet
    await wallet.update({
      balance: parseFloat(wallet.balance) - parseFloat(chatCost),
    });

    // Create wallet transaction
    await WalletTransaction.create({
      walletId: wallet.id,
      type: "debit",
      amount: chatCost,
      status: "completed",
      description: `AI Assistant chat with ${astrologer.fullName}`,
      metadata: {
        astrologerId,
        sessionId: chatSessionId,
        tokensUsed,
      },
    });

    // Save assistant response
    const contextUsed = {
      profileAccess: true,
      blogAccess: assistantPlan.features.blogAccess,
      reviewAccess: assistantPlan.features.reviewAccess,
    };

    await assistantService.saveChatMessage(
      chatSessionId,
      userId,
      astrologerId,
      "assistant",
      aiResponse,
      contextUsed,
      tokensUsed
    );

    // Increment chat count
    await assistantService.incrementChatCount(astrologerId);

    // Update revenue
    await AssistantPlan.increment(
      { totalRevenue: chatCost },
      { where: { astrologerId } }
    );

    res.status(200).json({
      success: true,
      sessionId: chatSessionId,
      message: aiResponse,
      assistantName: assistantPlan.assistantName || `${astrologer.fullName}'s Assistant`,
      remainingChats: limitCheck.remaining - 1,
      chatCost,
      walletBalance: parseFloat(wallet.balance),
      tokensUsed,
    });
  } catch (error) {
    console.error("Send message error:", error);
    res.status(500).json({
      success: false,
      message: "Failed to send message",
      error: error.message,
    });
  }
};

/**
 * Get chat history for a session (User)
 */
const getChatHistory = async (req, res) => {
  try {
    const userId = req.user.id;
    const { sessionId } = req.params;
    const { page = 1, limit = 50 } = req.query;
    const offset = (page - 1) * limit;

    const { rows: messages, count } = await AssistantChat.findAndCountAll({
      where: {
        sessionId,
        userId,
      },
      order: [["createdAt", "ASC"]],
      limit: parseInt(limit),
      offset: parseInt(offset),
      include: [
        {
          model: Astrologer,
          as: "astrologer",
          attributes: ["id", "fullName", "photo"],
        },
      ],
    });

    res.status(200).json({
      success: true,
      messages,
      pagination: {
        total: count,
        page: parseInt(page),
        limit: parseInt(limit),
        totalPages: Math.ceil(count / limit),
      },
    });
  } catch (error) {
    console.error("Get chat history error:", error);
    res.status(500).json({
      success: false,
      message: "Failed to fetch chat history",
      error: error.message,
    });
  }
};

/**
 * Get all chat sessions for a user
 */
const getMyChatSessions = async (req, res) => {
  try {
    const userId = req.user.id;
    const { page = 1, limit = 20 } = req.query;
    const offset = (page - 1) * limit;

    // Get distinct sessions with last message
    const sessions = await AssistantChat.findAll({
      where: { userId },
      attributes: [
        "sessionId",
        "astrologerId",
        [sequelize.fn("MAX", sequelize.col("createdAt")), "lastMessageAt"],
        [sequelize.fn("COUNT", sequelize.col("id")), "messageCount"],
      ],
      include: [
        {
          model: Astrologer,
          as: "astrologer",
          attributes: ["id", "fullName", "photo", "rating"],
        },
      ],
      group: ["sessionId", "astrologerId", "astrologer.id"],
      order: [[sequelize.fn("MAX", sequelize.col("createdAt")), "DESC"]],
      limit: parseInt(limit),
      offset: parseInt(offset),
      raw: false,
    });

    res.status(200).json({
      success: true,
      sessions,
    });
  } catch (error) {
    console.error("Get chat sessions error:", error);
    res.status(500).json({
      success: false,
      message: "Failed to fetch chat sessions",
      error: error.message,
    });
  }
};

/**
 * Check if astrologer has active assistant
 */
const checkAssistantAvailability = async (req, res) => {
  try {
    const { astrologerId } = req.params;

    const assistantPlan = await AssistantPlan.findOne({
      where: {
        astrologerId,
        isActive: true,
        endDate: { [Op.gte]: new Date() },
      },
      attributes: [
        "id",
        "planType",
        "assistantName",
        "assistantDescription",
        "totalChatsHandled",
        "lastActiveAt",
      ],
    });

    if (!assistantPlan) {
      return res.status(200).json({
        success: true,
        available: false,
        message: "Assistant not available",
      });
    }

    // Get astrologer pricing
    const astrologer = await Astrologer.findByPk(astrologerId, {
      attributes: ["pricePerMinute", "fullName"],
    });

    res.status(200).json({
      success: true,
      available: true,
      assistant: {
        name: assistantPlan.assistantName || "AI Assistant",
        description: assistantPlan.assistantDescription,
        planType: assistantPlan.planType,
        totalChatsHandled: assistantPlan.totalChatsHandled,
      },
      pricing: {
        perMessage: parseFloat(astrologer.pricePerMinute),
        currency: "INR",
        note: `Each message costs ₹${astrologer.pricePerMinute} (same as consultation rate)`,
      },
    });
  } catch (error) {
    console.error("Check assistant availability error:", error);
    res.status(500).json({
      success: false,
      message: "Failed to check assistant availability",
      error: error.message,
    });
  }
};

// ============= ASTROLOGER ROUTES =============

/**
 * Subscribe to assistant plan (Astrologer)
 */
const subscribeToPlan = async (req, res) => {
  try {
    const astrologerId = req.astrologer.id;
    const {
      planType,
      durationMonths = 1,
      assistantName,
      assistantDescription,
      customInstructions,
    } = req.body;

    if (!planType || !["basic", "premium", "enterprise"].includes(planType)) {
      return res.status(400).json({
        success: false,
        message: "Valid plan type is required (basic, premium, enterprise)",
      });
    }

    // Check if already has active plan
    const existingPlan = await AssistantPlan.findOne({
      where: {
        astrologerId,
        isActive: true,
        endDate: { [Op.gte]: new Date() },
      },
    });

    if (existingPlan) {
      return res.status(400).json({
        success: false,
        message: "You already have an active assistant plan",
        plan: existingPlan,
      });
    }

    // Define plan pricing and features
    const planConfig = {
      basic: {
        price: 499,
        features: {
          profileAccess: true,
          blogAccess: false,
          reviewAccess: false,
          analyticsAccess: false,
          customPrompts: false,
          maxChatsPerDay: 50,
        },
      },
      premium: {
        price: 999,
        features: {
          profileAccess: true,
          blogAccess: true,
          reviewAccess: true,
          analyticsAccess: false,
          customPrompts: true,
          maxChatsPerDay: 200,
        },
      },
      enterprise: {
        price: 1999,
        features: {
          profileAccess: true,
          blogAccess: true,
          reviewAccess: true,
          analyticsAccess: true,
          customPrompts: true,
          maxChatsPerDay: 1000,
        },
      },
    };

    const config = planConfig[planType];
    const startDate = new Date();
    const endDate = new Date();
    endDate.setMonth(endDate.getMonth() + parseInt(durationMonths));

    // Create plan
    const plan = await AssistantPlan.create({
      astrologerId,
      planType,
      isActive: true,
      startDate,
      endDate,
      monthlyPrice: config.price,
      features: config.features,
      assistantName,
      assistantDescription,
      customInstructions,
    });

    res.status(201).json({
      success: true,
      message: "Successfully subscribed to assistant plan",
      plan,
      totalCost: config.price * durationMonths,
    });
  } catch (error) {
    console.error("Subscribe to plan error:", error);
    res.status(500).json({
      success: false,
      message: "Failed to subscribe to plan",
      error: error.message,
    });
  }
};

/**
 * Get my assistant plan (Astrologer)
 */
const getMyAssistantPlan = async (req, res) => {
  try {
    const astrologerId = req.astrologer.id;

    const plan = await AssistantPlan.findOne({
      where: { astrologerId },
      order: [["createdAt", "DESC"]],
    });

    if (!plan) {
      return res.status(404).json({
        success: false,
        message: "No assistant plan found",
      });
    }

    const isExpired = new Date() > plan.endDate;

    res.status(200).json({
      success: true,
      plan,
      isExpired,
      daysRemaining: isExpired
        ? 0
        : Math.ceil((plan.endDate - new Date()) / (1000 * 60 * 60 * 24)),
    });
  } catch (error) {
    console.error("Get assistant plan error:", error);
    res.status(500).json({
      success: false,
      message: "Failed to fetch assistant plan",
      error: error.message,
    });
  }
};

/**
 * Update assistant configuration (Astrologer)
 */
const updateAssistantConfig = async (req, res) => {
  try {
    const astrologerId = req.astrologer.id;
    const { assistantName, assistantDescription, customInstructions } = req.body;

    const plan = await AssistantPlan.findOne({
      where: { astrologerId, isActive: true },
    });

    if (!plan) {
      return res.status(404).json({
        success: false,
        message: "No active assistant plan found",
      });
    }

    // Check if plan allows custom prompts
    if (customInstructions && !plan.features.customPrompts) {
      return res.status(403).json({
        success: false,
        message: "Your plan does not support custom instructions. Upgrade to Premium or Enterprise.",
      });
    }

    await plan.update({
      assistantName,
      assistantDescription,
      customInstructions: plan.features.customPrompts ? customInstructions : null,
    });

    res.status(200).json({
      success: true,
      message: "Assistant configuration updated successfully",
      plan,
    });
  } catch (error) {
    console.error("Update assistant config error:", error);
    res.status(500).json({
      success: false,
      message: "Failed to update assistant configuration",
      error: error.message,
    });
  }
};

/**
 * Get assistant analytics (Astrologer)
 */
const getAssistantAnalytics = async (req, res) => {
  try {
    const astrologerId = req.astrologer.id;
    const { days = 30 } = req.query;

    const plan = await AssistantPlan.findOne({
      where: { astrologerId },
    });

    if (!plan) {
      return res.status(404).json({
        success: false,
        message: "No assistant plan found",
      });
    }

    const daysAgo = new Date();
    daysAgo.setDate(daysAgo.getDate() - parseInt(days));

    const totalChats = await AssistantChat.count({
      where: {
        astrologerId,
        role: "user",
        createdAt: { [Op.gte]: daysAgo },
      },
    });

    const uniqueUsers = await AssistantChat.count({
      where: {
        astrologerId,
        createdAt: { [Op.gte]: daysAgo },
      },
      distinct: true,
      col: "userId",
    });

    const totalSessions = await AssistantChat.count({
      where: {
        astrologerId,
        createdAt: { [Op.gte]: daysAgo },
      },
      distinct: true,
      col: "sessionId",
    });

    // Get daily chat volume
    const dailyChats = await AssistantChat.findAll({
      where: {
        astrologerId,
        role: "user",
        createdAt: { [Op.gte]: daysAgo },
      },
      attributes: [
        [sequelize.fn("DATE", sequelize.col("createdAt")), "date"],
        [sequelize.fn("COUNT", sequelize.col("id")), "count"],
      ],
      group: [sequelize.fn("DATE", sequelize.col("createdAt"))],
      order: [[sequelize.fn("DATE", sequelize.col("createdAt")), "ASC"]],
      raw: true,
    });

    res.status(200).json({
      success: true,
      analytics: {
        totalChats,
        uniqueUsers,
        totalSessions,
        avgChatsPerSession: totalSessions > 0 ? (totalChats / totalSessions).toFixed(1) : 0,
        dailyChats,
        revenue: {
          total: parseFloat(plan.totalRevenue || 0),
          periodRevenue: totalChats * parseFloat(await Astrologer.findByPk(astrologerId).then(a => a.pricePerMinute)),
          avgRevenuePerChat: totalChats > 0 ? (parseFloat(plan.totalRevenue) / plan.totalChatsHandled).toFixed(2) : 0,
        },
        planDetails: {
          planType: plan.planType,
          totalChatsHandled: plan.totalChatsHandled,
          totalRevenue: parseFloat(plan.totalRevenue || 0),
          lastActiveAt: plan.lastActiveAt,
        },
      },
      period: `Last ${days} days`,
    });
  } catch (error) {
    console.error("Get assistant analytics error:", error);
    res.status(500).json({
      success: false,
      message: "Failed to fetch assistant analytics",
      error: error.message,
    });
  }
};

/**
 * Cancel/deactivate assistant plan (Astrologer)
 */
const cancelAssistantPlan = async (req, res) => {
  try {
    const astrologerId = req.astrologer.id;

    const plan = await AssistantPlan.findOne({
      where: { astrologerId, isActive: true },
    });

    if (!plan) {
      return res.status(404).json({
        success: false,
        message: "No active assistant plan found",
      });
    }

    await plan.update({ isActive: false });

    res.status(200).json({
      success: true,
      message: "Assistant plan cancelled successfully",
    });
  } catch (error) {
    console.error("Cancel assistant plan error:", error);
    res.status(500).json({
      success: false,
      message: "Failed to cancel assistant plan",
      error: error.message,
    });
  }
};

/**
 * Get user's assistant chat spending summary
 */
const getMyChatSpending = async (req, res) => {
  try {
    const userId = req.user.id;
    const { days = 30 } = req.query;

    const daysAgo = new Date();
    daysAgo.setDate(daysAgo.getDate() - parseInt(days));

    // Get total spent on assistant chats
    const transactions = await WalletTransaction.findAll({
      where: {
        userId,
        type: "debit",
        description: { [Op.like]: "%AI Assistant chat%" },
        createdAt: { [Op.gte]: daysAgo },
      },
      attributes: ["amount", "createdAt", "metadata"],
    });

    const totalSpent = transactions.reduce(
      (sum, txn) => sum + parseFloat(txn.amount),
      0
    );

    const totalMessages = transactions.length;

    res.status(200).json({
      success: true,
      spending: {
        totalSpent: totalSpent.toFixed(2),
        totalMessages,
        avgCostPerMessage: totalMessages > 0 ? (totalSpent / totalMessages).toFixed(2) : 0,
        transactions: transactions.map((txn) => ({
          amount: parseFloat(txn.amount),
          date: txn.createdAt,
          astrologerId: txn.metadata?.astrologerId,
        })),
      },
      period: `Last ${days} days`,
    });
  } catch (error) {
    console.error("Get chat spending error:", error);
    res.status(500).json({
      success: false,
      message: "Failed to fetch chat spending",
      error: error.message,
    });
  }
};

module.exports = {
  // User routes
  sendMessage,
  getChatHistory,
  getMyChatSessions,
  checkAssistantAvailability,
  getMyChatSpending,
  
  // Astrologer routes
  subscribeToPlan,
  getMyAssistantPlan,
  updateAssistantConfig,
  getAssistantAnalytics,
  cancelAssistantPlan,
};
