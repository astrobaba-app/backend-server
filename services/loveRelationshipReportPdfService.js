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
      console.warn(`[Love PDF Service] Image not found at ${fullPath}`);
      return "";
    }
    const buffer = fs.readFileSync(fullPath);
    const ext = path.extname(fileName).toLowerCase();
    const mime = ext === ".jpg" || ext === ".jpeg" ? "image/jpeg" : "image/png";
    return `data:${mime};base64,${buffer.toString("base64")}`;
  } catch (error) {
    console.error(`[Love PDF Service] Error reading image ${fileName}:`, error);
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

const safeString = (val, fallback = "--") => {
  if (val === undefined || val === null) return fallback;
  return typeof val === "string" ? val : JSON.stringify(val);
};

const splitLargeParagraph = (pText) => {
  const sentences = pText.match(/[^.!?]+[.!?]+(\s|$)/g) || [pText];
  if (sentences.length <= 4) {
    return `<p style="margin-bottom:3.5mm; text-align:justify; text-indent:0; font-size:11.5pt; line-height:1.6; color:var(--text-main);">${pText}</p>`;
  }
  
  const chunks = [];
  for (let i = 0; i < sentences.length; i += 3) {
    chunks.push(sentences.slice(i, i + 3).join("").trim());
  }
  
  return chunks.map(chunk => 
    `<p style="margin-bottom:3.5mm; text-align:justify; text-indent:0; font-size:11.5pt; line-height:1.6; color:var(--text-main);">${chunk}</p>`
  ).join("\n");
};

const formatNarrativeText = (text) => {
  if (!text) return "";
  let html = safeString(text);

  // Clean HTML characters first
  html = escapeHtml(html);

  // Process paragraphs and general formatting
  const paras = html.split(/\r?\n\s*\r?\n/);
  html = paras.map(para => {
    let p = para.trim();
    if (!p) return "";

    if (p.startsWith("### ")) {
      const headingText = p.substring(4).trim();
      return `<h3 style="font-size:12.5pt; font-weight:700; color:var(--pink-deep); margin-top:3.5mm; margin-bottom:1.5mm; text-transform:uppercase; letter-spacing:1.5px;">${headingText}</h3>`;
    }
    if (p.startsWith("## ")) {
      const headingText = p.substring(3).trim();
      return `<h3 style="font-size:13pt; font-weight:700; color:var(--pink-deep); margin-top:3.5mm; margin-bottom:1.5mm; text-transform:uppercase; letter-spacing:1.5px;">${headingText}</h3>`;
    }

    p = p.replace(/\*\*(.*?)\*\*/g, "$1");

    if (p.startsWith("- ") || p.startsWith("* ")) {
      const items = p.split(/\n[-*]\s+/).map(item => {
        const cleanItem = item.replace(/^[-*]\s+/, "").trim();
        return cleanItem ? `<li style="margin-bottom:1.2mm;">${cleanItem}</li>` : "";
      }).filter(Boolean).join("");
      return `<ul style="margin-left:5mm; margin-bottom:3.5mm; line-height:1.5; font-size:11pt; color:var(--text-main);">${items}</ul>`;
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

const getHouseStrength = (score) => {
  if (score >= 30) return "Very Strong";
  if (score >= 28) return "Strong";
  if (score >= 24) return "Average";
  return "Weak";
};

const getManglikIntensity = (score) => {
  if (!score || score === 0) return "None";
  if (score < 15) return "Low";
  if (score <= 30) return "Medium";
  return "High";
};

const renderChartSvg = (chartData, fallbackAscSignName, chartTitle) => {
  if (!chartData || !chartData.planets) {
    return `
      <div class="chart-box">
        <div style="font-size:11pt; font-weight:700; color:var(--pink-deep); margin-bottom:3mm; text-align:center;">${chartTitle}</div>
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
      <div style="font-size:11pt; font-weight:700; color:var(--pink-deep); margin-bottom:3mm; text-align:center;">${chartTitle}</div>
      <svg viewBox="0 0 393 393" style="width:280px; height:280px; background-color:#FCF8E3; box-shadow:0px 4px 12px rgba(0,0,0,0.15);">
        <rect x="0" y="0" width="393" height="393" fill="#FCF8E3" stroke="#4C4C4C" stroke-width="2" />
        <line x1="0" y1="0" x2="393" y2="393" stroke="#4C4C4C" stroke-width="2" />
        <line x1="393" y1="0" x2="0" y2="393" stroke="#4C4C4C" stroke-width="2" />
        <polygon points="196.5,0 393,196.5 196.5,393 0,196.5" fill="none" stroke="#4C4C4C" stroke-width="2" />
        ${elementsMarkup}
      </svg>
    </div>`;
};

function generateLoveRelationshipHtmlTemplate(reportData, userRequest) {
  const { fullName, dateOfbirth, timeOfbirth, placeOfBirth, gender } = userRequest;
  const pred = reportData.predictions || {};
  const astro = reportData.astrologyBasics || {};
  const charts = reportData.horoscopeCharts || {};

  const formattedDob = formatDate(dateOfbirth);

  const getAge = (dobString) => {
    if (!dobString) return "--";
    try {
      const birthDate = new Date(dobString);
      if (isNaN(birthDate.getTime())) return "--";
      const today = new Date();
      let age = today.getFullYear() - birthDate.getFullYear();
      const m = today.getMonth() - birthDate.getMonth();
      if (m < 0 || (m === 0 && today.getDate() < birthDate.getDate())) age--;
      return `${age} years`;
    } catch (e) { return "--"; }
  };
  const age = getAge(dateOfbirth);

  const getVal = (key, fallback = "") => {
    try {
      return pred[key] || fallback;
    } catch (e) { return fallback; }
  };

  // Load images
  const coverImg = imageToDataUri("lovereportfirstpage.jpg");
  const loveDNAImg = imageToDataUri("THELOVEDNA&EMOTIONALWIRING.jpg");
  const pastLoveImg = imageToDataUri("PASTLOVEATTACHMENT&LESSONS.jpg");
  const presentLoveImg = imageToDataUri("PRESENTLOVESTATE&READINESS.jpg");
  const futureLoveImg = imageToDataUri("FUTURELOVEDIRECTION.jpg");
  const summaryImg = imageToDataUri("summary.jpg");
  const endingImg = imageToDataUri("lovereprotendingpage.jpg");

  const rasiChartSvg = renderChartSvg(charts.rasiChart, astro.ascendant, "Rasi Chart (D1)");
  const navamsaChartSvg = renderChartSvg(charts.navamsaChart, astro.ascendant, "Navamsa Chart (D9)");

  const planetTableRows = (reportData.birthPlanetaryTable || []).map(row => {
    const isVenusOrMoon = row.planet === "Venus" || row.planet === "Moon";
    const highlightStyle = isVenusOrMoon ? `style="background: var(--pink-light); font-weight: 700;"` : "";
    return `
      <tr ${highlightStyle}>
        <td style="font-weight:700;">${escapeHtml(row.planet)}</td>
        <td>${escapeHtml(row.sign)}</td>
        <td>House ${escapeHtml(String(row.house))}</td>
        <td>${formatDegree(row.degree)}</td>
        <td>${row.isRetrograde ? "Yes" : "No"}</td>
        <td style="font-size:10pt;">${escapeHtml(row.status || "Direct")}</td>
      </tr>`;
  }).join("\n");

  // Dynamic Dasha Pages
  const allDashas = astro.allDashas || [];
  const dashaPagesList = [];
  const numDashaPages = Math.max(1, Math.ceil(allDashas.length / 2));

  for (let i = 0; i < allDashas.length; i += 2) {
    const md1 = allDashas[i];
    const md2 = allDashas[i + 1];
    const pageIndex = Math.floor(i / 2);
    const pageNum = 5 + pageIndex;

    const renderDashaBlock = (md) => {
      if (!md) return "";
      return `
        <div style="margin-bottom:0; border:1.5px solid var(--pink); border-radius:8px; overflow:hidden;">
          <div style="background:var(--pink); color:white; display:flex; justify-content:space-between; align-items:center; padding:2.5mm 4mm;">
            <span style="font-weight:700; font-size:10pt; letter-spacing:1px; text-transform:uppercase;">MAHADASHA: ${escapeHtml(md.mahadasha)}</span>
            <span style="font-size:8.5pt; background:rgba(255,255,255,0.25); padding:0.5mm 2mm; border-radius:12px; font-weight:700;">${formatDate(md.start)} — ${formatDate(md.end)}</span>
          </div>
          <table style="width:100%; border-collapse:collapse; background:white;">
            <thead>
              <tr style="background:var(--pink-light); border-bottom:1px solid var(--pink);">
                <th style="font-size:8.5pt; padding:1.5mm 3.5mm; color:var(--pink-deep); font-weight:700; text-align:left; text-transform:uppercase;">Antardasha</th>
                <th style="font-size:8.5pt; padding:1.5mm 3.5mm; color:var(--pink-deep); font-weight:700; text-align:left; text-transform:uppercase;">Starts</th>
                <th style="font-size:8.5pt; padding:1.5mm 3.5mm; color:var(--pink-deep); font-weight:700; text-align:left; text-transform:uppercase;">Ends</th>
              </tr>
            </thead>
            <tbody>
              ${(md.antardashas || []).map((ad, idx) => `
                <tr style="border-bottom:${idx === md.antardashas.length - 1 ? 'none' : '1px solid var(--pink-light)'}; background:${idx % 2 === 0 ? 'white' : 'var(--pink-light)'};">
                  <td style="font-size:9pt; padding:1.2mm 3.5mm; font-weight:700; color:#111;">${escapeHtml(ad.planet)}</td>
                  <td style="font-size:9pt; padding:1.2mm 3.5mm; color:#6B7280;">${formatDate(ad.start)}</td>
                  <td style="font-size:9pt; padding:1.2mm 3.5mm; color:#6B7280;">${formatDate(ad.end)}</td>
                </tr>`).join("")}
            </tbody>
          </table>
        </div>`;
    };

    const twoTableContent = `
      <p style="font-size:10.5pt; color:#6B7280; line-height:1.6; margin-bottom:5mm; text-align:justify;">
        The Vimshottari Dasha system maps the timing of planetary influences across your life. Each Mahadasha governs a major era of emotional and romantic development, while the Antardasha sub-periods reveal the precise windows when love opportunities, relationship challenges, or significant emotional transitions are most active.
      </p>
      <div style="display:flex; flex-direction:column; gap:8mm;">
        ${renderDashaBlock(md1)}
        ${md2 ? renderDashaBlock(md2) : ""}
      </div>`;

    dashaPagesList.push(`
    <div class="page">
      <div class="header">
        <div class="header-eyebrow"><div class="eyebrow-line"></div><span class="eyebrow-text">Timing &amp; Cycles</span></div>
        <h1 class="header-title">Planetary Periods (Dashas) — Part ${pageIndex + 1}</h1>
        <div class="header-gradient"></div>
      </div>
      <div style="flex:1; overflow:hidden;">
        ${twoTableContent}
      </div>
      <div class="footer">
        <span class="footer-left">Love &amp; Relationship Report · ${escapeHtml(fullName)}</span>
        <span class="footer-right">Page ${pageNum}</span>
      </div>
    </div>`);
  }
  const dashaPagesHtml = dashaPagesList.join("\n");

  // Page number calculations
  const startCh1 = 5 + numDashaPages;
  const pgLoveDNA = startCh1 + 1;
  const pgExpressLove = pgLoveDNA + 1;
  const pgVuln = pgExpressLove + 1;
  const pgShadow = pgVuln + 1;
  const pgKarmic = pgShadow + 1;

  const startCh2 = pgKarmic + 1;
  const pgFirstLove = startCh2 + 1;
  const pgAttachment = pgFirstLove + 1;

  const startCh3 = pgAttachment + 1;
  const pgReadiness = startCh3 + 1;
  const pgBlocks = pgReadiness + 1;
  const pgMeansNow = pgBlocks + 1;

  const startCh4 = pgMeansNow + 1;
  const pgSoulmate = startCh4 + 1;
  const pgWhereMeet = pgSoulmate + 1;
  const pgCompat = pgWhereMeet + 1;
  const pgGreenRed = pgCompat + 1;

  const startCh5 = pgGreenRed + 1;
  const pgMarriage = startCh5 + 1;
  const pgMarriedLife = pgMarriage + 1;
  const pgSpouse = pgMarriedLife + 1;
  const pgPlanetData = pgSpouse + 1;
  const pgSummaryPage = pgPlanetData + 1;
  const pgFaq1 = pgSummaryPage + 1;
  const pgFaq2 = pgFaq1 + 1;

  const narrativePage = (chId, eyebrow, title, fieldKey, subtitle = "") => {
    const text = formatNarrativeText(safeString(getVal(fieldKey, "Analysis not available for this section.")));
    return `
      <div class="draft-chapter" data-id="${chId}" data-eyebrow="${escapeHtml(eyebrow)}" data-title="${escapeHtml(title)}" ${subtitle ? `data-subtitle="${escapeHtml(subtitle)}"` : ""}>
        <div class="narrative-text">${text}</div>
      </div>`;
  };

  const renderFaqBlock = (question, answerKey) => {
    const answer = getVal(answerKey, "Analysis based on your planetary placements is being compiled.");
    return `
      <div style="margin-bottom: 4.5mm; padding-bottom: 3.5mm; border-bottom: 1px solid rgba(219,39,119,0.12);">
        <div style="font-size: 11pt; font-weight: 700; color: var(--pink-deep); margin-bottom: 1.8mm; line-height: 1.4;">Q: ${escapeHtml(question)}</div>
        <p style="font-size: 10.5pt; line-height: 1.55; color: var(--text-main); text-align: justify; font-style: normal; margin-bottom: 0;">${escapeHtml(answer)}</p>
      </div>`;
  };

  const faqPage1Content = `
    <div style="display: flex; flex-direction: column; gap: 1mm; height: 100%;">
      ${renderFaqBlock("Will I Have a Love Marriage, Arranged Marriage, or Love-Cum-Arranged Marriage?", "faqMarriageType")}
      ${renderFaqBlock("When Am I Most Likely to Meet My Life Partner and Get Married?", "faqPartnerMeetingTiming")}
      ${renderFaqBlock("Will There Be Any Delays or Major Obstacles in My Marriage?", "faqMarriageDelays")}
      ${renderFaqBlock("What Kind of Person Will My Future Partner Be? (Personality, values, career, lifestyle, appearance, etc.)", "faqPartnerDescription")}
      ${renderFaqBlock("How and Where Am I Most Likely to Meet My Future Partner? (College, workplace, family, travel, online, another city, etc.)", "faqHowWhereMeet")}
      ${renderFaqBlock("Will My Marriage Be Happy, Stable, and Emotionally Fulfilling?", "faqMarriageHappiness")}
    </div>
  `;

  const faqPage2Content = `
    <div style="display: flex; flex-direction: column; gap: 1mm; height: 100%;">
      ${renderFaqBlock("Will I Have More Than One Serious Relationship Before Marriage?", "faqRelationshipsBeforeMarriage")}
      ${renderFaqBlock("Will My Partner Be From My City, Another State, Abroad, or a Different Community? (Including long-distance/intercaste possibilities.)", "faqPartnerOrigin")}
      ${renderFaqBlock("Will My Family Support My Relationship and Marriage Decisions?", "faqFamilySupport")}
      ${renderFaqBlock("What Are My Biggest Relationship Strengths, Weaknesses, and the Green & Red Flags I Should Watch For?", "faqStrengthsWeaknessesFlags")}
      ${renderFaqBlock("What Are the Most Favorable Time Periods for Love, Commitment, Engagement, and Marriage?", "faqFavorablePeriods")}
      ${renderFaqBlock("What Important Karmic Lessons and Life Changes Will My Marriage Bring? (Including its impact on personal growth, career, and finances.)", "faqKarmicLessonsChanges")}
    </div>
  `;

  return `<!DOCTYPE html>
<html>
<head>
  <meta charset="utf-8">
  <title>Love &amp; Relationship Report</title>
  <link href="https://fonts.googleapis.com/css2?family=Roboto:wght@300;400;500;700;800;900&display=swap" rel="stylesheet">
  <style>
    :root {
      --pink: #DB2777;
      --pink-light: #FDF2F8;
      --pink-deep: #831843;
      --pink-dark: #BE185D;
      --pink-accent: #EC4899;
      --dark-blue: #1E1B4B;
      --white: #FFFFFF;
      --text-main: #374151;
      --text-muted: #6B7280;
      --gold: #DB2777;
      --gold-dark: #831843;
      --gold-light: #FDF2F8;
      --border-color: rgba(219,39,119,0.15);
    }

    @page { size: A4; margin: 0; }
    * { box-sizing: border-box; margin: 0; padding: 0; }

    body {
      font-family: 'Roboto', 'Helvetica Neue', Arial, sans-serif;
      color: var(--text-main);
      background: var(--white);
      -webkit-print-color-adjust: exact;
      print-color-adjust: exact;
    }

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

    .img-page-bg {
      width: 794px;
      height: 1122px;
      box-sizing: border-box;
      page-break-after: always;
      page-break-inside: avoid;
      background-size: 100% 100%;
      background-repeat: no-repeat;
      background-position: center;
      display: block;
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
      .img-page-bg {
        width: 210mm;
        height: 297mm;
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

    .bg-cover       { background-image: url('${coverImg}'); }
    .bg-love-dna    { background-image: url('${loveDNAImg}'); }
    .bg-past-love   { background-image: url('${pastLoveImg}'); }
    .bg-present     { background-image: url('${presentLoveImg}'); }
    .bg-future      { background-image: url('${futureLoveImg}'); }
    .bg-summary     { background-image: url('${summaryImg}'); }
    .bg-ending      { background-image: url('${endingImg}'); }

    /* ─── Header ─── */
    .header { margin-bottom: 8mm; }
    .header-eyebrow { display:flex; align-items:center; gap:3mm; margin-bottom:1.5mm; }
    .eyebrow-line { width:10mm; height:3px; background:var(--pink); border-radius:2px; }
    .eyebrow-text { font-size:8.5pt; font-weight:700; text-transform:uppercase; letter-spacing:2.5px; color:var(--pink-dark); }
    .header-title { font-size:22pt; font-weight:800; color:var(--dark-blue); letter-spacing:-0.3px; margin-bottom:1mm; }
    .header-subtitle { font-size:11pt; color:#555; font-weight:400; }
    .header-gradient { height:2.5px; background:linear-gradient(90deg, var(--pink) 0%, rgba(219,39,119,0.2) 60%, transparent 100%); margin-top:3mm; }

    /* ─── Narrative ─── */
    .narrative-block { margin-bottom:3.5mm; }
    .narrative-label {
      font-size:9pt; font-weight:700; text-transform:uppercase; letter-spacing:1.5px;
      color:var(--pink-dark); margin-bottom:1.5mm; padding-bottom:1mm;
      border-bottom:1.5px solid rgba(219,39,119,0.3);
    }
    .narrative-text {
      font-size:11.5pt; color:#374151; line-height:1.6; text-align:justify;
    }

    /* ─── TLDR / Callout box ─── */
    .tldr-box {
      background:var(--gold-light); border:1.5px solid var(--pink); border-radius:8px;
      padding:3.5mm 4.5mm; margin-top:4mm;
    }
    .tldr-label { font-size:8.5pt; font-weight:700; text-transform:uppercase; letter-spacing:1.5px; color:var(--pink-dark); margin-bottom:1.5mm; }
    .tldr-text { font-size:11.5pt; font-weight:500; color:var(--dark-blue); line-height:1.5; font-style:italic; }

    /* ─── Info Cards ─── */
    .info-card { background:var(--white); border:1.5px solid #E5E7EB; border-radius:8px; padding:4mm 5mm; }
    .info-card-title { font-size:8.5pt; font-weight:700; text-transform:uppercase; letter-spacing:1.5px; color:var(--pink-dark); margin-bottom:2.5mm; padding-bottom:1.5mm; border-bottom:1px solid rgba(219,39,119,0.2); }
    .info-card-row { display:flex; justify-content:space-between; align-items:flex-start; padding:2mm 0; border-bottom:1px solid #F3F4F6; gap:3mm; }
    .info-card-row:last-child { border-bottom:none; }
    .info-card-label { font-size:10.5pt; color:#6B7280; font-weight:500; }
    .info-card-value { font-size:10.5pt; font-weight:700; color:#111827; text-align:right; }

    /* ─── Grid ─── */
    .grid-2 { display:grid; grid-template-columns:1fr 1fr; gap:4.5mm; margin-bottom:3.5mm; }

    /* ─── Footer ─── */
    .footer {
      margin-top:auto; padding-top:3.5mm;
      border-top:1.5px solid rgba(219,39,119,0.2);
      display:flex; justify-content:space-between; align-items:center;
      font-size:8.5pt; color:#6B7280;
    }
    .footer-left { font-weight:500; }
    .footer-right { font-weight:700; color:var(--pink-dark); }

    /* ─── Table of Contents ─── */
    .toc-row { display:flex; align-items:baseline; padding:1.8mm 0; border-bottom:1px solid #F3F4F6; }
    .toc-num { font-size:12.5pt; font-weight:700; color:var(--pink); width:10mm; flex-shrink:0; }
    .toc-title { font-size:12pt; font-weight:500; color:#374151; flex:1; }
    .toc-dots { flex:1; border-bottom:1.5px dotted #D1D5DB; margin:0 4mm; max-width:35mm; }
    .toc-page { font-size:12pt; font-weight:700; color:#111; width:15mm; text-align:right; }

    /* ─── Chart container ─── */
    .charts-container {
      display:flex; flex-direction:row; justify-content:space-around;
      align-items:center; margin-top:3mm;
    }
    .chart-box {
      display:flex; flex-direction:column; align-items:center;
    }

    /* ─── Planet Table ─── */
    .table-wrap { border:1.5px solid #E5E7EB; border-radius:8px; overflow:hidden; margin-top:2.5mm; }
    .premium-table { width:100%; border-collapse:collapse; }
    .premium-table th {
      background:var(--pink-deep); color:var(--white);
      font-size:9.5pt; font-weight:700; text-transform:uppercase; letter-spacing:1.5px;
      padding:2.5mm 3.5mm; text-align:left; border:none;
    }
    .premium-table td {
      padding:2mm 3.5mm; font-size:11pt; border-bottom:1px solid #F3F4F6;
      vertical-align:middle; line-height:1.4; color:#374151;
    }
    .premium-table tr:last-child td { border-bottom:none; }
    .premium-table tr:nth-child(even) td { background:var(--pink-light); }
  </style>
</head>
<body>

  <!-- Hidden source of all pages/chapters before pagination -->
  <div id="draft-source" style="display: none;">
    <!-- PAGE 1: COVER IMAGE -->
    <div class="draft-divider" data-img="${coverImg}"></div>

    <!-- PAGE 2: DISCLAIMER -->
    <div class="draft-static" data-eyebrow="Legal & Guidance" data-title="Disclaimer">
      <p style="font-size:13pt; line-height:1.75; color:var(--text-main); text-align:justify; margin-bottom:5mm;">
        This Love &amp; Relationship Report has been carefully prepared based on the timeless principles of Vedic Astrology (Jyotisha) — an ancient Indian system of understanding life through planetary alignments and cosmic influences. It is designed to offer meaningful insights into your emotional nature, relationship patterns, and romantic journey.
      </p>
      <p style="font-size:13pt; line-height:1.75; color:var(--text-main); text-align:justify; margin-bottom:5mm;">
        Please note that astrology does not predict the future with absolute certainty. It highlights possibilities and tendencies, not fixed outcomes. The choices you make, combined with your free will and karmic path, play a defining role in shaping your love life and relationships. The purpose of this report is to inspire reflection, self-awareness, and emotional growth — not to dictate outcomes or guarantee specific romantic results.
      </p>
      <p style="font-size:13pt; line-height:1.75; color:var(--text-main); text-align:justify; margin-bottom:5mm;">
        Interpretations provided herein are based on the professional understanding and experience of Vedic astrological methods and modern emotional perspectives. As astrology is an interpretive science, different astrologers may offer varied insights. This report represents one expert interpretation of your astrological configuration.
      </p>
      <p style="font-size:13pt; line-height:1.75; color:var(--text-main); text-align:justify;">
        Any recommendations, remedies, or guidance mentioned — such as gemstones, mantras, rituals, or lifestyle adjustments — are intended solely to promote emotional harmony and relationship well-being. These should never replace professional psychological, therapeutic, or medical advice.
      </p>
    </div>

    <!-- PAGE 3: TABLE OF CONTENTS -->
    <div class="draft-static" data-is-toc="true"></div>

    <!-- PAGE 4: SNAPSHOT & CHARTS -->
    <div class="draft-static" data-eyebrow="Personal Snapshot" data-title="Native Profile & Relationship Charts">
      <div class="grid-2" style="margin-bottom:4mm;">
        <div class="info-card">
          <div class="info-card-title">Birth Details</div>
          <div class="info-card-row"><span class="info-card-label">Full Name</span><span class="info-card-value">${escapeHtml(fullName)}</span></div>
          <div class="info-card-row"><span class="info-card-label">Date of Birth</span><span class="info-card-value">${escapeHtml(formattedDob)}</span></div>
          <div class="info-card-row"><span class="info-card-label">Time of Birth</span><span class="info-card-value">${escapeHtml(timeOfbirth)}</span></div>
          <div class="info-card-row"><span class="info-card-label">Place of Birth</span><span class="info-card-value" style="font-size:9pt; max-width:55%; white-space:nowrap; overflow:hidden; text-overflow:ellipsis;">${escapeHtml(placeOfBirth)}</span></div>
          <div class="info-card-row"><span class="info-card-label">Gender / Age</span><span class="info-card-value">${escapeHtml(gender)} / ${escapeHtml(age)}</span></div>
        </div>
        <div class="info-card">
          <div class="info-card-title">Astrological Placements</div>
          <div class="info-card-row"><span class="info-card-label">Lagna (Ascendant)</span><span class="info-card-value">${escapeHtml(astro.ascendant)}</span></div>
          <div class="info-card-row"><span class="info-card-label">Moon Sign (Rashi)</span><span class="info-card-value">${escapeHtml(astro.moonSign)}</span></div>
          <div class="info-card-row"><span class="info-card-label">Sun Sign</span><span class="info-card-value">${escapeHtml(astro.sunSign)}</span></div>
          <div class="info-card-row"><span class="info-card-label">Nakshatra</span><span class="info-card-value">${escapeHtml(astro.nakshatra)} (${escapeHtml(astro.nakshatraLord)})</span></div>
          <div class="info-card-row"><span class="info-card-label">Current Dasha</span><span class="info-card-value" style="font-size:9pt;">${escapeHtml(astro.mahadasha)}–${escapeHtml(astro.antardasha)}</span></div>
        </div>
      </div>

      <div class="charts-container">
        ${rasiChartSvg}
        ${navamsaChartSvg}
      </div>

      <div style="margin-top:4mm;">
        <p style="font-size:11pt; line-height:1.65; color:var(--text-main); text-align:justify;">
          The Rasi Chart (D1) is the primary birth chart that reveals your fundamental personality, emotional nature, and the overall framework of your life including love and relationships. The Navamsa Chart (D9) is the chart of the soul and is considered the most important divisional chart for marriage and partnership analysis — it reveals the deeper, karmic dimension of your romantic life, the quality of your destined relationships, and the true nature of the partner you are meant to attract. Together, these two charts form a complete astrological portrait: D1 shows the path you walk in love, while D9 shows the destination your soul is seeking. Reading both in conjunction allows us to understand not just what kind of love you seek, but what kind of love you are karmically aligned to receive.
        </p>
      </div>
    </div>

    <!-- PAGES 5+: DASHA TABLES -->
    ${dashaPagesHtml}

    <!-- CHAPTER 1 -->
    <div class="draft-divider" data-img="${loveDNAImg}"></div>
    ${narrativePage("ch_lovedna", "Love DNA & Emotional Wiring", "Your Love DNA", "loveDNAEmotionalWiring")}
    ${narrativePage("ch_expresslove", "Love DNA & Emotional Wiring", "How You Express Love", "howYouExpressLove")}
    ${narrativePage("ch_vuln", "Love DNA & Emotional Wiring", "Emotional Vulnerability", "emotionalVulnerability")}
    ${narrativePage("ch_shadow", "Love DNA & Emotional Wiring", "Relationship Shadow", "relationshipShadow")}
    ${narrativePage("ch_karmic", "Love DNA & Emotional Wiring", "Karmic Love Lessons", "karmicLoveLessons")}

    <!-- CHAPTER 2 -->
    <div class="draft-divider" data-img="${pastLoveImg}"></div>
    ${narrativePage("ch_firstlove", "Past Love, Attachment & Lessons", "First Love Energy", "firstLoveEnergy")}
    ${narrativePage("ch_attachment", "Past Love, Attachment & Lessons", "Your Attachment Style", "attachmentStyle")}

    <!-- CHAPTER 3 -->
    <div class="draft-divider" data-img="${presentLoveImg}"></div>
    ${narrativePage("ch_readiness", "Present Love State & Readiness", "Current Love Readiness", "currentLoveReadiness")}
    ${narrativePage("ch_blocks", "Present Love State & Readiness", "Current Emotional Blocks", "currentEmotionalBlocks")}
    ${narrativePage("ch_meansnow", "Present Love State & Readiness", "What Love Means To You Now", "whatLoveMeansNow")}

    <!-- CHAPTER 4 -->
    <div class="draft-divider" data-img="${futureLoveImg}"></div>
    ${narrativePage("ch_soulmate", "Future Love Direction", "Your Soulmate Profile", "soulmatProfile")}
    ${narrativePage("ch_wheremeet", "Future Love Direction", "Where You'll Meet Your Person", "whereYoullMeet")}
    ${narrativePage("ch_compat", "Future Love Direction", "Soulmate Compatibility", "soulmateCompatibility")}
    
    <!-- GREEN & RED FLAGS -->
    <div class="draft-static" data-eyebrow="Future Love Direction" data-title="Green Flags & Red Flags">
      <div class="grid-2" style="margin-top:2mm; height:100%;">
        <div>
          <div class="narrative-label" style="border-bottom-color:rgba(219,39,119,0.3);">Green Flags — Seek These</div>
          <div class="narrative-text" style="margin-top:2mm;">${formatNarrativeText(safeString(getVal("greenFlags", "")))}</div>
        </div>
        <div>
          <div class="narrative-label" style="border-bottom-color:rgba(219,39,119,0.3);">Red Flags — Proceed With Caution</div>
          <div class="narrative-text" style="margin-top:2mm;">${formatNarrativeText(safeString(getVal("redFlags", "")))}</div>
        </div>
      </div>
    </div>

    <!-- CHAPTER 5 -->
    <div class="draft-divider" data-img="${summaryImg}"></div>
    ${narrativePage("ch_marriage", "Summary & Guidance", "Marriage Destiny", "marriageDestiny")}
    ${narrativePage("ch_marriedlife", "Summary & Guidance", "Your Married Life", "marriedLife")}
    ${narrativePage("ch_spouse", "Summary & Guidance", "Spouse Personality Profile", "spousePersonality")}

    <!-- PLANETARY POSITIONS TABLE -->
    <div class="draft-static" data-id="ch_planetdata" data-eyebrow="Astrological Data" data-title="Planetary Positions & Dignities">
      <p style="font-size:11pt; color:var(--text-main); margin-bottom:3.5mm; line-height:1.6; text-align:justify;">
        The planetary positions in your birth chart form the foundation of your relationship dynamics. Special attention is given to <strong>Venus</strong> (planet of love and attraction), the <strong>Moon</strong> (emotions and mind), and the <strong>7th House</strong> configurations which govern commitment and marriage.
      </p>
      <div class="table-wrap">
        <table class="premium-table">
          <thead>
            <tr>
              <th>Planet</th><th>Sign</th><th>House</th><th>Degree</th><th>Retro</th><th>Status / Dignity</th>
            </tr>
          </thead>
          <tbody>${planetTableRows}</tbody>
        </table>
      </div>
      <div class="grid-2" style="margin-top:4mm;">
        <div class="info-card">
          <div class="info-card-title">Manglik Dosha Analysis</div>
          <div class="info-card-row">
            <span class="info-card-label">Presence</span>
            <span class="info-card-value" style="color:${reportData.reportInput?.astrology?.manglikStatus?.isManglik ? '#BE185D' : '#059669'};">
              ${reportData.reportInput?.astrology?.manglikStatus?.isManglik ? "PRESENT" : "ABSENT"}
            </span>
          </div>
          <div class="info-card-row">
            <span class="info-card-label">Intensity</span>
            <span class="info-card-value">${getManglikIntensity(reportData.reportInput?.astrology?.manglikStatus?.score)}</span>
          </div>
        </div>
        <div class="info-card">
          <div class="info-card-title">Ashtakavarga Strengths</div>
          <div class="info-card-row">
            <span class="info-card-label">1st House (Self)</span>
            <span class="info-card-value">${reportData.reportInput?.astrology?.ashtakvarga?.house1 ?? "--"} (${getHouseStrength(reportData.reportInput?.astrology?.ashtakvarga?.house1)})</span>
          </div>
          <div class="info-card-row">
            <span class="info-card-label">7th House (Union)</span>
            <span class="info-card-value">${reportData.reportInput?.astrology?.ashtakvarga?.house7 ?? "--"} (${getHouseStrength(reportData.reportInput?.astrology?.ashtakvarga?.house7)})</span>
          </div>
        </div>
      </div>
    </div>

    <!-- SUMMARY INTEGRATION -->
    ${narrativePage("ch_summary", "Summary & Integration", "Your Complete Love Journey", "loveSummary")}

    <!-- FAQ PAGES -->
    <div class="draft-static" data-id="ch_faq1" data-eyebrow="Astrological Q&A" data-title="Frequently Asked Love & Marriage Questions — Part 1">
      ${faqPage1Content}
    </div>
    <div class="draft-static" data-id="ch_faq2" data-eyebrow="Astrological Q&A" data-title="Frequently Asked Love & Marriage Questions — Part 2">
      ${faqPage2Content}
    </div>

    <!-- ENDING CLOSING COVER -->
    <div class="draft-divider" data-img="${endingImg}"></div>
  </div>

  <!-- Real Output Container where paginated elements will be rendered -->
  <div id="output-container"></div>

  <!-- Dynamic Pagination Script -->
  <script>
    function paginate() {
      const source = document.getElementById("draft-source");
      const dest = document.getElementById("output-container");
      if (!source || !dest) return;

      const maxContentHeight = 830; // Leave a safe margin for content block height in pixels

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

      let pageCounter = 1;
      const chStarts = {};

      const createPage = (contentHtml, pageNum, eyebrow = "", title = "", subtitle = "") => {
        const hasHeader = eyebrow || title;
        const headerHtml = hasHeader ? \`
          <div class="header">
            <div class="header-eyebrow"><div class="eyebrow-line"></div><span class="eyebrow-text">\${eyebrow}</span></div>
            <h1 class="header-title">\${title}</h1>
            \${subtitle ? \`<p class="header-subtitle">\${subtitle}</p>\` : ""}
            <div class="header-gradient" style="margin-bottom: 6mm;"></div>
          </div>
        \` : \`
          <div class="header" style="margin-bottom: 4mm;">
            <div style="font-size: 11pt; font-weight: 700; color: var(--pink-deep); text-transform: uppercase; letter-spacing: 0.5px;">\${title} (Continued)</div>
            <div class="header-gradient" style="margin-top: 2mm; margin-bottom: 4mm;"></div>
          </div>
        \`;

        return \`
          <div class="page">
            \${headerHtml}
            <div style="flex:1; display:flex; flex-direction:column; overflow:hidden;">
              \${contentHtml}
            </div>
            <div class="footer">
              <span class="footer-left">Love &amp; Relationship Report · \${escapeHtml("${fullName}")}</span>
              <span class="footer-right">Page \${pageNum}</span>
            </div>
          </div>
        \`;
      };

      function escapeHtml(value) {
        return String(value ?? "")
          .replace(/&/g, "&amp;")
          .replace(/</g, "&lt;")
          .replace(/>/g, "&gt;")
          .replace(/"/g, "&quot;")
          .replace(/'/g, "&#39;");
      }

      const draftNodes = Array.from(source.children);

      draftNodes.forEach(node => {
        if (node.classList.contains("draft-divider")) {
          const imgUrl = node.getAttribute("data-img");
          dest.innerHTML += \`
            <div class="img-page">
              <img src="\${imgUrl}" />
            </div>
          \`;
          pageCounter++;
        } else if (node.classList.contains("draft-static")) {
          const eyebrow = node.getAttribute("data-eyebrow") || "";
          const title = node.getAttribute("data-title") || "";
          const isToc = node.getAttribute("data-is-toc") === "true";
          const nodeId = node.getAttribute("data-id");
          
          if (nodeId) {
            chStarts[nodeId] = pageCounter;
          }
          
          if (isToc) {
            dest.innerHTML += \`
              <div class="page" id="toc-page-container">
                <div class="header">
                  <div class="header-eyebrow"><div class="eyebrow-line"></div><span class="eyebrow-text">Report Structure</span></div>
                  <h1 class="header-title">Table of Contents</h1>
                  <div class="header-gradient" style="margin-bottom: 6mm;"></div>
                </div>
                <div style="flex:1;">
                  <div class="toc-row"><span class="toc-num">03</span><span class="toc-title">The Love DNA &amp; Emotional Wiring</span><span class="toc-dots"></span><span class="toc-page" id="toc-pgLoveDNA"></span></div>
                  <div class="toc-row"><span class="toc-num">04</span><span class="toc-title">How You Express Love</span><span class="toc-dots"></span><span class="toc-page" id="toc-pgExpressLove"></span></div>
                  <div class="toc-row"><span class="toc-num">05</span><span class="toc-title">Emotional Vulnerability</span><span class="toc-dots"></span><span class="toc-page" id="toc-pgVuln"></span></div>
                  <div class="toc-row"><span class="toc-num">06</span><span class="toc-title">Relationship Shadow</span><span class="toc-dots"></span><span class="toc-page" id="toc-pgShadow"></span></div>
                  <div class="toc-row"><span class="toc-num">07</span><span class="toc-title">Karmic Love Lessons</span><span class="toc-dots"></span><span class="toc-page" id="toc-pgKarmic"></span></div>
                  <div class="toc-row"><span class="toc-num">08</span><span class="toc-title">Past Love, Attachment &amp; Lessons</span><span class="toc-dots"></span><span class="toc-page" id="toc-pgFirstLove"></span></div>
                  <div class="toc-row"><span class="toc-num">09</span><span class="toc-title">Present Love State &amp; Readiness</span><span class="toc-dots"></span><span class="toc-page" id="toc-pgReadiness"></span></div>
                  <div class="toc-row"><span class="toc-num">10</span><span class="toc-title">Current Emotional Blocks</span><span class="toc-dots"></span><span class="toc-page" id="toc-pgBlocks"></span></div>
                  <div class="toc-row"><span class="toc-num">11</span><span class="toc-title">What Love Means To You Now</span><span class="toc-dots"></span><span class="toc-page" id="toc-pgMeansNow"></span></div>
                  <div class="toc-row"><span class="toc-num">12</span><span class="toc-title">Future Love Direction — Soulmate Profile</span><span class="toc-dots"></span><span class="toc-page" id="toc-pgSoulmate"></span></div>
                  <div class="toc-row"><span class="toc-num">13</span><span class="toc-title">Where You'll Meet · Compatibility · Green &amp; Red Flags</span><span class="toc-dots"></span><span class="toc-page" id="toc-pgWhereMeet"></span></div>
                  <div class="toc-row"><span class="toc-num">14</span><span class="toc-title">Marriage Destiny · Married Life · Spouse Personality</span><span class="toc-dots"></span><span class="toc-page" id="toc-pgMarriage"></span></div>
                  <div class="toc-row"><span class="toc-num">15</span><span class="toc-title">Planetary Positions &amp; Dignities</span><span class="toc-dots"></span><span class="toc-page" id="toc-pgPlanetData"></span></div>
                  <div class="toc-row"><span class="toc-num">16</span><span class="toc-title">Summary &amp; Your Complete Love Journey</span><span class="toc-dots"></span><span class="toc-page" id="toc-pgSummaryPage"></span></div>
                  <div class="toc-row"><span class="toc-num">17</span><span class="toc-title">Frequently Asked Love &amp; Marriage Questions</span><span class="toc-dots"></span><span class="toc-page" id="toc-pgFaq1"></span></div>
                </div>
                <div class="footer">
                  <span class="footer-left">Love &amp; Relationship Report · \${escapeHtml("${fullName}")}</span>
                  <span class="footer-right">Page 3</span>
                </div>
              </div>
            \`;
          } else {
            dest.innerHTML += createPage(node.innerHTML, pageCounter, eyebrow, title);
          }
          pageCounter++;
        } else if (node.classList.contains("draft-chapter")) {
          const chId = node.getAttribute("data-id");
          const eyebrow = node.getAttribute("data-eyebrow") || "";
          const title = node.getAttribute("data-title") || "";
          const subtitle = node.getAttribute("data-subtitle") || "";
          chStarts[chId] = pageCounter;

          const wrapper = node.querySelector(".narrative-text") || node;
          const blocks = Array.from(wrapper.children);
          
          let pageHtml = "";
          testContent.innerHTML = "";

          blocks.forEach((block, index) => {
            const clone = block.cloneNode(true);
            testContent.appendChild(clone);
            
            if (testContent.offsetHeight > maxContentHeight && index > 0) {
              const isFirstPage = (chStarts[chId] === pageCounter);
              dest.innerHTML += createPage(pageHtml, pageCounter, isFirstPage ? eyebrow : "", isFirstPage ? title : "", subtitle);
              pageCounter++;

              testContent.innerHTML = "";
              testContent.appendChild(clone);
            }
            pageHtml = testContent.innerHTML;
          });

          if (pageHtml) {
            const isFirstPage = (chStarts[chId] === pageCounter);
            dest.innerHTML += createPage(pageHtml, pageCounter, isFirstPage ? eyebrow : "", isFirstPage ? title : "", subtitle);
            pageCounter++;
          }
        }
      });

      // Populate TOC page starting numbers dynamically
      const setTocPage = (id, pageNum) => {
        const el = dest.querySelector("#" + id);
        if (el) el.textContent = pageNum;
      };
      
      setTocPage("toc-pgLoveDNA", chStarts.ch_lovedna || "");
      setTocPage("toc-pgExpressLove", chStarts.ch_expresslove || "");
      setTocPage("toc-pgVuln", chStarts.ch_vuln || "");
      setTocPage("toc-pgShadow", chStarts.ch_shadow || "");
      setTocPage("toc-pgKarmic", chStarts.ch_karmic || "");
      setTocPage("toc-pgFirstLove", chStarts.ch_firstlove || "");
      setTocPage("toc-pgReadiness", chStarts.ch_readiness || "");
      setTocPage("toc-pgBlocks", chStarts.ch_blocks || "");
      setTocPage("toc-pgMeansNow", chStarts.ch_meansnow || "");
      setTocPage("toc-pgSoulmate", chStarts.ch_soulmate || "");
      setTocPage("toc-pgWhereMeet", chStarts.ch_wheremeet || "");
      setTocPage("toc-pgMarriage", chStarts.ch_marriage || "");
      setTocPage("toc-pgPlanetData", chStarts.ch_planetdata || "");
      setTocPage("toc-pgSummaryPage", chStarts.ch_summary || "");
      setTocPage("toc-pgFaq1", chStarts.ch_faq1 || chStarts.ch_faq2 || "");

      // Cleanup
      tester.remove();
      source.remove();
    }
  </script>
</body>
</html>`;
}

async function generateLoveRelationshipReportPDF(reportData, userRequest) {
  let browser = null;
  try {
    if (!reportData.horoscopeCharts || !reportData.horoscopeCharts.rasiChart) {
      let rawChartData = null;
      if (userRequest && userRequest.kundli && userRequest.kundli.charts) {
        rawChartData = userRequest.kundli.charts;
      } else if (userRequest && userRequest.id) {
        try {
          const Kundli = require("../model/horoscope/kundli");
          const kundliRecord = await Kundli.findOne({ where: { requestId: userRequest.id } });
          if (kundliRecord && kundliRecord.charts) rawChartData = kundliRecord.charts;
        } catch (dbErr) {
          console.warn("[Love PDF Service] Failed to load charts from DB:", dbErr.message);
        }
      }
      if (rawChartData) {
        const normalizedCharts = {
          rasiChart: rawChartData.D1 || rawChartData.rasi || null,
          navamsaChart: rawChartData.D9 || rawChartData.navamsa || null,
          ...rawChartData
        };
        reportData = { ...reportData, horoscopeCharts: normalizedCharts };
      }
    }

    console.log("[Love PDF Service] Compiling HTML template...");
    const htmlContent = generateLoveRelationshipHtmlTemplate(reportData, userRequest);

    try {
      const tempDir = path.resolve(__dirname, "../temp");
      if (!fs.existsSync(tempDir)) fs.mkdirSync(tempDir, { recursive: true });
      const htmlFileName = `lovereport_${Date.now()}.html`;
      fs.writeFileSync(path.join(tempDir, htmlFileName), htmlContent, "utf8");
      console.log(`[Love PDF Service] Dumped HTML to temp: ${htmlFileName}`);
    } catch (dumpErr) {
      console.warn("[Love PDF Service] Failed to write HTML dump (safe to ignore):", dumpErr.message);
    }

    console.log("[Love PDF Service] Launching browser...");
    browser = await puppeteer.launch(getPuppeteerLaunchOptions());
    const page = await browser.newPage();

    console.log("[Love PDF Service] Setting page content...");
    await page.setContent(htmlContent, { waitUntil: "networkidle0", timeout: 120000 });

    await page.evaluate(() => {
      if (typeof paginate === "function") {
        paginate();
      }
    });

    console.log("[Love PDF Service] Printing to PDF...");
    const pdfBuffer = await page.pdf({
      format: "A4",
      printBackground: true,
      timeout: 120000,
      margin: { top: 0, right: 0, bottom: 0, left: 0 }
    });

    try { await browser.close(); } catch (e) { /* safe to ignore */ }
    return Buffer.from(pdfBuffer);

  } catch (error) {
    if (browser) { try { await browser.close(); } catch (e) { /* safe to ignore */ } }
    console.error("[Love PDF Service] Error generating PDF:", error);
    throw new Error(`Failed to generate PDF: ${error.message}`);
  }
}

module.exports = { generateLoveRelationshipReportPDF };
