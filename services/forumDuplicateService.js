const crypto = require("crypto");
const OpenAI = require("openai");
const { Op } = require("sequelize");
const ForumPost = require("../model/forum/forumPost");
const notificationService = require("./notificationService");

const EMBEDDING_MODEL = process.env.OPENAI_EMBEDDING_MODEL || "text-embedding-3-small";
const DUPLICATE_INTERVAL_MS = Number.parseInt(process.env.FORUM_DUPLICATE_INTERVAL_MS || "55000", 10);
const DUPLICATE_BATCH_SIZE = Number.parseInt(process.env.FORUM_DUPLICATE_BATCH_SIZE || "8", 10);
const DUPLICATE_LOOKBACK_DAYS = Number.parseInt(process.env.FORUM_DUPLICATE_LOOKBACK_DAYS || "90", 10);

const SEMANTIC_THRESHOLD = Number.parseFloat(process.env.FORUM_DUPLICATE_SEMANTIC_THRESHOLD || "0.88");
const TITLE_THRESHOLD = Number.parseFloat(process.env.FORUM_DUPLICATE_TITLE_THRESHOLD || "0.75");
const TOKEN_OVERLAP_THRESHOLD = Number.parseFloat(process.env.FORUM_DUPLICATE_TOKEN_OVERLAP_THRESHOLD || "0.6");
const CONTENT_SIMILARITY_THRESHOLD = Number.parseFloat(process.env.FORUM_DUPLICATE_CONTENT_SIM_THRESHOLD || "0.72");
const LEXICAL_TITLE_THRESHOLD = Number.parseFloat(process.env.FORUM_DUPLICATE_LEXICAL_TITLE_THRESHOLD || "0.62");
const LEXICAL_TOKEN_THRESHOLD = Number.parseFloat(process.env.FORUM_DUPLICATE_LEXICAL_TOKEN_THRESHOLD || "0.5");
const LEXICAL_CONTENT_THRESHOLD = Number.parseFloat(process.env.FORUM_DUPLICATE_LEXICAL_CONTENT_THRESHOLD || "0.68");

let openaiClient = null;
let duplicateTimer = null;
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

const normalizeText = (value) =>
  String(value || "")
    .toLowerCase()
    .replace(/[^a-z0-9\s]/g, " ")
    .replace(/\s+/g, " ")
    .trim();

const tokenize = (value) => {
  const stopWords = new Set(["the", "is", "a", "an", "to", "for", "of", "and", "or", "in", "on", "with", "my", "i", "am", "are", "this", "that"]);
  return normalizeText(value)
    .split(" ")
    .filter((token) => token.length > 2 && !stopWords.has(token));
};

const createFingerprint = ({ title, description }) => {
  const normalizedTitle = normalizeText(title);
  const normalizedDescription = normalizeText(description);
  const normalized = `${normalizedTitle} ${normalizedDescription}`.trim();
  const hash = crypto.createHash("sha256").update(normalized).digest("hex");

  return {
    normalizedTitle,
    normalizedDescription,
    normalized,
    hash,
  };
};

const trigramSet = (text) => {
  const value = `  ${normalizeText(text)}  `;
  const set = new Set();
  for (let index = 0; index < value.length - 2; index += 1) {
    set.add(value.slice(index, index + 3));
  }
  return set;
};

const trigramSimilarity = (left, right) => {
  const leftSet = trigramSet(left);
  const rightSet = trigramSet(right);

  if (leftSet.size === 0 && rightSet.size === 0) {
    return 1;
  }

  let intersection = 0;
  leftSet.forEach((item) => {
    if (rightSet.has(item)) {
      intersection += 1;
    }
  });

  const union = leftSet.size + rightSet.size - intersection;
  return union === 0 ? 0 : intersection / union;
};

