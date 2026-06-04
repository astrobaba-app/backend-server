const puppeteer = require("puppeteer");
const fs = require("fs");
const path = require("path");

const getSystemChromePath = () => {
  const candidates = [
    process.env.PUPPETEER_EXECUTABLE_PATH,
    process.env.CHROME_PATH,
    path.join(process.env.PROGRAMFILES || "", "Google", "Chrome", "Application", "chrome.exe"),
    path.join(process.env["PROGRAMFILES(X86)"] || "", "Google", "Chrome", "Application", "chrome.exe"),
    path.join(process.env.LOCALAPPDATA || "", "Google", "Chrome", "Application", "chrome.exe"),
  ].filter(Boolean);

  const matchedPath = candidates.find((candidate) => fs.existsSync(candidate));
  return matchedPath || null;
};

const getPuppeteerLaunchOptions = () => {
  const options = {
    headless: true,
    args: ["--no-sandbox", "--disable-setuid-sandbox"],
  };

  const chromePath = getSystemChromePath();
  if (chromePath) {
    options.executablePath = chromePath;
  }

  return options;
};

const SIGN_NAME_TO_NUM = {
  Aries: 1,
  Taurus: 2,
  Gemini: 3,
  Cancer: 4,
  Leo: 5,
  Virgo: 6,
  Libra: 7,
  Scorpio: 8,
  Sagittarius: 9,
  Capricorn: 10,
  Aquarius: 11,
  Pisces: 12,
};

const SIGN_NUM_TO_NAME = {
  1: "Aries",
  2: "Taurus",
  3: "Gemini",
  4: "Cancer",
  5: "Leo",
  6: "Virgo",
  7: "Libra",
  8: "Scorpio",
  9: "Sagittarius",
  10: "Capricorn",
  11: "Aquarius",
  12: "Pisces",
};

const PLANET_ABBREVIATIONS = {
  Sun: "Su",
  Moon: "Mo",
  Mars: "Ma",
  Mercury: "Me",
  Jupiter: "Ju",
  Venus: "Ve",
  Saturn: "Sa",
  Rahu: "Ra",
  Ketu: "Ke",
  Uranus: "Ur",
  Neptune: "Ne",
  Pluto: "Pl",
  Ascendant: "Asc",
};

const PLANET_COLORS = {
  Su: "#FFA500",
  Mo: "#9370DB",
  Ma: "#DC143C",
  Me: "#32CD32",
  Ju: "#DAA520",
  Ve: "#FF1493",
  Sa: "#4169E1",
  Ra: "#8B4513",
  Ke: "#A0522D",
  Ur: "#4682B4",
  Ne: "#20B2AA",
  Pl: "#DA70D6",
  Asc: "#9932CC",
};

const NORTH_INDIAN_HOUSE_POSITIONS = [
  { house: 1, x: 0.5, y: 0.25, numX: 0.5, numY: 0.42 },
  { house: 2, x: 0.25, y: 0.1, numX: 0.25, numY: 0.2 },
  { house: 3, x: 0.12, y: 0.25, numX: 0.2, numY: 0.25 },
  { house: 4, x: 0.25, y: 0.5, numX: 0.42, numY: 0.5 },
  { house: 5, x: 0.12, y: 0.75, numX: 0.2, numY: 0.75 },
  { house: 6, x: 0.25, y: 0.9, numX: 0.25, numY: 0.79 },
  { house: 7, x: 0.5, y: 0.75, numX: 0.5, numY: 0.57 },
  { house: 8, x: 0.75, y: 0.9, numX: 0.75, numY: 0.8 },
  { house: 9, x: 0.9, y: 0.75, numX: 0.8, numY: 0.75 },
  { house: 10, x: 0.75, y: 0.5, numX: 0.58, numY: 0.5 },
  { house: 11, x: 0.9, y: 0.25, numX: 0.8, numY: 0.25 },
  { house: 12, x: 0.75, y: 0.1, numX: 0.75, numY: 0.2 },
];

const toFiniteNumber = (value) => {
  const n = typeof value === "number" ? value : Number(value);
  return Number.isFinite(n) ? n : null;
};

const normalizeSignNum = (value) => {
  const n = toFiniteNumber(value);
  if (!n) return 1;
  const rounded = Math.round(n);
  const mod = ((rounded - 1) % 12 + 12) % 12;
  return mod + 1;
};

const normalizeLongitude = (longitude) => {
  const n = toFiniteNumber(longitude);
  if (n === null) return null;
  return ((n % 360) + 360) % 360;
};

const formatDegree = (decimalDegree) => {
  const n = toFiniteNumber(decimalDegree);
  const safe = n === null ? 0 : ((n % 30) + 30) % 30;
  const degrees = Math.floor(safe);
  const minutes = Math.floor((safe - degrees) * 60);
  return `${degrees}\u00b0${String(minutes).padStart(2, "0")}'`;
};

