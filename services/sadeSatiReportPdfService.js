const puppeteer = require("puppeteer");
const fs = require("fs");
const path = require("path");

const IMAGES_DIR = path.resolve(__dirname, "../images");

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

const imageToDataUri = (fileName) => {
  try {
    const fullPath = path.join(IMAGES_DIR, fileName);
    if (!fs.existsSync(fullPath)) {
      console.warn(`[Sade Sati PDF Service] Image not found at ${fullPath}`);
      return "";
    }
    const buffer = fs.readFileSync(fullPath);
    const ext = path.extname(fileName).toLowerCase();
    const mime = ext === ".jpg" || ext === ".jpeg" ? "image/jpeg" : "image/png";
    return `data:${mime};base64,${buffer.toString("base64")}`;
  } catch (error) {
    console.error(`[Sade Sati PDF Service] Error reading image ${fileName}:`, error);
    return "";
  }
};

const escapeHtml = (value) => {
  return String(value ?? "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
};

const formatDate = (dateStr) => {
  if (!dateStr) return "--";
  try {
    return new Date(dateStr).toLocaleDateString("en-US", {
      year: "numeric", month: "long", day: "numeric"
    });
  } catch (e) {
    return dateStr;
  }
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
  ascendant: "Asc",
  Lagna: "Asc"
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

const formatDegree = (decimalDegree) => {
  const n = typeof decimalDegree === "number" ? decimalDegree : Number(decimalDegree);
  const safe = !Number.isFinite(n) ? 0 : ((n % 30) + 30) % 30;
  const degrees = Math.floor(safe);
  const minutes = Math.floor((safe - degrees) * 60);
  return `${degrees}\u00b0${String(minutes).padStart(2, "0")}'`;
};

const renderChartSvg = (chartData, fallbackAscSignName, chartTitle) => {
  if (!chartData || !chartData.planets) {
    return `
        <div class="chart-box">
          <div style="font-size:11pt; font-weight:700; color:var(--navy); margin-bottom:3mm; text-align:center;">${chartTitle}</div>
          <div style="width:280px; height:280px; display:flex; align-items:center; justify-content:center; background:#FFFFFF; border:1.5px solid #0B192C; color:#ff0000; font-size:10pt;">
            Missing ${chartTitle} Data
          </div>
        </div>`;
  }

  const anchorSignNum = chartData.planets.Ascendant?.sign_num || chartData.planets.ascendant?.sign_num || SIGN_NAME_TO_NUM[fallbackAscSignName] || 1;
  const house1Sign = ((anchorSignNum - 1 + 12) % 12) + 1;

  // Group planets by house
  const housePlanetsMap = new Map();
  for (let i = 1; i <= 12; i++) {
    housePlanetsMap.set(i, []);
  }

  Object.entries(chartData.planets).forEach(([planetName, planetData]) => {
    const longitude = planetData.original_longitude ?? planetData.longitude ?? 0;
    const signNum = planetData.sign_num || (Math.floor(longitude / 30) % 12) + 1;
    const degree = planetData.degree ?? (longitude % 30);
    const name = PLANET_ABBREVIATIONS[planetName] || planetName.substring(0, 2);

    let houseNum = planetData.house;
    if (typeof houseNum !== "number" || isNaN(houseNum)) {
      houseNum = ((signNum - house1Sign + 12) % 12) + 1;
    }

    const hPlanets = housePlanetsMap.get(houseNum) || [];
    hPlanets.push({ name, degree });
    housePlanetsMap.set(houseNum, hPlanets);
  });

  // Check if Asc is mapped
  const hasAsc = Array.from(housePlanetsMap.values()).some(arr => arr.some(p => p.name === "Asc"));
  if (!hasAsc) {
    const ascHouse = 1; // Always in house 1
    const ascDeg = chartData.planets.Ascendant?.degree || chartData.planets.ascendant?.degree || 0;
    const existing = housePlanetsMap.get(ascHouse) || [];
    existing.unshift({ name: "Asc", degree: ascDeg });
    housePlanetsMap.set(ascHouse, existing);
  }

  // Sort by degree
  housePlanetsMap.forEach((planets) => planets.sort((a, b) => a.degree - b.degree));

  // House to sign mapping for labeling
  const houseToSignMap = {};
  for (let house = 1; house <= 12; house++) {
    houseToSignMap[house] = ((house1Sign - 1 + (house - 1)) % 12) + 1;
  }

  // Coordinates mapping
  const svgWidth = 393;
  const svgHeight = 393;

  let elementsMarkup = "";

  NORTH_INDIAN_HOUSE_POSITIONS.forEach(({ house, x, y, numX, numY }) => {
    const signNum = houseToSignMap[house];
    const planets = housePlanetsMap.get(house) || [];

    // Sign number text element
    const sX = numX * svgWidth;
    const sY = numY * svgHeight;
    elementsMarkup += `<text x="${sX.toFixed(1)}" y="${sY.toFixed(1)}" fill="#999999" font-size="11" font-family="Arial" text-anchor="middle" dominant-baseline="middle">${signNum}</text>
`;

    // Planets text elements
    if (planets.length > 0) {
      let offsetY = -(planets.length - 1) * 7.5;
      planets.forEach((planet) => {
        const color = PLANET_COLORS[planet.name] || "#333333";
        const pX = x * svgWidth;
        const pY = y * svgHeight + offsetY;
        const degreeStr = formatDegree(planet.degree);
        elementsMarkup += `<text x="${pX.toFixed(1)}" y="${pY.toFixed(1)}" fill="${color}" font-size="12" font-family="Arial" font-weight="bold" text-anchor="middle" dominant-baseline="middle">${planet.name} ${degreeStr}</text>
`;
        offsetY += 15;
      });
    }
  });

  return `
    <div class="chart-box">
      <div style="font-size:11pt; font-weight:700; color:var(--navy); margin-bottom:3mm; text-align:center;">${chartTitle}</div>
      <svg viewBox="0 0 393 393" style="width:280px; height:280px; background-color:#FCF8E3; box-shadow:0px 4px 12px rgba(0, 0, 0, 0.15);">
        <rect x="0" y="0" width="393" height="393" fill="#FCF8E3" stroke="#4C4C4C" stroke-width="2" />
        <line x1="0" y1="0" x2="393" y2="393" stroke="#4C4C4C" stroke-width="2" />
        <line x1="393" y1="0" x2="0" y2="393" stroke="#4C4C4C" stroke-width="2" />
        <polygon points="196.5,0 393,196.5 196.5,393 0,196.5" fill="none" stroke="#4C4C4C" stroke-width="2" />
        ${elementsMarkup}
      </svg>
    </div>
    `;
};

function generateSadeSatiHtmlTemplate(reportData, userRequest) {
  const { fullName, dateOfbirth, timeOfbirth, placeOfBirth, gender } = userRequest;
  const pred = reportData.predictions || {};
  const astro = reportData.astrologyBasics || {};
  const charts = reportData.horoscopeCharts || {};

  // Load Cover & Dividers Base64 Data URIs
  const coverUri = imageToDataUri("sadhesatistartingpage.jpg");
  const endUri = imageToDataUri("sadhesatiendingpage.jpg");

  const divOverview = imageToDataUri("UnderstandingSadeSati.jpg");
  const divPhases = imageToDataUri("TheThreePhases.jpg");
  const divImpact = imageToDataUri("MinorCycles&Impact.jpg");
  const divRemedies = imageToDataUri("Guidance&Conclusion.jpg");

  const formattedDob = formatDate(dateOfbirth);
  const formattedReportDate = formatDate(new Date());

  const getAge = (dobString) => {
    if (!dobString) return "--";
    try {
      const birthDate = new Date(dobString);
      if (isNaN(birthDate.getTime())) return "--";
      const today = new Date();
      let age = today.getFullYear() - birthDate.getFullYear();
      const m = today.getMonth() - birthDate.getMonth();
      if (m < 0 || (m === 0 && today.getDate() < birthDate.getDate())) {
        age--;
      }
      return `${age} years`;
    } catch (e) {
      return "--";
    }
  };
  const age = getAge(dateOfbirth);

  // Safe getter helper to access nested JSON keys with fallbacks
  const getVal = (pathStr, fallback = "") => {
    try {
      const parts = pathStr.split(".");
      let current = pred;
      for (const part of parts) {
        if (current === null || current === undefined) return fallback;
        current = current[part];
      }
      return current || fallback;
    } catch (e) {
      return fallback;
    }
  };

  const getAffirmations = () => {
    try {
      if (Array.isArray(pred.affirmationsList) && pred.affirmationsList.length > 0) {
        return pred.affirmationsList;
      }
      if (Array.isArray(pred.finalVerdict?.affirmationsList) && pred.finalVerdict.affirmationsList.length > 0) {
        return pred.finalVerdict.affirmationsList;
      }
    } catch (e) { }
    return [
      "I welcome Saturn's lessons of discipline, patience, and silent strength.",
      "I release what is false and build my life on authentic truth and responsibility.",
      "I am grounded, stable, and capable of enduring any transit with grace.",
      "Every delay is a refinement, aligning me with my true purpose and path.",
      "I speak with wisdom, act with integrity, and cultivate internal peace daily.",
      "My resilience is forged through accountability, and I trust the process of time.",
      "I accept the gift of maturity and step forward with absolute clarity and self-trust."
    ];
  };
  const affirmations = getAffirmations();

  // Helper for generating standard A4 text pages with headers/footers
  const createStandardPage = (pageNumber, sectionTitle, eyebrowText, contentHtml, subtitle = "") => {
    return `
    <div class="page">
      <div class="header">
        <div class="header-eyebrow">
          <span class="eyebrow-line"></span>
          <span class="eyebrow-text">${escapeHtml(eyebrowText)}</span>
        </div>
        <h1 class="header-title">${escapeHtml(sectionTitle)}</h1>
        ${subtitle ? `<p class="header-subtitle">${escapeHtml(subtitle)}</p>` : ""}
        <div class="header-gradient"></div>
      </div>

      <div class="page-content">
        ${contentHtml}
      </div>

      <div class="footer">
        <span class="footer-left">Personalised Shani Sade Sati Report · ${escapeHtml(fullName)}</span>
        <span class="footer-right">Page ${pageNumber}</span>
      </div>
    </div>
    `;
  };

  // Build the entire HTML document
  return `<!DOCTYPE html>
<html>
<head>
  <meta charset="utf-8">
  <title>Premium Shani Sade Sati Report</title>
  <link href="https://fonts.googleapis.com/css2?family=Roboto:wght@300;400;500;600;700;900&display=swap" rel="stylesheet">
  <style>
    :root {
      --navy: #0B192C;
      --navy-light: #F0F4F8;
      --navy-deep: #050C16;
      --indigo: #4F46E5;
      --indigo-dark: #3730A3;
      --indigo-deep: #1E1B4B;
      --indigo-light: #EEF2F6;
      --dark-blue: #0F172A;
      --dark-blue-light: #1E293B;
      --white: #FFFFFF;
      --card-bg: #FFFFFF;
      --text-main: #334155;
      --text-muted: #64748B;
      --gold: #2563EB;      /* Vibrant blue accent replacing gold */
      --gold-dark: #1D4ED8; /* Darker blue accent replacing gold-dark */
      --gold-deep: #1E3A8A; /* Deep blue accent replacing gold-deep */
      --gold-light: #EFF6FF;/* Soft blue accent light replacing gold-light */
      --border-color: rgba(11, 25, 44, 0.12);
    }
    
    @page {
      size: A4;
      margin: 0;
    }
    
    * { box-sizing: border-box; margin: 0; padding: 0; }
    
    body {
      margin: 0;
      padding: 0;
      background: var(--white);
      color: var(--text-main);
      font-family: 'Roboto', 'Helvetica Neue', Arial, sans-serif;
      -webkit-print-color-adjust: exact;
      print-color-adjust: exact;
    }
    
    .page {
      width: 210mm;
      height: 297mm;
      box-sizing: border-box;
      padding: 15mm 16mm 12mm 16mm;
      position: relative;
      page-break-after: always;
      page-break-inside: avoid;
      display: flex;
      flex-direction: column;
      background-color: var(--white);
      overflow: hidden;
      border: 1.5px solid rgba(11, 25, 44, 0.15);
    }
    
    .img-page-bg {
      width: 210mm;
      height: 297mm;
      box-sizing: border-box;
      page-break-after: always;
      background-size: 100% 100%;
      background-position: center;
      background-repeat: no-repeat;
      display: block;
      position: relative;
    }
    
    /* Cover overlays */
    .bg-cover { background-image: url('${coverUri}'); }
    .bg-end { background-image: url('${endUri}'); }
    
    .bg-div-overview { background-image: url('${divOverview}'); }
    .bg-div-phases { background-image: url('${divPhases}'); }
    .bg-div-impact { background-image: url('${divImpact}'); }
    .bg-div-remedies { background-image: url('${divRemedies}'); }

    .cover-overlay {
      position: absolute;
      bottom: 25mm;
      left: 15mm;
      right: 15mm;
      background: rgba(11, 25, 44, 0.92);
      border: 2px solid var(--gold);
      border-radius: 12px;
      padding: 6mm 8mm;
      color: var(--white);
      box-shadow: 0 10px 25px rgba(0,0,0,0.5);
    }
    .cover-brand {
      font-size: 9pt;
      font-weight: 700;
      color: var(--gold);
      letter-spacing: 3px;
      margin-bottom: 2mm;
      text-transform: uppercase;
    }
    .cover-main-title {
      font-size: 26pt;
      font-weight: 900;
      letter-spacing: 1px;
      margin-bottom: 1px;
      color: var(--white);
    }
    .cover-sub-title {
      font-size: 13pt;
      font-weight: 400;
      color: #E2E8F0;
      margin-bottom: 4mm;
    }
    .cover-details {
      display: grid;
      grid-template-columns: 1fr 1fr;
      gap: 3mm;
      border-top: 1px solid rgba(255,255,255,0.15);
      padding-top: 3mm;
    }
    .cover-detail-row {
      font-size: 10pt;
      color: #CBD5E1;
    }
    .cover-detail-row span {
      display: block;
      font-size: 8pt;
      text-transform: uppercase;
      color: var(--gold);
      letter-spacing: 1px;
      margin-bottom: 0.5mm;
    }
    .cover-detail-row strong {
      color: var(--white);
    }

    /* Standard Header styles */
    .header {
      margin-bottom: 4mm;
    }
    
    .header-eyebrow {
      display: flex;
      align-items: center;
      gap: 3mm;
      margin-bottom: 1.5mm;
    }
    
    .eyebrow-line {
      width: 10mm;
      height: 3px;
      background: var(--navy);
      border-radius: 2px;
    }
    
    .eyebrow-text {
      font-size: 9pt;
      font-weight: 700;
      text-transform: uppercase;
      letter-spacing: 2px;
      color: var(--navy);
    }
    
    .header-title {
      font-size: 22pt;
      font-weight: 800;
      color: var(--navy);
      letter-spacing: -0.3px;
      margin-bottom: 0.5mm;
    }
    
    .header-subtitle {
      font-size: 11.5pt;
      color: #475569;
      font-weight: 400;
    }
    
    .header-gradient {
      height: 2.5px;
      background: linear-gradient(90deg, var(--navy) 0%, rgba(11, 25, 44, 0.2) 60%, transparent 100%);
      margin-top: 1.5mm;
    }

    .footer {
      margin-top: auto;
      padding-top: 2.5mm;
      border-top: 1.5px solid rgba(11, 25, 44, 0.15);
      display: flex;
      justify-content: space-between;
      align-items: center;
      font-size: 8pt;
      color: var(--text-muted);
    }
    
    .footer-left { font-weight: 500; }
    .footer-right { font-weight: 700; color: var(--navy); }

    .page-content {
      flex: 1;
      display: flex;
      flex-direction: column;
      justify-content: flex-start;
    }

    .narrative-block {
      margin-bottom: 3.5mm;
    }
    
    .narrative-label {
      font-size: 10.5pt;
      font-weight: 700;
      text-transform: uppercase;
      letter-spacing: 1.5px;
      color: var(--navy);
      margin-bottom: 2mm;
      padding-bottom: 0.5mm;
      border-bottom: 1.5px solid rgba(11, 25, 44, 0.15);
    }
    
    .narrative-text {
      font-size: 11.5pt;
      color: var(--text-main);
      line-height: 1.55;
      text-align: justify;
    }

    /* Cards & Layout */
    .grid-2 {
      display: grid;
      grid-template-columns: 1fr 1fr;
      gap: 4mm;
      margin-bottom: 3mm;
    }

    .info-card {
      background: var(--white);
      border: 1.5px solid rgba(11, 25, 44, 0.15);
      border-radius: 8px;
      padding: 3mm 4mm;
      margin-bottom: 3mm;
    }

    .info-card-title {
      font-size: 10.5pt;
      font-weight: 700;
      text-transform: uppercase;
      letter-spacing: 1.5px;
      color: var(--navy);
      margin-bottom: 2mm;
      padding-bottom: 0.5mm;
      border-bottom: 1px solid rgba(11, 25, 44, 0.10);
    }
    
    .info-card-row {
      display: flex;
      justify-content: space-between;
      align-items: center;
      padding: 1.5mm 0;
      border-bottom: 1px solid #F1F5F9;
      gap: 2mm;
    }
    
    .info-card-row:last-child {
      border-bottom: none;
    }
    
    .info-card-label {
      font-size: 10.5pt;
      color: var(--text-muted);
      font-weight: 500;
    }
    
    .info-card-value {
      font-size: 10.5pt;
      font-weight: 700;
      color: #0F172A;
      text-align: right;
    }

    /* Table of Contents */
    .toc-row {
      display: flex;
      align-items: baseline;
      padding: 1.8mm 0;
      border-bottom: 1px solid #F1F5F9;
    }
    
    .toc-num {
      font-size: 11.5pt;
      font-weight: 700;
      color: var(--navy);
      width: 10mm;
      flex-shrink: 0;
    }
    
    .toc-title {
      font-size: 11.5pt;
      font-weight: 500;
      color: #334155;
      flex: 1;
    }
    
    .toc-dots {
      flex: 1;
      border-bottom: 1.5px dotted #CBD5E1;
      margin: 0 4mm;
    }
    
    .toc-page {
      font-size: 11.5pt;
      font-weight: 700;
      color: #0F172A;
      width: 15mm;
      text-align: right;
    }

    /* Tables */
    .table-wrap {
      border: 1.5px solid #E2E8F0;
      border-radius: 8px;
      overflow: hidden;
      margin-top: 2mm;
      margin-bottom: 2mm;
    }
    
    .premium-table {
      width: 100%;
      border-collapse: collapse;
    }
    
    .premium-table th {
      background: var(--navy);
      color: var(--white);
      font-size: 10pt;
      font-weight: 700;
      text-transform: uppercase;
      letter-spacing: 1.2px;
      padding: 2mm 3mm;
      text-align: left;
      border: none;
    }
    
    .premium-table td {
      padding: 1.8mm 3mm;
      font-size: 10.5pt;
      border-bottom: 1px solid #F1F5F9;
      vertical-align: middle;
      line-height: 1.4;
      color: #334155;
    }
    
    .premium-table tr:last-child td {
      border-bottom: none;
    }
    
    .premium-table tr:nth-child(even) td {
      background: var(--navy-light);
    }

    .bullet-list {
      margin: 1.5mm 0;
      padding-left: 5mm;
    }

    .bullet-list li {
      margin-bottom: 1.5mm;
      font-size: 10.2pt;
      line-height: 1.45;
      color: var(--text-main);
      list-style-type: square;
    }

    .bullet-list li::marker {
      color: var(--indigo);
    }

    /* Widgets styling */
    .disclaimer-box {
      border: 2.5px dashed var(--navy);
      background: rgba(11, 25, 44, 0.03);
      padding: 5mm;
      border-radius: 8px;
      text-align: center;
      font-weight: 600;
      color: var(--navy);
      margin-top: 8mm;
      font-size: 11pt;
    }

    .timeline-widget {
      display: flex;
      justify-content: space-between;
      align-items: center;
      position: relative;
      margin: 6mm 0;
      padding: 0 4mm;
    }
    .timeline-widget::before {
      content: '';
      position: absolute;
      left: 20px;
      right: 20px;
      top: 15px;
      height: 4px;
      background: #CBD5E1;
      z-index: 1;
    }
    .timeline-node {
      position: relative;
      z-index: 2;
      display: flex;
      flex-direction: column;
      align-items: center;
      flex: 1;
    }
    .timeline-dot {
      width: 30px;
      height: 30px;
      border-radius: 50%;
      background: var(--white);
      border: 3px solid #CBD5E1;
      display: flex;
      align-items: center;
      justify-content: center;
      font-weight: 700;
      font-size: 9pt;
      color: #64748B;
    }
    .timeline-node.active .timeline-dot {
      border-color: var(--navy);
      background: var(--navy);
      color: var(--white);
      box-shadow: 0 0 10px rgba(11, 25, 44, 0.3);
    }
    .timeline-node.completed .timeline-dot {
      border-color: var(--navy);
      background: var(--white);
      color: var(--navy);
    }
    .timeline-label {
      margin-top: 2mm;
      font-size: 8pt;
      font-weight: 700;
      text-align: center;
      text-transform: uppercase;
      color: #64748B;
    }
    .timeline-node.active .timeline-label {
      color: var(--navy);
    }
    .timeline-date {
      font-size: 7.5pt;
      color: #94A3B8;
      margin-top: 0.5mm;
      text-align: center;
    }

    .contrast-box {
      display: flex;
      gap: 4mm;
      margin-bottom: 3.5mm;
    }
    .contrast-col {
      flex: 1;
      padding: 3mm 4mm;
      border-radius: 6px;
    }
    .contrast-illusion {
      background: rgba(225, 29, 72, 0.02);
      border: 1.5px solid rgba(225, 29, 72, 0.15);
      border-radius: 6px;
    }
    .contrast-reality {
      background: rgba(5, 150, 105, 0.02);
      border: 1.5px solid rgba(5, 150, 105, 0.15);
      border-radius: 6px;
    }
    .contrast-title {
      font-weight: 700;
      font-size: 9pt;
      text-transform: uppercase;
      margin-bottom: 1.5mm;
      display: flex;
      align-items: center;
      gap: 1.5mm;
    }
    .contrast-illusion .contrast-title { color: #E11D48; }
    .contrast-reality .contrast-title { color: #059669; }
    .contrast-text {
      font-size: 9.8pt;
      line-height: 1.45;
    }

    .mistake-box {
      background: rgba(245, 158, 11, 0.02);
      border: 1.5px solid rgba(245, 158, 11, 0.15);
      padding: 3mm 4mm;
      border-radius: 6px;
      margin-bottom: 3mm;
    }
    .mistake-title {
      font-weight: 700;
      color: #D97706;
      font-size: 9pt;
      text-transform: uppercase;
      margin-bottom: 1mm;
    }
    .mistake-text {
      font-size: 9.8pt;
      line-height: 1.45;
      color: #451A03;
    }

    .stability-map {
      display: flex;
      gap: 4mm;
      margin-bottom: 3.5mm;
    }
    .stability-card {
      flex: 1;
      padding: 3.5mm;
      border-radius: 8px;
      border: 1.5px solid rgba(11, 25, 44, 0.15);
    }
    .stability-card.test {
      background: rgba(11, 25, 44, 0.02);
    }
    .stability-card.protect {
      background: rgba(79, 70, 229, 0.02);
      border-color: rgba(79, 70, 229, 0.2);
    }
    .stability-header {
      font-weight: 700;
      font-size: 9pt;
      text-transform: uppercase;
      color: var(--navy);
      margin-bottom: 2mm;
      border-bottom: 1px solid rgba(11, 25, 44, 0.10);
      padding-bottom: 1mm;
    }
    .stability-item {
      font-size: 9.5pt;
      line-height: 1.45;
      margin-bottom: 2mm;
    }
    .stability-item:last-child {
      margin-bottom: 0;
    }
    .stability-item strong {
      color: var(--navy);
    }

    .scale-container {
      display: flex;
      align-items: center;
      gap: 1.5mm;
      margin-top: 1mm;
    }
    .scale-label {
      font-size: 8.5pt;
      font-weight: 700;
      text-transform: uppercase;
    }
    .scale-low { color: #64748B; }
    .scale-moderate { color: #D97706; }
    .scale-strong { color: #2563EB; }
    .scale-very-strong { color: #7C3AED; }

    .checklist-item {
      display: flex;
      align-items: flex-start;
      gap: 2.5mm;
      margin-bottom: 2mm;
    }
    .checklist-box {
      width: 14px;
      height: 14px;
      border: 1.5px solid var(--navy);
      border-radius: 3px;
      margin-top: 1px;
      flex-shrink: 0;
    }
    .checklist-text {
      font-size: 9.8pt;
      line-height: 1.4;
      color: var(--text-main);
    }

    .habit-grid {
      display: grid;
      grid-template-columns: repeat(7, 1fr);
      gap: 1.5mm;
      margin-top: 2.5mm;
    }
    .habit-day {
      border: 1px solid #CBD5E1;
      height: 25px;
      border-radius: 4px;
      display: flex;
      align-items: center;
      justify-content: center;
      font-size: 8pt;
      font-weight: 700;
      color: #94A3B8;
    }

  </style>
</head>
<body>

  <!-- PAGE 1: COVER PAGE -->
  <div class="img-page-bg bg-cover"></div>

  <!-- PAGE 2: DISCLAIMER -->
  ${createStandardPage(2, "Vedic Limitations & Legal Disclaimer", "Report Disclaimer", `
    <div class="narrative-block">
      <div class="narrative-label">Nature of Astrological Interpretation</div>
      <p class="narrative-text">
        Vedic astrology (Jyotish) is a highly sophisticated, symbolic system of knowledge designed to interpret planetary movements and transit impacts on human life. All interpretations, reports, and forecasts provided within this Saturn Transit Analysis represent tendencies, potentialities, and supportive guides rather than absolute, unalterable predictions of future events. Human free will, personal choice, environmental variables, and individual karma play equal roles in shaping destiny.
      </p>
    </div>
    <div class="narrative-block">
      <div class="narrative-label">Supportive Remedial Actions</div>
      <p class="narrative-text">
        The remedies described in this report, including spiritual practices, mantra recitations, physical exercises, charity, and lifestyle adjustments, are supportive and preventative in nature. They are recommended to harmonize planetary energy and reduce inertia, but they are not guarantees of specific, immediate outcomes. Outcomes of remedies depend heavily on devotion, regularity, and behavioral reform.
      </p>
    </div>
    <div class="narrative-block">
      <div class="narrative-label">Professional Counsel &amp; Medical Advice</div>
      <p class="narrative-text">
        This report is generated for self-reflection and guidance. It is not a replacement for professional legal, medical, psychiatric, or financial counsel. For health issues, clinical anxieties, financial debt, or legal disputes, always consult qualified licensed professionals in those respective fields. Under no circumstances should Graho Astrology or its affiliates be held liable for any decisions made based on this guidance.
      </p>
    </div>
    <div class="disclaimer-box">
      "Use this report as guidance, not final truth"
    </div>
  `)}

  <!-- PAGE 3: TABLE OF CONTENTS -->
  ${createStandardPage(3, "Roadmap of the Report", "Table of Contents", `
    <div class="info-card" style="margin-top: 4mm;">
      <div class="info-card-title">Document Directory</div>
      <div class="toc-row">
        <span class="toc-num">01</span>
        <span class="toc-title">Personal Astrological Profile &amp; Chart Snapshot</span>
        <span class="toc-dots"></span>
        <span class="toc-page">Pages 4-5</span>
      </div>
      <div class="toc-row">
        <span class="toc-num">02</span>
        <span class="toc-title">Current Saturn Timeline Overview</span>
        <span class="toc-dots"></span>
        <span class="toc-page">Pages 6-7</span>
      </div>
      <div class="toc-row">
        <span class="toc-num">03</span>
        <span class="toc-title">Current Sade Sati Cycle Status</span>
        <span class="toc-dots"></span>
        <span class="toc-page">Page 8</span>
      </div>
      <div class="toc-row">
        <span class="toc-num">04</span>
        <span class="toc-title">Vedic Foundations: Cosmic Blueprint, Philosophy &amp; Wisdom</span>
        <span class="toc-dots"></span>
        <span class="toc-page">Pages 10-14</span>
      </div>
      <div class="toc-row">
        <span class="toc-num">05</span>
        <span class="toc-title">Detailed Analysis of the Three Phases</span>
        <span class="toc-dots"></span>
        <span class="toc-page">Pages 16-25</span>
      </div>
      <div class="toc-row">
        <span class="toc-num">06</span>
        <span class="toc-title">Impact on Key Life Areas &amp; Minor Cycles</span>
        <span class="toc-dots"></span>
        <span class="toc-page">Pages 26-28</span>
      </div>
      <div class="toc-row">
        <span class="toc-num">07</span>
        <span class="toc-title">Personalized House &amp; Domain Interpretation Layers</span>
        <span class="toc-dots"></span>
        <span class="toc-page">Pages 29-33</span>
      </div>
      <div class="toc-row">
        <span class="toc-num">08</span>
        <span class="toc-title">The Remedial Path &amp; Daily Action Plan</span>
        <span class="toc-dots"></span>
        <span class="toc-page">Pages 35-39</span>
      </div>
      <div class="toc-row">
        <span class="toc-num">09</span>
        <span class="toc-title">Forecast Dashboard, Affirmations &amp; Appendix</span>
        <span class="toc-dots"></span>
        <span class="toc-page">Pages 40-47</span>
      </div>
      <div class="toc-row">
        <span class="toc-num">10</span>
        <span class="toc-title">Frequently Asked Questions (Personalized FAQ)</span>
        <span class="toc-dots"></span>
        <span class="toc-page">Pages 48-49</span>
      </div>
    </div>
  `)}

  <!-- PAGE 4: PERSONAL DETAILS & SNAPSHOT -->
  ${createStandardPage(4, "Native Profile & Lagna Chart", "Personal Snapshot", `
    <div class="grid-2" style="margin-top: 3mm; align-items: stretch;">
      <div style="display: flex; flex-direction: column; gap: 3mm;">
        <div class="info-card" style="margin-bottom: 0;">
          <div class="info-card-title">Birth Details</div>
          <div class="info-card-row"><span class="info-card-label">Full Name</span><span class="info-card-value">${escapeHtml(fullName)}</span></div>
          <div class="info-card-row"><span class="info-card-label">Date of Birth</span><span class="info-card-value">${escapeHtml(formattedDob)}</span></div>
          <div class="info-card-row"><span class="info-card-label">Time of Birth</span><span class="info-card-value">${escapeHtml(timeOfbirth)}</span></div>
          <div class="info-card-row"><span class="info-card-label">Place of Birth</span><span class="info-card-value" style="font-size: 8.5pt;">${escapeHtml(placeOfBirth)}</span></div>
          <div class="info-card-row"><span class="info-card-label">Gender / Age</span><span class="info-card-value">${escapeHtml(gender)} / ${escapeHtml(age)}</span></div>
        </div>
        <div class="info-card" style="margin-bottom: 0;">
          <div class="info-card-title">Astrological Placements</div>
          <div class="info-card-row"><span class="info-card-label">Lagna (Ascendant)</span><span class="info-card-value">${escapeHtml(astro.ascendant)}</span></div>
          <div class="info-card-row"><span class="info-card-label">Moon Sign (Rashi)</span><span class="info-card-value">${escapeHtml(astro.moonSign)}</span></div>
          <div class="info-card-row"><span class="info-card-label">Nakshatra</span><span class="info-card-value">${escapeHtml(astro.nakshatra)}</span></div>
          <div class="info-card-row"><span class="info-card-label">Saturn Sign / House</span><span class="info-card-value" style="font-size: 8pt;">${escapeHtml(astro.saturnPlacement)}</span></div>
          <div class="info-card-row"><span class="info-card-label">Sade Sati Status</span><span class="info-card-value" style="color: ${astro.sadesati?.isCurrentlyActive ? '#E11D48' : '#059669'}; font-weight: bold;">${astro.sadesati?.isCurrentlyActive ? "ACTIVE" : "INACTIVE"}</span></div>
        </div>
      </div>
      <div style="display: flex; justify-content: center; align-items: center;">
        ${renderChartSvg(charts.rasiChart, astro.ascendant, "Lagna Chart (D1)")}
      </div>
    </div>
  `)}

  <!-- PAGE 5: PERSONAL SNAPSHOT INTERPRETATION -->
  ${createStandardPage(5, "Personal Snapshot Interpretation", "Snapshot Interpretation", `
    <div class="info-card" style="margin-top: 4mm;">
      <div class="info-card-title">Snapshot Interpretation</div>
      <p style="font-size: 11pt; line-height: 1.6; color: var(--text-main);">
        ${escapeHtml(getVal("personalAstrologySnapshot.snapshotInterpretation", `Your birth chart reveals that the Moon is placed in the constellation of ${astro.nakshatra} within the sign of ${astro.moonSign}. This creates a specific psychological makeup where emotional responses are guided by the lord of this Nakshatra. Saturn's current transit will test this foundational blueprint, bringing structured learning, psychological consolidation, and a restructuring of emotional and material security patterns.`))}
      </p>
    </div>
    <div class="info-card">
      <div class="info-card-title">Key Placements &amp; Moon Sign Significance</div>
      <p style="font-size: 10.8pt; line-height: 1.55; color: var(--text-muted);">
        <strong>Why Moon sign matters:</strong> ${escapeHtml(getVal("personalAstrologySnapshot.moonSignNakshatraExplanation", "In Vedic astrology, the Moon represents the mind, emotional balance, perception, and subjective experience. Sade Sati is calculated as the transit of Saturn through the 12th, 1st, and 2nd houses from your natal Moon sign. Because the Moon governs the subconscious, this transit primarily impacts your inner life first, restructuring how you experience pressure, security, and relationship ties."))}
      </p>
    </div>
  `)}

  <!-- PAGE 6: THE SATURN TRANSIT TIMELINE -->
  ${createStandardPage(6, "The Saturn Transit Timeline", "Transit Timeline", `
    <div class="info-card" style="margin-top: 3mm;">
      <div class="info-card-title">Visual Transit Path</div>
      <div class="timeline-widget">
        <div class="timeline-node completed">
          <div class="timeline-dot">12th</div>
          <div class="timeline-label">Phase 1: Rising</div>
          <div class="timeline-date">Restlessness</div>
        </div>
        <div class="timeline-node ${astro.sadesati?.isCurrentlyActive ? 'active' : ''}">
          <div class="timeline-dot">1st</div>
          <div class="timeline-label">Phase 2: Peak</div>
          <div class="timeline-date">Saturn over Moon</div>
        </div>
        <div class="timeline-node">
          <div class="timeline-dot">2nd</div>
          <div class="timeline-label">Phase 3: Setting</div>
          <div class="timeline-date">Stabilization</div>
        </div>
      </div>
      <div style="text-align: center; font-size: 9.5pt; font-weight: 700; color: var(--navy); margin-top: 1mm;">
        Current Status Indicator: ${astro.sadesati?.isCurrentlyActive ? "Active Transit Period" : "Non-Active Period (Consolidation)"}
      </div>
    </div>
    
    <div class="info-card">
      <div class="info-card-title">Timeline Notes &amp; Dynamic Triggers</div>
      <p style="font-size: 11pt; line-height: 1.6; color: var(--text-main);">
        The Sade Sati path represents a series of energetic triggers. It shifts your focus through three main arenas of consciousness. In the 12th transit, Saturn creates restless transitions. In the 1st transit, it targets your inner stability and emotional focus. Finally, in the 2nd transit, it restructures family and material dynamics. Fulfilling your obligations calmly will smooth out the transit friction.
      </p>
      <p style="font-size: 10.5pt; line-height: 1.55; color: var(--text-muted); margin-top: 3mm;">
        The windows listed on the following page indicate when Saturn directly transits these sectors. Retrograde cycles will cause brief shifts, where Saturn temporarily retreats into the previous sign, offering a short window to review and adjust your efforts before the transit resumes.
      </p>
    </div>
  `)}

  <!-- PAGE 7: CALCULATED SADE SATI WINDOWS -->
  ${createStandardPage(7, "Calculated Sade Sati Windows", "Transit Windows", `
    <div class="info-card" style="margin-top: 4mm;">
      <div class="info-card-title">Sade Sati Transit Periods</div>
      <div class="table-wrap">
        <table class="premium-table">
          <thead>
            <tr>
              <th>Transit Phase / Cycle</th>
              <th>Zodiac Sign</th>
              <th>Start Date</th>
              <th>End Date</th>
            </tr>
          </thead>
          <tbody>
            ${(astro.sadesati?.periods || []).map(p => `
              <tr>
                <td style="font-weight:700;">${escapeHtml(p.type)}</td>
                <td>${escapeHtml(p.sign_name)}</td>
                <td>${escapeHtml(formatDate(p.start_date))}</td>
                <td>${escapeHtml(formatDate(p.end_date))}</td>
              </tr>
            `).join("")}
            ${(astro.sadesati?.periods || []).length === 0 ? `
              <tr>
                <td colspan="4" style="text-align:center; color:var(--text-muted); padding: 5mm 0;">No active transits detected or calculated for this cycle.</td>
              </tr>
            ` : ""}
          </tbody>
        </table>
      </div>
    </div>

    <div class="info-card">
      <div class="info-card-title">Understanding Transit Windows</div>
      <p style="font-size: 10.2pt; line-height: 1.5; color: var(--text-muted);">
        The periods listed above show the exact dates when transit Saturn enters and leaves the signs adjacent to your natal Moon. Retrograde periods during these dates can shift Saturn temporarily back and forth between signs, which is why transition zones might feel particularly volatile or intense. Keep this table as a reference to track active periods.
      </p>
    </div>
  `)}

  <!-- PAGE 8: WHERE YOU STAND RIGHT NOW -->
  ${createStandardPage(8, "Where You Stand Right Now", "Cycle Status", `
    <div class="narrative-block" style="margin-top: 3mm;">
      <div class="narrative-label">What This Means for You</div>
      <p class="narrative-text">
        ${escapeHtml(getVal("sadeSatiStatusOverview.currentStatusAnalysis", "Based on your chart details, Saturn is currently transiting a critical zone relative to your Moon. If Sade Sati is active, you are undergoing a major restructuring process. Your mind, emotions, and practical structures are receiving a systematic update. If it is inactive, you are in a phase of integration, where lessons from the previous cycle must be consolidated, and foundation built for future growth without the intense pressure of direct transits."))}
      </p>
    </div>
    
    <div class="grid-2">
      <div class="info-card">
        <div class="info-card-title" style="color: var(--navy);">Main Lesson of This Cycle</div>
        <p style="font-size: 9.8pt; line-height: 1.45; color: var(--text-main);">
          ${escapeHtml(getVal("sadeSatiStatusOverview.mainLesson", "The central theme of this period is developing emotional accountability and practical discipline. Saturn demands that you take complete ownership of your internal stability, rather than relying on external validation, false structures, or habitual patterns. Delay is not denial, but a tool for refinement."))}
        </p>
      </div>
      
      <div class="info-card">
        <div class="info-card-title" style="color: #E11D48;">Main Caution &amp; Warning</div>
        <p style="font-size: 9.8pt; line-height: 1.45; color: var(--text-main);">
          ${escapeHtml(getVal("sadeSatiStatusOverview.mainCaution", "Avoid impulsive relocations, reactive relationship decisions, or taking on high-risk financial debt. Saturn tests your impulsiveness; hasty choices made to escape temporary pressure will result in long-term delays and lessons. Ground your actions in patience and quiet introspection."))}
        </p>
      </div>
    </div>

    <div class="info-card">
      <div class="info-card-title">Maturation Shift</div>
      <p style="font-size: 9.8pt; line-height: 1.45; color: var(--text-muted);">
        Every Saturn cycle takes approximately 29.5 years. If this is your first cycle (under age 30), it tests self-image, identity, and early career choices. If this is your second cycle (age 30 to 60), it demands professional consolidation, deep family responsibilities, and emotional maturity. Your current age of ${escapeHtml(age)} indicates that this transit acts as a powerful catalyst for defining your true path.
      </p>
    </div>
  `)}

  <!-- DIVIDER 1: UNDERSTANDING SADE SATI -->
  <div class="img-page-bg bg-div-overview"></div>

  <!-- PAGE 10: COSMIC BLUEPRINT -->
  ${createStandardPage(10, "Understanding the Cosmic Blueprint", "Vedic Astro Logic", `
    <div class="narrative-block">
      <div class="narrative-label">Moon Sign as the Emotional Center</div>
      <p class="narrative-text">
        ${escapeHtml(getVal("cosmicBlueprint.moonAsEmotionalCenter", "The natal Moon represents the sensory mind, the emotional landscape, and how a person processes experiences. Unlike the Sun which represents the soul's essence, the Moon dictates how we feel about what is happening around us. Under Saturn's gaze, this emotional center is analyzed and structured, exposing our vulnerabilities and training our mind to remain stable under environmental pressure."))}
      </p>
    </div>
    
    <div class="narrative-block">
      <div class="narrative-label">Nakshatra Significance</div>
      <p class="narrative-text">
        ${escapeHtml(getVal("cosmicBlueprint.nakshatraSignificance", "Your Nakshatra represents the specific flavor of your emotional nature. Saturn's transit behaves differently depending on the Nakshatra lord. As Saturn transits your natal star, it triggers lessons relating to the star's themes, demanding that you align with the highest manifestation of this lunar mansion and abandon lower, reactive patterns."))}
      </p>
    </div>

    <div class="grid-2">
      <div class="info-card">
        <div class="info-card-title">Why Saturn Targets the Moon</div>
        <p style="font-size: 9.8pt; line-height: 1.4; color: var(--text-main);">
          ${escapeHtml(getVal("cosmicBlueprint.whySaturnTargetsMoon", "Saturn targets the Moon sign because emotional reactions are the root of all human attachment and impulsive karma. By bringing structure to the Moon, Saturn helps the native transcend shallow emotional reactions, cultivating mental stillness and deep maturity."))}
        </p>
      </div>
      
      <div class="info-card">
        <div class="info-card-title">Why Inner Life is Affected First</div>
        <p style="font-size: 9.8pt; line-height: 1.4; color: var(--text-main);">
          ${escapeHtml(getVal("cosmicBlueprint.innerLifeEffect", "Before external circumstances change, the internal perspective shifts. Saturn's transit over the Moon represents an emotional pressure cooker. This forces the native to introspect, seek spiritual solace, and dismantle false internal beliefs before correcting outer circumstances."))}
        </p>
      </div>
    </div>
  `)}

  <!-- PAGE 11: PHILOSOPHY OF THE TRANSIT -->
  ${createStandardPage(11, "Philosophy of the Saturnian Transit", "Astrology Philosophy", `
    <div class="narrative-block">
      <div class="narrative-label">The Diamond Process: Refinement &amp; Growth</div>
      <p class="narrative-text">
        ${escapeHtml(getVal("philosophyOfTransit.diamondProcessRefinement", "Saturn is not a punitive agent; it is the cosmic refiner. Just as carbon is subjected to immense pressure and heat to manifest as a diamond, the human mind is subjected to delays, isolation, and challenges to crystallize its inner strength. This period is a spiritual laboratory designed to replace emotional fragility with enduring wisdom, teaching you that delays are merely tests of your dedication."))}
      </p>
    </div>
    
    <div class="narrative-block">
      <div class="narrative-label">Removing False Supports</div>
      <p class="narrative-text">
        ${escapeHtml(getVal("philosophyOfTransit.removingFalseSupports", "Saturn systematically removes anything that is not built on truth. If your relationships, career status, or financial structures are based on illusion, shallow shortcuts, or external dependencies, Saturn will dissolve them. While this feels painful initially, it is a protective mechanism that ensures your life's foundation is built on absolute reality and self-reliance."))}
      </p>
    </div>

    <div class="info-card">
      <div class="info-card-title">Core Message of the Transit</div>
      <p style="font-size: 10pt; line-height: 1.45; font-weight: 500; color: var(--navy); border: 1.5px solid rgba(11, 25, 44, 0.12); padding: 3mm 4mm; border-radius: 4px; background: var(--navy-light);">
        ${escapeHtml(getVal("philosophyOfTransit.coreMessage", "Saturn asks you to stop seeking short-term escapes. True peace comes from quiet discipline, steady effort, and aligning your actions with cosmic order."))}
      </p>
    </div>

    <div class="contrast-box">
      <div class="contrast-col contrast-illusion">
        <div class="contrast-title">Illusion (What We Want)</div>
        <p class="contrast-text">${escapeHtml(getVal("philosophyOfTransit.illusionVsReality", "Expecting quick success, relying on external approval, avoiding difficult work, and running from structural responsibility."))}</p>
      </div>
      <div class="contrast-col contrast-reality">
        <div class="contrast-title">Reality (What Saturn Demands)</div>
        <p class="contrast-text">Accepting delays, developing inner peace, building consistent routines, and stepping into quiet authority and responsibility.</p>
      </div>
    </div>
  `)}

  <!-- PAGE 12: THE DIVINE PURPOSE - SHLOKA & WISDOM -->
  ${createStandardPage(12, "Sade Sati: The Forge of Destiny", "Cosmic Wisdom", `
    <div class="info-card" style="margin-top: 4mm; text-align: center; padding: 6mm 5mm; border: 1.5px solid rgba(11, 25, 44, 0.15);">
      <div style="font-size: 14pt; font-weight: 700; color: var(--navy); line-height: 1.8; margin-bottom: 4mm; font-family: 'Georgia', serif;">
        कर्मण्येवाधिकारस्ते मा फलेषु कदाचन ।<br>
        मा कर्मफलहेतुर्भूर्मा ते सङ्गोऽस्त्वकर्मणि ॥
      </div>
      <div style="font-size: 10pt; font-style: italic; color: var(--text-muted); margin-bottom: 4mm; line-height: 1.5;">
        "karmaṇy-evādhikāras te mā phaleṣu kadācana |<br>
        mā karma-phala-hetur bhūr mā te saṅgo ’stv-akarmaṇi"
      </div>
      <div style="font-size: 11.5pt; font-weight: 700; color: var(--navy); border-top: 1px solid rgba(11,25,44,0.1); padding-top: 4mm;">
        Bhagavad Gita · Chapter 2, Verse 47
      </div>
    </div>

    <div class="info-card">
      <div class="info-card-title">The Translation</div>
      <p style="font-size: 11pt; line-height: 1.55; color: var(--text-main); text-align: justify; font-style: italic;">
        "You have a designated right to perform your duty, but you are never entitled to the fruits of your actions. Never consider yourself to be the cause of the results of your activities, and never be attached to inaction."
      </p>
    </div>

    <div class="info-card">
      <div class="info-card-title">Vedic Reflection &amp; Sade Sati's True Nature</div>
      <p style="font-size: 10.5pt; line-height: 1.6; color: var(--text-main); text-align: justify; margin-bottom: 3mm;">
        In popular culture, Shani Sade Sati is often misunderstood as a curse or a period of continuous misfortune. However, Vedic philosophy reveals that Saturn (Shani Dev) is the <strong>Karma-Adhikari</strong> — the divine administrator of justice. Saturn's 7.5-year transit is not a punitive phase, but a cosmic testing period designed to dismantle false pride, test endurance, and refine the soul's character.
      </p>
      <p style="font-size: 10.5pt; line-height: 1.6; color: var(--text-main); text-align: justify;">
        By focusing purely on self-effort, discipline, and honest work (Karma), and letting go of anxiety regarding immediate rewards (Phala), you align directly with Saturn's highest energy. This transit ultimately rewards those who step up their accountability, work with humility, and recognize that delays are merely opportunities for consolidation. Sade Sati is the forge that crystallizes your inner strength.
      </p>
    </div>
  `)}

  <!-- PAGE 13: SATURN'S TEACHING STYLE -->
  ${createStandardPage(13, "Saturn's Pedagogical Methods", "Teaching Style", `
    <div class="narrative-block">
      <div class="narrative-label">Discipline, Delays, and Long-Term Rewards</div>
      <p class="narrative-text">
        ${escapeHtml(getVal("saturnTeachingStyle.disciplineAndDelays", "Saturn (Shani) represents the principle of slow expansion. It works through time, testing your endurance. When you initiate action under Saturn's influence, results are frequently delayed. This delay is not meant to frustrate you, but to test if your motives are pure and if you possess the stability to manage the rewards when they finally arrive."))}
      </p>
    </div>
    
    <div class="narrative-block">
      <div class="narrative-label">Pressure &amp; Accountability</div>
      <p class="narrative-text">
        ${escapeHtml(getVal("saturnTeachingStyle.pressureAndAccountability", "Saturn acts as a strict auditor. Every compromise in integrity, every skipped step in your professional development, and every emotional pattern you avoided will be highlighted under this transit. The pressure you feel is directly proportional to the amount of correction your life path requires. Accountability is the only remedy that dissolves this pressure."))}
      </p>
    </div>

    <div class="mistake-box">
      <div class="mistake-title">Common Mistakes During This Period</div>
      <p class="mistake-text">
        ${escapeHtml(getVal("saturnTeachingStyle.commonMistakes", "Reactivity, blaming external circumstances for delays, complaining, changing jobs or relationships out of frustration, and trying to force quick results through manipulation or shortcut remedies."))}
      </p>
    </div>

    <div class="info-card">
      <div class="info-card-title" style="color: var(--navy);">The Best Response Strategy</div>
      <p style="font-size: 9.8pt; line-height: 1.45; color: var(--text-main);">
        ${escapeHtml(getVal("saturnTeachingStyle.bestResponse", "Adopt a posture of silent service, steady contribution, and physical discipline. Maintain absolute ethical standards, accept delay with mental poise, and focus on building high-quality skills that will serve you for decades."))}
      </p>
    </div>
  `)}

  <!-- PAGE 14: KEY THEMES & AREAS OF EVOLUTION -->
  ${createStandardPage(14, "Key Themes & Areas of Evolution", "Transit Themes", `
    <div class="narrative-block">
      <div class="narrative-label">The Blueprint of Evolutionary Change</div>
      <p class="narrative-text">
        ${escapeHtml(getVal("majorThemesSummary.overview", "Saturn's transit across your lunar houses systematically targets specific domains: career authority, financial reserves, relationship authenticity, and mental stillness. Rather than causing general havoc, it selectively restricts ease in these sectors to force you to construct sturdier, long-term frameworks. By understanding this target areas, you can transition from resistance to active cooperation with the transit."))}
      </p>
    </div>

    <div class="grid-2" style="margin-top: 3mm;">
      <div class="info-card" style="border-top: 4px solid var(--navy);">
        <div class="info-card-title">What May Change &amp; Evolve</div>
        <p style="font-size: 9.8pt; line-height: 1.45; color: var(--text-main);">
          ${escapeHtml(getVal("majorThemesSummary.whatMayChange", "Your career path might require restructuring or skill updates. Weak relationships may dissolve, and financial strategies must shift from speculative gains to systematic saving and conservative asset management."))}
        </p>
      </div>

      <div class="info-card" style="border-top: 4px solid var(--gold);">
        <div class="info-card-title">What Should Stay &amp; Be Protected</div>
        <p style="font-size: 9.8pt; line-height: 1.45; color: var(--text-main);">
          ${escapeHtml(getVal("majorThemesSummary.whatShouldStay", "Maintain your daily spiritual practices, ethical principles, support for dependents, commitment to service, and baseline routines. Conserve your energy and protect your mental space from outer chaos."))}
        </p>
      </div>
    </div>

    <div class="info-card">
      <div class="info-card-title">Life Themes Summary</div>
      <div class="table-wrap">
        <table class="premium-table">
          <thead>
            <tr>
              <th>Life Domain</th>
              <th>What Saturn Tests</th>
              <th>Target Evolution</th>
            </tr>
          </thead>
          <tbody>
            <tr><td><strong>Career</strong></td><td>Status &amp; Effort</td><td>Consistent, humble contribution</td></tr>
            <tr><td><strong>Relationships</strong></td><td>Authenticity</td><td>Healthy boundaries &amp; mutual support</td></tr>
            <tr><td><strong>Finance</strong></td><td>Spending habits</td><td>Resource conservation &amp; debt reduction</td></tr>
            <tr><td><strong>Mind</strong></td><td>Mental stillness</td><td>Replacing anxiety with quiet wisdom</td></tr>
          </tbody>
        </table>
      </div>
    </div>
  `)}

  <!-- DIVIDER 2: THE THREE PHASES -->
  <div class="img-page-bg bg-div-phases"></div>

  <!-- PAGE 16: PHASE 1 INTRODUCTION -->
  ${createStandardPage(16, "Phase 1: The Rising Phase (12th Transit)", "The Three Phases", `
    <div class="narrative-block">
      <div class="narrative-label">Why This Phase Begins</div>
      <p class="narrative-text">
        ${escapeHtml(getVal("phase1Intro.risingPhaseOverview", "Sade Sati begins when Saturn enters the 12th house from your natal Moon. This house represents expenses, isolation, foreign travels, sleep, and the subconscious mind. As Saturn transits this sector, it initiates a subtle withdrawal of energy from external activities, turning your attention inward. This phase is characterized by a feeling of displacement, restlessness, and the initial crumbling of outdated structures."))}
      </p>
    </div>
    
    <div class="narrative-block">
      <div class="narrative-label">Emotional Tone of the Phase</div>
      <p class="narrative-text">
        ${escapeHtml(getVal("phase1Intro.emotionalTone", "The primary emotional tone is one of restlessness and a vague desire to escape current circumstances. You may feel disconnected from your immediate environment, experiencing temporary dissatisfaction with your achievements. Restlessness in the feet and a feeling of wandering are common indicators of this phase as Saturn prompts you to search for deeper meaning."))}
      </p>
    </div>

    <div class="grid-2">
      <div class="info-card">
        <div class="info-card-title">Phase Intent</div>
        <p style="font-size: 9.8pt; line-height: 1.4; color: var(--text-main);">
          ${escapeHtml(getVal("phase1Intro.phaseIntent", "The spiritual intent is to detach you from superficial material pursuits and force you to look at your subconscious blocks. It demands quiet solitude and spiritual realignment."))}
        </p>
      </div>

      <div class="info-card">
        <div class="info-card-title">Likely Experience</div>
        <p style="font-size: 9.8pt; line-height: 1.4; color: var(--text-main);">
          ${escapeHtml(getVal("phase1Intro.likelyExperience", "Expect increased expenditures, minor disturbances in sleep patterns, feelings of isolation, and sudden changes in your daily professional landscape."))}
        </p>
      </div>
    </div>
  `)}

  <!-- PAGE 17: PHASE 1 DETAILED MEANING -->
  ${createStandardPage(17, "Restlessness, Movement & Body Symbolism", "Phase 1 detailed", `
    <div class="narrative-block">
      <div class="narrative-label">Movement, Restlessness, and Change</div>
      <p class="narrative-text">
        ${escapeHtml(getVal("phase1Detail.movementAndRestlessness", "During the 12th transit, Saturn creates a high level of physical and mental restlessness. The individual frequently experiences a strong desire to relocate, change jobs, or travel to escape feeling stuck. However, Saturn warns that physical movement without internal change will only replicate the same challenges in a new location. Introspective stability must be cultivated first."))}
      </p>
    </div>
    
    <div class="narrative-block">
      <div class="narrative-label">Career Pressure &amp; Feet Symbolism</div>
      <p class="narrative-text">
        ${escapeHtml(getVal("phase1Detail.careerPressure", "Professionally, you may feel an invisible pressure to perform, accompanied by a lack of recognition. In traditional Vedic texts, the 12th house governs the feet. Restlessness or fatigue in the feet and lower limbs during this phase is a direct symbolic warning from Saturn: do not run ahead impulsively; ground your feet and walk with slow, conscious steps."))}
        ${escapeHtml(getVal("phase1Detail.bodyFeetSymbolism", ""))}
      </p>
    </div>

    <div class="grid-2">
      <div class="info-card">
        <div class="info-card-title" style="color: #E11D48;">What to Avoid</div>
        <p style="font-size: 9.6pt; line-height: 1.4; color: var(--text-main);">
          ${escapeHtml(getVal("phase1Detail.whatToAvoid", "Avoid impulsive resignations, speculative investments, taking on loans for luxury, and blaming others for your feelings of isolation."))}
        </p>
      </div>

      <div class="info-card">
        <div class="info-card-title" style="color: #059669;">What to Do Instead</div>
        <p style="font-size: 9.6pt; line-height: 1.4; color: var(--text-main);">
          ${escapeHtml(getVal("phase1Detail.whatToDoInstead", "Engage in systematic planning, physical grounding (yoga, walks), charity, sleep hygiene, and voluntary solitude for introspection."))}
        </p>
      </div>
    </div>

    <div class="mistake-box">
      <div class="mistake-title">Signs You Are Acting Too Hasty</div>
      <p class="mistake-text">
        ${escapeHtml(getVal("phase1Detail.signsOfActingTooFast", "Making major decisions in a state of high anxiety, planning escapes rather than solving current problems, and neglecting your physical health or routine."))}
      </p>
    </div>
  `)}

  <!-- PAGE 18: PHASE 1 PRACTICAL GUIDANCE -->
  ${createStandardPage(18, "Discipline and Guidance for Phase 1", "Phase 1 Guidance", `
    <div class="narrative-block">
      <div class="narrative-label">Grounding Habits &amp; Career Patience</div>
      <p class="narrative-text">
        ${escapeHtml(getVal("phase1Guidance.practicalDiscipline", "Success in this phase depends entirely on practical discipline and career patience. Grounding habits, such as waking at a consistent time, keeping a structured journal, and organizing your finances, act as anchors against the emotional restlessness of the 12th house. Career stability should be protected; view delays as opportunities to refine your skills and master your craft."))}
        ${escapeHtml(getVal("phase1Guidance.groundingHabits", ""))}
      </p>
    </div>

    <div class="info-card" style="margin-top: 4mm;">
      <div class="info-card-title">Weekly Routine Suggestion</div>
      <p style="font-size: 10.5pt; line-height: 1.6; color: var(--text-main);">
        ${escapeHtml(getVal("phase1Guidance.routineSuggestion", "Dedicate Saturday mornings to volunteering or helping the elderly. Before sleep, practice 10 minutes of silent daily breathing. Review your financial budget weekly to eliminate unnecessary expenditures."))}
      </p>
    </div>
  `)}

  <!-- PAGE 19: PHASE 1 RISK MITIGATION STRATEGY -->
  ${createStandardPage(19, "Phase 1 Risk Mitigation Strategy", "Risk Mitigation", `
    <div class="info-card" style="margin-top: 4mm;">
      <div class="info-card-title">Risk Mitigation Strategy</div>
      <div class="table-wrap">
        <table class="premium-table">
          <thead>
            <tr>
              <th>Life Area</th>
              <th>Vulnerability / Risk</th>
              <th>Saturnian Corrective Approach</th>
            </tr>
          </thead>
          <tbody>
            <tr>
              <td><strong>Career</strong></td>
              <td>${escapeHtml(getVal("phase1Guidance.careerRisk", "Impulsive resignation due to delays"))}</td>
              <td>${escapeHtml(getVal("phase1Guidance.careerApproach", "Cultivate skill mastery; document achievements patiently."))}</td>
            </tr>
            <tr>
              <td><strong>Finance</strong></td>
              <td>${escapeHtml(getVal("phase1Guidance.financeRisk", "Sudden high expenses &amp; loss"))}</td>
              <td>${escapeHtml(getVal("phase1Guidance.financeApproach", "Build conservative emergency fund; strictly avoid speculative trading."))}</td>
            </tr>
            <tr>
              <td><strong>Health</strong></td>
              <td>${escapeHtml(getVal("phase1Guidance.healthRisk", "Insomnia &amp; foot fatigue"))}</td>
              <td>${escapeHtml(getVal("phase1Guidance.healthApproach", "Develop regular bedtime routine; practice foot massage or grounding exercises."))}</td>
            </tr>
          </tbody>
        </table>
      </div>
    </div>

    <div class="info-card">
      <div class="info-card-title">Saturnian Correction Principles</div>
      <p style="font-size: 10.2pt; line-height: 1.55; color: var(--text-muted);">
        Saturn requires that you do not run away from pressure. Address career stagnation by mastering details, secure your financial safety net before spending, and prioritize rhythmic rest for your body. Grounding yourself is the direct remedy for this transit.
      </p>
    </div>
  `)}

  <!-- PAGE 20: PHASE 2 INTRODUCTION -->
  ${createStandardPage(20, "Phase 2: The Peak Phase (1st Transit)", "The Peak Transit", `
    <div class="narrative-block">
      <div class="narrative-label">Saturn Over the Natal Moon</div>
      <p class="narrative-text">
        ${escapeHtml(getVal("phase2Intro.peakPhaseOverview", "The middle phase of Sade Sati is the most critical. It begins when transit Saturn crosses into your natal Moon sign. This is the direct conjunction of Saturn and the Moon. Because the Moon represents the mind and emotional safety, this transit applies direct pressure to your consciousness. The external world slows down, forcing you to confront the reality of your internal state and consolidate your psychological foundation."))}
      </p>
    </div>
    
    <div class="narrative-block">
      <div class="narrative-label">Inner Pressure &amp; Mental Testing</div>
      <p class="narrative-text">
        ${escapeHtml(getVal("phase2Intro.saturnOverMoonInnerPressure", "You may experience this conjunction as a period of mental heaviness, where obstacles appear to multiply. This pressure is not random; it is designed to test your emotional structure. Saturn asks: can you remain calm, responsible, and stable when your external supports are removed? Emotional heaviness is a normal response to this test; accept it as a calling to build true maturity."))}
      </p>
    </div>

    <div class="grid-2">
      <div class="info-card">
        <div class="info-card-title">What is Being Tested</div>
        <p style="font-size: 9.8pt; line-height: 1.4; color: var(--text-main);">
          ${escapeHtml(getVal("phase2Intro.whatIsBeingTested", "Your emotional resilience, self-reliance, capacity to face delays without frustration, and your willingness to act with integrity despite obstacles."))}
        </p>
      </div>

      <div class="info-card">
        <div class="info-card-title">Emotional Warning</div>
        <p style="font-size: 9.8pt; line-height: 1.4; color: var(--text-main);">
          ${escapeHtml(getVal("phase2Intro.emotionalHeavinessWarning", "Do not mistake temporary mental fatigue for permanent failure. Avoid falling into self-pity or isolation; seek support through structure and routine."))}
        </p>
      </div>
    </div>
  `)}

  <!-- PAGE 21: MIND, EMOTION & PHYSICAL VITALITY -->
  ${createStandardPage(21, "Mind, Emotion & Physical Vitality", "Phase 2 Detailed", `
    <div class="narrative-block">
      <div class="narrative-label">Anxiety, Hesitation, and Mental Blankness</div>
      <p class="narrative-text">
        ${escapeHtml(getVal("phase2Detail.anxietyAndHesitation", "During this peak phase, the mind can experience periods of deep hesitation, self-doubt, or anxiety. You might find yourself overthinking decisions, leading to mental fatigue. This is Saturn's way of slowing down your cognitive processes so that you think deeply rather than reacting impulsively. Patience and self-compassion are essential during these mental lulls."))}
      </p>
    </div>
    
    <div class="narrative-block">
      <div class="narrative-label">Sleep, Digestion, and Physical Vitality</div>
      <p class="narrative-text">
        ${escapeHtml(getVal("phase2Detail.sleepAndDigestion", "Saturn's pressure can manifest in the physical body, particularly affecting sleep architecture, digestion, and general energy levels. Restless nights, slow metabolic processes, and feelings of physical fatigue are signals that you need to slow down, simplify your diet, and establish structured resting windows. Do not force your body past its natural limits during this transit."))}
        ${escapeHtml(getVal("phase2Detail.vitalityAndFatigue", ""))}
      </p>
    </div>

    <div class="info-card">
      <div class="info-card-title">Physical Support Routine</div>
      <p style="font-size: 9.8pt; line-height: 1.45; color: var(--text-muted);">
        <strong>Support Routine:</strong> ${escapeHtml(getVal("phase2Detail.supportRoutine", "Maintain a simple, warm vegetarian diet. Practice 15 minutes of gentle physical stretching daily. Establish a fixed sleep schedule, going to bed before 10 PM. View physical rest as a vital component of your transit management strategy, not a sign of failure."))}
      </p>
    </div>
  `)}

  <!-- PAGE 22: VITALITY BALANCE INDICATOR -->
  ${createStandardPage(22, "Vitality Balance Indicator", "Phase 2 Support", `
    <div class="info-card" style="margin-top: 4mm;">
      <div class="info-card-title">Vitality Balance Indicator</div>
      <div class="table-wrap">
        <table class="premium-table">
          <thead>
            <tr>
              <th>Physical Marker</th>
              <th>Saturnian Influence</th>
              <th>Daily Corrective Action</th>
            </tr>
          </thead>
          <tbody>
            <tr>
              <td><strong>Sleep</strong></td>
              <td>${escapeHtml(getVal("phase2Detail.sleepTest", "Disrupted patterns, insomnia"))}</td>
              <td>${escapeHtml(getVal("phase2Detail.sleepAction", "Warm herbal tea, no screen time 1 hour before bed."))}</td>
            </tr>
            <tr>
              <td><strong>Digestion</strong></td>
              <td>${escapeHtml(getVal("phase2Detail.digestionTest", "Slowed metabolism, acidity"))}</td>
              <td>${escapeHtml(getVal("phase2Detail.digestionAction", "Light, freshly cooked meals with mild spices."))}</td>
            </tr>
            <tr>
              <td><strong>Energy</strong></td>
              <td>${escapeHtml(getVal("phase2Detail.energyTest", "Fatigue, muscle stiffness"))}</td>
              <td>${escapeHtml(getVal("phase2Detail.energyAction", "Moderate daily walking, avoid excessive physical exhaustion."))}</td>
            </tr>
          </tbody>
        </table>
      </div>
    </div>
  `)}

  <!-- PAGE 23: SATURNIAN HEALTH ADVICE -->
  ${createStandardPage(23, "Saturnian Health Advice", "Phase 2 Support", `
    <div class="info-card" style="margin-top: 4mm;">
      <div class="info-card-title">Saturnian Health Advice</div>
      <p style="font-size: 10.8pt; line-height: 1.6; color: var(--text-main);">
        Saturn transiting over the natal Moon causes emotional and physical fatigue. The key is structural regularity: eat at fixed hours, sleep at fixed hours, and avoid pushing yourself to exhaustion. Fulfilling your routines silently builds deep physical and mental stamina that protects you throughout the transit.
      </p>
    </div>

    <div class="info-card">
      <div class="info-card-title">Mind-Body Harmonization</div>
      <p style="font-size: 10.2pt; line-height: 1.55; color: var(--text-muted);">
        Physical routines act as the foundation for psychological strength under this transit. When your daily life possesses a predictable structure, the nervous system registers stability, reducing general anxiety and emotional volatility.
      </p>
    </div>
  `)}

  <!-- PAGE 24: PHASE 3 INTRODUCTION -->
  ${createStandardPage(24, "Phase 3: The Setting Phase (2nd Transit)", "The Final Phase", `
    <div class="narrative-block">
      <div class="narrative-label">Restoration of Clarity &amp; Wisdom</div>
      <p class="narrative-text">
        ${escapeHtml(getVal("phase3Intro.settingPhaseOverview", "The final phase of Sade Sati begins when Saturn enters the 2nd house from your natal Moon. This phase represents the setting of the transit, where the intense emotional pressure begins to lift. Clarity and practical wisdom gradually return, allowing you to integrate the profound lessons of the past five years. It is a period of rebuilding, focusing on material security, family communication, and speech discipline."))}
      </p>
    </div>
    
    <div class="narrative-block">
      <div class="narrative-label">Practical Thinking &amp; Stabilization</div>
      <p class="narrative-text">
        ${escapeHtml(getVal("phase3Intro.clarityReturns", "As the mental cloud disperses, your cognitive style shifts back toward practical, long-term thinking. You are no longer reacting out of fear or pressure; instead, you begin to make sober, realistic decisions regarding your career, finances, and relationships. This is the stabilization phase, where the foundation you restructured during the peak is consolidated for long-term growth."))}
      </p>
    </div>

    <div class="grid-2">
      <div class="info-card">
        <div class="info-card-title" style="color: #059669;">Maturity Indicator</div>
        <p style="font-size: 9.8pt; line-height: 1.4; color: var(--text-main);">
          ${escapeHtml(getVal("phase3Intro.maturityIndicator", "The ability to look back at past challenges with gratitude, recognizing how they forced you to grow, and acting with quiet self-reliance."))}
        </p>
      </div>

      <div class="info-card">
        <div class="info-card-title">Shift: Confusion to Clarity</div>
        <p style="font-size: 9.8pt; line-height: 1.4; color: var(--text-main);">
          ${escapeHtml(getVal("phase3Intro.shiftFromConfusionToClarity", "Transitioning from constant fire-fighting and emotional reactivity to strategic planning, solid financial boundaries, and balanced communication."))}
        </p>
      </div>
    </div>
  `)}

  <!-- PAGE 25: WEALTH, FAMILY, SPEECH & IMAGE -->
  ${createStandardPage(25, "Wealth, Family, Speech & Image", "Phase 3 Detailed", `
    <div class="narrative-block">
      <div class="narrative-label">Financial Discipline &amp; Wealth Reconstruction</div>
      <p class="narrative-text">
        ${escapeHtml(getVal("phase3LifeEffects.financialDiscipline", "The 2nd house directly governs wealth, savings, and resources. In this setting phase, Saturn requires you to rebuild your financial structure with absolute realism. Hasty investments or loose spending must be replaced by systematic budgeting and conservative wealth management. Wealth is reconstructed slowly and steadily during this period, rewarding systematic effort."))}
      </p>
    </div>
    
    <div class="narrative-block">
      <div class="narrative-label">Family Dynamics &amp; Speech Discipline</div>
      <p class="narrative-text">
        ${escapeHtml(getVal("phase3LifeEffects.familyCommunication", "The 2nd house also governs speech and the immediate family environment. Misunderstandings can arise easily if speech is reactive or harsh. Saturn demands that you speak with caution, selecting words that are truthful, kind, and brief. Under this transit, family duties increase; detaching yourself from emotional drama while fulfilling your duties is the key to domestic harmony."))}
        ${escapeHtml(getVal("phase3LifeEffects.reputationManagement", ""))}
      </p>
    </div>

    <div class="info-card">
      <div class="info-card-title">Practical Guidance: Speak Less, Observe More</div>
      <p style="font-size: 9.8pt; line-height: 1.45; color: var(--text-main);">
        ${escapeHtml(getVal("phase3LifeEffects.observeAndSpeakLess", "Fulfill family duties without expecting appreciation. Keep financial transactions clear and documented. When conflict arises, take a breath, observe, and respond only after careful reflection."))}
      </p>
    </div>
  `)}

  <!-- PAGE 26: FAMILY & FINANCE STRATEGY -->
  ${createStandardPage(26, "Family & Finance Strategy", "Phase 3 Support", `
    <div class="info-card" style="margin-top: 4mm;">
      <div class="info-card-title">Family &amp; Finance Strategy</div>
      <div class="table-wrap">
        <table class="premium-table">
          <thead>
            <tr>
              <th>Area of Focus</th>
              <th>Vulnerability / Challenge</th>
              <th>Correction Strategy</th>
            </tr>
          </thead>
          <tbody>
            <tr>
              <td><strong>Wealth</strong></td>
              <td>${escapeHtml(getVal("phase3LifeEffects.wealthChallenge", "Slow accumulation, financial blocks"))}</td>
              <td>${escapeHtml(getVal("phase3LifeEffects.wealthCorrection", "Strict monthly savings, avoid new debts, conservative budget."))}</td>
            </tr>
            <tr>
              <td><strong>Family</strong></td>
              <td>${escapeHtml(getVal("phase3LifeEffects.familyChallenge", "Friction in domestic environment"))}</td>
              <td>${escapeHtml(getVal("phase3LifeEffects.familyCorrection", "Fulfill obligations patiently; do not argue over legacy or property."))}</td>
            </tr>
            <tr>
              <td><strong>Speech</strong></td>
              <td>${escapeHtml(getVal("phase3LifeEffects.speechChallenge", "Harsh or misunderstood communication"))}</td>
              <td>${escapeHtml(getVal("phase3LifeEffects.speechCorrection", "Practice silence when angry; use soft, measured speech."))}</td>
            </tr>
          </tbody>
        </table>
      </div>
    </div>
  `)}

  <!-- PAGE 27: SATURNIAN MATERIAL WISDOM -->
  ${createStandardPage(27, "Saturnian Material Wisdom", "Phase 3 Support", `
    <div class="info-card" style="margin-top: 4mm;">
      <div class="info-card-title">Saturnian Material Wisdom</div>
      <p style="font-size: 10.8pt; line-height: 1.6; color: var(--text-main);">
        The setting phase of Sade Sati tests your stability when outer restrictions begin to lift. Focus on rebuilding savings, maintaining soft speech under domestic stress, and serving your family members without expectation of praise. This is the foundation of long-term security.
      </p>
    </div>

    <div class="info-card">
      <div class="info-card-title">Integration Layer</div>
      <p style="font-size: 10.2pt; line-height: 1.55; color: var(--text-muted);">
        Use this final transit phase to secure your structures. Rebuild what was dismantled, set solid boundaries for wealth and communication, and appreciate the stable foundations you have constructed under Saturn's rigorous guidance.
      </p>
    </div>
  `)}

  <!-- DIVIDER 3: MINOR CYCLES & IMPACT -->
  <div class="img-page-bg bg-div-impact"></div>

  <!-- PAGE 29: IMPACT ON KEY LIFE AREAS -->
  ${createStandardPage(29, "Career & Relationship Analysis", "Key Life Sectors", `
    <div class="narrative-block">
      <div class="narrative-label">Saturn's Influence Across Crucial Domains</div>
      <p class="narrative-text">
        ${escapeHtml(getVal("lifeAreaImpact.careerImpact", "Saturn's transit acts as a quality assurance test for your career and relationships. Rather than trying to destroy these areas, Saturn highlights their structural weaknesses. If a professional path or relationship is built on a shaky foundation of convenience or dishonesty, this transit forces a breakdown. This is a constructive process, clearing away superficial bonds and paving the way for authentic growth."))}
      </p>
    </div>

    <div class="grid-2" style="margin-top: 3mm;">
      <div class="info-card" style="border-top: 4px solid var(--navy);">
        <div class="info-card-title">Career Alignment</div>
        <p style="font-size: 9.5pt; line-height: 1.4; color: var(--text-main); margin-bottom: 2mm;">
          <strong>Healthy Response:</strong> ${escapeHtml(getVal("lifeAreaImpact.careerHealthyResponse", "Accept delay, update your professional skills, perform service work, and remain steady despite lack of immediate appreciation."))}
        </p>
        <p style="font-size: 9.5pt; line-height: 1.4; color: #E11D48;">
          <strong>What Not to Do:</strong> ${escapeHtml(getVal("lifeAreaImpact.careerWhatNotToDo", "Avoid arguing with authority figures, changing jobs frequently, or taking shortcuts to bypass hard work."))}
        </p>
      </div>

      <div class="info-card" style="border-top: 4px solid var(--gold);">
        <div class="info-card-title">Relationship Realignment</div>
        <p style="font-size: 9.5pt; line-height: 1.4; color: var(--text-main); margin-bottom: 2mm;">
          <strong>Healthy Response:</strong> ${escapeHtml(getVal("lifeAreaImpact.relationshipHealthyResponse", "Set clear, honest boundaries. Fulfill emotional commitments patiently, and support your partner through structural delays."))}
        </p>
        <p style="font-size: 9.5pt; line-height: 1.4; color: #E11D48;">
          <strong>What Not to Do:</strong> ${escapeHtml(getVal("lifeAreaImpact.relationshipWhatNotToDo", "Avoid reactively ending relationships out of temporary frustration or emotional heaviness."))}
        </p>
      </div>
    </div>

    <div class="info-card">
      <div class="info-card-title">Relationship Blueprint</div>
      <p style="font-size: 9.6pt; line-height: 1.45; color: var(--text-muted);">
        ${escapeHtml(getVal("lifeAreaImpact.relationshipImpact", "Relationships are checked for depth and commitment during this cycle. Only bonds built on mutual respect and shared responsibilities survive Shani's audit."))}
      </p>
    </div>
  `)}

  <!-- PAGE 30: MINOR CYCLES OVERVIEW -->
  ${createStandardPage(30, "Understanding Dhaiya & Panoti Cycles", "Saturn Minor Cycles", `
    <div class="narrative-block">
      <div class="narrative-label">What are Dhaiya and Panoti?</div>
      <p class="narrative-text">
        ${escapeHtml(getVal("minorCycles.panotiAndDhaiyaExplanation", "In Vedic astrology, besides the full 7.5-year Sade Sati, Saturn creates smaller transit cycles called Dhaiya (2.5 years) or Panoti. These occur when Saturn transits the 4th house (Ashtama Shani) or the 8th house (Kantaka Shani) from your natal Moon. While less comprehensive than Sade Sati, these minor cycles bring specific tests, focusing on domestic peace, career focus, and physical routines."))}
      </p>
    </div>
    
    <div class="narrative-block">
      <div class="narrative-label">Why Minor Cycles Matter</div>
      <p class="narrative-text">
        ${escapeHtml(getVal("minorCycles.whyMinorCyclesMatter", "These cycles act as mid-term checks, ensuring you maintain the discipline built during Sade Sati. If you neglected Saturn's lessons of patience, these transits will trigger corrections, reminding you that consistency is required across all phases of life, not just the intense ones."))}
      </p>
    </div>

    <div class="info-card">
      <div class="info-card-title">Saturn Cycles Comparison</div>
      <div class="table-wrap">
        <table class="premium-table">
          <thead>
            <tr>
              <th>Cycle Type</th>
              <th>Astrological Position</th>
              <th>Primary Life Domain</th>
              <th>Severity Scale</th>
            </tr>
          </thead>
          <tbody>
            <tr>
              <td><strong>Full Sade Sati</strong></td>
              <td>12th, 1st, 2nd from Moon</td>
              <td>Mind, Identity, Wealth, Family</td>
              <td><span class="scale-label scale-very-strong">Very Strong</span></td>
            </tr>
            <tr>
              <td><strong>Kantaka Shani</strong></td>
              <td>4th or 8th house from Moon</td>
              <td>Domestic Peace, Mother's health</td>
              <td><span class="scale-label scale-strong">Strong</span></td>
            </tr>
            <tr>
              <td><strong>Ashtama Shani</strong></td>
              <td>8th house from Moon</td>
              <td>Sudden changes, Health routines</td>
              <td><span class="scale-label scale-strong">Strong</span></td>
            </tr>
            <tr>
              <td><strong>Sade Sati Sub-phases</strong></td>
              <td>Varying degrees within signs</td>
              <td>Specific psychological subthemes</td>
              <td><span class="scale-label scale-moderate">Moderate</span></td>
            </tr>
          </tbody>
        </table>
      </div>
    </div>

    <div class="info-card">
      <div class="info-card-title">Severity Scale Explanation</div>
      <p style="font-size: 9.8pt; line-height: 1.45; color: var(--text-main);">
        ${escapeHtml(getVal("minorCycles.severityScaleExplanation", "Severity is qualitative. 'Very Strong' cycles demand total life restructuring. 'Strong' cycles focus on specific corrections in target areas, while 'Moderate' periods test your daily habits and routine structure."))}
      </p>
    </div>
  `)}

  <!-- PAGE 31: HOUSE-WISE IMPACT -->
  ${createStandardPage(31, "Saturn's Transit Position & Aspects", "House Placements", `
    <div class="narrative-block">
      <div class="narrative-label">Zodiac House Position Interpretation</div>
      <p class="narrative-text">
        ${escapeHtml(getVal("houseWiseImpact.saturnHousePositionInterpretation", "Saturn's influence is directed through the specific house it occupies during its transit. In your chart, this house determines the physical environment where lessons will manifest. Whether it is the house of career, relationships, family, or health, Saturn restricts the flow of easy benefits in this sector to make you work for every progress, ensuring that your achievements are stable and permanent."))}
      </p>
    </div>
    
    <div class="narrative-block">
      <div class="narrative-label">Saturn Aspects (Drishti)</div>
      <p class="narrative-text">
        ${escapeHtml(getVal("houseWiseImpact.saturnAspectsInterpretation", "In Vedic astrology, Saturn looks at the 3rd, 7th, and 10th houses from its transit position. These aspects (Drishtis) project Saturn's energy of structure and delay onto other areas of your life. The 3rd aspect demands self-effort, the 7th aspect tests partnership authenticity, and the 10th aspect structures professional duties. Understanding these aspects helps you prepare for multiple layers of influence."))}
      </p>
    </div>

    <div class="grid-2">
      <div class="info-card">
        <div class="info-card-title">Vedic Aspect Rules</div>
        <div class="table-wrap">
          <table class="premium-table">
            <thead>
              <tr>
                <th>Aspect</th>
                <th>Vedic Symbolism</th>
                <th>Your Lesson</th>
              </tr>
            </thead>
            <tbody>
              <tr><td><strong>3rd Aspect</strong></td><td>Effort &amp; Courage</td><td>Step up self-effort</td></tr>
              <tr><td><strong>7th Aspect</strong></td><td>Partnerships</td><td>Enforce authenticity</td></tr>
              <tr><td><strong>10th Aspect</strong></td><td>Career Duty</td><td>Fulfill obligations</td></tr>
            </tbody>
          </table>
        </div>
      </div>

      <div class="info-card">
        <div class="info-card-title">Most Affected Houses</div>
        <p style="font-size: 9.5pt; line-height: 1.4; color: var(--text-main);">
          ${escapeHtml(getVal("houseWiseImpact.mostAffectedHousesExplanation", "The house Saturn transits and the house receiving its 10th aspect are key areas of activity. Focus on maintaining routines and ethical behavior in these sectors to minimize friction."))}
        </p>
      </div>
    </div>
  `)}

  <!-- PAGE 32: CAREER & STUDY IMPACT -->
  ${createStandardPage(32, "Career Restructuring & Study Rhythms", "Work & Study", `
    <div class="narrative-block">
      <div class="narrative-label">Professional Restructuring and Delays</div>
      <p class="narrative-text">
        ${escapeHtml(getVal("careerStudyImpact.careerDelayRestructuring", "Under Saturn's gaze, your career and study path undergo a major transition. Delays in promotions, academic challenges, or increased workloads are common. Saturn is checking if you possess the skills, integrity, and work ethic required for long-term authority. View this period as a professional apprenticeship where you build high-value expertise rather than focusing on quick recognition."))}
      </p>
    </div>
    
    <div class="narrative-block">
      <div class="narrative-label">Best Career Strategy During This Transit</div>
      <p class="narrative-text">
        ${escapeHtml(getVal("careerStudyImpact.bestCareerStrategy", "The best strategy is to focus on steady contribution, skill enhancement, and supporting your colleagues. Do not force career changes or promotions out of frustration. Take on difficult responsibilities with humility, and ensure all your professional documentation and interactions are transparent and ethical."))}
      </p>
    </div>

    <div class="grid-2">
      <div class="info-card">
        <div class="info-card-title" style="color: #E11D48;">Avoid These Mistakes</div>
        <p style="font-size: 9.6pt; line-height: 1.4; color: var(--text-main);">
          ${escapeHtml(getVal("careerStudyImpact.avoidTheseMistakes", "Do not argue with superiors, neglect your academic or professional duties, switch fields impulsively, or cut corners to meet deadlines."))}
        </p>
      </div>

      <div class="info-card">
        <div class="info-card-title" style="color: #059669;">Work/Study rhythm suggestion</div>
        <p style="font-size: 9.6pt; line-height: 1.4; color: var(--text-main);">
          ${escapeHtml(getVal("careerStudyImpact.workStudyRhythmSuggestion", "Establish a fixed 2-hour study or skill-building window daily. Keep a detailed task checklist. Focus on one major project at a time with absolute concentration."))}
        </p>
      </div>
    </div>
  `)}

  <!-- PAGE 33: RELATIONSHIP & FAMILY IMPACT -->
  ${createStandardPage(33, "Relationship Boundaries & Family Duty", "Relationship & Family", `
    <div class="narrative-block">
      <div class="narrative-label">Emotional Ties, Boundaries, and Truth</div>
      <p class="narrative-text">
        ${escapeHtml(getVal("relationshipFamilyImpact.emotionalTiesAndBoundaries", "Saturn's transit tests the authenticity of all emotional relationships. Shallow or transactional connections will face pressure, exposing their underlying vulnerabilities. Saturn requires you to define clear, honest boundaries and build relationships based on mutual respect and shared responsibilities. Authentic bonds are strengthened and stabilized through this test."))}
      </p>
    </div>
    
    <div class="narrative-block">
      <div class="narrative-label">Family Duties &amp; Detached Responsibility</div>
      <p class="narrative-text">
        ${escapeHtml(getVal("relationshipFamilyImpact.familyDutiesAndDetachment", "Your family obligations will likely increase during this period, requiring more of your time and resources. Fulfill these duties with care, but practice emotional detachment. Do not get drawn into domestic arguments or expectations of gratitude. Fulfill your role as a family anchor with quiet dignity and strength."))}
      </p>
    </div>

    <div class="info-card">
      <div class="info-card-title">Communication Style Under Stress</div>
      <p style="font-size: 9.8pt; line-height: 1.45; color: var(--text-main);">
        ${escapeHtml(getVal("relationshipFamilyImpact.communicationStyleUnderStress", "When emotional pressure rises, practice active listening and delay your responses. Avoid harsh arguments. Fulfill your domestic obligations patiently, keeping communication clear and simple."))}
      </p>
    </div>
  `)}

  <!-- PAGE 34: RELATIONSHIP GUIDANCE RULES -->
  ${createStandardPage(34, "Relationship Guidance Rules", "Relationship & Family", `
    <div class="info-card" style="margin-top: 4mm;">
      <div class="info-card-title">Relationship Guidance rules</div>
      <div class="table-wrap">
        <table class="premium-table">
          <thead>
            <tr>
              <th>Relationship Area</th>
              <th>Saturnian Test</th>
              <th>Corrective Action</th>
            </tr>
          </thead>
          <tbody>
            <tr>
              <td><strong>Spouse / Partner</strong></td>
              <td>${escapeHtml(getVal("relationshipFamilyImpact.partnerTest", "Tests patience and commitment"))}</td>
              <td>${escapeHtml(getVal("relationshipFamilyImpact.partnerAction", "Avoid emotional reactivity; support each other through external delays."))}</td>
            </tr>
            <tr>
              <td><strong>Parents / Elders</strong></td>
              <td>${escapeHtml(getVal("relationshipFamilyImpact.parentsTest", "Demands time and care duties"))}</td>
              <td>${escapeHtml(getVal("relationshipFamilyImpact.parentsAction", "Fulfill duties patiently without expecting validation or rewards."))}</td>
            </tr>
            <tr>
              <td><strong>Social Circle</strong></td>
              <td>${escapeHtml(getVal("relationshipFamilyImpact.socialTest", "Filters superficial friends"))}</td>
              <td>${escapeHtml(getVal("relationshipFamilyImpact.socialAction", "Set healthy boundaries; focus quality of connections over quantity."))}</td>
            </tr>
          </tbody>
        </table>
      </div>
    </div>
  `)}

  <!-- PAGE 35: NAVIGATING RELATIONSHIP TESTS -->
  ${createStandardPage(35, "Navigating Relationship Tests", "Relationship & Family", `
    <div class="info-card" style="margin-top: 4mm;">
      <div class="info-card-title">Navigating Relationship Tests</div>
      <p style="font-size: 10.8pt; line-height: 1.6; color: var(--text-main);">
        Saturn filters out superficial connections and strengthens authentic bonds. View relationship tension not as a crisis, but as an auditor's check. Clear communication, fulfillment of commitments, and set healthy boundaries are your keys to relationship harmony.
      </p>
    </div>

    <div class="info-card">
      <div class="info-card-title">Karmic Relationship Contracts</div>
      <p style="font-size: 10.2pt; line-height: 1.55; color: var(--text-muted);">
        Every significant relationship contains lessons. Saturn demands that you stop blaming other people for domestic friction, and instead look at your own patterns of expectation, reaction, and commitment. Maturity transforms relationship demands into support.
      </p>
    </div>
  `)}

  <!-- PAGE 36: HEALTH & ENERGY GUIDANCE -->
  ${createStandardPage(36, "Physical Support & Vitality Management", "Health & Energy", `
    <div class="narrative-block">
      <div class="narrative-label">Physical Support During Saturnian Pressure</div>
      <p class="narrative-text">
        ${escapeHtml(getVal("healthEnergyGuidance.physicalSupportDuringPressure", "Saturn's pressure can accumulate in the physical body, leading to feelings of fatigue, bone stiffness, or digestive sluggishness. To counteract this, establish a highly consistent routine. Support your body through physical movement, clean nutrition, and systematic rest, ensuring that you do not deplete your vitality reserves."))}
      </p>
    </div>

    <div class="info-card">
      <div class="info-card-title">Body-Support Checklist</div>
      <div style="margin-top: 2mm;">
        <div class="checklist-item">
          <div class="checklist-box"></div>
          <div class="checklist-text">${escapeHtml(getVal("healthEnergyGuidance.sleepGuidance", "Establish a fixed 7-8 hour sleep schedule; avoid screens 1 hour before sleep."))}</div>
        </div>
        <div class="checklist-item">
          <div class="checklist-box"></div>
          <div class="checklist-text">${escapeHtml(getVal("healthEnergyGuidance.dietGuidance", "Eat warm, fresh vegetarian meals; simplify spices to support slow digestion."))}</div>
        </div>
        <div class="checklist-item">
          <div class="checklist-box"></div>
          <div class="checklist-text">${escapeHtml(getVal("healthEnergyGuidance.exerciseGuidance", "Practice daily joint mobility exercises (especially knees, ankles, and spine)."))}</div>
        </div>
        <div class="checklist-item">
          <div class="checklist-box"></div>
          <div class="checklist-text">${escapeHtml(getVal("healthEnergyGuidance.routineGuidance", "Spend 15 minutes in natural morning sunlight to support bone health and energy."))}</div>
        </div>
        <div class="checklist-item">
          <div class="checklist-box"></div>
          <div class="checklist-text">${escapeHtml(getVal("healthEnergyGuidance.avoidGuidance", "Avoid carbonated drinks, heavy cold meals, and eating late at night."))}</div>
        </div>
      </div>
    </div>

    <div class="info-card">
      <div class="info-card-title">When to Slow Down</div>
      <p style="font-size: 9.8pt; line-height: 1.45; color: var(--text-main);">
        ${escapeHtml(getVal("healthEnergyGuidance.whenToSlowDown", "If you experience chronic fatigue, joint stiffness, or persistent digestive problems, treat these as direct instructions to slow down. Simplify your schedule, seek medical advice, and prioritize rest over effort."))}
      </p>
    </div>
  `)}

  <!-- PAGE 37: FINANCE & MATERIAL STABILITY -->
  ${createStandardPage(37, "Wealth Habits & Material Discipline", "Finance & Stability", `
    <div class="narrative-block">
      <div class="narrative-label">Money Habits Under Saturn's Transit</div>
      <p class="narrative-text">
        ${escapeHtml(getVal("financeMaterialStability.moneyHabitsUnderSaturn", "Saturn acts as a financial auditor in this cycle. Loose spending or reliance on speculative gains must be replaced by systematic saving and conservative resource management. Wealth is accumulated slowly and steadily, rewarding long-term planning and strict budget discipline. Material security is restructured, showing you the value of true self-reliance."))}
      </p>
    </div>

    <div class="info-card">
      <div class="info-card-title">Financial Behavior Scale</div>
      <div class="scale-container">
        <span class="scale-label scale-low">Loose</span>
        <span class="scale-label scale-moderate">Cautious</span>
        <span class="scale-label scale-strong">Stable</span>
        <span class="scale-label scale-very-strong" style="color: var(--gold); border: 2.5px solid var(--gold); padding: 0.5mm 2mm; border-radius: 4px; font-weight: 900;">Very Disciplined</span>
      </div>
      <p style="font-size: 9.5pt; color: var(--text-muted); margin-top: 2.5mm;">
        Your Current Astrological Recommendation: <strong>Very Disciplined</strong>. Saturn's current transit requires you to adopt a conservative approach to asset preservation, avoiding high-risk ventures or speculative investments.
      </p>
    </div>

    <div class="grid-2">
      <div class="info-card">
        <div class="info-card-title" style="color: #E11D48;">Money Mistakes to Avoid</div>
        <p style="font-size: 9.5pt; line-height: 1.4; color: var(--text-main);">
          ${escapeHtml(getVal("financeMaterialStability.debtCautionAndMistakes", "Do not co-sign loans for others, take on consumer debt for luxuries, invest in speculative assets (crypto/day-trading), or make large purchases without 30 days of reflection."))}
        </p>
      </div>

      <div class="info-card">
        <div class="info-card-title" style="color: #059669;">Saving &amp; Spending Plan</div>
        <p style="font-size: 9.5pt; line-height: 1.4; color: var(--text-main);">
          ${escapeHtml(getVal("financeMaterialStability.savingVsSpendingPlan", "Build a liquid emergency fund covering 6 months of expenses. Invest in secure, low-yield long-term assets. Automate your savings daily or monthly."))}
        </p>
      </div>
    </div>
  `)}

  <!-- DIVIDER 4: GUIDANCE & CONCLUSION -->
  <div class="img-page-bg bg-div-remedies"></div>

  <!-- PAGE 39: REMEDIAL PATH OVERVIEW -->
  ${createStandardPage(39, "Constructive Response to Saturn's Energy", "Remedial Path", `
    <div class="narrative-block">
      <div class="narrative-label">Aligning with Saturn through Remedies</div>
      <p class="narrative-text">
        ${escapeHtml(getVal("remedialPathOverview.constructiveResponse", "Astrological remedies are not magic actions designed to bypass your lessons. Instead, they are energetic corrections designed to align your behavior and routine with Saturn's requirements. By adopting spiritual discipline, lifestyle structure, and selfless service, you reduce the resistance to Saturn's lessons, transforming potential friction into deep personal growth."))}
      </p>
    </div>
    
    <div class="narrative-block">
      <div class="narrative-label">Grouping of Remedial Practices</div>
      <p class="narrative-text">
        ${escapeHtml(getVal("remedialPathOverview.remedyGroupingDescription", "Your remedies are divided into three groups: Spiritual (devotion and mental poise), Physical (lifestyle correction and movement), and Behavioral (selfless service and integrity). Grouping these practices ensures a balanced approach that supports your mental, physical, and karmic alignment, helping you navigate the transit with grace."))}
      </p>
    </div>

    <div class="info-card">
      <div class="info-card-title">Remedies Directory</div>
      <div class="table-wrap">
        <table class="premium-table">
          <thead>
            <tr>
              <th>Type</th>
              <th>Primary Action</th>
              <th>Status / Frequency</th>
            </tr>
          </thead>
          <tbody>
            <tr><td><strong>Spiritual</strong></td><td>Hanuman worship &amp; Ram Naam chanting</td><td>Daily (Saturdays emphasized) / Commended</td></tr>
            <tr><td><strong>Physical</strong></td><td>Consistent sleep, stretching &amp; routine</td><td>Daily / Mandatory</td></tr>
            <tr><td><strong>Behavioral</strong></td><td>Seva (Service to the needy) &amp; integrity</td><td>Weekly (Saturdays) / Highly Recommended</td></tr>
          </tbody>
        </table>
      </div>
    </div>
  `)}

  <!-- PAGE 40: SPIRITUAL REMEDIES -->
  ${createStandardPage(40, "Spiritual Support & Devotional Routine", "Spiritual Remedies", `
    <div class="narrative-block">
      <div class="narrative-label">Hanuman Worship as a Stabilizing Force</div>
      <p class="narrative-text">
        ${escapeHtml(getVal("spiritualRemedies.hanumanWorshipInstructions", "In Vedic philosophy, Lord Hanuman represents the mastery of ego and complete devotion. Worshiping Hanuman stabilizes the mind, dissolving the anxiety and mental heaviness caused by Saturn. Reciting the Hanuman Chalisa on Saturdays, lighting a sesame oil lamp, or offering quiet prayers helps you absorb Hanuman's qualities of courage and dedication, neutralizing transit volatility."))}
      </p>
    </div>
    
    <div class="narrative-block">
      <div class="narrative-label">Ram Naam Chanting &amp; Mental Steadiness</div>
      <p class="narrative-text">
        ${escapeHtml(getVal("spiritualRemedies.ramNaamChantingInstructions", "Saturn respects the name of Lord Ram. Writing or chanting 'Ram' creates a protective emotional barrier, calming the sensory mind (Moon) from anxiety. Spend 5-10 minutes in silent chant daily. This practice requires no elaborate ritual, but acts as a powerful anchor for mental steadiness and emotional peace under Saturn's audit."))}
      </p>
    </div>

    <div class="info-card">
      <div class="info-card-title">Daily Prayer Rhythm</div>
      <p style="font-size: 9.8pt; line-height: 1.45; color: var(--text-main);">
        ${escapeHtml(getVal("spiritualRemedies.dailyPrayerRhythm", "Perform your spiritual practice at dawn or dusk. Light a simple lamp, sit in a quiet space, and chant. Regularity is the key; Saturn rewards consistency over elaborate, irregular rituals."))}
      </p>
    </div>

    <div class="info-card">
      <div class="info-card-title">How to Practice Simply</div>
      <p style="font-size: 9.8pt; line-height: 1.45; color: var(--text-main);">
        ${escapeHtml(getVal("spiritualRemedies.howToDoItSimply", "Begin with 11 chants of the Hanuman Chalisa or the simple Ram Naam mantra. Sit facing East, maintain a calm posture, and focus on steady inhalation and exhalation without overcomplicating the spiritual process."))}
      </p>
    </div>
  `)}

  <!-- PAGE 41: PHYSICAL & LIFESTYLE REMEDIES -->
  ${createStandardPage(41, "Body Correction & Service (Seva)", "Lifestyle Remedies", `
    <div class="narrative-block">
      <div class="narrative-label">Reducing Inertia Through Physical Movement</div>
      <p class="narrative-text">
        ${escapeHtml(getVal("physicalLifestyleRemedies.sweatingAndRoutineService", "Saturn governs inertia (Tamas). Under transit pressure, one can easily fall into lethargy, procrastination, or physical stagnation. To counteract this, engage in daily physical movement that induces mild sweating. Regular physical effort increases blood circulation, reduces joints stiffness, and breaks psychological stagnation, helping you maintain a positive energy balance."))}
      </p>
    </div>
    
    <div class="narrative-block">
      <div class="narrative-label">Behavioral Seva: Service to the Needy</div>
      <p class="narrative-text">
        ${escapeHtml(getVal("physicalLifestyleRemedies.reducingInertia", "Saturn is the planet of the working class, the elderly, and the needy. Selfless service (Seva) to these groups directly pleases Shani Dev. By actively supporting those who are suffering, you balance your personal karmic debts. Make it a habit to help the elderly, feed stray animals, or donate resources, transforming your transit from a personal struggle into a journey of service."))}
      </p>
    </div>

    <div class="info-card">
      <div class="info-card-title">Weekly Service Tasks (Saturday Seva)</div>
      <p style="font-size: 9.8pt; line-height: 1.45; color: var(--text-main);">
        ${escapeHtml(getVal("physicalLifestyleRemedies.weeklyServiceTasks", "Feed stray dogs or crows with grain or bread on Saturdays. Donate dark blankets or warm clothing to the needy. Assist an elderly neighbor or relative with their chores patiently."))}
      </p>
    </div>
  `)}

  <!-- PAGE 42: THE 30-DAY SATURN ROUTINE BLUEPRINT -->
  ${createStandardPage(42, "The 30-Day Saturn Routine Blueprint", "Daily Action Plan", `
    <div class="narrative-block">
      <div class="narrative-label">Immediate Daily Steps</div>
      <p class="narrative-text">
        ${escapeHtml(getVal("practicalDailyActionPlan.immediate30DayRoutine", "To align with Saturn, establish an immediate 30-day routine. Wake up before sunrise, maintain a clean daily journal, perform 10 minutes of deep breathing, and spend 30 minutes in skill development. Fulfill your daily responsibilities silently, keeping track of your goals in a structured tracker to measure consistency."))}
      </p>
    </div>

    <div class="info-card" style="margin-top: 4mm;">
      <div class="info-card-title">Daily Seva and Help</div>
      <p style="font-size: 10.2pt; line-height: 1.55; color: var(--text-main);">
        Voluntary help and daily service constitute a powerful energetic remedy. Dedicate time to assist the elderly, support clean working environments, and complete chores with diligence and positive posture.
      </p>
    </div>
  `)}

  <!-- PAGE 43: 30-DAY ALIGNMENT ROUTINE -->
  ${createStandardPage(43, "30-Day Alignment Routine", "Daily Action Plan", `
    <div class="info-card" style="margin-top: 4mm;">
      <div class="info-card-title">30-Day Alignment Routine</div>
      <div class="table-wrap">
        <table class="premium-table">
          <thead>
            <tr>
              <th>Action Category</th>
              <th>Do This (Mandatory)</th>
              <th>Avoid This (Warning)</th>
            </tr>
          </thead>
          <tbody>
            <tr>
              <td><strong>Morning Routine</strong></td>
              <td>${escapeHtml(getVal("practicalDailyActionPlan.morningDo", "Wake up at fixed time; practice deep breathing."))}</td>
              <td>${escapeHtml(getVal("practicalDailyActionPlan.morningAvoid", "Hitting snooze; starting the day with screen scroll."))}</td>
            </tr>
            <tr>
              <td><strong>Speech</strong></td>
              <td>${escapeHtml(getVal("practicalDailyActionPlan.speechDo", "Soft, brief, measured communication."))}</td>
              <td>${escapeHtml(getVal("practicalDailyActionPlan.speechAvoid", "Harsh words, reactive arguing, gossiping."))}</td>
            </tr>
            <tr>
              <td><strong>Finance</strong></td>
              <td>${escapeHtml(getVal("practicalDailyActionPlan.financeDo", "Document every single expense daily."))}</td>
              <td>${escapeHtml(getVal("practicalDailyActionPlan.financeAvoid", "Speculative investments, impulse buying."))}</td>
            </tr>
            <tr>
              <td><strong>Lifestyle</strong></td>
              <td>${escapeHtml(getVal("practicalDailyActionPlan.lifestyleDo", "Voluntary service, early sleep."))}</td>
              <td>${escapeHtml(getVal("practicalDailyActionPlan.lifestyleAvoid", "Procrastination, irregular meals."))}</td>
            </tr>
          </tbody>
        </table>
      </div>
    </div>
  `)}

  <!-- PAGE 39: CRISIS MANAGEMENT & HABIT STRUCTURE -->
  ${createStandardPage(39, "Crisis Management & Habit Structure", "Daily Action Plan", `
    <div class="narrative-block">
      <div class="narrative-label">Sustaining Habit Consistency</div>
      <p class="narrative-text">
        Under Saturn's transit, the key to reducing anxiety is predictability. When you do the same constructive actions at the same time every day, your nervous system registers safety, preventing the mental fatigue or overthinking typical of this period. Do not seek perfection; focus on quiet, unbroken consistency.
      </p>
    </div>

    <div class="grid-2" style="margin-top: 4mm;">
      <div class="info-card">
        <div class="info-card-title">Stress Strategy</div>
        <p style="font-size: 9.6pt; line-height: 1.45; color: var(--text-main);">
          ${escapeHtml(getVal("practicalDailyActionPlan.stressAndUncertaintyStrategy", "When anxiety spikes, pause all actions. Drink warm water, practice 5 minutes of box breathing, and focus on physical duties, avoiding mental loops."))}
        </p>
      </div>

      <div class="info-card">
        <div class="info-card-title">Weekly Routine Habit Grid</div>
        <div class="habit-grid">
          <div class="habit-day">M</div><div class="habit-day">T</div><div class="habit-day">W</div>
          <div class="habit-day">T</div><div class="habit-day">F</div><div class="habit-day" style="color:var(--navy); border-color:var(--navy);">S</div>
          <div class="habit-day">S</div>
        </div>
        <p style="font-size: 7.5pt; text-align: center; color: var(--text-muted); margin-top: 1.5mm;">Saturdays: Focus on Seva and Hanuman Devotion</p>
      </div>
    </div>
  `)}

  <!-- PAGE 40: LIFE AREA SUMMARY DASHBOARD PART 1 -->
  ${createStandardPage(40, "Overall Impact At a Glance - Part 1", "Summary Dashboard", `
    <div style="display:flex; flex-direction:column; gap:3mm; margin-top: 3mm;">
      <div class="info-card">
        <div class="info-card-title">Career &amp; Study</div>
        <div class="scale-container">
          <span class="scale-label scale-strong">Strong Influence</span>
        </div>
        <p style="font-size: 10pt; line-height: 1.5; color: var(--text-main); margin-top: 1.5mm;">
          ${escapeHtml(getVal("lifeAreaSummary.careerReasoning", "Career requires disciplined effort and structured restructuring. Expect minor delays; maintain skill focus."))}
        </p>
      </div>

      <div class="info-card">
        <div class="info-card-title">Relationships &amp; Family</div>
        <div class="scale-container">
          <span class="scale-label scale-moderate">Moderate Influence</span>
        </div>
        <p style="font-size: 10pt; line-height: 1.5; color: var(--text-main); margin-top: 1.5mm;">
          ${escapeHtml(getVal("lifeAreaSummary.relationshipsReasoning", "Relationships demand clarity and patience. Fulfill domestic duties without expecting gratitude."))}
        </p>
      </div>

      <div class="info-card">
        <div class="info-card-title">Finance &amp; Wealth</div>
        <div class="scale-container">
          <span class="scale-label scale-strong">Strong Influence</span>
        </div>
        <p style="font-size: 10pt; line-height: 1.5; color: var(--text-main); margin-top: 1.5mm;">
          ${escapeHtml(getVal("lifeAreaSummary.financeReasoning", "Enforce strict savings; avoid consumer debt and speculative markets."))}
        </p>
      </div>
    </div>
  `)}

  <!-- PAGE 41: LIFE AREA SUMMARY DASHBOARD PART 2 -->
  ${createStandardPage(41, "Overall Impact At a Glance - Part 2", "Summary Dashboard", `
    <div style="display:flex; flex-direction:column; gap:3mm; margin-top: 3mm;">
      <div class="info-card">
        <div class="info-card-title">Health &amp; Vitality</div>
        <div class="scale-container">
          <span class="scale-label scale-moderate">Moderate Influence</span>
        </div>
        <p style="font-size: 10pt; line-height: 1.5; color: var(--text-main); margin-top: 1.5mm;">
          ${escapeHtml(getVal("lifeAreaSummary.healthReasoning", "Prioritize sleep hygiene, joint stretching, and slow digestion support."))}
        </p>
      </div>

      <div class="info-card">
        <div class="info-card-title">Mind &amp; Peace</div>
        <div class="scale-container">
          <span class="scale-label scale-very-strong">Very Strong Influence</span>
        </div>
        <p style="font-size: 10pt; line-height: 1.5; color: var(--text-main); margin-top: 1.5mm;">
          ${escapeHtml(getVal("lifeAreaSummary.mindReasoning", "Confront anxiety through structured routines, meditation, and quiet self-talk."))}
        </p>
      </div>

      <div class="info-card">
        <div class="info-card-title">Family Environment</div>
        <div class="scale-container">
          <span class="scale-label scale-moderate">Moderate Influence</span>
        </div>
        <p style="font-size: 10pt; line-height: 1.5; color: var(--text-main); margin-top: 1.5mm;">
          ${escapeHtml(getVal("lifeAreaSummary.familyReasoning", "Fulfill family obligations silently. Practice detachment during verbal disputes."))}
        </p>
      </div>
    </div>
  `)}

  <!-- PAGE 42: THE STABILITY MAP -->
  ${createStandardPage(42, "The Stability Map", "Stability Map", `
    <div class="narrative-block">
      <div class="narrative-label">Vedic Blueprint: Change vs Protection</div>
      <p class="narrative-text">
        Saturn separates the transient from the permanent. In this stability map, we analyze which areas of your life are scheduled for change and restructuring, and which areas must remain stable and protected. By identifying these zones, you can focus your effort on building solid foundations instead of fighting necessary transitions.
      </p>
    </div>

    <div class="stability-map" style="margin-top: 3mm;">
      <div class="stability-card test">
        <div class="stability-header" style="color: #E11D48; border-color: rgba(225, 29, 72, 0.15);">What is Being Tested &amp; Shifted</div>
        <div class="stability-item">
          <strong>Career Status &amp; Recognition:</strong> ${escapeHtml(getVal("stabilityMap.whatMayShift", "Your outward career titles and speed of growth will shift. Saturn tests your patience through delays, forcing you to focus on internal skills rather than external appreciation."))}
        </div>
        <div class="stability-item">
          <strong>Shallow Ties &amp; Dependencies:</strong> ${escapeHtml(getVal("stabilityMap.whatIsBeingTested", "Superficial relationships and dependencies are tested. Weak links will fade, forcing self-reliance and deep accountability."))}
        </div>
      </div>

      <div class="stability-card protect">
        <div class="stability-header" style="color: #059669; border-color: rgba(5, 150, 105, 0.15);">What Should Be Protected &amp; Strengthened</div>
        <div class="stability-item">
          <strong>Daily Routine &amp; Ethics:</strong> ${escapeHtml(getVal("stabilityMap.whatShouldBeProtected", "Your morning routine, basic values, sleep cycle, and commitment to integrity. Maintain these as protective shields against transit friction."))}
        </div>
        <div class="stability-item">
          <strong>Endurance &amp; Quiet Wisdom:</strong> ${escapeHtml(getVal("stabilityMap.whatIsStrengthened", "Your capacity to bear load, emotional resilience, self-mastery, and spiritual foundation. These will remain permanently after the transit."))}
        </div>
      </div>
    </div>
  `)}

  <!-- PAGE 43: YEAR-WISE OR PHASE-WISE FORECAST -->
  ${createStandardPage(43, "Year-wise & Phase-wise Forecast", "Transit Forecast", `
    <div style="display:flex; flex-direction:column; gap:2.5mm; margin-top: 2mm;">
      <div class="info-card">
        <div class="info-card-title">Near-Term Transit (Next 12 Months)</div>
        <div class="scale-container">
          <span class="scale-label scale-moderate" style="color:#D97706;">Testing Period</span>
        </div>
        <p style="font-size: 9.5pt; line-height: 1.4; color: var(--text-main); margin-top: 1.5mm;">
          ${escapeHtml(getVal("forecast.nearTermForecast", "The next 12 months require strict adherence to routines. Focus on stabilizing your health, building financial reserves, and avoiding impulsive career decisions."))}
        </p>
      </div>

      <div class="info-card">
        <div class="info-card-title">Mid-Term Transit (Months 13-36)</div>
        <div class="scale-container">
          <span class="scale-label scale-strong" style="color:#2563EB;">Consolidation Period</span>
        </div>
        <p style="font-size: 9.5pt; line-height: 1.4; color: var(--text-main); margin-top: 1.5mm;">
          ${escapeHtml(getVal("forecast.midTermForecast", "The mid-term transit focuses on consolidating your career direction and relationship commitments. Rewards begin to flow slowly as structural adjustments are finalized."))}
        </p>
      </div>

      <div class="info-card">
        <div class="info-card-title">Later-Term Transit (Final Phases)</div>
        <div class="scale-container">
          <span class="scale-label scale-low" style="color:#64748B;">Easier Period</span>
        </div>
        <p style="font-size: 9.5pt; line-height: 1.4; color: var(--text-main); margin-top: 1.5mm;">
          ${escapeHtml(getVal("forecast.laterTermForecast", "The final phase brings restoration of ease and wealth consolidation. Psychological pressure decreases, leaving you with stable assets and deep emotional maturity."))}
        </p>
      </div>

      <div class="info-card" style="padding: 2.5mm 4mm;">
        <div class="info-card-title">Key Transition Windows</div>
        <p style="font-size: 9.5pt; line-height: 1.4; color: var(--text-muted);">
          <strong>Critical Windows:</strong> ${escapeHtml(getVal("forecast.keyTransitionWindows", "Keep an eye on Saturn's retrograde stations and planetary cycles. During these weeks, practice silence, double-check contracts, and prioritize physical rest."))}
        </p>
      </div>
    </div>
  `)}

  <!-- PAGE 44: FINAL INSIGHT PAGE -->
  ${createStandardPage(44, "Final Astrological Insight", "Core Insight", `
    <div class="narrative-block" style="margin-top: 4mm;">
      <div class="narrative-label">Saturn's Message for Your Journey</div>
      <p class="narrative-text">
        ${escapeHtml(getVal("finalInsight.coreMessage", "Your Sade Sati is not an obstacle, but a cosmic opportunity. Saturn operates as a mirror, reflecting back to you your weaknesses so that they can be corrected. True success in this transit does not come from trying to escape the pressure, but from absorbing its lessons with quiet dignity, integrity, and steady effort. Fulfill your duty, act with responsibility, and trust that time is your greatest ally."))}
      </p>
    </div>

    <div class="info-card" style="border: 2px solid var(--gold); background: rgba(11, 25, 44, 0.02); text-align: center; padding: 6mm 4mm; margin-top: 5mm; margin-bottom: 5mm;">
      <div style="font-size: 8pt; font-weight: 700; text-transform: uppercase; color: var(--navy); letter-spacing: 2px; margin-bottom: 2.5mm;">The One Sentence Truth</div>
      <p style="font-size: 11.5pt; font-weight: 700; color: var(--navy); line-height: 1.5; font-style: italic;">
        "${escapeHtml(getVal("finalInsight.oneSentenceTruth", "Silence and steady discipline dismantle the heaviest transits; maturity is forged in patience."))}"
      </p>
    </div>

    <div class="info-card">
      <div class="info-card-title">What to Remember Most</div>
      <p style="font-size: 9.8pt; line-height: 1.45; color: var(--text-main);">
        ${escapeHtml(getVal("finalInsight.whatToRememberMost", "Saturn does not delay your achievements permanently; it merely checks if you are ready to manage them. Maintain your routines, prioritize service, speak with care, and remember that this period will pass, leaving you structurally sturdier, wiser, and deeply grounded."))}
      </p>
    </div>
  `)}

  <!-- PAGE 45: AFFIRMATIONS -->
  ${createStandardPage(45, "Mental Reinforcements & Affirmations", "Affirmations", `
    <div class="narrative-block">
      <div class="narrative-label">Developing Cognitive Resilience</div>
      <p class="narrative-text">
        Affirmations act as cognitive anchors during periods of high stress or self-doubt. Repeat these Saturnian statements during your morning routine or moments of hesitation to reset your focus, ground your emotions, and align your consciousness with the protective qualities of discipline, integrity, and self-mastery.
      </p>
    </div>

    <div style="display:flex; flex-direction:column; gap:3mm; margin-top: 4mm;">
      ${affirmations.slice(0, 7).map((aff, i) => `
        <div class="info-card" style="display:flex; align-items:center; gap:4mm; margin-bottom:0; padding: 3mm 4mm;">
          <div style="font-size: 11pt; font-weight: 900; color: var(--navy); width: 8mm; flex-shrink:0;">0${i + 1}</div>
          <div style="font-size: 10pt; font-weight: 500; color: var(--text-main); line-height: 1.45;">${escapeHtml(aff)}</div>
        </div>
      `).join("")}
    </div>
  `)}

  <!-- PAGE 46: FINAL CONCLUSION -->
  ${createStandardPage(46, "Closing Summary & Outlook", "Report Conclusion", `
    <div class="narrative-block" style="margin-top: 3mm;">
      <div class="narrative-label">The Character Forge</div>
      <p class="narrative-text">
        ${escapeHtml(getVal("finalConclusion.closingSummary", "Your Shani Sade Sati transit represents a character forge. It systematically strips away outer illusions, forcing you to develop genuine internal strength, self-reliance, and ethical stability. By cooperating with this process rather than resisting, you ensure that the second half of your life is built on a foundation of absolute reality, authentic relationships, and career mastery."))}
      </p>
    </div>
    
    <div class="narrative-block">
      <div class="narrative-label">Moving Forward With Reassurance</div>
      <p class="narrative-text">
        ${escapeHtml(getVal("finalConclusion.movingForwardReassurance", "Step forward with quiet confidence. Shani Dev is not an enemy, but a cosmic teacher whose ultimate goal is to guide you toward maturity and wisdom. Maintain your spiritual remedies, follow your 30-day daily action plan, and walk your path with integrity. Time will show that this transit was the very catalyst that defined your true success."))}
      </p>
    </div>

    <div class="info-card" style="border: 1.5px solid rgba(11, 25, 44, 0.15); background: rgba(11, 25, 44, 0.02); margin-top: 4mm;">
      <div class="info-card-title">Saturn's Definition of Maturity</div>
      <p style="font-size: 9.8pt; line-height: 1.45; color: var(--navy); font-weight: 500; font-style: italic; text-align: center;">
        "${escapeHtml(getVal("finalConclusion.maturityDefinition", "Maturity is the capacity to perform one's duty silently without demanding recognition, to face delay with peace, and to rely completely on internal stability."))}"
      </p>
    </div>
  `)}

  <!-- PAGE 47: BONUS APPENDIX -->
  ${createStandardPage(47, "Glossary of Vedic Astrological Terms", "Report Appendix", `
    <div class="info-card" style="margin-top: 3mm;">
      <div class="info-card-title">Astrological Glossary</div>
      <div style="display:flex; flex-direction:column; gap:2.5mm;">
        <div style="font-size: 9.5pt; line-height: 1.45;">
          <strong>Shani Sade Sati:</strong> The 7.5-year transit of Saturn through the 12th, 1st, and 2nd houses from the natal Moon sign. Known as a period of major psychological and life restructuring.
        </div>
        <div style="font-size: 9.5pt; line-height: 1.45;">
          <strong>Dhaiya / Panoti:</strong> A minor Saturn transit lasting 2.5 years, occurring when Saturn occupies the 4th (Ashtama Shani) or 8th (Kantaka Shani) houses from the natal Moon.
        </div>
        <div style="font-size: 9.5pt; line-height: 1.45;">
          <strong>Rashi (Moon Sign):</strong> The zodiac sign occupied by the Moon at the exact moment of birth. In Vedic astrology, it represents the subconscious mind, emotional landscape, and perception.
        </div>
        <div style="font-size: 9.5pt; line-height: 1.45;">
          <strong>Nakshatra:</strong> A lunar mansion or stellar constellation. The Moon sign is divided into stars, representing the specific subthemes and lords of emotional expression.
        </div>
        <div style="font-size: 9.5pt; line-height: 1.45;">
          <strong>Lagna (Ascendant):</strong> The zodiac sign rising on the eastern horizon at the moment of birth, representing the physical body, outward identity, and life direction.
        </div>
        <div style="font-size: 9.5pt; line-height: 1.45;">
          <strong>Drishti (Aspect):</strong> The projection of a planet's energy onto other houses. Saturn projects its influence onto the 3rd, 7th, and 10th houses from its transit placement.
        </div>
      </div>
    </div>

    <div class="info-card">
      <div class="info-card-title">Remedy Reference Note</div>
      <p style="font-size: 9.6pt; line-height: 1.45; color: var(--text-muted);">
        ${escapeHtml(getVal("appendix.remedyReference", "For optimal results, group spiritual, lifestyle, and behavioral remedies into a unified routine. Practice devotion on Saturday mornings, keep daily sleep cycles, and perform service work weekly. Fulfill duties silently, ensuring all actions are guided by absolute integrity."))}
      </p>
    </div>
  `)}

  <!-- PAGE 48: FAQ PART 1 -->
  ${createStandardPage(48, "Frequently Asked Questions About Sade Sati - Part 1", "Personalised FAQ", `
    <div class="info-card" style="margin-top: 2mm;">
      <div class="info-card-title" style="color: var(--navy); font-size: 10.5pt; margin-bottom: 1.5mm;">Am I Currently Under the Influence of Sade Sati?</div>
      <p style="font-size: 9.8pt; line-height: 1.45; color: var(--text-main); text-align: justify; margin-bottom: 0;">
        ${escapeHtml(getVal("faqAnswers.currentlyUnderInfluence", "Based on your astrological placements and current planetary transits, the influence of Saturn on your natal Moon can be determined. Please consult the cycles section of this report to check active transit windows."))}
      </p>
    </div>
    <div class="info-card">
      <div class="info-card-title" style="color: var(--navy); font-size: 10.5pt; margin-bottom: 1.5mm;">When Will My Next Sade Sati Begin and End?</div>
      <p style="font-size: 9.8pt; line-height: 1.45; color: var(--text-main); text-align: justify; margin-bottom: 0;">
        ${escapeHtml(getVal("faqAnswers.nextBeginAndEnd", "The timeline of your Saturn transits is calculated based on the orbital speed of Saturn. Your personal transit table shows the exact entry and exit dates for your upcoming cycles."))}
      </p>
    </div>
    <div class="info-card">
      <div class="info-card-title" style="color: var(--navy); font-size: 10.5pt; margin-bottom: 1.5mm;">Which Phase of Sade Sati Is the Most Challenging for Me?</div>
      <p style="font-size: 9.8pt; line-height: 1.45; color: var(--text-main); text-align: justify; margin-bottom: 0;">
        ${escapeHtml(getVal("faqAnswers.mostChallengingPhase", "For most individuals, the peak phase (second transit phase) when Saturn conjuncts the natal Moon tends to bring the most intense emotional and structural tests, though this varies based on your natal Saturn strength."))}
      </p>
    </div>
    <div class="info-card">
      <div class="info-card-title" style="color: var(--navy); font-size: 10.5pt; margin-bottom: 1.5mm;">Which Areas of My Life Will Be Most Affected During Sade Sati?</div>
      <p style="font-size: 9.8pt; line-height: 1.45; color: var(--text-main); text-align: justify; margin-bottom: 0;">
        ${escapeHtml(getVal("faqAnswers.mostAffectedAreas", "Saturn systematically audits multiple domains including career stability, domestic harmony, financial savings, and mental peace. The specific house placement of Saturn in your chart guides the exact focus of these tests."))}
      </p>
    </div>
    <div class="info-card">
      <div class="info-card-title" style="color: var(--navy); font-size: 10.5pt; margin-bottom: 1.5mm;">Will My Career or Business Face Major Challenges During This Period?</div>
      <p style="font-size: 9.8pt; line-height: 1.45; color: var(--text-main); text-align: justify; margin-bottom: 0;">
        ${escapeHtml(getVal("faqAnswers.careerBusinessChallenges", "Career paths often experience restructuring, increased workloads, or delayed rewards. Maintaining consistency, skill upgrades, and avoiding impulsive changes is the recommended path."))}
      </p>
    </div>
    <div class="info-card">
      <div class="info-card-title" style="color: var(--navy); font-size: 10.5pt; margin-bottom: 1.5mm;">How Will Sade Sati Influence My Relationships and Family Life?</div>
      <p style="font-size: 9.8pt; line-height: 1.45; color: var(--text-main); text-align: justify; margin-bottom: 0;">
        ${escapeHtml(getVal("faqAnswers.relationshipsFamilyInfluence", "Domestic duties and commitments are tested, encouraging the establishment of healthy boundaries and detached service. Clear communication prevents misunderstandings with family members."))}
      </p>
    </div>
  `)}

  <!-- PAGE 49: FAQ PART 2 -->
  ${createStandardPage(49, "Frequently Asked Questions About Sade Sati - Part 2", "Personalised FAQ", `
    <div class="info-card" style="margin-top: 2mm;">
      <div class="info-card-title" style="color: var(--navy); font-size: 10.5pt; margin-bottom: 1.5mm;">Can Sade Sati Cause Financial Losses or Unexpected Expenses?</div>
      <p style="font-size: 9.8pt; line-height: 1.45; color: var(--text-main); text-align: justify; margin-bottom: 0;">
        ${escapeHtml(getVal("faqAnswers.financialLossesExpenses", "Saturn audits your spending habits, requiring strict budgeting and resource conservation. Speculative investments should be avoided to prevent unexpected financial stress."))}
      </p>
    </div>
    <div class="info-card">
      <div class="info-card-title" style="color: var(--navy); font-size: 10.5pt; margin-bottom: 1.5mm;">What Lessons Is Saturn Trying to Teach Me Through This Transit?</div>
      <p style="font-size: 9.8pt; line-height: 1.45; color: var(--text-main); text-align: justify; margin-bottom: 0;">
        ${escapeHtml(getVal("faqAnswers.lessonsSaturnTeaches", "Saturn acts as a cosmic teacher, guiding you toward emotional maturity, self-reliance, ethical behavior, and the value of persistent, disciplined effort over quick shortcuts."))}
      </p>
    </div>
    <div class="info-card">
      <div class="info-card-title" style="color: var(--navy); font-size: 10.5pt; margin-bottom: 1.5mm;">What Are the Biggest Mistakes I Should Avoid During Sade Sati?</div>
      <p style="font-size: 9.8pt; line-height: 1.45; color: var(--text-main); text-align: justify; margin-bottom: 0;">
        ${escapeHtml(getVal("faqAnswers.mistakesToAvoid", "Avoid impulsive relocations, reactive conflicts, taking on excessive consumer debt, or seeking escapes from structural responsibilities."))}
      </p>
    </div>
    <div class="info-card">
      <div class="info-card-title" style="color: var(--navy); font-size: 10.5pt; margin-bottom: 1.5mm;">Which Remedies Will Be Most Effective for Reducing the Effects of Sade Sati?</div>
      <p style="font-size: 9.8pt; line-height: 1.45; color: var(--text-main); text-align: justify; margin-bottom: 0;">
        ${escapeHtml(getVal("faqAnswers.effectiveRemedies", "Remedies like Hanuman Chalisa recitation, regular spiritual discipline, selfless service (Seva) to the elderly and working class, and body grounding routines are highly effective."))}
      </p>
    </div>
    <div class="info-card">
      <div class="info-card-title" style="color: var(--navy); font-size: 10.5pt; margin-bottom: 1.5mm;">When Can I Expect Relief and Positive Results During or After Sade Sati?</div>
      <p style="font-size: 9.8pt; line-height: 1.45; color: var(--text-main); text-align: justify; margin-bottom: 0;">
        ${escapeHtml(getVal("faqAnswers.reliefAndPositiveResults", "As Saturn transits into the final phase (the setting phase) and eventually leaves your 2nd house, the intense pressure lifts, and the rewards of your disciplined patience manifest as stable, long-term success."))}
      </p>
    </div>
    <div class="info-card">
      <div class="info-card-title" style="color: var(--navy); font-size: 10.5pt; margin-bottom: 1.5mm;">How Can I Turn Sade Sati Into a Period of Personal Growth and Success?</div>
      <p style="font-size: 9.8pt; line-height: 1.45; color: var(--text-main); text-align: justify; margin-bottom: 0;">
        ${escapeHtml(getVal("faqAnswers.personalGrowthSuccess", "By accepting Saturn's lessons with humility, developing consistent routines, upgrading your professional skills, and serving others, you forge a resilient character ready for lifetime stability."))}
      </p>
    </div>
  `)}

  <!-- PAGE 50: ENDING PAGE -->
  <div class="img-page-bg bg-end"></div>

</body>
</html>`;
}

async function generateSadeSatiReportPDF(reportData, userRequest) {
  let browser = null;
  try {
    // If the report was cached prior to chart inclusion, load charts from DB or userRequest
    if (!reportData.horoscopeCharts || !reportData.horoscopeCharts.rasiChart) {
      let rawChartData = null;
      if (userRequest && userRequest.kundli && userRequest.kundli.charts) {
        rawChartData = userRequest.kundli.charts;
      } else if (userRequest && userRequest.id) {
        try {
          const Kundli = require("../model/horoscope/kundli");
          const kundliRecord = await Kundli.findOne({ where: { requestId: userRequest.id } });
          if (kundliRecord && kundliRecord.charts) {
            rawChartData = kundliRecord.charts;
          }
        } catch (dbErr) {
          console.warn("[Sade Sati PDF Service] Failed to load charts dynamically from DB:", dbErr.message);
        }
      }
      if (rawChartData) {
        // Normalize: kundli.charts stores divisional charts as D1, D2, D9, D10 etc.
        // The PDF template expects rasiChart, horaChart, navamsaChart, dasamsaChart keys.
        const normalizedCharts = {
          rasiChart: rawChartData.D1 || rawChartData.rasiChart || null,
          horaChart: rawChartData.D2 || rawChartData.horaChart || null,
          navamsaChart: rawChartData.D9 || rawChartData.navamsaChart || null,
          dasamsaChart: rawChartData.D10 || rawChartData.dasamsaChart || null,
          ...rawChartData
        };
        try {
          reportData.horoscopeCharts = normalizedCharts;
        } catch (e) {
          reportData = { ...reportData, horoscopeCharts: normalizedCharts };
        }
      }
    }

    console.log("[Sade Sati PDF Service] Compiling HTML template...");
    const htmlContent = generateSadeSatiHtmlTemplate(reportData, userRequest);

    try {
      const tempDir = path.resolve(__dirname, "../temp");
      if (!fs.existsSync(tempDir)) {
        fs.mkdirSync(tempDir, { recursive: true });
      }
      const htmlFileName = `sadesati_report_${Date.now()}.html`;
      fs.writeFileSync(path.join(tempDir, htmlFileName), htmlContent, "utf8");
      console.log(`[Sade Sati PDF Service] Dumped HTML to temp for reference: ${htmlFileName}`);
    } catch (dumpErr) {
      console.warn("[Sade Sati PDF Service] Failed to write HTML dump (safe to ignore):", dumpErr.message);
    }

    console.log("[Sade Sati PDF Service] Launching browser...");
    browser = await puppeteer.launch(getPuppeteerLaunchOptions());

    const page = await browser.newPage();

    console.log("[Sade Sati PDF Service] Setting page content...");
    await page.setContent(htmlContent, {
      waitUntil: "load",
      timeout: 120000
    });

    console.log("[Sade Sati PDF Service] Printing to PDF...");
    const pdfBuffer = await page.pdf({
      format: "A4",
      printBackground: true,
      timeout: 120000,
      margin: {
        top: 0, right: 0, bottom: 0, left: 0
      }
    });

    try {
      await browser.close();
    } catch (closeError) {
      console.warn("[Sade Sati PDF Service] Browser close warning (safe to ignore):", closeError.message);
    }

    return Buffer.from(pdfBuffer);

  } catch (error) {
    if (browser) {
      try {
        await browser.close();
      } catch (closeError) {
        console.warn("[Sade Sati PDF Service] Browser close warning in catch (safe to ignore):", closeError.message);
      }
    }
    console.error("[Sade Sati PDF Service] Error generating PDF:", error);
    throw new Error(`Failed to generate PDF: ${error.message}`);
  }
}

module.exports = {
  generateSadeSatiReportPDF,
};