const tokenOverlap = (left, right) => {
  const leftTokens = new Set(tokenize(left));
  const rightTokens = new Set(tokenize(right));

  if (leftTokens.size === 0 || rightTokens.size === 0) {
    return 0;
  }

  let intersection = 0;
  leftTokens.forEach((token) => {
    if (rightTokens.has(token)) {
      intersection += 1;
    }
  });

  return intersection / Math.min(leftTokens.size, rightTokens.size);
};

const cosineSimilarity = (vectorA, vectorB) => {
  if (!Array.isArray(vectorA) || !Array.isArray(vectorB) || vectorA.length !== vectorB.length || vectorA.length === 0) {
    return 0;
  }

  let dot = 0;
  let normA = 0;
  let normB = 0;

  for (let index = 0; index < vectorA.length; index += 1) {
    const a = Number(vectorA[index]) || 0;
    const b = Number(vectorB[index]) || 0;
    dot += a * b;
    normA += a * a;
    normB += b * b;
  }

  const denominator = Math.sqrt(normA) * Math.sqrt(normB);
  if (!denominator) {
    return 0;
  }

  return dot / denominator;
};

const parseEmbedding = (value) => {
  if (!value) {
    return null;
  }

  try {
    const parsed = JSON.parse(value);
    return Array.isArray(parsed) ? parsed : null;
  } catch {
    return null;
  }
};

const getTextEmbedding = async (text) => {
  const openai = getOpenAIClient();
  if (!openai) {
    return null;
  }

  try {
    const response = await openai.embeddings.create({
      model: EMBEDDING_MODEL,
      input: text,
    });

    return response.data?.[0]?.embedding || null;
  } catch (error) {
    console.error("[ForumDuplicate] Embedding request failed:", error?.message || error);
    return null;
  }
};

const getTextEmbeddingsBatch = async (texts = []) => {
  const openai = getOpenAIClient();
  if (!openai || !Array.isArray(texts) || texts.length === 0) {
    return [];
  }

  try {
    const response = await openai.embeddings.create({
      model: EMBEDDING_MODEL,
      input: texts,
    });

    return (response.data || []).map((item) => item.embedding || null);
  } catch (error) {
    console.error("[ForumDuplicate] Batch embedding request failed:", error?.message || error);
    return [];
  }
};

const findExactDuplicateCandidates = async ({ hash, excludePostId = null, limit = 3 }) => {
  const where = {
    isActive: true,
    contentFingerprint: hash,
  };

  if (excludePostId) {
    where.id = { [Op.ne]: excludePostId };
  }

  const matches = await ForumPost.findAll({
    where,
    attributes: ["id", "title", "createdAt"],
    order: [["createdAt", "ASC"]],
    limit,
  });

  return matches;
};

const findExactDuplicateCandidatesByContent = async ({ post, candidates = [] }) => {
  const sourceFingerprint = createFingerprint({
    title: post.title,
    description: post.description,
  });

  const exact = [];

  for (const candidate of candidates) {
    if (!candidate || candidate.id === post.id) {
      continue;
    }

    const candidateFingerprint = createFingerprint({
      title: candidate.title,
      description: candidate.description,
    });

    if (candidateFingerprint.hash !== sourceFingerprint.hash) {
      continue;
    }

    exact.push(candidate);

    if (!candidate.contentFingerprint || !candidate.titleNormalized) {
      await candidate.update({
        contentFingerprint: candidateFingerprint.hash,
        titleNormalized: candidateFingerprint.normalizedTitle,
      });
    }
  }

  exact.sort((left, right) => new Date(left.createdAt).getTime() - new Date(right.createdAt).getTime());
  return exact;
};

const buildDuplicateResponsePayload = (matches) => {
  const similarPosts = matches.map((post) => ({
    id: post.id,
    title: post.title,
    url: `/forum/${post.id}`,
  }));

  return {
    success: false,
    message: "Similar question already exists",
    similarPosts,
  };
};

const checkExactDuplicateBeforeCreate = async ({ title, description }) => {
  const fingerprint = createFingerprint({ title, description });
  const matches = await findExactDuplicateCandidates({ hash: fingerprint.hash, limit: 3 });

  return {
    fingerprint,
    matches,
    hasDuplicate: matches.length > 0,
  };
};

