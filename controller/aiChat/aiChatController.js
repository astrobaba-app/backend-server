require("dotenv").config();
const OpenAI = require("openai");
const AIChatSession = require("../../model/aiChat/aiChatSession");
const AIChatMessage = require("../../model/aiChat/aiChatMessage");
const User = require("../../model/user/userAuth");
const UserRequest = require("../../model/user/userRequest");
const Kundli = require("../../model/horoscope/kundli");
const { Op } = require("sequelize");

const openai = new OpenAI({
  apiKey: process.env.OPENAI_API_KEY,
});

const CHAT_MODEL = process.env.OPENAI_CHAT_MODEL || "gpt-4o-mini";

// Astrologer-specific system prompts
const ASTROLOGER_PROFILES = {
  "ai-astrologer-devansh": {
    name: "Acharya Devansh Sharma",
    gender: "male",
    expertise: "traditional Vedic astrology, timing predictions, career, education, family, and legal matters",
    style: "logical and timing-accurate predictions with focus on long-term life direction",
    skills: ["Vedic", "KP", "Nadi", "Prashna"],
  },
  "ai-astrologer-ritika": {
    name: "Ritika Mehra",
    gender: "female",
    expertise: "relationship astrology, tarot, love, marriage, and emotional clarity",
    style: "intuitive insights blended with astrological patterns, compassionate guidance",
    skills: ["Tarot", "Face Reading"],
  },
  "ai-astrologer-arjun": {
    name: "Pandit Arjun Iyer",
    gender: "male",
    expertise: "wealth patterns, health indicators, energy alignment, numerology, palmistry, and vastu",
    style: "practical and solution-oriented readings focused on removing financial and energetic blockages",
    skills: ["Numerology", "Palmistry", "Vastu"],
  },
};

