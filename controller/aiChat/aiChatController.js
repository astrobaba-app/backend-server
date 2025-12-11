require("dotenv").config();
const OpenAI = require("openai");
const AIChatSession = require("../../model/aiChat/aiChatSession");
const AIChatMessage = require("../../model/aiChat/aiChatMessage");
const User = require("../../model/user/userAuth");

const openai = new OpenAI({
  apiKey: process.env.OPENAI_API_KEY,
});

const CHAT_MODEL = process.env.OPENAI_CHAT_MODEL || "gpt-4o-mini";

// System prompt - Always sent with every conversation
const SYSTEM_PROMPT = `You are an expert Vedic astrologer and spiritual guide for an astrology platform. Your role is to provide accurate, compassionate, and insightful astrological guidance.

GUIDELINES:
- Keep all responses between 1-3 lines only (maximum 3 sentences)
- Be warm, empathetic, and professional
- When users ask about their future, horoscope, or life events, ALWAYS ask for their date of birth first if you don't have it
- After receiving date of birth, provide astrological insights based on that information
- Remember the conversation context and refer back to previously mentioned information
- If they ask follow-up questions, answer based on the date of birth they already provided
- Use a mix of English and Hindi (Hinglish) to be relatable
- Focus on positivity and guidance, not just predictions
- If asked about topics outside astrology, politely redirect to astrological matters

RESPONSE FORMAT:
- Maximum 3 lines
- Clear and concise
- Actionable when possible

EXAMPLE CONVERSATIONS:
User: "Mera ye year kaisa hoga?"
You: "Aapke year ke baare mein batane ke liye, please apni date of birth (DD/MM/YYYY) share karein."

User: "15/08/1995"
You: "Leo zodiac! This year brings career growth opportunities in mid-2025. Focus on personal relationships in March-April. Stay confident!"

User: "Aur love life?"
You: "Love life mein May-June acha time hai for Leo natives. Venus favorable position mein hai. Be open to new connections!"

Remember: Be brief, be helpful, be mystical yet practical.`;

// ============= USER ROUTES =============

/**
 * Create a new AI chat session
 */
const createChatSession = async (req, res) => {
  try {
    const userId = req.user.id;

    // Create new session
    const session = await AIChatSession.create({
      userId,
      title: "New Chat",
      isActive: true,
      lastMessageAt: new Date(),
    });

    res.status(201).json({
      success: true,
      message: "Chat session created successfully",
      session: {
        id: session.id,
        title: session.title,
        createdAt: session.createdAt,
      },
    });
  } catch (error) {
    console.error("Create chat session error:", error);
    res.status(500).json({
      success: false,
      message: "Failed to create chat session",
      error: error.message,
    });
  }
};

/**
 * Send a message and get AI response
 */