const findExactDuplicateMatches = async ({ title, description, excludePostId = null, limit = 3 }) => {
  const fingerprint = createFingerprint({ title, description });
  const indexedMatches = await findExactDuplicateCandidates({
    hash: fingerprint.hash,
    excludePostId,
    limit,
  });

  if (indexedMatches.length >= limit) {
    return { fingerprint, matches: indexedMatches.slice(0, limit) };
  }

  const where = { isActive: true };
  if (excludePostId) {
    where.id = { [Op.ne]: excludePostId };
  }

  const candidates = await ForumPost.findAll({
    where,
    attributes: ["id", "title", "description", "contentFingerprint", "titleNormalized", "createdAt"],
    order: [["createdAt", "ASC"]],
    limit: 300,
  });

  const legacyMatches = [];
  for (const candidate of candidates) {
    if (indexedMatches.some((item) => item.id === candidate.id)) {
      continue;
    }

    const candidateFingerprint = createFingerprint({
      title: candidate.title,
      description: candidate.description,
    });

    if (candidateFingerprint.hash !== fingerprint.hash) {
      continue;
    }

    legacyMatches.push(candidate);

    if (!candidate.contentFingerprint || !candidate.titleNormalized) {
      await candidate.update({
        contentFingerprint: candidateFingerprint.hash,
        titleNormalized: candidateFingerprint.normalizedTitle,
      });
    }

    if (indexedMatches.length + legacyMatches.length >= limit) {
      break;
    }
  }

  return {
    fingerprint,
    matches: [...indexedMatches, ...legacyMatches].slice(0, limit),
  };
};

const shouldMarkAsDuplicateLexical = ({ titleSimilarity, tokensOverlap, contentSimilarity }) => {
  return titleSimilarity >= LEXICAL_TITLE_THRESHOLD && (
    tokensOverlap >= LEXICAL_TOKEN_THRESHOLD ||
    contentSimilarity >= LEXICAL_CONTENT_THRESHOLD
  );
};

const shouldMarkAsDuplicate = ({ semanticSimilarity, titleSimilarity, tokensOverlap, contentSimilarity }) => {
  const semanticPass = semanticSimilarity >= SEMANTIC_THRESHOLD && (
    titleSimilarity >= TITLE_THRESHOLD ||
    tokensOverlap >= TOKEN_OVERLAP_THRESHOLD ||
    contentSimilarity >= CONTENT_SIMILARITY_THRESHOLD
  );

  return semanticPass || shouldMarkAsDuplicateLexical({ titleSimilarity, tokensOverlap, contentSimilarity });
};

const attachCandidateEmbeddings = async (candidates = []) => {
  if (!Array.isArray(candidates) || candidates.length === 0) {
    return candidates.map((candidate) => ({
      candidate,
      embedding: parseEmbedding(candidate.contentEmbedding),
    }));
  }

  const withEmbedding = candidates.map((candidate) => ({
    candidate,
    embedding: parseEmbedding(candidate.contentEmbedding),
  }));

  const missing = withEmbedding.filter((item) => !item.embedding);
  if (missing.length === 0) {
    return withEmbedding;
  }

  const missingTexts = missing.map(({ candidate }) => `${candidate.title || ""}\n${candidate.description || ""}`);
  const generated = await getTextEmbeddingsBatch(missingTexts);

  await Promise.all(
    missing.map(async ({ candidate }, index) => {
      const embedding = generated[index] || null;
      if (!embedding) {
        return;
      }

      await candidate.update({ contentEmbedding: JSON.stringify(embedding) });
    })
  );

  return withEmbedding.map((item, index) => {
    if (item.embedding) {
      return item;
    }

    const missingIndex = missing.findIndex(({ candidate }) => candidate.id === item.candidate.id);
    const embedding = missingIndex >= 0 ? (generated[missingIndex] || null) : null;

    return {
      ...item,
      embedding,
    };
  });
};

