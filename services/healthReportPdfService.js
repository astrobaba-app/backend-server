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
  const matchedPath = candidates.find((c) => fs.existsSync(c));
  return matchedPath || null;
};

const getPuppeteerLaunchOptions = () => {
  const options = {
    headless: true,
    args: [
      "--no-sandbox", "--disable-setuid-sandbox",
      "--disable-dev-shm-usage", "--disable-gpu",
      "--disable-features=Crashpad", "--disable-crash-reporter"
    ],
  };
  const chromePath = getSystemChromePath();
  if (chromePath) options.executablePath = chromePath;
  return options;
};

const imageToDataUri = (fileName) => {
  try {
    const fullPath = path.join(IMAGES_DIR, fileName);
    if (!fs.existsSync(fullPath)) {
      console.warn(`[Health PDF Service] Image not found at ${fullPath}`);
      return "";
    }
    const buffer = fs.readFileSync(fullPath);
    const ext = path.extname(fileName).toLowerCase();
    const mime = ext === ".jpg" || ext === ".jpeg" ? "image/jpeg" : "image/png";
    return `data:${mime};base64,${buffer.toString("base64")}`;
  } catch (error) {
    console.error(`[Health PDF Service] Error reading image ${fileName}:`, error);
    return "";
  }
};

const escapeHtml = (value) =>
  String(value ?? "")
    .replace(/&/g, "&amp;").replace(/</g, "&lt;")
    .replace(/>/g, "&gt;").replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");

const formatDate = (dateStr) => {
  if (!dateStr) return "--";
  try {
    return new Date(dateStr).toLocaleDateString("en-US", { year: "numeric", month: "long", day: "numeric" });
  } catch (e) { return dateStr; }
};

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

// ── Chart rendering (same logic as sade sati, adapted for lavender theme) ────
const SIGN_NAME_TO_NUM = {
  Aries: 1, Taurus: 2, Gemini: 3, Cancer: 4, Leo: 5, Virgo: 6,
  Libra: 7, Scorpio: 8, Sagittarius: 9, Capricorn: 10, Aquarius: 11, Pisces: 12
};
const PLANET_ABBREVIATIONS = {
  Sun: "Su", Moon: "Mo", Mars: "Ma", Mercury: "Me", Jupiter: "Ju", Venus: "Ve",
  Saturn: "Sa", Rahu: "Ra", Ketu: "Ke", Uranus: "Ur", Neptune: "Ne", Pluto: "Pl",
  Ascendant: "Asc", ascendant: "Asc", Lagna: "Asc"
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
  Asc: "#9932CC"
};
const NORTH_INDIAN_HOUSE_POSITIONS = [
  { house: 1, x: 0.5, y: 0.25, numX: 0.5, numY: 0.42 }, { house: 2, x: 0.25, y: 0.1, numX: 0.25, numY: 0.2 },
  { house: 3, x: 0.12, y: 0.25, numX: 0.2, numY: 0.25 }, { house: 4, x: 0.25, y: 0.5, numX: 0.42, numY: 0.5 },
  { house: 5, x: 0.12, y: 0.75, numX: 0.2, numY: 0.75 }, { house: 6, x: 0.25, y: 0.9, numX: 0.25, numY: 0.79 },
  { house: 7, x: 0.5, y: 0.75, numX: 0.5, numY: 0.57 }, { house: 8, x: 0.75, y: 0.9, numX: 0.75, numY: 0.8 },
  { house: 9, x: 0.9, y: 0.75, numX: 0.8, numY: 0.75 }, { house: 10, x: 0.75, y: 0.5, numX: 0.58, numY: 0.5 },
  { house: 11, x: 0.9, y: 0.25, numX: 0.8, numY: 0.25 }, { house: 12, x: 0.75, y: 0.1, numX: 0.75, numY: 0.2 }
];
const formatDegree = (d) => {
  const n = typeof d === "number" ? d : Number(d);
  const safe = !Number.isFinite(n) ? 0 : ((n % 30) + 30) % 30;
  return `${Math.floor(safe)}°${String(Math.floor((safe - Math.floor(safe)) * 60)).padStart(2, "0")}'`;
};