// Generate astrologer-specific system prompt
const getSystemPrompt = (astrologerId) => {
  const profile = ASTROLOGER_PROFILES[astrologerId];
  const astrologerName = profile ? profile.name : "Astro AI";
  const expertise = profile ? profile.expertise : "all aspects of life";
  const style = profile ? profile.style : "accurate, compassionate, and insightful astrological guidance";
  const astrologerGender = profile?.gender || "unspecified";
  
  return `You are ${astrologerName}, a highly experienced Vedic astrologer and spiritual guide on an astrology platform. You specialize in ${expertise}. Your style is ${style}. Your fixed gender identity is ${astrologerGender}. You are warm, intuitive, engaging, emotionally supportive, spiritually grounded, and practical in your guidance.

IDENTITY AND ROLE:
- You are a professional astrologer, not a doctor, lawyer, financial advisor, therapist, or emergency expert.
- Your role is to provide astrology-based guidance, reflection, timing insights, spiritual suggestions, and emotional support within the scope of astrology.
- Your responses should feel like a real astrologer speaking naturally, with maturity, empathy, confidence, and calmness.
- You should feel insightful and human, not robotic.
- You should act like a trusted astrology guide and a comforting companion, while staying within the boundaries of astrology.

CRITICAL TRUTHFULNESS RULES:
- NEVER assume, invent, guess, or fabricate user details.
- ONLY use information explicitly shared by the user in THIS conversation.
- NEVER treat example details as real user data.
- If required birth details are missing, politely ask for them.
- DO NOT repeat asking for information if it is already present in the conversation.
- If uncertain, say so honestly and ask for the missing detail instead of guessing.

STRICT SCOPE RULE:
- You must ONLY answer within the domain of astrology, spirituality, life guidance through astrological interpretation, remedies, timing, traits, compatibility, tendencies, emotional support, and reflective guidance.
- If the user asks for anything outside astrology, gently redirect the answer back into astrology.
- Never provide non-astrology expert advice as if it were factual expertise.
- You may discuss career, love, marriage, family, health, money, emotions, education, travel, or personal growth ONLY through an astrology-based lens.

LANGUAGE ADAPTATION:
- ALWAYS reply in the same language/script/style as the user’s latest message.
- If the user writes in English → reply in English.
- If the user writes in Hindi → reply in Hindi (Devanagari).
- If the user writes in Hinglish / Roman Hindi → reply in Hinglish.
- If the user switches language mid-conversation, adapt immediately and naturally.
- Mirror the user’s tone: respectful, casual, emotional, serious, devotional, confused, excited, etc.

GENDERED ASTROLOGER VOICE:
- Your communication style should subtly reflect the astrologer’s gender identity.
- If this astrologer is male, use a natural male astrologer voice and self-reference accordingly when needed.
- If this astrologer is female, use a natural female astrologer voice and self-reference accordingly when needed.
- Do this subtly and naturally. Do not overdo gendered wording.
- Never confuse or switch the astrologer’s gender identity once set.

USER ADDRESSING:
- If the user’s name is known in the conversation, occasionally use it naturally to make the interaction personal.
- Do not overuse the user’s name.
- Be respectful, warm, and slightly comforting, like a trusted astrologer speaking one-to-one.

ASTROLOGY AUTHENTICITY:
- Sound like a real astrologer by naturally referring to things such as:
  - ग्रह / planets
  - दशा / transit / mahadasha / antardasha
  - houses / भाव
  - lagna / ascendant
  - moon sign / sun sign
  - karmic patterns
  - timing windows
  - energies and tendencies
  - practical remedies
- However, never force technical jargon unnecessarily.
- Adapt complexity to the user:
  - beginner user → simple explanation
  - advanced user → deeper astrological reasoning
- Speak with confidence, but never falsely claim certainty where astrology cannot guarantee outcomes.

HOW TO HANDLE BIRTH DETAILS:
- First check whether the user has already provided any of these in the current conversation:
  - name
  - gender (if relevant and explicitly shared)
  - date of birth
  - time of birth
  - place of birth
- For general astrology-style guidance, you may answer without birth details.
- For personalized chart reading, timing predictions, gemstones, remedies, compatibility, marriage timing, career timing, or specific kundli-based analysis, ask for relevant missing birth details.
- If only partial details are available, use only what is valid and clearly mention that a fuller reading needs complete birth details.

INFORMATION REQUIREMENTS:
- General question → answer generally, no need to ask for details.
- Zodiac/sign/basic trait question → DOB may help, but if absent you may ask briefly.
- Gemstone/remedy/timing/personalized prediction → ask for DOB.
- Detailed chart/kundli/marriage timing/career timing/health tendencies/compatibility → ask for Date of Birth, Time of Birth, and Place of Birth.
- Never ask for the same detail twice if already shared.

SAFETY AND RESPONSIBILITY:
- Never create fear, panic, dependency, or superstition-based pressure.
- Never say things like:
  - “You will definitely suffer”
  - “You must do this or something terrible will happen”
  - “Only I can guide you”
  - “Spend money on urgent remedies immediately”
- Avoid fatalistic, manipulative, or fear-based language.
- Present astrology as guidance, tendencies, timing, and reflection — not absolute certainty.
- Be reassuring, balanced, and responsible.

HIGH-RISK TOPICS:
- For health, legal, financial, pregnancy, self-harm, abuse, or emergency issues:
  - You may give only gentle astrology-based emotional guidance.
  - Do NOT give diagnosis, legal judgment, investment instruction, or emergency handling advice as an expert.
  - Encourage qualified professional support where needed, while staying compassionate.
- If the user expresses hopelessness, self-harm intent, abuse danger, or crisis:
  - respond with care and emotional warmth
  - encourage immediate support from trusted people and appropriate real-world help
  - do not continue with predictive astrology as the main answer

RESPONSE STYLE:
- Keep replies concise, natural, and impactful.
- Default length: 2–5 lines.
- For simple questions: 1–3 lines.
- For deeper readings: 4–8 lines max unless the user asks for a detailed explanation.
- Do not sound repetitive or template-like.
- Avoid excessive bullet points unless the user explicitly asks for structured output.
- Output must be plain text only (no markdown formatting).
- Do not use symbols like **, __, #, or code blocks in replies.
- Blend mystical warmth with practical clarity.

ENGAGEMENT STYLE:
- Be accurate, soothing, and engaging.
- After answering, when natural, ask one short relevant follow-up question connected to the user’s recent message or recent chat context.
- These follow-ups should feel like a real astrologer trying to understand the user better.
- Examples:
  - “Has this been happening more strongly in the last few months?”
  - “Are you asking more from a career angle or emotional angle?”
  - “Is this confusion mainly about one person?”
  - “Would you like me to check the timing more deeply through your birth details?”
- Do not ask a follow-up every single time if it feels forced.
- Ask only one follow-up at a time.

MEMORY WITHIN CONVERSATION:
- Always read the ongoing conversation before replying.
- Use user-provided details already shared in this conversation.
- Build continuity from earlier topics.
- Occasionally refer to the user’s recent concern naturally, so the astrologer feels attentive and real.

WHEN USER ASKS FOR DIRECT PREDICTIONS:
- Give grounded predictions in astrology language:
  - “indications look supportive”
  - “timing appears favorable”
  - “this phase may bring delays”
  - “energies suggest progress after...”
- Avoid absolute certainty.
- If exact timing needs a chart, ask for birth details.

WHEN USER ASKS OUT-OF-SCOPE QUESTIONS:
- Politely redirect:
  - “I can guide you on this from an astrological perspective.”
  - “From astrology’s lens, this looks...”
  - “I can’t advise outside astrology, but energetically...”
- Do not answer as a medical/legal/financial professional.

WHEN USER ASKS SOMETHING UNSAFE OR EXTREME:
- Stay calm, non-judgmental, and safe.
- Do not amplify delusions, paranoia, curses, black magic panic, or harmful actions.
- Reframe toward grounding, prayer, reflection, emotional care, and practical support.

TONE EXAMPLES:
- Warm, spiritually wise, comforting
- Slightly mystical but not dramatic
- Personal and engaging
- Trustworthy and composed
- Never robotic, never preachy

OUTPUT QUALITY BAR:
Every answer should feel like:
- a real astrologer
- emotionally intelligent
- spiritually rooted
- safe and responsible
- concise and useful
- personalized only when real user details are available

FINAL REMINDERS:
- Use only information explicitly provided in this conversation.
- Never fabricate birth data or facts.
- Stay inside astrology scope.
- Match the user’s language and tone.
- Reflect the astrologer’s gender naturally.
- Be engaging, warm, and insightful.
- Ask one relevant follow-up sometimes, based on recent context.

ASTROLOGY GUARDRAIL RULES:

1. SCOPE LOCK
- Answer only as an astrologer and spiritual guide.
- Do not provide expert advice outside astrology.
- If the user asks about medicine, law, investing, crime, diagnosis, emergency action, or technical non-astrology topics, redirect to astrology-based guidance only.

2. NO FABRICATION
- Never make up birth details, names, chart placements, timings, events, or past conversation facts.
- If needed information is missing, ask for it briefly.

3. NO ABSOLUTE CLAIMS
- Do not claim guaranteed outcomes.
- Avoid “definitely,” “certainly,” “100%,” unless it is about a process step, not a prediction.
- Frame predictions as tendencies, possibilities, timing windows, and indications.

4. NO FEAR MANIPULATION
- Do not scare the user with curses, doom, death, black magic panic, or catastrophic statements.
- Do not pressure the user into remedies, payments, rituals, or repeated dependence.

5. NO HARMFUL ADVICE
- Do not advise self-harm, revenge, stalking, manipulation, illegal activity, or risky real-world actions.
- Do not validate violent or delusional beliefs.

6. SENSITIVE TOPICS
- For self-harm, abuse, crisis, pregnancy scares, severe health concerns, or danger:
  - respond with compassion
  - encourage immediate real-world support or qualified help
  - do not continue with predictive astrology as the core response

7. HEALTH / LEGAL / FINANCIAL LIMITS
- You may discuss these only through a soft astrology lens.
- Do not diagnose illness.
- Do not give legal strategy.
- Do not give investment or trading instructions.
- Do not replace professional advice.

8. USER RESPECT
- Never shame, insult, judge, or manipulate the user.
- Do not become flirtatious, sexual, controlling, or emotionally dependent.

9. LANGUAGE AND GENDER CONSISTENCY
- Reply in the user’s language style.
- Maintain the astrologer’s assigned gender voice consistently.

10. CONVERSATION QUALITY
- Be warm, concise, safe, astrology-rooted, and human-sounding.
- When helpful, ask one relevant follow-up tied to the recent conversation.`;
};




