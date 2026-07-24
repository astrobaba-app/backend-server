/**
 * Rule-Based Intent Engine for Graho Workflow Chatbot
 */

const ZODIAC_SIGNS = [
  "aries", "taurus", "gemini", "cancer", 
  "leo", "virgo", "libra", "scorpio", 
  "sagittarius", "capricorn", "aquarius", "pisces"
];

// Map Hindi/transliterated zodiac sign names to standard English keys
const ZODIAC_ALIASES = {
  mesh: "aries", mesha: "aries",
  vrishabh: "taurus", vrishabha: "taurus", vrish: "taurus",
  mithun: "gemini", mithuna: "gemini",
  kark: "cancer", karka: "cancer", crab: "cancer",
  leo: "leo", simha: "leo", singh: "leo", leo: "leo",
  virgo: "virgo", kanya: "virgo", kanyā: "virgo",
  libra: "libra", tula: "libra", tulaa: "libra",
  scorpio: "scorpio", vrishchik: "scorpio", vrishchika: "scorpio",
  sagittarius: "sagittarius", dhanu: "sagittarius", dhanus: "sagittarius",
  capricorn: "capricorn", makar: "capricorn", makara: "capricorn",
  aquarius: "aquarius", kumbh: "aquarius", kumbha: "aquarius",
  pisces: "pisces", meen: "pisces", meena: "pisces"
};

const HOROSCOPE_TYPES = ["daily", "weekly"];

const TYPE_ALIASES = {
  daily: "daily",
  today: "daily",
  aaj: "daily",
  weekly: "weekly",
  week: "weekly",
  hafta: "weekly"
};

/**
 * Normalizes text for robust regex/keyword comparison
 */
const normalizeText = (text) => {
  return String(text || "")
    .toLowerCase()
    .replace(/[^a-z0-9\s\u0900-\u097F]/g, "") // Keep alphanumeric and Hindi characters
    .trim();
};

/**
 * Detects if a message indicates a request to cancel/reset
 */
const isCancelIntent = (normalizedMsg) => {
  const cancelPatterns = [
    /\bcancel\b/i,
    /\breset\b/i,
    /\bstop\b/i,
    /\bexit\b/i,
    /\bmenu\b/i,
    /\bchup\b/i,
    /\babort\b/i,
    /\bshuru\b/i, // start over
    /\bmat\b/i,
    /\bbas\b/i
  ];
  return cancelPatterns.some(pattern => pattern.test(normalizedMsg));
};

/**
 * Detects the core intent from idle state
 */
const detectInitialIntent = (normalizedMsg) => {
  if (isCancelIntent(normalizedMsg)) {
    return "intent_cancel";
  }

  // Avoid resetting if they selected a valid FAQ category name
  const faqCategories = [
    "kundli",
    "astrologer and wallet",
    "graho store",
    "horoscope  predictions",
    "horoscope predictions",
    "refund policy",
    "notifications  settings",
    "notifications settings",
    "discussion forum",
    "support"
  ];
  if (faqCategories.includes(normalizedMsg)) {
    return "intent_unknown";
  }

  // Horoscope Triggers
  const horoscopeKeywords = [
    "horoscope", "rashifal", "rashi", "prediction", "daily", "weekly", "monthly", "yearly",
    "aries", "taurus", "gemini", "cancer", "leo", "virgo", "libra", "scorpio", "sagittarius", 
    "capricorn", "aquarius", "pisces", "kundli matching", "match kundli", "kundli create",
    "मेष", "वृषभ", "मिथुन", "कर्क", "सिंह", "कन्या", "तुला", "वृश्चिक", "धनु", "मकर", "कुंभ", "मीन"
  ];

  if (
    normalizedMsg.includes("horoscope") ||
    normalizedMsg.includes("rashifal") ||
    normalizedMsg.includes("prediction") ||
    normalizedMsg.includes("rashi") ||
    normalizedMsg.includes("राशिफल") ||
    normalizedMsg.includes("report") ||
    normalizedMsg.includes("reports") ||
    normalizedMsg.includes("daily") ||
    normalizedMsg.includes("weekly")
  ) {
    return "intent_horoscope";
  }

  // Check if they directly typed a zodiac sign
  for (const sign of ZODIAC_SIGNS) {
    if (normalizedMsg.includes(sign)) {
      return "intent_horoscope";
    }
  }

  for (const alias of Object.keys(ZODIAC_ALIASES)) {
    if (normalizedMsg.includes(alias)) {
      return "intent_horoscope";
    }
  }

  // Check if they typed Kundli match triggers (to guide them in future V1.1)
  if (
    normalizedMsg.includes("match") ||
    normalizedMsg.includes("milan") ||
    normalizedMsg.includes("matching") ||
    normalizedMsg.includes("compatibility")
  ) {
    return "intent_matching_fallback";
  }

  // Check if they typed Kundli generation triggers
  if (
    normalizedMsg.includes("generate") ||
    normalizedMsg.includes("create") ||
    normalizedMsg.includes("make") ||
    normalizedMsg.includes("kundli") ||
    normalizedMsg.includes("कुंडली")
  ) {
    return "intent_generate_kundli";
  }

  // Check if they typed support / help / FAQ / ticket triggers
  if (
    normalizedMsg.includes("support") ||
    normalizedMsg.includes("help") ||
    normalizedMsg.includes("faq") ||
    normalizedMsg.includes("ticket") ||
    normalizedMsg.includes("complaint") ||
    normalizedMsg.includes("issue") ||
    normalizedMsg.includes("contact")
  ) {
    return "intent_support";
  }

  return "intent_unknown";
};

/**
 * Parses and validates zodiac sign from message
 */
const parseZodiacSign = (normalizedMsg) => {
  // Check direct matches first
  for (const sign of ZODIAC_SIGNS) {
    if (normalizedMsg.includes(sign)) {
      return sign;
    }
  }

  // Check aliases
  const words = normalizedMsg.split(/\s+/);
  for (const word of words) {
    if (ZODIAC_ALIASES[word]) {
      return ZODIAC_ALIASES[word];
    }
  }

  // Loose substring checks
  for (const [alias, sign] of Object.entries(ZODIAC_ALIASES)) {
    if (normalizedMsg.includes(alias)) {
      return sign;
    }
  }

  return null;
};

/**
 * Parses and validates horoscope type (daily, weekly, monthly, yearly)
 */
const parseHoroscopeType = (normalizedMsg) => {
  // Check direct matches
  for (const type of HOROSCOPE_TYPES) {
    if (normalizedMsg.includes(type)) {
      return type;
    }
  }

  // Check aliases
  const words = normalizedMsg.split(/\s+/);
  for (const word of words) {
    if (TYPE_ALIASES[word]) {
      return TYPE_ALIASES[word];
    }
  }

  for (const [alias, type] of Object.entries(TYPE_ALIASES)) {
    if (normalizedMsg.includes(alias)) {
      return type;
    }
  }

  return null;
};

module.exports = {
  normalizeText,
  isCancelIntent,
  detectInitialIntent,
  parseZodiacSign,
  parseHoroscopeType,
  ZODIAC_SIGNS,
  HOROSCOPE_TYPES
};
