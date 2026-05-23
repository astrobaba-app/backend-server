require("dotenv").config();
const OpenAI = require("openai");
const AIChatSession = require("../../model/aiChat/aiChatSession");
const AIChatMessage = require("../../model/aiChat/aiChatMessage");
const User = require("../../model/user/userAuth");
const UserRequest = require("../../model/user/userRequest");
const Kundli = require("../../model/horoscope/kundli");
const { Op } = require("sequelize");
const { buildInsightPayload } = require("../../services/astroInsightEngineService");

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
const getSystemPrompt = (astrologerId, { concise = false } = {}) => {
  const profile = ASTROLOGER_PROFILES[astrologerId];
  const astrologerName = profile ? profile.name : "Astro AI";
  const expertise = profile ? profile.expertise : "all aspects of life";
  const style = profile ? profile.style : "accurate, compassionate, and insightful astrological guidance";
  const astrologerGender = profile?.gender || "unspecified";

  if (concise) {
    return `You are ${astrologerName}, an expert Vedic astrologer focused on ${expertise}. Your style is ${style}. Your gender identity is ${astrologerGender}.

Rules:
- Reply in the same language/style as user.
- Stay strictly within astrology guidance.
- Never fabricate user details.
- Use available kundli/session context directly.
- Prefer 2-3 short lines; use 4 only if absolutely needed.
- Keep total response under 65 words whenever possible.
- In these lines, cover the direct answer and one practical astrology guidance.
- Avoid fear-based or absolute claims.
- If exact timing needs more details, ask briefly.
- Output plain text only.`;
  }
  
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
- Default length: 2–3 lines.
- Maximum length: 4 short lines.
- Keep answer compact (generally under 65 words) unless user explicitly asks for detailed explanation.
- Do not sound repetitive or template-like.
- Avoid excessive bullet points unless the user explicitly asks for structured output.
- Output must be plain text only (no markdown formatting).
- Do not use symbols like **, __, #, or code blocks in replies.
- Always finish with complete, clear sentences (never leave the reply cut off mid-thought).
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

// ============= INSIGHT RAG CONTEXT HELPERS =============

const RAG_BUCKET_KEYWORDS = {
  career: [
    "career", "job", "work", "promotion", "office", "business", "profession", "interview",
    "naukri", "kaam", "promotion", "vyapar",
  ],
  relationships: [
    "relationship", "marriage", "partner", "spouse", "family", "husband", "wife", "compatibility",
    "rishta", "shaadi", "vivah", "partner",
  ],
  love: ["love", "romance", "dating", "crush", "boyfriend", "girlfriend", "pyaar", "prem"],
  finance: [
    "money", "finance", "income", "salary", "wealth", "loan", "investment", "savings", "debt",
    "paisa", "arthik", "dhan", "kamai",
  ],
  health: [
    "health", "illness", "stress", "anxiety", "sleep", "energy", "wellness", "disease",
    "sehat", "swasth", "tanav", "neend",
  ],
  spirituality: ["spiritual", "meditation", "mantra", "sadhana", "dharma", "moksha", "adhyatm", "puja"],
  travel: ["travel", "trip", "foreign", "abroad", "journey", "relocation", "yatra"],
  education: ["study", "education", "exam", "college", "learning", "course", "padhai", "pariksha"],
  remedy: ["remedy", "upay", "gemstone", "rudraksha", "mantra", "totka", "pooja", "seva"],
  daily: ["today", "daily", "now", "current", "aaj", "abhi"],
};

const detectRelevantBuckets = (userMessage = "") => {
  const text = String(userMessage || "").toLowerCase();
  const hits = [];

  Object.entries(RAG_BUCKET_KEYWORDS).forEach(([bucket, keywords]) => {
    if (keywords.some((keyword) => text.includes(keyword))) {
      hits.push(bucket);
    }
  });

  if (hits.length === 0) {
    hits.push("daily");
  }

  return Array.from(new Set(hits));
};

const buildCompactFacts = (kundli, userRequest) => {
  return {
    user: {
      name: userRequest?.fullName || null,
      gender: userRequest?.gender || null,
      dob: userRequest?.dateOfbirth || null,
      tob: userRequest?.timeOfbirth || null,
      pob: userRequest?.placeOfBirth || null,
    },
    core: {
      ascendant: kundli?.basicDetails?.ascendant?.sign || kundli?.personality?.ascendant_sign || null,
      moon_sign: kundli?.basicDetails?.moon_sign || null,
      sun_sign: kundli?.basicDetails?.sun_sign || null,
      moon_nakshatra: kundli?.panchang?.nakshatra?.name || kundli?.planetary?.Moon?.nakshatra || null,
      manglik: kundli?.manglikAnalysis?.is_manglik ?? null,
    },
  };
};

const buildInsightRagContext = ({ kundli, userRequest, userMessage }) => {
  const insightPayload = buildInsightPayload({
    userRequest,
    kundli,
    transit: kundli?.horoscope?.transit || { datetime: new Date().toISOString(), transits: {} },
    date: new Date(),
  });

  const requestedBuckets = detectRelevantBuckets(userMessage);
  const bucketRows = Array.isArray(insightPayload?.topBuckets) ? insightPayload.topBuckets : [];

  const selectedBuckets = bucketRows.filter((row) => requestedBuckets.includes(String(row.bucket || "").toLowerCase()));
  const finalBuckets = selectedBuckets.length > 0 ? selectedBuckets : bucketRows.slice(0, 2);

  const compact = {
    requested_buckets: requestedBuckets,
    main_theme: insightPayload?.mainTheme || null,
    confidence_score: insightPayload?.confidenceScore || null,
    selected_bucket_analysis: finalBuckets.map((bucket) => ({
      bucket: bucket.bucket,
      label: bucket.label,
      status: bucket.status,
      confidence_label: bucket.confidence_label,
      supporting_factors: (bucket.supporting_factors || []).slice(0, 3),
      caution_factors: (bucket.caution_factors || []).slice(0, 2),
      recommended_actions: (bucket.recommended_actions || []).slice(0, 3),
      remedies: (bucket.remedies || []).slice(0, 2),
    })),
    dasha_context: {
      mahadasha: insightPayload?.dashaContext?.mahadasha || null,
      antardasha: insightPayload?.dashaContext?.antardasha || null,
      pratyantardasha: insightPayload?.dashaContext?.pratyantardasha || null,
      sookshmadasha: insightPayload?.dashaContext?.sookshmadasha || null,
    },
    compact_facts: buildCompactFacts(kundli, userRequest),
  };

  return `\n\nINSIGHT RAG CONTEXT (Use this only):\n${JSON.stringify(compact, null, 2)}\n\nIMPORTANT CONTEXT RULES:\n- Use only the selected bucket analysis relevant to user's latest question.\n- Do not ask for DOB/TOB/POB if compact_facts already has them.\n- Keep answers focused on requested buckets and practical guidance.\n- Avoid dumping full chart details unless user explicitly asks for deep technical reading.`;
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
  const astrologerGender = profile?.gender === "female" ? "female" : "male";
  const possessivePronoun = astrologerGender === "female" ? "aapki" : "aapka";
  const helpingVerb = astrologerGender === "female" ? "kar sakti hun" : "kar sakta hun";
  const astrologerName = profile
    ? profile.name
    : astrologerGender === "female"
    ? "Aapki Astrologer"
    : "Aapka Astrologer";

  // Derive a friendly first name for the user
  const firstName = userName
    ? userName.trim().split(/\s+/)[0]
    : "aap";

  if (hasKundli && userRequest) {
    const kundliName = userRequest.fullName
      ? userRequest.fullName.trim().split(/\s+/)[0]
      : firstName;
    return `Namaste ${firstName}!  Main ${astrologerName} hun, ${possessivePronoun} astrologer. Maine ${kundliName} ki kundli dekh li hai. Koi bhi sawaal poochh sakte hain — career, love, health, ya life ke kisi bhi aspect ke baare mein. Main yahan hun aapke liye! `;
  }

  return `Namaste ${firstName}!  Main ${astrologerName} hun, ${possessivePronoun} astrologer. Aaj main aapki kya madad ${helpingVerb}? Koi bhi sawaal poochh sakte hain — career, love, health, ya life ke kisi bhi aspect ke baare mein. Feel free karo! `;
};

const USER_STOP_INTENT_PATTERNS = [
  /(?:\bmat\b|\bmt\b)\s*bolo/iu,
  /मत\s*बोलो/u,
  /kuch\s*(?:nah[ií]|nahi|ni|nhi)\s*(?:jana|jaana|janna|sunna)\s*(?:mujhe|muje)?/iu,
  /kuch\s*mat\s*bolo/iu,
  /(?:nahi|nhi)\s*sunna/iu,
  /(?:bas|बस)\s*karo/iu,
  /\bstop\b/iu,
  /\bleave\s*me\b/iu,
  /\bnot\s*now\b/iu,
  /don'?t\s*(?:tell|say|ask)/iu,
  /\bno\s*more\b/iu,
];

const isUserStopIntentMessage = (content) => {
  const message = String(content || "").trim();
  if (!message) return false;
  return USER_STOP_INTENT_PATTERNS.some((pattern) => pattern.test(message));
};

const inferPauseReplyProfile = (userMessage) => {
  const raw = String(userMessage || "").trim();
  const text = raw.toLowerCase();

  const directStopPattern =
    /\b(stop|bas|enough|chup|chodo|mat\s+bolo|no\s+more|don't\s+ask)\b/iu;
  const sensitivePattern =
    /\b(sad|hurt|broken|upset|anxious|cry|akela|thak\s*gaya|thak\s*gayi|pareshan|dukhi|low)\b/iu;
  const lightPattern =
    /\b(ok|okay|cool|thanks|thank\s*you|haha|lol|all\s*good|fine|busy|later|baad\s*mein|kal)\b/iu;

  if (sensitivePattern.test(text)) {
    return {
      tone: "sensitive",
      targetLineCount: 3,
      toneHint: "gentle, reassuring, emotionally supportive",
    };
  }

  if (directStopPattern.test(text)) {
    return {
      tone: "direct",
      targetLineCount: 1,
      toneHint: "respectful, very brief, no extra detail",
    };
  }

  if (lightPattern.test(text)) {
    return {
      tone: "light",
      targetLineCount: Math.random() < 0.5 ? 1 : 2,
      toneHint: "friendly, calm, light and positive",
    };
  }

  return {
    tone: "neutral",
    targetLineCount: 2,
    toneHint: "calm, warm, supportive",
  };
};

const normalizePauseReplyByLineCount = (text, targetLineCount) => {
  const clampedLineCount = Math.max(1, Math.min(Number(targetLineCount) || 2, 3));
  const source = String(text || "").trim();
  if (!source) return "";

  let lines = source
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter(Boolean);

  if (lines.length <= 1) {
    const sentenceLines = splitTextIntoSentences(source);
    if (sentenceLines.length > 0) {
      lines = sentenceLines;
    }
  }

  while (lines.length < clampedLineCount) {
    let longestIndex = -1;
    let longestLength = -1;

    lines.forEach((line, index) => {
      if (line.length > longestLength) {
        longestLength = line.length;
        longestIndex = index;
      }
    });

    if (longestIndex === -1) break;

    const split = splitLineForDisplay(lines[longestIndex]);
    if (split.length < 2) break;

    lines.splice(longestIndex, 1, ...split);
  }

  if (lines.length > clampedLineCount) {
    lines = [
      ...lines.slice(0, clampedLineCount - 1),
      lines.slice(clampedLineCount - 1).join(" ").trim(),
    ].filter(Boolean);
  }

  return ensureCompleteSentenceEnding(lines.join("\n"));
};

const buildPauseAcknowledgementFallback = ({
  astrologerGender,
  userName,
  avoidMessage,
  targetLineCount,
}) => {
  const pauseVerb = astrologerGender === "female" ? "rukti" : "rukta";
  const firstName = String(userName || "")
    .trim()
    .split(/\s+/)
    .filter(Boolean)[0] || "";
  const withNamePrefix = firstName && Math.random() < 0.35 ? `${firstName}, ` : "";

  const candidates = [
    `${withNamePrefix}theek hai, abhi yahin ${pauseVerb} hun.`,
    `${withNamePrefix}samajh gaya, hum yahin pause karte hain.\nJab chahein, fir se shuru kar lenge.`,
    `${withNamePrefix}bilkul, abhi rukte hain.\nAap aaram se rahiye, main yahin hun.\nJab mann ho tab message kar dena.`,
    `${withNamePrefix}ok, abhi ke liye main chup rehta hun.`,
    `${withNamePrefix}theek hai, no pressure.\nJab ready ho, main calmly yahin milunga.`,
  ];

  const filtered = candidates.filter(
    (candidate) =>
      candidate.trim().toLowerCase() !== String(avoidMessage || "").trim().toLowerCase()
  );

  const pool = filtered.length > 0 ? filtered : candidates;
  const picked = pool[Math.floor(Math.random() * pool.length)];
  return normalizePauseReplyByLineCount(picked, targetLineCount);
};

const generateDynamicPauseAcknowledgement = async ({
  astrologerId,
  userMessage,
  userName = "",
  avoidMessage = "",
}) => {
  const profile = ASTROLOGER_PROFILES[astrologerId] || null;
  const astrologerName = profile?.name || "Astrologer";
  const astrologerGender = profile?.gender === "female" ? "female" : "male";
  const firstName = String(userName || "")
    .trim()
    .split(/\s+/)
    .filter(Boolean)[0] || "";

  const { tone, targetLineCount, toneHint } = inferPauseReplyProfile(userMessage);
  const avoidMessageText = String(avoidMessage || "").trim();

  try {
    const completion = await openai.chat.completions.create({
      model: process.env.OPENAI_CHAT_MODEL_FAST || CHAT_MODEL,
      messages: [
        {
          role: "system",
          content:
            `You are ${astrologerName}, a warm astrologer. The user asked you to stop/pause. ` +
            `Write exactly ${targetLineCount} short line(s) in the same language/script as the user.\n` +
            `Tone should be: ${toneHint}.\n` +
            `Do not ask any question.\n` +
            `Do not give predictions/remedies now.\n` +
            `Do not mention AI.\n` +
            `Keep it natural and fresh, not template-like.\n` +
            (firstName
              ? `User name is ${firstName}. You may use it naturally sometimes, but do not force it every time.\n`
              : "Do not force name usage.\n") +
            (avoidMessageText
              ? `Avoid repeating this previous line verbatim: ${avoidMessageText}`
              : "Use new wording each time."),
        },
        {
          role: "user",
          content: `User stop message: ${String(userMessage || "").trim()}\nTone label: ${tone}`,
        },
      ],
      max_tokens: 120,
      temperature: 0.95,
    });

    const generated = sanitizeAssistantResponse(
      completion.choices?.[0]?.message?.content || ""
    );
    const normalized = normalizePauseReplyByLineCount(generated, targetLineCount);

    if (
      normalized &&
      normalized.trim().toLowerCase() !== avoidMessageText.toLowerCase()
    ) {
      return {
        content: normalized,
        tokensUsed: completion.usage?.total_tokens || 0,
      };
    }
  } catch (error) {
    console.error("Dynamic pause acknowledgement generation failed:", error?.message || error);
  }

  return {
    content: buildPauseAcknowledgementFallback({
      astrologerGender,
      userName,
      avoidMessage,
      targetLineCount,
    }),
    tokensUsed: 0,
  };
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

const splitTextIntoSentences = (text) =>
  String(text || "")
    .split(/(?<=[.!?\u0964])\s+/)
    .map((part) => part.trim())
    .filter(Boolean);

const splitLineForDisplay = (line) => {
  const normalized = String(line || "").replace(/\s+/g, " ").trim();
  if (!normalized) return [""];

  const sentenceBoundary = normalized.match(/^(.{24,}?[.!?\u0964])\s+(.{8,})$/);
  if (sentenceBoundary) {
    return [sentenceBoundary[1].trim(), sentenceBoundary[2].trim()];
  }

  const commaBoundary = normalized.match(/^(.{24,}?,)\s+(.{8,})$/);
  if (commaBoundary) {
    return [commaBoundary[1].trim(), commaBoundary[2].trim()];
  }

  const words = normalized.split(/\s+/).filter(Boolean);
  if (words.length < 8) return [normalized];

  const midpoint = Math.ceil(words.length / 2);
  return [
    words.slice(0, midpoint).join(" ").trim(),
    words.slice(midpoint).join(" ").trim(),
  ].filter(Boolean);
};

const enforceTwoToThreeLinesMaxFour = (text) => {
  const source = String(text || "").trim();
  if (!source) return "";

  let lines = source
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter(Boolean);

  if (lines.length <= 1) {
    const sentenceLines = splitTextIntoSentences(source);
    if (sentenceLines.length > 0) {
      lines = sentenceLines;
    }
  }

  while (lines.length < 2) {
    let longestIndex = -1;
    let longestLength = -1;

    lines.forEach((line, index) => {
      if (line.length > longestLength) {
        longestLength = line.length;
        longestIndex = index;
      }
    });

    if (longestIndex === -1) break;

    const split = splitLineForDisplay(lines[longestIndex]);
    if (split.length < 2) break;

    lines.splice(longestIndex, 1, ...split);
  }

  if (lines.length > 4) {
    lines = [lines[0], lines[1], lines[2], lines.slice(3).join(" ").trim()].filter(Boolean);
  }

  return lines.join("\n");
};

const hasCompleteSentenceEnding = (text) =>
  /[.!?\u0964](?:["')\]]|\s)*$/.test(String(text || "").trim());

const ensureCompleteSentenceEnding = (text) => {
  const normalized = String(text || "").trim();
  if (!normalized) return "";
  if (hasCompleteSentenceEnding(normalized)) return normalized;
  return `${normalized}.`;
};

const buildCompletionRepairMessages = (
  userMessage,
  draftResponse,
  { concise = false } = {}
) => [
  {
    role: "system",
    content: concise
      ? "Rewrite the draft into a complete, clear, plain-text reply in the same language as the user. Prefer 2-3 short lines (max 4), include direct answer plus one practical astrology guidance, avoid markdown, keep it concise, and ensure no sentence is cut mid-thought."
      : "Rewrite the draft into a complete, clear, plain-text reply in the same language as the user. Keep it concise in 2-3 lines (max 4), avoid markdown, and ensure no sentence is cut mid-thought.",
  },
  {
    role: "user",
    content: `User message: ${userMessage}\n\nDraft reply (may be cut): ${draftResponse}`,
  },
];

const normalizeFollowUpQuestionLine = (question) => {
  const plain = sanitizeAssistantResponse(String(question || ""))
    .replace(/\s+/g, " ")
    .trim()
    .replace(/^[-*•\d\.)\s]+/, "")
    .replace(/^["'`]+|["'`]+$/g, "");

  if (!plain) return "";

  let normalized = plain.replace(/[.!]+$/, "").trim();
  if (!normalized) return "";

  if (!/[?]$/.test(normalized)) {
    normalized = `${normalized}?`;
  }

  if (normalized.length > 70) {
    const truncated = normalized.slice(0, 69).trimEnd().replace(/[.!?]+$/, "");
    normalized = `${truncated}?`;
  }

  return normalized;
};

const extractFollowUpQuestionsFromText = (text) => {
  const source = String(text || "").trim();
  if (!source) return [];

  const lines = source
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter(Boolean);

  const expandedLines =
    lines.length > 1
      ? lines
      : source
          .split("?")
          .map((chunk) => chunk.trim())
          .filter(Boolean)
          .map((chunk) => `${chunk}?`);

  const unique = [];
  const seen = new Set();

  expandedLines.forEach((line) => {
    const normalized = normalizeFollowUpQuestionLine(line);
    if (!normalized) return;

    const key = normalized.toLowerCase();
    if (seen.has(key)) return;

    seen.add(key);
    unique.push(normalized);
  });

  return unique;
};

const FOLLOW_UP_QUESTION_MAX_RESULTS = 6;
const FOLLOW_UP_QUESTION_GENERATION_ATTEMPTS = 2;
const FOLLOW_UP_NAME_ADDRESS_PROBABILITY = 0.38;

const escapeRegex = (value) => String(value || "").replace(/[.*+?^${}()|[\]\\]/g, "\\$&");

const getFirstName = (fullName) =>
  String(fullName || "")
    .trim()
    .split(/\s+/)
    .filter(Boolean)[0] || "";

const startsWithName = (question, firstName) => {
  const normalizedQuestion = String(question || "").trim();
  const normalizedFirstName = getFirstName(firstName);
  if (!normalizedQuestion || !normalizedFirstName) return false;

  const namePrefixRegex = new RegExp(
    `^${escapeRegex(normalizedFirstName)}(?:\\b|\\s|,)`,
    "i"
  );

  return namePrefixRegex.test(normalizedQuestion);
};

const getQuestionStarterFingerprint = (question, firstName) => {
  const normalizedFirstName = getFirstName(firstName);
  const withoutNamePrefix = normalizedFirstName
    ? String(question || "").replace(
        new RegExp(`^${escapeRegex(normalizedFirstName)}\\s*,?\\s*`, "i"),
        ""
      )
    : String(question || "");

  const clean = withoutNamePrefix
    .replace(/[?!.]+$/g, "")
    .trim()
    .toLowerCase();

  if (!clean) return "";

  return clean.split(/\s+/).slice(0, 3).join(" ");
};

const pickRandomItem = (items) => {
  if (!Array.isArray(items) || items.length === 0) return "";
  return items[Math.floor(Math.random() * items.length)];
};

const isLikelyAutoFollowUpQuestionMessage = (content) => {
  const normalized = normalizeFollowUpQuestionLine(content);
  if (!normalized) return false;

  const plain = normalized.replace(/[?]+$/g, "").trim();
  const wordCount = plain ? plain.split(/\s+/).length : 0;

  return normalized.endsWith("?") && wordCount > 0 && wordCount <= 14 && normalized.length <= 95;
};

const collectRecentAssistantQuestions = (messages, maxCount = 8) => {
  const unique = [];
  const seen = new Set();

  for (let idx = messages.length - 1; idx >= 0; idx -= 1) {
    const message = messages[idx];
    if (message.role !== "assistant") continue;

    const candidates = extractFollowUpQuestionsFromText(message.content || "");
    for (const question of candidates) {
      const key = question.toLowerCase();
      if (seen.has(key)) continue;

      seen.add(key);
      unique.push(question);

      if (unique.length >= maxCount) {
        return unique;
      }
    }
  }

  return unique;
};

const generateFollowUpQuestions = async ({
  astrologerId,
  userQuestion,
  aiAnswer,
  hasKundli,
  kundliContextStr,
  userFirstName = "",
  count = 1,
  avoidQuestions = [],
}) => {
  const profile = ASTROLOGER_PROFILES[astrologerId] || null;
  const astrologerName = profile?.name || "Astrologer";
  const kundliHint = hasKundli
    ? "Kundli context is available. At least one question should connect with kundli or timing."
    : "Kundli context is not available. Ask clarifying life-context questions.";
  const requestedCount = Math.max(
    1,
    Math.min(Math.floor(Number(count) || 1), FOLLOW_UP_QUESTION_MAX_RESULTS)
  );

  const normalizedAvoidQuestions = Array.from(
    new Set(
      (avoidQuestions || [])
        .map((question) => normalizeFollowUpQuestionLine(question))
        .filter(Boolean)
        .map((question) => question.toLowerCase())
    )
  ).slice(0, 8);

  const normalizedUserFirstName = getFirstName(userFirstName);
  const latestQuestion = normalizedAvoidQuestions[0] || "";
  const latestQuestionUsesName = startsWithName(
    latestQuestion,
    normalizedUserFirstName
  );

  const shouldAddressByName =
    Boolean(normalizedUserFirstName) &&
    !latestQuestionUsesName &&
    Math.random() < FOLLOW_UP_NAME_ADDRESS_PROBABILITY;

  const addressingInstruction = !normalizedUserFirstName
    ? "Do not force name usage."
    : shouldAddressByName
      ? `Start the question naturally with \"${normalizedUserFirstName},\".`
      : "Do not include the user's name in this question.";

  const styleAngle = pickRandomItem([
    "clarify one detail",
    "timing angle",
    "emotional impact angle",
    "decision/priority angle",
    "practical next-step angle",
  ]);

  const recentOpeners = Array.from(
    new Set(
      normalizedAvoidQuestions
        .map((question) =>
          getQuestionStarterFingerprint(question, normalizedUserFirstName)
        )
        .filter(Boolean)
    )
  ).slice(0, 4);

  const openerInstruction = recentOpeners.length
    ? `Avoid starting with these opener patterns: ${recentOpeners.join(" | ")}.`
    : "Use a fresh opener pattern.";

  const avoidInstruction = normalizedAvoidQuestions.length
    ? `Avoid repeating these recent assistant questions:\n${normalizedAvoidQuestions
        .map((question, index) => `${index + 1}. ${question}`)
        .join("\n")}`
    : "Avoid repeating the exact same tone as your immediate previous follow-up.";

  let bestResult = [];

  for (let attempt = 0; attempt < FOLLOW_UP_QUESTION_GENERATION_ATTEMPTS; attempt += 1) {
    try {
      const completion = await openai.chat.completions.create({
        model: process.env.OPENAI_CHAT_MODEL_FAST || CHAT_MODEL,
        messages: [
          {
            role: "system",
            content: `You are ${astrologerName}. Create follow-up questions for an astrology chat.\nRules:\n- Return exactly ${requestedCount} very short one-line questions.\n- Match the language style used by the user and assistant (Hindi/Hinglish/English).\n- Questions must be directly related to the user's last question and the assistant's answer.\n- Keep each question under 70 characters and under 10 words when possible.\n- Do not mention that you are AI.\n- End each line with '?'.\n- Output only ${requestedCount} lines, no bullets or numbering.\n- Avoid repetitive framing; each question should feel new in tone and structure.\n- For this run, use this question angle: ${styleAngle}.\n- ${addressingInstruction}\n- ${openerInstruction}\n- ${avoidInstruction}`,
          },
          {
            role: "user",
            content:
              `User question: ${userQuestion}\n` +
              `Assistant answer: ${aiAnswer}\n` +
              `${kundliHint}` +
              (hasKundli && kundliContextStr
                ? `\nKundli context:\n${kundliContextStr.slice(0, 800)}`
                : ""),
          },
        ],
        max_tokens: 180,
        temperature: 0.75 + attempt * 0.1,
      });

      const raw = completion.choices?.[0]?.message?.content || "";
      const parsed = extractFollowUpQuestionsFromText(raw).filter(
        (question) => !normalizedAvoidQuestions.includes(question.toLowerCase())
      );

      if (parsed.length > bestResult.length) {
        bestResult = parsed;
      }

      if (parsed.length >= requestedCount) {
        return parsed.slice(0, requestedCount);
      }
    } catch (error) {
      console.error("Generate follow-up questions error:", error?.message || error);
    }
  }

  return bestResult.slice(0, requestedCount);
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
    const requestBody = req.body || {};
    const { message } = requestBody;
    const trimmedMessage = String(message || "").trim();
    const fastMode = requestBody.fastMode === true || requestBody.fast_mode === true;
    const requestedHistoryLimit = Number(
      requestBody.historyLimit ?? requestBody.history_limit
    );
    const historyLimit = Number.isFinite(requestedHistoryLimit) && requestedHistoryLimit > 0
      ? Math.min(Math.floor(requestedHistoryLimit), 20)
      : fastMode
        ? 8
        : 20;

    if (!trimmedMessage) {
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
      content: trimmedMessage,
    });

    if (isUserStopIntentMessage(trimmedMessage)) {
      const lastAssistantMessage = await AIChatMessage.findOne({
        where: { sessionId, role: "assistant" },
        order: [["createdAt", "DESC"]],
        attributes: ["content"],
      });

      const pauseReplyResult = await generateDynamicPauseAcknowledgement({
        astrologerId: session.astrologerId,
        userMessage: trimmedMessage,
        userName: req.user?.fullName || "",
        avoidMessage: lastAssistantMessage?.content || "",
      });
      const pauseReply = pauseReplyResult.content;
      const pauseTokensUsed = pauseReplyResult.tokensUsed || 0;

      const aiMessage = await AIChatMessage.create({
        sessionId,
        role: "assistant",
        content: pauseReply,
        tokens: pauseTokensUsed,
      });

      if (session.title === "New Chat") {
        const title =
          trimmedMessage.substring(0, 50) +
          (trimmedMessage.length > 50 ? "..." : "");
        await session.update({
          title,
          lastMessageAt: new Date(),
        });
      } else {
        await session.update({ lastMessageAt: new Date() });
      }

      return res.status(200).json({
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
        tokensUsed: pauseTokensUsed,
        disableAutoFollowUp: true,
      });
    }

    // Load compact RAG-style Kundli context if a Kundli is attached to this session
    let kundliContextStr = "";
    if (session.kundliUserRequestId) {
      try {
        const [kundliRecord, userRequestRecord] = await Promise.all([
          Kundli.findOne({ where: { requestId: session.kundliUserRequestId } }),
          UserRequest.findOne({ where: { id: session.kundliUserRequestId } }),
        ]);
        if (kundliRecord && userRequestRecord) {
          const kundliJson = kundliRecord.toJSON();
          const userRequestJson = userRequestRecord.toJSON();
          try {
            kundliContextStr = buildInsightRagContext({
              kundli: kundliJson,
              userRequest: userRequestJson,
              userMessage: trimmedMessage,
            });
          } catch (ragError) {
            console.error(
              "Failed to build insight RAG context for session; using fallback context:",
              ragError?.message || ragError
            );
            kundliContextStr = extractKundliContext(kundliJson, userRequestJson);
          }
        }
      } catch (kundliErr) {
        console.error("Failed to load Kundli context for session:", kundliErr.message);
        // Non-fatal ? continue without Kundli context
      }
    }

    // Get recent conversation history (last 20 messages for context)
    // This keeps token usage efficient while maintaining important context
    const previousMessages = await AIChatMessage.findAll({
      where: { sessionId },
      order: [["createdAt", "DESC"]],
      limit: historyLimit,
    });

    // Reverse to chronological order
    previousMessages.reverse();

    // Extract user info from conversation (DOB, name, time, place)
    // This way we don't need all messages - just key information
    let userContext = "";
    if (!fastMode) {
      const conversationText = previousMessages.map((m) => m.content).join(" ");

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
    const systemPrompt = getSystemPrompt(session.astrologerId, { concise: fastMode });

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
      model: fastMode
        ? process.env.OPENAI_CHAT_MODEL_FAST || CHAT_MODEL
        : CHAT_MODEL,
      messages: messages,
      max_tokens: fastMode ? 180 : 260,
      temperature: fastMode ? 0.6 : 0.7,
    });

    let aiRawResponse = completion.choices[0].message.content || "";
    const completionFinishReason = completion.choices[0].finish_reason;
    let tokensUsed = completion.usage?.total_tokens || 0;

    const estimatedLineCount = String(aiRawResponse || "")
      .split(/\r?\n/)
      .map((line) => line.trim())
      .filter(Boolean).length;
    const estimatedWordCount = String(aiRawResponse || "")
      .trim()
      .split(/\s+/)
      .filter(Boolean).length;

    const shouldRepair =
      completionFinishReason === "length" ||
      !hasCompleteSentenceEnding(aiRawResponse) ||
      estimatedLineCount > 4 ||
      estimatedWordCount > 80;

    if (shouldRepair) {
      const repairCompletion = await openai.chat.completions.create({
        model: fastMode
          ? process.env.OPENAI_CHAT_MODEL_FAST || CHAT_MODEL
          : CHAT_MODEL,
        messages: buildCompletionRepairMessages(trimmedMessage, aiRawResponse, {
          concise: fastMode,
        }),
        max_tokens: fastMode ? 180 : 220,
        temperature: fastMode ? 0.4 : 0.5,
      });

      aiRawResponse = repairCompletion.choices[0].message.content || aiRawResponse;
      tokensUsed += repairCompletion.usage?.total_tokens || 0;
    }

    const sanitizedResponse = sanitizeAssistantResponse(aiRawResponse);
    const aiResponse = ensureCompleteSentenceEnding(
      enforceTwoToThreeLinesMaxFour(sanitizedResponse)
    );

    // Save AI response
    const aiMessage = await AIChatMessage.create({
      sessionId,
      role: "assistant",
      content: aiResponse,
      tokens: tokensUsed,
    });

    // Update session title from first message if still "New Chat"
    if (session.title === "New Chat" && previousMessages.length <= 2) {
      const title = trimmedMessage.substring(0, 50) + (trimmedMessage.length > 50 ? "..." : "");
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
      disableAutoFollowUp: false,
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
 * Generate one dynamic AI follow-up question for idle conversations.
 * This endpoint always asks OpenAI in real-time so tone and phrasing stay fresh.
 */
const getAutoFollowUpQuestion = async (req, res) => {
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

    const previousMessages = await AIChatMessage.findAll({
      where: { sessionId },
      order: [["createdAt", "ASC"]],
      limit: 40,
    });

    if (!previousMessages.length) {
      return res.status(200).json({
        success: true,
        followUpQuestion: null,
        followUpMessage: null,
      });
    }

    const reversedMessages = [...previousMessages].reverse();
    const lastUserMessage = reversedMessages.find((message) => message.role === "user");
    const lastAssistantMessage = reversedMessages.find(
      (message) => message.role === "assistant"
    );
    const lastAssistantContextMessage =
      reversedMessages.find(
        (message) =>
          message.role === "assistant" &&
          !isLikelyAutoFollowUpQuestionMessage(message.content)
      ) || lastAssistantMessage;

    if (!lastUserMessage || !lastAssistantMessage) {
      return res.status(200).json({
        success: true,
        followUpQuestion: null,
        followUpMessage: null,
      });
    }

    if (isUserStopIntentMessage(lastUserMessage.content)) {
      return res.status(200).json({
        success: true,
        followUpQuestion: null,
        followUpMessage: null,
      });
    }

    let userFirstName = getFirstName(req.user?.fullName || "");
    if (!userFirstName) {
      try {
        const userRecord = await User.findOne({
          where: { id: userId },
          attributes: ["fullName"],
        });
        userFirstName = getFirstName(userRecord?.fullName || "");
      } catch (userLookupError) {
        console.error(
          "Failed to resolve user name for follow-up variation:",
          userLookupError?.message || userLookupError
        );
      }
    }

    let kundliContextStr = "";
    if (session.kundliUserRequestId) {
      try {
        const [kundliRecord, userRequestRecord] = await Promise.all([
          Kundli.findOne({ where: { requestId: session.kundliUserRequestId } }),
          UserRequest.findOne({ where: { id: session.kundliUserRequestId } }),
        ]);

        if (kundliRecord && userRequestRecord) {
          const kundliJson = kundliRecord.toJSON();
          const userRequestJson = userRequestRecord.toJSON();
          try {
            kundliContextStr = buildInsightRagContext({
              kundli: kundliJson,
              userRequest: userRequestJson,
              userMessage: lastUserMessage.content,
            });
          } catch (ragError) {
            console.error(
              "Failed to build insight RAG context for follow-up generation; using fallback context:",
              ragError?.message || ragError
            );
            kundliContextStr = extractKundliContext(kundliJson, userRequestJson);
          }
        }
      } catch (kundliErr) {
        console.error(
          "Failed to load Kundli context for follow-up generation:",
          kundliErr.message
        );
      }
    }

    const avoidQuestions = collectRecentAssistantQuestions(previousMessages, 8);
    const generatedQuestions = await generateFollowUpQuestions({
      astrologerId: session.astrologerId,
      userQuestion: lastUserMessage.content,
      aiAnswer: lastAssistantContextMessage?.content || lastAssistantMessage.content,
      hasKundli: Boolean(kundliContextStr),
      kundliContextStr,
      userFirstName,
      count: 1,
      avoidQuestions,
    });

    const followUpQuestion = generatedQuestions[0] || null;
    if (!followUpQuestion) {
      return res.status(200).json({
        success: true,
        followUpQuestion: null,
        followUpMessage: null,
      });
    }

    const followUpMessage = await AIChatMessage.create({
      sessionId,
      role: "assistant",
      content: followUpQuestion,
    });

    await session.update({ lastMessageAt: new Date() });

    return res.status(200).json({
      success: true,
      followUpQuestion: followUpMessage.content,
      followUpMessage: {
        id: followUpMessage.id,
        sessionId: followUpMessage.sessionId,
        role: followUpMessage.role,
        content: followUpMessage.content,
        createdAt: followUpMessage.createdAt,
        updatedAt: followUpMessage.updatedAt,
      },
    });
  } catch (error) {
    console.error("Get auto follow-up question error:", error);
    return res.status(500).json({
      success: false,
      message: "Failed to generate follow-up question",
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
  getAutoFollowUpQuestion,
};
