const OpenAI = require("openai");
const { Op } = require("sequelize");
const ForumPost = require("../model/forum/forumPost");
const ForumComment = require("../model/forum/forumComment");
const User = require("../model/user/userAuth");
const notificationService = require("./notificationService");
const {
  applyModerationPenalty,
  evaluateForumSubmission,
} = require("./forumModerationService");
const { runForumDuplicateCycle } = require("./forumDuplicateService");

const AI_MODEL = process.env.OPENAI_CHAT_MODEL || "gpt-4o-mini";
const AI_VISION_MODEL = process.env.OPENAI_VISION_MODEL || AI_MODEL;
const MODERATION_INTERVAL_MS = Number.parseInt(process.env.FORUM_AI_MODERATION_INTERVAL_MS || "45000", 10);
const MODERATION_BATCH_SIZE = Number.parseInt(process.env.FORUM_AI_MODERATION_BATCH_SIZE || "10", 10);

const ASTROLOGY_INTENT_KEYWORDS = [
  "astrology",
  "astrologer",
  "astro",
  "astrolgey",
  "astrolgy",
  "kundli",
  "janam kundli",
  "birth chart",
  "natal chart",
  "horoscope",
  "zodiac",
  "rashi",
  "lagna",
  "nakshatra",
  "planet",
  "graha",
  "dasha",
  "transit",
  "remedy",
  "numerology",
  "tarot",
  "palmistry",
];

const HIGH_SEVERITY_REASON_KEYWORDS = [
  "abuse",
  "abusive",
  "hate",
  "hateful",
  "threat",
  "violent",
  "violence",
  "sexual",
  "porn",
  "self-harm",
  "suicide",
  "scam",
  "spam",
  "harassment",
  "bully",
];

let openaiClient = null;
let moderationTimer = null;
let running = false;

const getOpenAIClient = () => {
  if (!process.env.OPENAI_API_KEY) {
    return null;
  }

  if (!openaiClient) {
    openaiClient = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });
  }

  return openaiClient;
};

const cleanJsonString = (raw) => {
  if (!raw) return "";
  let text = String(raw).trim();

  if (text.startsWith("```json")) {
    text = text.replace(/^```json\s*/i, "").replace(/\s*```$/, "");
  } else if (text.startsWith("```")) {
    text = text.replace(/^```\s*/i, "").replace(/\s*```$/, "");
  }

  return text.trim();
};

const mapAIDecision = (result) => {
  const decision = String(result?.decision || "allow").toLowerCase();
  const reason = result?.reason || "No reason provided";
  const severity = String(result?.severity || "low").toLowerCase() === "high" ? "high" : "low";

  if (["remove", "reject", "block"].includes(decision)) {
    return { decision: "reject", reason, severity };
  }

  return { decision: "approve", reason, severity: "low" };
};

