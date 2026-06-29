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
  if (chromePath) { options.executablePath = chromePath; }
  return options;
};

const SIGN_NAME_TO_NUM = {
  Aries: 1, Taurus: 2, Gemini: 3, Cancer: 4, Leo: 5, Virgo: 6,
  Libra: 7, Scorpio: 8, Sagittarius: 9, Capricorn: 10, Aquarius: 11, Pisces: 12,
};

const PLANET_ABBREVIATIONS = {
  Sun: "Su", Moon: "Mo", Mars: "Ma", Mercury: "Me", Jupiter: "Ju",
  Venus: "Ve", Saturn: "Sa", Rahu: "Ra", Ketu: "Ke", Uranus: "Ur",
  Neptune: "Ne", Pluto: "Pl", Ascendant: "Asc", ascendant: "Asc", Lagna: "Asc"
};

const PLANET_COLORS = {
  Su: "#FFA500", Mo: "#9370DB", Ma: "#DC143C", Me: "#32CD32", Ju: "#DAA520",
  Ve: "#FF1493", Sa: "#4169E1", Ra: "#8B4513", Ke: "#A0522D", Ur: "#4682B4",
  Ne: "#20B2AA", Pl: "#DA70D6", Asc: "#9932CC",
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
  { house: 12, x: 0.75, y: 0.1, numX: 0.75, numY: 0.2 }
];

const imageToDataUri = (fileName) => {
  try {
    const fullPath = path.join(IMAGES_DIR, fileName);
    if (!fs.existsSync(fullPath)) {
      console.warn(`[Compatibility PDF Service] Image not found at ${fullPath}`);
      return "";
    }
    const buffer = fs.readFileSync(fullPath);
    const ext = path.extname(fileName).toLowerCase();
    const mime = ext === ".jpg" || ext === ".jpeg" ? "image/jpeg" : "image/png";
    return `data:${mime};base64,${buffer.toString("base64")}`;
  } catch (error) {
    console.error(`[Compatibility PDF Service] Error reading image ${fileName}:`, error);
    return "";
  }
};

