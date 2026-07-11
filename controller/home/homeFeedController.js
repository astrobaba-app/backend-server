/**
 * homeFeedController.js
 *
 * Aggregated home feed endpoint for Graho mobile app.
 *
 * Design:
 *  - ONE endpoint replaces 4 separate API calls from the home screen.
 *  - All 4 data sources are fetched in parallel via Promise.all.
 *  - Split-TTL Redis caching strategy:
 *      • Static content (blogs, products, discussions) — 10 minutes TTL
 *      • Astrologers (isOnline changes rapidly)         —  30 seconds TTL
 *  - Graceful Redis fallback: if Upstash is unreachable we still hit the DB
 *    directly and return a valid response. The app never crashes.
 *  - Strict attribute projection: only the fields required for home-screen
 *    preview cards are selected — no full payloads.
 */

const Blog = require("../../model/blog/blog");
const Astrologer = require("../../model/astrologer/astrologer");
const Product = require("../../model/store/product");
const ForumPost = require("../../model/forum/forumPost");
const redis = require("../../config/redis/redis");
const AdminSettings = require("../../model/admin/adminSettings");

// ─── Cache keys & TTLs ────────────────────────────────────────────────────────
const STATIC_CACHE_KEY = "home:feed:static:v2";   // blogs + products + discussions
const ASTRO_CACHE_KEY = "home:feed:astro:v1";    // astrologers (isOnline sensitive)
const STATIC_TTL_SEC = 10 * 60;                 // 10 minutes
const ASTRO_TTL_SEC = 30;                       // 30 seconds

// ─── Home-card limits ─────────────────────────────────────────────────────────
const ASTRO_LIMIT = 3;
const BLOG_LIMIT = 2;
const DISCUSSION_LIMIT = 1;
const PRODUCT_LIMIT = 6;

// ─── Helpers ──────────────────────────────────────────────────────────────────

/**
 * Safely read from Redis. Returns null (not an exception) on any failure
 * so callers can fall through to the DB without crashing.
 */
const safeRedisGet = async (key) => {
  try {
    const raw = await redis.get(key);
    if (!raw) return null;
    return typeof raw === "string" ? JSON.parse(raw) : raw;
  } catch (err) {
    console.warn(`[HomeFeed] Redis GET "${key}" failed (falling back to DB):`, err.message);
    return null;
  }
};

/**
 * Safely write to Redis with ex (expire) option.
 * Runs fire-and-forget — never blocks the response.
 */
const safeRedisSet = (key, value, ttlSec) => {
  try {
    redis
      .set(key, JSON.stringify(value), { ex: ttlSec })
      .catch((err) =>
        console.warn(`[HomeFeed] Redis SET "${key}" failed:`, err.message)
      );
  } catch (err) {
    console.warn(`[HomeFeed] Redis SET "${key}" sync error:`, err.message);
  }
};

// ─── DB fetch functions ───────────────────────────────────────────────────────

const fetchStaticFromDB = async () => {
  const [blogs, products, discussions] = await Promise.all([
    // Latest 4 published blogs — only preview fields
    Blog.findAll({
      where: { isPublished: true },
      attributes: ["id", "title", "image", "category", "createdAt"],
      include: [
        {
          model: Astrologer,
          as: "astrologer",
          attributes: ["fullName", "photo"],
          required: false,
        },
      ],
      order: [["createdAt", "DESC"]],
      limit: BLOG_LIMIT,
    }),

    // Top 4 featured products — only preview fields
    Product.findAll({
      where: { isActive: true, isFeatured: true },
      attributes: [
        "id",
        "productName",
        "slug",
        "price",
        "discountPrice",
        "images",
        "category",
      ],
      order: [["createdAt", "DESC"]],
      limit: PRODUCT_LIMIT,
    }),

    // Latest active discussions — all fields for preview card
    ForumPost.findAll({
      where: { isActive: true },
      attributes: [
        "id",
        "authorUserId",
        "title",
        "description",
        "image",
        "images",
        "tags",
        "authorDisplayMode",
        "authorName",
        "authorAvatarSeed",
        "authorAnonymousHash",
        "likeCount",
        "commentCount",
        "shareCount",
        "createdAt",
      ],
      order: [["createdAt", "DESC"]],
      limit: DISCUSSION_LIMIT,
    }),
  ]);

  return {
    blogs: blogs.map((b) => b.toJSON()),
    products: products.map((p) => p.toJSON()),
    discussions: discussions.map((d) => d.toJSON()),
  };
};

const fetchAstrologersFromDB = async () => {
  const astrologers = await Astrologer.findAll({
    where: { isApproved: true, isActive: true },
    attributes: [
      "id",
      "fullName",
      "photo",
      "rating",
      "pricePerMinute",
      "isOnline",
      "skills",
      "yearsOfExperience",
    ],
    // Online-first, then by rating
    order: [
      ["isOnline", "DESC"],
      ["rating", "DESC"],
    ],
    limit: ASTRO_LIMIT,
  });

  return astrologers.map((a) => a.toJSON());
};

