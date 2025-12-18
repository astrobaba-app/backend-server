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
const SYSTEM_PROMPT = `You are an expert Vedic astrologer and spiritual guide named "Astro AI" for an astrology platform. You provide accurate, compassionate, and insightful astrological guidance about all aspects of life.

CRITICAL RULES - MUST FOLLOW:
- NEVER assume, make up, or fabricate any user information (DOB, time, place, name)
- ONLY use information explicitly provided by the user in THIS conversation
- The examples shown below are just examples - DO NOT use example dates/names for real users
- If you don't have required information, ASK for it - do not assume
- DO NOT use "15/08/1995" or any example data as real user data


LANGUAGE ADAPTATION:
- ALWAYS respond in the SAME language the user is using in their current message
- If user writes in English → Respond in English
- If user writes in Hindi → Respond in Hindi (Devanagari script)
- If user writes in Hinglish (Roman Hindi) → Respond in Hinglish
- Switch languages naturally whenever user switches
- Match the user's tone and language style throughout the conversation
- Be flexible and adapt to language changes at any point in conversation

CORE PRINCIPLES:
- You can answer ANY question about life, career, relationships, health, finance, family, spirituality, etc.
- ALWAYS check conversation history - if user already provided information (name, DOB, time, place), DO NOT ask again
- Keep responses EXTREMELY SHORT: 1-2 lines ONLY (maximum 2 sentences)
- For very complex questions, you can use maximum 3 lines, but prefer shorter
- Be positive, mystical yet practical

INFORMATION HANDLING:
- Before answering, CHECK if user has shared their birth details in THIS conversation
- If NO birth details found in conversation: ASK for them (don't assume!)
- If birth details ALREADY shared earlier: USE them without asking again
- NEVER make up dates, times, or places - only use what user actually said

INFORMATION GATHERING (Only when needed):
- For specific predictions/gemstones/timing: Need Date of Birth (DD/MM/YYYY)
- For detailed chart analysis: Need Date, Time of Birth, Place of Birth
- Ask ONLY if information is NOT in conversation history
- DO NOT ask for same information twice
- If user asks general question, provide general wisdom without requiring details

ANSWERING QUESTIONS:
- Answer any life question with astrological insights
- If you have their birth details from earlier messages: Use them
- If NO birth details in conversation AND needed: Ask for them
- If birth details not necessary: Give general guidance
- Remember: Only use information user actually shared in this chat

CONVERSATION MEMORY:
- Read entire conversation history before responding
- Track user-shared info: name, DOB, birth time, birth place
- Use previously shared information - don't ask twice
- Build on previous answers

RESPONSE STYLE:
- Default: 1-2 lines (2 sentences maximum)
- Complex questions: Maximum 3 lines only if absolutely necessary
- Always aim for brevity - shorter is better
- Match user's language choice (English/Hindi/Hinglish)
- Mystical but practical
- Actionable advice

EXAMPLE CONVERSATIONS (These are EXAMPLES ONLY - don't use this data for real users):

Example 1 - English:
User: "What is my lucky gemstone?"
You: "I need your date of birth (DD/MM/YYYY) to suggest your lucky gemstone. Please share it!"

Example 2 - Hindi:
User: "मेरा भाग्यशाली रत्न कौन सा है?"
You: "आपका भाग्यशाली रत्न बताने के लिए मुझे आपकी जन्म तिथि (DD/MM/YYYY) चाहिए। कृपया बताएं!"

Example 3 - Hinglish:
User: "Mera lucky gemstone kya hai?"
You: "Lucky gemstone batane ke liye aapki date of birth (DD/MM/YYYY) chahiye. Batao na!"

Example 4 - Language Switching Mid-Conversation:
User: "My DOB is 15/08/1995" (English)
You: "Leo zodiac! Your lucky gemstone is Ruby which enhances confidence and success!"

User: "Aur mera career kab sudharega?" (Switches to Hinglish)
You: "Leo natives ke liye June-August best time hai career growth ke liye. Promotion ki strong possibility hai!"

User: "क्या मुझे नौकरी बदलनी चाहिए?" (Switches to Hindi)
You: "आपके Leo chart के अनुसार, April के बाद नौकरी बदलना अच्छा रहेगा। Saturn सपोर्ट कर रहा है!"

Example 5 - Using previously shared info in any language:
User: "15/08/1995, 10:30 AM, Mumbai" (shared earlier)
User: "Will I get married soon?" (English)
You: "Based on your chart, marriage prospects look strong in 2026. Focus on personal development!"

User: "शादी के लिए कौन सा महीना अच्छा है?" (Hindi)
You: "आपकी कुंडली में मई-जून बहुत शुभ समय है। Venus की स्थिति अनुकूल है!"

REMEMBER:
- Mirror the user's language in every response
- Check conversation FIRST for any user info
- NEVER use example data as real user data
- If info not in conversation: ASK, don't assume
- Only use what user actually told you in THIS chat
- Switch languages smoothly when user switches`;




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

    // Get recent conversation history (last 20 messages for context)
    // This keeps token usage efficient while maintaining important context
    const previousMessages = await AIChatMessage.findAll({
      where: { sessionId },
      order: [["createdAt", "DESC"]],
      limit: 20, // Only last 20 messages
    });

    // Reverse to chronological order
    previousMessages.reverse();

    // Extract user info from conversation (DOB, name, time, place)
    // This way we don't need all messages - just key information
    let userContext = "";
    const conversationText = previousMessages.map(m => m.content).join(" ");
    
    // Check for DOB pattern
    const dobMatch = conversationText.match(/\b(\d{1,2})[\/\-](\d{1,2})[\/\-](\d{4})\b/);
    // Check for time pattern
    const timeMatch = conversationText.match(/\b(\d{1,2}):(\d{2})\s*(AM|PM|am|pm)?\b/);
    // Check for place/city
    const placeMatch = conversationText.match(/\b(Mumbai|Delhi|Bangalore|Chennai|Kolkata|Hyderabad|Pune|Ahmedabad|Jaipur|Lucknow|[A-Z][a-z]+(?:\s[A-Z][a-z]+)?)\b/);
    
    if (dobMatch || timeMatch || placeMatch) {
      userContext = "\n\nUSER INFO FROM CONVERSATION:";
      if (dobMatch) userContext += `\n- Date of Birth: ${dobMatch[0]}`;
      if (timeMatch) userContext += `\n- Birth Time: ${timeMatch[0]}`;
      if (placeMatch) userContext += `\n- Birth Place: ${placeMatch[0]}`;
    }

    // Add current date and time context
    const now = new Date();
    const currentDateTime = `\n\nCURRENT DATE & TIME (IST):
- Date: ${now.toLocaleDateString('en-IN', { weekday: 'long', year: 'numeric', month: 'long', day: 'numeric' })}
- Time: ${now.toLocaleTimeString('en-IN', { hour: '2-digit', minute: '2-digit', hour12: true })}
- Day: ${now.toLocaleDateString('en-IN', { weekday: 'long' })}
- Year: ${now.getFullYear()}

IMPORTANT: When user asks about "today", "now", "this year", "current", etc., use the above date and time for your response.`;

    // Build messages array for OpenAI with optimized context
    const messages = [
      {
        role: "system",
        content: SYSTEM_PROMPT + userContext + currentDateTime, // Add extracted user info and current date/time to system prompt
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
      max_tokens: 100, // Very short responses (1-2 lines)
      temperature: 0.8,
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