const sendMessage = async (req, res) => {
  try {
    const userId = req.user.id;
    const { sessionId } = req.params;
    const { message } = req.body;

    if (!message || !message.trim()) {
      return res.status(400).json({
        success: false,
        message: "Message is required",
      });
    }

    // Verify session belongs to user
    const session = await AIChatSession.findOne({
      where: { id: sessionId, userId },
    });

    if (!session) {
      return res.status(404).json({
        success: false,
        message: "Chat session not found",
      });
    }

    // Save user message
    const userMessage = await AIChatMessage.create({
      sessionId,
      role: "user",
      content: message.trim(),
    });

    // Get conversation history (last 10 messages for context)
    const previousMessages = await AIChatMessage.findAll({
      where: { sessionId },
      order: [["createdAt", "ASC"]],
      limit: 10,
    });

    // Build messages array for OpenAI
    const messages = [
      {
        role: "system",
        content: SYSTEM_PROMPT,
      },
      ...previousMessages.map((msg) => ({
        role: msg.role,
        content: msg.content,
      })),
    ];

    // Call OpenAI API
    const completion = await openai.chat.completions.create({
      model: CHAT_MODEL,
      messages: messages,
      max_tokens: 150, // Keep responses short
      temperature: 0.7,
    });

    const aiResponse = completion.choices[0].message.content;
    const tokensUsed = completion.usage.total_tokens;

    // Save AI response
    const aiMessage = await AIChatMessage.create({
      sessionId,
      role: "assistant",
      content: aiResponse,
      tokens: tokensUsed,
    });

    // Update session title from first message if still "New Chat"
    if (session.title === "New Chat" && previousMessages.length <= 2) {
      const title = message.substring(0, 50) + (message.length > 50 ? "..." : "");
      await session.update({ 
        title,
        lastMessageAt: new Date(),
      });
    } else {
      await session.update({ lastMessageAt: new Date() });
    }

    res.status(200).json({
      success: true,
      userMessage: {
        id: userMessage.id,
        role: "user",
        content: userMessage.content,
        createdAt: userMessage.createdAt,
      },
      aiMessage: {
        id: aiMessage.id,
        role: "assistant",
        content: aiMessage.content,
        createdAt: aiMessage.createdAt,
      },
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
 * Get all chat sessions for user
 */
const getMyChatSessions = async (req, res) => {
  try {
    const userId = req.user.id;
    const { page = 1, limit = 20 } = req.query;
    const offset = (page - 1) * limit;

    const { rows: sessions, count } = await AIChatSession.findAndCountAll({
      where: { userId, isActive: true },
      order: [["lastMessageAt", "DESC"]],
      limit: parseInt(limit),
      offset: parseInt(offset),
    });

    res.status(200).json({
      success: true,
      sessions,
      pagination: {
        total: count,
        page: parseInt(page),
        limit: parseInt(limit),
        totalPages: Math.ceil(count / limit),
      },
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
 * Get messages from a specific chat session
 */
const getChatMessages = async (req, res) => {
  try {
    const userId = req.user.id;
    const { sessionId } = req.params;
    const { page = 1, limit = 50 } = req.query;
    const offset = (page - 1) * limit;

    // Verify session belongs to user
    const session = await AIChatSession.findOne({
      where: { id: sessionId, userId },
    });

    if (!session) {
      return res.status(404).json({
        success: false,
        message: "Chat session not found",
      });
    }

    const { rows: messages, count } = await AIChatMessage.findAndCountAll({
      where: { sessionId },
      order: [["createdAt", "ASC"]],
      limit: parseInt(limit),
      offset: parseInt(offset),
    });

    res.status(200).json({
      success: true,
      session: {
        id: session.id,
        title: session.title,
        createdAt: session.createdAt,
        lastMessageAt: session.lastMessageAt,
      },
      messages,
      pagination: {
        total: count,
        page: parseInt(page),
        limit: parseInt(limit),
        totalPages: Math.ceil(count / limit),
      },
    });
  } catch (error) {
    console.error("Get chat messages error:", error);
    res.status(500).json({
      success: false,
      message: "Failed to fetch chat messages",
      error: error.message,
    });
  }
};

/**
 * Delete a chat session
 */
const deleteChatSession = async (req, res) => {
  try {
    const userId = req.user.id;
    const { sessionId } = req.params;

    const session = await AIChatSession.findOne({
      where: { id: sessionId, userId },
    });

    if (!session) {
      return res.status(404).json({
        success: false,
        message: "Chat session not found",
      });
    }

    // Soft delete - just mark as inactive
    await session.update({ isActive: false });

    res.status(200).json({
      success: true,
      message: "Chat session deleted successfully",
    });
  } catch (error) {
    console.error("Delete chat session error:", error);
    res.status(500).json({
      success: false,
      message: "Failed to delete chat session",
      error: error.message,
    });
  }
};

/**
 * Clear all messages from a chat session (start fresh)
 */
const clearChatSession = async (req, res) => {
  try {
    const userId = req.user.id;
    const { sessionId } = req.params;

    const session = await AIChatSession.findOne({
      where: { id: sessionId, userId },
    });

    if (!session) {
      return res.status(404).json({
        success: false,
        message: "Chat session not found",
      });
    }

    // Delete all messages
    await AIChatMessage.destroy({
      where: { sessionId },
    });

    // Reset session title
    await session.update({
      title: "New Chat",
      lastMessageAt: new Date(),
    });

    res.status(200).json({
      success: true,
      message: "Chat session cleared successfully",
    });
  } catch (error) {
    console.error("Clear chat session error:", error);
    res.status(500).json({
      success: false,
      message: "Failed to clear chat session",
      error: error.message,
    });
  }
};

module.exports = {
  createChatSession,
  sendMessage,
  getMyChatSessions,
  getChatMessages,
  deleteChatSession,
  clearChatSession,
};
