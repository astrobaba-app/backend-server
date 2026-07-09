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

// ─── Cache keys & TTLs ────────────────────────────────────────────────────────
const STATIC_CACHE_KEY = "home:feed:static:v1";   // blogs + products + discussions
const ASTRO_CACHE_KEY  = "home:feed:astro:v1";    // astrologers (isOnline sensitive)
const STATIC_TTL_SEC   = 10 * 60;                 // 10 minutes
const ASTRO_TTL_SEC    = 30;                       // 30 seconds

// ─── Home-card limits ─────────────────────────────────────────────────────────
const ASTRO_LIMIT       = 3;
const BLOG_LIMIT        = 2;
const DISCUSSION_LIMIT  = 1;
const PRODUCT_LIMIT     = 6;

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

    // Latest 4 active discussions — only preview fields
    ForumPost.findAll({
      where: { isActive: true },
      attributes: [
        "id",
        "title",
        "authorName",
        "authorDisplayMode",
        "likeCount",
        "commentCount",
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
      ["rating",   "DESC"],
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
    let staticCachedAt   = null;
    let astroCachedAt    = null;

    if (cachedStatic) {
      staticData      = cachedStatic.data;
      staticCachedAt  = cachedStatic.cachedAt;
    } else {
      staticData = await fetchStaticFromDB();
      // Fire-and-forget cache write — doesn't block the response
      safeRedisSet(STATIC_CACHE_KEY, { data: staticData, cachedAt: now }, STATIC_TTL_SEC);
    }

    if (cachedAstro) {
      astrologers   = cachedAstro.data;
      astroCachedAt = cachedAstro.cachedAt;
    } else {
      astrologers = await fetchAstrologersFromDB();
      // Fire-and-forget cache write
      safeRedisSet(ASTRO_CACHE_KEY, { data: astrologers, cachedAt: now }, ASTRO_TTL_SEC);
    }

    // ── 3. Return aggregated response ────────────────────────────────────────
    return res.status(200).json({
      success:     true,
      astrologers,
      blogs:       staticData.blogs,
      discussions: staticData.discussions,
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

module.exports = { getHomeFeed };