const escapeHtml = (value) => {
  return String(value ?? "")
    .replace(/&(?!(amp|lt|gt|quot|apos|#\d+|#[xX][a-fA-F0-9]+);)/gi, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
};

const safeString = (val, fallback = "") => {
  if (val === undefined || val === null) return fallback;
  return typeof val === "string" ? val : JSON.stringify(val);
};

const splitLargeParagraph = (pText) => {
  const sentences = pText.match(/[^.!?]+[.!?]+(\s|$)/g) || [pText];
  if (sentences.length <= 4) {
    return `<p style="margin-bottom:3.5mm; text-align:justify; font-size:12pt; line-height:1.65; color:var(--text-main);">${pText}</p>`;
  }
  
  const chunks = [];
  for (let i = 0; i < sentences.length; i += 3) {
    chunks.push(sentences.slice(i, i + 3).join("").trim());
  }
  
  return chunks.map(chunk => 
    `<p style="margin-bottom:3.5mm; text-align:justify; font-size:12pt; line-height:1.65; color:var(--text-main);">${chunk}</p>`
  ).join("\n");
};

const formatNarrativeText = (text) => {
  if (!text) return "";
  let html = safeString(text);
  html = escapeHtml(html);

  const paras = html.split(/\n\n+/);
  html = paras.map(para => {
    let p = para.trim();
    if (!p) return "";

    if (p.startsWith("### ")) {
      const headingText = p.substring(4).trim();
      return `<h3 style="font-size:13.5pt; font-weight:700; color:var(--rose-deep); margin-top:4mm; margin-bottom:2mm; text-transform:uppercase; letter-spacing:1px;">${headingText}</h3>`;
    }
    if (p.startsWith("## ")) {
      const headingText = p.substring(3).trim();
      return `<h3 style="font-size:14.5pt; font-weight:700; color:var(--rose-deep); margin-top:4mm; margin-bottom:2mm; text-transform:uppercase; letter-spacing:1px;">${headingText}</h3>`;
    }

    p = p.replace(/\*\*(.*?)\*\*/g, "<strong>$1</strong>");

    if (p.startsWith("- ") || p.startsWith("* ")) {
      const items = p.split(/\n[-*]\s+/).map(item => {
        const cleanItem = item.replace(/^[-*]\s+/, "").trim();
        return cleanItem ? `<li style="margin-bottom:1.5mm; font-size:12pt; line-height:1.65;">${cleanItem}</li>` : "";
      }).filter(Boolean).join("");
      return `<ul style="margin-left:6mm; margin-bottom:3.5mm; line-height:1.6; font-size:12pt; color:var(--text-main);">${items}</ul>`;
    }

    return splitLargeParagraph(p);
  }).join("\n");

  return html;
};

const formatDegree = (decimalDegree) => {
  const n = typeof decimalDegree === "number" ? decimalDegree : Number(decimalDegree);
  const safe = !Number.isFinite(n) ? 0 : ((n % 30) + 30) % 30;
  const degrees = Math.floor(safe);
  const minutes = Math.floor((safe - degrees) * 60);
  return `${degrees}\u00b0${String(minutes).padStart(2, "0")}'`;
};

const formatDate = (dateStr) => {
  if (!dateStr) return "--";
  try {
    return new Date(dateStr).toLocaleDateString("en-US", {
      year: "numeric", month: "long", day: "numeric"
    });
  } catch (e) { return dateStr; }
};

const renderChartSvg = (chartData, fallbackAscSignName, chartTitle) => {
  if (!chartData || !chartData.planets) {
    return `
      <div class="chart-box">
        <div style="font-size:12pt; font-weight:700; color:var(--rose-deep); margin-bottom:3mm; text-align:center;">${chartTitle}</div>
        <div style="width:280px; height:280px; display:flex; align-items:center; justify-content:center; background:#FCF8E3; border:1px solid #4C4C4C; color:#ff0000; font-size:10pt;">
          Missing ${chartTitle} Data
        </div>
      </div>`;
  }

  const anchorSignNum = chartData.planets.Ascendant?.sign_num || chartData.planets.ascendant?.sign_num || SIGN_NAME_TO_NUM[fallbackAscSignName] || 1;
  const house1Sign = ((anchorSignNum - 1 + 12) % 12) + 1;
  const housePlanetsMap = new Map();
  for (let i = 1; i <= 12; i++) { housePlanetsMap.set(i, []); }

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
    const ascDeg = chartData.planets.Ascendant?.degree || chartData.planets.ascendant?.degree || 0;
    const existing = housePlanetsMap.get(1) || [];
    existing.unshift({ name: "Asc", degree: ascDeg });
    housePlanetsMap.set(1, existing);
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
      <div style="font-size:12pt; font-weight:700; color:var(--rose-deep); margin-bottom:3mm; text-align:center;">${chartTitle}</div>
      <svg viewBox="0 0 393 393" style="width:280px; height:280px; background-color:#FCF8E3; box-shadow:0px 4px 12px rgba(0,0,0,0.15); border-radius: 4px;">
        <rect x="0" y="0" width="393" height="393" fill="#FCF8E3" stroke="#4C4C4C" stroke-width="2" />
        <line x1="0" y1="0" x2="393" y2="393" stroke="#4C4C4C" stroke-width="2" />
        <line x1="393" y1="0" x2="0" y2="393" stroke="#4C4C4C" stroke-width="2" />
        <polygon points="196.5,0 393,196.5 196.5,393 0,196.5" fill="none" stroke="#4C4C4C" stroke-width="2" />
        ${elementsMarkup}
      </svg>
    </div>`;
};

/**
 * Generate PDF buffer for Compatibility Report
 */
async function generateCompatibilityReportPDF(reportRecord) {
  let browser = null;
  try {
    const htmlContent = generateHTMLTemplate(reportRecord);
    browser = await puppeteer.launch(getPuppeteerLaunchOptions());
    const page = await browser.newPage();
    await page.setContent(htmlContent, { waitUntil: 'networkidle0' });
    
    // Execute dynamic pagination layout script
    await page.evaluate(() => {
      if (typeof paginate === "function") {
        paginate();
      }
    });

    // Set print margins to 0
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
    return Buffer.from(pdfBuffer);
  } catch (error) {
    if (browser) {
      try { await browser.close(); } catch (e) {}
    }
    console.error("[CompatibilityReportPdfService] Error generating PDF:", error);
    throw error;
  }
}

/**
 * Generate HTML template for PDF
 */
function generateHTMLTemplate(reportRecord) {
  const dataObj = reportRecord.reportData;
  const aiData = dataObj.reportData || {};
  const boy = dataObj.personalInformation?.boy || {};
  const girl = dataObj.personalInformation?.girl || {};
  const charts = dataObj.horoscopeCharts || {};
  const ashtakoot = dataObj.ashtakootDetails || {};

  // Load Cover & Dividers Base64 Data URIs
  const coverImg = imageToDataUri("Compatibilityreportstartingpage.jpg");
  const endImg = imageToDataUri("endingkundlimatching.jpg");
  const introImg = imageToDataUri("INTRODUCTION.jpg");
  const nadiImg = imageToDataUri("Nadianayis.jpg");
  const bhakootImg = imageToDataUri("ВНАКОТANALYSIS.jpg");
  const ganaImg = imageToDataUri("GANAANALYSIS.jpg");
  const grahaMaitriImg = imageToDataUri("GRAHAMAITRIANALYSIS.jpg");
  const yoniImg = imageToDataUri("YONIANALYSIS.jpg");
  const taraImg = imageToDataUri("TARAana;yis.jpg");
  const vashyaImg = imageToDataUri("VASHYАANALYSIS.jpg");
  const varnaImg = imageToDataUri("VARNAANALYSIS.jpg");
  const verdictImg = imageToDataUri("finalverdict.jpg");

  const boyLagnaSvg = renderChartSvg(charts.boyLagnaChart, dataObj.llmPayload?.boyAscendant, `${boy.fullName} - D1 Chart`);
  const girlLagnaSvg = renderChartSvg(charts.girlLagnaChart, dataObj.llmPayload?.girlAscendant, `${girl.fullName} - D1 Chart`);
  const boyD9Svg = renderChartSvg(charts.boyD9Chart, dataObj.llmPayload?.boyAscendant, `${boy.fullName} - D9 Chart`);
  const girlD9Svg = renderChartSvg(charts.girlD9Chart, dataObj.llmPayload?.girlAscendant, `${girl.fullName} - D9 Chart`);

  const compatPointsMap = {
    nadi: 8,
    bhakoot: 7,
    gana: 6,
    graha_maitri: 5,
    yoni: 4,
    tara: 3,
    vashya: 2,
    varna: 1
  };

  const totalGunas = ashtakoot?.total_points ?? 0;

  const renderKootaRow = (kKey, name) => {
    const kuta = ashtakoot?.kutas?.[kKey] || {};
    const received = kuta.points ?? 0;
    const max = kuta.max_points ?? compatPointsMap[kKey] ?? 0;
    const desc = kuta.description || "";
    const isCompatible = received > 0;
    return `
      <tr>
        <td style="font-weight:700; color:var(--dark-blue);">${name}</td>
        <td style="font-weight:700;">${received} / ${max}</td>
        <td><span class="${isCompatible ? 'compat-status-success' : 'compat-status-danger'}">${isCompatible ? 'Compatible' : 'Not Compatible'}</span></td>
        <td style="font-size:10pt; color:#475569;">${escapeHtml(desc)}</td>
      </tr>`;
  };

  const formattedBoyDob = formatDate(boy.dateOfbirth);
  const formattedGirlDob = formatDate(girl.dateOfbirth);

  // Helper for narrative pages
  const renderKootaSection = (sectionName, data) => {
    if (!data) return "";
    return [
      { title: `1. Meaning of ${sectionName}`, html: formatNarrativeText(data.meaning) },
      { title: `2. Astrological Score details`, html: formatNarrativeText(data.score) },
      { title: `3. Practical Marital Implications`, html: formatNarrativeText(data.practical) },
      { title: `4. Core Harmonizing Strengths`, html: formatNarrativeText(data.strengths) },
      { title: `5. Key Relationship Challenges`, html: formatNarrativeText(data.challenges) },
      { title: `6. Personality &amp; Psychological Triggers`, html: formatNarrativeText(data.psychological) },
      { title: `7. Real-Life Interaction Examples`, html: formatNarrativeText(data.examples) },
      { title: `8. Relationship Improvement Roadmap`, html: formatNarrativeText(data.guidance) },
      { title: `9. Traditional Vedic Remedies`, html: formatNarrativeText(data.remedies) },
      { title: `10. Chapter Summary`, html: formatNarrativeText(data.summary) }
    ].filter(b => b.html.trim().length > 0).map(b => `
      <div class="koota-part">
        <h3 class="part-title">${b.title}</h3>
        <div class="part-text">${b.html}</div>
      </div>
    `).join("\n");
  };

  const isAuspicious = totalGunas >= 18;

  return `<!DOCTYPE html>
<html>
<head>
  <meta charset="utf-8">
  <title>Premium Compatibility Report</title>
  <link href="https://fonts.googleapis.com/css2?family=Roboto:wght@300;400;500;600;700;800;900&display=swap" rel="stylesheet">
  <style>
    :root {
      --rose: #E11D48;
      --rose-light: #FFF1F2;
      --rose-deep: #881337;
      --rose-dark: #BE123C;
      --rose-accent: #F43F5E;
      --dark-blue: #0F172A;
      --white: #FFFFFF;
      --text-main: #334155;
      --text-muted: #64748B;
      --gold: #D97706;
      --gold-light: #FEF3C7;
      --border-color: rgba(225,29,72,0.12);
    }

    * { box-sizing: border-box; margin: 0; padding: 0; }

    @page {
      size: A4;
      margin: 0;
    }

    body {
      font-family: 'Roboto', 'Helvetica Neue', Arial, sans-serif;
      color: var(--text-main);
      background: var(--white);
      -webkit-print-color-adjust: exact;
      print-color-adjust: exact;
    }

    /* Fixed dimensions for PDF pages styled strictly as A4 sheets in browser */
    .page {
      width: 794px;
      height: 1122px;
      padding: 90px 68px 75px 68px;
      background: var(--white);
      page-break-after: always;
      page-break-inside: avoid;
      display: flex;
      flex-direction: column;
      overflow: hidden;
      position: relative;
      box-sizing: border-box;
    }

    .img-page {
      width: 794px;
      height: 1122px;
      page-break-after: always;
      page-break-inside: avoid;
      overflow: hidden;
      display: block;
      box-sizing: border-box;
    }

    .img-page img {
      width: 794px;
      height: 1122px;
      object-fit: fill;
      display: block;
    }

    @media print {
      body {
        margin: 0;
        padding: 0;
      }
      .page {
        width: 210mm;
        height: 297mm;
        padding: 24mm 18mm 20mm 18mm;
      }
      .img-page {
        width: 210mm;
        height: 297mm;
      }
      .img-page img {
        width: 210mm;
        height: 297mm;
      }
    }

    .page-title {
      font-size: 22pt;
      font-weight: 800;
      color: var(--dark-blue);
      letter-spacing: -0.3px;
      margin-bottom: 1mm;
      text-transform: uppercase;
    }

    .page-subtitle {
      font-size: 11pt;
      color: var(--text-muted);
      font-weight: 400;
      margin-bottom: 4mm;
    }

    /* Custom Headers and Footers inside pages */
    .custom-header {
      display: flex;
      justify-content: space-between;
      align-items: center;
      border-bottom: 1.5px solid rgba(225, 29, 72, 0.15);
      padding-bottom: 2mm;
      margin-bottom: 5mm;
      color: #475569;
      font-size: 10.5pt;
      font-weight: 500;
      width: 100%;
    }

    .custom-footer {
      display: flex;
      justify-content: space-between;
      align-items: center;
      border-top: 1px solid rgba(225, 29, 72, 0.12);
      padding-top: 2mm;
      margin-top: auto;
      color: #64748B;
      font-size: 8.5pt;
      width: 100%;
    }

    /* Narrative layouts and split paragraph styles */
    .narrative-block { margin-bottom: 5mm; }
    .narrative-label {
      font-size: 13pt;
      font-weight: 700;
      color: var(--rose-deep);
      margin-bottom: 2mm;
      border-bottom: 1.5px solid var(--rose-light);
      padding-bottom: 1mm;
      text-transform: uppercase;
      letter-spacing: 0.5px;
    }
    .narrative-text { font-size: 12pt; line-height: 1.65; color: var(--text-main); text-align: justify; }

    /* Tables without colors and badges */
    .table-wrap { border:1px solid #E2E8F0; border-radius:6px; overflow:hidden; margin-top:2mm; margin-bottom: 4mm; }
    .premium-table { width:100%; border-collapse:collapse; }
    .premium-table th {
      border-bottom: 2px solid var(--dark-blue);
      color: var(--dark-blue);
      font-size: 9.5pt; font-weight: 700; text-transform: uppercase; letter-spacing: 1px;
      padding: 2.5mm 3.5mm; text-align: left;
    }
    .premium-table td {
      padding: 2.5mm 3.5mm; font-size: 11pt; border-bottom: 1px solid #E2E8F0;
      color: #334155; vertical-align: middle; line-height: 1.5;
    }
    .premium-table tr:last-child td { border-bottom: none; }

    .compat-status-success { color: #15803D; font-weight: 700; text-transform: uppercase; font-size: 10pt; }
    .compat-status-danger { color: #B91C1C; font-weight: 700; text-transform: uppercase; font-size: 10pt; }

    .charts-grid { display: grid; grid-template-columns: 1fr 1fr; gap: 8mm; justify-items: center; align-items: center; margin-top: 4mm; }
    
    .koota-part { margin-bottom: 7mm; page-break-inside: avoid; }
    .part-title { font-size: 13pt; font-weight: 700; color: var(--rose-dark); margin-bottom: 2mm; text-transform: uppercase; letter-spacing: 0.5px; }
    .part-text { font-size: 12pt; line-height: 1.65; color: var(--text-main); text-align: justify; }

    .details-row { display: flex; gap: 8mm; margin-bottom: 4mm; }
    .details-column { flex: 1; border: 1px solid #E2E8F0; border-radius: 6px; padding: 4mm; background: #FAF9F9; }
    .details-column h3 { font-size: 12pt; color: var(--rose-deep); margin-bottom: 3mm; border-bottom: 2px solid var(--rose-light); padding-bottom: 1mm; }

    .metric-card { border: 1px solid var(--border-color); border-radius: 6px; padding: 4mm; background: #FFFDFD; margin-bottom: 4mm; }
    .metric-card h4 { font-size: 11pt; color: var(--rose-dark); margin-bottom: 1.5mm; text-transform: uppercase; }
    .metric-card p { font-size: 10pt; line-height: 1.5; color: var(--text-main); }
    
    .toc-item { display: flex; justify-content: space-between; border-bottom: 1px dashed rgba(225,29,72,0.15); padding: 1mm 0; }
    .toc-chapter { font-weight: 700; color: var(--rose-deep); }
    .toc-dots { flex: 1; }
  </style>
</head>
<body>

  <!-- Hidden Draft Container where all draft blocks are created -->
  <div id="draft-source" style="display: none;">
    
    <!-- PAGE 2: DISCLAIMER -->
    <div class="draft-static" data-type="disclaimer">
      <h1 class="page-title">Marriage Compatibility Report Disclaimer</h1>
      <p class="page-subtitle">Vedic astrological guidelines and expectations setting</p>
      <div style="height: 1px; background: rgba(225, 29, 72, 0.15); margin-bottom: 6mm;"></div>
      <div style="font-size: 11pt; line-height: 1.6; text-align: justify; color: var(--text-main);">
        <p style="margin-bottom:3mm;">This Marriage Compatibility Report has been carefully prepared based on the timeless principles of Vedic Astrology (Jyotisha) — an ancient Indian system of understanding life through planetary alignments and cosmic influences. It is designed to offer meaningful insights into the compatibility between two individuals considering marriage or a long-term partnership.</p>
        <p style="margin-bottom:3mm;">Please note that astrology does not predict the future with absolute certainty. It highlights possibilities and tendencies, not fixed outcomes. The choices both partners make, combined with free will and karmic paths, play a defining role in shaping the marriage and relationship. The purpose of this report is to inspire reflection, mutual understanding, and informed decision-making — not to dictate outcomes or guarantee specific marital results.</p>
        <p style="margin-bottom:3mm;">Interpretations provided herein are based on the professional understanding and experience of Vedic astrological methods, particularly the Ashtakoot Milan (8-point compatibility) system. As astrology is an interpretive science, different astrologers may offer varied insights based on their individual schools of thought and methodology. This report represents one expert interpretation of the astrological configuration between both partners.</p>
        <p style="margin-bottom:3mm;">Any recommendations, remedies, or guidance mentioned — such as gemstones, mantras, rituals, or lifestyle adjustments — are intended solely to promote marital harmony and relationship wellbeing. These should never replace professional psychological, therapeutic, or medical advice. Always consult qualified professionals for matters related to mental health, relationship counseling, or emotional wellness.</p>
        <p style="margin-bottom:3mm;">The effectiveness of any suggested remedy may vary based on individual belief, effort, and life circumstances. No specific marital outcomes or compatibility results are guaranteed. The insights provided are meant to assist both families and individuals in making informed, mindful choices aligned with their personal journey.</p>
        <p style="margin-bottom:3mm;"><strong>Legal Disclaimer:</strong> This report and its contents are provided for informational and entertainment purposes only. Neither the astrologer nor TrustAstrology shall be liable for any direct, indirect, or consequential emotional or relationship outcomes resulting from the use or interpretation of the information contained herein. By accessing and utilizing this report, you acknowledge and agree to these terms.</p>
        <p>May this report serve as a valuable compass on your journey toward a harmonious and fulfilling marriage. Remember — the stars may guide, but they do not bind. Your partnership is ultimately shaped by mutual respect, understanding, and shared commitment.</p>
      </div>
    </div>

    <!-- PAGE 3: ABOUT -->
    <div class="draft-static" data-type="about">
      <h1 class="page-title">About This Compatibility Report</h1>
      <p class="page-subtitle">Blending Vedic wisdom with modern relationship dynamics</p>
      <div style="height: 1px; background: rgba(225, 29, 72, 0.15); margin-bottom: 6mm;"></div>
      <div style="font-size: 11.5pt; line-height: 1.65; text-align: justify; color: var(--text-main);">
        <p style="margin-bottom: 3.5mm;">Vedic astrology has, for millennia, analyzed relationship matches through the lens of Ashtakoot Milan. This system evaluates the planetary alignment of the Moon sign, birth stars, and houses of both individuals to synthesize compatibility on mental, physical, biological, and karmic levels.</p>
        <p style="margin-bottom: 3.5mm;">Unlike basic automated scorecards, this premium report dives deep. It is designed to act as an actionable relationship manual, providing remedies for growth, communication blueprints, and behavioral mapping.</p>
        <p>By blending traditional Vedic wisdom with modern psychological perspectives, it empowers couples to understand each other's emotional safety triggers, communication traits, and joint life paths.</p>
      </div>
    </div>

    <!-- PAGE 4: HOW TO READ -->
    <div class="draft-static" data-type="how-to-read">
      <h1 class="page-title">How to Read This Report</h1>
      <p class="page-subtitle">Understanding the dimensions of compatibility and Gunas</p>
      <div style="height: 1px; background: rgba(225, 29, 72, 0.15); margin-bottom: 6mm;"></div>
      <div style="font-size: 11.5pt; line-height: 1.65; text-align: justify; color: var(--text-main);">
        <p style="margin-bottom: 3.5mm;">
          <strong>1. Ashtakoot Guna Scoring (Page 9):</strong> Focus on the point distribution in the matrix. Gunas like Nadi (Health/Genetics - 8 pts) and Bhakoot (Mind/Destiny - 7 pts) carry the highest weight. If Gunas are lacking, refer to their respective chapters to understand where adjustments are required.
        </p>
        <p style="margin-bottom: 3.5mm;">
          <strong>2. Meaning, Scores &amp; Practical Lives:</strong> Chapters 3 to 10 explain each Koota. Each chapter begins with the general astrological meaning, followed by your specific score, the practical everyday marital impact, and traditional remedies to maintain harmony.
        </p>
        <p style="margin-bottom: 3.5mm;">
          <strong>3. Premium Relationship Chapters:</strong> Chapters 11 to 21 combine traditional Vedic wisdom with modern counseling concepts. These address attachment styles, Mercury-driven communication, financial spend/save psychologies, boundary settings with extended family, and parenting alignments. Use the daily bonding exercises in the roadmap section.
        </p>
      </div>
    </div>

    <!-- PAGE 5: TOC Placeholder -->
    <div class="draft-static" data-type="toc">
      <h1 class="page-title">Table of Contents</h1>
      <p class="page-subtitle">Overview of the chapters inside this compatibility handbook</p>
      <div style="height: 1px; background: rgba(225, 29, 72, 0.15); margin-bottom: 6mm;"></div>
      <div id="toc-placeholder"></div>
    </div>

    <!-- PAGE 6: PROFILES -->
    <div class="draft-static" data-type="profiles">
      <h1 class="page-title">Personal Birth Profiles</h1>
      <p class="page-subtitle">Vedic astrological configurations of both partners</p>
      <div style="height: 1px; background: rgba(225, 29, 72, 0.15); margin-bottom: 6mm;"></div>
      <div class="details-row">
        <div class="details-column">
          <h3>Boy Details: ${escapeHtml(boy.fullName)}</h3>
          <p style="margin-bottom: 1.5mm;"><strong>Date of Birth:</strong> ${formattedBoyDob}</p>
          <p style="margin-bottom: 1.5mm;"><strong>Time of Birth:</strong> ${escapeHtml(boy.timeOfbirth)}</p>
          <p style="margin-bottom: 1.5mm;"><strong>Place of Birth:</strong> ${escapeHtml(boy.placeOfBirth)}</p>
          <p style="margin-bottom: 1.5mm;"><strong>Moon Sign (Rashi):</strong> ${escapeHtml(dataObj.llmPayload?.boyMoonSign)}</p>
          <p style="margin-bottom: 1.5mm;"><strong>Birth Star (Nakshatra):</strong> ${escapeHtml(dataObj.llmPayload?.boyNakshatra)}</p>
          <p><strong>Lagna (Ascendant):</strong> ${escapeHtml(dataObj.llmPayload?.boyAscendant)}</p>
        </div>
        <div class="details-column">
          <h3>Girl Details: ${escapeHtml(girl.fullName)}</h3>
          <p style="margin-bottom: 1.5mm;"><strong>Date of Birth:</strong> ${formattedGirlDob}</p>
          <p style="margin-bottom: 1.5mm;"><strong>Time of Birth:</strong> ${escapeHtml(girl.timeOfbirth)}</p>
          <p style="margin-bottom: 1.5mm;"><strong>Place of Birth:</strong> ${escapeHtml(girl.placeOfBirth)}</p>
          <p style="margin-bottom: 1.5mm;"><strong>Moon Sign (Rashi):</strong> ${escapeHtml(dataObj.llmPayload?.girlMoonSign)}</p>
          <p style="margin-bottom: 1.5mm;"><strong>Birth Star (Nakshatra):</strong> ${escapeHtml(dataObj.llmPayload?.girlNakshatra)}</p>
          <p><strong>Lagna (Ascendant):</strong> ${escapeHtml(dataObj.llmPayload?.girlAscendant)}</p>
        </div>
      </div>
      <div class="narrative-block" style="margin-top: 4mm;">
        <div class="narrative-label">Manglik Dosha Status</div>
        <table class="premium-table">
          <thead>
            <tr>
              <th>Partner</th><th>Manglik?</th><th>Details</th>
            </tr>
          </thead>
          <tbody>
            <tr>
              <td style="font-weight:700;">${escapeHtml(boy.fullName)}</td>
              <td><span class="${dataObj.manglikDetails?.male_manglik ? 'compat-status-danger' : 'compat-status-success'}">${dataObj.manglikDetails?.male_manglik ? 'Yes' : 'No'}</span></td>
              <td style="font-size:10pt;">${escapeHtml(dataObj.manglikDetails?.male_manglik_details?.manglik_report || "No significant Manglik Dosha present.")}</td>
            </tr>
            <tr>
              <td style="font-weight:700;">${escapeHtml(girl.fullName)}</td>
              <td><span class="${dataObj.manglikDetails?.female_manglik ? 'compat-status-danger' : 'compat-status-success'}">${dataObj.manglikDetails?.female_manglik ? 'Yes' : 'No'}</span></td>
              <td style="font-size:10pt;">${escapeHtml(dataObj.manglikDetails?.female_manglik_details?.manglik_report || "No significant Manglik Dosha present.")}</td>
            </tr>
          </tbody>
        </table>
      </div>
      <p style="margin-top:5mm; font-size:11pt; line-height:1.6; color:var(--text-muted); text-align:justify;">
        <strong>Note on Chart Calculation:</strong> Astrological charts in this report are constructed using the Chitrapaksha (Lahiri) Ayanamsa. Calculations are based on exact coordinates and timezone conversions of the birth locations. The Lagna (D1) chart represents the physical self and primary planetary distribution, while the Navamsa (D9) chart is dynamically generated as the ninth divisional harmonic, representing the inner spiritual strength of the native and direct compatibility in married life.
      </p>
    </div>

    <!-- PAGE 7: LAGNA -->
    <div class="draft-static" data-type="lagna">
      <h1 class="page-title">Lagna (D1) Birth Charts</h1>
      <p class="page-subtitle">Physical personality and foundational cosmic configurations</p>
      <div style="height: 1px; background: rgba(225, 29, 72, 0.15); margin-bottom: 6mm;"></div>
      <div class="charts-grid">${boyLagnaSvg}${girlLagnaSvg}</div>
    </div>

    <!-- PAGE 8: NAVAMSA -->
    <div class="draft-static" data-type="navamsa">
      <h1 class="page-title">Navamsa (D9) Marriage Charts</h1>
      <p class="page-subtitle">Inner spiritual strength and direct marital compatibility</p>
      <div style="height: 1px; background: rgba(225, 29, 72, 0.15); margin-bottom: 6mm;"></div>
      <div class="charts-grid">${boyD9Svg}${girlD9Svg}</div>
    </div>

    <!-- PAGE 9: SCORECARD -->
    <div class="draft-static" data-type="scorecard">
      <h1 class="page-title">Ashtakoot Guna Matching Matrix</h1>
      <p class="page-subtitle">Detailed breakdown of the 8 foundational branches of harmony</p>
      <div style="height: 1px; background: rgba(225, 29, 72, 0.15); margin-bottom: 6mm;"></div>
      <div class="table-wrap">
        <table class="premium-table">
          <thead>
            <tr>
              <th>Koota (Aspect)</th><th>Points</th><th>Status</th><th>Astrological Meaning</th>
            </tr>
          </thead>
          <tbody>
            ${renderKootaRow("nadi", "Nadi (Health &amp; Genetics)")}
            ${renderKootaRow("bhakoot", "Bhakoot (Destiny &amp; Mind)")}
            ${renderKootaRow("gana", "Gana (Temperament &amp; Ego)")}
            ${renderKootaRow("graha_maitri", "Graha Maitri (Friendship)")}
            ${renderKootaRow("yoni", "Yoni (Intimacy &amp; Biology)")}
            ${renderKootaRow("tara", "Tara (Destiny &amp; Longevity)")}
            ${renderKootaRow("vashya", "Vashya (Attraction &amp; Control)")}
            ${renderKootaRow("varna", "Varna (Mental Profile &amp; Work Style)")}
            <tr style="font-weight:700; border-top: 2px solid var(--dark-blue);">
              <td style="color:var(--dark-blue);">TOTAL SCORE</td>
              <td style="color:var(--dark-blue);">${totalGunas} / 36</td>
              <td><span class="${isAuspicious ? 'compat-status-success' : 'compat-status-danger'}">${isAuspicious ? 'Auspicious' : 'Needs Remedy'}</span></td>
              <td style="color:var(--dark-blue); font-size:11pt;">${escapeHtml(dataObj.llmPayload?.verdict)}</td>
            </tr>
          </tbody>
        </table>
      </div>
      <div class="narrative-block" style="margin-top: 3mm;">
        <div class="narrative-label">Ashtakoot Summary</div>
        <p class="narrative-text" style="font-size: 11pt; line-height: 1.5;">
          Vedic Astrology analyzes these eight separate dimensions of compatibility to predict the long-term success of the marital bond. Each aspect plays a specific role, from health and hereditary compatibility (Nadi) to psychological attraction (Vashya) and social alignment (Varna). A total score of 18 or above represents an auspicious baseline for a stable union.
        </p>
      </div>
    </div>

    <!-- CHAPTER 1: WELCOME & INTRO -->
    <div class="draft-divider" data-img="${introImg}"></div>
    <div class="draft-chapter" data-id="ch1" data-title="Chapter 01: Welcome &amp; Preparation" data-subtitle="Emotional preparation and understanding the cosmic path">
      <div class="narrative-text">${formatNarrativeText(aiData.introduction)}</div>
    </div>

    <!-- CHAPTER 2: BLUEPRINT -->
    <div class="draft-chapter" data-id="ch2" data-title="Chapter 02: The Compatibility Blueprint" data-subtitle="An overview of natural harmony and areas of growth">
      <div class="narrative-text">${formatNarrativeText(aiData.compatibilityBlueprint)}</div>
    </div>

    <!-- CHAPTER 3: NADI -->
    <div class="draft-divider" data-img="${nadiImg}"></div>
    <div class="draft-koota" data-id="ch3" data-title="Chapter 03: Nadi Analysis (Health &amp; Genetics)" data-subtitle="Physical, genetic, and long-term health harmony">
      ${renderKootaSection("Nadi", aiData.nadiAnalysis)}
    </div>

    <!-- CHAPTER 4: BHAKOOT -->
    <div class="draft-divider" data-img="${bhakootImg}"></div>
    <div class="draft-koota" data-id="ch4" data-title="Chapter 04: Bhakoot Analysis (Destiny &amp; Mind)" data-subtitle="Mutual mental compatibility and life energy alignment">
      ${renderKootaSection("Bhakoot", aiData.bhakootAnalysis)}
    </div>

    <!-- CHAPTER 5: GANA -->
    <div class="draft-divider" data-img="${ganaImg}"></div>
    <div class="draft-koota" data-id="ch5" data-title="Chapter 05: Gana Analysis (Temperament &amp; Ego)" data-subtitle="Vedic profiles, temperament, and behavioral dynamics">
      ${renderKootaSection("Gana", aiData.ganaAnalysis)}
    </div>

    <!-- CHAPTER 6: GRAHA MAITRI -->
    <div class="draft-divider" data-img="${grahaMaitriImg}"></div>
    <div class="draft-koota" data-id="ch6" data-title="Chapter 06: Graha Maitri Analysis" data-subtitle="Mental compatibility, friendship, and mutual views of life">
      ${renderKootaSection("Graha Maitri", aiData.grahaMaitriAnalysis)}
    </div>

    <!-- CHAPTER 7: YONI -->
    <div class="draft-divider" data-img="${yoniImg}"></div>
    <div class="draft-koota" data-id="ch7" data-title="Chapter 07: Yoni Analysis (Physical Intimacy)" data-subtitle="Biological harmony, physical chemistry, and intimacy">
      ${renderKootaSection("Yoni", aiData.yoniAnalysis)}
    </div>

    <!-- CHAPTER 8: TARA -->
    <div class="draft-divider" data-img="${taraImg}"></div>
    <div class="draft-koota" data-id="ch8" data-title="Chapter 08: Tara Analysis (Destiny &amp; Longevity)" data-subtitle="Cosmic energy compatibility and destiny alignment">
      ${renderKootaSection("Tara", aiData.taraAnalysis)}
    </div>

    <!-- CHAPTER 9: VASHYA -->
    <div class="draft-divider" data-img="${vashyaImg}"></div>
    <div class="draft-koota" data-id="ch9" data-title="Chapter 09: Vashya Analysis (Attraction &amp; Control)" data-subtitle="Natural dominance, influence, and mutual submissiveness">
      ${renderKootaSection("Vashya", aiData.vashyaAnalysis)}
    </div>

    <!-- CHAPTER 10: VARNA -->
    <div class="draft-divider" data-img="${varnaImg}"></div>
    <div class="draft-koota" data-id="ch10" data-title="Chapter 10: Varna Analysis (Mental Profiles)" data-subtitle="Foundational spiritual alignment and work ethics">
      ${renderKootaSection("Varna", aiData.varnaAnalysis)}
    </div>

    <!-- CHAPTER 11: EMOTIONAL -->
    <div class="draft-chapter" data-id="ch11" data-title="Chapter 11: Emotional Compatibility &amp; Needs" data-subtitle="Moon sign attachments, safety triggers, and nurturing styles">
      <div class="narrative-text">${formatNarrativeText(aiData.emotionalCompatibility)}</div>
    </div>

    <!-- CHAPTER 12: COMMUNICATION -->
    <div class="draft-chapter" data-id="ch12" data-title="Chapter 12: Communication &amp; Conflict Styles" data-subtitle="Mercury placements, listening habits, and dispute resolution">
      <div class="narrative-text">${formatNarrativeText(aiData.communicationCompatibility)}</div>
    </div>

    <!-- CHAPTER 13: TIMELINE -->
    <div class="draft-chapter" data-id="ch13" data-title="Chapter 13: Married Life Lifeline (First 10 Years)" data-subtitle="Dasha timing cycles, key windows, and adjusting periods">
      <div class="narrative-text">${formatNarrativeText(aiData.marriedLifeTimeline)}</div>
    </div>

    <!-- CHAPTER 14: FINANCIAL -->
    <div class="draft-chapter" data-id="ch14" data-title="Chapter 14: Financial Compatibility &amp; Wealth" data-subtitle="Spend/save patterns, wealth building, and financial partnership">
      <div class="narrative-text">${formatNarrativeText(aiData.financialCompatibility)}</div>
    </div>

    <!-- CHAPTER 15: FAMILY -->
    <div class="draft-chapter" data-id="ch15" data-title="Chapter 15: Family &amp; In-Law Dynamics" data-subtitle="Boundaries, extended family dynamics, and domestic roles">
      <div class="narrative-text">${formatNarrativeText(aiData.familyInLawDynamics)}</div>
    </div>

    <!-- CHAPTER 16: PARENTING -->
    <div class="draft-chapter" data-id="ch16" data-title="Chapter 16: Parenting &amp; Family Values" data-subtitle="Raising children, home values, and parenting chemistry">
      <div class="narrative-text">${formatNarrativeText(aiData.parentingCompatibility)}</div>
    </div>

    <!-- CHAPTER 17: CONFLICT RESOLUTION -->
    <div class="draft-chapter" data-id="ch17" data-title="Chapter 17: Conflict Resolution Blueprint" data-subtitle="Strategies for navigating differences and triggers">
      <div class="narrative-text">${formatNarrativeText(aiData.conflictResolution)}</div>
    </div>

    <!-- CHAPTER 18: LOVE LANGUAGES -->
    <div class="draft-chapter" data-id="ch18" data-title="Chapter 18: Astrological Love Languages" data-subtitle="Venus and 5th house influences on affection">
      <div class="narrative-text">${formatNarrativeText(aiData.loveLanguages)}</div>
    </div>

    <!-- CHAPTER 19: ROADMAP -->
    <div class="draft-chapter" data-id="ch19" data-title="Chapter 19: Relationship Growth Roadmap" data-subtitle="Habits, routines, and exercises for emotional bonding">
      <div class="narrative-text">${formatNarrativeText(aiData.growthPlan)}</div>
    </div>

    <!-- CHAPTER 20: RED/GREEN -->
    <div class="draft-chapter" data-id="ch20" data-title="Chapter 20: Red Flags &amp; Green Flags" data-subtitle="Balanced caution areas and core sustaining strengths">
      <div class="narrative-text">${formatNarrativeText(aiData.redGreenFlags)}</div>
    </div>

    <!-- CHAPTER 21: HEATMAP -->
    <div class="draft-chapter" data-id="ch21" data-title="Chapter 21: Compatibility Matrix Summary" data-subtitle="Overall dimensional synthesis of physical and emotional alignment">
      <div class="narrative-text">${formatNarrativeText(aiData.compatibilityHeatmapText)}</div>
    </div>

    <!-- CHAPTER 22: FAQS (Part 1) -->
    <div class="draft-chapter" data-id="ch22" data-title="Chapter 22: Frequently Asked Questions" data-subtitle="Personalized answers to common relationship doubts and rules">
      <div class="narrative-text">
        <h3 style="font-size:12.5pt; font-weight:700; color:var(--rose-deep); margin-top:3mm; margin-bottom:1.5mm; text-transform:uppercase; letter-spacing:0.5px;">What is our overall marriage compatibility according to Vedic astrology?</h3>
        <p style="margin-bottom:3mm; text-align:justify; font-size:11.5pt; line-height:1.55; color:var(--text-main);">${escapeHtml(safeString(aiData.faqAnswers?.marriageCompatibility || "Compatibility analysis details based on your Moon sign alignments and planetary configurations."))}</p>
        
        <h3 style="font-size:12.5pt; font-weight:700; color:var(--rose-deep); margin-top:3mm; margin-bottom:1.5mm; text-transform:uppercase; letter-spacing:0.5px;">What are the strongest strengths of our relationship based on our Kundlis?</h3>
        <p style="margin-bottom:3mm; text-align:justify; font-size:11.5pt; line-height:1.55; color:var(--text-main);">${escapeHtml(safeString(aiData.faqAnswers?.relationshipStrengths || "Key strengths indicated by positive planetary configurations and Guna scores."))}</p>
        
        <h3 style="font-size:12.5pt; font-weight:700; color:var(--rose-deep); margin-top:3mm; margin-bottom:1.5mm; text-transform:uppercase; letter-spacing:0.5px;">Which areas of our relationship may require extra understanding and effort?</h3>
        <p style="margin-bottom:3mm; text-align:justify; font-size:11.5pt; line-height:1.55; color:var(--text-main);">${escapeHtml(safeString(aiData.faqAnswers?.areasForEffort || "Sectors requiring conscious adjustment due to specific planetary imbalances."))}</p>
        
        <h3 style="font-size:12.5pt; font-weight:700; color:var(--rose-deep); margin-top:3mm; margin-bottom:1.5mm; text-transform:uppercase; letter-spacing:0.5px;">How compatible are we emotionally and mentally as life partners?</h3>
        <p style="margin-bottom:3mm; text-align:justify; font-size:11.5pt; line-height:1.55; color:var(--text-main);">${escapeHtml(safeString(aiData.faqAnswers?.emotionalMentalCompatibility || "Emotional alignment and empathy governed by mutual Moon sign interactions."))}</p>
        
        <h3 style="font-size:12.5pt; font-weight:700; color:var(--rose-deep); margin-top:3mm; margin-bottom:1.5mm; text-transform:uppercase; letter-spacing:0.5px;">How well do our communication styles and conflict-handling approaches match?</h3>
        <p style="margin-bottom:3mm; text-align:justify; font-size:11.5pt; line-height:1.55; color:var(--text-main);">${escapeHtml(safeString(aiData.faqAnswers?.communicationConflictStyles || "Communication patterns and mutual conflict resolution influenced by Mercury placements."))}</p>
        
        <h3 style="font-size:12.5pt; font-weight:700; color:var(--rose-deep); margin-top:3mm; margin-bottom:1.5mm; text-transform:uppercase; letter-spacing:0.5px;">What does our Kundli reveal about long-term married life and relationship stability?</h3>
        <p style="margin-bottom:3mm; text-align:justify; font-size:11.5pt; line-height:1.55; color:var(--text-main);">${escapeHtml(safeString(aiData.faqAnswers?.relationshipStability || "Stability parameters and indicators of relationship duration from the 7th and 8th houses."))}</p>
      </div>
    </div>

    <!-- CHAPTER 22 PART 2: FAQS (Part 2) -->
    <div class="draft-chapter" data-id="ch22_2" data-title="Chapter 22: Frequently Asked Questions" data-subtitle="Personalized answers to common relationship doubts and rules">
      <div class="narrative-text">
        <h3 style="font-size:12.5pt; font-weight:700; color:var(--rose-deep); margin-top:3mm; margin-bottom:1.5mm; text-transform:uppercase; letter-spacing:0.5px;">How compatible are we in terms of financial goals, spending habits, and wealth management?</h3>
        <p style="margin-bottom:3mm; text-align:justify; font-size:11.5pt; line-height:1.55; color:var(--text-main);">${escapeHtml(safeString(aiData.faqAnswers?.financialCompatibility || "Wealth management approaches and spend/save values based on the 2nd and 11th houses."))}</p>
        
        <h3 style="font-size:12.5pt; font-weight:700; color:var(--rose-deep); margin-top:3mm; margin-bottom:1.5mm; text-transform:uppercase; letter-spacing:0.5px;">What does our Kundli indicate about physical attraction, intimacy, and emotional bonding?</h3>
        <p style="margin-bottom:3mm; text-align:justify; font-size:11.5pt; line-height:1.55; color:var(--text-main);">${escapeHtml(safeString(aiData.faqAnswers?.physicalAttractionIntimacy || "Venus-Mars physics and intimacy indicators governing chemical attraction."))}</p>
        
        <h3 style="font-size:12.5pt; font-weight:700; color:var(--rose-deep); margin-top:3mm; margin-bottom:1.5mm; text-transform:uppercase; letter-spacing:0.5px;">How well are our family values, parenting approach, and in-law dynamics aligned?</h3>
        <p style="margin-bottom:3mm; text-align:justify; font-size:11.5pt; line-height:1.55; color:var(--text-main);">${escapeHtml(safeString(aiData.faqAnswers?.familyParentingDynamics || "Family bounds, domestic roles, and raising children patterns mapped by key houses."))}</p>
        
        <h3 style="font-size:12.5pt; font-weight:700; color:var(--rose-deep); margin-top:3mm; margin-bottom:1.5mm; text-transform:uppercase; letter-spacing:0.5px;">Which Ashtakoot (Guna Milan) factors have the greatest impact on our compatibility score?</h3>
        <p style="margin-bottom:3mm; text-align:justify; font-size:11.5pt; line-height:1.55; color:var(--text-main);">${escapeHtml(safeString(aiData.faqAnswers?.gunaMilanFactors || "Vedic parameters like Nadi, Bhakoot, or Graha Maitri having critical impact on your score."))}</p>
        
        <h3 style="font-size:12.5pt; font-weight:700; color:var(--rose-deep); margin-top:3mm; margin-bottom:1.5mm; text-transform:uppercase; letter-spacing:0.5px;">What practical remedies and lifestyle changes can strengthen our relationship harmony?</h3>
        <p style="margin-bottom:3mm; text-align:justify; font-size:11.5pt; line-height:1.55; color:var(--text-main);">${escapeHtml(safeString(aiData.faqAnswers?.remediesLifestyleChanges || "Actionable lifestyle routines, behavioral upgrades, and Vedic remedies to enhance bond."))}</p>
        
        <h3 style="font-size:12.5pt; font-weight:700; color:var(--rose-deep); margin-top:3mm; margin-bottom:1.5mm; text-transform:uppercase; letter-spacing:0.5px;">What is the final astrological verdict, and what should we keep in mind before marriage?</h3>
        <p style="margin-bottom:3mm; text-align:justify; font-size:11.5pt; line-height:1.55; color:var(--text-main);">${escapeHtml(safeString(aiData.faqAnswers?.finalVerdictAdvice || "The direct Vedic summation and protective recommendations before taking marriage steps."))}</p>
      </div>
    </div>

    <!-- CHAPTER 23: VERDICT -->
    <div class="draft-divider" data-img="${verdictImg}"></div>
    <div class="draft-chapter" data-id="ch23" data-title="Chapter 23: The Astrological Verdict" data-subtitle="Comprehensive synthesis of marital compatibility and path forward">
      <div class="narrative-text">${formatNarrativeText(aiData.finalVerdict)}</div>
    </div>

  </div>

  <!-- Real Output Container where paginated elements will be rendered -->
  <div id="output-container">
    <!-- Cover is rendered directly as page 1 -->
    <div class="img-page">
      <img src="${coverImg}" />
    </div>
  </div>

  <!-- Dynamic Pagination Script -->
  <script>
    function paginate() {
      const source = document.getElementById("draft-source");
      const dest = document.getElementById("output-container");
      if (!source || !dest) return;

      const maxContentHeight = 930; // Leave a safe margin for text block height in pixels

      // Off-screen tester page
      const tester = document.createElement("div");
      tester.className = "page";
      tester.style.position = "absolute";
      tester.style.top = "-9999px";
      tester.style.left = "-9999px";
      tester.style.height = "auto";
      document.body.appendChild(tester);

      const testContent = document.createElement("div");
      testContent.style.flex = "1";
      testContent.style.display = "flex";
      testContent.style.flexDirection = "column";
      tester.appendChild(testContent);

      let pageCounter = 2;
      const chStarts = {};

      const createPage = (contentHtml, pageNum) => \`
        <div class="page">
          <div class="custom-header">
            <span style="font-weight: 800; text-transform: uppercase; letter-spacing: 1px; color: #BE123C;">Marriage Compatibility Report</span>
            <span style="font-weight: 500; color: #64748B;">Vedic Astrological Analysis</span>
          </div>
          <div style="flex:1; display:flex; flex-direction:column; overflow:hidden;">
            \${contentHtml}
          </div>
          <div class="custom-footer">
            <span>TrustAstrology.com</span>
            <span>Page \${pageNum}</span>
          </div>
        </div>
      \`;

      const draftNodes = Array.from(source.children);

      draftNodes.forEach(node => {
        if (node.classList.contains("draft-static")) {
          const type = node.getAttribute("data-type");
          dest.innerHTML += createPage(node.innerHTML, pageCounter);
          pageCounter++;
        } else if (node.classList.contains("draft-divider")) {
          const imgUrl = node.getAttribute("data-img");
          dest.innerHTML += \`
            <div class="img-page">
              <img src="\${imgUrl}" />
            </div>
          \`;
        } else if (node.classList.contains("draft-chapter")) {
          const chId = node.getAttribute("data-id");
          const title = node.getAttribute("data-title");
          const subtitle = node.getAttribute("data-subtitle");
          chStarts[chId] = pageCounter;

          // Process the block elements of the chapter (could be h3, p, ul, etc.)
          // We must read children of the nested .narrative-text div
          const wrapper = node.querySelector(".narrative-text") || node;
          const blocks = Array.from(wrapper.children);
          
          let pageHtml = \`
            <h1 class="page-title">\${title}</h1>
            <p class="page-subtitle">\${subtitle}</p>
            <div style="height: 1px; background: rgba(225, 29, 72, 0.15); margin-bottom: 6mm;"></div>
          \`;
          testContent.innerHTML = pageHtml;

          blocks.forEach(block => {
            const clone = block.cloneNode(true);
            testContent.appendChild(clone);
            
            if (testContent.offsetHeight > maxContentHeight) {
              // Commit current page
              dest.innerHTML += createPage(pageHtml, pageCounter);
              pageCounter++;

              // Start new page with cloned block
              pageHtml = \`
                <div style="font-size: 11pt; font-weight: 700; color: var(--rose-dark); margin-bottom: 4mm; text-transform: uppercase; letter-spacing: 0.5px;">\${title} (Continued)</div>
              \`;
              testContent.innerHTML = pageHtml;
              testContent.appendChild(clone);
            }
            pageHtml = testContent.innerHTML;
          });

          dest.innerHTML += createPage(pageHtml, pageCounter);
          pageCounter++;
        } else if (node.classList.contains("draft-koota")) {
          const chId = node.getAttribute("data-id");
          const title = node.getAttribute("data-title");
          const subtitle = node.getAttribute("data-subtitle");
          chStarts[chId] = pageCounter;

          const blocks = Array.from(node.children);
          
          let pageHtml = \`
            <h1 class="page-title">\${title}</h1>
            <p class="page-subtitle">\${subtitle}</p>
            <div style="height: 1px; background: rgba(225, 29, 72, 0.15); margin-bottom: 6mm;"></div>
          \`;
          testContent.innerHTML = pageHtml;

          blocks.forEach(block => {
            const clone = block.cloneNode(true);
            testContent.appendChild(clone);
            
            if (testContent.offsetHeight > maxContentHeight) {
              dest.innerHTML += createPage(pageHtml, pageCounter);
              pageCounter++;

              pageHtml = \`
                <div style="font-size: 11pt; font-weight: 700; color: var(--rose-dark); margin-bottom: 4mm; text-transform: uppercase; letter-spacing: 0.5px;">\${title} (Continued)</div>
              \`;
              testContent.innerHTML = pageHtml;
              testContent.appendChild(clone);
            }
            pageHtml = testContent.innerHTML;
          });

          dest.innerHTML += createPage(pageHtml, pageCounter);
          pageCounter++;
        }
      });

      // Populate TOC page starting numbers dynamically
      const tocPlaceholder = dest.querySelector("#toc-placeholder");
      if (tocPlaceholder) {
        tocPlaceholder.innerHTML = \`
          <div style="display:flex; flex-direction:column; gap: 0.8mm; font-size:11.5pt; line-height:1.45; color: var(--text-main);">
            <div class="toc-item"><span class="toc-chapter">Chapter 01: Welcome &amp; Preparation</span><span class="toc-dots"></span><span>Page \${chStarts.ch1 || 10}</span></div>
            <div class="toc-item"><span class="toc-chapter">Chapter 02: The Compatibility Blueprint</span><span class="toc-dots"></span><span>Page \${chStarts.ch2 || 11}</span></div>
            <div class="toc-item"><span class="toc-chapter">Chapter 03: Nadi (Health &amp; Genetics)</span><span class="toc-dots"></span><span>Page \${chStarts.ch3 || 12}</span></div>
            <div class="toc-item"><span class="toc-chapter">Chapter 04: Bhakoot (Destiny &amp; Mind)</span><span class="toc-dots"></span><span>Page \${chStarts.ch4 || 14}</span></div>
            <div class="toc-item"><span class="toc-chapter">Chapter 05: Gana (Temperament &amp; Ego)</span><span class="toc-dots"></span><span>Page \${chStarts.ch5 || 16}</span></div>
            <div class="toc-item"><span class="toc-chapter">Chapter 06: Graha Maitri (Planetary Friendship)</span><span class="toc-dots"></span><span>Page \${chStarts.ch6 || 18}</span></div>
            <div class="toc-item"><span class="toc-chapter">Chapter 07: Yoni (Physical Attraction &amp; Biology)</span><span class="toc-dots"></span><span>Page \${chStarts.ch7 || 20}</span></div>
            <div class="toc-item"><span class="toc-chapter">Chapter 08: Tara (Destiny &amp; Auspiciousness)</span><span class="toc-dots"></span><span>Page \${chStarts.ch8 || 22}</span></div>
            <div class="toc-item"><span class="toc-chapter">Chapter 09: Vashya (Attraction &amp; Control)</span><span class="toc-dots"></span><span>Page \${chStarts.ch9 || 24}</span></div>
            <div class="toc-item"><span class="toc-chapter">Chapter 10: Varna (Mental Profiles &amp; Work Style)</span><span class="toc-dots"></span><span>Page \${chStarts.ch10 || 26}</span></div>
            <div class="toc-item"><span class="toc-chapter">Chapter 11: Emotional Compatibility &amp; Needs</span><span class="toc-dots"></span><span>Page \${chStarts.ch11 || 28}</span></div>
            <div class="toc-item"><span class="toc-chapter">Chapter 12: Communication &amp; Conflict Styles</span><span class="toc-dots"></span><span>Page \${chStarts.ch12 || 30}</span></div>
            <div class="toc-item"><span class="toc-chapter">Chapter 13: Married Life Lifeline (First 10 Years)</span><span class="toc-dots"></span><span>Page \${chStarts.ch13 || 32}</span></div>
            <div class="toc-item"><span class="toc-chapter">Chapter 14: Financial Compatibility &amp; Wealth</span><span class="toc-dots"></span><span>Page \${chStarts.ch14 || 34}</span></div>
            <div class="toc-item"><span class="toc-chapter">Chapter 15: Family &amp; In-Law Dynamics</span><span class="toc-dots"></span><span>Page \${chStarts.ch15 || 36}</span></div>
            <div class="toc-item"><span class="toc-chapter">Chapter 16: Parenting &amp; Family Values</span><span class="toc-dots"></span><span>Page \${chStarts.ch16 || 38}</span></div>
            <div class="toc-item"><span class="toc-chapter">Chapter 17: Conflict Resolution Blueprint</span><span class="toc-dots"></span><span>Page \${chStarts.ch17 || 40}</span></div>
            <div class="toc-item"><span class="toc-chapter">Chapter 18: Astrological Love Languages</span><span class="toc-dots"></span><span>Page \${chStarts.ch18 || 42}</span></div>
            <div class="toc-item"><span class="toc-chapter">Chapter 19: Relationship Growth Roadmap</span><span class="toc-dots"></span><span>Page \${chStarts.ch19 || 44}</span></div>
            <div class="toc-item"><span class="toc-chapter">Chapter 20: Red Flags &amp; Green Flags</span><span class="toc-dots"></span><span>Page \${chStarts.ch20 || 46}</span></div>
            <div class="toc-item"><span class="toc-chapter">Chapter 21: Compatibility Matrix Summary</span><span class="toc-dots"></span><span>Page \${chStarts.ch21 || 48}</span></div>
            <div class="toc-item"><span class="toc-chapter">Chapter 22: Frequently Asked Questions</span><span class="toc-dots"></span><span>Page \${chStarts.ch22 || 50}</span></div>
            <div class="toc-item"><span class="toc-chapter">Chapter 22: Frequently Asked Questions</span><span class="toc-dots"></span><span>Page \${chStarts.ch22_2 || 51}</span></div>
            <div class="toc-item"><span class="toc-chapter">Chapter 23: The Astrological Verdict</span><span class="toc-dots"></span><span>Page \${chStarts.ch23 || 52}</span></div>
          </div>
        \`;
      }

      // Cleanup
      tester.remove();
      source.remove();
    }
  </script>

</body>
</html>
  `;
}

module.exports = {
  generateCompatibilityReportPDF,
};
