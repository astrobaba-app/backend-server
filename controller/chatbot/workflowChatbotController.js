const redis = require("../../config/redis/redis");
const {
  normalizeText,
  isCancelIntent,
  detectInitialIntent,
  parseZodiacSign,
  parseHoroscopeType,
  ZODIAC_SIGNS,
  HOROSCOPE_TYPES
} = require("../../services/workflowChatbotIntentEngine");

const {
  getDailyHoroscope,
  getWeeklyHoroscope
} = require("../horoscope/dailyHoroscopeController");

const { validateToken } = require("../../services/authService");
const { parse } = require("cookie");
const Kundli = require("../../model/horoscope/kundli");
const { createKundli } = require("../horoscope/kundliController");
const { createMatching } = require("../horoscope/matchingController");
const { createTicket } = require("../support/supportController");
const { SUPPORT_FAQS } = require("../support/supportFaqData");

const SESSION_TTL = 3600; // 1 hour expiration in Redis
const CACHE_KEY_PREFIX = "chatbot:session:";

// Local in-memory session cache as a fallback for when Redis is rate-limited or fails
const localSessionCache = new Map();
const LOCAL_SESSION_TTL = 3600 * 1000; // 1 hour in ms

// Periodic cleanup of expired memory sessions (every 10 minutes)
setInterval(() => {
  const now = Date.now();
  for (const [sessionId, session] of localSessionCache.entries()) {
    if (session.expiry < now) {
      localSessionCache.delete(sessionId);
    }
  }
}, 10 * 60 * 1000).unref();

/**
 * Save session data helper with Redis & In-Memory fallback
 */
const saveSession = async (sessionId, sessionData) => {
  const redisKey = `${CACHE_KEY_PREFIX}${sessionId}`;

  // Set in local cache first
  localSessionCache.set(sessionId, {
    data: JSON.parse(JSON.stringify(sessionData)),
    expiry: Date.now() + LOCAL_SESSION_TTL
  });

  try {
    await redis.setex(redisKey, SESSION_TTL, JSON.stringify(sessionData));
    console.log(`[WorkflowChatbot] Saved session ${sessionId} to Redis`);
  } catch (err) {
    console.warn(`[WorkflowChatbot] Redis save failed, using local memory fallback:`, err.message);
  }
};

/**
 * Retrieve session data helper with Redis & In-Memory fallback
 */
const getSession = async (sessionId) => {
  const redisKey = `${CACHE_KEY_PREFIX}${sessionId}`;
  let sessionData = null;

  // 1. Try Redis first
  try {
    const cached = await redis.get(redisKey);
    if (cached) {
      sessionData = typeof cached === "string" ? JSON.parse(cached) : cached;
      console.log(`[WorkflowChatbot] Session ${sessionId} retrieved from Redis`);

      // Keep local cache synced
      localSessionCache.set(sessionId, {
        data: JSON.parse(JSON.stringify(sessionData)),
        expiry: Date.now() + LOCAL_SESSION_TTL
      });

      return sessionData;
    }
  } catch (err) {
    console.warn(`[WorkflowChatbot] Redis fetch failed: ${err.message}. Checking local memory cache...`);
  }

  // 2. Try in-memory cache fallback
  const localCached = localSessionCache.get(sessionId);
  if (localCached) {
    if (localCached.expiry > Date.now()) {
      console.log(`[WorkflowChatbot] Session ${sessionId} retrieved from local memory fallback`);
      return localCached.data;
    } else {
      console.log(`[WorkflowChatbot] Session ${sessionId} expired in local memory`);
      localSessionCache.delete(sessionId);
    }
  }

  return null;
};

/**
 * Delete session helper
 */
const deleteSession = async (sessionId) => {
  const redisKey = `${CACHE_KEY_PREFIX}${sessionId}`;

  // Delete from local cache
  localSessionCache.delete(sessionId);

  try {
    await redis.del(redisKey);
    console.log(`[WorkflowChatbot] Deleted session ${sessionId} from Redis`);
  } catch (err) {
    console.warn(`[WorkflowChatbot] Redis delete failed: ${err.message}`);
  }
};


// Options menus for quick replies
const MAIN_MENU = [
  "Daily Horoscope",
  "Weekly Horoscope",
  "Generate Kundli",
  "Match Kundli",
  "Chat with Astrologer",
  "Check Balance",
  "Support & FAQs"
];

const ZODIAC_MENU = ZODIAC_SIGNS.map(s => s.charAt(0).toUpperCase() + s.slice(1));
const TYPE_MENU = ["Daily", "Weekly"];

/**
 * Returns the matching daily/weekly/monthly/yearly controller function
 */
const getHandlerForType = (type) => {
  switch (type) {
    case "daily":
      return getDailyHoroscope;
    case "weekly":
      return getWeeklyHoroscope;
    default:
      return getDailyHoroscope;
  }
};

/**
 * Delegator helper to invoke local controllers using express-like mock req/res
 */
const delegateControllerCall = async (zodiacSign, type, handler) => {
  return new Promise((resolve, reject) => {
    const mockReq = {
      params: { zodiacSign },
      query: {}
    };

    const mockRes = {
      statusCode: 200,
      status(code) {
        this.statusCode = code;
        return this;
      },
      json(payload) {
        if (this.statusCode >= 400 || (payload && payload.success === false)) {
          reject(new Error(payload?.message || "Failed to retrieve horoscope data"));
        } else {
          resolve(payload);
        }
      }
    };

    handler(mockReq, mockRes).catch(reject);
  });
};

/**
 * Retrieve user payload from cookies/authorization headers if authenticated
 */
const getOptionalUser = (req) => {
  try {
    let token = null;
    if (req.headers.cookie) {
      const parsedCookies = parse(req.headers.cookie);
      token = parsedCookies.token;
    }
    if (!token && req.headers.authorization) {
      const authHeader = req.headers.authorization;
      if (authHeader.startsWith("Bearer ")) {
        token = authHeader.split(" ")[1];
      }
    }
    if (token) {
      return validateToken(token);
    }
  } catch (err) {
    console.error("[WorkflowChatbot] Optional auth validation failed:", err.message);
  }
  return null;
};

/**
 * Normalizes input date from either YYYY-MM-DD or DD/MM/YYYY formats to YYYY-MM-DD
 */
const parseAndFormatDOB = (input) => {
  if (!input) return null;
  const clean = input.trim();
  // 1. Check if YYYY-MM-DD
  if (/^\d{4}-\d{2}-\d{2}$/.test(clean)) {
    const parsed = Date.parse(clean);
    if (!isNaN(parsed)) return clean;
  }
  // 2. Check if DD/MM/YYYY or DD-MM-YYYY
  const parts = clean.split(/[-/]/);
  if (parts.length === 3) {
    let day = parseInt(parts[0], 10);
    let month = parseInt(parts[1], 10);
    let year = parseInt(parts[2], 10);
    // If year is first, e.g. YYYY/MM/DD
    if (parts[0].length === 4) {
      year = parseInt(parts[0], 10);
      day = parseInt(parts[2], 10);
    }
    if (!isNaN(day) && !isNaN(month) && !isNaN(year)) {
      if (day >= 1 && day <= 31 && month >= 1 && month <= 12 && year >= 1000 && year <= 9999) {
        const formattedDay = day.toString().padStart(2, "0");
        const formattedMonth = month.toString().padStart(2, "0");
        const formattedYear = year.toString();
        const formatted = `${formattedYear}-${formattedMonth}-${formattedDay}`;
        if (!isNaN(Date.parse(formatted))) {
          return formatted;
        }
      }
    }
  }
  return null;
};

/**
 * Delegator helper to invoke createKundli using express-like mock req/res
 */