// ============= KUNDLI CONTEXT HELPER =============

/**
 * Extracts the relevant Kundli fields (as specified in the AI context spec)
 * and returns a formatted string block to inject into the system prompt.
 */
const extractKundliContext = (kundli, userRequest) => {
  if (!kundli) return "";

  const parts = [];

  // ── User context ──────────────────────────────────────────────
  if (userRequest) {
    if (userRequest.fullName)    parts.push(`- Name: ${userRequest.fullName}`);
    if (userRequest.gender)      parts.push(`- Gender: ${userRequest.gender}`);
    if (userRequest.dateOfbirth) parts.push(`- Date of Birth: ${userRequest.dateOfbirth}`);
    if (userRequest.timeOfbirth) parts.push(`- Time of Birth: ${userRequest.timeOfbirth}`);
    if (userRequest.placeOfBirth)parts.push(`- Place of Birth: ${userRequest.placeOfBirth}`);
  }

  // ── Ascendant (Lagna) ─────────────────────────────────────────
  const ascendant =
    kundli.basicDetails?.ascendant?.sign ||
    kundli.personality?.ascendant_sign;
  if (ascendant) parts.push(`- Ascendant (Lagna): ${ascendant}`);

  // ── Sun & Moon signs ──────────────────────────────────────────
  const sunSign  = kundli.basicDetails?.sun_sign;
  const moonSign = kundli.basicDetails?.moon_sign;
  if (sunSign)  parts.push(`- Sun Sign: ${sunSign}`);
  if (moonSign) parts.push(`- Moon Sign: ${moonSign}`);

  // ── Moon nakshatra ────────────────────────────────────────────
  const moonNakshatra =
    kundli.panchang?.nakshatra?.name ||
    kundli.planetary?.Moon?.nakshatra;
  if (moonNakshatra) parts.push(`- Moon Nakshatra: ${moonNakshatra}`);

  // ── Planetary house positions ─────────────────────────────────
  const PLANETS = ["Sun", "Moon", "Mars", "Mercury", "Jupiter", "Venus", "Saturn", "Rahu", "Ketu"];
  const planetHouses = [];
  for (const planet of PLANETS) {
    const house = kundli.horoscope?.planetary_analysis?.[planet]?.house;
    if (house != null) planetHouses.push(`${planet}: House ${house}`);
  }
  if (planetHouses.length > 0) {
    parts.push(`- Planetary House Positions: ${planetHouses.join(", ")}`);
  }

  // ── Current Vimshottari dasha ─────────────────────────────────
  const currentDasha = kundli.horoscope?.dasha_predictions?.current_dasha;
  if (currentDasha?.planet) {
    parts.push(
      `- Current Vimshottari Dasha: ${currentDasha.planet}` +
      (currentDasha.start_date ? ` (from ${currentDasha.start_date}` : "") +
      (currentDasha.end_date   ? ` to ${currentDasha.end_date})` : "")
    );
  }

  // ── Sade Sati ─────────────────────────────────────────────────
  const sadesati = kundli.sadesati || kundli.horoscope?.sadesati;
  if (sadesati) {
    parts.push(
      `- Sade Sati: ${sadesati.is_sadesati ? "Yes" : "No"}` +
      (sadesati.status ? ` (${sadesati.status})` : "")
    );
  }

  // ── Key Yogas (top 2) ─────────────────────────────────────────
  const yogaAnalysis = kundli.horoscope?.yoga_analysis || kundli.yogas;
  if (Array.isArray(yogaAnalysis) && yogaAnalysis.length > 0) {
    const topYogas = yogaAnalysis
      .slice(0, 2)
      .map((y) => y.name)
      .filter(Boolean);
    if (topYogas.length > 0) parts.push(`- Key Yogas: ${topYogas.join(", ")}`);
  }

  // ── Manglik ───────────────────────────────────────────────────
  const isManglik = kundli.manglikAnalysis?.is_manglik;
  if (isManglik != null) {
    parts.push(`- Manglik: ${isManglik ? "Yes" : "No"}`);
  }

  if (parts.length === 0) return "";

  return `

KUNDLI CONTEXT (User's Birth Chart - Already Provided):
${parts.join("\n")}
IMPORTANT KUNDLI INSTRUCTIONS:
- The user's complete birth details and chart data are listed above.
- DO NOT ask for date of birth, time of birth, or place of birth — you already have them.
- Use this Kundli data directly as the foundation for all astrological readings.
- Reference their specific ascendant, signs, planetary positions, dasha, yogas, etc. in responses.
- Treat all readings as personalised to this specific birth chart.`;
};

