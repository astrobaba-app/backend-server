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

const SIGN_NAME_TO_NUM = {
  Aries: 1, Taurus: 2, Gemini: 3, Cancer: 4, Leo: 5, Virgo: 6,
  Libra: 7, Scorpio: 8, Sagittarius: 9, Capricorn: 10, Aquarius: 11, Pisces: 12,
};

const PLANET_ABBREVIATIONS = {
  Sun: "Su", Moon: "Mo", Mars: "Ma", Mercury: "Me", Jupiter: "Ju",
  Venus: "Ve", Saturn: "Sa", Rahu: "Ra", Ketu: "Ke", Ascendant: "Asc",
  ascendant: "Asc", Lagna: "Asc"
};

const PLANET_COLORS = {
  Su: "#FFA500", Mo: "#9370DB", Ma: "#DC143C", Me: "#32CD32",
  Ju: "#DAA520", Ve: "#FF1493", Sa: "#4169E1", Ra: "#8B4513",
  Ke: "#A0522D", Asc: "#9932CC"
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

const HOUSE_SIGNIFICATIONS = {
  1: { name: "Lagna (Ascendant)", desc: "Self, personality, physical body, health, vitality, and overall life direction" },
  2: { name: "Dhana Bhava", desc: "Wealth, family, speech, food habits, and accumulated resources" },
  3: { name: "Sahaja Bhava", desc: "Siblings, courage, communication, short travels, skills, and self-effort" },
  4: { name: "Sukha Bhava", desc: "Mother, home, property, vehicles, emotional peace, and domestic happiness" },
  5: { name: "Putra Bhava", desc: "Education, intelligence, learning ability, creativity, children, romance, speculation, and past-life merit" },
  6: { name: "Ripu Bhava", desc: "Enemies, diseases, debts, service, competition, and daily work routine" },
  7: { name: "Kalatra Bhava", desc: "Marriage, partnerships, business associates, public dealings, and contracts" },
  8: { name: "Randhra Bhava", desc: "Longevity, sudden events, inheritance, occult knowledge, and transformation" },
  9: { name: "Dharma Bhava", desc: "Fortune, higher learning, father, long journeys, spirituality, and divine grace" },
  10: { name: "Karma Bhava", desc: "Career, profession, reputation, authority, achievements, and public status" },
  11: { name: "Labha Bhava", desc: "Gains, income, social network, elder siblings, aspirations, and fulfilment" },
  12: { name: "Vyaya Bhava", desc: "Losses, expenses, foreign lands, spiritual liberation, and subconscious mind" }
};

const imageToDataUri = (fileName) => {
  try {
    const fullPath = path.join(IMAGES_DIR, fileName);
    if (!fs.existsSync(fullPath)) {
      console.warn(`[Wealth PDF Service] Image not found at ${fullPath}`);
      return "";
    }
    const buffer = fs.readFileSync(fullPath);
    const ext = path.extname(fileName).toLowerCase();
    const mime = ext === ".jpg" || ext === ".jpeg" ? "image/jpeg" : "image/png";
    return `data:${mime};base64,${buffer.toString("base64")}`;
  } catch (error) {
    console.error(`[Wealth PDF Service] Error reading image ${fileName}:`, error);
    return "";
  }
};

const splitLargeParagraph = (pText) => {
  const sentences = pText.match(/[^.!?]+[.!?]+(\s|$)/g) || [pText];
  if (sentences.length <= 4) {
    return `<p style="margin-bottom:3.5mm; text-align:justify; font-size:13pt; line-height:1.45; color:var(--text-main);">${pText}</p>`;
  }

  const chunks = [];
  for (let i = 0; i < sentences.length; i += 3) {
    chunks.push(sentences.slice(i, i + 3).join("").trim());
  }

  return chunks.map(chunk =>
    `<p style="margin-bottom:3.5mm; text-align:justify; font-size:13pt; line-height:1.45; color:var(--text-main);">${chunk}</p>`
  ).join("\n");
};

const formatNarrativeText = (text) => {
  if (!text) return "";
  let html = safeString(text);

  // Clean HTML characters first
  html = html
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");

  const paras = html.split(/\r?\n\s*\r?\n/);
  html = paras.map(para => {
    let p = para.trim();
    if (!p) return "";

    if (p.startsWith("### ")) {
      const headingText = p.substring(4).trim();
      return `<h3 style="font-size:13.5pt; font-weight:700; color:var(--gold-dark); margin-top:4mm; margin-bottom:2mm; text-transform:uppercase; letter-spacing:1px;">${headingText}</h3>`;
    }
    if (p.startsWith("## ")) {
      const headingText = p.substring(3).trim();
      return `<h3 style="font-size:14.5pt; font-weight:700; color:var(--gold-dark); margin-top:4mm; margin-bottom:2mm; text-transform:uppercase; letter-spacing:1px;">${headingText}</h3>`;
    }

    p = p.replace(/\*\*(.*?)\*\*/g, "$1");

    if (p.startsWith("- ") || p.startsWith("* ")) {
      const items = p.split(/\n[-*]\s+/).map(item => {
        const cleanItem = item.replace(/^[-*]\s+/, "").trim();
        return cleanItem ? `<li style="margin-bottom:1.5mm; font-size:13pt; line-height:1.45;">${cleanItem}</li>` : "";
      }).filter(Boolean).join("");
      return `<ul style="margin-left:6mm; margin-bottom:3.5mm; line-height:1.45; font-size:13pt; color:var(--text-main);">${items}</ul>`;
    }

    return splitLargeParagraph(p);
  }).join("\n");

  return html;
};

const escapeHtml = (value) => {
  const str = String(value ?? "");
  const escaped = str
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");

  if (str.includes("\n") || str.includes("**") || str.length > 150) {
    return formatNarrativeText(value);
  }
  return escaped;
};

const formatDegree = (decimalDegree) => {
  const n = typeof decimalDegree === "number" ? decimalDegree : Number(decimalDegree);
  const safe = !Number.isFinite(n) ? 0 : ((n % 30) + 30) % 30;
  const degrees = Math.floor(safe);
  const minutes = Math.floor((safe - degrees) * 60);
  return `${degrees}\u00b0${String(minutes).padStart(2, "0")}'`;
};

const safeString = (val, fallback = "--") => {
  if (val === undefined || val === null) return fallback;
  return typeof val === "string" ? val : JSON.stringify(val);
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

const getStrengthLabel = (score) => {
  const s = Number(score);
  if (isNaN(s)) return "Optimal";
  if (s >= 85) return "Very Strong";
  if (s >= 70) return "Strong";
  if (s >= 50) return "Optimal";
  return "Moderate";
};

const renderChartSvg = (chartData, fallbackAscSignName, chartTitle) => {
  if (!chartData || !chartData.planets) {
    return `
        <div class="chart-box">
          <div style="font-size:11pt; font-weight:700; color:var(--dark-blue); margin-bottom:2mm; text-align:center;">${chartTitle}</div>
          <div style="width:200px; height:200px; display:flex; align-items:center; justify-content:center; background:#FCF8E3; border:1px solid #4C4C4C; color:#ff0000; font-size:10pt;">
            Missing ${chartTitle} Data
          </div>
        </div>`;
  }

  const anchorSignNum = chartData.planets.Ascendant?.sign_num || chartData.planets.ascendant?.sign_num || SIGN_NAME_TO_NUM[fallbackAscSignName] || 1;
  const house1Sign = ((anchorSignNum - 1 + 12) % 12) + 1;

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

  const hasAsc = Array.from(housePlanetsMap.values()).some(arr => arr.some(p => p.name === "Asc"));
  if (!hasAsc) {
    const ascHouse = 1;
    const ascDeg = chartData.planets.Ascendant?.degree || chartData.planets.ascendant?.degree || 0;
    const existing = housePlanetsMap.get(ascHouse) || [];
    existing.unshift({ name: "Asc", degree: ascDeg });
    housePlanetsMap.set(ascHouse, existing);
  }

  housePlanetsMap.forEach((planets) => planets.sort((a, b) => a.degree - b.degree));

  const houseToSignMap = {};
  for (let house = 1; house <= 12; house++) {
    houseToSignMap[house] = ((house1Sign - 1 + (house - 1)) % 12) + 1;
  }

  const svgWidth = 393;
  const svgHeight = 393;

  let elementsMarkup = "";

  NORTH_INDIAN_HOUSE_POSITIONS.forEach(({ house, x, y, numX, numY }) => {
    const signNum = houseToSignMap[house];
    const planets = housePlanetsMap.get(house) || [];

    const sX = numX * svgWidth;
    const sY = numY * svgHeight;
    elementsMarkup += `<text x="${sX.toFixed(1)}" y="${sY.toFixed(1)}" fill="#999999" font-size="9" font-family="Arial" text-anchor="middle" dominant-baseline="middle">${signNum}</text>\n`;

    if (planets.length > 0) {
      let offsetY = -(planets.length - 1) * 6;
      planets.forEach((planet) => {
        const color = PLANET_COLORS[planet.name] || "#333333";
        const pX = x * svgWidth;
        const pY = y * svgHeight + offsetY;
        const degreeStr = formatDegree(planet.degree);
        elementsMarkup += `<text x="${pX.toFixed(1)}" y="${pY.toFixed(1)}" fill="${color}" font-size="10" font-family="Arial" font-weight="bold" text-anchor="middle" dominant-baseline="middle">${planet.name} ${degreeStr}</text>\n`;
        offsetY += 12;
      });
    }
  });

  return `
    <div class="chart-box">
      <div style="font-size:11pt; font-weight:700; color:var(--dark-blue); margin-bottom:2mm; text-align:center;">${chartTitle}</div>
      <svg viewBox="0 0 393 393" style="width:200px; height:200px; background-color:#FCF8E3; border:1px solid #4C4C4C;">
        <rect x="0" y="0" width="393" height="393" fill="#FCF8E3" stroke="#4C4C4C" stroke-width="2" />
        <line x1="0" y1="0" x2="393" y2="393" stroke="#4C4C4C" stroke-width="2" />
        <line x1="393" y1="0" x2="0" y2="393" stroke="#4C4C4C" stroke-width="2" />
        <polygon points="196.5,0 393,196.5 196.5,393 0,196.5" fill="none" stroke="#4C4C4C" stroke-width="2" />
        ${elementsMarkup}
      </svg>
    </div>
    `;
};

const renderSavChartSvg = (ashtakavargaData, fallbackAscSignName, chartTitle) => {
  if (!ashtakavargaData) {
    return `
        <div class="chart-box">
          <div class="chart-title">${chartTitle}</div>
          <div style="width:200px; height:200px; display:flex; align-items:center; justify-content:center; background:#FCF8E3; border:1px solid #4C4C4C; color:#ff0000; font-size:10pt;">
            Missing ${chartTitle} Data
          </div>
        </div>`;
  }

  const anchorSignNum = SIGN_NAME_TO_NUM[fallbackAscSignName] || 1;
  const house1Sign = ((anchorSignNum - 1 + 12) % 12) + 1;

  // Group house scores
  const sav = ashtakavargaData?.sav || [];
  const getScore = (houseNum) => {
    const signIdx = (house1Sign - 1 + (houseNum - 1)) % 12;
    if (Array.isArray(sav)) {
      const val = sav[signIdx];
      return typeof val === "number" ? val : (val?.points ?? 28);
    }
    return 28;
  };

  const svgWidth = 393;
  const svgHeight = 393;
  let elementsMarkup = "";

  NORTH_INDIAN_HOUSE_POSITIONS.forEach(({ house, x, y, numX, numY }) => {
    const signNum = ((house1Sign - 1 + (house - 1)) % 12) + 1;
    const score = getScore(house);

    const sX = numX * svgWidth;
    const sY = numY * svgHeight;
    elementsMarkup += `<text x="${sX.toFixed(1)}" y="${sY.toFixed(1)}" fill="#999999" font-size="9" font-family="Arial" text-anchor="middle" dominant-baseline="middle">${signNum}</text>\n`;

    const pX = x * svgWidth;
    const pY = y * svgHeight;
    elementsMarkup += `<text x="${pX.toFixed(1)}" y="${pY.toFixed(1)}" fill="#6B4A00" font-size="16" font-family="Arial" font-weight="bold" text-anchor="middle" dominant-baseline="middle">${score}</text>\n`;
  });

  return `
    <div class="chart-box">
      <div style="font-size:11pt; font-weight:700; color:var(--dark-blue); margin-bottom:2mm; text-align:center;">${chartTitle}</div>
      <svg viewBox="0 0 393 393" style="width:200px; height:200px; background-color:#FCF8E3; border:1px solid #4C4C4C;">
        <rect x="0" y="0" width="393" height="393" fill="#FCF8E3" stroke="#4C4C4C" stroke-width="2" />
        <line x1="0" y1="0" x2="393" y2="393" stroke="#4C4C4C" stroke-width="2" />
        <line x1="393" y1="0" x2="0" y2="393" stroke="#4C4C4C" stroke-width="2" />
        <polygon points="196.5,0 393,196.5 196.5,393 0,196.5" fill="none" stroke="#4C4C4C" stroke-width="2" />
        ${elementsMarkup}
      </svg>
    </div>
    `;
};

/**
 * Generate Wealth Report HTML content
 */
function generateWealthHtmlTemplate(reportData, userRequest) {
  const { fullName, dateOfbirth, timeOfbirth, placeOfBirth, gender } = userRequest;
  const pred = reportData.predictions || {};
  const astro = reportData.astrologyBasics || {};
  const charts = reportData.horoscopeCharts || {};

  const getVal = (key, fallback = "") => {
    try {
      return pred[key] || fallback;
    } catch (e) { return fallback; }
  };

  const renderFaqBlock = (question, answerKey) => {
    const answer = getVal(answerKey, "Analysis based on your planetary placements is being compiled.");
    return `
      <div style="margin-bottom: 4.5mm; padding-bottom: 3.5mm; border-bottom: 1px solid rgba(154, 120, 0, 0.15);">
        <div style="font-size: 11pt; font-weight: 700; color: var(--gold-deep); margin-bottom: 1.8mm; line-height: 1.4;">Q: ${escapeHtml(question)}</div>
        <p style="font-size: 10.5pt; line-height: 1.55; color: var(--text-main); text-align: justify; font-style: normal; margin-bottom: 0;">${escapeHtml(answer)}</p>
      </div>`;
  };

  // Load Cover & Dividers Base64 Data URIs
  const coverUri = imageToDataUri("frontpage_wealth.jpg");
  const endUri = imageToDataUri("daily_end.jpg");

  const divMoney = imageToDataUri("YOURMONEYDIRECTION.jpg");
  const divEarn = imageToDataUri("HOWYOUEARNBEST.jpg");
  const divStability = imageToDataUri("INCOMESTABILITYVSVOLATILITY.jpg");
  const divRemedies = imageToDataUri("MajorFinancialBlocksAndRemedies.jpg");
  const divSpeed = imageToDataUri("wealthbuildingspeed.jpg");
  const divRisk = imageToDataUri("RiskLOSSAndDebts.jpg");
  const divProperty = imageToDataUri("PropertyAndLongTermAssets.jpg");
  const divRich = imageToDataUri("HowRichCanYouGet.jpg");

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

  return `<!DOCTYPE html>
<html>
<head>
  <meta charset="utf-8">
  <title>Premium Wealth Report</title>
  <link href="https://fonts.googleapis.com/css2?family=Roboto:wght@300;400;500;600;700;900&display=swap" rel="stylesheet">
  <style>
    :root {
      --gold: #F5C518;
      --gold-dark: #9A7800;
      --gold-deep: #6B4A00;
      --gold-light: #FFF9E6;
      --dark-blue: #0B192C;
      --dark-blue-light: #1E293B;
      --white: #FFFFFF;
      --card-bg: #FFFFFF;
      --text-main: #374151;
      --text-muted: #6B7280;
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
      min-height: 297mm;
      box-sizing: border-box;
      padding: 8mm 10mm 6mm 10mm;
      position: relative;
      page-break-after: always;
      page-break-inside: auto;
      display: table !important;
      background-color: var(--white);
      border: 1.5px solid rgba(245, 197, 24, 0.3);
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
    }
    
    /* Cover overlays */
    .bg-cover { background-image: url('${coverUri}'); }
    .bg-end { background-image: url('${endUri}'); }
    
    .bg-div-money { background-image: url('${divMoney}'); }
    .bg-div-earn { background-image: url('${divEarn}'); }
    .bg-div-stability { background-image: url('${divStability}'); }
    .bg-div-remedies { background-image: url('${divRemedies}'); }
    .bg-div-speed { background-image: url('${divSpeed}'); }
    .bg-div-risk { background-image: url('${divRisk}'); }
    .bg-div-property { background-image: url('${divProperty}'); }
    .bg-div-rich { background-image: url('${divRich}'); }

    /* Standard Header styles */
    .header {
      display: table-header-group !important;
      width: 100%;
    }
    
    .header-eyebrow {
      display: flex;
      align-items: center;
      gap: 3mm;
      margin-bottom: 1mm;
    }
    
    .eyebrow-line {
      width: 10mm;
      height: 3px;
      background: var(--gold);
      border-radius: 2px;
    }
    
    .eyebrow-text {
      font-size: 8.5pt;
      font-weight: 700;
      text-transform: uppercase;
      letter-spacing: 2.5px;
      color: var(--gold-dark);
    }
    
    .header-title {
      font-size: 22pt;
      font-weight: 800;
      color: var(--dark-blue);
      letter-spacing: -0.3px;
      margin-bottom: 1mm;
    }
    
    .header-subtitle {
      font-size: 11pt;
      color: #555555;
      font-weight: 400;
    }
    
    .header-gradient {
      height: 2.5px;
      background: linear-gradient(90deg, var(--gold) 0%, rgba(245, 197, 24, 0.2) 60%, transparent 100%);
      margin-top: 2mm;
      margin-bottom: 8mm;
    }

    .footer {
      display: table-footer-group !important;
      width: 100%;
      border-top: 1.5px solid rgba(245, 197, 24, 0.2);
    }
    
    .footer-left { float: left; font-weight: 500; font-size: 8.5pt; color: var(--text-muted); padding-top: 2.5mm; }
    .footer-right { float: right; font-weight: 700; color: var(--gold-dark); font-size: 8.5pt; padding-top: 2.5mm; }

    .page > div:not(.header):not(.footer) {
      display: table-row-group !important;
      width: 100%;
    }

    .narrative-block {
      margin-bottom: 2mm;
    }
    
    .narrative-label {
      font-size: 10pt;
      font-weight: 700;
      text-transform: uppercase;
      letter-spacing: 1.5px;
      color: var(--gold-dark);
      margin-bottom: 1mm;
      padding-bottom: 0.5mm;
      border-bottom: 1.5px solid rgba(245, 197, 24, 0.3);
    }
    
    .narrative-text {
      font-size: 13pt;
      color: var(--text-main);
      line-height: 1.4;
      text-align: justify;
    }

    /* Cards & Layout */
    .grid-2 {
      display: grid;
      grid-template-columns: 1fr 1fr;
      gap: 3mm;
      margin-bottom: 2mm;
    }

    .info-card {
      background: var(--white);
      border: 1.5px solid rgba(245, 197, 24, 0.3);
      border-radius: 8px;
      padding: 3mm 4mm;
    }

    .info-card-title {
      font-size: 8.5pt;
      font-weight: 700;
      text-transform: uppercase;
      letter-spacing: 1.5px;
      color: var(--gold-dark);
      margin-bottom: 1.5mm;
      padding-bottom: 1mm;
      border-bottom: 1px solid rgba(245, 197, 24, 0.2);
    }
    
    .info-card-row {
      display: flex;
      justify-content: space-between;
      align-items: center;
      padding: 1.5mm 0;
      border-bottom: 1px solid #F3F4F6;
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
      color: #111827;
      text-align: right;
    }

    /* TOC styles */
    .toc-row {
      display: flex;
      align-items: baseline;
      padding: 1.2mm 0;
      border-bottom: 1px solid #F3F4F6;
    }
    
    .toc-num {
      font-size: 13.5pt;
      font-weight: 700;
      color: var(--gold-dark);
      width: 10mm;
      flex-shrink: 0;
    }
    
    .toc-title {
      font-size: 13pt;
      font-weight: 500;
      color: #374151;
      flex: 1;
    }
    
    .toc-dots {
      flex: 1;
      border-bottom: 1.5px dotted #D1D5DB;
      margin: 0 3mm;
      max-width: 35mm;
    }
    
    .toc-page {
      font-size: 13pt;
      font-weight: 700;
      color: #111111;
      width: 15mm;
      text-align: right;
    }

    /* Charts */
    .charts-container {
      display: flex;
      flex-direction: row;
      justify-content: space-around;
      align-items: center;
      margin-top: 2mm;
      flex: 1;
      width: 100%;
    }

    .chart-box {
      border: 1.5px solid rgba(245, 197, 24, 0.3);
      border-radius: 8px;
      background: var(--white);
      padding: 2.5mm;
      display: flex;
      flex-direction: column;
      align-items: center;
    }

    /* Tables */
    .table-wrap {
      border: 1.5px solid #E5E7EB;
      border-radius: 8px;
      overflow: hidden;
      margin-top: 1.5mm;
    }
    
    .premium-table {
      width: 100%;
      border-collapse: collapse;
    }
    
    .premium-table th {
      background: var(--dark-blue);
      color: var(--gold);
      font-size: 11pt;
      font-weight: 700;
      text-transform: uppercase;
      letter-spacing: 1.5px;
      padding: 2mm 2.5mm;
      text-align: left;
      border: none;
    }
    
    .premium-table td {
      padding: 1.5mm 2.5mm;
      font-size: 12pt;
      border-bottom: 1px solid #F3F4F6;
      vertical-align: middle;
      line-height: 1.4;
      color: #374151;
    }
    
    .premium-table tr:last-child td {
      border-bottom: none;
    }
    
    .premium-table tr:nth-child(even) td {
      background: var(--gold-light);
    }

    .status-badge {
      display: inline;
      font-size: 9pt;
      font-weight: 500;
      color: #374151;
    }

    /* Meters */
    .meter-wrap {
      margin-bottom: 2mm;
    }

    .meter-label {
      display: flex;
      justify-content: space-between;
      font-size: 10pt;
      font-weight: 600;
      color: #374151;
      margin-bottom: 0.8mm;
    }

    .meter-bg {
      height: 2.5mm;
      background: #F3F4F6;
      border-radius: 4px;
      overflow: hidden;
      border: 1px solid rgba(245, 197, 24, 0.2);
    }

    .meter-fill {
      height: 100%;
      background: linear-gradient(90deg, var(--gold-dark) 0%, var(--gold) 100%);
      border-radius: 4px;
    }

    /* Dasha timeframe timeline */
    .timeline-wrap {
      margin-top: 2.5mm;
      padding: 2.5mm 3.5mm;
      background: var(--white);
      border: 1.5px solid rgba(245, 197, 24, 0.3);
      border-radius: 8px;
    }

    .timeline-title {
      font-size: 10.5pt;
      font-weight: 700;
      color: var(--gold-dark);
      text-transform: uppercase;
      letter-spacing: 1px;
      margin-bottom: 1.5mm;
      border-bottom: 1.5px solid rgba(245, 197, 24, 0.2);
      padding-bottom: 0.8mm;
    }

    .timeline-badge {
      display: inline-block;
      padding: 0.8mm 2mm;
      border-radius: 4px;
      font-size: 9pt;
      font-weight: 700;
      margin-top: 1mm;
      margin-right: 1mm;
    }

    .timeline-badge.green {
      background: #DCFCE7;
      border: 1px solid #86EFAC;
      color: #059669;
    }

    .timeline-badge.yellow {
      background: #FEF9C3;
      border: 1px solid #FDE047;
      color: #A16207;
    }

    .timeline-badge.red {
      background: #FEE2E2;
      border: 1px solid #FCA5A5;
      color: #B91C1C;
    }

    .archetype-box {
      border: 1.5px solid var(--gold);
      border-radius: 6px;
      background: var(--gold-light);
      padding: 2mm 3mm;
      margin-top: 2mm;
      text-align: center;
    }

    .archetype-box-label {
      font-size: 8.5pt;
      font-weight: 700;
      text-transform: uppercase;
      letter-spacing: 1px;
      color: var(--gold-dark);
    }

    .archetype-box-value {
      font-size: 13.5pt;
      font-weight: 800;
      color: var(--dark-blue);
      text-transform: uppercase;
      margin-top: 0.8mm;
    }

    .bullet-list {
      margin: 1.5mm 0;
      padding-left: 4mm;
    }

    .bullet-list li {
      margin-bottom: 1.5mm;
      font-size: 11.5pt;
      line-height: 1.5;
      color: var(--text-main);
      list-style-type: square;
    }

    .bullet-list li::marker {
      color: var(--gold);
    }

    /* Tight page overrides for crowded layout fitting at 1.5x font size */
    .tight-page {
      padding: 6mm 8mm 4mm 8mm !important;
    }
    .tight-page .header {
      margin-bottom: 1.5mm !important;
    }
    .tight-page .narrative-text, 
    .tight-page p, 
    .tight-page td, 
    .tight-page th,
    .tight-page .bullet-list li {
      line-height: 1.35 !important;
    }
    .tight-page .narrative-block {
      margin-bottom: 1.5mm !important;
    }
    .tight-page .table-wrap {
      margin-top: 1mm !important;
    }
    .tight-page .premium-table td {
      padding: 1.2mm 2.5mm !important;
    }
    .tight-page .toc-row {
      padding: 0.2mm 0 !important;
      line-height: 1.2 !important;
    }
    .tight-page .toc-num {
      font-size: 13.5pt !important;
    }
    .tight-page .toc-title,
    .tight-page .toc-page {
      font-size: 13pt !important;
    }

  </style>
</head>
<body>

  <!-- PAGE 1: COVER -->
  <div class="img-page-bg bg-cover"></div>

  <!-- PAGE 2: ABOUT THIS REPORT -->
  <div class="page">
    <div class="header">
      <div class="header-eyebrow">
        <div class="eyebrow-line"></div>
        <span class="eyebrow-text">Introduction</span>
      </div>
      <h1 class="header-title">About This Report</h1>
      <p class="header-subtitle">Your personalised Cosmic Path to Prosperity</p>
      <div class="header-gradient"></div>
    </div>
     <div style="flex:1;">
      <p style="margin-bottom:3.5mm; line-height:1.6; font-size:13.5pt; color:#374151; text-align:justify;">Welcome to your personalised Vedic Astrology Wealth Report. This comprehensive document has been meticulously prepared using your exact birth details — date, time, and place of birth — to create a highly personalised financial and material forecast.</p>
      <p style="margin-bottom:3.5mm; line-height:1.6; font-size:13.5pt; color:#374151; text-align:justify;">This report analyses your life's wealth potential through the lens of Vedic (Jyotish) and KP astrology. It covers twelve critical domains of prosperity: Your Wealth Blueprint, Divisional Horoscope Charts, Vimshottari Dasha cycles, Your Money Direction, How You Earn Best, Income Stability, Financial Blocks &amp; Remedies, Wealth Building Speed, Risk, Loss &amp; Debts, Property &amp; Long-Term Assets, and your ultimate Abundance Ceiling.</p>
      <p style="margin-bottom:3.5mm; line-height:1.6; font-size:13.5pt; color:#374151; text-align:justify;">The insights in this report are derived from your natal chart (Rasi D1), Hora chart (D2), Chaturthamsa chart (D4), Vimshottari Dasha cycles, Ashtakvarga scores, and key planetary alignments calculated specifically for your birth coordinate metrics.</p>
      <p style="margin-bottom:3.5mm; line-height:1.6; font-size:13.5pt; color:#374151; text-align:justify;">Use this report as a strategic guide for asset building and timing financial moves. The planetary energies described here represent cosmic predispositions and opportunities. Your efforts, diligence, and choices ultimately shape your financial outcomes. May this roadmap guide you to prosperity.</p>
    </div>
    <div class="footer">
      <span class="footer-left">Vedic Wealth Report · ${escapeHtml(fullName)}</span>
      <span class="footer-right">Page 2</span>
    </div>
  </div>

  <!-- PAGE 3: HOW TO READ YOUR REPORT -->
  <div class="page tight-page">
    <div class="header">
      <div class="header-eyebrow">
        <div class="eyebrow-line"></div>
        <span class="eyebrow-text">Guide</span>
      </div>
      <h1 class="header-title">How To Read Your Report</h1>
      <p class="header-subtitle">Understanding the structure and wealth terminology</p>
      <div class="header-gradient"></div>
    </div>
    <div style="flex:1;">
      <div style="font-size:12.5pt; line-height:1.45; color:#374151; margin-bottom:1.5mm; text-align:justify;">
        <p style="margin-bottom:1.5mm; line-height:1.45; text-align:justify;">This report is divided into clearly structured sections for easy navigation. The first section presents your birth details, cosmic identity, active Dasha periods, and natal horoscope charts. This establishes the foundation upon which all predictions are built.</p>
        <p style="margin-bottom:1.5mm; line-height:1.45; text-align:justify;">The wealth analysis sections form the core of this report. Each major topic begins with a full-page artistic illustration, followed by dedicated pages for each life domain. Every section contains detailed analysis backed by your actual planetary positions and transit data.</p>
        <p style="margin-bottom:1.5mm; line-height:1.45; text-align:justify;">When you encounter tables with assets and timings, these represent calculated windows of opportunity or caution based on transits through your wealth houses (2nd, 6th, 10th, 11th, and 12th). Favourable phases align with benefic planetary transits, while caution phases correspond to challenging house transits.</p>
        <p style="margin-bottom:1.5mm; line-height:1.45; text-align:justify;">The remedies section at the end of key topics provides actionable spiritual practices, mantras, and lifestyle adjustments tailored to your chart. These are traditional Vedic prescriptions designed to strengthen weak planetary influences and enhance positive ones.</p>
      </div>
      
      <div style="font-size:9.5pt; font-weight:700; text-transform:uppercase; letter-spacing:1.5px; color:var(--gold-dark); margin-bottom:2mm;">
        Wealth Section Guide
      </div>
      <div class="table-wrap">
        <table class="premium-table">
          <thead>
            <tr>
              <th style="width: 25%; font-size:12pt; padding:1.2mm 2.5mm;">Section</th>
              <th style="font-size:12pt; padding:1.2mm 2.5mm;">What It Covers</th>
            </tr>
          </thead>
          <tbody>
            <tr>
              <td style="font-size:12pt; padding:1.2mm 2.5mm; font-weight:700; color:var(--dark-blue);">Wealth Blueprint</td>
              <td style="font-size:12pt; padding:1.2mm 2.5mm;">Core wealth-building traits, weak points, and your cosmic wealth archetype.</td>
            </tr>
            <tr>
              <td style="font-size:12pt; padding:1.2mm 2.5mm; font-weight:700; color:var(--dark-blue);">Dasha Cycles</td>
              <td style="font-size:12pt; padding:1.2mm 2.5mm;">Vimshottari Dasha period analysis across all major planetary timelines.</td>
            </tr>
            <tr>
              <td style="font-size:12pt; padding:1.2mm 2.5mm; font-weight:700; color:var(--dark-blue);">Money Direction</td>
              <td style="font-size:12pt; padding:1.2mm 2.5mm;">Active vs passive wealth style, current dasha flows, and lifting factors.</td>
            </tr>
            <tr>
              <td style="font-size:12pt; padding:1.2mm 2.5mm; font-weight:700; color:var(--dark-blue);">How You Earn Best</td>
              <td style="font-size:12pt; padding:1.2mm 2.5mm;">Ideal professional role, aligned industries, skills to monetize, and environments.</td>
            </tr>
            <tr>
              <td style="font-size:12pt; padding:1.2mm 2.5mm; font-weight:700; color:var(--dark-blue);">Income Stability</td>
              <td style="font-size:12pt; padding:1.2mm 2.5mm;">Earning spike patterns, stability preferences, and volatility management.</td>
            </tr>
            <tr>
              <td style="font-size:12pt; padding:1.2mm 2.5mm; font-weight:700; color:var(--dark-blue);">Dashboard &amp; Scoring</td>
              <td style="font-size:12pt; padding:1.2mm 2.5mm;">Composite energy ratings, key house/planet summary, and lifting factors.</td>
            </tr>
          </tbody>
        </table>
      </div>
    </div>
    <div class="footer">
      <span class="footer-left">Vedic Wealth Report · ${escapeHtml(fullName)}</span>
      <span class="footer-right">Page 3</span>
    </div>
  </div>

  <!-- PAGE 4: WHAT IS VEDIC ASTROLOGY -->
  <div class="page tight-page">
    <div class="header">
      <div class="header-eyebrow">
        <div class="eyebrow-line"></div>
        <span class="eyebrow-text">Foundation</span>
      </div>
      <h1 class="header-title">What is Vedic Astrology?</h1>
      <p class="header-subtitle">The ancient science of Jyotish Shastra</p>
      <div class="header-gradient"></div>
    </div>
    <div style="flex:1;">
      <p style="margin-bottom:3.5mm; line-height:1.6; font-size:12.5pt; color:#374151; text-align:justify;">Vedic Astrology, known as Jyotish Shastra, is one of the oldest systems of astronomical observation and prediction, originating in ancient India over 5,000 years ago. Unlike Western astrology which uses the Tropical zodiac, Vedic astrology employs the Sidereal zodiac, accounting for the precession of equinoxes.</p>
      <p style="margin-bottom:3.5mm; line-height:1.6; font-size:12.5pt; color:#374151; text-align:justify;">The foundation of Jyotish lies in the belief that celestial bodies — the Sun, Moon, Mars, Mercury, Jupiter, Venus, Saturn, and the lunar nodes Rahu and Ketu — exert measurable influences on human affairs. These nine celestial bodies, called the Navagraha, govern different aspects of life through their placement in the twelve houses and signs of the zodiac.</p>
      <p style="margin-bottom:3.5mm; line-height:1.6; font-size:12.5pt; color:#374151; text-align:justify;">A birth chart (Kundli) is a snapshot of the sky at the exact moment and location of your birth. It maps the positions of all nine planets across twelve houses, each governing specific life domains such as personality, wealth, communication, home, creativity, health, partnerships, transformation, fortune, career, gains, and spiritual liberation.</p>
      <p style="margin-bottom:3.5mm; line-height:1.6; font-size:12.5pt; color:#374151; text-align:justify;">This report also incorporates the KP (Krishnamurti Paddhati) system, a modern refinement of Vedic astrology that uses sub-lords and cuspal analysis for precise timing of events. The combination of traditional Parashari methods with KP techniques provides a comprehensive and accurate predictive framework.</p>
    </div>
    <div class="footer">
      <span class="footer-left">Vedic Wealth Report · ${escapeHtml(fullName)}</span>
      <span class="footer-right">Page 4</span>
    </div>
  </div>

  <!-- PAGE 5: UNDERSTANDING DASHA SYSTEMS -->
  <div class="page tight-page">
    <div class="header">
      <div class="header-eyebrow">
        <div class="eyebrow-line"></div>
        <span class="eyebrow-text">Timing System</span>
      </div>
      <h1 class="header-title">Understanding Dasha Systems</h1>
      <p class="header-subtitle">How planetary periods shape your life journey</p>
      <div class="header-gradient"></div>
    </div>
    <div style="flex:1;">
      <div style="font-size:12pt; line-height:1.4; color:#374151; margin-bottom:1mm; text-align:justify;">
        <p style="margin-bottom:1mm; line-height:1.4; text-align:justify;">The Vimshottari Dasha system is the most widely used predictive timing tool in Vedic Astrology. It divides your life into planetary periods totalling 120 years, with each planet ruling a specific number of years. The sequence is: Ketu (7 years), Venus (20 years), Sun (6 years), Moon (10 years), Mars (7 years), Rahu (18 years), Jupiter (16 years), Saturn (19 years), and Mercury (17 years).</p>
        <p style="margin-bottom:1mm; line-height:1.4; text-align:justify;">Your starting Dasha is determined by the Moon's position in its birth Nakshatra at the exact moment of your birth. Each major period (Mahadasha) is further subdivided into sub-periods (Antardasha) and sub-sub-periods (Pratyantardasha), creating a layered system of planetary influence.</p>
        <p style="margin-bottom:1mm; line-height:1.4; text-align:justify;">During any given period, the Mahadasha lord sets the overarching theme of your life, while the Antardasha lord colours the specific experiences within that theme. The Pratyantardasha provides even finer timing for events. Understanding your current Dasha configuration is essential for interpreting the monthly predictions in this report.</p>
        <p style="margin-bottom:1mm; line-height:1.4; text-align:justify;">The interplay between Dasha lords and transiting planets creates unique windows of opportunity and challenge. When a benefic Dasha lord is supported by favourable transits, results tend to be positive. Conversely, a malefic Dasha lord combined with challenging transits requires greater caution and the application of remedial measures.</p>
      </div>
      
      <div class="table-wrap" style="margin-top: 0.5mm;">
        <table class="premium-table">
          <thead>
            <tr>
              <th style="font-size:12pt; padding:1mm 2.5mm;">Planet</th>
              <th style="font-size:12pt; padding:1mm 2.5mm;">Duration</th>
              <th style="font-size:12pt; padding:1mm 2.5mm;">Nature &amp; Theme</th>
            </tr>
          </thead>
          <tbody>
            <tr><td style="font-size:12pt; padding:0.6mm 2mm; font-weight:700;">Ketu</td><td style="font-size:12pt; padding:0.6mm 2mm;">7 Years</td><td style="font-size:12pt; padding:0.6mm 2mm;">Spiritual, sudden changes, detachment, liberation</td></tr>
            <tr><td style="font-size:12pt; padding:0.6mm 2mm; font-weight:700;">Venus</td><td style="font-size:12pt; padding:0.6mm 2mm;">20 Years</td><td style="font-size:12pt; padding:0.6mm 2mm;">Luxury, love, creativity, material prosperity</td></tr>
            <tr><td style="font-size:12pt; padding:0.6mm 2mm; font-weight:700;">Sun</td><td style="font-size:12pt; padding:0.6mm 2mm;">6 Years</td><td style="font-size:12pt; padding:0.6mm 2mm;">Authority, vitality, government, leadership</td></tr>
            <tr><td style="font-size:12pt; padding:0.6mm 2mm; font-weight:700;">Moon</td><td style="font-size:12pt; padding:0.6mm 2mm;">10 Years</td><td style="font-size:12pt; padding:0.6mm 2mm;">Emotions, mind, nurturing, public image</td></tr>
            <tr><td style="font-size:12pt; padding:0.6mm 2mm; font-weight:700;">Mars</td><td style="font-size:12pt; padding:0.6mm 2mm;">7 Years</td><td style="font-size:12pt; padding:0.6mm 2mm;">Energy, courage, property, technical skills</td></tr>
            <tr><td style="font-size:12pt; padding:0.6mm 2mm; font-weight:700;">Rahu</td><td style="font-size:12pt; padding:0.6mm 2mm;">18 Years</td><td style="font-size:12pt; padding:0.6mm 2mm;">Ambition, foreign, unconventional paths</td></tr>
            <tr><td style="font-size:12pt; padding:0.6mm 2mm; font-weight:700;">Jupiter</td><td style="font-size:12pt; padding:0.6mm 2mm;">16 Years</td><td style="font-size:12pt; padding:0.6mm 2mm;">Wisdom, expansion, fortune, children</td></tr>
            <tr><td style="font-size:12pt; padding:0.6mm 2mm; font-weight:700;">Saturn</td><td style="font-size:12pt; padding:0.6mm 2mm;">19 Years</td><td style="font-size:12pt; padding:0.6mm 2mm;">Discipline, hard work, karma, delays</td></tr>
            <tr><td style="font-size:12pt; padding:0.6mm 2mm; font-weight:700;">Mercury</td><td style="font-size:12pt; padding:0.6mm 2mm;">17 Years</td><td style="font-size:12pt; padding:0.6mm 2mm;">Intelligence, business, communication</td></tr>
          </tbody>
        </table>
      </div>
    </div>
    <div class="footer">
      <span class="footer-left">Vedic Wealth Report · ${escapeHtml(fullName)}</span>
      <span class="footer-right">Page 5</span>
    </div>
  </div>

  <!-- PAGE 6: THE TWELVE HOUSES -->
  <div class="page">
    <div class="header">
      <div class="header-eyebrow">
        <div class="eyebrow-line"></div>
        <span class="eyebrow-text">Zodiac Framework</span>
      </div>
      <h1 class="header-title">The Twelve Houses</h1>
      <p class="header-subtitle">Each house governs a specific domain of your life</p>
      <div class="header-gradient"></div>
    </div>
    <div class="table-wrap" style="flex:1;">
      <table class="premium-table">
        <thead>
          <tr>
            <th style="width: 10%;">No.</th>
            <th style="width: 30%;">Sanskrit Name</th>
            <th>Signification</th>
          </tr>
        </thead>
        <tbody>
          ${Object.entries(HOUSE_SIGNIFICATIONS).map(([house, h]) => `
            <tr>
              <td style="text-align:center; font-weight:800; color:var(--gold-dark); font-size:11.5pt;">${house}</td>
              <td style="font-weight:700; color:var(--dark-blue);">${h.name}</td>
              <td>${h.desc}</td>
            </tr>
          `).join("")}
        </tbody>
      </table>
    </div>
    <div class="footer">
      <span class="footer-left">Vedic Wealth Report · ${escapeHtml(fullName)}</span>
      <span class="footer-right">Page 6</span>
    </div>
  </div>

  <!-- PAGE 7: THE NINE PLANETS -->
  <div class="page">
    <div class="header">
      <div class="header-eyebrow">
        <div class="eyebrow-line"></div>
        <span class="eyebrow-text">Celestial Bodies</span>
      </div>
      <h1 class="header-title">The Nine Planets</h1>
      <p class="header-subtitle">Navagraha — the cosmic forces shaping your destiny</p>
      <div class="header-gradient"></div>
    </div>
    <div class="table-wrap" style="flex:1;">
      <table class="premium-table">
        <thead>
          <tr>
            <th style="width: 25%;">Planet</th>
            <th style="width: 20%;">Rules</th>
            <th style="width: 20%;">Nature</th>
            <th>Governs</th>
          </tr>
        </thead>
        <tbody>
          <tr>
            <td style="font-weight:700; color:var(--dark-blue);">Sun (Surya)</td>
            <td>Leo</td>
            <td style="font-style:italic; color:var(--gold-dark);">Royal, authoritative</td>
            <td>Soul, father, government, vitality, leadership, and self-confidence</td>
          </tr>
          <tr>
            <td style="font-weight:700; color:var(--dark-blue);">Moon (Chandra)</td>
            <td>Cancer</td>
            <td style="font-style:italic; color:var(--gold-dark);">Nurturing, emotional</td>
            <td>Mind, mother, emotions, fertility, public image, and mental peace</td>
          </tr>
          <tr>
            <td style="font-weight:700; color:var(--dark-blue);">Mars (Mangal)</td>
            <td>Aries &amp; Scorpio</td>
            <td style="font-style:italic; color:var(--gold-dark);">Aggressive, courageous</td>
            <td>Energy, siblings, property, courage, surgery, and military affairs</td>
          </tr>
          <tr>
            <td style="font-weight:700; color:var(--dark-blue);">Mercury (Budh)</td>
            <td>Gemini &amp; Virgo</td>
            <td style="font-style:italic; color:var(--gold-dark);">Intellectual, communicative</td>
            <td>Intelligence, speech, commerce, education, writing, and analysis</td>
          </tr>
          <tr>
            <td style="font-weight:700; color:var(--dark-blue);">Jupiter (Guru)</td>
            <td>Sagittarius &amp; Pisces</td>
            <td style="font-style:italic; color:var(--gold-dark);">Benevolent, expansive</td>
            <td>Wisdom, children, wealth, spirituality, teaching, and divine grace</td>
          </tr>
          <tr>
            <td style="font-weight:700; color:var(--dark-blue);">Venus (Shukra)</td>
            <td>Taurus &amp; Libra</td>
            <td style="font-style:italic; color:var(--gold-dark);">Luxurious, artistic</td>
            <td>Love, marriage, beauty, art, vehicles, luxury, and material comfort</td>
          </tr>
          <tr>
            <td style="font-weight:700; color:var(--dark-blue);">Saturn (Shani)</td>
            <td>Capricorn &amp; Aquarius</td>
            <td style="font-style:italic; color:var(--gold-dark);">Disciplined, restrictive</td>
            <td>Discipline, longevity, delays, karma, service, and hard work</td>
          </tr>
          <tr>
            <td style="font-weight:700; color:var(--dark-blue);">Rahu (North Node)</td>
            <td>Aquarius (Co-ruler)</td>
            <td style="font-style:italic; color:var(--gold-dark);">Illusory, ambitious</td>
            <td>Foreign matters, obsession, unconventional paths, and material desires</td>
          </tr>
          <tr>
            <td style="font-weight:700; color:var(--dark-blue);">Ketu (South Node)</td>
            <td>Scorpio (Co-ruler)</td>
            <td style="font-style:italic; color:var(--gold-dark);">Spiritual, detaching</td>
            <td>Spiritual liberation, past lives, mysticism, and sudden events</td>
          </tr>
        </tbody>
      </table>
    </div>
    <div class="footer">
      <span class="footer-left">Vedic Wealth Report · ${escapeHtml(fullName)}</span>
      <span class="footer-right">Page 7</span>
    </div>
  </div>

  <!-- PAGE 8: DISCLAIMER -->
  <div class="page tight-page">
    <div class="header">
      <div class="header-eyebrow">
        <div class="eyebrow-line"></div>
        <span class="eyebrow-text">Legal Notice</span>
      </div>
      <h1 class="header-title">Disclaimer</h1>
      <p class="header-subtitle">Vedic wealth analysis and interpretive roadmap</p>
      <div class="header-gradient"></div>
    </div>
    <div style="flex:1; font-size:12.5pt; line-height:1.5; text-align:justify; color:#374151;">
      <h3 style="font-size:13.5pt; font-weight:700; color:#0B192C; margin:4mm 0 2mm;">Astrological Interpretation Disclaimer</h3>
      <p style="margin-bottom:3.5mm; line-height:1.5; text-align:justify;">This Wealth Report is generated using calculations based on Vedic and KP astrological models, planetary coordinates, and Vimshottari Dasha systems computed for your specific birth indicators.</p>
      <p style="margin-bottom:3.5mm; line-height:1.5; text-align:justify;">Astrological forecasts are intended to provide guidance, trends, and potentials based on celestial alignments. They represent predispositions rather than absolute certainties. Personal decisions, effort, and environment are the primary drivers of real-world outcomes.</p>
      <p style="margin-bottom:3.5mm; line-height:1.5; text-align:justify;">This report outlines trends and configuration parameters related to wealth, assets, and financial timing. It should not be treated as professional financial, legal, investment, or tax advice. Consult a certified financial advisor before making material investments.</p>
      <p style="margin-bottom:3.5mm; line-height:1.5; text-align:justify;">While we strive to ensure accurate calculation outputs, Graho makes no warranties regarding the absolute precision or guarantee of any timing window or abundance prediction. All actions taken based on this report are at your sole discretion and responsibility.</p>
    </div>
    <div class="footer">
      <span class="footer-left">Vedic Wealth Report · ${escapeHtml(fullName)}</span>
      <span class="footer-right">Page 8</span>
    </div>
  </div>

  <!-- PAGE 9: TABLE OF CONTENTS -->
  <div class="page tight-page">
    <div class="header">
      <div class="header-eyebrow">
        <div class="eyebrow-line"></div>
        <span class="eyebrow-text">Navigation</span>
      </div>
      <h1 class="header-title">Table of Contents</h1>
      <p class="header-subtitle">Quick reference to all sections of your report</p>
      <div class="header-gradient"></div>
    </div>
    <div style="display:grid; grid-template-columns:1fr 1fr; gap:3mm; margin-top:0.5mm; flex:1;">
      <div>
        <div class="toc-row"><div class="toc-num">01.</div><div class="toc-title">About This Report</div><div class="toc-dots"></div><div class="toc-page">Page 2</div></div>
        <div class="toc-row"><div class="toc-num">02.</div><div class="toc-title">How To Read Your Report</div><div class="toc-dots"></div><div class="toc-page">Page 3</div></div>
        <div class="toc-row"><div class="toc-num">03.</div><div class="toc-title">What is Vedic Astrology?</div><div class="toc-dots"></div><div class="toc-page">Page 4</div></div>
        <div class="toc-row"><div class="toc-num">04.</div><div class="toc-title">Understanding Dasha Systems</div><div class="toc-dots"></div><div class="toc-page">Page 5</div></div>
        <div class="toc-row"><div class="toc-num">05.</div><div class="toc-title">Houses &amp; Their Significations</div><div class="toc-dots"></div><div class="toc-page">Page 6</div></div>
        <div class="toc-row"><div class="toc-num">06.</div><div class="toc-title">The Nine Planets</div><div class="toc-dots"></div><div class="toc-page">Page 7</div></div>
        <div class="toc-row"><div class="toc-num">07.</div><div class="toc-title">Disclaimer</div><div class="toc-dots"></div><div class="toc-page">Page 8</div></div>
        <div class="toc-row"><div class="toc-num">08.</div><div class="toc-title">Cosmic Snapshot</div><div class="toc-dots"></div><div class="toc-page">Page 10</div></div>
        <div class="toc-row"><div class="toc-num">09.</div><div class="toc-title">Divisional Charts (D1, D2, D4 &amp; SAV)</div><div class="toc-dots"></div><div class="toc-page">Page 11</div></div>
        <div class="toc-row"><div class="toc-num">10.</div><div class="toc-title">Your Wealth Blueprint</div><div class="toc-dots"></div><div class="toc-page">Page 12</div></div>
        <div class="toc-row"><div class="toc-num">11.</div><div class="toc-title">Divisional Analysis Summary</div><div class="toc-dots"></div><div class="toc-page">Page 13</div></div>
        <div class="toc-row"><div class="toc-num">12.</div><div class="toc-title">Vimshottari Dasha Cycles</div><div class="toc-dots"></div><div class="toc-page">Page 14</div></div>
        <div class="toc-row"><div class="toc-num">13.</div><div class="toc-title">Your Money Direction</div><div class="toc-dots"></div><div class="toc-page">Page 24</div></div>
      </div>
      <div>
        <div class="toc-row"><div class="toc-num">14.</div><div class="toc-title">How You Earn Best</div><div class="toc-dots"></div><div class="toc-page">Page 28</div></div>
        <div class="toc-row"><div class="toc-num">15.</div><div class="toc-title">Income Stability Analysis</div><div class="toc-dots"></div><div class="toc-page">Page 32</div></div>
        <div class="toc-row"><div class="toc-num">16.</div><div class="toc-title">Wealth Dashboard &amp; Scoring</div><div class="toc-dots"></div><div class="toc-page">Page 34</div></div>
        <div class="toc-row"><div class="toc-num">17.</div><div class="toc-title">Financial Blocks &amp; Remedies</div><div class="toc-dots"></div><div class="toc-page">Page 37</div></div>
        <div class="toc-row"><div class="toc-num">18.</div><div class="toc-title">Wealth Compounding Speed</div><div class="toc-dots"></div><div class="toc-page">Page 39</div></div>
        <div class="toc-row"><div class="toc-num">19.</div><div class="toc-title">Risk, Loss &amp; Debts</div><div class="toc-dots"></div><div class="toc-page">Page 42</div></div>
        <div class="toc-row"><div class="toc-num">20.</div><div class="toc-title">Property &amp; Long-Term Assets</div><div class="toc-dots"></div><div class="toc-page">Page 45</div></div>
        <div class="toc-row"><div class="toc-num">21.</div><div class="toc-title">Ceiling, Timings &amp; Action Plan</div><div class="toc-dots"></div><div class="toc-page">Page 48</div></div>
        <div class="toc-row"><div class="toc-num">22.</div><div class="toc-title">Frequently Asked Wealth Questions</div><div class="toc-dots"></div><div class="toc-page">Page 52</div></div>
      </div>
    </div>
    <div class="footer">
      <span class="footer-left">Vedic Wealth Report · ${escapeHtml(fullName)}</span>
      <span class="footer-right">Page 9</span>
    </div>
  </div>

  <!-- PAGE 10: COSMIC SNAPSHOT -->
  <div class="page">
    <div style="text-align: center; margin-top: 10mm; margin-bottom: 5mm;">
      <div style="display: flex; align-items: center; justify-content: center; gap: 6mm;">
        <!-- Left Ornament -->
        <svg width="80" height="24" viewBox="0 0 80 24" fill="none" xmlns="http://www.w3.org/2000/svg">
          <path d="M0 12H30M80 12H50" stroke="#cfa851" stroke-width="1.5"/>
          <circle cx="40" cy="12" r="4" fill="#cfa851"/>
          <path d="M35 12C35 7.58172 37.2386 4 40 4C42.7614 4 45 7.58172 45 12C45 16.4183 42.7614 20 40 20C37.2386 20 35 16.4183 35 12Z" stroke="#cfa851" stroke-width="1.5"/>
          <path d="M25 12C25 9.23858 28.3579 7 32.5 7C36.6421 7 40 9.23858 40 12C40 14.7614 36.6421 17 32.5 17C28.3579 17 25 14.7614 25 12Z" stroke="#cfa851" stroke-width="1"/>
          <path d="M40 12C40 9.23858 43.3579 7 47.5 7C51.6421 7 55 9.23858 55 12C55 14.7614 51.6421 17 47.5 17C43.3579 17 40 14.7614 40 12Z" stroke="#cfa851" stroke-width="1"/>
        </svg>
        <span style="font-size: 18pt; font-weight: 800; color: var(--dark-blue); font-family: 'Roboto', sans-serif; letter-spacing: 0.5px; text-transform: capitalize;">Cosmic Snapshot</span>
        <!-- Right Ornament -->
        <svg width="80" height="24" viewBox="0 0 80 24" fill="none" xmlns="http://www.w3.org/2000/svg">
          <path d="M0 12H30M80 12H50" stroke="#cfa851" stroke-width="1.5"/>
          <circle cx="40" cy="12" r="4" fill="#cfa851"/>
          <path d="M35 12C35 7.58172 37.2386 4 40 4C42.7614 4 45 7.58172 45 12C45 16.4183 42.7614 20 40 20C37.2386 20 35 16.4183 35 12Z" stroke="#cfa851" stroke-width="1.5"/>
          <path d="M25 12C25 9.23858 28.3579 7 32.5 7C36.6421 7 40 9.23858 40 12C40 14.7614 36.6421 17 32.5 17C28.3579 17 25 14.7614 25 12Z" stroke="#cfa851" stroke-width="1"/>
          <path d="M40 12C40 9.23858 43.3579 7 47.5 7C51.6421 7 55 9.23858 55 12C55 14.7614 51.6421 17 47.5 17C43.3579 17 40 14.7614 40 12Z" stroke="#cfa851" stroke-width="1"/>
        </svg>
      </div>
      <div style="height: 1.5px; background: linear-gradient(90deg, transparent 0%, var(--gold) 50%, transparent 100%); margin-top: 5mm; width: 90%; margin-left: auto; margin-right: auto;"></div>
    </div>
    
    <div style="flex: 1; display: flex; flex-direction: column; gap: 6mm; margin-top: 5mm; margin-bottom: 5mm; padding: 0 8mm;">
      <!-- Card 1: Personal Information -->
      <div style="border: 1px solid rgba(207, 168, 81, 0.4); background: #FCFBF7; border-radius: 8px; padding: 5mm 6mm; box-shadow: 0 2px 8px rgba(0,0,0,0.03);">
        <div style="font-size: 11pt; font-weight: bold; color: var(--gold-dark); text-transform: capitalize; margin-bottom: 2mm; font-family: 'Roboto', sans-serif;">Personal Information</div>
        <div style="border-bottom: 1px solid rgba(207, 168, 81, 0.25); margin-bottom: 4mm; width: 100%;"></div>
        
        <div style="display: grid; grid-template-columns: 1fr 1fr; gap: 4mm;">
          <!-- Name -->
          <div style="display: flex; align-items: center; justify-content: space-between; border-left: 3.5px solid #cfa851; padding: 2.5mm 3.5mm; background: #FFF; border-radius: 4px; border-top: 1px solid #F1EFEA; border-right: 1px solid #F1EFEA; border-bottom: 1px solid #F1EFEA;">
            <span style="font-size: 10.5pt; font-weight: bold; color: var(--text-muted); font-family: 'Roboto', sans-serif;">Name</span>
            <span style="font-size: 11.5pt; font-weight: bold; color: var(--dark-blue); font-family: 'Roboto', sans-serif;">${escapeHtml(fullName)}</span>
          </div>
          <!-- Date of Birth -->
          <div style="display: flex; align-items: center; justify-content: space-between; border-left: 3.5px solid #cfa851; padding: 2.5mm 3.5mm; background: #FFF; border-radius: 4px; border-top: 1px solid #F1EFEA; border-right: 1px solid #F1EFEA; border-bottom: 1px solid #F1EFEA;">
            <span style="font-size: 10.5pt; font-weight: bold; color: var(--text-muted); font-family: 'Roboto', sans-serif;">Date of Birth</span>
            <span style="font-size: 11.5pt; font-weight: bold; color: var(--dark-blue); font-family: 'Roboto', sans-serif;">${formattedDob}</span>
          </div>
          <!-- Time of Birth -->
          <div style="display: flex; align-items: center; justify-content: space-between; border-left: 3.5px solid #cfa851; padding: 2.5mm 3.5mm; background: #FFF; border-radius: 4px; border-top: 1px solid #F1EFEA; border-right: 1px solid #F1EFEA; border-bottom: 1px solid #F1EFEA;">
            <span style="font-size: 10.5pt; font-weight: bold; color: var(--text-muted); font-family: 'Roboto', sans-serif;">Time of Birth</span>
            <span style="font-size: 11.5pt; font-weight: bold; color: var(--dark-blue); font-family: 'Roboto', sans-serif;">${escapeHtml(timeOfbirth)}</span>
          </div>
          <!-- Place of Birth -->
          <div style="display: flex; align-items: center; justify-content: space-between; border-left: 3.5px solid #cfa851; padding: 2.5mm 3.5mm; background: #FFF; border-radius: 4px; border-top: 1px solid #F1EFEA; border-right: 1px solid #F1EFEA; border-bottom: 1px solid #F1EFEA;">
            <span style="font-size: 10.5pt; font-weight: bold; color: var(--text-muted); font-family: 'Roboto', sans-serif; flex-shrink: 0; margin-right: 2mm;">Place of Birth</span>
            <span style="font-size: 11.5pt; font-weight: bold; color: var(--dark-blue); font-family: 'Roboto', sans-serif; text-align: right; line-height: 1.2;">${escapeHtml(placeOfBirth)}</span>
          </div>
          <!-- Gender -->
          <div style="display: flex; align-items: center; justify-content: space-between; border-left: 3.5px solid #cfa851; padding: 2.5mm 3.5mm; background: #FFF; border-radius: 4px; border-top: 1px solid #F1EFEA; border-right: 1px solid #F1EFEA; border-bottom: 1px solid #F1EFEA;">
            <span style="font-size: 10.5pt; font-weight: bold; color: var(--text-muted); font-family: 'Roboto', sans-serif;">Gender</span>
            <span style="font-size: 11.5pt; font-weight: bold; color: var(--dark-blue); font-family: 'Roboto', sans-serif;">${escapeHtml(gender)}</span>
          </div>
          <!-- Age -->
          <div style="display: flex; align-items: center; justify-content: space-between; border-left: 3.5px solid #cfa851; padding: 2.5mm 3.5mm; background: #FFF; border-radius: 4px; border-top: 1px solid #F1EFEA; border-right: 1px solid #F1EFEA; border-bottom: 1px solid #F1EFEA;">
            <span style="font-size: 10.5pt; font-weight: bold; color: var(--text-muted); font-family: 'Roboto', sans-serif;">Age</span>
            <span style="font-size: 11.5pt; font-weight: bold; color: var(--dark-blue); font-family: 'Roboto', sans-serif;">${age}</span>
          </div>
        </div>
      </div>
      
      <!-- Card 2: Sarvashtakavarga Score -->
      <div style="border: 1px solid rgba(207, 168, 81, 0.4); background: #FCFBF7; border-radius: 8px; padding: 6mm 6mm; box-shadow: 0 2px 8px rgba(0,0,0,0.03); display: flex; flex-direction: column; align-items: center; justify-content: center;">
        <div style="font-size: 11pt; font-weight: bold; color: var(--gold-dark); text-transform: capitalize; margin-bottom: 2mm; font-family: 'Roboto', sans-serif; align-self: flex-start; width: 100%;">Sarvashtakavarga Score</div>
        <div style="border-bottom: 1px solid rgba(207, 168, 81, 0.25); margin-bottom: 6mm; width: 100%;"></div>
        
        <!-- Large Gold Circle -->
        <div style="width: 140px; height: 140px; border-radius: 50%; background: #cfa851; display: flex; flex-direction: column; align-items: center; justify-content: center; margin-bottom: 6mm; box-shadow: 0 4px 10px rgba(207, 168, 81, 0.3); border: 3px solid #FFF;">
          <span style="font-size: 10pt; color: #FFF; text-transform: uppercase; letter-spacing: 0.5px; font-weight: 500; font-family: 'Roboto', sans-serif; margin-bottom: 1mm;">Total Points</span>
          <span style="font-size: 28pt; font-weight: 900; color: #FFF; line-height: 1; font-family: 'Roboto', sans-serif;">${astro.ashtakvarga?.total ?? 337}</span>
        </div>
        
        <!-- Centered Explanation Text -->
        <p style="font-size: 11pt; line-height: 1.6; color: var(--text-main); text-align: center; max-width: 90%; font-weight: 500; font-family: 'Roboto', sans-serif; margin: 0;">
          The Sarvashtakavarga total represents your overall strength across all houses. A score above 337 indicates strong planetary support for wealth accumulation.
        </p>
      </div>
    </div>
    
    <div class="footer">
      <span class="footer-left">Vedic Wealth Report · ${escapeHtml(fullName)}</span>
      <span class="footer-right">Page 10</span>
    </div>
  </div>

  <!-- PAGE 11: DIVISIONAL CHARTS -->
  <div class="page">
    <div class="header">
      <div class="header-eyebrow">
        <div class="eyebrow-line"></div>
        <span class="eyebrow-text">Zodiac Visualisations</span>
      </div>
      <h1 class="header-title">Divisional Charts</h1>
      <p class="header-subtitle">Key astrological charts mapping wealth and property potentials</p>
      <div class="header-gradient"></div>
    </div>
    <div style="flex:1; display:flex; flex-direction:column; justify-content:center; align-items:center; gap:4mm; margin-top:1mm; margin-bottom:1mm;">
      <div style="display:grid; grid-template-columns:1fr 1fr; gap:4mm;">
        ${renderChartSvg(charts.rasiChart, astro.ascendant, "D1 - Lagna Chart (Birth Chart)")}
        ${renderChartSvg(charts.horaChart, astro.ascendant, "D2 - Hora Chart (Wealth)")}
        ${renderChartSvg(charts.chaturthamsaChart, astro.ascendant, "D4 - Chaturthamsa (Property)")}
        ${renderSavChartSvg(charts.ashtakavargaChart, astro.ascendant, "Ashtakvarga Chart")}
      </div>
    </div>
    <div class="footer">
      <span class="footer-left">Vedic Wealth Report · ${escapeHtml(fullName)}</span>
      <span class="footer-right">Page 11</span>
    </div>
  </div>

  <!-- PAGE 12: YOUR WEALTH BLUEPRINT -->
  <div class="page">
    <div class="header">
      <div class="header-eyebrow"><div class="eyebrow-line"></div><span class="eyebrow-text">Section 01</span></div>
      <h1 class="header-title">Your Wealth Blueprint</h1>
      <p class="header-subtitle">Natal properties, archetype, and core wealth potentials</p>
      <div class="header-gradient"></div>
    </div>
    <div style="flex:1;">
      <div class="grid-2">
        <div class="info-card">
          <div class="info-card-title">Profile Context</div>
          <div class="info-card-row"><span class="info-card-label">Client Name</span><span class="info-card-value">${escapeHtml(fullName)}</span></div>
          <div class="info-card-row"><span class="info-card-label">Ascendant (Lagna)</span><span class="info-card-value">${escapeHtml(astro.ascendant)}</span></div>
          <div class="info-card-row"><span class="info-card-label">Moon Sign</span><span class="info-card-value">${escapeHtml(astro.moonSign)}</span></div>
          <div class="info-card-row"><span class="info-card-label">Sun Sign</span><span class="info-card-value">${escapeHtml(astro.sunSign)}</span></div>
          <div class="info-card-row"><span class="info-card-label">Birth Nakshatra</span><span class="info-card-value">${escapeHtml(astro.nakshatra)}</span></div>
          <div class="info-card-row"><span class="info-card-label">Ashtakavarga SAV Total</span><span class="info-card-value">${escapeHtml(astro.ashtakvarga?.total)} points</span></div>
        </div>
        <div>
          <div class="info-card" style="height:100%; box-sizing:border-box;">
            <div class="info-card-title">Wealth Dashboard Preview</div>
            <div class="meter-wrap">
              <div class="meter-label"><span>Earning Power</span><span>${getStrengthLabel(pred.wealthDashboard?.earningPower ?? 80)}</span></div>
              <div class="meter-bg"><div class="meter-fill" style="width: ${pred.wealthDashboard?.earningPower ?? 80}%;"></div></div>
            </div>
            <div class="meter-wrap">
              <div class="meter-label"><span>Saving Power</span><span>${getStrengthLabel(pred.wealthDashboard?.savingPower ?? 70)}</span></div>
              <div class="meter-bg"><div class="meter-fill" style="width: ${pred.wealthDashboard?.savingPower ?? 70}%;"></div></div>
            </div>
            <div class="meter-wrap">
              <div class="meter-label"><span>Long-Term Holding</span><span>${getStrengthLabel(pred.wealthDashboard?.longTermPotential ?? 75)}</span></div>
              <div class="meter-bg"><div class="meter-fill" style="width: ${pred.wealthDashboard?.longTermPotential ?? 75}%;"></div></div>
            </div>
            <div class="archetype-box">
              <div class="archetype-box-label">Wealth Archetype</div>
              <div class="archetype-box-value">${escapeHtml(pred.wealthBlueprint?.archetype || "Stable Planner")}</div>
            </div>
          </div>
        </div>
      </div>
      
      <div class="narrative-block">
        <div class="narrative-label">Core Wealth Traits</div>
        <div class="narrative-text">${escapeHtml(pred.wealthBlueprint?.traits)}</div>
      </div>
      <div class="narrative-block">
        <div class="narrative-label">Weak Points &amp; Leakages</div>
        <div class="narrative-text">${escapeHtml(pred.wealthBlueprint?.weakPoints)}</div>
      </div>
    </div>
    <div class="footer">
      <span class="footer-left">Vedic Wealth Report · ${escapeHtml(fullName)}</span>
      <span class="footer-right">Page 12</span>
    </div>
  </div>

  <!-- PAGE 13: DIVISIONAL ANALYSIS -->
  <div class="page">
    <div class="header">
      <div class="header-eyebrow"><div class="eyebrow-line"></div><span class="eyebrow-text">Section 02</span></div>
      <h1 class="header-title">Divisional Analysis</h1>
      <p class="header-subtitle">Detailed interpretations of divisional wealth indicators</p>
      <div class="header-gradient"></div>
    </div>
    <div style="flex:1;">
      <div class="narrative-block">
        <div class="narrative-label">Rasi Chart (D1) Indication</div>
        <div class="narrative-text">${escapeHtml(pred.divisionalAnalysis?.d1Meaning)}</div>
      </div>
      <div class="narrative-block">
        <div class="narrative-label">Hora Chart (D2) Indication</div>
        <div class="narrative-text">${escapeHtml(pred.divisionalAnalysis?.d2Meaning)}</div>
      </div>
      <div class="narrative-block">
        <div class="narrative-label">Chaturthamsa Chart (D4) Indication</div>
        <div class="narrative-text">${escapeHtml(pred.divisionalAnalysis?.d4Meaning)}</div>
      </div>
      <div class="narrative-block">
        <div class="narrative-label">Ashtakavarga SAV Interpretation</div>
        <div class="narrative-text">${escapeHtml(pred.divisionalAnalysis?.ashtakavargaMeaning)}</div>
      </div>
    </div>
    <div class="footer">
      <span class="footer-left">Vedic Wealth Report · ${escapeHtml(fullName)}</span>
      <span class="footer-right">Page 13</span>
    </div>
  </div>

  ${(astro.allDashas || []).map((md, index) => {
    const pageNum = 14 + index;
    return `
  <!-- PAGE ${pageNum}: VIMSHOTTARI DASHA - ${md.mahadasha.toUpperCase()} -->
  <div class="page">
    <div class="header">
      <div class="header-eyebrow"><div class="eyebrow-line"></div><span class="eyebrow-text">Section 03</span></div>
      <h1 class="header-title">${escapeHtml(md.mahadasha)} Mahadasha Timeline</h1>
      <p class="header-subtitle">Vimshottari sub-periods from ${formatDate(md.start)} to ${formatDate(md.end)}</p>
      <div class="header-gradient"></div>
    </div>
    <div style="flex:1; display:flex; flex-direction:column; justify-content:center; margin-top:2mm; margin-bottom:2mm;">
      <div class="table-wrap">
        <table class="premium-table" style="width:100%; border-collapse:collapse;">
          <thead>
            <tr>
              <th style="font-size:11pt; padding:4mm 5mm; text-align:left; background-color:var(--dark-blue); color:var(--white);">Antardasha Lord</th>
              <th style="font-size:11pt; padding:4mm 5mm; text-align:left; background-color:var(--dark-blue); color:var(--white);">Start Date</th>
              <th style="font-size:11pt; padding:4mm 5mm; text-align:left; background-color:var(--dark-blue); color:var(--white);">End Date</th>
            </tr>
          </thead>
          <tbody>
            ${(md.antardashas || []).map(ad => `
              <tr style="border-bottom:1px solid #E5E7EB;">
                <td style="font-size:11pt; padding:4mm 5mm; font-weight:700; color:var(--dark-blue);">${escapeHtml(ad.planet)}</td>
                <td style="font-size:11pt; padding:4mm 5mm; color:#374151;">${formatDate(ad.start)}</td>
                <td style="font-size:11pt; padding:4mm 5mm; color:#374151;">${formatDate(ad.end)}</td>
              </tr>
            `).join("")}
          </tbody>
        </table>
      </div>
    </div>
    <div class="footer">
      <span class="footer-left">Vedic Wealth Report · ${escapeHtml(fullName)}</span>
      <span class="footer-right">Page ${pageNum}</span>
    </div>
  </div>
    `;
  }).join("\n")}

  <!-- PAGE 23: DIVIDER PAGE - YOUR MONEY DIRECTION -->
  <div class="img-page-bg bg-div-money"></div>

  <!-- PAGE 24: YOUR MONEY DIRECTION - MONEY STYLE -->
  <div class="page">
    <div class="header">
      <div class="header-eyebrow"><div class="eyebrow-line"></div><span class="eyebrow-text">Section 04</span></div>
      <h1 class="header-title">Your Money Direction</h1>
      <p class="header-subtitle">Active and passive wealth style matching your chart</p>
      <div class="header-gradient"></div>
    </div>
    <div style="flex:1;">
      <div class="narrative-block">
        <div class="narrative-label">Your Money Style</div>
        <div class="narrative-text">${escapeHtml(pred.moneyDirection?.moneyStyle)}</div>
      </div>
      <div class="narrative-block">
        <div class="narrative-label">Current Financial Phase</div>
        <div class="narrative-text">${escapeHtml(pred.moneyDirection?.dashaEffect)}</div>
      </div>
    </div>
    <div class="footer">
      <span class="footer-left">Vedic Wealth Report · ${escapeHtml(fullName)}</span>
      <span class="footer-right">Page 24</span>
    </div>
  </div>

  <!-- PAGE 25: YOUR MONEY DIRECTION - LIFTING FACTORS -->
  <div class="page">
    <div class="header">
      <div class="header-eyebrow"><div class="eyebrow-line"></div><span class="eyebrow-text">Section 04</span></div>
      <h1 class="header-title">Lifting &amp; Slowing Factors</h1>
      <p class="header-subtitle">What accelerates and what restricts your wealth flow</p>
      <div class="header-gradient"></div>
    </div>
    <div style="flex:1;">
      <div class="narrative-block">
        <div class="narrative-label">What Helps You Earn</div>
        <div class="narrative-text">${escapeHtml(pred.moneyDirection?.whatHelps)}</div>
      </div>
      <div class="narrative-block">
        <div class="narrative-label">What Slows You Down</div>
        <div class="narrative-text">${escapeHtml(pred.moneyDirection?.whatSlows)}</div>
      </div>
    </div>
    <div class="footer">
      <span class="footer-left">Vedic Wealth Report · ${escapeHtml(fullName)}</span>
      <span class="footer-right">Page 25</span>
    </div>
  </div>

  <!-- PAGE 26: YOUR MONEY DIRECTION - VERDICT -->
  <div class="page">
    <div class="header">
      <div class="header-eyebrow"><div class="eyebrow-line"></div><span class="eyebrow-text">Section 04</span></div>
      <h1 class="header-title">Money Direction Verdict</h1>
      <p class="header-subtitle">Final trajectory verdict based on composite chart</p>
      <div class="header-gradient"></div>
    </div>
    <div style="flex:1;">
      <div class="narrative-block">
        <div class="narrative-label">Money Trajectory Verdict</div>
        <div class="narrative-text">${escapeHtml(pred.moneyDirection?.verdict)}</div>
      </div>
      
      <div class="info-card" style="margin-top: 6mm;">
        <div class="info-card-title">Practical Summary Checklist</div>
        <ul class="bullet-list">
          <li>Channel your active houses through communication and leadership.</li>
          <li>Prune expense channels under transiting Rahu/Saturn pressure.</li>
          <li>Invest in long-term compounding assets relative to H11 gains.</li>
        </ul>
      </div>
    </div>
    <div class="footer">
      <span class="footer-left">Vedic Wealth Report · ${escapeHtml(fullName)}</span>
      <span class="footer-right">Page 26</span>
    </div>
  </div>

  <!-- PAGE 27: DIVIDER PAGE - HOW YOU EARN BEST -->
  <div class="img-page-bg bg-div-earn"></div>

  <!-- PAGE 28: HOW YOU EARN BEST - ROLE & INDUSTRY -->
  <div class="page">
    <div class="header">
      <div class="header-eyebrow"><div class="eyebrow-line"></div><span class="eyebrow-text">Section 05</span></div>
      <h1 class="header-title">How You Earn Best</h1>
      <p class="header-subtitle">Ideal leadership role and industry alignment</p>
      <div class="header-gradient"></div>
    </div>
    <div style="flex:1;">
      <div class="narrative-block">
        <div class="narrative-label">Your Professional Role</div>
        <div class="narrative-text">${escapeHtml(pred.howYouEarnBest?.role)}</div>
      </div>
      <div class="narrative-block">
        <div class="narrative-label">Aligned Industries</div>
        <div class="narrative-text">${escapeHtml(pred.howYouEarnBest?.industry)}</div>
      </div>
    </div>
    <div class="footer">
      <span class="footer-left">Vedic Wealth Report · ${escapeHtml(fullName)}</span>
      <span class="footer-right">Page 28</span>
    </div>
  </div>

  <!-- PAGE 29: HOW YOU EARN BEST - SKILLS & SUITABILITY -->
  <div class="page">
    <div class="header">
      <div class="header-eyebrow"><div class="eyebrow-line"></div><span class="eyebrow-text">Section 05</span></div>
      <h1 class="header-title">Work Style &amp; Environments</h1>
      <p class="header-subtitle">Practical settings and skills that maximize cash inflows</p>
      <div class="header-gradient"></div>
    </div>
    <div style="flex:1;">
      <div class="narrative-block">
        <div class="narrative-label">Ideal Work Style</div>
        <div class="narrative-text">${escapeHtml(pred.howYouEarnBest?.workStyle)}</div>
      </div>
      <div class="narrative-block">
        <div class="narrative-label">Skills to Monetize</div>
        <div class="narrative-text">${escapeHtml(pred.howYouEarnBest?.skillsToMonetize)}</div>
      </div>
      <div class="narrative-block">
        <div class="narrative-label">Work Environments &amp; Pitfalls to Avoid</div>
        <div class="narrative-text">${escapeHtml(pred.howYouEarnBest?.workEnvironments)} ${escapeHtml(pred.howYouEarnBest?.whatToAvoid)}</div>
      </div>
    </div>
    <div class="footer">
      <span class="footer-left">Vedic Wealth Report · ${escapeHtml(fullName)}</span>
      <span class="footer-right">Page 29</span>
    </div>
  </div>

  <!-- PAGE 30: HOW YOU EARN BEST - MATRIX TABLE -->
  <div class="page">
    <div class="header">
      <div class="header-eyebrow"><div class="eyebrow-line"></div><span class="eyebrow-text">Section 05</span></div>
      <h1 class="header-title">Career Alignment Matrix</h1>
      <p class="header-subtitle">Detailed profiles and career fit options</p>
      <div class="header-gradient"></div>
    </div>
    <div style="flex:1;">
      <div class="table-wrap">
        <table class="premium-table">
          <thead>
            <tr>
              <th>Career Type</th>
              <th>Why it Fits</th>
              <th>Best Strength Used</th>
              <th>Risk / Limitation</th>
            </tr>
          </thead>
          <tbody>
            ${(pred.howYouEarnBest?.careerMatrixTable || []).map(row => `
              <tr>
                <td style="font-weight:700; color:var(--dark-blue);">${escapeHtml(row.type)}</td>
                <td>${escapeHtml(row.why)}</td>
                <td style="font-weight:600; color:var(--gold-dark);">${escapeHtml(row.strength)}</td>
                <td>${escapeHtml(row.risk)}</td>
              </tr>
            `).join("")}
          </tbody>
        </table>
      </div>
      
      <div class="info-card" style="margin-top:6mm;">
        <div class="info-card-title">Top Career &amp; Business Pathways</div>
        <div style="font-size:10pt; color:var(--text-main); line-height:1.5;">
          <strong>Top Career Paths:</strong> ${(pred.howYouEarnBest?.topCareerPaths || []).join(" · ")}
          <br/><br/>
          <strong>Best Business Types:</strong> ${(pred.howYouEarnBest?.bestBusinessTypes || []).join(" · ")}
        </div>
      </div>
    </div>
    <div class="footer">
      <span class="footer-left">Vedic Wealth Report · ${escapeHtml(fullName)}</span>
      <span class="footer-right">Page 30</span>
    </div>
  </div>

  <!-- PAGE 31: DIVIDER PAGE - INCOME STABILITY VS VOLATILITY -->
  <div class="img-page-bg bg-div-stability"></div>

  <!-- PAGE 32: INCOME STABILITY - PATTERNS -->
  <div class="page">
    <div class="header">
      <div class="header-eyebrow"><div class="eyebrow-line"></div><span class="eyebrow-text">Section 06</span></div>
      <h1 class="header-title">Income Stability &amp; Volatility</h1>
      <p class="header-subtitle">Analyzing spikes, salary preference, and earnings curves</p>
      <div class="header-gradient"></div>
    </div>
    <div style="flex:1;">
      <div class="narrative-block">
        <div class="narrative-label">Earning Patterns &amp; Spikes</div>
        <div class="narrative-text">${escapeHtml(pred.incomeStability?.pattern)}</div>
      </div>
      <div class="narrative-block">
        <div class="narrative-label">Stability Preferences (Salary vs Business)</div>
        <div class="narrative-text">${escapeHtml(pred.incomeStability?.preference)}</div>
      </div>
      <div class="narrative-block">
        <div class="narrative-label">How Gains Arrive</div>
        <div class="narrative-text">${escapeHtml(pred.incomeStability?.gainsArrival)}</div>
      </div>
    </div>
    <div class="footer">
      <span class="footer-left">Vedic Wealth Report · ${escapeHtml(fullName)}</span>
      <span class="footer-right">Page 32</span>
    </div>
  </div>

  <!-- PAGE 33: INCOME STABILITY - MATRIX TABLE & ADVICE -->
  <div class="page">
    <div class="header">
      <div class="header-eyebrow"><div class="eyebrow-line"></div><span class="eyebrow-text">Section 06</span></div>
      <h1 class="header-title">Income Profile &amp; Volatility Management</h1>
      <p class="header-subtitle">Pragmatic rules to stabilize cash flows</p>
      <div class="header-gradient"></div>
    </div>
    <div style="flex:1;">
      <div class="table-wrap">
        <table class="premium-table">
          <thead>
            <tr>
              <th>Profile Metric</th>
              <th>Status / Style</th>
            </tr>
          </thead>
          <tbody>
            <tr>
              <td style="font-weight:700; color:var(--dark-blue);">Primary Income Driver</td>
              <td>${escapeHtml(pred.incomeStability?.primaryIncomeDriver)}</td>
            </tr>
            <tr>
              <td style="font-weight:700; color:var(--dark-blue);">Growth Pattern</td>
              <td>${escapeHtml(pred.incomeStability?.growthPattern)}</td>
            </tr>
            <tr>
              <td style="font-weight:700; color:var(--dark-blue);">Savings Style</td>
              <td>${escapeHtml(pred.incomeStability?.savingsStyle)}</td>
            </tr>
            <tr>
              <td style="font-weight:700; color:var(--dark-blue);">Risk Style</td>
              <td>${escapeHtml(pred.incomeStability?.riskStyle)}</td>
            </tr>
          </tbody>
        </table>
      </div>
      
      <div class="narrative-block" style="margin-top:6mm;">
        <div class="narrative-label">Prudent Fluctuations &amp; Management Advice</div>
        <div class="narrative-text">${escapeHtml(pred.incomeStability?.fluctuations)}</div>
      </div>
      <div class="info-card">
        <div class="info-card-title">Money Management Box</div>
        <div style="font-size:11.5pt; line-height:1.65; color:var(--text-main); font-style:italic;">
          ${escapeHtml(pred.incomeStability?.managementAdvice)}
        </div>
      </div>
    </div>
    <div class="footer">
      <span class="footer-left">Vedic Wealth Report · ${escapeHtml(fullName)}</span>
      <span class="footer-right">Page 33</span>
    </div>
  </div>

  <!-- PAGE 34: WEALTH DASHBOARD -->
  <div class="page">
    <div class="header">
      <div class="header-eyebrow"><div class="eyebrow-line"></div><span class="eyebrow-text">Section 07</span></div>
      <h1 class="header-title">Wealth Dashboard &amp; Scoring</h1>
      <p class="header-subtitle">Composite energy ratings across critical domains</p>
      <div class="header-gradient"></div>
    </div>
    <div style="flex:1; display:flex; flex-direction:column; justify-content:center;">
      <div class="info-card" style="margin-bottom:3mm; padding:3.5mm 5mm;">
        <div class="info-card-title">Meter Bars</div>
        <div class="meter-wrap">
          <div class="meter-label"><span>Earning Power</span><span>${getStrengthLabel(pred.wealthDashboard?.earningPower ?? 85)}</span></div>
          <div class="meter-bg"><div class="meter-fill" style="width: ${pred.wealthDashboard?.earningPower ?? 85}%;"></div></div>
        </div>
        <div class="meter-wrap">
          <div class="meter-label"><span>Saving Power</span><span>${getStrengthLabel(pred.wealthDashboard?.savingPower ?? 70)}</span></div>
          <div class="meter-bg"><div class="meter-fill" style="width: ${pred.wealthDashboard?.savingPower ?? 70}%;"></div></div>
        </div>
        <div class="meter-wrap">
          <div class="meter-label"><span>Speculative Risk Level</span><span>${getStrengthLabel(pred.wealthDashboard?.riskLevel ?? 50)}</span></div>
          <div class="meter-bg"><div class="meter-fill" style="width: ${pred.wealthDashboard?.riskLevel ?? 50}%;"></div></div>
        </div>
        <div class="meter-wrap">
          <div class="meter-label"><span>Property &amp; Land Potential</span><span>${getStrengthLabel(pred.wealthDashboard?.propertyPotential ?? 80)}</span></div>
          <div class="meter-bg"><div class="meter-fill" style="width: ${pred.wealthDashboard?.propertyPotential ?? 80}%;"></div></div>
        </div>
        <div class="meter-wrap">
          <div class="meter-label"><span>Long-Term Accumulation Potential</span><span>${getStrengthLabel(pred.wealthDashboard?.longTermPotential ?? 90)}</span></div>
          <div class="meter-bg"><div class="meter-fill" style="width: ${pred.wealthDashboard?.longTermPotential ?? 90}%;"></div></div>
        </div>
      </div>
      
      <div class="info-card" style="margin-bottom:3mm; padding:3.5mm 5mm;">
        <div class="info-card-title">Dashboard Summary</div>
        <p style="font-size:11pt; color:var(--dark-blue); font-weight:700; margin:0 0 1.5mm 0; line-height:1.5;">
          ${escapeHtml(pred.wealthDashboard?.oneLineSummary)}
        </p>
        <p style="font-size:10pt; color:var(--text-muted); margin:0; line-height:1.5;">
          These ratings reflect natal placements, divisional strengths, and the current active Vimshottari dasha.
        </p>
      </div>

      <div class="info-card" style="border: 1.5px solid var(--gold); background: var(--gold-light); padding: 4.5mm 5mm;">
        <p style="font-size: 11pt; color: var(--gold-deep); font-weight: 700; margin: 0 0 2mm 0; line-height: 1.55;">
          True wealth is the harmonious alignment of cosmic energy, strategic action, and mindful preservation of resources.
        </p>
        <p style="font-size: 11pt; color: var(--gold-deep); font-weight: 700; margin: 0 0 2mm 0; line-height: 1.55;">
          Your astrological blueprint holds strong keys to material growth, designed to reward structured efforts with lasting abundance.
        </p>
        <p style="font-size: 11pt; color: var(--gold-deep); font-weight: 700; margin: 0; line-height: 1.55;">
          By aligning your financial plans with auspicious planetary periods, you pave the way for steady compounding and prosperity.
        </p>
      </div>
    </div>
    <div class="footer">
      <span class="footer-left">Vedic Wealth Report · ${escapeHtml(fullName)}</span>
      <span class="footer-right">Page 34</span>
    </div>
  </div>

  <!-- PAGE 35: KEY HOUSE & PLANETS SUMMARY -->
  <div class="page">
    <div class="header">
      <div class="header-eyebrow"><div class="eyebrow-line"></div><span class="eyebrow-text">Section 07</span></div>
      <h1 class="header-title">Key Planets &amp; House Focus</h1>
      <p class="header-subtitle">Lifting and blocking factors governing material growth</p>
      <div class="header-gradient"></div>
    </div>
    <div style="flex:1;">
      <div class="narrative-block">
        <div class="narrative-label">Planets Summary (Venus, Jupiter, Mercury)</div>
        <div class="narrative-text">${escapeHtml(pred.housePlanetsSummary?.keyPlanetSummary)}</div>
      </div>
      <div class="grid-2" style="margin-bottom:2mm;">
        <div class="info-card">
          <div class="info-card-title">Strongest House</div>
          <p style="font-size:11.5pt; line-height:1.55; color:var(--text-main); margin:0;">
            ${escapeHtml(pred.housePlanetsSummary?.strongestHouse)}
          </p>
        </div>
        <div class="info-card">
          <div class="info-card-title">Weak House (Requires Protection)</div>
          <p style="font-size:11.5pt; line-height:1.55; color:var(--text-main); margin:0;">
            ${escapeHtml(pred.housePlanetsSummary?.weakHouse)}
          </p>
        </div>
      </div>
      <div class="grid-2">
        <div class="info-card">
          <div class="info-card-title">Top 3 Lifting Factors</div>
          <ul class="bullet-list" style="margin:0; padding-left:4mm; font-size:11.5pt; color:var(--text-main);">
            ${(pred.housePlanetsSummary?.liftingFactors || []).map(lf => `<li>${escapeHtml(lf)}</li>`).join("")}
          </ul>
        </div>
        <div class="info-card">
          <div class="info-card-title">Top 3 Blocking Factors</div>
          <ul class="bullet-list" style="margin:0; padding-left:4mm; font-size:11.5pt; color:var(--text-main);">
            ${(pred.housePlanetsSummary?.blockingFactors || []).map(bf => `<li>${escapeHtml(bf)}</li>`).join("")}
          </ul>
        </div>
      </div>
    </div>
    <div class="footer">
      <span class="footer-left">Vedic Wealth Report · ${escapeHtml(fullName)}</span>
      <span class="footer-right">Page 35</span>
    </div>
  </div>

  <!-- PAGE 36: DIVIDER PAGE - FINANCIAL BLOCKS & REMEDIES -->
  <div class="img-page-bg bg-div-remedies"></div>

  <!-- PAGE 37: FINANCIAL BLOCKS & REMEDIES -->
  <div class="page">
    <div class="header">
      <div class="header-eyebrow"><div class="eyebrow-line"></div><span class="eyebrow-text">Section 08</span></div>
      <h1 class="header-title">Financial Blocks &amp; Remedies</h1>
      <p class="header-subtitle">Targeted corrections and spiritual practices to stabilize assets</p>
      <div class="header-gradient"></div>
    </div>
    <div style="flex:1; display:flex; flex-direction:column; justify-content:space-around;">
      <div class="table-wrap">
        <table class="premium-table">
          <thead>
            <tr>
              <th>Problem</th>
              <th>Cause in Chart</th>
              <th>Remedy</th>
              <th>Expected Effect</th>
            </tr>
          </thead>
          <tbody>
            ${(pred.blocksRemedies?.problemRemedies || []).map(row => `
              <tr>
                <td style="font-weight:700; color:var(--dark-blue);">${escapeHtml(row.problem)}</td>
                <td>${escapeHtml(row.cause)}</td>
                <td style="font-weight:600; color:var(--gold-dark);">${escapeHtml(row.remedy)}</td>
                <td>${escapeHtml(row.effect)}</td>
              </tr>
            `).join("")}
          </tbody>
        </table>
      </div>
      
      <div style="font-size:10pt; line-height:1.5; color:var(--text-main); display:grid; grid-template-columns:1fr 1fr; gap:4mm;">
        <div class="info-card">
          <div class="info-card-title">Mantra &amp; Daily Habits</div>
          <strong>Mantras:</strong> ${escapeHtml(pred.blocksRemedies?.mantras)}
          <br/><br/>
          <strong>Habits:</strong> ${escapeHtml(pred.blocksRemedies?.dailyHabits)}
        </div>
        <div class="info-card">
          <div class="info-card-title">Spiritual &amp; Practical Advice</div>
          <strong>Spiritual:</strong> ${escapeHtml(pred.blocksRemedies?.spiritualRemedies)}
          <br/><br/>
          <strong>Behavior:</strong> ${escapeHtml(pred.blocksRemedies?.behaviorCorrections)}
          <br/><br/>
          <strong>Practical:</strong> ${escapeHtml(pred.blocksRemedies?.practicalRemedies)}
        </div>
      </div>
    </div>
    <div class="footer">
      <span class="footer-left">Vedic Wealth Report · ${escapeHtml(fullName)}</span>
      <span class="footer-right">Page 37</span>
    </div>
  </div>

  <!-- PAGE 38: DIVIDER PAGE - WEALTH BUILDING SPEED -->
  <div class="img-page-bg bg-div-speed"></div>

  <!-- PAGE 39: WEALTH SPEED - VERDICT -->
  <div class="page">
    <div class="header">
      <div class="header-eyebrow"><div class="eyebrow-line"></div><span class="eyebrow-text">Section 09</span></div>
      <h1 class="header-title">Wealth Building Speed</h1>
      <p class="header-subtitle">Compounding velocity, effort, and inheritance dynamics</p>
      <div class="header-gradient"></div>
    </div>
    <div style="flex:1;">
      <div class="narrative-block">
        <div class="narrative-label">Speed &amp; Compounding Verdict</div>
        <div class="narrative-text">${escapeHtml(pred.wealthSpeed?.speedVerdict)}</div>
      </div>
      <div class="narrative-block">
        <div class="narrative-label">Timeline Compounding (Early vs Later Life)</div>
        <div class="narrative-text">${escapeHtml(pred.wealthSpeed?.timelineCompound)}</div>
      </div>
      <div class="narrative-block">
        <div class="narrative-label">Self-Made vs Inherited Abundance</div>
        <div class="narrative-text">${escapeHtml(pred.wealthSpeed?.sourceStyle)}</div>
      </div>
    </div>
    <div class="footer">
      <span class="footer-left">Vedic Wealth Report · ${escapeHtml(fullName)}</span>
      <span class="footer-right">Page 39</span>
    </div>
  </div>

  <!-- PAGE 40: WEALTH SPEED - METRIC TABLE -->
  <div class="page">
    <div class="header">
      <div class="header-eyebrow"><div class="eyebrow-line"></div><span class="eyebrow-text">Section 09</span></div>
      <h1 class="header-title">Compounding Acceleration</h1>
      <p class="header-subtitle">Key windows and compounding milestones</p>
      <div class="header-gradient"></div>
    </div>
    <div style="flex:1;">
      <div class="table-wrap">
        <table class="premium-table">
          <thead>
            <tr>
              <th>Velocity Dimension</th>
              <th>Status / Style</th>
            </tr>
          </thead>
          <tbody>
            <tr>
              <td style="font-weight:700; color:var(--dark-blue);">Base Speed</td>
              <td>${escapeHtml(pred.wealthSpeed?.baseSpeed)}</td>
            </tr>
            <tr>
              <td style="font-weight:700; color:var(--dark-blue);">Current Momentum</td>
              <td>${escapeHtml(pred.wealthSpeed?.currentMomentum)}</td>
            </tr>
            <tr>
              <td style="font-weight:700; color:var(--dark-blue);">Compounding Ability</td>
              <td>${escapeHtml(pred.wealthSpeed?.compoundingAbility)}</td>
            </tr>
            <tr>
              <td style="font-weight:700; color:var(--dark-blue);">Acceleration Window</td>
              <td style="font-weight:700; color:var(--gold-dark);">${escapeHtml(pred.wealthSpeed?.accelerationWindow)}</td>
            </tr>
          </tbody>
        </table>
      </div>
      
      <div class="narrative-block" style="margin-top:6mm;">
        <div class="narrative-label">Practical Growth Advice</div>
        <div class="narrative-text">${escapeHtml(pred.wealthSpeed?.growthAdvice)}</div>
      </div>
    </div>
    <div class="footer">
      <span class="footer-left">Vedic Wealth Report · ${escapeHtml(fullName)}</span>
      <span class="footer-right">Page 40</span>
    </div>
  </div>

  <!-- PAGE 41: DIVIDER PAGE - RISK, LOSS & DEBTS -->
  <div class="img-page-bg bg-div-risk"></div>

  <!-- PAGE 42: RISK, LOSS & DEBTS - ANALYSIS -->
  <div class="page">
    <div class="header">
      <div class="header-eyebrow"><div class="eyebrow-line"></div><span class="eyebrow-text">Section 10</span></div>
      <h1 class="header-title">Risk, Loss &amp; Debts</h1>
      <p class="header-subtitle">Tendencies for borrowing, speculative trades, and reserve advice</p>
      <div class="header-gradient"></div>
    </div>
    <div style="flex:1;">
      <div class="narrative-block">
        <div class="narrative-label">Borrowing Tendencies &amp; Credit Risks</div>
        <div class="narrative-text">${escapeHtml(pred.riskLossDebts?.borrowingTendency)}</div>
      </div>
      <div class="narrative-block">
        <div class="narrative-label">Speculative Risk &amp; Trading Patterns</div>
        <div class="narrative-text">${escapeHtml(pred.riskLossDebts?.speculativeRisk)}</div>
      </div>
      <div class="narrative-block">
        <div class="narrative-label">Emergency Cash Reserve Advice</div>
        <div class="narrative-text">${escapeHtml(pred.riskLossDebts?.reserveAdvice)}</div>
      </div>
    </div>
    <div class="footer">
      <span class="footer-left">Vedic Wealth Report · ${escapeHtml(fullName)}</span>
      <span class="footer-right">Page 42</span>
    </div>
  </div>

  <!-- PAGE 43: RISK, LOSS & DEBTS - DEBT TOLERANCE -->
  <div class="page">
    <div class="header">
      <div class="header-eyebrow"><div class="eyebrow-line"></div><span class="eyebrow-text">Section 10</span></div>
      <h1 class="header-title">Debt Tolerance &amp; Discipline</h1>
      <p class="header-subtitle">Structured evaluation of risk styles</p>
      <div class="header-gradient"></div>
    </div>
    <div style="flex:1; display:flex; flex-direction:column; justify-content:space-around;">
      <div class="table-wrap">
        <table class="premium-table">
          <thead>
            <tr>
              <th>Debt Type</th>
              <th>Astrological Status</th>
            </tr>
          </thead>
          <tbody>
            ${(pred.riskLossDebts?.debtToleranceTable || []).map(row => `
              <tr>
                <td style="font-weight:700; color:var(--dark-blue);">${escapeHtml(row.type)}</td>
                <td>${escapeHtml(row.status)}</td>
              </tr>
            `).join("")}
          </tbody>
        </table>
      </div>
      
      <div class="grid-2" style="margin-top:2mm;">
        <div class="info-card">
          <div class="info-card-title">Investment Style</div>
          <p style="font-size:11.5pt; line-height:1.55; color:var(--text-main); margin:0;">
            ${escapeHtml(pred.riskLossDebts?.investmentStyle)}
          </p>
        </div>
        <div class="info-card">
          <div class="info-card-title">Financial Discipline Checklist</div>
          <ul class="bullet-list" style="margin:0; padding-left:4mm; font-size:11.5pt; color:var(--text-main);">
            ${(pred.riskLossDebts?.disciplineChecklist || []).map(item => `<li>${escapeHtml(item)}</li>`).join("")}
          </ul>
        </div>
      </div>
    </div>
    <div class="footer">
      <span class="footer-left">Vedic Wealth Report · ${escapeHtml(fullName)}</span>
      <span class="footer-right">Page 43</span>
    </div>
  </div>

  <!-- PAGE 44: DIVIDER PAGE - PROPERTY & LONG-TERM ASSETS -->
  <div class="img-page-bg bg-div-property"></div>

  <!-- PAGE 45: PROPERTY & ASSETS - ROADMAP -->
  <div class="page">
    <div class="header">
      <div class="header-eyebrow"><div class="eyebrow-line"></div><span class="eyebrow-text">Section 11</span></div>
      <h1 class="header-title">Property &amp; Long-Term Assets</h1>
      <p class="header-subtitle">Real estate holdings, luxury vehicles, and timings</p>
      <div class="header-gradient"></div>
    </div>
    <div style="flex:1;">
      <div class="narrative-block">
        <div class="narrative-label">Property Acquisition Potential</div>
        <div class="narrative-text">${escapeHtml(pred.propertyAssets?.propertyPotential)}</div>
      </div>
      <div class="narrative-block">
        <div class="narrative-label">Asset Holding Style (Utility vs Luxury)</div>
        <div class="narrative-text">${escapeHtml(pred.propertyAssets?.holdingStyle)}</div>
      </div>
      <div class="narrative-block">
        <div class="narrative-label">Long-Term Asset Accumulation Roadmap</div>
        <div class="narrative-text">${escapeHtml(pred.propertyAssets?.roadmap)}</div>
      </div>
    </div>
    <div class="footer">
      <span class="footer-left">Vedic Wealth Report · ${escapeHtml(fullName)}</span>
      <span class="footer-right">Page 45</span>
    </div>
  </div>

  <!-- PAGE 46: PROPERTY & ASSETS - SPECIFICATION -->
  <div class="page">
    <div class="header">
      <div class="header-eyebrow"><div class="eyebrow-line"></div><span class="eyebrow-text">Section 11</span></div>
      <h1 class="header-title">Asset Preference Matrix</h1>
      <p class="header-subtitle">Structured evaluation of holding choices</p>
      <div class="header-gradient"></div>
    </div>
    <div style="flex:1; display:flex; flex-direction:column; justify-content:space-around;">
      <div class="table-wrap">
        <table class="premium-table">
          <thead>
            <tr>
              <th>Asset Category</th>
              <th>Astrological Suitability</th>
            </tr>
          </thead>
          <tbody>
            ${(pred.propertyAssets?.assetPreference || []).map(row => `
              <tr>
                <td style="font-weight:700; color:var(--dark-blue);">${escapeHtml(row.type)}</td>
                <td>${escapeHtml(row.suitability)}</td>
              </tr>
            `).join("")}
          </tbody>
        </table>
      </div>
      
      <div class="info-card" style="margin-top:2mm;">
        <div class="info-card-title">Likely Best Asset Type</div>
        <p style="font-size:11pt; color:var(--gold-dark); font-weight:700; margin:0 0 2mm 0;">
          ${escapeHtml(pred.propertyAssets?.bestAssetType)}
        </p>
        <p style="font-size:11.5pt; color:var(--text-main); margin:0; line-height:1.55;">
          ${escapeHtml(pred.propertyAssets?.holdingAdvice)}
        </p>
      </div>
    </div>
    <div class="footer">
      <span class="footer-left">Vedic Wealth Report · ${escapeHtml(fullName)}</span>
      <span class="footer-right">Page 46</span>
    </div>
  </div>

  <!-- PAGE 47: DIVIDER PAGE - HOW RICH CAN YOU GET -->
  <div class="img-page-bg bg-div-rich"></div>

  <!-- PAGE 48: HOW RICH - VERDICT -->
  <div class="page">
    <div class="header">
      <div class="header-eyebrow"><div class="eyebrow-line"></div><span class="eyebrow-text">Section 12</span></div>
      <h1 class="header-title">How Rich Can You Get?</h1>
      <p class="header-subtitle">Final trajectory limits and verdict tier</p>
      <div class="header-gradient"></div>
    </div>
    <div style="flex:1;">
      <div class="narrative-block">
        <div class="narrative-label">Final Wealth Verdict</div>
        <div class="narrative-text">${escapeHtml(pred.finalVerdict?.oneLineVerdict)}</div>
      </div>
      
      <div class="archetype-box" style="margin: 4mm 0; padding: 4mm 3mm;">
        <div class="archetype-box-label" style="font-size:10pt;">Final Wealth Class / Tier</div>
        <div class="archetype-box-value" style="font-size:20pt;">${escapeHtml(pred.finalVerdict?.tier)}</div>
      </div>
      
      <div class="narrative-block">
        <div class="narrative-label">Wealth Trajectory Summary</div>
        <div class="narrative-text">${escapeHtml(pred.finalVerdict?.yogaStrengths)}</div>
      </div>
    </div>
    <div class="footer">
      <span class="footer-left">Vedic Wealth Report · ${escapeHtml(fullName)}</span>
      <span class="footer-right">Page 48</span>
    </div>
  </div>

  <!-- PAGE 49: HOW RICH - CEILING & YOGAS -->
  <div class="page">
    <div class="header">
      <div class="header-eyebrow"><div class="eyebrow-line"></div><span class="eyebrow-text">Section 12</span></div>
      <h1 class="header-title">Wealth Ceiling &amp; Yogas</h1>
      <p class="header-subtitle">Evaluating the maximum limits of abundance</p>
      <div class="header-gradient"></div>
    </div>
    <div style="flex:1;">
      <div class="narrative-block">
        <div class="narrative-label">Astrological Wealth Ceiling</div>
        <div class="narrative-text">${escapeHtml(pred.finalVerdict?.realisticCeiling)}</div>
      </div>
      
      <div class="info-card" style="margin-top:6mm;">
        <div class="info-card-title">Strongest Abundance Yogas</div>
        <table class="premium-table">
          <thead>
            <tr>
              <th>Yoga Name</th>
              <th>Strength</th>
              <th>Astrological Effect</th>
            </tr>
          </thead>
          <tbody>
            ${(astro.wealthYogas || []).map(row => `
              <tr>
                <td style="font-weight:700; color:var(--dark-blue);">${escapeHtml(row.name)}</td>
                <td style="font-weight:600; color:var(--gold-dark); text-transform:uppercase;">${escapeHtml(row.strength)}</td>
                <td>${escapeHtml(row.effect)}</td>
              </tr>
            `).join("")}
          </tbody>
        </table>
      </div>
    </div>
    <div class="footer">
      <span class="footer-left">Vedic Wealth Report · ${escapeHtml(fullName)}</span>
      <span class="footer-right">Page 49</span>
    </div>
  </div>

  <!-- PAGE 50: HOW RICH - BEST PERIODS -->
  <div class="page">
    <div class="header">
      <div class="header-eyebrow"><div class="eyebrow-line"></div><span class="eyebrow-text">Section 12</span></div>
      <h1 class="header-title">Best Wealth Periods</h1>
      <p class="header-subtitle">Age and dasha windows for compounding assets</p>
      <div class="header-gradient"></div>
    </div>
    <div style="flex:1;">
      <div class="narrative-block">
        <div class="narrative-label">Favorable Timing Windows</div>
        <div class="narrative-text">${escapeHtml(pred.finalVerdict?.bestPeriods)}</div>
      </div>
      
      <div class="info-card" style="margin-top:6mm;">
        <div class="info-card-title">Next Important Dasha Phases</div>
        <table class="premium-table">
          <thead>
            <tr>
              <th>Mahadasha</th>
              <th>Start Date</th>
              <th>End Date</th>
              <th>Wealth Impact Summary</th>
            </tr>
          </thead>
          <tbody>
            ${(astro.nextImportantDashas || []).map(row => `
              <tr>
                <td style="font-weight:700; color:var(--dark-blue);">${escapeHtml(row.mahadasha)}</td>
                <td>${escapeHtml(row.start)}</td>
                <td>${escapeHtml(row.end)}</td>
                <td style="font-weight:600; color:var(--gold-dark);">${escapeHtml(row.wealthImpact)}</td>
              </tr>
            `).join("")}
          </tbody>
        </table>
      </div>
    </div>
    <div class="footer">
      <span class="footer-left">Vedic Wealth Report · ${escapeHtml(fullName)}</span>
      <span class="footer-right">Page 50</span>
    </div>
  </div>

  <!-- PAGE 51: FINAL ACTION PLAN -->
  <div class="page">
    <div class="header">
      <div class="header-eyebrow"><div class="eyebrow-line"></div><span class="eyebrow-text">Section 12</span></div>
      <h1 class="header-title">Action Plan &amp; Recommendations</h1>
      <p class="header-subtitle">Your 30-day and 1-year milestones for prosperity</p>
      <div class="header-gradient"></div>
    </div>
    <div style="flex:1;">
      <div class="grid-2" style="margin-bottom:2mm;">
        <div class="info-card">
          <div class="info-card-title">Immediate 30-Day Plan</div>
          <p style="font-size:11.5pt; line-height:1.55; color:var(--text-main); margin:0;">
            ${escapeHtml(pred.finalVerdict?.plan30Days)}
          </p>
        </div>
        <div class="info-card">
          <div class="info-card-title">Strategic 1-Year Milestones</div>
          <p style="font-size:11.5pt; line-height:1.55; color:var(--text-main); margin:0;">
            ${escapeHtml(pred.finalVerdict?.plan1Year)}
          </p>
        </div>
      </div>
      <div class="info-card" style="margin-bottom:2mm;">
        <div class="info-card-title">Top 5 Action Recommendations</div>
        <ul class="bullet-list" style="margin:0; padding-left:4mm; font-size:11.5pt;">
          ${(pred.finalVerdict?.topRecommendations || []).map(rec => `<li>${escapeHtml(rec)}</li>`).join("")}
        </ul>
      </div>
      
      <p style="font-size:11.5pt; color:var(--gold-dark); text-align:center; font-style:italic; margin-top:2mm;">
        "May the cosmic forces align to expand your prosperity, wisdom, and abundance."
      </p>
    </div>
    <div class="footer">
      <span class="footer-left">Vedic Wealth Report · ${escapeHtml(fullName)}</span>
      <span class="footer-right">Page 51</span>
    </div>
  </div>

  <!-- PAGE 52: FREQUENTLY ASKED WEALTH QUESTIONS - PART 1 -->
  <div class="page">
    <div class="header">
      <div class="header-eyebrow"><div class="eyebrow-line"></div><span class="eyebrow-text">Section 13</span></div>
      <h1 class="header-title">Frequently Asked Wealth Questions — Part 1</h1>
      <p class="header-subtitle">Direct answers to key financial queries from your Kundli</p>
      <div class="header-gradient"></div>
    </div>
    <div style="flex:1; display:flex; flex-direction:column; gap:1mm; height:100%;">
      ${renderFaqBlock("Will I Become Financially Rich in My Lifetime?", "faqFinanciallyRich")}
      ${renderFaqBlock("What Is My Best Source of Wealth? (Job, Business, Freelancing, Investments, Family Business, etc.)", "faqBestWealthSource")}
      ${renderFaqBlock("When Am I Most Likely to Experience Major Financial Growth?", "faqMajorGrowthTiming")}
      ${renderFaqBlock("Will I Face Major Financial Struggles or Money Losses in Life?", "faqFinancialStrugglesLosses")}
      ${renderFaqBlock("Am I More Likely to Build Wealth Quickly or Gradually Over Time?", "faqWealthBuildingSpeed")}
      ${renderFaqBlock("Should I Focus More on Saving, Investing, or Expanding My Income?", "faqSavingInvestingExpanding")}
    </div>
    <div class="footer">
      <span class="footer-left">Vedic Wealth Report · ${escapeHtml(fullName)}</span>
      <span class="footer-right">Page 52</span>
    </div>
  </div>

  <!-- PAGE 53: FREQUENTLY ASKED WEALTH QUESTIONS - PART 2 -->
  <div class="page">
    <div class="header">
      <div class="header-eyebrow"><div class="eyebrow-line"></div><span class="eyebrow-text">Section 13</span></div>
      <h1 class="header-title">Frequently Asked Wealth Questions — Part 2</h1>
      <p class="header-subtitle">Direct answers to key financial queries from your Kundli</p>
      <div class="header-gradient"></div>
    </div>
    <div style="flex:1; display:flex; flex-direction:column; gap:1mm; height:100%;">
      ${renderFaqBlock("Will I Own Property, Land, or Multiple Real Estate Assets?", "faqOwnRealEstate")}
      ${renderFaqBlock("Is There Strong Potential for Wealth Through Foreign Countries or International Opportunities?", "faqForeignOpportunities")}
      ${renderFaqBlock("What Are the Biggest Financial Mistakes I Should Avoid?", "faqFinancialMistakesAvoid")}
      ${renderFaqBlock("Will I Receive Wealth Through Inheritance, Family Support, or Mostly Through My Own Efforts?", "faqEffortVsInheritance")}
      ${renderFaqBlock("What Is the Best Age or Time Period to Make Major Financial Decisions or Investments?", "faqBestDecisionAge")}
      ${renderFaqBlock("What Is My Ultimate Wealth Potential According to My Kundli?", "faqUltimatePotential")}
    </div>
    <div class="footer">
      <span class="footer-left">Vedic Wealth Report · ${escapeHtml(fullName)}</span>
      <span class="footer-right">Page 53</span>
    </div>
  </div>

  <!-- PAGE 54: END CLOSING COVER -->
  <div class="img-page-bg bg-end"></div>

</body>
</html>`;
}

/**
 * PDF compile orchestrator using headless Puppeteer
 */
async function generateWealthReportPDF(reportData, userRequest) {
  let browser = null;
  try {
    console.log("[Wealth PDF Service] Compiling HTML template...");
    const htmlContent = generateWealthHtmlTemplate(reportData, userRequest);

    try {
      const tempDir = path.resolve(__dirname, "../temp");
      if (!fs.existsSync(tempDir)) {
        fs.mkdirSync(tempDir, { recursive: true });
      }
      const htmlFileName = `wealth_report_${Date.now()}.html`;
      fs.writeFileSync(path.join(tempDir, htmlFileName), htmlContent, "utf8");
      console.log(`[Wealth PDF Service] Dumped HTML to temp for reference: ${htmlFileName}`);
    } catch (dumpErr) {
      console.warn("[Wealth PDF Service] Failed to write HTML dump (safe to ignore):", dumpErr.message);
    }

    console.log("[Wealth PDF Service] Launching browser...");
    browser = await puppeteer.launch(getPuppeteerLaunchOptions());

    const page = await browser.newPage();

    console.log("[Wealth PDF Service] Setting page content...");
    await page.setContent(htmlContent, {
      waitUntil: "load",
      timeout: 120000
    });

    console.log("[Wealth PDF Service] Printing to PDF...");
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
      console.warn("[Wealth PDF Service] Browser close warning (safe to ignore):", closeError.message);
    }

    return Buffer.from(pdfBuffer);

  } catch (error) {
    if (browser) {
      try {
        await browser.close();
      } catch (closeError) {
        console.warn("[Wealth PDF Service] Browser close warning in catch (safe to ignore):", closeError.message);
      }
    }
    console.error("[Wealth PDF Service] Error generating PDF:", error);

    const isMissingBrowser =
      typeof error?.message === "string" &&
      (error.message.includes("Could not find Chrome") ||
        error.message.includes("Could not find Chromium"));

    if (isMissingBrowser) {
      throw new Error(
        "Failed to generate PDF: Chrome is not installed for Puppeteer. Run `npm run install:chrome` or set PUPPETEER_EXECUTABLE_PATH."
      );
    }

    throw new Error(`Failed to generate PDF: ${error.message}`);
  }
}

module.exports = {
  generateWealthReportPDF,
};
