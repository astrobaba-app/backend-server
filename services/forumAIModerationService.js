const { Op } = require("sequelize");
const ForumPost = require("../model/forum/forumPost");
const ForumComment = require("../model/forum/forumComment");
const User = require("../model/user/userAuth");
const notificationService = require("./notificationService");
const { createChatCompletion } = require("./openaiClient");
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

const NSFW_REASON_KEYWORDS = [
  "nsfw",
  "nfw",
  "porn",
  "porno",
  "nude",
  "nudity",
  "sexual",
  "sexually explicit",
  "explicit sexual",
  "adult content",
  "xxx",
  "erotic",
  "obscene",
];

let moderationTimer = null;
let running = false;

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

const isNsfwOrPornReason = (reason = "") => {
  const normalized = String(reason || "").toLowerCase();
  return NSFW_REASON_KEYWORDS.some((keyword) => normalized.includes(keyword));
};

const enforceNsfwOnlyPolicy = (moderation, approveReason) => {
  if (!moderation || moderation.decision !== "reject") {
    return moderation;
  }

  if (isNsfwOrPornReason(moderation.reason)) {
    return moderation;
  }

  return {
    decision: "approve",
    reason: approveReason,
    severity: "low",
  };
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

  if (!process.env.OPENAI_API_KEY) {
    return {
      decision: "approve",
      reason: "OpenAI key unavailable for image moderation",
      severity: "low",
    };
  }

  const prompt = `You are image moderation AI for an astrology-focused platform.
Task: Detect only NSFW/pornographic imagery.

Return STRICT JSON only:
{
  "decision": "approve" | "reject",
  "reason": "short clear reason",
  "severity": "low" | "high",
  "nsfw": true | false
}

Reject only if image contains explicit sexual nudity or pornographic content.
Allow everything else for now, even if irrelevant/off-topic.

Title: ${title || "N/A"}
Body: ${body || "N/A"}
Tags: ${(tags || []).join(", ") || "N/A"}`;

  const response = await createChatCompletion({
    model: AI_VISION_MODEL,
    temperature: 0,
    max_tokens: 280,
    messages: [
      {
        role: "system",
        content:
          "You are strict NSFW image moderation engine. Reject only porn/explicit sexual nudity. Return valid JSON only with decision, reason, severity, and nsfw.",
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
  }, { feature: "forum_moderation" });

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

  return enforceNsfwOnlyPolicy(
    mapped,
    "Allowed by policy: only NSFW/porn images are blocked for now"
  );
};

const moderateWithAI = async ({ contentType, title, body, tags = [], imageUrls = [] }) => {
  const normalizedImageUrls = normalizeImageUrls(imageUrls);
  const combinedText = `${title || ""}\n${body || ""}\n${(tags || []).join(" ")}`;
  const fallbackSafety = evaluateForumSubmission({ text: combinedText });
  const fallbackReason = fallbackSafety.reasons?.join("; ") || "";
  if (fallbackSafety.decision === "block" && isNsfwOrPornReason(fallbackReason)) {
    return {
      decision: "reject",
      reason: fallbackReason || "Blocked by safety checks",
      severity: "high",
    };
  }

  const intentDetected = hasAstrologyIntent({ title, body, tags });

  if (!process.env.OPENAI_API_KEY) {
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
  "severity": "low" | "high",
  "nsfw": true | false
}

Reject only when the text itself is clearly pornographic/NSFW/explicit sexual content.
Allow everything else for now.

Title: ${title || "N/A"}
Body: ${body || "N/A"}
Tags: ${(tags || []).join(", ") || "N/A"}
Images: ${normalizedImageUrls.length > 0 ? normalizedImageUrls.join("\n") : "N/A"}
IntentDetectedByKeywords: ${intentDetected ? "yes" : "no"}`;

  const response = await createChatCompletion({
    model: AI_MODEL,
    temperature: 0,
    max_tokens: 250,
    messages: [
      {
        role: "system",
        content:
          "You are strict NSFW moderation engine. Reject only porn/explicit sexual content. Return valid JSON only with decision, reason, severity, and nsfw.",
      },
      {
        role: "user",
        content: prompt,
      },
    ],
  }, { feature: "forum_moderation" });

  const rawText = response.choices?.[0]?.message?.content || "";
  const parsed = JSON.parse(cleanJsonString(rawText));
  const mapped = mapAIDecision(parsed);

  let finalModeration = mapped;
  if (parsed?.nsfw === true && mapped.decision !== "reject") {
    finalModeration = {
      decision: "reject",
      reason: mapped.reason || "NSFW content detected",
      severity: "high",
    };
  }

  finalModeration = enforceNsfwOnlyPolicy(
    finalModeration,
    "Allowed by policy: only NSFW/porn text is blocked for now"
  );

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

  return finalModeration;
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
  if (String(process.env.FORUM_AI_MODERATION_WORKER_ENABLED || "false").toLowerCase() !== "true") {
    console.log("[ForumAI] Moderation worker disabled by FORUM_AI_MODERATION_WORKER_ENABLED=false");
    return;
  }

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