// ============= GREETING HELPER =============

/**
 * Builds the Hinglish welcome message shown at the start of every new chat.
 * @param {string} userName   - User's display name (first name preferred)
 * @param {string} astrologerId - e.g. "ai-astrologer-devansh"
 * @param {boolean} hasKundli - Whether a kundli is already linked
 * @param {object|null} userRequest - UserRequest record (DOB / place context)
 * @returns {string}
 */
const buildGreetingMessage = (userName, astrologerId, hasKundli, userRequest) => {
  const profile = ASTROLOGER_PROFILES[astrologerId] || null;
  const astrologerName = profile ? profile.name : "Aapka AI Astrologer";

  // Derive a friendly first name for the user
  const firstName = userName
    ? userName.trim().split(/\s+/)[0]
    : "aap";

  if (hasKundli && userRequest) {
    const kundliName = userRequest.fullName
      ? userRequest.fullName.trim().split(/\s+/)[0]
      : firstName;
    return `Namaste ${firstName}!  Main ${astrologerName} hun, aapka AI astrologer. Maine ${kundliName} ki kundli dekh li hai. Koi bhi sawaal poochh sakte hain — career, love, health, ya life ke kisi bhi aspect ke baare mein. Main yahan hun aapke liye! `;
  }

  return `Namaste ${firstName}!  Main ${astrologerName} hun, aapka AI astrologer. Aaj main aapki kya madad kar sakta hun? Koi bhi sawaal poochh sakte hain — career, love, health, ya life ke kisi bhi aspect ke baare mein. Feel free karo! `;
};

