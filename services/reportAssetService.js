const fs = require("fs");
const path = require("path");

const BACKEND_IMAGES_DIR = path.resolve(__dirname, "../images");
const FRONTEND_IMAGES_DIR = path.resolve(__dirname, "../../Frontend-server/public/images");

const IMAGE_EXTENSIONS = [".png", ".jpg", ".jpeg", ".webp"];

/**
 * Convert a local image file to a Base64 data URI.
 * Searches backend images folder first, then frontend public images.
 */
const imageToDataUri = (fileName) => {
  try {
    const parsed = path.parse(fileName);
    const candidates = [];

    // Exact file in backend images
    candidates.push(path.join(BACKEND_IMAGES_DIR, fileName));
    // Extension variants in backend images
    for (const ext of IMAGE_EXTENSIONS) {
      candidates.push(path.join(BACKEND_IMAGES_DIR, `${parsed.name}${ext}`));
    }
    // Exact file in frontend public images
    candidates.push(path.join(FRONTEND_IMAGES_DIR, fileName));
    // Extension variants in frontend public images
    for (const ext of IMAGE_EXTENSIONS) {
      candidates.push(path.join(FRONTEND_IMAGES_DIR, `${parsed.name}${ext}`));
    }

    const fullPath = [...new Set(candidates)].find((p) => fs.existsSync(p));
    if (!fullPath) {
      console.warn("[ReportAsset] Image not found locally", { fileName });
      return "";
    }

    const buffer = fs.readFileSync(fullPath);
    const ext = path.extname(fullPath).toLowerCase();
    const mime =
      ext === ".jpg" || ext === ".jpeg"
        ? "image/jpeg"
        : ext === ".webp"
          ? "image/webp"
          : "image/png";

    return `data:${mime};base64,${buffer.toString("base64")}`;
  } catch (error) {
    console.error("[ReportAsset] Error reading local image", { fileName, message: error.message });
    return "";
  }
};

/**
 * Get a report asset as a Base64 data URI from local images folder.
 * Drop-in replacement for the old remote-fetching getReportAssetDataUri.
 */
const getReportAssetDataUri = (fileName, options = {}) => {
  const result = imageToDataUri(fileName);
  if (!result) {
    const label = options.label || options.reportType || "Report Asset";
    console.warn(`[${label}] Local report asset not found`, {
      fileName,
      searchedIn: [BACKEND_IMAGES_DIR, FRONTEND_IMAGES_DIR],
    });
  }
  return result;
};

/**
 * Get multiple report assets as a { fileName: dataUri } map.
 */
const getReportAssetDataUris = (files, options = {}) => {
  return Object.fromEntries(
    files.map((fileName) => [fileName, getReportAssetDataUri(fileName, options)])
  );
};

/**
 * Load the shared closing page assets (logo, QR code, app store badges).
 */
const loadSharedReportClosingAssets = () => ({
  logo: getReportAssetDataUri("logo.png", { label: "Shared Closing Page" }),
  qrCode: getReportAssetDataUri("QR.png", { label: "Shared Closing Page" }),
  googlePlayBadge: getReportAssetDataUri("googleplay.png", { label: "Shared Closing Page" }),
  appStoreBadge: getReportAssetDataUri("appstore.png", { label: "Shared Closing Page" }),
});

module.exports = {
  getReportAssetDataUri,
  getReportAssetDataUris,
  loadSharedReportClosingAssets,
};