const delegateKundliCreation = async (user, collectedData) => {
  return new Promise((resolve, reject) => {
    const mockReq = {
      user: { id: user.id, role: user.role || "user" },
      body: {
        fullName: collectedData.fullName,
        gender: collectedData.gender,
        dateOfbirth: collectedData.dateOfbirth,
        timeOfbirth: collectedData.dontKnowTime ? "00:00" : collectedData.timeOfbirth,
        placeOfBirth: collectedData.placeOfBirth,
        latitude: collectedData.latitude,
        longitude: collectedData.longitude,
      }
    };

    const mockRes = {
      statusCode: 201,
      status(code) {
        this.statusCode = code;
        return this;
      },
      json(payload) {
        if (this.statusCode >= 400 || (payload && payload.success === false)) {
          reject(new Error(payload?.message || "Failed to generate Kundli"));
        } else {
          resolve(payload);
        }
      }
    };

    createKundli(mockReq, mockRes).catch(reject);
  });
};

/**
 * Delegator helper to invoke createMatching using express-like mock req/res
 */
const delegateMatchingCreation = async (user, collectedData) => {
  return new Promise((resolve, reject) => {
    const mockReq = {
      user: { id: user.id, role: user.role || "user" },
      body: {
        boyName: collectedData.boyName,
        boyDateOfBirth: collectedData.boyDateOfBirth,
        boyTimeOfBirth: collectedData.boyTimeOfBirth,
        boyPlaceOfBirth: collectedData.boyPlaceOfBirth,
        boyLatitude: collectedData.boyLatitude,
        boyLongitude: collectedData.boyLongitude,
        girlName: collectedData.girlName,
        girlDateOfBirth: collectedData.girlDateOfBirth,
        girlTimeOfBirth: collectedData.girlTimeOfBirth,
        girlPlaceOfBirth: collectedData.girlPlaceOfBirth,
        girlLatitude: collectedData.girlLatitude,
        girlLongitude: collectedData.girlLongitude,
      }
    };

    const mockRes = {
      statusCode: 201,
      status(code) {
        this.statusCode = code;
        return this;
      },
      json(payload) {
        if (this.statusCode >= 400 || (payload && payload.success === false)) {
          reject(new Error(payload?.message || "Failed to match Kundlis"));
        } else {
          resolve(payload);
        }
      }
    };

    createMatching(mockReq, mockRes).catch(reject);
  });
};

/**
 * Delegator helper to invoke createTicket using express-like mock req/res
 */
const delegateTicketCreation = async (user, collectedData) => {
  return new Promise((resolve, reject) => {
    const mockReq = {
      user: { id: user.id, role: user.role || "user" },
      body: {
        subject: collectedData.ticketSubject,
        description: collectedData.ticketDescription,
        category: collectedData.ticketCategory,
        priority: "medium"
      },
      fileUrls: []
    };

    const mockRes = {
      statusCode: 201,
      status(code) {
        this.statusCode = code;
        return this;
      },
      json(payload) {
        if (this.statusCode >= 400 || (payload && payload.success === false)) {
          reject(new Error(payload?.message || "Failed to create support ticket"));
        } else {
          resolve(payload);
        }
      }
    };

    createTicket(mockReq, mockRes).catch(reject);
  });
};



/**
 * Beautifully format the raw report content and include the PDF download link
 */
const formatReportResponse = (profileName, type, payload, userRequestId, backendUrl, token) => {
  const r = payload.reportData;
  const capType = type.charAt(0).toUpperCase() + type.slice(1).toLowerCase();

  let summary = `✨ **Personalized ${capType} Report for ${profileName}** ✨\n\n`;
  if (r.reportContent?.overview) {
    summary += `🔮 **Overview**:\n${r.reportContent.overview}\n\n`;
  }
  if (r.reportContent?.careerFinance) {
    summary += `💼 **Career & Finance**:\n${r.reportContent.careerFinance}\n\n`;
  }
  if (r.reportContent?.relationships) {
    summary += `❤️ **Relationships**:\n${r.reportContent.relationships}\n\n`;
  }
  if (r.reportContent?.healthWellness) {
    summary += `💪 **Health & Wellness**:\n${r.reportContent.healthWellness}\n\n`;
  }

  // Add direct download link
  const tokenQuery = token ? `?token=${token}` : "";
  summary += `📥 **PDF Report Ready!**\n[Click here to download your full PDF Report](${backendUrl}/api/kundli-report/pdf/${userRequestId}/${type}${tokenQuery})`;

  return summary;
};

const extractPredictionText = (field) => {
  if (!field) return "";
  if (typeof field === "string") return field;
  if (typeof field === "object") {
    return field.summary || field.prediction || field.text || JSON.stringify(field);
  }
  return String(field);
};

/**
 * Beautifully format the raw horoscope payload
 */
const formatRemedyObject = (r) => {
  if (!r) return "";
  let parts = [];
  if (r.type) parts.push(`**${r.type}**`);
  if (r.planet) parts.push(`Planet: ${r.planet}`);
  if (r.nakshatra) parts.push(`Nakshatra: ${r.nakshatra}`);
  if (r.mantra) parts.push(`Mantra: "${r.mantra}"`);
  if (r.mantra_count) parts.push(`Count: ${r.mantra_count}`);
  if (r.action) parts.push(`Action: ${r.action}`);
  if (r.charity) parts.push(`Charity: ${r.charity}`);
  if (r.benefit) parts.push(`Benefit: ${r.benefit}`);
  
  if (r.remedy) parts.push(r.remedy);
  if (r.summary) parts.push(r.summary);

  if (parts.length === 0) {
    return JSON.stringify(r);
  }
  return parts.join(" | ");
};

/**
 * Beautifully format the raw horoscope payload
 */
const formatPredictionResponse = (zodiacSign, type, payload) => {
  const capSign = zodiacSign.charAt(0).toUpperCase() + zodiacSign.slice(1).toLowerCase();
  const capType = type.charAt(0).toUpperCase() + type.slice(1).toLowerCase();

  if (!payload || !payload.horoscope) {
    return `Could not load predictions for ${capSign} at this time. Please try again.`;
  }

  const h = payload.horoscope;
  const ai = h.ai_enhanced;

  let overview = "";
  let love = "";
  let careerFinance = "";
  let health = "";
  let remedies = "";

  let remediesList = "";
  if (Array.isArray(h.remedies)) {
    remediesList = h.remedies.map(r => {
      const fmt = typeof r === "object" ? formatRemedyObject(r) : String(r);
      return `- ${fmt}`;
    }).join("\n");
  } else if (typeof h.remedies === "string") {
    remediesList = h.remedies;
  } else if (h.remedies && typeof h.remedies === "object") {
    remediesList = `- ${formatRemedyObject(h.remedies)}`;
  }

  if (ai) {
    overview = extractPredictionText(ai.overview);
    love = extractPredictionText(ai.love_relationships);
    careerFinance = extractPredictionText(ai.career_finance);
    health = extractPredictionText(ai.health_wellness);
    remedies = extractPredictionText(ai.remedies) || remediesList;
  } else if (h.predictions) {
    const p = h.predictions;
    overview = extractPredictionText(p.overall || p.overview);
    love = extractPredictionText(p.love || p.love_relationships);
    const careerText = extractPredictionText(p.career || p.career_business);
    const financeText = extractPredictionText(p.finance || p.finance_wealth);
    careerFinance = `${careerText} ${financeText}`.trim();
    health = extractPredictionText(p.health || p.health_wellness);
    remedies = remediesList;
  }

  let result = `🔮 **${capType} Horoscope for ${capSign}** 🔮\n\n`;
  if (overview) result += `✨ **Overview**:\n${overview}\n\n`;
  if (love) result += `❤️ **Love & Relationships**:\n${love}\n\n`;
  if (careerFinance) result += `💼 **Career & Finance**:\n${careerFinance}\n\n`;
  if (health) result += `💪 **Health & Wellness**:\n${health}\n\n`;
  if (remedies) result += `🌸 **Remedies**:\n${remedies}\n\n`;

  if (h.lucky_elements) {
    const le = h.lucky_elements;
    let luckyStr = "";
    if (le.number != null) luckyStr += `Lucky Number: ${le.number} | `;
    if (le.color) luckyStr += `Lucky Color: ${le.color} | `;
    if (le.direction) luckyStr += `Lucky Direction: ${le.direction}`;

    luckyStr = luckyStr.replace(/\s*\|\s*$/, "");
    if (luckyStr) result += `🍀 **Lucky Elements**:\n${luckyStr}\n\n`;
  }

  return result.trim();
};