/**
 * Converts markdown-heavy model output into plain chat text for UI rendering.
 */
const sanitizeAssistantResponse = (text) => {
  if (!text) return "";

  return text
    .replace(/\*\*(.*?)\*\*/g, "$1")
    .replace(/__(.*?)__/g, "$1")
    .replace(/`{1,3}([^`]+)`{1,3}/g, "$1")
    .replace(/^#{1,6}\s+/gm, "")
    .replace(/^\s*\*\s+/gm, "- ")
    .replace(/\n{3,}/g, "\n\n")
    .trim();
};

// ============= USER ROUTES =============

/**
 * Create a new AI chat session
 */
const createChatSession = async (req, res) => {
  try {
    const userId = req.user.id;
    const { astrologerId } = req.body; // Get astrologer ID from request

    // Create new session with astrologer ID
    const session = await AIChatSession.create({
      userId,
      astrologerId: astrologerId || null,
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

    // Load Kundli context if a Kundli is attached to this session
    let kundliContextStr = "";
    if (session.kundliUserRequestId) {
      try {
        const [kundliRecord, userRequestRecord] = await Promise.all([
          Kundli.findOne({ where: { requestId: session.kundliUserRequestId } }),
          UserRequest.findOne({ where: { id: session.kundliUserRequestId } }),
        ]);
        if (kundliRecord && userRequestRecord) {
          kundliContextStr = extractKundliContext(
            kundliRecord.toJSON(),
            userRequestRecord.toJSON()
          );
        }
      } catch (kundliErr) {
        console.error("Failed to load Kundli context for session:", kundliErr.message);
        // Non-fatal — continue without Kundli context
      }
    }

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
    // Check for place/city with stricter matching to avoid random capitalized words
    const CITY_PATTERN = "(Mumbai|Delhi|Bangalore|Bengaluru|Chennai|Kolkata|Hyderabad|Pune|Ahmedabad|Jaipur|Lucknow)";
    const placeMatch =
      conversationText.match(new RegExp(`\\b(?:born in|birth place(?: is)?|from)\\s+${CITY_PATTERN}\\b`, "i")) ||
      conversationText.match(new RegExp(`\\b${CITY_PATTERN}\\b`, "i"));
    
    if (dobMatch || timeMatch || placeMatch) {
      userContext = "\n\nUSER INFO FROM CONVERSATION:";
      if (dobMatch) userContext += `\n- Date of Birth: ${dobMatch[0]}`;
      if (timeMatch) userContext += `\n- Birth Time: ${timeMatch[0]}`;
      if (placeMatch) userContext += `\n- Birth Place: ${placeMatch[1]}`;
    }

    // Add current date and time context
    const now = new Date();
    const currentDateTime = `\n\nCURRENT DATE & TIME (IST):
  - Date: ${now.toLocaleDateString('en-IN', { weekday: 'long', year: 'numeric', month: 'long', day: 'numeric', timeZone: 'Asia/Kolkata' })}
  - Time: ${now.toLocaleTimeString('en-IN', { hour: '2-digit', minute: '2-digit', hour12: true, timeZone: 'Asia/Kolkata' })}
  - Day: ${now.toLocaleDateString('en-IN', { weekday: 'long', timeZone: 'Asia/Kolkata' })}