const getRecentApprovedCandidates = async (post) => {
  const lookbackStart = new Date(Date.now() - DUPLICATE_LOOKBACK_DAYS * 24 * 60 * 60 * 1000);

  return ForumPost.findAll({
    where: {
      id: { [Op.ne]: post.id },
      isActive: true,
      aiModerationStatus: "approved",
      createdAt: { [Op.gte]: lookbackStart },
    },
    attributes: ["id", "title", "description", "contentEmbedding", "createdAt"],
    order: [["createdAt", "ASC"]],
    limit: 200,
  });
};

const evaluateNearDuplicate = async (post) => {
  const candidates = await getRecentApprovedCandidates(post);
  if (candidates.length === 0) {
    return null;
  }

  const postText = `${post.title || ""}\n${post.description || ""}`;
  let sourceEmbedding = parseEmbedding(post.contentEmbedding);

  if (!sourceEmbedding) {
    sourceEmbedding = await getTextEmbedding(postText);
  }

  const candidatesWithEmbeddings = await attachCandidateEmbeddings(candidates);

  let bestMatch = null;

  for (const { candidate, embedding: candidateEmbedding } of candidatesWithEmbeddings) {
    const semanticSimilarity = sourceEmbedding && candidateEmbedding
      ? cosineSimilarity(sourceEmbedding, candidateEmbedding)
      : 0;
    const titleSimilarity = trigramSimilarity(post.title, candidate.title);
    const candidateText = `${candidate.title || ""}\n${candidate.description || ""}`;
    const tokensOverlap = tokenOverlap(postText, candidateText);
    const contentSimilarity = trigramSimilarity(postText, candidateText);

    const isDuplicate = shouldMarkAsDuplicate({
      semanticSimilarity,
      titleSimilarity,
      tokensOverlap,
      contentSimilarity,
    });

    if (!isDuplicate) {
      continue;
    }

    const score =
      semanticSimilarity * 0.7 +
      titleSimilarity * 0.15 +
      tokensOverlap * 0.1 +
      contentSimilarity * 0.05;

    if (!bestMatch || score > bestMatch.rankingScore) {
      bestMatch = {
        candidate,
        semanticSimilarity,
        titleSimilarity,
        tokensOverlap,
        contentSimilarity,
        confidence: Math.max(
          semanticSimilarity,
          (titleSimilarity + tokensOverlap + contentSimilarity) / 3
        ),
        rankingScore: score,
      };
    }
  }

  if (!bestMatch) {
    return null;
  }

  return {
    ...bestMatch,
    sourceEmbedding,
  };
};

const markPostAsDuplicate = ({ post, canonicalPost, semanticSimilarity, titleSimilarity, tokensOverlap, contentSimilarity = 0, confidence = null }) => {
  const reason = `Similar question already answered in post ${canonicalPost.id}`;
  const resolvedConfidence = Number.isFinite(confidence)
    ? confidence
    : Math.max(semanticSimilarity, (titleSimilarity + tokensOverlap + contentSimilarity) / 3);

  return Promise.all([
    post.update({
      isActive: false,
      moderationReason: reason,
      duplicateCheckStatus: "duplicate",
      duplicateCheckReason: `semantic=${semanticSimilarity.toFixed(3)}, title=${titleSimilarity.toFixed(3)}, tokenOverlap=${tokensOverlap.toFixed(3)}, content=${contentSimilarity.toFixed(3)}`,
      duplicateOfPostId: canonicalPost.id,
      duplicateConfidence: resolvedConfidence,
    }),
    notificationService.sendToUser(post.authorUserId, {
      type: "general",
      title: "Similar question already exists",
      message: "Your post was marked as duplicate. We linked the original thread for you.",
      data: {
        source: "forum_duplicate_detector",
        postId: post.id,
        duplicateOfPostId: canonicalPost.id,
        confidence: resolvedConfidence,
      },
      actionUrl: `/forum/${canonicalPost.id}`,
      priority: "medium",
      sendPush: true,
    }),
  ]);
};

