const MAX_IMAGE_SIZE_BYTES = 5 * 1024 * 1024;
const ALLOWED_IMAGE_MIME_TYPES = new Set([
  "image/jpeg",
  "image/png",
  "image/webp",
  "image/gif",
]);

const BLOCK_KEYWORDS = [
  "porn",
  "nude",
  "nudes",
  "rape",
  "sexual",
  "terror",
  "kill you",
  "suicide",
  "bomb",
];

const WARN_KEYWORDS = [
  "idiot",
  "stupid",
  "hate",
  "scam",
  "loser",
  "trash",
  "abuse",
  "fake",
];

const SUSPICIOUS_IMAGE_TERMS = ["nude", "porn", "explicit", "violence", "gore"];
const LINK_REGEX = /(https?:\/\/|www\.)/gi;

const normalize = (value) => String(value || "").toLowerCase();

const findMatches = (text, dictionary) => dictionary.filter((word) => text.includes(word));

const evaluateText = (inputText) => {
  const text = normalize(inputText);
  const reasons = [];

  if (!text.trim()) {
    return { decision: "allow", reasons };
  }

  const blockedMatches = findMatches(text, BLOCK_KEYWORDS);
  if (blockedMatches.length > 0) {
    reasons.push(`Blocked terms detected: ${blockedMatches.join(", ")}`);
  }

  const warningMatches = findMatches(text, WARN_KEYWORDS);
  if (warningMatches.length > 0) {
    reasons.push(`Warning terms detected: ${warningMatches.join(", ")}`);
  }

  const links = text.match(LINK_REGEX) || [];
  if (links.length > 2) {
    reasons.push("Too many external links in a single submission");
  }

  const hasRepeatingSpam = /(.)\1{10,}/.test(text);
  if (hasRepeatingSpam) {
    reasons.push("Spam-like repetitive characters detected");
  }

  if (blockedMatches.length > 0 || links.length > 2) {
    return { decision: "block", reasons };
  }

  if (warningMatches.length > 0 || hasRepeatingSpam) {
    return { decision: "warn", reasons };
  }

  return { decision: "allow", reasons };
};

const evaluateImages = (files = []) => {
  const reasons = [];
  const decisions = [];

  files.forEach((file) => {
    if (!ALLOWED_IMAGE_MIME_TYPES.has(file.mimetype)) {
      decisions.push("block");
      reasons.push(`Unsupported image type: ${file.mimetype || "unknown"}`);
    }

    if (file.size > MAX_IMAGE_SIZE_BYTES) {
      decisions.push("block");
      reasons.push("Image exceeds maximum allowed size of 5MB");
    }

    const fileName = normalize(file.originalname);
    const suspiciousTerms = findMatches(fileName, SUSPICIOUS_IMAGE_TERMS);
    if (suspiciousTerms.length > 0) {
      decisions.push("warn");
      reasons.push(`Suspicious image file name detected: ${suspiciousTerms.join(", ")}`);
    }
  });

  if (decisions.includes("block")) {
    return { decision: "block", reasons };
  }

  if (decisions.includes("warn")) {
    return { decision: "warn", reasons };
  }

  return { decision: "allow", reasons };
};

const evaluateForumSubmission = ({ text, files = [] }) => {
  const textModeration = evaluateText(text);
  const imageModeration = evaluateImages(files);

  if (textModeration.decision === "block" || imageModeration.decision === "block") {
    return {
      decision: "block",
      reasons: [...textModeration.reasons, ...imageModeration.reasons],
    };
  }

  if (textModeration.decision === "warn" || imageModeration.decision === "warn") {
    return {
      decision: "warn",
      reasons: [...textModeration.reasons, ...imageModeration.reasons],
    };
  }

  return {
    decision: "allow",
    reasons: [],
  };
};

const checkForumUserAccess = (user) => {
  if (!user) {
    return { allowed: false, message: "User not found" };
  }

  if (user.forumIsBanned) {
    return {
      allowed: false,
      message: "Your forum access is permanently restricted by the moderation team.",
    };
  }

  if (user.forumBlockedUntil && new Date(user.forumBlockedUntil) > new Date()) {
    return {
      allowed: false,
      message: `Your forum access is temporarily restricted until ${new Date(user.forumBlockedUntil).toLocaleString()}.`,
    };
  }

  return { allowed: true, message: "allowed" };
};

const applyModerationPenalty = async (user, decision, transaction) => {
  if (!user || decision === "allow") {
    return user;
  }

  const nextWarnings = (user.forumWarningsCount || 0) + 1;
  user.forumWarningsCount = nextWarnings;

  if (nextWarnings >= 7) {
    user.forumIsBanned = true;
    user.forumBlockedUntil = null;
  } else if (nextWarnings >= 3) {
    const now = new Date();
    const currentBlock = user.forumBlockedUntil ? new Date(user.forumBlockedUntil) : null;
    if (!currentBlock || currentBlock <= now) {
      user.forumBlockedUntil = new Date(now.getTime() + 24 * 60 * 60 * 1000);
    }
  }

  await user.save({ transaction });
  return user;
};

module.exports = {
  applyModerationPenalty,
  checkForumUserAccess,
  evaluateForumSubmission,
};