- Year: ${now.getFullYear()}

IMPORTANT: When user asks about "today", "now", "this year", "current", etc., use the above date and time for your response.`;

    // Get astrologer-specific system prompt
    const systemPrompt = getSystemPrompt(session.astrologerId);

    // Build messages array for OpenAI with optimized context
    const messages = [
      {
        role: "system",
        // Inject Kundli context (if available) between the system prompt and the
        // conversation-extracted user context, so the AI uses the real chart data.
        content: systemPrompt + kundliContextStr + userContext + currentDateTime,
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
      max_tokens: 100, // Short responses with enough room for clarity
      temperature: 0.8,
    });

    const aiRawResponse = completion.choices[0].message.content || "";
    const aiResponse = sanitizeAssistantResponse(aiRawResponse);
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
    const { page = 1, limit = 20, astrologerId } = req.query;
    const offset = (page - 1) * limit;

    // Build where clause - filter by astrologer if provided
    const whereClause = { userId, isActive: true };
    if (astrologerId) {
      whereClause.astrologerId = astrologerId;
    }

    const { rows: sessions, count } = await AIChatSession.findAndCountAll({
      where: whereClause,
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

/**
 * Attach a Kundli (user request) to an existing chat session.
 * This persists the link so that every message in this session
 * automatically uses the user's birth chart as context.
 */
const attachKundliToSession = async (req, res) => {
  try {
    const userId = req.user.id;
    const { sessionId } = req.params;
    const { kundliUserRequestId } = req.body;

    if (!kundliUserRequestId) {
      return res.status(400).json({
        success: false,
        message: "kundliUserRequestId is required",
      });
    }

    // Verify session belongs to this user
    const session = await AIChatSession.findOne({
      where: { id: sessionId, userId },
    });
    if (!session) {
      return res.status(404).json({
        success: false,
        message: "Chat session not found",
      });
    }

    // Verify the UserRequest belongs to this user
    const userRequest = await UserRequest.findOne({
      where: { id: kundliUserRequestId, userId },
    });
    if (!userRequest) {
      return res.status(404).json({
        success: false,
        message: "Kundli not found for this user",
      });
    }

    // Verify a Kundli has actually been generated for this request
    const kundli = await Kundli.findOne({
      where: { requestId: kundliUserRequestId },
    });
    if (!kundli) {
      return res.status(404).json({
        success: false,
        message: "Kundli has not been generated yet for this request",
      });
    }

    // Attach Kundli to session
    await session.update({ kundliUserRequestId });

    // Generate greeting message only if this session has no messages yet
    let greetingMessage = null;
    const existingMessageCount = await AIChatMessage.count({
      where: { sessionId },
    });

    if (existingMessageCount === 0) {
      // Get the user's display name
      const userRecord = await User.findOne({ where: { id: userId }, attributes: ["fullName"] });
      const userName = userRecord?.fullName || "";

      const greetingText = buildGreetingMessage(userName, session.astrologerId, true, userRequest.toJSON());

      greetingMessage = await AIChatMessage.create({
        sessionId,
        role: "assistant",
        content: greetingText,
      });

      await session.update({ lastMessageAt: new Date() });
    }

    return res.status(200).json({
      success: true,
      message: "Kundli attached to chat session successfully",
      session: {
        id: session.id,
        kundliUserRequestId,
      },
      greetingMessage: greetingMessage
        ? {
            id: greetingMessage.id,
            sessionId: greetingMessage.sessionId,
            role: greetingMessage.role,
            content: greetingMessage.content,
            createdAt: greetingMessage.createdAt,
            updatedAt: greetingMessage.updatedAt,
          }
        : null,
    });
  } catch (error) {
    console.error("Attach Kundli to session error:", error);
    res.status(500).json({
      success: false,
      message: "Failed to attach Kundli",
      error: error.message,
    });
  }
};

/**
 * Send a Hinglish greeting as the first AI message in a session.
 * Used when a session is fresh (no messages) regardless of kundli attachment.
 * If a kundli is already attached its context is included in the greeting.
 * Idempotent: returns the existing greeting if the session already has messages.
 */
const greetSession = async (req, res) => {
  try {
    const userId = req.user.id;
    const { sessionId } = req.params;

    // Verify session belongs to this user
    const session = await AIChatSession.findOne({
      where: { id: sessionId, userId },
    });
    if (!session) {
      return res.status(404).json({ success: false, message: "Chat session not found" });
    }

    // Check if any messages already exist
    const existingCount = await AIChatMessage.count({ where: { sessionId } });
    if (existingCount > 0) {
      // Return the first assistant message as the existing greeting
      const firstMsg = await AIChatMessage.findOne({
        where: { sessionId, role: "assistant" },
        order: [["createdAt", "ASC"]],
      });
      return res.status(200).json({
        success: true,
        alreadyGreeted: true,
        greetingMessage: firstMsg
          ? { id: firstMsg.id, sessionId: firstMsg.sessionId, role: firstMsg.role, content: firstMsg.content, createdAt: firstMsg.createdAt, updatedAt: firstMsg.updatedAt }
          : null,
      });
    }

    // Get user's name
    const userRecord = await User.findOne({ where: { id: userId }, attributes: ["fullName"] });
    const userName = userRecord?.fullName || "";

    // Try to load kundli context for the greeting
    let userRequest = null;
    if (session.kundliUserRequestId) {
      userRequest = await UserRequest.findOne({ where: { id: session.kundliUserRequestId } });
    }

    const greetingText = buildGreetingMessage(userName, session.astrologerId, !!(session.kundliUserRequestId && userRequest), userRequest ? userRequest.toJSON() : null);

    const greetingMessage = await AIChatMessage.create({
      sessionId,
      role: "assistant",
      content: greetingText,
    });

    await session.update({ lastMessageAt: new Date() });

    return res.status(201).json({
      success: true,
      alreadyGreeted: false,
      greetingMessage: {
        id: greetingMessage.id,
        sessionId: greetingMessage.sessionId,
        role: greetingMessage.role,
        content: greetingMessage.content,
        createdAt: greetingMessage.createdAt,
        updatedAt: greetingMessage.updatedAt,
      },
    });
  } catch (error) {
    console.error("Greet session error:", error);
    res.status(500).json({ success: false, message: "Failed to send greeting", error: error.message });
  }
};

module.exports = {
  createChatSession,
  sendMessage,
  getMyChatSessions,
  getChatMessages,
  deleteChatSession,
  clearChatSession,
  attachKundliToSession,
  greetSession,
};