const renderChartSvg = (chartData, fallbackAscSignName, chartTitle) => {
  if (!chartData || !chartData.planets) {
    return `
      <div class="chart-box">
        <div style="font-size:11pt; font-weight:700; color:#000000; margin-bottom:3mm; text-align:center;">${chartTitle}</div>
        <div style="width:280px; height:280px; display:flex; align-items:center; justify-content:center; background:#FCF8E3; border:1px solid #4C4C4C; color:#ff0000; font-size:10pt;">
          Missing ${chartTitle} Data
        </div>
      </div>`;
  }
  const anchorSignNum = chartData.planets.Ascendant?.sign_num || chartData.planets.ascendant?.sign_num || SIGN_NAME_TO_NUM[fallbackAscSignName] || 1;
  const house1Sign = ((anchorSignNum - 1 + 12) % 12) + 1;
  const housePlanetsMap = new Map();
  for (let i = 1; i <= 12; i++) housePlanetsMap.set(i, []);
  Object.entries(chartData.planets).forEach(([planetName, planetData]) => {
    const longitude = planetData.original_longitude ?? planetData.longitude ?? 0;
    const signNum = planetData.sign_num || (Math.floor(longitude / 30) % 12) + 1;
    const degree = planetData.degree ?? (longitude % 30);
    const name = PLANET_ABBREVIATIONS[planetName] || planetName.substring(0, 2);
    let houseNum = planetData.house;
    if (typeof houseNum !== "number" || isNaN(houseNum)) houseNum = ((signNum - house1Sign + 12) % 12) + 1;
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
  for (let house = 1; house <= 12; house++) houseToSignMap[house] = ((house1Sign - 1 + (house - 1)) % 12) + 1;
  const svgW = 393, svgH = 393;
  let markup = "";
  NORTH_INDIAN_HOUSE_POSITIONS.forEach(({ house, x, y, numX, numY }) => {
    const signNum = houseToSignMap[house];
    const planets = housePlanetsMap.get(house) || [];
    markup += `<text x="${(numX * svgW).toFixed(1)}" y="${(numY * svgH).toFixed(1)}" fill="#999999" font-size="9" font-family="Arial,sans-serif" text-anchor="middle" dominant-baseline="middle">${signNum}</text>\n`;
    if (planets.length > 0) {
      let offsetY = -(planets.length - 1) * 6;
      planets.forEach((planet) => {
        const color = PLANET_COLORS[planet.name] || "#333333";
        markup += `<text x="${(x * svgW).toFixed(1)}" y="${(y * svgH + offsetY).toFixed(1)}" fill="${color}" font-size="10" font-family="Arial,sans-serif" font-weight="bold" text-anchor="middle" dominant-baseline="middle">${planet.name} ${formatDegree(planet.degree)}</text>\n`;
        offsetY += 12;
      });
    }
  });
  return `<div class="chart-box"><div style="font-size:11pt; font-weight:700; color:#000000; margin-bottom:3mm; text-align:center;">${chartTitle}</div><svg viewBox="0 0 ${svgW} ${svgH}" style="width:280px;height:280px;background-color:#FCF8E3;box-shadow:0px 4px 12px rgba(0, 0, 0, 0.15);"><rect x="0" y="0" width="${svgW}" height="${svgH}" fill="#FCF8E3" stroke="#4C4C4C" stroke-width="2"/><line x1="0" y1="0" x2="${svgW}" y2="${svgH}" stroke="#4C4C4C" stroke-width="2"/><line x1="${svgW}" y1="0" x2="0" y2="${svgH}" stroke="#4C4C4C" stroke-width="2"/><polygon points="196.5,0 393,196.5 196.5,393 0,196.5" fill="none" stroke="#4C4C4C" stroke-width="2"/>${markup}</svg></div>`;
};

// ── Main HTML template generator ─────────────────────────────────────────────
function generateHealthReportHtml(reportData, userRequest) {
  const { fullName, dateOfbirth, timeOfbirth, placeOfBirth, gender } = userRequest;
  const pred = reportData.predictions || {};
  const astro = reportData.astrologyBasics || {};
  const charts = reportData.horoscopeCharts || {};
  const ri = reportData.reportInput || {};

  const coverUri = imageToDataUri("healthreportfirstpage.jpg");
  const divElemental = imageToDataUri("TheELEMENTALCONSTITUTION.jpg");
  const divAnatomy = imageToDataUri("KalpurushAnatomyScan.jpg");
  const divDiagnosis = imageToDataUri("DeepDiveDiagnosis.jpg");
  const divSleep = imageToDataUri("SleepandPsychologicalAnalysis.jpg");
  const divTiming = imageToDataUri("TimingandManifestation.jpg");
  const divRemedies = imageToDataUri("PrescribedRemedies.jpg");
  const divGuidance = imageToDataUri("Guidance&Conclusion.jpg");

  const formattedDob = formatDate(dateOfbirth);
  const formattedReportDate = formatDate(new Date());
  const age = getAge(dateOfbirth);

  const findKeyDeep = (obj, key) => {
    if (!obj || typeof obj !== "object") return undefined;
    if (key in obj) return obj[key];

    const lowerKey = key.toLowerCase();
    const snakeKey = key.replace(/[A-Z]/g, letter => `_${letter.toLowerCase()}`);
    const camelKey = key.replace(/_([a-z])/g, g => g[1].toUpperCase());

    for (const k of Object.keys(obj)) {
      if (k.toLowerCase() === lowerKey || k === snakeKey || k === camelKey) {
        return obj[k];
      }
    }

    for (const k of Object.keys(obj)) {
      const val = findKeyDeep(obj[k], key);
      if (val !== undefined) return val;
    }
    return undefined;
  };

  const getVal = (pathStr, fallback = "") => {
    try {
      const parts = pathStr.split(".");
      let current = pred;
      let directFound = true;
      for (const part of parts) {
        if (current === null || current === undefined || !(part in current)) {
          directFound = false;
          break;
        }
        current = current[part];
      }
      if (directFound && current !== undefined && current !== null) {
        return current;
      }

      const leafKey = parts[parts.length - 1];
      const deepVal = findKeyDeep(pred, leafKey);
      if (deepVal !== undefined && deepVal !== null) {
        return deepVal;
      }
      return fallback;
    } catch (e) { return fallback; }
  };

  const foundAffirmations = findKeyDeep(pred, "affirmationsList");
  const affirmations = Array.isArray(foundAffirmations) && foundAffirmations.length > 0
    ? foundAffirmations
    : [
      "I nourish my body with warmth, routine, and conscious care each day.",
      "My constitution is my strength, and I honour it with discipline and rest.",
      "I breathe deeply, sleep fully, and awaken restored and renewed.",
      "My digestion is steady, my mind is calm, and my joints are supported.",
      "I choose habits that heal me quietly, each sunrise and each sunset.",
      "My health is my wealth, and I invest in it through consistent daily choices.",
      "I am resilient, recovering with grace, and growing stronger through each phase."
    ];

  const evidence = ri.evidence || {};
  const summary = ri.summary || {};
  const chartSummary = evidence.chart_summary || {};
  const healthFocus = evidence.health_focus || {};
  const timing = evidence.timing || {};
  const remedies = evidence.remedies || {};
  const ashtakSignals = evidence.ashtakavarga_signals || {};

  const D1 = charts.rasiChart || charts.D1 || null;
  const D6 = charts.shastamsaChart || charts.D6 || charts.divisionalCharts?.D6 || null;
  const D9 = charts.navamsaChart || charts.D9 || null;

  const rasiChartSvg = renderChartSvg(D1, astro.ascendant || "Aries", "Rashi Chart (D1)");
  const shastamsaChartSvg = renderChartSvg(D6 || D9, astro.ascendant || "Aries", D6 ? "Shastamsa Chart (D6)" : "Navamsa Chart (D9)");

  // ── Page builder helpers ────────────────────────────────────────────────────
  const createStandardPage = (pageNumber, sectionTitle, eyebrowText, contentHtml, subtitle = "") => `
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
      <div class="page-content">${contentHtml}</div>
      <div class="footer">
        <span class="footer-left">Personalised Health Astrology Report &middot; ${escapeHtml(fullName)}</span>
        ${pageNumber ? `<span class="footer-right">Page ${pageNumber}</span>` : ""}
      </div>
    </div>`;

  const nb = (label, text) => `
    <div class="narrative-block">
      <div class="narrative-label">${escapeHtml(label)}</div>
      <div class="narrative-text">${escapeHtml(text)}</div>
    </div>`;

  const faqNb = (label, text) => `
    <div class="narrative-block" style="margin-bottom: 3.8mm;">
      <div class="narrative-label" style="margin-bottom: 1.2mm; padding-bottom: 0.3mm; font-size: 11.5pt; border-bottom: 1.8px solid var(--theme-lavender);">${escapeHtml(label)}</div>
      <div class="narrative-text" style="font-size: 12.2pt; line-height: 1.5;">${escapeHtml(text)}</div>
    </div>`;

  const createFaqPage = (pageNumber, sectionTitle, eyebrowText, contentHtml, subtitle = "") => `
    <div class="page">
      <div class="header" style="margin-bottom: 3.5mm;">
        <div class="header-eyebrow">
          <span class="eyebrow-line"></span>
          <span class="eyebrow-text">${escapeHtml(eyebrowText)}</span>
        </div>
        <h1 class="header-title">${escapeHtml(sectionTitle)}</h1>
        ${subtitle ? `<p class="header-subtitle">${escapeHtml(subtitle)}</p>` : ""}
        <div class="header-gradient"></div>
      </div>
      <div class="page-content" style="padding-top: 1.5mm;">${contentHtml}</div>
      <div class="footer">
        <span class="footer-left">Personalised Health Astrology Report &middot; ${escapeHtml(fullName)}</span>
        ${pageNumber ? `<span class="footer-right">Page ${pageNumber}</span>` : ""}
      </div>
    </div>`;

  const infoRow = (label, value) => `
    <div class="info-card-row">
      <span class="info-card-label">${escapeHtml(label)}</span>
      <span class="info-card-value">${escapeHtml(value)}</span>
    </div>`;

  const tocRow = (num, title, page) => `
    <div class="toc-row">
      <div class="toc-num">${num}.</div>
      <div class="toc-title">${title}</div>
      <div class="toc-dots"></div>
      <div class="toc-page">Page ${page}</div>
    </div>`;

  const parseScore = (val) => {
    if (typeof val === "number") return val;
    if (typeof val === "string") {
      const match = val.match(/^(\d+)/);
      if (match) {
        return parseInt(match[1], 10);
      }
    }
    return null;
  };

  // ── Score bar helper ────────────────────────────────────────────────────────
  const scoreBar = (label, score, max = 10) => {
    const parsed = parseScore(score);
    const numericScore = parsed !== null && !isNaN(parsed) ? parsed : 7;
    const pct = Math.round((numericScore / max) * 100);
    const color = "var(--theme-lavender)";
    
    // Map score out of 10 to qualitative description
    let ratingText = "Medium";
    if (numericScore >= 9) {
      ratingText = "Very High";
    } else if (numericScore >= 7) {
      ratingText = "High";
    } else if (numericScore >= 5) {
      ratingText = "Medium";
    } else {
      ratingText = "Low";
    }

    return `
      <div style="margin-bottom:3.5mm;">
        <div style="display:flex;justify-content:space-between;margin-bottom:1mm;">
          <span style="font-size:11pt;font-weight:600;color:#000000;">${label}</span>
          <span style="font-size:11pt;font-weight:700;color:#000000;">${ratingText}</span>
        </div>
        <div style="height:8px;background:#E5E7EB;border-radius:4px;overflow:hidden;">
          <div style="width:${pct}%;height:100%;background:${color};border-radius:4px;"></div>
        </div>
      </div>`;
  };

  // ── Build pages ─────────────────────────────────────────────────────────────

  // PAGE 1 — Cover
  const page1 = `
    <div class="img-page-bg bg-cover"></div>`;

  // PAGE 2 — About This Report
  const page2 = createStandardPage(null, "About This Report", "Introduction",
    `<p style="font-size:12.5pt;color:var(--text-main);line-height:1.75;margin-bottom:5mm;text-align:justify;">
      This premium Personalised Health Astrology Report has been crafted using the profound and time-tested principles of Vedic Astrology (Jyotisha) combined with advanced planetary calculations. Jyotisha is a traditional Indian science that views the physical body as an extension of the cosmic order. By analyzing the unique alignments of the stars, sun, moon, and planets at the exact moment and place of your birth, this report translates celestial patterns into highly personalized wellness insights.
    </p>
    <p style="font-size:12.5pt;color:var(--text-main);line-height:1.75;margin-bottom:5mm;text-align:justify;">
      Throughout this guide, you will discover the foundational elemental balances (Pancha Mahabhuta) that govern your physical constitution and metabolic processes. You will gain a deep understanding of your bodily systems through the Kalpurush Anatomy Scan, and explore detailed insights into key health domains including digestion, circulation, sleep, stress response, and musculoskeletal support.
    </p>
    <p style="font-size:12.5pt;color:var(--text-main);line-height:1.75;margin-bottom:5mm;text-align:justify;">
      Furthermore, this report outlines the timing of your health cycles using the Vimshottari Dasha system, pinpointing periods calling for greater mindfulness or lifestyle alignment. Finally, it provides custom spiritual and lifestyle remedies—such as daily mantras, weekly health anchors, dietary guidelines, and a structured 30-day wellness roadmap—to help you cultivate resilience, balance, and lifelong vitality.
    </p>
    <div style="margin-top:6mm;">
      <div class="info-card">
        <div class="info-card-title">How to Navigate Your Guide</div>
        <ul class="bullet-list">
          <li style="font-size:11.5pt;line-height:1.6;">Read each section reflectively, noticing how the planetary trends align with your life experience.</li>
          <li style="font-size:11.5pt;line-height:1.6;">Emphasize preventative care and consistent daily routines as your primary wellness foundation.</li>
          <li style="font-size:11.5pt;line-height:1.6;">Use the 30-day wellness plan as a step-by-step practical checklist for building healthy habits.</li>
          <li style="font-size:11.5pt;line-height:1.6;">Integrate the prescribed spiritual and dietary remedies gradually to support your vital life force.</li>
        </ul>
      </div>
    </div>`);

  // PAGE 2 (Disclaimer)
  const page2Disclaimer = createStandardPage(null, "Disclaimer & Important Notice", "Medical Disclaimer",
    `<p style="font-size:12.5pt;color:var(--text-main);line-height:1.8;margin-bottom:6mm;text-align:justify;">
      The insights, suggestions, and astrological analyses presented in this Personalised Health Astrology Report are intended solely for educational, informational, and general wellness purposes. Vedic astrology is an ancient interpretive science that focuses on energetic tendencies, constitutional indicators, and cosmic timing patterns. Astrological mappings do not predict physical health outcomes with absolute certainty and do not represent medical diagnoses, prescriptions, or clinical assessments.
    </p>
    <div class="disclaimer-box" style="margin-bottom:6mm;font-size:12pt;line-height:1.7;">
      This report does not constitute medical advice, diagnosis, or treatment. It should never be used to self-diagnose or replace the professional judgment, consultation, diagnosis, or care of a qualified and licensed healthcare provider. Always consult a medical doctor or clinical specialist for any health issues, symptoms, or concerns you are experiencing.
    </div>
    <p style="font-size:12.5pt;color:var(--text-main);line-height:1.8;margin-bottom:6mm;text-align:justify;">
      Any holistic suggestions, lifestyle recommendations, diet modifications, mantra recitations, or physical remedies referenced in this document are meant to complement your overall wellbeing. They should never be implemented in lieu of prescribed clinical treatments, medical therapies, or direct interventions from medical professionals.
    </p>
    <p style="font-size:12.5pt;color:var(--text-main);line-height:1.8;text-align:justify;">
      Neither Graho, the authors, nor any affiliated representatives assume any liability or responsibility for any direct, indirect, or consequential health outcomes, actions taken, or lifestyle decisions made by the reader based upon the information contained in this report. By reading this report, you acknowledge and agree to these terms and conditions.
    </p>`);

  // PAGE 3 — TOC
  const page3 = createStandardPage(null, "Table of Contents", "Your Health Journey",
    `<div style="margin-top:-6mm; display: grid; grid-template-columns: 1fr 1fr; gap: 8mm; flex: 1;">
      <div>
        ${tocRow("1", "Personal Health Snapshot", "1")}
        ${tocRow("2", "Executive Summary: Key Insights", "2")}
        ${tocRow("3", "Executive Summary: Constitution", "3")}
        ${tocRow("4", "Birth Details & Chart Summary", "4")}
        ${tocRow("5", "Planetary Periods (Dashas)", "5")}
        ${tocRow("6", "Elemental Constitution Overview", "10")}
        ${tocRow("7", "Fire & Water Elements (Agni/Jal)", "11")}
        ${tocRow("8", "Air & Earth Elements (Vayu/Prithvi)", "12")}
        ${tocRow("9", "Space Element — Akasha", "13")}
        ${tocRow("10", "Kalpurush Anatomy Scan", "14")}
        ${tocRow("11", "Head, Brain & Nervous System", "15")}
        ${tocRow("12", "Heart, Circulation & Skin/Immunity", "16")}
        ${tocRow("13", "Digestive & Structural Systems", "17")}
        ${tocRow("14", "Top Health Themes & Digestion", "18")}
        ${tocRow("15", "Sleep Profile & Analysis", "19")}
        ${tocRow("16", "Sleep Improvement Plan", "20")}
        ${tocRow("17", "Stress & Emotional Regulation", "21")}
        ${tocRow("18", "Evening Routine & Strengths", "22")}
        ${tocRow("19", "Stress Deep Dive & Cardiac", "23")}
      </div>
      <div>
        ${tocRow("20", "Joints, Bones & Posture Analysis", "24")}
        ${tocRow("21", "Skin, Detox & Resilience", "25")}
        ${tocRow("22", "Current Period & Timing Windows", "26")}
        ${tocRow("23", "Life Rhythm & Caution Periods", "27")}
        ${tocRow("24", "Manifestation Through Habits", "28")}
        ${tocRow("25", "Prescribed Remedies", "29")}
        ${tocRow("26", "Weekly Anchors & Diet/Lifestyle", "30")}
        ${tocRow("27", "Mantras & Remedy Matrix", "31")}
        ${tocRow("28", "Body Risk Assessment", "32")}
        ${tocRow("29", "Red Flags & Medical Guidance", "33")}
        ${tocRow("30", "When to See a Doctor & Disclaimer", "34")}
        ${tocRow("31", "30-Day Wellness Blueprint", "35")}
        ${tocRow("32", "30-Day Weekly Focus Plan", "36")}
        ${tocRow("33", "Daily & Weekly Health Checklist", "37")}
        ${tocRow("34", "Health Strengths & Watchouts", "38")}
        ${tocRow("35", "Key Habits & Closing Insights", "39")}
        ${tocRow("36", "Wellness Affirmations — Pt. 1", "40")}
        ${tocRow("37", "Wellness Affirmations — Pt. 2", "41")}
        ${tocRow("38", "Personal Timing Guidance", "42")}
        ${tocRow("39", "Frequently Asked Questions", "43")}
        ${tocRow("40", "Frequently Asked Questions", "44")}
      </div>
    </div>`);

  const dashaPages = [];
  let allDashas = astro.allDashas || [];
  if (!Array.isArray(allDashas) || allDashas.length === 0) {
    const defaultSeq = ['Ketu', 'Venus', 'Sun', 'Moon', 'Mars', 'Rahu', 'Jupiter', 'Saturn', 'Mercury'];
    allDashas = defaultSeq.map(planet => ({
      mahadasha: planet,
      start: new Date().toISOString(),
      end: new Date().toISOString(),
      antardashas: defaultSeq.map(ap => ({
        planet: ap,
        start: new Date().toISOString(),
        end: new Date().toISOString()
      }))
    }));
  }

  for (let i = 0; i < 9; i += 2) {
    const md1 = allDashas[i];
    const md2 = allDashas[i + 1];
    const pageNum = 5 + Math.floor(i / 2);
    
    let contentHtml = `
      <p style="font-size:12.5pt; color:var(--text-muted); line-height:1.6; margin-bottom:4mm; text-align:justify;">
        These planetary periods (Vimshottari Dashas) influence when specific health matters, physical sensitivities, or vital energy shifts may surface in your life. Understanding your Dasha sequence helps reveal the optimal timing for proactive wellness measures, custom dietary/lifestyle alignments, and restorative recovery phases.
      </p>
    `;
    
    const renderDashaBlock = (md) => {
      if (!md) return "";
      return `
        <div style="margin-bottom: 5mm; border: 1.5px solid var(--theme-lavender); border-radius: 8px; overflow: hidden;">
          <div style="background-color: var(--theme-lavender); color: white; display: flex; justify-content: space-between; align-items: center; padding: 2.5mm 4mm;">
            <span style="font-weight: 700; font-size: 11pt; letter-spacing: 1px; text-transform: uppercase;">MAHADASHA: ${escapeHtml(md.mahadasha)}</span>
            <span style="font-size: 9.5pt; background: rgba(255,255,255,0.25); padding: 0.8mm 2.5mm; border-radius: 12px; font-weight: 700;">${formatDate(md.start)} to ${formatDate(md.end)}</span>
          </div>
          <table style="width:100%; border-collapse:collapse; background: white;">
            <thead>
              <tr style="background: var(--theme-lavender-light); border-bottom: 1px solid var(--theme-lavender);">
                <th style="font-size: 9.5pt; padding: 1.8mm 4mm; color: var(--theme-lavender); font-weight: 700; text-align: left; text-transform: uppercase;">Antardasha</th>
                <th style="font-size: 9.5pt; padding: 1.8mm 4mm; color: var(--theme-lavender); font-weight: 700; text-align: left; text-transform: uppercase;">Starts</th>
                <th style="font-size: 9.5pt; padding: 1.8mm 4mm; color: var(--theme-lavender); font-weight: 700; text-align: left; text-transform: uppercase;">Ends</th>
              </tr>
            </thead>
            <tbody>
              ${(md.antardashas || []).map((ad, idx) => `
                <tr style="border-bottom: ${idx === md.antardashas.length - 1 ? 'none' : '1px solid var(--theme-lavender-light)'}; background: ${idx % 2 === 0 ? 'white' : 'var(--theme-lavender-light)'};">
                  <td style="font-size: 9.5pt; padding: 1.8mm 4mm; font-weight: 700; color: black;">${escapeHtml(ad.planet)}</td>
                  <td style="font-size: 9.5pt; padding: 1.8mm 4mm; color: var(--text-muted);">${formatDate(ad.start)}</td>
                  <td style="font-size: 9.5pt; padding: 1.8mm 4mm; color: var(--text-muted);">${formatDate(ad.end)}</td>
                </tr>
              `).join("")}
            </tbody>
          </table>
        </div>
      `;
    };

    contentHtml += renderDashaBlock(md1);
    if (md2) {
      contentHtml += renderDashaBlock(md2);
    }

    dashaPages.push(createStandardPage(pageNum, `Planetary Periods (Dashas) — Part ${Math.floor(i / 2) + 1}`, "Timing & Cycles", contentHtml));
  }

  const page4 = createStandardPage(1, "Personal Health Snapshot", "Executive Summary", `
    <div class="grid-2" style="margin-bottom:4mm;">
      <div class="info-card">
        <div class="info-card-title">Your Health Profile</div>
        ${infoRow("Ascendant (Lagna)", astro.ascendant || "--")}
        ${infoRow("Moon Sign", astro.moonSign || "--")}
        ${infoRow("Moon Nakshatra", astro.nakshatra || "--")}
        ${infoRow("Sun Sign", astro.sunSign || "--")}
        ${infoRow("Current Mahadasha", astro.mahadasha || "--")}
        ${infoRow("Current Antardasha", astro.antardasha || "--")}
      </div>
      <div class="info-card">
        <div class="info-card-title">Constitution & Focus</div>
        ${infoRow("Dominant Elements", (healthFocus.elemental_balance?.dominant_elements || []).join(", ") || "--")}
        ${infoRow("Top Health Themes", (healthFocus.top_themes || []).slice(0, 3).join(", ") || "--")}
        ${infoRow("Strengths", (healthFocus.top_strengths || []).slice(0, 2).join(", ") || "--")}
      </div>
    </div>
    ${nb("Snapshot Interpretation", getVal("executiveSummary.snapshotInterpretation", "A detailed health snapshot will appear here."))}
    ${nb("Your Core Health Story", summary.core_health_story || "")}
  `);

  const page4b = createStandardPage(2, "Executive Summary: Key Insights", "Executive Summary", `
    ${nb("Key Health Strengths", getVal("executiveSummary.topStrengths", "Detailed health strengths will appear here."))}
    ${nb("Key Health Watchouts", getVal("executiveSummary.topWatchouts", "Detailed health watchouts will appear here."))}
  `);

  const page4c = createStandardPage(3, "Executive Summary: Constitution & Phase", "Executive Summary", `
    ${nb("Constitution Overview", getVal("executiveSummary.constitutionOverview", "Constitution overview will appear here."))}
    ${nb("Current Life Phase Health", getVal("executiveSummary.currentPhaseHealth", "Current life phase health will appear here."))}
  `);

  const page5 = createStandardPage(4, "Birth Details & Chart Summary", "Astrological Foundation", `
    <div class="info-card" style="margin-bottom:3mm; padding:2mm 3.5mm;">
      <div style="display:grid; grid-template-columns: repeat(4, 1fr); gap: 2.5mm 3.5mm;">
        <div style="font-size: 10pt; line-height: 1.35; color: var(--text-muted);"><strong>Full Name:</strong> <span style="color:#000000; font-weight:700;">${fullName}</span></div>
        <div style="font-size: 10pt; line-height: 1.35; color: var(--text-muted);"><strong>Date of Birth:</strong> <span style="color:#000000; font-weight:700;">${formattedDob}</span></div>
        <div style="font-size: 10pt; line-height: 1.35; color: var(--text-muted);"><strong>Time of Birth:</strong> <span style="color:#000000; font-weight:700;">${timeOfbirth || "--"}</span></div>
        <div style="font-size: 10pt; line-height: 1.35; color: var(--text-muted);"><strong>Place of Birth:</strong> <span style="color:#000000; font-weight:700;">${placeOfBirth || "--"}</span></div>
        <div style="font-size: 10pt; line-height: 1.35; color: var(--text-muted);"><strong>Gender:</strong> <span style="color:#000000; font-weight:700;">${gender || "--"}</span></div>
        <div style="font-size: 10pt; line-height: 1.35; color: var(--text-muted);"><strong>Age:</strong> <span style="color:#000000; font-weight:700;">${age}</span></div>
        <div style="font-size: 10pt; line-height: 1.35; color: var(--text-muted);"><strong>Ascendant (Lagna):</strong> <span style="color:#000000; font-weight:700;">${astro.ascendant || "--"}</span></div>
        <div style="font-size: 10pt; line-height: 1.35; color: var(--text-muted);"><strong>Moon Sign:</strong> <span style="color:#000000; font-weight:700;">${astro.moonSign || "--"}</span></div>
      </div>
    </div>
    
    <div style="display:flex; justify-content:center; gap:8mm; margin-bottom:3mm;">
      ${rasiChartSvg}
      ${shastamsaChartSvg}
    </div>

    ${nb("Understanding Your Charts", "The Rashi Chart (D1) on the left represents your physical body, overall appearance, and fundamental health constitution. The first house (Lagna) and its ruling planet serve as the primary indicators of your physical vitality and natural resistance to illnesses. The Shastamsa Chart (D6) on the right (falling back to the Navamsa D9 chart if D6 is unavailable in calculations) is the key divisional chart for health analysis in Vedic Astrology, mapping acute and chronic imbalances, obstacles, and systemic vulnerabilities. By evaluating planetary placements across both charts—particularly focusing on the 6th house of disease, the 8th house of chronic conditions, and the 12th house of hospitalization and sleep—we pinpoint specific areas that require conscious daily support. Strong, well-placed planets signify constitutional resilience, while debilitated or afflicted planetary positions indicate areas where natural energies are blocked. Together, these two charts offer a comprehensive diagnostic map, indicating both your physical design and the timing of your health cycles.")}
  `);

  const page6Content = createStandardPage(10, "Elemental Constitution & Daily Patterns", "The Five Elements & Your Health", `
    ${nb("Your Elemental Balance", getVal("elementalConstitution.overallBalance", "Your elemental constitution analysis will appear here."))}
    ${nb("Daily Imbalance Pattern", getVal("elementalConstitution.dailyImbalancePattern", ""))}
  `);

  const page7 = createStandardPage(11, "Fire & Water Elements (Agni & Jal)", "Elemental Analysis", `
    <div style="margin-bottom: 4mm;">
      ${nb("Fire Element in Your Chart", getVal("elementalConstitution.fireElementAnalysis", "Your Fire element analysis will appear here."))}
    </div>
    <div>
      ${nb("Water Element in Your Chart", getVal("elementalConstitution.waterElementAnalysis", "Your Water element analysis will appear here."))}
    </div>
  `);

  const page9 = createStandardPage(12, "Air & Earth Elements (Vayu & Prithvi)", "Elemental Analysis", `
    <div style="margin-bottom: 4mm;">
      ${nb("Air Element in Your Chart", getVal("elementalConstitution.airElementAnalysis", "Your Air element analysis will appear here."))}
    </div>
    <div>
      ${nb("Earth Element in Your Chart", getVal("elementalConstitution.earthElementAnalysis", "Your Earth element analysis will appear here."))}
    </div>
  `);

  const page11 = createStandardPage(13, "Space Element — Akasha", "Elemental Analysis", `
    ${nb("Space Element in Your Chart", getVal("elementalConstitution.spaceElementAnalysis", "Your Space element analysis will appear here."))}
  `);

  const page12 = createStandardPage(14, "Kalpurush Anatomy Scan", "Your Body Map from the Stars", `
    ${nb("Ascendant Body Map", getVal("kalpurushAnatomy.ascendantBodyMap", "Your Kalpurush body map analysis will appear here."))}
  `);

  const page13 = createStandardPage(15, "Head, Brain & Nervous System Analysis", "Kalpurush Anatomy", `
    ${nb("Head & Brain Analysis", getVal("kalpurushAnatomy.headBrainAnalysis", "Head and brain analysis will appear here."))}
    <div style="height: 4mm;"></div>
    ${nb("Nervous System Health", getVal("kalpurushAnatomy.nervousSystemAnalysis", "Nervous system analysis will appear here."))}
  `);

  const page14 = createStandardPage(16, "Heart, Circulation & Skin/Immunity", "Kalpurush Anatomy", `
    ${nb("Heart & Circulation", getVal("kalpurushAnatomy.heartCirculationAnalysis", "Heart and circulation analysis will appear here."))}
    <div style="height: 4mm;"></div>
    ${nb("Skin, Immunity & Resilience", getVal("kalpurushAnatomy.skinImmunityRecoveryAnalysis", "Skin and immunity analysis will appear here."))}
  `);

  const page15 = createStandardPage(17, "Digestive & Structural Systems", "Kalpurush Anatomy", `
    ${nb("Digestive System Deep Dive", getVal("kalpurushAnatomy.digestiveSystemAnalysis", "Digestive system analysis will appear here."))}
    <div style="height: 4mm;"></div>
    ${nb("Bones, Joints & Structural Support", getVal("kalpurushAnatomy.bonesJointsPostureAnalysis", "Bone and joint analysis will appear here."))}
  `);

  const page19 = createStandardPage(18, "Top Health Themes & Digestive Analysis", "Deep Dive Diagnosis", `
    ${nb("Your Top 5 Health Themes Summary", getVal("deepDiveDiagnosis.top5HealthThemesSummary", "Health themes summary will appear here."))}
    <div style="height: 4mm;"></div>
    ${nb("Digestion Deep Dive", getVal("deepDiveDiagnosis.digestiveMetabolicDeepDive", "Digestive analysis will appear here."))}
  `);

  const page21 = createStandardPage(19, "Sleep Profile & Analysis", "Sleep & Psychological Deep Dive", `
    ${nb("Sleep Profile Overview", getVal("sleepPsychologicalAnalysis.sleepProfileOverview", "Sleep profile analysis will appear here."))}
    <div style="height: 4mm;"></div>
    ${nb("Sleep & Restorative Analysis", getVal("deepDiveDiagnosis.sleepRestorativeDeepDive", ""))}
  `);

  const page21b = createStandardPage(20, "Sleep Improvement Plan", "Sleep & Psychological Deep Dive", `
    ${nb("Sleep Improvement Plan", getVal("sleepPsychologicalAnalysis.sleepImprovementPlan", ""))}
  `);

  const page22 = createStandardPage(21, "Stress Response & Emotional Regulation", "Sleep & Psychological Deep Dive", `
    ${nb("Mind Activity & Stress Response", getVal("sleepPsychologicalAnalysis.mindActivityStressResponse", "Stress analysis will appear here."))}
    <div style="height: 4mm;"></div>
    ${nb("Emotional Regulation Pattern", getVal("sleepPsychologicalAnalysis.emotionalRegulationPattern", ""))}
  `);

  const page23 = createStandardPage(22, "Evening Routine & Psychological Strengths", "Sleep & Psychological Deep Dive", `
    ${nb("Evening Routine Design", getVal("sleepPsychologicalAnalysis.eveningRoutineDesign", "Evening routine will appear here."))}
    <div style="height: 4mm;"></div>
    ${nb("Your Psychological Strengths", getVal("sleepPsychologicalAnalysis.psychologicalStrengths", ""))}
  `);

  const page24 = createStandardPage(23, "Stress Deep Dive & Cardiac/Circulation", "Deep Dive Diagnosis", `
    ${nb("Stress & Anxiety Deep Analysis", getVal("deepDiveDiagnosis.stressAnxietyDeepDive", "Stress deep dive will appear here."))}
    <div style="height: 4mm;"></div>
    ${nb("Cardiac & Circulation Analysis", getVal("deepDiveDiagnosis.circulationCardiacDeepDive", "Circulation analysis will appear here."))}
  `);

  const page26 = createStandardPage(24, "Joints, Bones & Posture Analysis", "Deep Dive Diagnosis", `
    ${nb("Bones, Joints & Posture Deep Dive", getVal("deepDiveDiagnosis.jointsBonePostureDeepDive", "Joint analysis will appear here."))}
  `);

  const page27 = createStandardPage(25, "Skin, Detox, Recovery & Resilience", "Deep Dive Diagnosis", `
    ${nb("Skin & Detox Analysis", getVal("deepDiveDiagnosis.skinDetoxDeepDive", "Skin analysis will appear here."))}
    <div style="height: 4mm;"></div>
    ${nb("Recovery & Resilience", getVal("deepDiveDiagnosis.recoveryResilienceDeepDive", ""))}
  `);

  const page28 = createStandardPage(26, "Current Period & Good Timing Windows", "Timing & Manifestation", `
    ${nb("Current Dasha Health Impact", getVal("timingManifestation.currentPeriodHealthSummary", "Current period analysis will appear here."))}
    <div style="height: 4mm;"></div>
    ${nb("Best Periods for Health & Wellness", getVal("timingManifestation.goodTimingWindowsForHealth", "Good timing windows will appear here."))}
  `);

  const page29b = createStandardPage(27, "Life Rhythm & Caution Periods", "Timing & Manifestation", `
    ${nb("Long-Term Life Rhythm", getVal("timingManifestation.longTermLifeRhythm", ""))}
    <div style="height: 4mm;"></div>
    ${nb("Caution Periods for Health", getVal("timingManifestation.cautionPeriodsForHealth", "Caution periods will appear here."))}
  `);

  const page29c = createStandardPage(28, "Manifestation Through Habits", "Timing & Manifestation", `
    ${nb("Manifestation Through Habits", getVal("timingManifestation.manifestationThroughHabits", ""))}
  `);

  const page31 = createStandardPage(29, "Remedy Philosophy & Daily Remedies", "Prescribed Remedies", `
    ${nb("Why These Remedies", getVal("prescribedRemedies.remedyPhilosophy", "Remedy philosophy will appear here."))}
    <div style="height: 4mm;"></div>
    ${nb("Daily Remedy Routine", getVal("prescribedRemedies.dailyRemedyRoutine", "Daily remedies will appear here."))}
  `);

  const page33 = createStandardPage(30, "Weekly Anchors & Diet/Lifestyle Remedies", "Prescribed Remedies", `
    ${nb("Weekly Remedy Plan", getVal("prescribedRemedies.weeklyRemedies", "Weekly remedies will appear here."))}
    <div style="height: 4mm;"></div>
    ${nb("Diet & Lifestyle Guidance", getVal("prescribedRemedies.dietLifestyleRemedies", "Diet and lifestyle remedies will appear here."))}
  `);

  const page35 = createStandardPage(31, "Mantras & Personalized Remedy Matrix", "Prescribed Remedies", `
    ${nb("Mantras & Spiritual Practice", getVal("prescribedRemedies.mantrasAndSpiritualRemedies", "Spiritual remedies will appear here."))}
    <div style="height: 4mm;"></div>
    ${nb("Remedy Matrix Overview", getVal("prescribedRemedies.remedyMatrix", "Remedy matrix will appear here."))}
    <div class="table-wrap" style="margin-top:4mm;">
      <table class="premium-table">
        <thead><tr><th>Health Area</th><th>Aligned Practice</th><th>Astrological Archetype</th></tr></thead>
        <tbody>
          <tr><td>Digestion & Metabolism</td><td>Warm meals, mindful eating</td><td>Sun / Agni archetypes</td></tr>
          <tr><td>Sleep & Nervous Calm</td><td>Fixed screen-free evening routine</td><td>Moon / Soma archetypes</td></tr>
          <tr><td>Stress & Mental Energy</td><td>Conscious breathing, nature walks</td><td>Mercury / Vayu archetypes</td></tr>
          <tr><td>Structure & Resilience</td><td>Gentle daily stretching, posture care</td><td>Saturn / Prithvi archetypes</td></tr>
        </tbody>
      </table>
    </div>
  `);

  const page37 = createStandardPage(32, "Body Risk Assessment", "Wellness Score Dashboard", `
    ${nb("Risk Scores Interpretation", getVal("bodyRiskScores.scoresInterpretation", "Body risk score interpretation will appear here."))}
    <div style="margin-top:4mm;">
      ${scoreBar("Digestive Health", getVal("bodyRiskScores.digestiveScore", 8))}
      ${scoreBar("Sleep Quality", getVal("bodyRiskScores.sleepScore", 7))}
      ${scoreBar("Stress Levels", getVal("bodyRiskScores.stressScore", 7))}
      ${scoreBar("Circulation", getVal("bodyRiskScores.circulationScore", 6))}
      ${scoreBar("Joints & Posture", getVal("bodyRiskScores.jointsScore", 6))}
      ${scoreBar("Skin & Immunity", getVal("bodyRiskScores.skinScore", 5))}
      ${scoreBar("Recovery & Resilience", getVal("bodyRiskScores.recoveryScore", 8))}
    </div>
    <p style="font-size:10pt;color:var(--text-muted);margin-top:3mm;">Note: Scores indicate sensitivity level — higher score means this area needs more attention and support.</p>
  `);

  const page38 = createStandardPage(33, "Red Flags & Medical Checkup Guidance", "Health Responsibility", `
    ${nb("What Astrology Can Suggest", getVal("redFlagsAndCare.whatAstrologyCanSuggest", "Professional care guidance will appear here."))}
    ${nb("Medical Checkup Guidance", getVal("redFlagsAndCare.medicalCheckupGuidance", "Medical checkup guidance will appear here."))}
  `);

  const page38b = createStandardPage(34, "When to See a Doctor & Disclaimer", "Health Responsibility", `
    ${nb("When to See a Doctor", getVal("redFlagsAndCare.whenToSeeADoctor", ""))}
    <div style="margin-top: 8mm; font-size: 11.5pt; color: var(--text-muted); line-height: 1.6; text-align: justify; font-style: italic; border-top: 1px dashed var(--theme-lavender); padding-top: 5mm;">
      ${escapeHtml(getVal("redFlagsAndCare.responsibleDisclaimer", ""))}
    </div>
  `);

  const page39 = createStandardPage(35, "30-Day Wellness Blueprint", "Your Personal Health Blueprint", `
    ${nb("30-Day Plan Overview", getVal("wellnessPlan.thirtyDayPlanOverview", "30-day wellness plan will appear here."))}
  `);

  const page39b = createStandardPage(36, "30-Day Weekly Focus Plan", "Your Personal Health Blueprint", `
    <div class="grid-2" style="margin-top:3mm;">
      <div class="info-card">
        <div class="info-card-title">Week 1 — Foundation</div>
        <p style="font-size:11.5pt;color:var(--text-main);">${escapeHtml(getVal("wellnessPlan.week1Focus", "Fix sleep schedule, start warm water habit, 10-min morning stretch"))}</p>
      </div>
      <div class="info-card">
        <div class="info-card-title">Week 2 — Digestion</div>
        <p style="font-size:11.5pt;color:var(--text-main);">${escapeHtml(getVal("wellnessPlan.week2Focus", "Regularize meal timing, add warm breakfast, reduce cold foods"))}</p>
      </div>
      <div class="info-card">
        <div class="info-card-title">Week 3 — Movement</div>
        <p style="font-size:11.5pt;color:var(--text-main);">${escapeHtml(getVal("wellnessPlan.week3Focus", "Daily 20-minute walk, add yoga or stretching, breathwork practice"))}</p>
      </div>
      <div class="info-card">
        <div class="info-card-title">Week 4 — Integration</div>
        <p style="font-size:11.5pt;color:var(--text-main);">${escapeHtml(getVal("wellnessPlan.week4Focus", "Review progress, extend habits, add mantra practice, digital detox"))}</p>
      </div>
    </div>
  `);

  const page40 = createStandardPage(37, "Daily & Weekly Health Checklist", "30-Day Wellness Plan", `
    ${nb("Daily Checklist", getVal("wellnessPlan.dailyHealthChecklist", "Daily checklist will appear here."))}
    <div class="grid-2" style="margin-top:3mm;">
      <div class="info-card">
        <div class="info-card-title">Daily Must-Dos</div>
        ${["Morning sunlight (10 min)", "Warm water on waking", "Consistent meal times", "20-min body movement", "Screen off before sleep", "8 hours of sleep"].map(i =>
          `<div style="font-size:11pt;color:var(--text-main);padding:1.5mm 0;border-bottom:1px solid #E5E7EB;">&check; ${escapeHtml(i)}</div>`
        ).join("")}
      </div>
      <div class="info-card">
        <div class="info-card-title">Weekly Must-Dos</div>
        ${["Nature walk (30 min)", "Digital detox block", "Journaling session", "Review sleep pattern", "Mantra or prayer ritual", "One full rest recovery day"].map(i =>
          `<div style="font-size:11pt;color:var(--text-main);padding:1.5mm 0;border-bottom:1px solid #E5E7EB;">&check; ${escapeHtml(i)}</div>`
        ).join("")}
      </div>
    </div>
  `);

  const page41 = createStandardPage(38, "Your Top 5 Health Strengths & Watchouts", "Final Summary", `
    ${nb("Your Top 5 Health Strengths", getVal("finalSummary.top5Strengths", "Your strengths summary will appear here."))}
    ${nb("Your Top 5 Health Watchouts", getVal("finalSummary.top5Watchouts", ""))}
  `);

  const page42 = createStandardPage(39, "Key Habits & Closing Insights", "Final Summary", `
    ${nb("Top 5 Habits to Build Starting Now", getVal("finalSummary.top5HabitsToStart", "Top habits will appear here."))}
    ${nb("Closing Insight", getVal("finalSummary.closingInsight", ""))}
    <div style="margin-top:4mm;padding:4mm;background:#F3F4F6;border-radius:10px;border:1.5px solid #000000;">
      <p style="font-size:12pt;font-style:italic;color:#000000;line-height:1.65;text-align:center;">${escapeHtml(getVal("finalSummary.upliftingClosingMessage", "Your stars show strength, discipline, and the potential for vibrant health. Trust the wisdom of your chart and the power of daily consistent action."))}</p>
    </div>
  `);

  const page43 = createStandardPage(40, "Wellness Affirmations — Part 1", "Daily Practice", `
    <div style="margin-top:2mm;">
      ${affirmations.slice(0, 3).map((aff, i) => `
        <div style="margin-bottom:4mm;padding:4mm 4.5mm;background:${i % 2 === 0 ? "#FAFAFA" : "#F3F4F6"};border-left:4px solid #000000;border-radius:0 8px 8px 0;">
          <div style="font-size:9pt;font-weight:700;color:#6B7280;letter-spacing:1px;margin-bottom:1mm;">AFFIRMATION ${i + 1}</div>
          <p style="font-size:12pt;font-style:italic;color:#000000;line-height:1.55;">&ldquo;${escapeHtml(aff)}&rdquo;</p>
        </div>`
      ).join("")}
    </div>
  `);

  const page43b = createStandardPage(41, "Wellness Affirmations — Part 2", "Daily Practice", `
    <div style="margin-top:2mm;">
      ${affirmations.slice(3, 6).map((aff, i) => `
        <div style="margin-bottom:4mm;padding:4mm 4.5mm;background:${i % 2 === 0 ? "#FAFAFA" : "#F3F4F6"};border-left:4px solid #000000;border-radius:0 8px 8px 0;">
          <div style="font-size:9pt;font-weight:700;color:#6B7280;letter-spacing:1px;margin-bottom:1mm;">AFFIRMATION ${i + 4}</div>
          <p style="font-size:12pt;font-style:italic;color:#000000;line-height:1.55;">&ldquo;${escapeHtml(aff)}&rdquo;</p>
        </div>`
      ).join("")}
    </div>
  `);

  const page44 = createStandardPage(42, "Personal Timing Guidance", "Timing & Manifestation", `
    ${nb("Personal Timing Summary", getVal("timingManifestation.personalTimingGuidance", "Timing guidance will appear here."))}
    <div class="info-card" style="margin-top:3mm;">
      <div class="info-card-title">Next 12 Months Focus Areas</div>
      ${(timing.next_12_month_focus || []).slice(0, 3).map(f => `
        <div style="font-size:11pt;color:var(--text-main);padding:1.2mm 0;border-bottom:1px solid #E5E7EB;">&mdash; ${escapeHtml(f)}</div>
      `).join("")}
    </div>
  `);

  const page45 = createFaqPage(43, "Frequently Asked Questions (Part 1)", "Health FAQs", `
    ${faqNb("What are the strongest health traits shown in my birth chart?", getVal("faqAnswers.strongestHealthTraits", "Your chart indicates natural constitutional strengths and strong recovery factors."))}
    ${faqNb("Which areas of my health require the most attention according to my chart?", getVal("faqAnswers.attentionRequiredAreas", "Certain planetary placements point to areas requiring conscious protective focus."))}
    ${faqNb("Which body systems are naturally stronger, and which are more sensitive?", getVal("faqAnswers.bodySystemsSensitivity", "Your physical mapping shows structural systems with varied sensitivity scores."))}
    ${faqNb("How does my elemental constitution influence my overall health and vitality?", getVal("faqAnswers.elementalConstitutionInfluence", "Your dominant elements guide your vital energies and seasonal health patterns."))}
    ${faqNb("What does my birth chart reveal about my digestion and metabolism?", getVal("faqAnswers.digestionMetabolismIndicator", "Astrological factors influence your internal fire, absorption, and metabolic rate."))}
    ${faqNb("How do planetary influences affect my stress levels and emotional well-being?", getVal("faqAnswers.stressEmotionalWellBeing", "Moon and emotional houses govern mental calm, sleep, and stress response."))}
  `);

  const page46 = createFaqPage(44, "Frequently Asked Questions (Part 2)", "Health FAQs", `
    ${faqNb("What does my chart indicate about my sleep quality and recovery patterns?", getVal("faqAnswers.sleepQualityRecovery", "Sleep quality is tied to the 12th house and lunar balance in your chart."))}
    ${faqNb("Are there any recurring health patterns or lifestyle habits I should be mindful of?", getVal("faqAnswers.habitsLifestylePatterns", "Your natal trends show routine-based patterns that affect chronic resilience."))}
    ${faqNb("Which periods of life are astrologically more favorable for improving my health?", getVal("faqAnswers.favorablePeriodsHealth", "Active Dashas and auspicious transits mark periods of physical regeneration."))}
    ${faqNb("What daily habits and lifestyle changes can best support my long-term wellness?", getVal("faqAnswers.longTermWellnessHabits", "Daily grounding habits and custom diet modifications build lasting vitality."))}
    ${faqNb("Which spiritual or astrological remedies are most beneficial for maintaining good health?", getVal("faqAnswers.astrologicalRemediesMaintenance", "Prescribed mantras, weekly charity anchors, and gemstone care reinforce health."))}
    ${faqNb("What are the key health strengths, watchouts, and preventive measures suggested by my chart?", getVal("faqAnswers.preventiveMeasuresStrengths", "A summary of defensive health parameters and wellness measures based on your chart."))}
  `);

  // ── CSS ──────────────────────────────────────────────────────────────────────
  const css = `
    :root {
      --theme-lavender: #7A60A0;
      --theme-lavender-light: #F2EEF9;
      --white: #FFFFFF;
      --text-main: #000000;
      --text-muted: #4A4A4A;
    }
    @page { size: A4; margin: 0; }
    * { box-sizing: border-box; margin: 0; padding: 0; }
    body {
      background: var(--white);
      color: var(--text-main);
      font-family: 'Georgia', 'Times New Roman', serif;
      -webkit-print-color-adjust: exact;
      print-color-adjust: exact;
    }
    .page {
      width: 210mm; height: 297mm;
      box-sizing: border-box;
      padding: 10mm 12mm 8mm 12mm;
      position: relative;
      page-break-after: always;
      page-break-inside: avoid;
      display: flex;
      flex-direction: column;
      background-color: var(--white);
      overflow: hidden;
    }
    .img-page-bg {
      width: 210mm; height: 297mm;
      box-sizing: border-box;
      page-break-after: always;
      background-size: 100% 100%;
      background-position: center;
      background-repeat: no-repeat;
      display: block;
      position: relative;
    }
    .bg-cover { background-image: url('${coverUri}'); }
    .bg-div-elemental { background-image: url('${divElemental}'); }
    .bg-div-anatomy { background-image: url('${divAnatomy}'); }
    .bg-div-diagnosis { background-image: url('${divDiagnosis}'); }
    .bg-div-sleep { background-image: url('${divSleep}'); }
    .bg-div-timing { background-image: url('${divTiming}'); }
    .bg-div-remedies { background-image: url('${divRemedies}'); }
    .bg-div-guidance { background-image: url('${divGuidance}'); }

    .header { margin-bottom: 5mm; }
    .header-eyebrow { display:flex;align-items:center;gap:3mm;margin-bottom:1.5mm; }
    .eyebrow-line { width:8mm;height:2.5px;background:var(--theme-lavender);border-radius:2px; }
    .eyebrow-text { font-size:9.5pt;font-weight:700;text-transform:uppercase;letter-spacing:2px;color:var(--theme-lavender); }
    .header-title { font-size:20pt;font-weight:800;color:var(--theme-lavender);letter-spacing:-0.2px;margin-bottom:0.5mm; }
    .header-subtitle { font-size:11pt;color:var(--text-muted);font-weight:400; }
    .header-gradient { height:2px;background:var(--theme-lavender);margin-top:2.5mm; }

    .footer {
      margin-top:auto;padding-top:1.5mm;
      border-top:1.5px solid var(--theme-lavender);
      display:flex;justify-content:space-between;align-items:center;
      font-size:8.5pt;color:var(--text-muted);
    }
    .footer-left { font-weight:500; }
    .footer-right { font-weight:700;color:var(--theme-lavender); }

    .page-content { flex:1;display:flex;flex-direction:column;justify-content:flex-start; padding-top: 3mm; }

    .narrative-block { margin-bottom:5mm; }
    .narrative-label { font-size:11.5pt;font-weight:700;text-transform:uppercase;letter-spacing:1.5px;color:var(--theme-lavender);margin-bottom:2mm;padding-bottom:0.5mm;border-bottom:2px solid var(--theme-lavender); }
    .narrative-text { font-size:12.5pt;color:var(--text-main);line-height:1.6;text-align:justify; }

    .grid-2 { display:grid;grid-template-columns:1fr 1fr;gap:4mm;margin-bottom:2.5mm; }

    .info-card { background:var(--white);border:1.5px solid var(--theme-lavender);border-radius:8px;padding:2mm 3.5mm;margin-bottom:2mm; }
    .info-card-title { font-size:10.5pt;font-weight:700;text-transform:uppercase;letter-spacing:1.5px;color:var(--theme-lavender);margin-bottom:1.5mm;padding-bottom:0.5mm;border-bottom:1.5px solid var(--theme-lavender); }
    .info-card-row { display:flex;justify-content:space-between;align-items:flex-start;padding:1.2mm 0;border-bottom:1px solid var(--theme-lavender-light);gap:2mm; }
    .info-card-row:last-child { border-bottom:none; }
    .info-card-label { font-size:10.5pt;color:var(--text-muted);font-weight:500; }
    .info-card-value { font-size:10.5pt;font-weight:700;color:#000000;text-align:right; }

    .toc-row {
      display: flex;
      align-items: baseline;
      padding: 1.0mm 0;
      border-bottom: 1px solid var(--theme-lavender-light);
    }
    .toc-num {
      font-size: 11.5pt;
      font-weight: 700;
      color: var(--theme-lavender);
      width: 10mm;
      flex-shrink: 0;
    }
    .toc-title {
      font-size: 11pt;
      font-weight: 500;
      color: var(--text-main);
      flex: 1;
    }
    .toc-dots {
      flex: 1;
      border-bottom: 1.5px dotted #D1D5DB;
      margin: 0 4mm;
    }
    .toc-page {
      font-size: 11pt;
      font-weight: 700;
      color: var(--text-main);
      width: 15mm;
      text-align: right;
      flex-shrink: 0;
    }

    .table-wrap { border:1.5px solid var(--theme-lavender);border-radius:8px;overflow:hidden;margin-top:2mm;margin-bottom:2mm; }
    .premium-table { width:100%;border-collapse:collapse; }
    .premium-table th { background:var(--theme-lavender);color:var(--white);font-size:10pt;font-weight:700;text-transform:uppercase;letter-spacing:1px;padding:1.5mm 2.5mm;text-align:left;border:none; }
    .premium-table td { padding:1.2mm 2.5mm;font-size:10.5pt;border-bottom:1px solid var(--theme-lavender-light);vertical-align:middle;line-height:1.4;color:var(--text-main); }
    .premium-table tr:last-child td { border-bottom:none; }
    .premium-table tr:nth-child(even) td { background:var(--theme-lavender-light); }

    .bullet-list { margin:1.5mm 0;padding-left:4mm; }
    .bullet-list li { margin-bottom:1mm;font-size:10.5pt;line-height:1.45;color:var(--text-main); }
    .bullet-list li::marker { color:var(--theme-lavender); }

    .disclaimer-box { border:2px dashed var(--theme-lavender);background:var(--theme-lavender-light);padding:3.5mm;border-radius:8px;text-align:center;font-weight:600;color:#000000;margin-top:2.5mm;font-size:11pt;line-height:1.45; }

    .chart-box { display:flex;flex-direction:column;align-items:center;margin-bottom:2mm; }
  `;

  return `<!DOCTYPE html>
<html>
<head>
  <meta charset="utf-8">
  <title>Premium Health Astrology Report — ${escapeHtml(fullName)}</title>
  <link href="https://fonts.googleapis.com/css2?family=Georgia&display=swap" rel="stylesheet">
  <style>${css}</style>
</head>
<body>
  ${page1}
  ${page2}
  ${page2Disclaimer}
  ${page3}
  ${page4}
  ${page4b}
  ${page4c}
  ${page5}
  ${dashaPages.join("\n")}
  <div class="img-page-bg bg-div-elemental"></div>
  ${page6Content}
  ${page7}
  ${page9}
  ${page11}
  <div class="img-page-bg bg-div-anatomy"></div>
  ${page12}
  ${page13}
  ${page14}
  ${page15}
  <div class="img-page-bg bg-div-diagnosis"></div>
  ${page19}
  <div class="img-page-bg bg-div-sleep"></div>
  ${page21}
  ${page21b}
  ${page22}
  ${page23}
  ${page24}
  ${page26}
  ${page27}
  <div class="img-page-bg bg-div-timing"></div>
  ${page28}
  ${page29b}
  ${page29c}
  <div class="img-page-bg bg-div-remedies"></div>
  ${page31}
  ${page33}
  ${page35}
  ${page37}
  ${page38}
  ${page38b}
  ${page39}
  ${page39b}
  ${page40}
  ${page41}
  ${page42}
  ${page43}
  ${page43b}
  ${page44}
  ${page45}
  ${page46}
</body>
</html>`;
}

// ── Main PDF generation function ─────────────────────────────────────────────
async function generateHealthReportPDF(reportData, userRequest) {
  console.log(`[Health PDF Service] Starting PDF generation for ${userRequest?.fullName || "client"}...`);

  const htmlContent = generateHealthReportHtml(reportData, userRequest);

  const launchOptions = getPuppeteerLaunchOptions();
  const browser = await puppeteer.launch(launchOptions);

  try {
    const page = await browser.newPage();
    await page.setContent(htmlContent, {
      waitUntil: "networkidle0",
      timeout: 90000,
    });

    const pdfBuffer = await page.pdf({
      format: "A4",
      printBackground: true,
      margin: { top: "0mm", right: "0mm", bottom: "0mm", left: "0mm" },
    });

    console.log(`[Health PDF Service] PDF generated successfully (${Math.round(pdfBuffer.length / 1024)} KB)`);
    return Buffer.from(pdfBuffer);
  } finally {
    await browser.close();
  }
}

module.exports = { generateHealthReportPDF };
