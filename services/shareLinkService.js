const DEFAULT_WEB_BASE_URL = "http://localhost:3000";
const DEFAULT_ANDROID_PACKAGE = "com.graho";
const DEFAULT_PLAY_STORE_URL =
  "https://play.google.com/store/apps/details?id=com.graho";

const SHARE_TYPES = {
  kundli: {
    label: "Kundli",
    title: "Kundli shared on Graho",
    description: "Open this kundli in Graho.",
    websitePath: id => `/kundliReport?id=${encodeURIComponent(id)}`,
    appPath: id => `/s/kundli/${encodeURIComponent(id)}`,
  },
  matching: {
    label: "Kundli Matching",
    title: "Matching report shared on Graho",
    description: "Open this compatibility report in Graho.",
    websitePath: id => `/kundli-matching/report?id=${encodeURIComponent(id)}`,
    appPath: id => `/s/matching/${encodeURIComponent(id)}`,
  },
  horoscope: {
    label: "Horoscope",
    title: "Horoscope shared on Graho",
    description: "Read this horoscope on Graho.",
    websitePath: id => `/horoscope/${encodeURIComponent(id)}`,
    appPath: id => `/s/horoscope/${encodeURIComponent(id)}`,
  },
  discussion: {
    label: "Discussion",
    title: "Discussion shared on Graho",
    description: "Join this Graho community discussion.",
    websitePath: id => `/forum/${encodeURIComponent(id)}`,
    appPath: id => `/s/discussion/${encodeURIComponent(id)}`,
  },
  report: {
    label: "Report",
    title: "Report shared on Graho",
    description: "Open this astrology report on Graho.",
    websitePath: () => `/reports`,
    appPath: id => `/s/report/${encodeURIComponent(id)}`,
  },
  astrologer: {
    label: "Astrologer",
    title: "Astrologer shared on Graho",
    description: "View this astrologer profile on Graho.",
    websitePath: id => `/astrologer/${encodeURIComponent(id)}`,
    appPath: id => `/s/astrologer/${encodeURIComponent(id)}`,
  },
  product: {
    label: "Graho Store Product",
    title: "Product shared from Graho Store",
    description: "View this product in Graho Store.",
    websitePath: () => `/store`,
    appPath: id => `/s/product/${encodeURIComponent(id)}`,
  },
  blog: {
    label: "Blog",
    title: "Blog shared on Graho",
    description: "Read this Graho blog.",
    websitePath: id => `/blog/${encodeURIComponent(id)}`,
    appPath: id => `/s/blog/${encodeURIComponent(id)}`,
  },
  app: {
    label: "Graho App",
    title: "Graho",
    description: "Open Graho for astrology, kundli, reports, and consultations.",
    websitePath: () => `/`,
    appPath: () => `/s/app`,
  },
};

const trimTrailingSlash = value => String(value || "").replace(/\/+$/, "");

const getWebBaseUrl = () =>
  trimTrailingSlash(
    process.env.SHARE_WEB_BASE_URL ||
      process.env.FRONTEND_URL ||
      DEFAULT_WEB_BASE_URL,
  );

const getPlayStoreUrl = () =>
  process.env.PLAYSTORE_URL || process.env.PLAY_STORE_URL || DEFAULT_PLAY_STORE_URL;

const getAndroidPackage = () =>
  process.env.ANDROID_PACKAGE_NAME || DEFAULT_ANDROID_PACKAGE;

const normalizeShareType = type => String(type || "").trim().toLowerCase();

const getShareTypeConfig = type => SHARE_TYPES[normalizeShareType(type)] || null;

const buildShareLink = (type, rawId = "") => {
  const normalizedType = normalizeShareType(type);
  const config = getShareTypeConfig(normalizedType);

  if (!config) {
    return null;
  }

  const id = String(rawId || "").trim();
  if (normalizedType !== "app" && !id) {
    return null;
  }

  const webBaseUrl = getWebBaseUrl();
  const sharePath =
    normalizedType === "app"
      ? "/s/app"
      : `/s/${encodeURIComponent(normalizedType)}/${encodeURIComponent(id)}`;
  const webPath = config.websitePath(id);
  const appPath = config.appPath(id);
  const shareUrl = `${webBaseUrl}${sharePath}`;
  const webUrl = `${webBaseUrl}${webPath}`;
  const playStoreUrl = getPlayStoreUrl();
  const androidPackage = getAndroidPackage();
  const fallbackUrl = encodeURIComponent(shareUrl);
  const androidIntentUrl = `intent://${appPath.replace(/^\/+/, "")}#Intent;scheme=https;package=${androidPackage};S.browser_fallback_url=${fallbackUrl};end`;

  return {
    success: true,
    type: normalizedType,
    id,
    label: config.label,
    title: config.title,
    description: config.description,
    shareUrl,
    webUrl,
    appUrl: `graho://${appPath.replace(/^\/+/, "")}`,
    androidIntentUrl,
    playStoreUrl,
    androidPackage,
  };
};

module.exports = {
  SHARE_TYPES,
  buildShareLink,
  getShareTypeConfig,
};