const normalizeImageUrls = (imageUrls = []) => {
  const urls = Array.isArray(imageUrls) ? imageUrls : [];
  const cleaned = urls
    .map((url) => String(url || "").trim())
    .filter(Boolean)
    .filter((url) => /^https?:\/\//i.test(url));

  return [...new Set(cleaned)].slice(0, 5);
};

const hasAstrologyIntent = ({ title, body, tags = [] }) => {
  const normalizedText = `${title || ""} ${body || ""} ${(tags || []).join(" ")}`.toLowerCase();
  return ASTROLOGY_INTENT_KEYWORDS.some((keyword) => normalizedText.includes(keyword));
};

const isHighSeverityReason = (reason = "") => {
  const normalized = String(reason).toLowerCase();
  return HIGH_SEVERITY_REASON_KEYWORDS.some((keyword) => normalized.includes(keyword));
};

const isLikelyRelevanceRejection = (reason = "") => {
  const normalized = String(reason).toLowerCase();
  return (
    normalized.includes("not related") ||
    normalized.includes("not relevant") ||
    normalized.includes("off-topic") ||
    normalized.includes("off topic") ||
    normalized.includes("astrology")
  );
};

const getPenaltyLevel = (moderation) => {
  if (moderation.severity === "high" || isHighSeverityReason(moderation.reason)) {
    return "block";
  }
  return "warn";
};

const moderateImagesWithAI = async ({ title, body, tags = [], imageUrls = [] }) => {
  const normalizedImageUrls = normalizeImageUrls(imageUrls);
  if (normalizedImageUrls.length === 0) {
    return {
      decision: "approve",
      reason: "No images to moderate",
      severity: "low",
    };
  }

  const openai = getOpenAIClient();
  if (!openai) {
    return {
      decision: "approve",
      reason: "OpenAI key unavailable for image moderation",
      severity: "low",
    };
  }

  const prompt = `You are image moderation AI for an astrology-focused platform.
Task: Evaluate image safety and semantic relevance with provided title/body/tags.

Return STRICT JSON only:
{
  "decision": "approve" | "reject",
  "reason": "short clear reason",
  "severity": "low" | "high",
  "nsfw": true | false,
  "relevantToText": true | false
}

Reject with severity="high" if image contains explicit sexual nudity, graphic violence, extreme hate symbols, or clear unsafe content.
Reject with severity="low" if image is clearly unrelated/mismatched to the post's title/body/tags.
Approve when image appears safe and reasonably aligned with the post context.

Title: ${title || "N/A"}
Body: ${body || "N/A"}
Tags: ${(tags || []).join(", ") || "N/A"}`;

  const response = await openai.chat.completions.create({
    model: AI_VISION_MODEL,
    temperature: 0,
    max_tokens: 280,
    messages: [
      {
        role: "system",
        content:
          "You are strict image moderation engine. Return valid JSON only with decision, reason, severity, nsfw, and relevantToText.",
      },
      {
        role: "user",
        content: [
          {
            type: "text",
            text: prompt,
          },
          ...normalizedImageUrls.map((url) => ({
            type: "image_url",
            image_url: { url },
          })),
        ],
      },
    ],
  });

  const rawText = response.choices?.[0]?.message?.content || "";
  const parsed = JSON.parse(cleanJsonString(rawText));
  const mapped = mapAIDecision(parsed);

  if (parsed?.nsfw === true && mapped.decision !== "reject") {
    return {
      decision: "reject",
      reason: mapped.reason || "NSFW image detected",
      severity: "high",
    };
  }

  if (parsed?.relevantToText === false && mapped.decision !== "reject") {
    return {
      decision: "reject",
      reason: mapped.reason || "Image does not match post title/content",
      severity: "low",
    };
  }

  return mapped;
};

const moderateWithAI = async ({ contentType, title, body, tags = [], imageUrls = [] }) => {
  const normalizedImageUrls = normalizeImageUrls(imageUrls);
  const combinedText = `${title || ""}\n${body || ""}\n${(tags || []).join(" ")}`;
  const fallbackSafety = evaluateForumSubmission({ text: combinedText });
  if (fallbackSafety.decision === "block") {
    return {
      decision: "reject",
      reason: fallbackSafety.reasons?.join("; ") || "Blocked by safety checks",
      severity: "high",
    };
  }

  const intentDetected = hasAstrologyIntent({ title, body, tags });
  const openai = getOpenAIClient();

  if (!openai) {
    return {
      decision: "approve",
      reason:
        fallbackSafety.reasons?.join("; ") ||
        "OpenAI key unavailable, fallback safety checks passed",
      severity: "low",
    };
  }

  const prompt = `You are moderation AI for an astrology-focused platform.
Platform scope: astrology, kundli, horoscope, zodiac, planetary remedies, astrological consultation experiences.

Evaluate this ${contentType} and return STRICT JSON only:
{
  "decision": "approve" | "reject",
  "reason": "short clear reason",
  "severity": "low" | "high"
}

Reject if:
1) Abusive, hateful, sexual, violent, spam/scam, self-harm encouragement.
2) Clearly unrelated to astrology/kundli/horoscope/astrologer experience.

Important leniency rule:
- Use title + body + tags together for intent.
- If title/tag shows astrology intent and body is generic (e.g., "sharing my experience", "will post details soon"), approve.
- Do not reject just because detail level is low.

Use severity = "high" only for clear harmful abuse/safety violations.
Use severity = "low" for non-harmful relevance concerns.

Title: ${title || "N/A"}
Body: ${body || "N/A"}
Tags: ${(tags || []).join(", ") || "N/A"}
Images: ${normalizedImageUrls.length > 0 ? normalizedImageUrls.join("\n") : "N/A"}
IntentDetectedByKeywords: ${intentDetected ? "yes" : "no"}`;

  const response = await openai.chat.completions.create({
    model: AI_MODEL,
    temperature: 0,
    max_tokens: 250,
    messages: [
      {
        role: "system",
        content:
          "You are strict moderation engine. Return valid JSON only with decision and reason.",
      },
      {
        role: "user",
        content: prompt,
      },
    ],
  });

  const rawText = response.choices?.[0]?.message?.content || "";
  const parsed = JSON.parse(cleanJsonString(rawText));
  const mapped = mapAIDecision(parsed);

  if (
    mapped.decision === "reject" &&
    intentDetected &&
    mapped.severity !== "high" &&
    isLikelyRelevanceRejection(mapped.reason)
  ) {
    return {
      decision: "approve",
      reason: "Approved due to clear astrology intent from title/tags",
      severity: "low",
    };
  }

  if (contentType === "forum post" && normalizedImageUrls.length > 0) {
    const imageModeration = await moderateImagesWithAI({
      title,
      body,
      tags,
      imageUrls: normalizedImageUrls,
    });

    if (imageModeration.decision === "reject") {
      return {
        decision: "reject",
        reason: `Image moderation failed: ${imageModeration.reason}`,
        severity: imageModeration.severity,
      };
    }
  }

  return mapped;
};

const notifyPostRemoval = async (post, reason) => {
  await notificationService.sendToUser(post.authorUserId, {
    type: "general",
    title: "Discussion removed by moderator bot",
    message: `Your post was removed: ${reason}`,
    data: {
      source: "forum_ai_moderator",
      postId: post.id,
      reason,
    },
    actionUrl: "/forum",
    priority: "high",
    sendPush: true,
  });
};

const notifyCommentRemoval = async (comment, reason) => {
  await notificationService.sendToUser(comment.authorUserId, {
    type: "general",
    title: "Comment removed by moderator bot",
    message: `Your comment was removed: ${reason}`,
    data: {
      source: "forum_ai_moderator",
      postId: comment.postId,
      commentId: comment.id,
      reason,
    },
    actionUrl: `/forum/${comment.postId}`,
    priority: "medium",
    sendPush: true,
  });
};

const processPendingPosts = async () => {
  const pendingPosts = await ForumPost.findAll({
    where: {
      aiModerationStatus: {
        [Op.in]: ["pending", "error"],
      },
      isActive: true,
    },
    order: [["createdAt", "ASC"]],
    limit: MODERATION_BATCH_SIZE,
  });

  for (const post of pendingPosts) {
    try {
      const imageUrlsForModeration =
        Array.isArray(post.images) && post.images.length > 0
          ? post.images
          : post.image
          ? [post.image]
          : [];

      const moderation = await moderateWithAI({
        contentType: "forum post",
        title: post.title,
        body: post.description,
        tags: post.tags || [],
        imageUrls: imageUrlsForModeration,
      });

      if (moderation.decision === "reject") {
        await post.update({
          isActive: false,
          moderationReason: moderation.reason,
          aiModerationStatus: "rejected",
          aiModerationReason: moderation.reason,
          aiModeratedAt: new Date(),
          moderatedAt: new Date(),
          moderatedByAdminId: null,
        });

        const user = await User.findByPk(post.authorUserId);
        if (user) {
          await applyModerationPenalty(user, getPenaltyLevel(moderation));
        }

        await notifyPostRemoval(post, moderation.reason);
      } else {
        await post.update({
          aiModerationStatus: "approved",
          aiModerationReason: moderation.reason,
          aiModeratedAt: new Date(),
        });
      }
    } catch (error) {
      console.error("[ForumAI] Post moderation failed:", error?.message || error);
      await post.update({
        aiModerationStatus: "error",
        aiModerationReason: error?.message || "AI moderation failed",
        aiModeratedAt: new Date(),
      });
    }
  }
};

const processPendingComments = async () => {
  const pendingComments = await ForumComment.findAll({
    where: {
      aiModerationStatus: {
        [Op.in]: ["pending", "error"],
      },
      isRemovedByModerator: false,
      isDeletedByAuthor: false,
    },
    include: [
      {
        model: ForumPost,
        as: "post",
        attributes: ["id", "isActive", "title", "description"],
      },
    ],
    order: [["createdAt", "ASC"]],
    limit: MODERATION_BATCH_SIZE,
  });

  for (const comment of pendingComments) {
    try {
      if (!comment.post || !comment.post.isActive) {
        await comment.update({
          aiModerationStatus: "rejected",
          aiModerationReason: "Parent post inactive",
          aiModeratedAt: new Date(),
          isRemovedByModerator: true,
          removedBy: "ai_moderator",
          removedAt: new Date(),
        });
        continue;
      }

      const moderation = await moderateWithAI({
        contentType: "forum comment",
        title: comment.post.title,
        body: comment.content,
        tags: [],
      });

      if (moderation.decision === "reject") {
        await comment.update({
          aiModerationStatus: "rejected",
          aiModerationReason: moderation.reason,
          aiModeratedAt: new Date(),
          isRemovedByModerator: true,
          removedBy: "ai_moderator",
          removedAt: new Date(),
        });

        const user = await User.findByPk(comment.authorUserId);
        if (user) {
          await applyModerationPenalty(user, getPenaltyLevel(moderation));
        }

        await notifyCommentRemoval(comment, moderation.reason);
      } else {
        await comment.update({
          aiModerationStatus: "approved",
          aiModerationReason: moderation.reason,
          aiModeratedAt: new Date(),
        });
      }
    } catch (error) {
      console.error("[ForumAI] Comment moderation failed:", error?.message || error);
      await comment.update({
        aiModerationStatus: "error",
        aiModerationReason: error?.message || "AI moderation failed",
        aiModeratedAt: new Date(),
      });
    }
  }
};

const runForumAIModerationCycle = async () => {
  if (running) return;
  running = true;

  try {
    await processPendingPosts();
    await processPendingComments();
    await runForumDuplicateCycle();
  } catch (error) {
    console.error("[ForumAI] Moderation cycle error:", error?.message || error);
  } finally {
    running = false;
  }
};

const startForumAIModerationWorker = () => {
  if (moderationTimer) {
    return;
  }

  moderationTimer = setInterval(runForumAIModerationCycle, MODERATION_INTERVAL_MS);
  runForumAIModerationCycle().catch(() => {});
  console.log(`[ForumAI] Moderation worker started (every ${MODERATION_INTERVAL_MS}ms)`);
};

module.exports = {
  startForumAIModerationWorker,
  runForumAIModerationCycle,
};