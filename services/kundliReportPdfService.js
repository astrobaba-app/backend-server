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
    args: [
      "--no-sandbox",
      "--disable-setuid-sandbox",
      "--disable-dev-shm-usage",
      "--disable-gpu",
      "--disable-features=Crashpad",
      "--disable-crash-reporter"
    ],
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
        <rect x="0" y="0" width="393" height="393" fill="none" stroke="#4C4C4C" stroke-width="2"/>
        <line x1="0" y1="0" x2="393" y2="393" stroke="#4C4C4C" stroke-width="2"/>
        <line x1="393" y1="0" x2="0" y2="393" stroke="#4C4C4C" stroke-width="2"/>
        <line x1="196.5" y1="0" x2="393" y2="196.5" stroke="#4C4C4C" stroke-width="2"/>
        <line x1="393" y1="196.5" x2="196.5" y2="393" stroke="#4C4C4C" stroke-width="2"/>
        <line x1="196.5" y1="393" x2="0" y2="196.5" stroke="#4C4C4C" stroke-width="2"/>
        <line x1="0" y1="196.5" x2="196.5" y2="0" stroke="#4C4C4C" stroke-width="2"/>
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
    
    try {
      await browser.close();
    } catch (closeError) {
      console.warn("[Kundli PDF Service] Browser close warning (safe to ignore):", closeError.message);
    }
    
    return Buffer.from(pdfBuffer);
    
  } catch (error) {
    if (browser) {
      try {
        await browser.close();
      } catch (closeError) {
        console.warn("[Kundli PDF Service] Browser close warning in catch (safe to ignore):", closeError.message);
      }
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
  const rc = reportData.reportContent;
  const birthChartHtml = buildNorthIndianBirthChartHtml(kundliData);
  
  return `
<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <style>
    * {
      margin: 0;
      padding: 0;
      box-sizing: border-box;
    }
    
    body {
      font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Arial, sans-serif;
      background: #0f1824;
      color: #e0e0e0;
      line-height: 1.6;
    }
    
    .page {
      width: 210mm;
      height: 297mm;
      padding: 40px 50px;
      background: #0f1824;
      page-break-after: always;
      position: relative;
    }
    
    .page:last-child {
      page-break-after: auto;
    }
    
    /* Page 1 Styles */
    .page-title {
      font-size: 36px;
      font-weight: 700;
      color: #f4c430;
      margin-bottom: 15px;
    }
    
    .page-subtitle {
      font-size: 14px;
      color: #b0b0b0;
      margin-bottom: 30px;
    }
    
    .overview-text {
      font-size: 13px;
      line-height: 1.8;
      color: #d0d0d0;
      text-align: justify;
      margin-bottom: 40px;
    }
    
    .chart-section {
      background: rgba(255,255,255,0.03);
      border-radius: 8px;
      padding: 30px;
      text-align: center;
    }
    
    .chart-title {
      font-size: 24px;
      font-weight: 600;
      color: #ffffff;
      margin-bottom: 30px;
    }
    
    .pdf-kundli-shell {
      margin: 0 auto;
      width: 100%;
      max-width: 460px;
    }

    .pdf-kundli-subtitle {
      color: #f4f4f4;
      font-size: 16px;
      font-weight: 700;
      margin-bottom: 14px;
    }

    .pdf-kundli-chart {
      width: 393px;
      height: 393px;
      margin: 0 auto;
      position: relative;
      background: #FCF8E3;
      box-shadow: 0 4px 20px rgba(0, 0, 0, 0.2);
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
      color: #999999;
      font-size: 10px;
      font-weight: 500;
      line-height: 1;
    }

    .pdf-kundli-house {
      position: absolute;
      transform: translate(-50%, -50%);
      width: 20%;
      display: flex;
      flex-direction: column;
      align-items: center;
      gap: 2px;
      text-align: center;
    }

    .pdf-kundli-planet {
      font-size: 10px;
      line-height: 1.2;
      font-weight: 600;
      white-space: nowrap;
    }

    .pdf-kundli-missing {
      width: 393px;
      height: 393px;
      margin: 0 auto;
      display: flex;
      align-items: center;
      justify-content: center;
      background: #FCF8E3;
      color: #4C4C4C;
      font-size: 14px;
      font-weight: 600;
      border: 1px solid #4C4C4C;
    }
    
    .chart-note {
      font-size: 12px;
      color: #808080;
      margin-top: 10px;
    }
    
    /* Content Page Styles */
    .section-title {
      font-size: 32px;
      font-weight: 600;
      color: #f4c430;
      margin-bottom: 30px;
      border-bottom: 1px solid #f4c430;
      padding-bottom: 10px;
    }
    
    .description-text {
      font-size: 13px;
      line-height: 1.8;
      color: #d0d0d0;
      text-align: justify;
      margin-bottom: 30px;
    }
    
    .period-table {
      width: 100%;
      border-collapse: collapse;
      margin-bottom: 30px;
    }
    
    .period-table thead {
      background: #f4c430;
    }
    
    .period-table th {
      padding: 12px 15px;
      text-align: left;
      font-size: 14px;
      font-weight: 600;
      color: #0f1824;
    }
    
    .period-table td {
      padding: 12px 15px;
      font-size: 13px;
      color: #d0d0d0;
      border-bottom: 1px solid #2a3544;
    }
    
    .period-table tbody tr:hover {
      background: rgba(244, 196, 48, 0.05);
    }
    
    .key-dates-title {
      font-size: 18px;
      font-weight: 600;
      color: #ffffff;
      margin: 30px 0 15px 0;
    }
    
    .date-card {
      background: rgba(255, 255, 255, 0.03);
      border-left: 3px solid #f4c430;
      padding: 15px 20px;
      margin-bottom: 15px;
      border-radius: 4px;
    }
    
    .date-card.positive {
      border-left-color: #4caf50;
    }
    
    .date-card.negative {
      border-left-color: #f44336;
    }
    
    .date-label {
      font-size: 11px;
      font-weight: 600;
      text-transform: uppercase;
      letter-spacing: 1px;
      margin-bottom: 5px;
    }
    
    .date-label.positive {
      color: #4caf50;
    }
    
    .date-label.negative {
      color: #f44336;
    }
    
    .date-title {
      font-size: 14px;
      font-weight: 600;
      color: #ffffff;
      margin-bottom: 3px;
    }
    
    .date-desc {
      font-size: 13px;
      color: #b0b0b0;
    }
    
    .remedies-section {
      background: rgba(40, 50, 30, 0.4);
      border-radius: 8px;
      padding: 25px;
      margin-top: 30px;
    }
    
    .remedies-title {
      font-size: 20px;
      font-weight: 600;
      color: #ffffff;
      margin-bottom: 15px;
    }
    
    .remedies-list {
      list-style: none;
    }
    
    .remedies-list li {
      font-size: 13px;
      color: #d0d0d0;
      padding: 8px 0;
      padding-left: 20px;
      position: relative;
    }
    
    .remedies-list li:before {
      content: "•";
      position: absolute;
      left: 0;
      color: #f4c430;
      font-size: 18px;
    }
  </style>
</head>
<body>

  <!-- PAGE 1: Title + Overview + Chart -->
  <div class="page">
    <h1 class="page-title">Yearly Vedic Astrology Report</h1>
    <p class="page-subtitle">Prepared exclusively for ${fullName}</p>
    
    <div class="overview-text">
      ${rc.overview || ''}
    </div>
    
    <div class="chart-section">
      <h2 class="chart-title">Birth Chart (Kundli)</h2>
      <div class="pdf-kundli-shell">
        <h3 class="pdf-kundli-subtitle">Lagna / Ascendant / Basic Birth Chart</h3>
        ${birthChartHtml}
      </div>
      <p class="chart-note">North Indian Style Vedic Chart</p>
    </div>
  </div>

  <!-- PAGE 2: Career Opportunities and Challenges -->
  <div class="page">
    <h1 class="section-title">Career Opportunities and Challenges</h1>
    
    <div class="description-text">
      ${rc.careerFinance || ''}
    </div>
    
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
    
    ${(rc.careerKeyDates || []).map(d => `
      <div class="date-card ${d.type}">
        <div class="date-label ${d.type}">${d.type.toUpperCase()}</div>
        <div class="date-title">${d.date}</div>
        <div class="date-desc">${d.title}</div>
      </div>
    `).join('')}
    
    <div class="remedies-section">
      <h3 class="remedies-title">Remedies</h3>
      <ul class="remedies-list">
        ${(rc.careerRemedies || []).map(r => `<li>${r}</li>`).join('')}
      </ul>
    </div>
  </div>

  <!-- PAGE 3: Personal Relationships and Growth -->
  <div class="page">
    <h1 class="section-title">Personal Relationships and Growth</h1>
    
    <div class="description-text">
      ${rc.relationships || ''}
    </div>
    
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
    
    ${(rc.relationshipKeyDates || []).map(d => `
      <div class="date-card ${d.type}">
        <div class="date-label ${d.type}">${d.type.toUpperCase()}</div>
        <div class="date-title">${d.date}</div>
        <div class="date-desc">${d.title}</div>
      </div>
    `).join('')}
    
    <div class="remedies-section">
      <h3 class="remedies-title">Remedies</h3>
      <ul class="remedies-list">
        ${(rc.relationshipRemedies || []).map(r => `<li>${r}</li>`).join('')}
      </ul>
    </div>
  </div>

  <!-- PAGE 4: Financial Growth and Management -->
  <div class="page">
    <h1 class="section-title">Financial Growth and Management</h1>
    
    <div class="description-text">
      ${rc.finance || ''}
    </div>
    
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
    
    ${(rc.financeKeyDates || []).map(d => `
      <div class="date-card ${d.type}">
        <div class="date-label ${d.type}">${d.type.toUpperCase()}</div>
        <div class="date-title">${d.date}</div>
        <div class="date-desc">${d.title}</div>
      </div>
    `).join('')}
    
    <div class="remedies-section">
      <h3 class="remedies-title">Remedies</h3>
      <ul class="remedies-list">
        ${(rc.financeRemedies || []).map(r => `<li>${r}</li>`).join('')}
      </ul>
    </div>
  </div>

  <!-- PAGE 5: Health and Well-being -->
  <div class="page">
    <h1 class="section-title">Health and Well-being</h1>
    
    <div class="description-text">
      ${rc.healthWellness || ''}
    </div>
    
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
    
    ${(rc.healthKeyDates || []).map(d => `
      <div class="date-card ${d.type}">
        <div class="date-label ${d.type}">${d.type.toUpperCase()}</div>
        <div class="date-title">${d.date}</div>
        <div class="date-desc">${d.title}</div>
      </div>
    `).join('')}
    
    <div class="remedies-section">
      <h3 class="remedies-title">Remedies</h3>
      <ul class="remedies-list">
        ${(rc.healthRemedies || []).map(r => `<li>${r}</li>`).join('')}
      </ul>
    </div>
  </div>

  <!-- PAGE 6: Spiritual Growth and Exploration -->
  <div class="page">
    <h1 class="section-title">Spiritual Growth and Exploration</h1>
    
    <div class="description-text">
      ${rc.spiritualGrowth || ''}
    </div>
    
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
    
    ${(rc.spiritualKeyDates || []).map(d => `
      <div class="date-card ${d.type}">
        <div class="date-label ${d.type}">${d.type.toUpperCase()}</div>
        <div class="date-title">${d.date}</div>
        <div class="date-desc">${d.title}</div>
      </div>
    `).join('')}
    
    <div class="remedies-section">
      <h3 class="remedies-title">Remedies</h3>
      <ul class="remedies-list">
        ${(rc.spiritualRemedies || []).map(r => `<li>${r}</li>`).join('')}
      </ul>
    </div>
  </div>

  <!-- PAGE 7: Travel Opportunities and Experiences -->
  <div class="page">
    <h1 class="section-title">Travel Opportunities and Experiences</h1>
    
    <div class="description-text">
      ${rc.travel || ''}
    </div>
    
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
    
    ${(rc.travelKeyDates || []).map(d => `
      <div class="date-card ${d.type}">
        <div class="date-label ${d.type}">${d.type.toUpperCase()}</div>
        <div class="date-title">${d.date}</div>
        <div class="date-desc">${d.title}</div>
      </div>
    `).join('')}
    
    <div class="remedies-section">
      <h3 class="remedies-title">Remedies</h3>
      <ul class="remedies-list">
        ${(rc.travelRemedies || []).map(r => `<li>${r}</li>`).join('')}
      </ul>
    </div>
  </div>

  <!-- PAGE 8: Educational Growth and Opportunities -->
  <div class="page">
    <h1 class="section-title">Educational Growth and Opportunities</h1>
    
    <div class="description-text">
      ${rc.education || ''}
    </div>
    
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
    
    ${(rc.educationKeyDates || []).map(d => `
      <div class="date-card ${d.type}">
        <div class="date-label ${d.type}">${d.type.toUpperCase()}</div>
        <div class="date-title">${d.date}</div>
        <div class="date-desc">${d.title}</div>
      </div>
    `).join('')}
    
    <div class="remedies-section">
      <h3 class="remedies-title">Remedies</h3>
      <ul class="remedies-list">
        ${(rc.educationRemedies || []).map(r => `<li>${r}</li>`).join('')}
      </ul>
    </div>
  </div>

</body>
</html>
  `;
}

module.exports = {
  generateKundliReportPDF,
};