/**
 * Handle incoming conversational messages from the floating widget
 */
const CHATBOT_DECISION_TREE = {
  idle: {
    next: async (message, context) => {
      const normalizedMsg = context.normalizedMsg;
      const intent = detectInitialIntent(normalizedMsg);

      if (intent === "intent_horoscope") {
        const type = parseHoroscopeType(normalizedMsg);
        if (type) {
          context.sessionData.collectedData.type = type;
        }

        const zodiac = parseZodiacSign(normalizedMsg);
        if (zodiac) {
          context.sessionData.collectedData.zodiacSign = zodiac;
          if (type) {
            return "execute_horoscope";
          }
          return "awaiting_horoscope_type";
        }
        return "awaiting_zodiac";
      }

      if (intent === "intent_matching_fallback" || normalizedMsg === "match kundli") {
        if (context.req.user) {
          context.sessionData.collectedData.workflow = "match_kundli";
          return "awaiting_matching_boy_name";
        } else {
          context.sessionData.collectedData.workflow = "match_kundli";
          return "awaiting_matching_login";
        }
      }

      if (intent === "intent_generate_kundli" || normalizedMsg === "generate kundli") {
        if (context.req.user) {
          context.sessionData.collectedData.workflow = "generate_kundli";
          return "awaiting_kundli_name";
        } else {
          context.sessionData.collectedData.workflow = "generate_kundli";
          return "awaiting_kundli_login";
        }
      }

      if (intent === "intent_support" || normalizedMsg === "support  faqs" || normalizedMsg === "support faqs") {
        return "awaiting_support_faq";
      }

      if (normalizedMsg === "chat with astrologer" || normalizedMsg === "talk to astrologer") {
        return "awaiting_astrologer_category";
      }

      if (normalizedMsg === "check balance") {
        return context.req.user ? "execute_check_balance" : "awaiting_balance_login";
      }

      if (normalizedMsg === "recharge wallet" || normalizedMsg === "card recharge wallet") {
        context.customMessage = "You can recharge your wallet on our [Wallet Recharge Page](/profile/wallet).";
        return "idle";
      }

      return "idle";
    },
    prompt: () => "Hello! I am your Graho assistant. How can I help you today?",
    options: () => MAIN_MENU
  },

  awaiting_zodiac: {
    next: async (message, context) => {
      const zodiac = parseZodiacSign(context.normalizedMsg);
      if (zodiac) {
        context.sessionData.collectedData.zodiacSign = zodiac;
        const type = context.sessionData.collectedData.type;
        if (type) {
          return "execute_horoscope";
        }
        return "awaiting_horoscope_type";
      }
      return "awaiting_zodiac";
    },
    prompt: (context) => {
      const type = context.sessionData.collectedData.type;
      const typeLabel = type ? ` ${type}` : "";
      if (context.lastInputInvalid) {
        return "Sorry, I couldn't recognize that zodiac sign. Please select your sign from the options below or type it:";
      }
      return `Sure! Let's check your${typeLabel} horoscope. What is your Zodiac Sign?`;
    },
    options: () => ZODIAC_MENU
  },

  awaiting_horoscope_type: {
    next: async (message, context) => {
      const type = parseHoroscopeType(context.normalizedMsg);
      const zodiac = context.sessionData.collectedData.zodiacSign;
      if (type && zodiac) {
        context.sessionData.collectedData.type = type;
        return "execute_horoscope";
      }
      return "awaiting_horoscope_type";
    },
    prompt: (context) => {
      const zodiac = context.sessionData.collectedData.zodiacSign;
      if (context.lastInputInvalid) {
        return "Invalid choice. Please select or type one of the options below:";
      }
      return `Great, sign set to **${zodiac.toUpperCase()}**. Which type of prediction would you like to see?`;
    },
    options: () => TYPE_MENU
  },

  awaiting_kundli_login: {
    next: async (message, context) => {
      if (context.req.user) {
        return "awaiting_kundli_name";
      }
      return "awaiting_kundli_login";
    },
    prompt: () => {
      const frontendUrl = (process.env.FRONTEND_URL || "http://localhost:3000").trim();
      return `To generate your Janam Kundli, please [Login to your account](${frontendUrl}/auth/login?redirect=close). Once you log in, we will continue with your birth details.`;
    },
    options: () => ["Cancel"]
  },

  awaiting_kundli_name: {
    next: async (message, context) => {
      const name = message.trim();
      if (name.length >= 2) {
        context.sessionData.collectedData.fullName = name;
        return "awaiting_kundli_gender";
      }
      return "awaiting_kundli_name";
    },
    prompt: (context) => {
      if (context.lastInputInvalid) {
        return "Please enter a valid name (at least 2 characters):";
      }
      if (context.isInitialPrompt) {
        return "Let's generate your Janam Kundli! 🌟 First, what is your **Full Name**?";
      }
      return "What is your **Full Name**?";
    },
    options: () => []
  },

  awaiting_kundli_gender: {
    next: async (message, context) => {
      const gender = message.trim();
      const normalizedGender = gender.charAt(0).toUpperCase() + gender.slice(1).toLowerCase();
      if (["Male", "Female", "Other"].includes(normalizedGender)) {
        context.sessionData.collectedData.gender = normalizedGender;
        return "awaiting_kundli_dob";
      }
      return "awaiting_kundli_gender";
    },
    prompt: (context) => {
      if (context.lastInputInvalid) {
        return "Invalid gender selection. Please select one of the options below:";
      }
      const name = context.sessionData.collectedData.fullName;
      return `Got it, **${name}**. Please select your **Gender**:`;
    },
    options: () => ["Male", "Female", "Other"]
  },

  awaiting_kundli_dob: {
    next: async (message, context) => {
      const normalizedDob = parseAndFormatDOB(message);
      if (normalizedDob) {
        context.sessionData.collectedData.dateOfbirth = normalizedDob;
        return "awaiting_kundli_tob";
      }
      return "awaiting_kundli_dob";
    },
    prompt: (context) => {
      if (context.lastInputInvalid) {
        return "Please enter a valid Date of Birth in **DD/MM/YYYY** format (e.g. 15/08/1947):";
      }
      return "Understood! Please select or enter your **Date of Birth** (DD/MM/YYYY):";
    },
    options: () => []
  },

  awaiting_kundli_tob: {
    next: async (message, context) => {
      const tob = message.trim();
      if (normalizeText(tob) === "dont know time of birth" || normalizeText(tob) === "dont know time") {
        context.sessionData.collectedData.timeOfbirth = "00:00";
        context.sessionData.collectedData.dontKnowTime = true;
        return "awaiting_kundli_pob";
      }

      const tobRegex = /^\d{2}:\d{2}$/;
      if (tobRegex.test(tob)) {
        const [hours, minutes] = tob.split(":").map(Number);
        if (hours >= 0 && hours <= 23 && minutes >= 0 && minutes <= 59) {
          context.sessionData.collectedData.timeOfbirth = tob;
          context.sessionData.collectedData.dontKnowTime = false;
          return "awaiting_kundli_pob";
        }
      }
      return "awaiting_kundli_tob";
    },
    prompt: (context) => {
      if (context.lastInputInvalid) {
        const tob = context.message?.trim();
        const tobRegex = /^\d{2}:\d{2}$/;
        if (tob && !tobRegex.test(tob)) {
          return "Invalid time format. Please enter your birth time in 24-hour **HH:MM** format (e.g. 14:30), or click below if unknown:";
        }
        return "Invalid time values. Hours must be 00-23 and minutes 00-59. Please enter **HH:MM** format:";
      }
      return "What is your **Time of Birth**? Please enter it in 24-hour **HH:MM** format, or click the button below if you don't know it:";
    },
    options: () => ["Don't know time of birth"]
  },

  awaiting_kundli_pob: {
    next: async (message, context) => {
      const { latitude, longitude } = context.req.body;
      const placeOfBirth = message.trim();

      if (latitude != null && longitude != null && !isNaN(Number(latitude)) && !isNaN(Number(longitude))) {
        context.sessionData.collectedData.placeOfBirth = placeOfBirth;
        context.sessionData.collectedData.latitude = Number(latitude);
        context.sessionData.collectedData.longitude = Number(longitude);
        return "execute_kundli";
      }
      return "awaiting_kundli_pob";
    },
    prompt: (context) => {
      if (context.lastInputInvalid) {
        return "Please select a valid place from the autocomplete search suggestions list to continue:";
      }
      return "Last step! Search and select your **Birth Place** (City/Town):";
    },
    options: () => []
  },

  awaiting_matching_login: {
    next: async (message, context) => {
      if (context.req.user) {
        return "awaiting_matching_boy_name";
      }
      return "awaiting_matching_login";
    },
    prompt: () => {
      const frontendUrl = (process.env.FRONTEND_URL || "http://localhost:3000").trim();
      return `To use our Kundli Matching service, please [Login to your account](${frontendUrl}/auth/login?redirect=close). Once you log in, we will proceed with matching details.`;
    },
    options: () => ["Cancel"]
  },

  awaiting_matching_boy_name: {
    next: async (message, context) => {
      const name = message.trim();
      if (name.length >= 2) {
        context.sessionData.collectedData.boyName = name;
        return "awaiting_matching_boy_dob";
      }
      return "awaiting_matching_boy_name";
    },
    prompt: (context) => {
      if (context.lastInputInvalid) {
        return "Please enter a valid name for the boy (at least 2 characters):";
      }
      return "Let's match Kundlis! 💑 First, what is the **Boy's Full Name**?";
    },
    options: () => []
  },

  awaiting_matching_boy_dob: {
    next: async (message, context) => {
      const normalizedDob = parseAndFormatDOB(message);
      if (normalizedDob) {
        context.sessionData.collectedData.boyDateOfBirth = normalizedDob;
        return "awaiting_matching_boy_tob";
      }
      return "awaiting_matching_boy_dob";
    },
    prompt: (context) => {
      const name = context.sessionData.collectedData.boyName;
      if (context.lastInputInvalid) {
        return `Please enter a valid Date of Birth for **${name}** in **DD/MM/YYYY** format (e.g. 15/08/1947):`;
      }
      return `What is **${name}**'s **Date of Birth** (DD/MM/YYYY)?`;
    },
    options: () => []
  },

  awaiting_matching_boy_tob: {
    next: async (message, context) => {
      const tob = message.trim();
      const tobRegex = /^\d{2}:\d{2}$/;
      if (tobRegex.test(tob)) {
        const [hours, minutes] = tob.split(":").map(Number);
        if (hours >= 0 && hours <= 23 && minutes >= 0 && minutes <= 59) {
          context.sessionData.collectedData.boyTimeOfBirth = tob;
          return "awaiting_matching_boy_pob";
        }
      }
      return "awaiting_matching_boy_tob";
    },
    prompt: (context) => {
      const name = context.sessionData.collectedData.boyName;
      if (context.lastInputInvalid) {
        return "Invalid time format. Please enter in 24-hour **HH:MM** format (e.g. 14:30):";
      }
      return `What is **${name}**'s **Time of Birth** (HH:MM)?`;
    },
    options: () => []
  },

  awaiting_matching_boy_pob: {
    next: async (message, context) => {
      const { latitude, longitude } = context.req.body;
      const placeOfBirth = message.trim();

      if (latitude != null && longitude != null && !isNaN(Number(latitude)) && !isNaN(Number(longitude))) {
        context.sessionData.collectedData.boyPlaceOfBirth = placeOfBirth;
        context.sessionData.collectedData.boyLatitude = Number(latitude);
        context.sessionData.collectedData.boyLongitude = Number(longitude);
        return "awaiting_matching_girl_name";
      }
      return "awaiting_matching_boy_pob";
    },
    prompt: (context) => {
      const name = context.sessionData.collectedData.boyName;
      if (context.lastInputInvalid) {
        return `Please select a valid place for **${name}** from the autocomplete search suggestions:`;
      }
      return `Search and select **${name}**'s **Birth Place** (City/Town):`;
    },
    options: () => []
  },

  awaiting_matching_girl_name: {
    next: async (message, context) => {
      const name = message.trim();
      if (name.length >= 2) {
        context.sessionData.collectedData.girlName = name;
        return "awaiting_matching_girl_dob";
      }
      return "awaiting_matching_girl_name";
    },
    prompt: (context) => {
      if (context.lastInputInvalid) {
        return "Please enter a valid name for the girl (at least 2 characters):";
      }
      return "Excellent. Now, what is the **Girl's Full Name**?";
    },
    options: () => []
  },

  awaiting_matching_girl_dob: {
    next: async (message, context) => {
      const normalizedDob = parseAndFormatDOB(message);
      if (normalizedDob) {
        context.sessionData.collectedData.girlDateOfBirth = normalizedDob;
        return "awaiting_matching_girl_tob";
      }
      return "awaiting_matching_girl_dob";
    },
    prompt: (context) => {
      const name = context.sessionData.collectedData.girlName;
      if (context.lastInputInvalid) {
        return `Please enter a valid Date of Birth for **${name}** in **DD/MM/YYYY** format (e.g. 15/08/1947):`;
      }
      return `What is **${name}**'s **Date of Birth** (DD/MM/YYYY)?`;
    },
    options: () => []
  },

  awaiting_matching_girl_tob: {
    next: async (message, context) => {
      const tob = message.trim();
      const tobRegex = /^\d{2}:\d{2}$/;
      if (tobRegex.test(tob)) {
        const [hours, minutes] = tob.split(":").map(Number);
        if (hours >= 0 && hours <= 23 && minutes >= 0 && minutes <= 59) {
          context.sessionData.collectedData.girlTimeOfBirth = tob;
          return "awaiting_matching_girl_pob";
        }
      }
      return "awaiting_matching_girl_tob";
    },
    prompt: (context) => {
      const name = context.sessionData.collectedData.girlName;
      if (context.lastInputInvalid) {
        return "Invalid time format. Please enter in 24-hour **HH:MM** format (e.g. 14:30):";
      }
      return `What is **${name}**'s **Time of Birth** (HH:MM)?`;
    },
    options: () => []
  },

  awaiting_matching_girl_pob: {
    next: async (message, context) => {
      const { latitude, longitude } = context.req.body;
      const placeOfBirth = message.trim();

      if (latitude != null && longitude != null && !isNaN(Number(latitude)) && !isNaN(Number(longitude))) {
        context.sessionData.collectedData.girlPlaceOfBirth = placeOfBirth;
        context.sessionData.collectedData.girlLatitude = Number(latitude);
        context.sessionData.collectedData.girlLongitude = Number(longitude);
        return "execute_matching";
      }
      return "awaiting_matching_girl_pob";
    },
    prompt: (context) => {
      const name = context.sessionData.collectedData.girlName;
      if (context.lastInputInvalid) {
        return `Please select a valid place for **${name}** from the autocomplete search suggestions:`;
      }
      return `Search and select **${name}**'s **Birth Place** (City/Town):`;
    },
    options: () => []
  },

  execute_horoscope: {
    execute: async (context) => {
      const zodiac = context.sessionData.collectedData.zodiacSign;
      const type = context.sessionData.collectedData.type;
      const handler = getHandlerForType(type);
      try {
        const data = await delegateControllerCall(zodiac, type, handler);
        const responseText = formatPredictionResponse(zodiac, type, data);

        context.sessionData = { state: "idle", collectedData: {} };

        return {
          statusCode: 200,
          payload: {
            success: true,
            message: `${responseText}\n\nWhat would you like to check next?`,
            state: "idle",
            options: MAIN_MENU
          }
        };
      } catch (apiError) {
        console.error("[WorkflowChatbot] Horoscope API delegation failed:", apiError);
        context.sessionData = { state: "idle", collectedData: {} };

        return {
          statusCode: 200,
          payload: {
            success: false,
            message: `I encountered an issue fetching predictions for ${zodiac.toUpperCase()} (${type}). Please try again later. What else can I help you with?`,
            state: "idle",
            options: MAIN_MENU
          }
        };
      }
    }
  },

  execute_kundli: {
    execute: async (context) => {
      if (!context.req.user) {
        context.sessionData.state = "awaiting_kundli_login";
        return {
          statusCode: 200,
          payload: {
            success: false,
            message: "I notice you are no longer logged in. To generate your birth chart, please log in to your account. Your chart details are saved and will be generated immediately once you log in.",
            state: "awaiting_kundli_login",
            options: ["Go to Main Menu"]
          }
        };
      }
      try {
        console.log(`[WorkflowChatbot] Finalizing Kundli generation. User: ${context.req.user?.id}, Data:`, context.sessionData.collectedData);

        const payload = await delegateKundliCreation(context.req.user, context.sessionData.collectedData);
        
        context.sessionData = { state: "idle", collectedData: {} };

        const requestId = payload.userRequest?.id || payload.kundli?.requestId;

        return {
          statusCode: 200,
          payload: {
            success: true,
            message: `🎉 **Your Janam Kundli has been generated successfully!**\n\n[Click here to view your Kundli Report](/kundliReport?id=${requestId})\n\nWhat would you like to explore next?`,
            state: "idle",
            options: MAIN_MENU
          }
        };
      } catch (err) {
        console.error("[WorkflowChatbot] Kundli generation delegation failed:", err);
        context.sessionData = { state: "idle", collectedData: {} };

        return {
          statusCode: 200,
          payload: {
            success: false,
            message: `I encountered an issue generating your Kundli: ${err.message || "Failed to generate Kundli"}. Please try again later. What else would you like to check?`,
            state: "idle",
            options: MAIN_MENU
          }
        };
      }
    }
  },

  execute_matching: {
    execute: async (context) => {
      if (!context.req.user) {
        context.sessionData.state = "awaiting_matching_login";
        return {
          statusCode: 200,
          payload: {
            success: false,
            message: "I notice you are no longer logged in. To perform Kundli matching, please log in to your account. Your compatibility data is saved and will be matched immediately once you log in.",
            state: "awaiting_matching_login",
            options: ["Go to Main Menu"]
          }
        };
      }
      try {
        console.log(`[WorkflowChatbot] Finalizing Kundli Matching. User: ${context.req.user?.id}, Data:`, context.sessionData.collectedData);

        const payload = await delegateMatchingCreation(context.req.user, context.sessionData.collectedData);
        
        context.sessionData = { state: "idle", collectedData: {} };

        const matchingId = payload.matching?.id;
        const totalPoints = payload.matching?.ashtakootDetails?.total_points || 0;
        const scorePct = payload.matching?.compatibilityScore || 0;
        const conclusion = payload.matching?.conclusion || "";

        return {
          statusCode: 200,
          payload: {
            success: true,
            message: `💑 **Kundli Matching Completed Successfully!**\n\n- **Compatibility Score**: ${totalPoints}/36 Gunas (${scorePct}%)\n- **Conclusion**: ${conclusion}\n\n[Click here to view your full Kundli Matching Report](/kundli-matching/report/basic-details?matchingId=${matchingId})\n\nWhat would you like to explore next?`,
            state: "idle",
            options: MAIN_MENU
          }
        };
      } catch (err) {
        console.error("[WorkflowChatbot] Kundli matching delegation failed:", err);
        context.sessionData = { state: "idle", collectedData: {} };

        return {
          statusCode: 200,
          payload: {
            success: false,
            message: `I encountered an issue matching your Kundlis: ${err.message || "Failed to generate matching"}. Please try again later. What else would you like to check?`,
            state: "idle",
            options: MAIN_MENU
          }
        };
      }
    }
  },

  execute_matching_fallback: {
    execute: async (context) => {
      context.sessionData = { state: "idle", collectedData: {} };
      return {
        statusCode: 200,
        payload: {
          success: true,
          message: "Kundli Matching is coming very soon to our chat widget! In the meantime, you can do match-making directly on our [Kundli Matching Page](https://graho.in/kundli-matching).",
          state: "idle",
          options: MAIN_MENU
        }
      };
    }
  },

  awaiting_support_faq: {
    next: async (message, context) => {
      const msg = context.normalizedMsg;
      if (msg === "go to main menu" || msg === "cancel") {
        return "idle";
      }
      if (msg === "raise a ticket" || msg === "raise ticket" || msg === "🎟️ raise a ticket" || msg === "🎟️ raise ticket") {
        return context.req.user ? "awaiting_ticket_subject" : "awaiting_support_login";
      }

      // Check if they selected a valid category
      const matchedCategory = SUPPORT_FAQS.find(
        g => normalizeText(g.category) === msg || msg.includes(normalizeText(g.category))
      );

      if (matchedCategory) {
        context.sessionData.collectedData.selectedFAQCategory = matchedCategory.category;
        return "awaiting_support_question";
      }

      return "awaiting_support_faq";
    },
    prompt: (context) => {
      if (context.lastInputInvalid) {
        return "Sorry, I didn't recognize that option. Please select one of the FAQ categories below or choose to raise a support ticket:";
      }
      return "Welcome to **Graho Support**! 🛠️ Please select a category below to browse frequently asked questions, or choose to raise a ticket directly if you need further help:";
    },
    options: () => {
      const cats = SUPPORT_FAQS.map(g => g.category);
      return [...cats, "🎟️ Raise a Ticket", "Go to Main Menu"];
    }
  },

  awaiting_support_question: {
    next: async (message, context) => {
      const msg = context.normalizedMsg;
      if (msg === "go to main menu") {
        return "idle";
      }
      if (msg === "back to faq categories" || msg === "back" || msg === "back to faq") {
        return "awaiting_support_faq";
      }
      if (msg === "raise a ticket" || msg === "raise ticket" || msg === "🎟️ raise a ticket" || msg === "🎟️ raise ticket") {
        return context.req.user ? "awaiting_ticket_subject" : "awaiting_support_login";
      }

      const catName = context.sessionData.collectedData.selectedFAQCategory;
      const group = SUPPORT_FAQS.find(g => g.category === catName);
      if (group) {
        const matchedQuestion = group.items.find(
          item => normalizeText(item.question) === msg
        );
        if (matchedQuestion) {
          context.sessionData.collectedData.selectedFAQQuestion = matchedQuestion.question;
          return "execute_support_answer";
        }
      }

      return "awaiting_support_question";
    },
    prompt: (context) => {
      const catName = context.sessionData.collectedData.selectedFAQCategory;
      if (context.lastInputInvalid) {
        return `Sorry, please select one of the questions below or choose another action:`;
      }
      return `Here are some common questions about **${catName}**. Please select a question to view the answer:`;
    },
    options: (context) => {
      const catName = context.sessionData.collectedData.selectedFAQCategory;
      const group = SUPPORT_FAQS.find(g => g.category === catName);
      const questions = group ? group.items.map(item => item.question) : [];
      return [...questions, "Back to FAQ Categories", "🎟️ Raise a Ticket", "Go to Main Menu"];
    }
  },

  execute_support_answer: {
    execute: async (context) => {
      const catName = context.sessionData.collectedData.selectedFAQCategory;
      const questionText = context.sessionData.collectedData.selectedFAQQuestion;
      const group = SUPPORT_FAQS.find(g => g.category === catName);
      const matchedItem = group ? group.items.find(item => item.question === questionText) : null;

      if (!matchedItem) {
        context.sessionData.state = "awaiting_support_faq";
        return {
          statusCode: 200,
          payload: {
            success: false,
            message: "Something went wrong. Let's go back to FAQ categories.",
            state: "awaiting_support_faq",
            options: SUPPORT_FAQS.map(g => g.category).concat(["🎟️ Raise a Ticket", "Go to Main Menu"])
          }
        };
      }

      let answerText = matchedItem.answer;
      if (matchedItem.link) {
        answerText = answerText.replace("{link}", `[${matchedItem.link.text}](${matchedItem.link.url})`);
      }

      context.sessionData.state = "awaiting_support_resolution";
      return {
        statusCode: 200,
        payload: {
          success: true,
          message: `❓ **Question**: ${matchedItem.question}\n\n💡 **Answer**: ${answerText}\n\nDid this resolve your query?`,
          state: "awaiting_support_resolution",
          options: ["Yes, resolved!", "No, raise a ticket", "Back to FAQs", "Go to Main Menu"]
        }
      };
    }
  },

  awaiting_astrologer_category: {
    next: async (message, context) => {
      const msg = context.normalizedMsg;
      if (msg === "go to main menu" || msg === "cancel") {
        return "idle";
      }

      // Valid categories list including All
      const validCategories = [
        "All",
        "Love",
        "Relationship",
        "Education",
        "Health",
        "Career",
        "Finance",
        "Marriage",
        "Family",
        "Business",
        "Legal",
        "Travel",
        "Spiritual"
      ];
      const matched = validCategories.find(c => normalizeText(c) === msg);
      if (matched) {
        context.sessionData.collectedData.selectedAstrologerCategory = matched;
        return "execute_list_astrologers";
      }

      return "awaiting_astrologer_category";
    },
    prompt: (context) => {
      if (context.lastInputInvalid) {
        return "Please select one of the categories below to find astrologers:";
      }
      return "Sure! Select a category below to view top astrologers:";
    },
    options: () => [
      "All", "Love", "Relationship", "Education", "Health", "Career",
      "Finance", "Marriage", "Family", "Business", "Legal", "Travel", "Spiritual",
      "Go to Main Menu"
    ]
  },

  execute_list_astrologers: {
    execute: async (context) => {
      try {
        const Astrologer = require("../../model/astrologer/astrologer");
        const { Op } = require("sequelize");
        const category = context.sessionData.collectedData.selectedAstrologerCategory;

        const whereClause = {
          isApproved: true,
          isActive: true
        };

        if (category !== "All") {
          whereClause.categories = {
            [Op.overlap]: [category]
          };
        }

        // Fetch astrologers from the database
        const dbAstrologers = await Astrologer.findAll({
          where: whereClause,
          attributes: ["id", "fullName", "rating", "pricePerMinute", "isOnline"],
          limit: 3
        });

        // Define the hardcoded AI Astrologers
        const HARDCODED_AI_ASTROLOGERS = [
          {
            id: "ai-astrologer-devansh",
            fullName: "Acharya Devansh Sharma",
            rating: 4.9,
            pricePerMinute: 10,
            isOnline: true,
            categories: ["Career", "Education", "Family", "Legal"],
            isAI: true
          },
          {
            id: "ai-astrologer-ritika",
            fullName: "Ritika Mehra",
            rating: 4.8,
            pricePerMinute: 10,
            isOnline: true,
            categories: ["Love", "Relationship", "Marriage", "Family"],
            isAI: true
          },
          {
            id: "ai-astrologer-arjun",
            fullName: "Pandit Arjun Iyer",
            rating: 4.9,
            pricePerMinute: 10,
            isOnline: true,
            categories: ["Finance", "Health", "Business"],
            isAI: true
          }
        ];

        // Filter AI astrologers by category
        const matchedAI = HARDCODED_AI_ASTROLOGERS.filter(astro => 
          category === "All" || astro.categories.includes(category)
        );

        // Combine and map database + AI astrologers
        const combined = [
          ...dbAstrologers.map(a => ({
            id: a.id,
            fullName: a.fullName,
            rating: a.rating ? parseFloat(a.rating) : 4.5,
            pricePerMinute: a.pricePerMinute ? parseFloat(a.pricePerMinute) : 15,
            isOnline: a.isOnline,
            isAI: false
          })),
          ...matchedAI
        ];

        // Sort combined list: online first, then by rating
        combined.sort((a, b) => {
          if (a.isOnline !== b.isOnline) {
            return a.isOnline ? -1 : 1;
          }
          return b.rating - a.rating;
        });

        const categoryOptions = [
          "All", "Love", "Relationship", "Education", "Health", "Career",
          "Finance", "Marriage", "Family", "Business", "Legal", "Travel", "Spiritual",
          "Go to Main Menu"
        ];

        // Take top 3
        const topAstrologers = combined.slice(0, 3);

        if (topAstrologers.length === 0) {
          context.sessionData = { state: "idle", collectedData: {} };
          return {
            statusCode: 200,
            payload: {
              success: true,
              message: `I couldn't find any active astrologers in the **${category}** category at the moment. Please check back later!`,
              state: "idle",
              options: MAIN_MENU
            }
          };
        }

        let replyMsg = category === "All"
          ? `🔮 **Top Astrologers**:\n\n`
          : `🔮 **Top Astrologers for ${category}**:\n\n`;

        topAstrologers.forEach(astro => {
          const statusEmoji = astro.isOnline ? "🟢 Online" : "🔴 Offline";
          const chatLink = astro.isAI 
            ? `/aichat?id=${astro.id}`
            : `/chat?astrologerId=${astro.id}`;
          replyMsg += `👤 **${astro.fullName}**\n- ⭐ Rating: ${astro.rating.toFixed(1)}/5\n- 💰 Price: ₹${astro.pricePerMinute.toFixed(0)}/min\n- Status: ${statusEmoji}\n- [Chat with ${astro.fullName}](${chatLink})\n\n`;
        });

        replyMsg += `Would you like to check another category or go back?`;

        context.sessionData.state = "awaiting_astrologer_category";

        return {
          statusCode: 200,
          payload: {
            success: true,
            message: replyMsg,
            state: "awaiting_astrologer_category",
            options: categoryOptions
          }
        };
      } catch (err) {
        console.error("[WorkflowChatbot] List astrologers failed:", err);
        context.sessionData = { state: "idle", collectedData: {} };
        return {
          statusCode: 200,
          payload: {
            success: false,
            message: "I encountered an error fetching the astrologers. Let's go back to the Main Menu.",
            state: "idle",
            options: MAIN_MENU
          }
        };
      }
    }
  },

  awaiting_balance_login: {
    next: async (message, context) => {
      const msg = context.normalizedMsg;
      if (context.req.user) {
        return "execute_check_balance";
      }
      if (msg === "go to main menu" || msg === "cancel") {
        return "idle";
      }
      return "awaiting_balance_login";
    },
    prompt: () => "To check your wallet balance, please log in to your account: [Click here to Login](/auth/login?redirect=close)",
    options: () => ["Go to Main Menu"]
  },

  execute_check_balance: {
    execute: async (context) => {
      if (!context.req.user) {
        context.sessionData.state = "awaiting_balance_login";
        return {
          statusCode: 200,
          payload: {
            success: false,
            message: "I notice you are no longer logged in. To check your balance, please log in to your account.",
            state: "awaiting_balance_login",
            options: ["Go to Main Menu"]
          }
        };
      }

      try {
        const Wallet = require("../../model/wallet/wallet");
        const { getWalletBalanceBreakdown } = require("../../services/walletService");
        
        let wallet = await Wallet.findOne({ where: { userId: context.req.user.id } });
        if (!wallet) {
          wallet = await Wallet.create({ userId: context.req.user.id });
        }
        const { balance, signupBonusBalance, rechargeBalance } = getWalletBalanceBreakdown(wallet);

        context.sessionData = { state: "idle", collectedData: {} };

        return {
          statusCode: 200,
          payload: {
            success: true,
            message: `💰 **Your Wallet Balance**: ₹${balance.toFixed(2)}\n\n- **Recharge Balance**: ₹${rechargeBalance.toFixed(2)}\n- **Bonus Balance**: ₹${signupBonusBalance.toFixed(2)}\n\nWould you like to recharge or explore other options?`,
            state: "idle",
            options: ["💳 Recharge Wallet"].concat(MAIN_MENU)
          }
        };
      } catch (err) {
        console.error("[WorkflowChatbot] Check balance failed:", err);
        context.sessionData = { state: "idle", collectedData: {} };
        return {
          statusCode: 200,
          payload: {
            success: false,
            message: `I encountered an issue fetching your balance. Please try again later.`,
            state: "idle",
            options: MAIN_MENU
          }
        };
      }
    }
  },

  awaiting_support_resolution: {
    next: async (message, context) => {
      const msg = context.normalizedMsg;
      if (msg === "yes resolved" || msg === "yes resolved!" || msg.includes("yes") || msg.includes("resolved")) {
        context.customMessage = "Awesome! Glad I could help. What would you like to explore next?";
        return "idle";
      }
      if (msg === "no raise a ticket" || msg === "no raise ticket" || msg.includes("raise a ticket") || msg.includes("raise ticket")) {
        return context.req.user ? "awaiting_ticket_subject" : "awaiting_support_login";
      }
      if (msg === "back to faqs" || msg === "back") {
        return "awaiting_support_faq";
      }
      if (msg === "go to main menu") {
        return "idle";
      }
      return "awaiting_support_resolution";
    },
    prompt: () => "Did that answer resolve your query? Please select an option below:",
    options: () => ["Yes, resolved!", "No, raise a ticket", "Back to FAQs", "Go to Main Menu"]
  },

  awaiting_support_login: {
    next: async (message, context) => {
      const msg = context.normalizedMsg;
      if (context.req.user) {
        return "awaiting_ticket_subject";
      }
      if (msg === "back to faq categories" || msg === "back") {
        return "awaiting_support_faq";
      }
      if (msg === "go to main menu" || msg === "cancel") {
        return "idle";
      }
      return "awaiting_support_login";
    },
    prompt: () => {
      const frontendUrl = (process.env.FRONTEND_URL || "http://localhost:3000").trim();
      return `To raise a support ticket, please [Login to your account](${frontendUrl}/auth/login?redirect=close). Once logged in, we will proceed with raising your ticket.`;
    },
    options: () => ["Back to FAQ Categories", "Go to Main Menu"]
  },

  awaiting_ticket_subject: {
    next: async (message, context) => {
      const msg = message.trim();
      if (context.normalizedMsg === "cancel") {
        return "idle";
      }
      if (msg.length >= 4) {
        context.sessionData.collectedData.ticketSubject = msg;
        return "awaiting_ticket_description";
      }
      return "awaiting_ticket_subject";
    },
    prompt: (context) => {
      if (context.lastInputInvalid) {
        return "Please enter a valid ticket subject (at least 4 characters):";
      }
      return "Let's raise a support ticket. 🎟️ What is the **Subject** or title of your query? (e.g. 'Payment deducted but wallet not recharged')";
    },
    options: () => ["Cancel"]
  },

  awaiting_ticket_description: {
    next: async (message, context) => {
      const msg = message.trim();
      if (context.normalizedMsg === "cancel") {
        return "idle";
      }
      if (msg.length >= 10) {
        context.sessionData.collectedData.ticketDescription = msg;
        return "awaiting_ticket_category";
      }
      return "awaiting_ticket_description";
    },
    prompt: (context) => {
      if (context.lastInputInvalid) {
        return "Please describe your issue in more detail (at least 10 characters):";
      }
      return "Got it. Please describe your issue in detail (you can attach screenshots/images once the ticket is created):";
    },
    options: () => ["Cancel"]
  },

  awaiting_ticket_category: {
    next: async (message, context) => {
      const msg = context.normalizedMsg;
      if (msg === "cancel") {
        return "idle";
      }
      const validCategories = ["payments", "astrologers", "kundli / reports", "graho store", "general / other"];
      if (validCategories.includes(msg)) {
        let dbCategory = "general";
        if (msg.includes("payment")) dbCategory = "billing";
        else if (msg.includes("astrologer")) dbCategory = "consultation";
        else if (msg.includes("kundli")) dbCategory = "technical";
        else if (msg.includes("store")) dbCategory = "billing";
        else if (msg.includes("general")) dbCategory = "general";

        context.sessionData.collectedData.ticketCategory = dbCategory;
        return "execute_ticket_creation";
      }
      return "awaiting_ticket_category";
    },
    prompt: (context) => {
      if (context.lastInputInvalid) {
        return "Invalid category selection. Please select one of the categories below:";
      }
      return "Almost done! Select the **Category** that best fits your issue:";
    },
    options: () => ["Payments", "Astrologers", "Kundli / Reports", "Graho Store", "General / Other", "Cancel"]
  },

  execute_ticket_creation: {
    execute: async (context) => {
      if (!context.req.user) {
        context.sessionData.state = "awaiting_support_login";
        return {
          statusCode: 200,
          payload: {
            success: false,
            message: "I notice you are no longer logged in. To raise this support ticket, please log in to your account. Your ticket details are saved and will be raised immediately once you log in.",
            state: "awaiting_support_login",
            options: ["Back to FAQ Categories", "Go to Main Menu"]
          }
        };
      }
      try {
        console.log(`[WorkflowChatbot] Creating support ticket. User: ${context.req.user.id}, Data:`, context.sessionData.collectedData);

        const payload = await delegateTicketCreation(context.req.user, context.sessionData.collectedData);
        
        context.sessionData = { state: "idle", collectedData: {} };

        const ticketNum = payload.ticket?.ticketNumber || "TKT-GEN-XXXX";

        return {
          statusCode: 200,
          payload: {
            success: true,
            message: `🎉 **Support Ticket Created Successfully!**\n\n- **Ticket Number**: ${ticketNum}\n- **Subject**: ${payload.ticket?.subject}\n- **Status**: Open\n\nOur support team will review it and reply within 2 hours. You can view, add replies, or attach screenshots/images to this ticket anytime on your [Support Tickets Page](/support).\n\nWhat would you like to explore next?`,
            state: "idle",
            options: MAIN_MENU
          }
        };
      } catch (err) {
        console.error("[WorkflowChatbot] Support ticket creation delegation failed:", err);
        context.sessionData = { state: "idle", collectedData: {} };

        return {
          statusCode: 200,
          payload: {
            success: false,
            message: `I encountered an issue raising your ticket: ${err.message || "Failed to create ticket"}. Please try again later. What else would you like to check?`,
            state: "idle",
            options: MAIN_MENU
          }
        };
      }
    }
  }
};