// ─── Controller ───────────────────────────────────────────────────────────────

/**
 * GET /api/home/feed
 *
 * Public endpoint — no auth required. Combines all 4 home-screen data
 * sources into a single lightweight JSON response.
 *
 * Response shape:
 * {
 *   success: true,
 *   astrologers: [...],
 *   blogs:       [...],
 *   discussions: [...],
 *   products:    [...],
 *   meta: { cachedAt, astrologersCachedAt }
 * }
 */
const getHomeFeed = async (req, res) => {
  try {
    const now = new Date().toISOString();

    // ── 1. Try both caches in parallel ──────────────────────────────────────
    const [cachedStatic, cachedAstro] = await Promise.all([
      safeRedisGet(STATIC_CACHE_KEY),
      safeRedisGet(ASTRO_CACHE_KEY),
    ]);

    // ── 2. Resolve each source (cache hit or DB fallback) ───────────────────
    let staticData;
    let astrologers;
    let staticCachedAt = null;
    let astroCachedAt = null;

    if (cachedStatic) {
      staticData = cachedStatic.data;
      staticCachedAt = cachedStatic.cachedAt;
    } else {
      staticData = await fetchStaticFromDB();
      // Fire-and-forget cache write — doesn't block the response
      safeRedisSet(STATIC_CACHE_KEY, { data: staticData, cachedAt: now }, STATIC_TTL_SEC);
    }

    if (cachedAstro) {
      astrologers = cachedAstro.data;
      astroCachedAt = cachedAstro.cachedAt;
    } else {
      astrologers = await fetchAstrologersFromDB();
      // Fire-and-forget cache write
      safeRedisSet(ASTRO_CACHE_KEY, { data: astrologers, cachedAt: now }, ASTRO_TTL_SEC);
    }

    // ── 3. Check for authorization header and dynamically annotate isLikedByCurrentUser ──
    let userId = null;
    const authHeader = req.headers.authorization || req.headers.Authorization;
    if (authHeader && authHeader.startsWith("Bearer ")) {
      const token = authHeader.substring(7);
      const { validateToken } = require("../../services/authService");
      const decoded = validateToken(token);
      if (decoded && decoded.id) {
        userId = decoded.id;
      }
    }

    const discussions = staticData.discussions || [];
    let likedPostIds = new Set();
    if (userId && discussions.length > 0) {
      const ForumPostLike = require("../../model/forum/forumPostLike");
      const likes = await ForumPostLike.findAll({
        where: {
          userId,
          postId: discussions.map((d) => d.id),
        },
        attributes: ["postId"],
      });
      likedPostIds = new Set(likes.map((l) => l.postId));
    }

    const annotatedDiscussions = discussions.map((d) => ({
      ...d,
      isLikedByCurrentUser: likedPostIds.has(d.id),
    }));

    // ── 4. Return aggregated response ────────────────────────────────────────
    return res.status(200).json({
      success:     true,
      astrologers,
      blogs:       staticData.blogs,
      discussions: annotatedDiscussions,
      products:    staticData.products,
      meta: {
        cachedAt:            staticCachedAt  || now,
        astrologersCachedAt: astroCachedAt   || now,
      },
    });
  } catch (error) {
    console.error("[HomeFeed] getHomeFeed error:", error);
    return res.status(500).json({
      success: false,
      message: "Failed to load home feed. Please try again.",
    });
  }
};

/**
 * GET /api/home/share-settings
 *
 * Public endpoint — no auth required. Retrieves visibility settings
 * for share buttons. Falls back to true for all items on any error.
 */
const getShareSettings = async (req, res) => {
  const defaultFlags = {
    blog: true,
    astrologer: true,
    product: true,
    discussion: true,
    horoscope: true,
    report: true,
    kundli: true,
    matching: true,
    app: true,
  };

  try {
    const setting = await AdminSettings.findOne({
      where: { settingKey: "app_share_settings" },
    });

    if (!setting || !setting.isActive || !setting.settingValue) {
      return res.status(200).json({
        success: true,
        settings: defaultFlags,
      });
    }

    let parsed = {};
    try {
      parsed = JSON.parse(setting.settingValue);
    } catch (e) {
      console.warn("[HomeFeed] Failed to parse app_share_settings value:", e.message);
    }

    return res.status(200).json({
      success: true,
      settings: {
        ...defaultFlags,
        ...parsed,
      },
    });
  } catch (error) {
    console.error("[HomeFeed] getShareSettings error:", error);
    return res.status(200).json({
      success: true,
      settings: defaultFlags,
    });
  }
};

module.exports = {
  getHomeFeed,
  getShareSettings,
};