const processDuplicateQueue = async () => {
  const queuedPosts = await ForumPost.findAll({
    where: {
      isActive: true,
      aiModerationStatus: "approved",
      duplicateCheckStatus: {
        [Op.in]: ["pending", "error"],
      },
    },
    order: [["createdAt", "ASC"]],
    limit: DUPLICATE_BATCH_SIZE,
  });

  for (const post of queuedPosts) {
    try {
      await post.update({ duplicateCheckStatus: "processing" });

      const fingerprint = createFingerprint({ title: post.title, description: post.description });
      const postText = `${post.title || ""}\n${post.description || ""}`;

      let embedding = parseEmbedding(post.contentEmbedding);
      if (!embedding) {
        embedding = await getTextEmbedding(postText);
      }

      const exactMatches = await findExactDuplicateCandidates({
        hash: fingerprint.hash,
        excludePostId: post.id,
        limit: 1,
      });

      let fallbackExactMatches = [];
      if (exactMatches.length === 0) {
        const recentCandidates = await getRecentApprovedCandidates(post);
        fallbackExactMatches = await findExactDuplicateCandidatesByContent({
          post,
          candidates: recentCandidates,
        });
      }

      if (exactMatches.length > 0 || fallbackExactMatches.length > 0) {
        const canonical = exactMatches[0] || fallbackExactMatches[0];
        await markPostAsDuplicate({
          post,
          canonicalPost: canonical,
          semanticSimilarity: 1,
          titleSimilarity: 1,
          tokensOverlap: 1,
          contentSimilarity: 1,
        });
        continue;
      }

      const nearDuplicate = await evaluateNearDuplicate({
        ...post.toJSON(),
        contentEmbedding: embedding ? JSON.stringify(embedding) : post.contentEmbedding,
      });

      if (nearDuplicate) {
        await markPostAsDuplicate({
          post,
          canonicalPost: nearDuplicate.candidate,
          semanticSimilarity: nearDuplicate.semanticSimilarity,
          titleSimilarity: nearDuplicate.titleSimilarity,
          tokensOverlap: nearDuplicate.tokensOverlap,
          contentSimilarity: nearDuplicate.contentSimilarity,
          confidence: nearDuplicate.confidence,
        });
        continue;
      }

      await post.update({
        duplicateCheckStatus: "clean",
        duplicateCheckReason: null,
        contentFingerprint: fingerprint.hash,
        titleNormalized: fingerprint.normalizedTitle,
        contentEmbedding: embedding ? JSON.stringify(embedding) : post.contentEmbedding,
        duplicateOfPostId: null,
        duplicateConfidence: null,
      });
    } catch (error) {
      console.error("[ForumDuplicate] Queue item failed:", error?.message || error);
      await post.update({
        duplicateCheckStatus: "error",
        duplicateCheckReason: error?.message || "Duplicate check failed",
      });
    }
  }
};

const runForumDuplicateCycle = async () => {
  if (running) return;
  running = true;

  try {
    await processDuplicateQueue();
  } catch (error) {
    console.error("[ForumDuplicate] Cycle failed:", error?.message || error);
  } finally {
    running = false;
  }
};

const startForumDuplicateWorker = () => {
  if (duplicateTimer) {
    return;
  }

  duplicateTimer = setInterval(runForumDuplicateCycle, DUPLICATE_INTERVAL_MS);
  runForumDuplicateCycle().catch(() => {});
  console.log(`[ForumDuplicate] Worker started (every ${DUPLICATE_INTERVAL_MS}ms)`);
};

module.exports = {
  buildDuplicateResponsePayload,
  checkExactDuplicateBeforeCreate,
  createFingerprint,
  findExactDuplicateMatches,
  runForumDuplicateCycle,
  startForumDuplicateWorker,
};