/**
 * Handle incoming conversational messages from the floating widget
 */
const handleMessage = async (req, res) => {
  try {
    const { message, sessionId } = req.body;
    console.log(`\n[WorkflowChatbot] Incoming message: "${message}" | SessionId: ${sessionId}`);

    if (!sessionId) {
      console.warn("[WorkflowChatbot] Request rejected: missing sessionId");
      return res.status(400).json({
        success: false,
        message: "sessionId is required"
      });
    }

    req.user = getOptionalUser(req);
    let sessionData = await getSession(sessionId);

    if (!sessionData) {
      sessionData = {
        state: "idle",
        collectedData: {},
        isAuthenticated: !!req.user
      };
      console.log("[WorkflowChatbot] Initialized new session state: idle");
    }

    // Detect login state transition (from anonymous to authenticated)
    const wasAuthenticated = sessionData.isAuthenticated || false;
    const isNowAuthenticated = !!req.user;
    
    if (isNowAuthenticated && !wasAuthenticated) {
      console.log("[WorkflowChatbot] User login transition detected.");
      sessionData.isAuthenticated = true;
      
      if (sessionData.state === "awaiting_kundli_login") {
        sessionData.state = "awaiting_kundli_name";
        await saveSession(sessionId, sessionData);

        return res.status(200).json({
          success: true,
          message: "Welcome back! I see you have logged in. 🌟 Let's proceed with generating your Kundli. What is your **Full Name**?",
          state: "awaiting_kundli_name"
        });
      } else if (sessionData.state === "awaiting_matching_login") {
        sessionData.state = "awaiting_matching_boy_name";
        await saveSession(sessionId, sessionData);

        return res.status(200).json({
          success: true,
          message: "Welcome back! I see you have logged in. 🌟 Let's proceed with Kundli Matching. What is the **Boy's Full Name**?",
          state: "awaiting_matching_boy_name"
        });
      } else if (sessionData.state === "awaiting_support_login") {
        if (sessionData.collectedData.ticketSubject && sessionData.collectedData.ticketDescription && sessionData.collectedData.ticketCategory) {
          sessionData.state = "execute_ticket_creation";
          const context = {
            req,
            res,
            message,
            normalizedMsg: normalizeText(message),
            sessionData,
            lastInputInvalid: false,
            isInitialPrompt: true,
            justLoggedIn: true
          };
          const executeNode = CHATBOT_DECISION_TREE.execute_ticket_creation;
          const result = await executeNode.execute(context);
          await saveSession(sessionId, context.sessionData);
          return res.status(result.statusCode || 200).json(result.payload);
        } else {
          sessionData.state = "awaiting_ticket_subject";
          await saveSession(sessionId, sessionData);

          return res.status(200).json({
            success: true,
            message: "Welcome back! I see you have logged in. 🎟️ Let's raise a support ticket. What is the **Subject** or title of your query? (e.g. 'Payment deducted but wallet not recharged')",
            state: "awaiting_ticket_subject",
            options: ["Cancel"]
          });
        }
      } else if (sessionData.state === "awaiting_balance_login") {
        sessionData.state = "execute_check_balance";
        const context = {
          req,
          res,
          message,
          normalizedMsg: normalizeText(message),
          sessionData,
          lastInputInvalid: false,
          isInitialPrompt: true,
          justLoggedIn: true
        };
        const executeNode = CHATBOT_DECISION_TREE.execute_check_balance;
        const result = await executeNode.execute(context);
        await saveSession(sessionId, context.sessionData);
        return res.status(result.statusCode || 200).json(result.payload);
      }
    }
    
    // Always keep authentication state up to date
    sessionData.isAuthenticated = isNowAuthenticated;

    const normalizedMsg = normalizeText(message);

    // 1. Check for global cancel or reset command
    if (isCancelIntent(normalizedMsg)) {
      sessionData = { state: "idle", collectedData: {} };
      await saveSession(sessionId, sessionData);

      return res.status(200).json({
        success: true,
        message: "No problem! I have reset our conversation. What would you like to explore next?",
        state: "idle",
        options: MAIN_MENU
      });
    }

    // Check if the user is triggering a new core intent or menu option to restart/switch the workflow
    const initialIntent = detectInitialIntent(normalizedMsg);
    const isMainMenuOption = MAIN_MENU.map(m => normalizeText(m)).includes(normalizedMsg);
    
    let shouldReset = false;
    if (sessionData.state !== "idle") {
      if (isMainMenuOption) {
        shouldReset = true;
      } else if (initialIntent !== "intent_unknown" && initialIntent !== "intent_cancel") {
        const isCurrentKundli = sessionData.state.startsWith("awaiting_kundli");
        const isCurrentReport = sessionData.state.startsWith("awaiting_report");
        const isCurrentMatching = sessionData.state.startsWith("awaiting_matching");
        const isCurrentHoroscope = sessionData.state.startsWith("awaiting_zodiac") || sessionData.state.startsWith("awaiting_horoscope_type");
        const isCurrentSupport = sessionData.state.startsWith("awaiting_support") || 
                                 sessionData.state.startsWith("awaiting_ticket") ||
                                 sessionData.state.startsWith("awaiting_astrologer") ||
                                 sessionData.state.startsWith("awaiting_balance");
        
        if (isCurrentSupport) {
          shouldReset = false;
        } else if (initialIntent === "intent_generate_kundli" && !isCurrentKundli) {
          shouldReset = true;
        } else if (initialIntent === "intent_matching_fallback" && !isCurrentMatching) {
          shouldReset = true;
        } else if (initialIntent === "intent_horoscope" && !isCurrentHoroscope && !isCurrentReport) {
          const isTextInputState = ["awaiting_kundli_name", "awaiting_kundli_pob", "awaiting_matching_boy_name", "awaiting_matching_boy_pob", "awaiting_matching_girl_name", "awaiting_matching_girl_pob"].includes(sessionData.state);
          if (!isTextInputState) {
            shouldReset = true;
          }
        }
      }
    }

    if (shouldReset) {
      console.log(`[WorkflowChatbot] Session state was ${sessionData.state}, but user sent a restart trigger: "${message}". Resetting state to idle.`);
      sessionData = { state: "idle", collectedData: {} };
      await saveSession(sessionId, sessionData);
    }

    // 1. Fetch current state node
    let currentStateName = sessionData.state;
    let stateNode = CHATBOT_DECISION_TREE[currentStateName];
    if (!stateNode) {
      sessionData = { state: "idle", collectedData: {} };
      await saveSession(sessionId, sessionData);
      return res.status(200).json({
        success: true,
        message: "Something went wrong with the session. Let's start over. How can I help you?",
        state: "idle",
        options: MAIN_MENU
      });
    }

    // 2. Setup context
    const context = {
      req,
      res,
      message,
      normalizedMsg,
      sessionData,
      lastInputInvalid: false,
      isInitialPrompt: false,
      justLoggedIn: false
    };

    // 3. Run the state transition
    const nextStateName = await stateNode.next(message, context);

    if (nextStateName === currentStateName) {
      const nonValidationErrorStates = ["idle", "awaiting_report_login", "awaiting_kundli_login", "awaiting_matching_login"];
      if (!nonValidationErrorStates.includes(currentStateName)) {
        context.lastInputInvalid = true;
      }
    } else {
      currentStateName = nextStateName;
      sessionData.state = nextStateName;
      context.isInitialPrompt = true;
    }

    // 4. Check if the settled state is an execution state
    const nextStateNode = CHATBOT_DECISION_TREE[currentStateName];
    if (nextStateNode && nextStateNode.execute) {
      const result = await nextStateNode.execute(context);
      await saveSession(sessionId, context.sessionData);
      return res.status(result.statusCode || 200).json(result.payload);
    }

    // 5. Save session and return prompt/options
    await saveSession(sessionId, sessionData);

    let promptMessage = context.customMessage;
    if (!promptMessage) {
      promptMessage = typeof nextStateNode.prompt === "function"
        ? await nextStateNode.prompt(context)
        : nextStateNode.prompt;
    }

    const optionsList = typeof nextStateNode.options === "function"
      ? await nextStateNode.options(context)
      : nextStateNode.options;

    return res.status(200).json({
      success: true,
      message: promptMessage,
      state: currentStateName,
      options: optionsList
    });
  } catch (error) {
    console.error("[WorkflowChatbot] Error in handleMessage:", error);
    return res.status(500).json({
      success: false,
      message: "Internal server error"
    });
  }
};

/**
 * Manually reset active session
 */
const resetSession = async (req, res) => {
  try {
    const { sessionId } = req.body;
    if (sessionId) {
      await deleteSession(sessionId);
    }
    res.status(200).json({
      success: true,
      message: "Chatbot session reset successful"
    });
  } catch (error) {
    console.error("Reset chatbot session error:", error);
    res.status(500).json({
      success: false,
      message: "Failed to reset session"
    });
  }
};

module.exports = {
  handleMessage,
  resetSession
};