const escapeHtml = (value) => {
  return String(value ?? "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/\"/g, "&quot;")
    .replace(/'/g, "&#39;");
};

const getAscendantInfo = (kundliData) => {
  const signName =
    kundliData?.astroDetails?.ascendant?.sign ||
    kundliData?.basicDetails?.ascendant?.sign ||
    null;

  const signFromName = signName && SIGN_NAME_TO_NUM[signName] ? SIGN_NAME_TO_NUM[signName] : null;

  const signFromNum =
    toFiniteNumber(kundliData?.astroDetails?.ascendant?.sign_num) ||
    toFiniteNumber(kundliData?.basicDetails?.ascendant?.sign_num);

  const ascLongitude =
    normalizeLongitude(kundliData?.planetary?.Ascendant?.longitude) ||
    normalizeLongitude(kundliData?.planetary?.Ascendant?.original_longitude) ||
    normalizeLongitude(kundliData?.astroDetails?.ascendant?.longitude) ||
    normalizeLongitude(kundliData?.basicDetails?.ascendant?.longitude);

  const signFromLongitude = ascLongitude === null ? null : Math.floor(ascLongitude / 30) + 1;

  const ascSignNum = normalizeSignNum(signFromName || signFromNum || signFromLongitude || 1);

  const explicitDegree =
    toFiniteNumber(kundliData?.astroDetails?.ascendant?.degree) ||
    toFiniteNumber(kundliData?.basicDetails?.ascendant?.degree);

  const ascDegree =
    explicitDegree !== null
      ? ((explicitDegree % 30) + 30) % 30
      : ascLongitude !== null
        ? ascLongitude % 30
        : 0;

  return { ascSignNum, ascDegree };
};

const buildSignPlanetsMap = (kundliData, ascSignNum, ascDegree) => {
  const signPlanetsMap = new Map();
  for (let i = 1; i <= 12; i++) {
    signPlanetsMap.set(i, []);
  }

  const d1Planets = kundliData?.charts?.D1?.planets || {};
  Object.entries(d1Planets).forEach(([planetName, planetData]) => {
    const longitude = normalizeLongitude(planetData?.original_longitude ?? planetData?.longitude);
    if (longitude === null) {
      return;
    }

    const signNum = Math.floor(longitude / 30) + 1;
    const planets = signPlanetsMap.get(signNum) || [];
    const shortName = PLANET_ABBREVIATIONS[planetName] || String(planetName).substring(0, 2);

    planets.push({
      name: shortName,
      degree: longitude % 30,
      color: PLANET_COLORS[shortName] || "#333333",
    });
    signPlanetsMap.set(signNum, planets);
  });

  signPlanetsMap.forEach((planets, sign) => {
    planets.sort((a, b) => a.degree - b.degree);
    signPlanetsMap.set(sign, planets);
  });

  const ascAlreadyPresent = Array.from(signPlanetsMap.values()).some((items) =>
    items.some((planet) => planet.name === "Asc")
  );

  if (!ascAlreadyPresent) {
    const existing = signPlanetsMap.get(ascSignNum) || [];
    existing.unshift({
      name: "Asc",
      degree: ascDegree,
      color: PLANET_COLORS.Asc,
    });
    signPlanetsMap.set(ascSignNum, existing);
  }

  return signPlanetsMap;
};

const buildNorthIndianBirthChartHtml = (kundliData) => {
  const hasD1Chart = Boolean(kundliData?.charts?.D1?.planets);
  if (!hasD1Chart) {
    return '<div class="pdf-kundli-missing">Insufficient chart data to render Lagna chart</div>';
  }

  const { ascSignNum, ascDegree } = getAscendantInfo(kundliData);
  const signPlanetsMap = buildSignPlanetsMap(kundliData, ascSignNum, ascDegree);

  const houseToSignMap = {};
  for (let house = 1; house <= 12; house++) {
    houseToSignMap[house] = ((ascSignNum - 1 + (house - 1)) % 12) + 1;
  }

  const houseMarkup = NORTH_INDIAN_HOUSE_POSITIONS.map(({ house, x, y, numX, numY }) => {
    const signNum = houseToSignMap[house];
    const planets = signPlanetsMap.get(signNum) || [];
    const planetsHtml = planets
      .map(
        (planet) =>
          `<div class="pdf-kundli-planet" style="color:${planet.color}">${escapeHtml(planet.name)} ${formatDegree(planet.degree)}</div>`
      )
      .join("");

    return `
      <div class="pdf-kundli-sign" style="left:${(numX * 100).toFixed(2)}%; top:${(numY * 100).toFixed(2)}%">${signNum}</div>
      <div class="pdf-kundli-house" style="left:${(x * 100).toFixed(2)}%; top:${(y * 100).toFixed(2)}%">${planetsHtml}</div>
    `;
  }).join("");

  return `
    <div class="pdf-kundli-chart" aria-label="Lagna chart">
      <svg class="pdf-kundli-lines" viewBox="0 0 393 393" preserveAspectRatio="none">
        <rect x="0" y="0" width="393" height="393" fill="none" stroke="#2b6f6b" stroke-width="2"/>
        <line x1="0" y1="0" x2="393" y2="393" stroke="#b59d7c" stroke-width="1.2"/>
        <line x1="393" y1="0" x2="0" y2="393" stroke="#b59d7c" stroke-width="1.2"/>
        <line x1="196.5" y1="0" x2="393" y2="196.5" stroke="#b59d7c" stroke-width="1.2"/>
        <line x1="393" y1="196.5" x2="196.5" y2="393" stroke="#b59d7c" stroke-width="1.2"/>
        <line x1="196.5" y1="393" x2="0" y2="196.5" stroke="#b59d7c" stroke-width="1.2"/>
        <line x1="0" y1="196.5" x2="196.5" y2="0" stroke="#b59d7c" stroke-width="1.2"/>
      </svg>
      ${houseMarkup}
    </div>
  `;
};

/**
 * Generate PDF from Kundli report data - 8 pages A4 format
 * @param {Object} reportData - Enhanced report content from OpenAI
 * @param {Object} kundliData - Complete kundli data with charts
 * @param {Object} userDetails - User basic details
 * @returns {Promise<Buffer>} PDF buffer
 */
async function generateKundliReportPDF(reportData, kundliData, userDetails) {
  let browser = null;

  try {
    const { fullName, dateOfbirth, timeOfbirth, placeOfBirth } = userDetails;

    // Create HTML content for PDF
    const htmlContent = generateHTMLTemplate(reportData, kundliData, userDetails);

    // Launch browser
    browser = await puppeteer.launch(getPuppeteerLaunchOptions());

    const page = await browser.newPage();

    // Set content
    await page.setContent(htmlContent, {
      waitUntil: 'networkidle0'
    });

    // Generate PDF with exact A4 dimensions
    const pdfBuffer = await page.pdf({
      format: 'A4',
      printBackground: true,
      margin: {
        top: 0,
        right: 0,
        bottom: 0,
        left: 0
      }
    });

    await browser.close();

    return pdfBuffer;

  } catch (error) {
    if (browser) {
      await browser.close();
    }
    console.error("[PDF Service] Error generating PDF:", error);

    const isMissingBrowser =
      typeof error?.message === "string" &&
      (error.message.includes("Could not find Chrome") ||
        error.message.includes("Could not find Chromium"));

    if (isMissingBrowser) {
      throw new Error(
        "Failed to generate PDF: Chrome is not installed for Puppeteer. Run `npm run install:chrome` in backend-server or set PUPPETEER_EXECUTABLE_PATH."
      );
    }

    throw new Error(`Failed to generate PDF: ${error.message}`);
  }
}

/**
 * Generate HTML template for PDF - 8 pages exactly matching the reference format
 */
function generateHTMLTemplate(reportData, kundliData, userDetails) {
  const { fullName, dateOfbirth, timeOfbirth, placeOfBirth } = userDetails;

  const getBase64Image = (imageName) => {
    try {
      const paths = [
        path.join(__dirname, "..", "..", "Frontend-server", "public", "images", imageName),
        path.join(__dirname, "..", "Frontend-server", "public", "images", imageName),
        path.join(process.cwd(), "..", "Frontend-server", "public", "images", imageName),
      ];
      for (const p of paths) {
        if (fs.existsSync(p)) {
          const ext = path.extname(imageName).replace(".", "");
          const mimeType = ext === "jpg" ? "image/jpeg" : `image/${ext}`;
          const base64 = fs.readFileSync(p).toString("base64");
          return `data:${mimeType};base64,${base64}`;
        }
      }
    } catch (err) {
      console.error(`Error loading image ${imageName} for PDF:`, err);
    }
    return "";
  };

  const logoBase64 = getBase64Image("logo.png");
  const footerLogoBase64 = getBase64Image("footer_logo.png");
  const qrBase64 = getBase64Image("QR.png");
  const appStoreBase64 = getBase64Image("appstore.png");
  const googlePlayBase64 = getBase64Image("googleplay.png");

  // Create repeating watermark with Logo + Text
  const svgWatermark = `
<svg xmlns="http://www.w3.org/2000/svg" width="180" height="180" viewBox="0 0 180 180">
  <image href="${logoBase64}" x="50" y="20" width="80" height="80" />
  <text x="90" y="125" font-family="'Cormorant Garamond', Georgia, serif" font-size="20" font-weight="700" fill="#2b6f6b" text-anchor="middle" letter-spacing="0.5">Graho</text>
</svg>
  `.trim();
  const watermarkBase64 = `data:image/svg+xml;base64,${Buffer.from(svgWatermark).toString("base64")}`;

  const formatDateOfBirth = (dob) => {
    if (!dob) return "";
    try {
      const d = new Date(dob);
      if (isNaN(d.getTime())) return String(dob);
      return d.toDateString();
    } catch (e) {
      return String(dob);
    }
  };

  const rc = reportData.reportContent;
  const birthChartHtml = buildNorthIndianBirthChartHtml(kundliData);
  const { ascSignNum } = getAscendantInfo(kundliData);
  const ascSignLabel = escapeHtml(SIGN_NUM_TO_NAME[ascSignNum] || "Unknown");
  
  const reportTitleRaw = reportData?.reportContent?.reportTitle || "Vedic Astrology Report";
  const reportTypeLabel = rc.reportType === "monthly" || reportTitleRaw.toLowerCase().includes("monthly")
    ? "Monthly"
    : "Yearly";
  const reportTitle = `Vedic ${reportTypeLabel} Astrology Report`;
  const reportTypeLabelLower = reportTypeLabel.toLowerCase();

  const allKeyDates = [
    ...(rc.careerKeyDates || []).map((item) => ({ ...item, section: "Career" })),
    ...(rc.financeKeyDates || []).map((item) => ({ ...item, section: "Finance" })),
    ...(rc.relationshipKeyDates || []).map((item) => ({ ...item, section: "Relationships" })),
    ...(rc.healthKeyDates || []).map((item) => ({ ...item, section: "Health" })),
    ...(rc.spiritualKeyDates || []).map((item) => ({ ...item, section: "Spiritual" })),
    ...(rc.travelKeyDates || []).map((item) => ({ ...item, section: "Travel" })),
    ...(rc.educationKeyDates || []).map((item) => ({ ...item, section: "Education" })),
  ];

  const opportunities = allKeyDates.filter((item) => item.type === "positive");
  const risks = allKeyDates.filter((item) => item.type === "negative");

  const actionPlanGroups = [
    { title: "Career", items: rc.careerRemedies || [] },
    { title: "Finance", items: rc.financeRemedies || [] },
    { title: "Relationships", items: rc.relationshipRemedies || [] },
    { title: "Health", items: rc.healthRemedies || [] },
    { title: "Spiritual", items: rc.spiritualRemedies || [] },
    { title: "Travel", items: rc.travelRemedies || [] },
    { title: "Education", items: rc.educationRemedies || [] },
  ].filter((group) => group.items.length > 0);

  const summaryHighlights = [
    { title: "Career", text: rc.careerFinance },
    { title: "Finance", text: rc.finance },
    { title: "Relationships", text: rc.relationships },
    { title: "Health", text: rc.healthWellness },
  ];

  return `
<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <style>
    @import url('https://fonts.googleapis.com/css2?family=Cormorant+Garamond:ital,wght@0,400;0,500;0,600;0,700;1,400&family=Outfit:wght@300;400;500;600;700&display=swap');

    * {
      margin: 0;
      padding: 0;
      box-sizing: border-box;
    }
    
    body {
      font-family: 'Outfit', -apple-system, sans-serif;
      background: #f7f3ee;
      color: #2d2a26;
      line-height: 1.65;
      font-weight: 500;
      -webkit-print-color-adjust: exact;
      -webkit-font-smoothing: antialiased;
    }
    
    .page {
      width: 210mm;
      height: 297mm;
      padding: 55px 65px;
      background: #f7f3ee;
      page-break-after: always;
      position: relative;
      overflow: hidden;
    }
    
    .page:last-child {
      page-break-after: auto;
    }

    /* Subtle watermark for content pages */
    .page:not(.cover-page-style)::before {
      content: "";
      position: absolute;
      inset: 0;
      width: 100%;
      height: 100%;
      background-image: url('${watermarkBase64 || ''}');
      background-repeat: repeat;
      background-size: 150px 150px;
      opacity: 0.055;
      pointer-events: none;
      z-index: 0;
    }

    .page-header {
      display: flex;
      align-items: baseline;
      justify-content: space-between;
      margin-bottom: 24px;
      border-bottom: 1.5px solid #2b6f6b;
      padding-bottom: 8px;
    }

    .page-label {
      font-size: 10px;
      letter-spacing: 2px;
      text-transform: uppercase;
      color: #2b6f6b;
      font-weight: 700;
    }

    .page-meta {
      font-size: 10px;
      color: #6f6a63;
      letter-spacing: 1px;
      font-weight: 600;
    }
    
    /* Cover Page Styles */
    .cover-page-style {
      display: flex;
      flex-direction: column;
      justify-content: space-between;
      padding: 85px 65px 75px 65px;
    }
    
    .cover-content {
      text-align: center;
      margin-top: 40px;
    }
    
    .celestial-ornament {
      margin-bottom: 25px;
    }
    
    .cover-title {
      font-family: 'Cormorant Garamond', Georgia, serif;
      font-size: 46px;
      font-weight: 700;
      color: #2b6f6b;
      line-height: 1.2;
      letter-spacing: 1px;
      margin-bottom: 20px;
    }
    
    .cover-divider {
      width: 80px;
      height: 1px;
      background: #b59d7c;
      margin: 0 auto 25px auto;
      position: relative;
    }
    
    .cover-divider::before {
      content: "✦";
      position: absolute;
      top: 50%;
      left: 50%;
      transform: translate(-50%, -50%);
      background: #f7f3ee;
      padding: 0 8px;
      color: #b59d7c;
      font-size: 10px;
    }
    
    .cover-subtitle {
      font-family: 'Cormorant Garamond', Georgia, serif;
      font-size: 21px;
      font-style: italic;
      color: #6f6a63;
      font-weight: 500;
    }
    
    .cover-subtitle span {
      font-family: 'Outfit', sans-serif;
      font-style: normal;
      font-weight: 700;
      color: #2d2a26;
      letter-spacing: 0.5px;
    }
    
    .cover-details {
      border-top: 1.5px solid #2b6f6b;
      border-bottom: 1.5px solid #2b6f6b;
      padding: 24px 0;
      margin-top: 40px;
    }
    
    .details-heading {
      font-family: 'Cormorant Garamond', Georgia, serif;
      font-size: 20px;
      font-weight: 700;
      text-align: center;
      color: #2b6f6b;
      margin-bottom: 16px;
      letter-spacing: 1.5px;
      text-transform: uppercase;
    }
    
    .details-grid {
      display: grid;
      grid-template-columns: repeat(2, minmax(0, 1fr));
      gap: 16px;
      padding-top: 16px;
    }
    
    .details-card {
      text-align: center;
      position: relative;
    }
    
    .details-card:not(:last-child)::after {
      content: "";
      position: absolute;
      right: -8px;
      top: 10%;
      height: 80%;
      width: 1px;
      background: #e1d9cf;
    }
    
    .details-title {
      font-size: 9px;
      text-transform: uppercase;
      letter-spacing: 1.5px;
      color: #6f6a63;
      font-weight: 700;
      margin-bottom: 6px;
    }
    
    .details-value {
      font-size: 15px;
      font-weight: 700;
      color: #2d2a26;
      margin-bottom: 4px;
    }
    
    .details-note {
      font-size: 10.5px;
      color: #8a8379;
      font-weight: 600;
    }
    
    /* Overview Text */
    .overview-text {
      font-size: 13.5px;
      line-height: 1.8;
      color: #35312d;
      text-align: justify;
      margin-bottom: 25px;
      font-weight: 500;
    }
    
    .pill {
      display: inline-block;
      padding: 4px 12px;
      border-radius: 999px;
      background: #e7efee;
      color: #2b6f6b;
      font-size: 10px;
      font-weight: 700;
      text-transform: uppercase;
      letter-spacing: 1.5px;
      margin-bottom: 16px;
    }
    
    /* Grid & Cards Layout */
    .metric-grid {
      display: grid;
      grid-template-columns: repeat(2, minmax(0, 1fr));
      column-gap: 32px;
      row-gap: 24px;
      margin-top: 20px;
    }
    
    .metric-card {
      padding: 4px 0 4px 16px;
      border-left: 2.5px solid #b59d7c;
    }
    
    .metric-title {
      font-size: 11px;
      text-transform: uppercase;
      letter-spacing: 1.5px;
      color: #b59d7c;
      font-weight: 700;
      margin-bottom: 4px;
    }
    
    .metric-value {
      font-family: 'Cormorant Garamond', Georgia, serif;
      font-size: 22px;
      font-weight: 700;
      color: #2b6f6b;
      margin-bottom: 6px;
      line-height: 1.2;
    }
    
    .metric-note {
      font-size: 12.5px;
      color: #3d3934;
      line-height: 1.6;
      font-weight: 500;
    }
    
    /* Timeline styles (unboxed) */
    .timeline-list {
      display: flex;
      flex-direction: column;
      gap: 20px;
      position: relative;
      padding-left: 20px;
      margin-top: 15px;
      margin-bottom: 25px;
    }
    
    .timeline-list::before {
      content: "";
      position: absolute;
      left: 4px;
      top: 6px;
      bottom: 6px;
      width: 1px;
      background: #b59d7c;
    }
    
    .timeline-node {
      position: relative;
    }
    
    .timeline-node::before {
      content: "✦";
      position: absolute;
      left: -20px;
      top: 0;
      color: #b59d7c;
      font-size: 10px;
      line-height: 1;
      background: #f7f3ee;
      padding: 0 2px;
    }
    
    .timeline-header {
      margin-bottom: 4px;
      display: flex;
      align-items: baseline;
    }
    
    .timeline-period-title {
      font-family: 'Cormorant Garamond', Georgia, serif;
      font-size: 19px;
      font-weight: 700;
      color: #2b6f6b;
    }
    
    .timeline-period-focus {
      font-size: 11px;
      font-weight: 700;
      color: #6f6a63;
      text-transform: uppercase;
      letter-spacing: 0.5px;
      margin-left: 8px;
    }
    
    .timeline-prediction {
      font-size: 12.5px;
      color: #3d3934;
      line-height: 1.6;
      font-weight: 500;
    }
    
    .chip {
      display: inline-flex;
      align-items: center;
      gap: 6px;
      padding: 3px 10px;
      border-radius: 999px;
      font-size: 9px;
      font-weight: 700;
      text-transform: uppercase;
      letter-spacing: 1px;
      margin-bottom: 10px;
    }
    
    .chip.positive {
      background: #e7f6ec;
      color: #1f7a3f;
    }
    
    .chip.negative {
      background: #fdeceb;
      color: #b42318;
    }
    
    .card-grid {
      display: grid;
      grid-template-columns: repeat(2, minmax(0, 1fr));
      column-gap: 32px;
      row-gap: 16px;
      margin-top: 15px;
    }
    
    .info-card {
      padding: 8px 0;
      border-bottom: 1px solid #e1d9cf;
    }
    
    .info-title {
      font-family: 'Cormorant Garamond', Georgia, serif;
      font-size: 18px;
      font-weight: 700;
      margin-bottom: 4px;
      color: #2b6f6b;
    }
    
    .info-meta {
      font-size: 9px;
      text-transform: uppercase;
      letter-spacing: 1.5px;
      color: #b59d7c;
      font-weight: 700;
      margin-bottom: 4px;
    }
    
    .info-text {
      font-size: 12.5px;
      color: #3d3934;
      line-height: 1.5;
      font-weight: 500;
    }
    
    /* Opportunities & Risks columns */
    .opp-risk-columns {
      display: grid;
      grid-template-columns: 1fr 1fr;
      gap: 40px;
      margin-top: 20px;
    }
    
    .column-header {
      font-family: 'Cormorant Garamond', Georgia, serif;
      font-size: 22px;
      font-weight: 700;
      padding-bottom: 6px;
      margin-bottom: 16px;
      letter-spacing: 0.5px;
    }
    
    .column-header.positive {
      color: #1f7a3f;
      border-bottom: 2px solid #e7f6ec;
    }
    
    .column-header.negative {
      color: #b42318;
      border-bottom: 2px solid #fdeceb;
    }
    
    .opp-risk-entry {
      padding: 10px 0;
      border-bottom: 1px solid #e1d9cf;
    }
    
    .opp-risk-entry:last-child {
      border-bottom: none;
    }
    
    .entry-meta-row {
      display: flex;
      justify-content: space-between;
      align-items: baseline;
      margin-bottom: 4px;
    }
    
    .entry-section {
      font-size: 9px;
      font-weight: 700;
      text-transform: uppercase;
      letter-spacing: 1.5px;
      color: #b59d7c;
    }
    
    .entry-date {
      font-size: 12.5px;
      font-weight: 600;
      color: #2b6f6b;
    }
    
    .entry-desc {
      font-size: 12.5px;
      color: #3d3934;
      line-height: 1.5;
      font-weight: 500;
    }
    
    .action-grid {
      display: grid;
      grid-template-columns: repeat(2, minmax(0, 1fr));
      column-gap: 40px;
      row-gap: 24px;
      margin-top: 15px;
    }
    
    .action-group {
      padding: 4px 0 10px 0;
    }
    
    .action-group h4 {
      font-family: 'Cormorant Garamond', Georgia, serif;
      font-size: 19px;
      font-weight: 700;
      margin-bottom: 10px;
      color: #2b6f6b;
      letter-spacing: 0.5px;
      text-transform: uppercase;
      border-bottom: 1.5px solid #b59d7c;
      padding-bottom: 4px;
    }
    
    .action-group ul {
      list-style: none;
      padding-left: 0;
    }
    
    .action-group li {
      font-size: 12.5px;
      color: #3d3934;
      margin-bottom: 6px;
      padding-left: 14px;
      position: relative;
      line-height: 1.5;
      font-weight: 500;
    }
    
    .action-group li:before {
      content: "✦";
      position: absolute;
      left: 0;
      color: #b59d7c;
      font-size: 8px;
      top: 1px;
    }
    
    /* Chart Section */
    .chart-section {
      padding: 20px 0;
      text-align: center;
    }
    
    .chart-title {
      font-family: 'Cormorant Garamond', Georgia, serif;
      font-size: 26px;
      font-weight: 700;
      color: #2d2a26;
      margin-bottom: 20px;
      letter-spacing: 0.5px;
    }
    
    .pdf-kundli-shell {
      margin: 0 auto;
      width: 100%;
      max-width: 460px;
    }
    
    .pdf-kundli-subtitle {
      font-family: 'Cormorant Garamond', Georgia, serif;
      color: #2b6f6b;
      font-size: 18px;
      font-weight: 700;
      margin-bottom: 12px;
      letter-spacing: 0.5px;
    }
    
    .pdf-kundli-chart {
      width: 360px;
      height: 360px;
      margin: 0 auto;
      position: relative;
      background: transparent;
    }
    
    .pdf-kundli-lines {
      position: absolute;
      inset: 0;
      width: 100%;
      height: 100%;
      pointer-events: none;
    }
    
    .pdf-kundli-sign {
      position: absolute;
      transform: translate(-50%, -50%);
      color: #8a8379;
      font-size: 11px;
      font-weight: 700;
      line-height: 1;
    }
    
    .pdf-kundli-house {
      position: absolute;
      transform: translate(-50%, -50%);
      width: 22%;
      display: flex;
      flex-direction: column;
      align-items: center;
      gap: 2px;
      text-align: center;
    }
    
    .pdf-kundli-planet {
      font-size: 10px;
      line-height: 1.2;
      font-weight: 700;
      white-space: nowrap;
    }
    
    .pdf-kundli-missing {
      width: 360px;
      height: 360px;
      margin: 0 auto;
      display: flex;
      align-items: center;
      justify-content: center;
      background: #fcf8e3;
      color: #4c4c4c;
      font-size: 14px;
      font-weight: 600;
      border: 1.5px solid #e1d9cf;
      border-radius: 8px;
    }
    
    .chart-note {
      font-size: 12.5px;
      color: #6f6a63;
      margin-top: 12px;
      font-style: italic;
      font-weight: 600;
    }
    
    /* Content Page Titles */
    .section-title {
      font-family: 'Cormorant Garamond', Georgia, serif;
      font-size: 32px;
      font-weight: 700;
      color: #2b6f6b;
      margin-bottom: 20px;
      border-bottom: 1.5px solid #b59d7c;
      padding-bottom: 6px;
      letter-spacing: 0.5px;
    }
    
    .description-text {
      font-size: 13.5px;
      line-height: 1.8;
      color: #35312d;
      text-align: justify;
      margin-bottom: 20px;
      font-weight: 500;
    }
    
    /* Tables */
    .period-table {
      width: 100%;
      border-collapse: collapse;
      margin: 15px 0 25px 0;
    }
    
    .period-table thead {
      border-top: 1.5px solid #2b6f6b;
      border-bottom: 1.5px solid #2b6f6b;
    }
    
    .period-table th {
      padding: 10px 12px;
      text-align: left;
      font-size: 11px;
      font-weight: 700;
      color: #2b6f6b;
      text-transform: uppercase;
      letter-spacing: 1px;
    }
    
    .period-table td {
      padding: 10px 12px;
      font-size: 12px;
      color: #35312d;
      border-bottom: 1px solid #e1d9cf;
      line-height: 1.5;
      font-weight: 500;
    }
    
    .period-table tbody tr:last-child td {
      border-bottom: 1.5px solid #2b6f6b;
    }
    
    .key-dates-title {
      font-family: 'Cormorant Garamond', Georgia, serif;
      font-size: 22px;
      font-weight: 700;
      color: #2d2a26;
      margin: 25px 0 12px 0;
      letter-spacing: 0.5px;
    }
    
    .date-list {
      margin-bottom: 20px;
    }
    
    .date-entry {
      padding: 12px 0;
      border-bottom: 1px solid #e1d9cf;
    }
    
    .date-entry:last-child {
      border-bottom: none;
    }
    
    .date-header {
      display: flex;
      justify-content: space-between;
      align-items: center;
      margin-bottom: 4px;
    }
    
    .date-title {
      font-family: 'Cormorant Garamond', Georgia, serif;
      font-size: 16px;
      font-weight: 700;
      color: #2b6f6b;
    }
    
    .date-badge {
      font-size: 9px;
      font-weight: 700;
      text-transform: uppercase;
      letter-spacing: 1px;
      padding: 2px 8px;
      border-radius: 4px;
    }
    
    .date-badge.positive {
      background: #e7f6ec;
      color: #1f7a3f;
    }
    
    .date-badge.negative {
      background: #fdeceb;
      color: #b42318;
    }
    
    .date-desc {
      font-size: 12.5px;
      color: #3d3934;
      line-height: 1.5;
      font-weight: 500;
    }
    
    .remedies-section {
      margin-top: 25px;
      padding: 15px 0 0 0;
      border-top: 1.5px solid #b59d7c;
    }
    
    .remedies-title {
      font-family: 'Cormorant Garamond', Georgia, serif;
      font-size: 19px;
      font-weight: 700;
      color: #2b6f6b;
      margin-bottom: 10px;
      letter-spacing: 0.5px;
      text-transform: uppercase;
    }
    
    .remedies-list {
      list-style: none;
    }
    
    .remedies-list li {
      font-size: 12.5px;
      color: #3d3934;
      padding: 4px 0;
      padding-left: 16px;
      position: relative;
      line-height: 1.5;
      font-weight: 500;
    }
    
    .remedies-list li:before {
      content: "✦";
      position: absolute;
      left: 0;
      color: #b59d7c;
      font-size: 8px;
      top: 1px;
    }

    /* Custom ornaments/dividers */
    .section-divider {
      display: flex;
      align-items: center;
      justify-content: center;
      margin: 20px 0;
    }
    
    .divider-line {
      height: 1px;
      background: #e1d9cf;
      flex-grow: 1;
    }
    
    .divider-star {
      margin: 0 10px;
      color: #b59d7c;
      font-size: 10px;
    }

    /* Page 12: Graho Details Page */
    .graho-about-container {
      display: flex;
      flex-direction: column;
      height: calc(100% - 60px);
      justify-content: space-between;
      margin-top: 10px;
    }
    
    .graho-brand-section {
      text-align: center;
      margin-bottom: 20px;
      padding: 15px 0;
      border-bottom: 1.5px solid #b59d7c;
    }
    
    .graho-logo {
      height: 60px;
      width: auto;
      object-fit: contain;
      margin-bottom: 8px;
    }
    
    .graho-title {
      font-family: 'Cormorant Garamond', Georgia, serif;
      font-size: 26px;
      font-weight: 700;
      color: #2b6f6b;
      margin-bottom: 2px;
    }
    
    .graho-tagline {
      font-size: 12px;
      font-style: italic;
      color: #6f6a63;
      font-weight: 500;
    }
    
    .graho-details-grid {
      display: grid;
      grid-template-columns: 1fr 1fr;
      gap: 24px;
      margin-bottom: 20px;
    }
    
    .graho-card {
      background: #fdfcfb;
      border: 1.5px solid #e1d9cf;
      border-radius: 8px;
      padding: 18px;
    }
    
    .graho-card-title {
      font-family: 'Cormorant Garamond', Georgia, serif;
      font-size: 17px;
      font-weight: 700;
      color: #2b6f6b;
      margin-bottom: 10px;
      border-bottom: 1.5px solid #b59d7c;
      padding-bottom: 4px;
      text-transform: uppercase;
      letter-spacing: 0.5px;
    }
    
    .graho-list {
      list-style: none;
      padding: 0;
      margin: 0;
    }
    
    .graho-list-item {
      font-size: 12px;
      color: #3d3934;
      margin-bottom: 8px;
      display: flex;
      align-items: center;
      gap: 8px;
    }
    
    .graho-list-item a {
      color: #3d3934;
      text-decoration: none;
      font-weight: 600;
    }
    
    .graho-list-item-bullet {
      color: #b59d7c;
      font-size: 8px;
    }
    
    .graho-qr-container {
      display: flex;
      align-items: center;
      gap: 20px;
      background: #e7efee;
      border: 1px solid #c9dbd9;
      border-radius: 8px;
      padding: 16px 20px;
      margin-bottom: 20px;
    }
    
    .graho-qr-image-wrapper {
      width: 80px;
      height: 80px;
      background: white;
      padding: 4px;
      border-radius: 6px;
      border: 1px solid #d4c9bc;
      display: flex;
      align-items: center;
      justify-content: center;
      flex-shrink: 0;
    }
    
    .graho-qr-image {
      width: 100%;
      height: 100%;
      object-fit: contain;
    }
    
    .graho-qr-text {
      flex: 1;
    }
    
    .graho-qr-title {
      font-size: 14px;
      font-weight: 700;
      color: #2b6f6b;
      margin-bottom: 2px;
    }
    
    .graho-qr-desc {
      font-size: 11px;
      color: #55524d;
      margin-bottom: 8px;
      font-weight: 600;
    }
    
    .graho-app-badges {
      display: flex;
      gap: 10px;
    }
    
    .graho-app-badge {
      height: 28px;
      width: auto;
      object-fit: contain;
    }
    
    .graho-footer {
      text-align: center;
      border-top: 1.5px solid #2b6f6b;
      padding-top: 12px;
      margin-top: auto;
    }
    
    .graho-copyright {
      font-size: 10.5px;
      color: #6f6a63;
      font-weight: 600;
      margin-bottom: 2px;
    }
    
    .graho-website {
      font-size: 10.5px;
      color: #b59d7c;
      font-weight: 700;
      text-decoration: none;
      letter-spacing: 1px;
      text-transform: uppercase;
    }
  </style>
</head>
<body>

  <!-- PAGE 1: Cover Page -->
  <div class="page cover-page-style">
    
    <div class="cover-content" style="margin-top: 50px;">
      <img src="${logoBase64 || ''}" alt="Graho Logo" style="height: 70px; width: auto; display: block; margin: 0 auto 40px auto; object-fit: contain;" />
      
      <h1 class="cover-title">${reportTitle}</h1>
      <div class="cover-divider"></div>
      <p class="cover-subtitle">Prepared exclusively for <span>${fullName}</span></p>
    </div>
    
    <div class="cover-details">
      <h3 class="details-heading">Birth Details Overview</h3>
      <div class="details-grid">
        <div class="details-card">
          <div class="details-title">Date of Birth</div>
          <div class="details-value">${formatDateOfBirth(dateOfbirth)}</div>
          <div class="details-note">${placeOfBirth || ""}</div>
        </div>
        <div class="details-card">
          <div class="details-title">Ascendant Sign</div>
          <div class="details-value">${ascSignLabel}</div>
          <div class="details-note">Rising (Lagna)</div>
        </div>
      </div>
    </div>
  </div>

  <!-- PAGE 2: Year-at-a-Glance Timeline -->
  <div class="page">
    <div class="page-header">
      <div class="page-label">${escapeHtml(reportTypeLabel)}-at-a-Glance</div>
      <div class="page-meta">${escapeHtml(reportTypeLabel)} focus</div>
    </div>
    <h1 class="section-title">${escapeHtml(reportTypeLabel)} Timeline</h1>
    <div class="timeline-list">
      ${(rc.careerPeriods || []).map((period) => `
        <div class="timeline-node">
          <div class="timeline-header">
            <span class="timeline-period-title">${period.period}</span>
            <span class="timeline-period-focus">— ${period.focus}</span>
          </div>
          <div class="timeline-prediction">${period.prediction}</div>
        </div>
      `).join('')}
    </div>
    <h3 class="key-dates-title">Key dates overview</h3>
    <div class="card-grid">
      ${allKeyDates.slice(0, 6).map((item) => `
        <div class="info-card">
          <div class="info-meta">${item.section}</div>
          <div class="info-title">${item.date}</div>
          <div class="info-text">${item.title}</div>
        </div>
      `).join('')}
    </div>
  </div>

  <!-- PAGE 3: Personalized Action Plan -->
  <div class="page">
    <div class="page-header">
      <div class="page-label">Personalized Action Plan</div>
      <div class="page-meta">Practical next steps</div>
    </div>
    <h1 class="section-title">Personalized Action Plan</h1>
    <div class="action-grid">
      ${actionPlanGroups.map((group) => `
        <div class="action-group">
          <h4>${group.title}</h4>
          <ul>
            ${group.items.slice(0, 4).map((item) => `<li>${item}</li>`).join('')}
          </ul>
        </div>
      `).join('')}
    </div>
  </div>

  <!-- PAGE 4: Birth Chart + Year Overview -->
  <div class="page">
    <div class="page-header">
      <div class="page-label">Birth Chart + Year Overview</div>
      <div class="page-meta">Astrological context</div>
    </div>
    <h1 class="section-title">Birth Chart + Year Overview</h1>
    <div class="overview-text">${rc.overview || ""}</div>
    <div class="chart-section">
      <h2 class="chart-title">Birth Chart (Kundli)</h2>
      <div class="pdf-kundli-shell">
        <h3 class="pdf-kundli-subtitle">Lagna / Ascendant / Basic Birth Chart</h3>
        ${birthChartHtml}
      </div>
      <p class="chart-note">North Indian Style Vedic Chart</p>
    </div>
  </div>

  <!-- PAGE 5: Career -->
  <div class="page">
    <div class="page-header">
      <div class="page-label">Career</div>
      <div class="page-meta">Progress and positioning</div>
    </div>
    <h1 class="section-title">Career</h1>
    <div class="description-text">${rc.careerFinance || ""}</div>
    <table class="period-table">
      <thead>
        <tr>
          <th>Period</th>
          <th>Focus</th>
          <th>Prediction</th>
        </tr>
      </thead>
      <tbody>
        ${(rc.careerPeriods || []).map(p => `
          <tr>
            <td>${p.period}</td>
            <td>${p.focus}</td>
            <td>${p.prediction}</td>
          </tr>
        `).join('')}
      </tbody>
    </table>
    <h3 class="key-dates-title">Key dates</h3>
    <div class="date-list">
      ${(rc.careerKeyDates || []).map(d => `
        <div class="date-entry">
          <div class="date-header">
            <span class="date-title">${d.date}</span>
            <span class="date-badge ${d.type}">${d.type === 'positive' ? 'Opportunity' : 'Risk'}</span>
          </div>
          <div class="date-desc">${d.title}</div>
        </div>
      `).join('')}
    </div>
    <div class="remedies-section">
      <h3 class="remedies-title">Recommended actions</h3>
      <ul class="remedies-list">
        ${(rc.careerRemedies || []).map(r => `<li>${r}</li>`).join('')}
      </ul>
    </div>
  </div>

  <!-- PAGE 6: Finance -->
  <div class="page">
    <div class="page-header">
      <div class="page-label">Finance</div>
      <div class="page-meta">Money flow and planning</div>
    </div>
    <h1 class="section-title">Finance</h1>
    <div class="description-text">${rc.finance || ""}</div>
    <table class="period-table">
      <thead>
        <tr>
          <th>Period</th>
          <th>Focus</th>
          <th>Prediction</th>
        </tr>
      </thead>
      <tbody>
        ${(rc.financePeriods || []).map(p => `
          <tr>
            <td>${p.period}</td>
            <td>${p.focus}</td>
            <td>${p.prediction}</td>
          </tr>
        `).join('')}
      </tbody>
    </table>
    <h3 class="key-dates-title">Key dates</h3>
    <div class="date-list">
      ${(rc.financeKeyDates || []).map(d => `
        <div class="date-entry">
          <div class="date-header">
            <span class="date-title">${d.date}</span>
            <span class="date-badge ${d.type}">${d.type === 'positive' ? 'Opportunity' : 'Risk'}</span>
          </div>
          <div class="date-desc">${d.title}</div>
        </div>
      `).join('')}
    </div>
    <div class="remedies-section">
      <h3 class="remedies-title">Recommended actions</h3>
      <ul class="remedies-list">
        ${(rc.financeRemedies || []).map(r => `<li>${r}</li>`).join('')}
      </ul>
    </div>
  </div>

  <!-- PAGE 7: Relationships -->
  <div class="page">
    <div class="page-header">
      <div class="page-label">Relationships</div>
      <div class="page-meta">Connections and growth</div>
    </div>
    <h1 class="section-title">Relationships</h1>
    <div class="description-text">${rc.relationships || ""}</div>
    <table class="period-table">
      <thead>
        <tr>
          <th>Period</th>
          <th>Focus</th>
          <th>Prediction</th>
        </tr>
      </thead>
      <tbody>
        ${(rc.relationshipPeriods || []).map(p => `
          <tr>
            <td>${p.period}</td>
            <td>${p.focus}</td>
            <td>${p.prediction}</td>
          </tr>
        `).join('')}
      </tbody>
    </table>
    <h3 class="key-dates-title">Key dates</h3>
    <div class="date-list">
      ${(rc.relationshipKeyDates || []).map(d => `
        <div class="date-entry">
          <div class="date-header">
            <span class="date-title">${d.date}</span>
            <span class="date-badge ${d.type}">${d.type === 'positive' ? 'Opportunity' : 'Risk'}</span>
          </div>
          <div class="date-desc">${d.title}</div>
        </div>
      `).join('')}
    </div>
    <div class="remedies-section">
      <h3 class="remedies-title">Recommended actions</h3>
      <ul class="remedies-list">
        ${(rc.relationshipRemedies || []).map(r => `<li>${r}</li>`).join('')}
      </ul>
    </div>
  </div>

  <!-- PAGE 8: Health -->
  <div class="page">
    <div class="page-header">
      <div class="page-label">Health</div>
      <div class="page-meta">Energy and resilience</div>
    </div>
    <h1 class="section-title">Health</h1>
    <div class="description-text">${rc.healthWellness || ""}</div>
    <table class="period-table">
      <thead>
        <tr>
          <th>Period</th>
          <th>Focus</th>
          <th>Prediction</th>
        </tr>
      </thead>
      <tbody>
        ${(rc.healthPeriods || []).map(p => `
          <tr>
            <td>${p.period}</td>
            <td>${p.focus}</td>
            <td>${p.prediction}</td>
          </tr>
        `).join('')}
      </tbody>
    </table>
    <h3 class="key-dates-title">Key dates</h3>
    <div class="date-list">
      ${(rc.healthKeyDates || []).map(d => `
        <div class="date-entry">
          <div class="date-header">
            <span class="date-title">${d.date}</span>
            <span class="date-badge ${d.type}">${d.type === 'positive' ? 'Opportunity' : 'Risk'}</span>
          </div>
          <div class="date-desc">${d.title}</div>
        </div>
      `).join('')}
    </div>
    <div class="remedies-section">
      <h3 class="remedies-title">Recommended actions</h3>
      <ul class="remedies-list">
        ${(rc.healthRemedies || []).map(r => `<li>${r}</li>`).join('')}
      </ul>
    </div>
  </div>

  <!-- PAGE 9: Spiritual Growth -->
  <div class="page">
    <div class="page-header">
      <div class="page-label">Spiritual Growth</div>
      <div class="page-meta">Inner growth and alignment</div>
    </div>
    <h1 class="section-title">Spiritual Growth</h1>
    <div class="description-text">${rc.spiritualGrowth || ""}</div>
    <table class="period-table">
      <thead>
        <tr>
          <th>Period</th>
          <th>Focus</th>
          <th>Prediction</th>
        </tr>
      </thead>
      <tbody>
        ${(rc.spiritualPeriods || []).map(p => `
          <tr>
            <td>${p.period}</td>
            <td>${p.focus}</td>
            <td>${p.prediction}</td>
          </tr>
        `).join('')}
      </tbody>
    </table>
    <h3 class="key-dates-title">Key dates</h3>
    <div class="date-list">
      ${(rc.spiritualKeyDates || []).map(d => `
        <div class="date-entry">
          <div class="date-header">
            <span class="date-title">${d.date}</span>
            <span class="date-badge ${d.type}">${d.type === 'positive' ? 'Opportunity' : 'Risk'}</span>
          </div>
          <div class="date-desc">${d.title}</div>
        </div>
      `).join('')}
    </div>
    <div class="remedies-section">
      <h3 class="remedies-title">Recommended actions</h3>
      <ul class="remedies-list">
        ${(rc.spiritualRemedies || []).map(r => `<li>${r}</li>`).join('')}
      </ul>
    </div>
  </div>

  <!-- PAGE 10: Travel -->
  <div class="page">
    <div class="page-header">
      <div class="page-label">Travel</div>
      <div class="page-meta">Journeys and exploration</div>
    </div>
    <h1 class="section-title">Travel</h1>
    <div class="description-text">${rc.travel || ""}</div>
    <table class="period-table">
      <thead>
        <tr>
          <th>Period</th>
          <th>Focus</th>
          <th>Prediction</th>
        </tr>
      </thead>
      <tbody>
        ${(rc.travelPeriods || []).map(p => `
          <tr>
            <td>${p.period}</td>
            <td>${p.focus}</td>
            <td>${p.prediction}</td>
          </tr>
        `).join('')}
      </tbody>
    </table>
    <h3 class="key-dates-title">Key dates</h3>
    <div class="date-list">
      ${(rc.travelKeyDates || []).map(d => `
        <div class="date-entry">
          <div class="date-header">
            <span class="date-title">${d.date}</span>
            <span class="date-badge ${d.type}">${d.type === 'positive' ? 'Opportunity' : 'Risk'}</span>
          </div>
          <div class="date-desc">${d.title}</div>
        </div>
      `).join('')}
    </div>
    <div class="remedies-section">
      <h3 class="remedies-title">Recommended actions</h3>
      <ul class="remedies-list">
        ${(rc.travelRemedies || []).map(r => `<li>${r}</li>`).join('')}
      </ul>
    </div>
  </div>

  <!-- PAGE 11: Education -->
  <div class="page">
    <div class="page-header">
      <div class="page-label">Education</div>
      <div class="page-meta">Learning and intellectual pursuits</div>
    </div>
    <h1 class="section-title">Education</h1>
    <div class="description-text">${rc.education || ""}</div>
    <table class="period-table">
      <thead>
        <tr>
          <th>Period</th>
          <th>Focus</th>
          <th>Prediction</th>
        </tr>
      </thead>
      <tbody>
        ${(rc.educationPeriods || []).map(p => `
          <tr>
            <td>${p.period}</td>
            <td>${p.focus}</td>
            <td>${p.prediction}</td>
          </tr>
        `).join('')}
      </tbody>
    </table>
    <h3 class="key-dates-title">Key dates</h3>
    <div class="date-list">
      ${(rc.educationKeyDates || []).map(d => `
        <div class="date-entry">
          <div class="date-header">
            <span class="date-title">${d.date}</span>
            <span class="date-badge ${d.type}">${d.type === 'positive' ? 'Opportunity' : 'Risk'}</span>
          </div>
          <div class="date-desc">${d.title}</div>
        </div>
      `).join('')}
    </div>
    <div class="remedies-section">
      <h3 class="remedies-title">Recommended actions</h3>
      <ul class="remedies-list">
        ${(rc.educationRemedies || []).map(r => `<li>${r}</li>`).join('')}
      </ul>
    </div>
  </div>

  <!-- PAGE 12: Graho Details -->
  <div class="page">
    <div class="page-header">
      <div class="page-label">About Graho</div>
      <div class="page-meta">Contact & Policies</div>
    </div>
    
    <div class="graho-about-container">
      <div class="graho-brand-section">
        <img class="graho-logo" src="${logoBase64 || ''}" alt="Graho Logo" />
        <p class="graho-tagline" style="margin-top: 6px;">Grah Disha, Jeevan Disha.</p>
      </div>
      
      <div class="graho-details-grid">
        <div class="graho-card">
          <h3 class="graho-card-title">Contact Info</h3>
          <ul class="graho-list">
            <li class="graho-list-item">
              <span class="graho-list-item-bullet">✦</span>
              <span><strong>Address:</strong> Goa, India</span>
            </li>
            <li class="graho-list-item">
              <span class="graho-list-item-bullet">✦</span>
              <span><strong>Email:</strong> <a href="mailto:hello@graho.in">hello@graho.in</a></span>
            </li>
            <li class="graho-list-item">
              <span class="graho-list-item-bullet">✦</span>
              <span><strong>Phone:</strong> +91 9011482683</span>
            </li>
          </ul>
        </div>
        
        <div class="graho-card">
          <h3 class="graho-card-title">Quick Links & Policies</h3>
          <ul class="graho-list">
            <li class="graho-list-item">
              <span class="graho-list-item-bullet">✦</span>
              <a href="https://graho.in/policies/terms_conditions" target="_blank">Terms & Conditions</a>
            </li>
            <li class="graho-list-item">
              <span class="graho-list-item-bullet">✦</span>
              <a href="https://graho.in/policies/privacy" target="_blank">Privacy Policy</a>
            </li>
            <li class="graho-list-item">
              <span class="graho-list-item-bullet">✦</span>
              <a href="https://graho.in/policies/cancellation_refund" target="_blank">Cancellation & Refund Policy</a>
            </li>
            <li class="graho-list-item">
              <span class="graho-list-item-bullet">✦</span>
              <a href="https://graho.in/policies/shipping_delivery" target="_blank">Shipping Policy</a>
            </li>
            <li class="graho-list-item">
              <span class="graho-list-item-bullet">✦</span>
              <a href="https://careers.graho.in" target="_blank">Careers: careers@graho</a>
            </li>
          </ul>
        </div>
      </div>
      
      <div class="graho-qr-container">
        <div class="graho-qr-image-wrapper">
          <img class="graho-qr-image" src="${qrBase64 || ''}" alt="Scan QR" />
        </div>
        <div class="graho-qr-text">
          <h3 class="graho-qr-title">Download Graho App</h3>
          <p class="graho-qr-desc">Scan the QR code to install the application on your mobile device and access personalized daily guidance anytime.</p>
          <div class="graho-app-badges">
            <a href="https://play.google.com/store/apps/details?id=com.graho" target="_blank" style="display: inline-block; line-height: 0;">
              <img class="graho-app-badge" src="${googlePlayBase64 || ''}" alt="Get it on Google Play" />
            </a>
            <a href="https://graho.in" target="_blank" style="display: inline-block; line-height: 0;">
              <img class="graho-app-badge" src="${appStoreBase64 || ''}" alt="Visit Our Website" />
            </a>
          </div>
        </div>
      </div>
      
      <div class="graho-footer">
        <p class="graho-copyright">Copyright &copy; 2025-26 Graho. All Rights Reserved.</p>
        <a class="graho-website" href="https://graho.in" target="_blank">www.graho.in</a>
      </div>
    </div>
  </div>

</body>
</html>
  `;
}

module.exports = {
  generateKundliReportPDF,
};
