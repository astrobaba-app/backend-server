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

const imageToDataUri = (fileName) => {
    try {
        const fullPath = path.join(IMAGES_DIR, fileName);
        if (!fs.existsSync(fullPath)) {
            console.warn(`[Yearly PDF Service] Image not found at ${fullPath}`);
            return "";
        }
        const buffer = fs.readFileSync(fullPath);
        const ext = path.extname(fileName).toLowerCase();
        const mime = ext === ".jpg" || ext === ".jpeg" ? "image/jpeg" : "image/png";
        return `data:${mime};base64,${buffer.toString("base64")}`;
    } catch (error) {
        console.error(`[Yearly PDF Service] Error reading image ${fileName}:`, error);
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
            year: "numeric",
            month: "long",
            day: "numeric"
        });
    } catch (e) {
        return dateStr;
    }
};

const renderChartSvg = (chartData, fallbackAscSignName, chartTitle) => {
    if (!chartData || !chartData.planets) {
        return `
        <div class="chart-box">
          <div style="font-size:11pt; font-weight:700; color:var(--dark-blue); margin-bottom:3mm; text-align:center;">${chartTitle}</div>
          <div style="width:280px; height:280px; display:flex; align-items:center; justify-content:center; background:#FCF8E3; border:1px solid #4C4C4C; color:#ff0000; font-size:10pt;">
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
        elementsMarkup += `<text x="${sX.toFixed(1)}" y="${sY.toFixed(1)}" fill="#999999" font-size="9" font-family="Arial" text-anchor="middle" dominant-baseline="middle">${signNum}</text>\n`;

        // Planets text elements
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
      <div style="font-size:11pt; font-weight:700; color:var(--dark-blue); margin-bottom:3mm; text-align:center;">${chartTitle}</div>
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

const getHouseStrength = (score) => {
    if (score >= 30) return "Very Strong";
    if (score >= 28) return "Strong";
    if (score >= 24) return "Average";
    return "Weak";
};

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

/**
 * Generate HTML template matching the reference yellow/dark blue theme
 */
function generateHTMLTemplate(reportData, userRequest) {
    const { fullName, dateOfbirth, timeOfbirth, placeOfBirth, gender } = userRequest;
    const year = reportData.year || new Date().getFullYear();

    const astro = reportData.astrologicalDetails || {};
    const dasha = reportData.dashaCycles || {};
    const intro = reportData.introContent || {};
    const charts = reportData.horoscopeCharts || {};

    // Base64 Images
    const coverImg = imageToDataUri("Yearly Report first page.png");
    const endImg = imageToDataUri("daily_end.png");
    const cosmicImg = imageToDataUri("cosmic.png");
    const transitsImg = imageToDataUri("transits.png");
    const auspiciousImg = imageToDataUri("calandar.png");
    const careerImg = imageToDataUri("career.png");
    const wealthImg = imageToDataUri("wealth.png");
    const healthImg = imageToDataUri("health.png");
    const relationImg = imageToDataUri("relationship.png");
    const remediesImg = imageToDataUri("remedies.png");
    const summaryImg = imageToDataUri("summary.png");

    const MONTHS = [
        "January", "February", "March", "April", "May", "June",
        "July", "August", "September", "October", "November", "December"
    ];

    // Pre-calculate month covers CSS rules to write them only once in the template
    const monthCoversCssRules = MONTHS.map(monthName => {
        const uri = imageToDataUri(`${monthName}.png`);
        return `.bg-month-${monthName.toLowerCase()} { background-image: url('${uri}'); }`;
    }).join("\n");

    // Generate monthly prediction pages (19 pages per month)
    let monthsHtml = "";
    let pageNum = 16; // Table of Contents starts January at 16

    MONTHS.forEach((monthName, monthIdx) => {
        const pred = reportData.predictions?.[monthName] || {};
        const timing = reportData.monthlyTimingData?.[monthName] || {};

        const cosmic = pred.cosmicOverview || {};
        const transit = pred.transitTable || {};
        const auspicious = pred.auspiciousDays || {};
        const career = pred.career || {};
        const wealth = pred.wealth || {};
        const health = pred.health || {};
        const relationship = pred.relationship || {};
        const remedies = pred.remedies || {};
        const summary = pred.overallSummary || {};

        // Month Cover Page (pageNum)
        monthsHtml += `
        <!-- Page ${pageNum}: ${monthName} Cover -->
        <div class="img-page-bg bg-month-${monthName.toLowerCase()}"></div>
        `;
        pageNum++;

        // Topic 1: Cosmic Overview Cover Page (pageNum)
        monthsHtml += `
        <!-- Page ${pageNum}: Cosmic Overview Cover -->
        <div class="img-page-bg bg-cosmic"></div>
        `;
        pageNum++;

        // Topic 1: Cosmic Overview Content (pageNum)
        monthsHtml += `
        <!-- Page ${pageNum}: Cosmic Overview Content -->
        <div class="page">
          <div class="month-banner">
            <div>
              <div class="month-banner-title">${monthName} ${year}</div>
              <div class="month-banner-section">Cosmic Overview</div>
            </div>
            <div style="font-size:28pt; opacity:0.25;">🌌</div>
          </div>
          <div style="flex:1;">
            <div class="narrative-block"><div class="narrative-label">Current Cosmic Energy</div><div class="narrative-text">${escapeHtml(safeString(cosmic.currentCosmicEnergy))}</div></div>
            <div class="narrative-block"><div class="narrative-label">Major Yogas</div><div class="narrative-text">${escapeHtml(safeString(cosmic.majorYogas))}</div></div>
            <div class="narrative-block"><div class="narrative-label">Planetary Strengths</div><div class="narrative-text">${escapeHtml(safeString(cosmic.planetaryStrengths))}</div></div>
            <div class="narrative-block"><div class="narrative-label">House Scores</div><div class="narrative-text">${escapeHtml(safeString(cosmic.houseScores))}</div></div>
            <div class="narrative-block"><div class="narrative-label">Spiritual Guidance</div><div class="narrative-text">${escapeHtml(safeString(cosmic.spiritualGuidance))}</div></div>
            <div class="tldr-box"><div class="tldr-label">Key Takeaway</div><div class="tldr-text">${escapeHtml(safeString(cosmic.tldr))}</div></div>
          </div>
          <div class="footer">
            <span class="footer-left">Vedic Astrology Roadmap ${year} · ${escapeHtml(fullName)}</span>
            <span class="footer-right">Page ${pageNum}</span>
          </div>
        </div>
        `;
        pageNum++;

        // Topic 2: Transit Focus Cover Page (pageNum)
        monthsHtml += `
        <!-- Page ${pageNum}: Transit Focus Cover -->
        <div class="img-page-bg bg-transits"></div>
        `;
        pageNum++;

        // Topic 2: Transit Focus Content (pageNum)
        monthsHtml += `
        <!-- Page ${pageNum}: Transit Focus Content -->
        <div class="page">
          <div class="month-banner">
            <div>
              <div class="month-banner-title">${monthName} ${year}</div>
              <div class="month-banner-section">Transit Focus</div>
            </div>
            <div style="font-size:28pt; opacity:0.25;">🔄</div>
          </div>
          <div style="flex:1;">
            <div class="narrative-block"><div class="narrative-label">Astrological Overview</div><div class="narrative-text">${escapeHtml(safeString(transit.astrologicalOverview))}</div></div>
            <div class="narrative-block"><div class="narrative-label">Planetary Transits</div><div class="narrative-text">${escapeHtml(safeString(transit.planetaryTransits))}</div></div>
            <div class="narrative-block"><div class="narrative-label">Current Dasha Analysis</div><div class="narrative-text">${escapeHtml(safeString(transit.currentDashaAnalysis))}</div></div>
            <div class="narrative-block"><div class="narrative-label">Golden Windows</div><div class="narrative-text">${escapeHtml(safeString(transit.goldenWindows))}</div></div>
            <div class="narrative-block"><div class="narrative-label">Remedial Guidance</div><div class="narrative-text">${escapeHtml(safeString(transit.remedialGuidance))}</div></div>
            <div class="tldr-box"><div class="tldr-label">Key Takeaway</div><div class="tldr-text">${escapeHtml(safeString(transit.tldr))}</div></div>
          </div>
          <div class="footer">
            <span class="footer-left">Vedic Astrology Roadmap ${year} · ${escapeHtml(fullName)}</span>
            <span class="footer-right">Page ${pageNum}</span>
          </div>
        </div>
        `;
        pageNum++;

        // Topic 3: Auspicious Days Cover Page (pageNum)
        monthsHtml += `
        <!-- Page ${pageNum}: Auspicious Days Cover -->
        <div class="img-page-bg bg-auspicious"></div>
        `;
        pageNum++;

        // Topic 3: Auspicious Days Content (pageNum)
        monthsHtml += `
        <!-- Page ${pageNum}: Auspicious Days Content -->
        <div class="page">
          <div class="month-banner">
            <div>
              <div class="month-banner-title">${monthName} ${year}</div>
              <div class="month-banner-section">Auspicious Days</div>
            </div>
            <div style="font-size:28pt; opacity:0.25;">📅</div>
          </div>
          <div style="flex:1;">
            <div class="narrative-block"><div class="narrative-label">Favorable Timing</div><div class="narrative-text">${escapeHtml(safeString(auspicious.favorableTiming))}</div></div>
            <div class="narrative-block"><div class="narrative-label">Unfavorable Timing</div><div class="narrative-text">${escapeHtml(safeString(auspicious.unfavorableTiming))}</div></div>
            <div class="narrative-block"><div class="narrative-label">Best Dates for Major Actions</div><div class="narrative-text">${escapeHtml(safeString(auspicious.bestDatesAction))}</div></div>
            <div class="narrative-block"><div class="narrative-label">Specific Days to Avoid Decisions</div><div class="narrative-text">${escapeHtml(safeString(auspicious.daysAvoid))}</div></div>
            <div class="narrative-block"><div class="narrative-label">Fasting & Ritual Guidance</div><div class="narrative-text">${escapeHtml(safeString(auspicious.remedialGuidance))}</div></div>
            <div class="tldr-box"><div class="tldr-label">Key Takeaway</div><div class="tldr-text">${escapeHtml(safeString(auspicious.tldr))}</div></div>
          </div>
          <div class="footer">
            <span class="footer-left">Vedic Astrology Roadmap ${year} · ${escapeHtml(fullName)}</span>
            <span class="footer-right">Page ${pageNum}</span>
          </div>
        </div>
        `;
        pageNum++;

        // Topic 4: Career Cover Page (pageNum)
        monthsHtml += `
        <!-- Page ${pageNum}: Career Cover -->
        <div class="img-page-bg bg-career"></div>
        `;
        pageNum++;

        // Topic 4: Career Content (pageNum)
        monthsHtml += `
        <!-- Page ${pageNum}: Career Content -->
        <div class="page">
          <div class="month-banner">
            <div>
              <div class="month-banner-title">${monthName} ${year}</div>
              <div class="month-banner-section">Career & Professional Growth</div>
            </div>
            <div style="font-size:28pt; opacity:0.25;">💼</div>
          </div>
          <div style="flex:1;">
            <div class="narrative-block"><div class="narrative-label">Current Dasha Impact</div><div class="narrative-text">${escapeHtml(safeString(career.currentDashaImpact))}</div></div>
            <div class="narrative-block"><div class="narrative-label">Opportunities & Challenges</div><div class="narrative-text">${escapeHtml(safeString(career.opportunitiesChallenges))}</div></div>
            <div class="narrative-block"><div class="narrative-label">Lucky Weeks</div><div class="narrative-text">${escapeHtml(safeString(career.luckyWeeks))}</div></div>
            <div class="narrative-block"><div class="narrative-label">Career Remedies</div><div class="narrative-text">${escapeHtml(safeString(career.careerRemedies))}</div></div>
            <div class="tldr-box"><div class="tldr-label">Key Takeaway</div><div class="tldr-text">${escapeHtml(safeString(career.tldr))}</div></div>
          </div>
          <div class="footer">
            <span class="footer-left">Vedic Astrology Roadmap ${year} · ${escapeHtml(fullName)}</span>
            <span class="footer-right">Page ${pageNum}</span>
          </div>
        </div>
        `;
        pageNum++;

        // Topic 5: Wealth Cover Page (pageNum)
        monthsHtml += `
        <!-- Page ${pageNum}: Wealth Cover -->
        <div class="img-page-bg bg-wealth"></div>
        `;
        pageNum++;

        // Topic 5: Wealth Content (pageNum)
        monthsHtml += `
        <!-- Page ${pageNum}: Wealth Content -->
        <div class="page">
          <div class="month-banner">
            <div>
              <div class="month-banner-title">${monthName} ${year}</div>
              <div class="month-banner-section">Wealth & Finance</div>
            </div>
            <div style="font-size:28pt; opacity:0.25;">💰</div>
          </div>
          <div style="flex:1;">
            <div class="narrative-block"><div class="narrative-label">Financial Overview</div><div class="narrative-text">${escapeHtml(safeString(wealth.financialOverview))}</div></div>
            <div class="narrative-block"><div class="narrative-label">Weekly Opportunity & Risk</div><div class="narrative-text">${escapeHtml(safeString(wealth.weeklyOpportunityRisk))}</div></div>
            <div class="narrative-block"><div class="narrative-label">Income & Savings Strategy</div><div class="narrative-text">${escapeHtml(safeString(wealth.incomeSavings))}</div></div>
            <div class="narrative-block"><div class="narrative-label">Best Timing for Finance</div><div class="narrative-text">${escapeHtml(safeString(wealth.bestTiming))}</div></div>
            <div class="narrative-block"><div class="narrative-label">Wealth Remedies</div><div class="narrative-text">${escapeHtml(safeString(wealth.remedies))}</div></div>
            <div class="tldr-box"><div class="tldr-label">Key Takeaway</div><div class="tldr-text">${escapeHtml(safeString(wealth.tldr))}</div></div>
          </div>
          <div class="footer">
            <span class="footer-left">Vedic Astrology Roadmap ${year} · ${escapeHtml(fullName)}</span>
            <span class="footer-right">Page ${pageNum}</span>
          </div>
        </div>
        `;
        pageNum++;

        // Topic 6: Health Cover Page (pageNum)
        monthsHtml += `
        <!-- Page ${pageNum}: Health Cover -->
        <div class="img-page-bg bg-health"></div>
        `;
        pageNum++;

        // Topic 6: Health Content (pageNum)
        monthsHtml += `
        <!-- Page ${pageNum}: Health Content -->
        <div class="page">
          <div class="month-banner">
            <div>
              <div class="month-banner-title">${monthName} ${year}</div>
              <div class="month-banner-section">Health & Vitality</div>
            </div>
            <div style="font-size:28pt; opacity:0.25;">❤️</div>
          </div>
          <div style="flex:1;">
            <div class="narrative-block"><div class="narrative-label">Health Overview</div><div class="narrative-text">${escapeHtml(safeString(health.overview))}</div></div>
            <div class="narrative-block"><div class="narrative-label">Weekly Pattern & Risks</div><div class="narrative-text">${escapeHtml(safeString(health.weeklyPattern))}</div></div>
            <div class="narrative-block"><div class="narrative-label">Risk Periods</div><div class="narrative-text">${escapeHtml(safeString(health.riskPeriods))}</div></div>
            <div class="narrative-block"><div class="narrative-label">Best Timing for Wellness</div><div class="narrative-text">${escapeHtml(safeString(health.bestTiming))}</div></div>
            <div class="narrative-block"><div class="narrative-label">Health Remedies & Diet</div><div class="narrative-text">${escapeHtml(safeString(health.remedies))}</div></div>
            <div class="tldr-box"><div class="tldr-label">Key Takeaway</div><div class="tldr-text">${escapeHtml(safeString(health.tldr))}</div></div>
          </div>
          <div class="footer">
            <span class="footer-left">Vedic Astrology Roadmap ${year} · ${escapeHtml(fullName)}</span>
            <span class="footer-right">Page ${pageNum}</span>
          </div>
        </div>
        `;
        pageNum++;

        // Topic 7: Relationships Cover Page (pageNum)
        monthsHtml += `
        <!-- Page ${pageNum}: Relationships Cover -->
        <div class="img-page-bg bg-relation"></div>
        `;
        pageNum++;

        // Topic 7: Relationships Content (pageNum)
        monthsHtml += `
        <!-- Page ${pageNum}: Relationships Content -->
        <div class="page">
          <div class="month-banner">
            <div>
              <div class="month-banner-title">${monthName} ${year}</div>
              <div class="month-banner-section">Relationships & Family</div>
            </div>
            <div style="font-size:28pt; opacity:0.25;">🤝</div>
          </div>
          <div style="flex:1;">
            <div class="narrative-block"><div class="narrative-label">Relationship Overview</div><div class="narrative-text">${escapeHtml(safeString(relationship.overview))}</div></div>
            <div class="narrative-block"><div class="narrative-label">Transit Influence</div><div class="narrative-text">${escapeHtml(safeString(relationship.transitInfluence))}</div></div>
            <div class="narrative-block"><div class="narrative-label">Harmony Periods</div><div class="narrative-text">${escapeHtml(safeString(relationship.harmonyPeriods))}</div></div>
            <div class="narrative-block"><div class="narrative-label">Relationship Remedies</div><div class="narrative-text">${escapeHtml(safeString(relationship.remedies))}</div></div>
            <div class="tldr-box"><div class="tldr-label">Key Takeaway</div><div class="tldr-text">${escapeHtml(safeString(relationship.tldr))}</div></div>
          </div>
          <div class="footer">
            <span class="footer-left">Vedic Astrology Roadmap ${year} · ${escapeHtml(fullName)}</span>
            <span class="footer-right">Page ${pageNum}</span>
          </div>
        </div>
        `;
        pageNum++;

        // Topic 8: Remedies Cover Page (pageNum)
        monthsHtml += `
        <!-- Page ${pageNum}: Remedies Cover -->
        <div class="img-page-bg bg-remedies"></div>
        `;
        pageNum++;

        // Topic 8: Remedies Content (pageNum)
        monthsHtml += `
        <!-- Page ${pageNum}: Remedies Content -->
        <div class="page">
          <div class="month-banner">
            <div>
              <div class="month-banner-title">${monthName} ${year}</div>
              <div class="month-banner-section">Remedies & Cautions</div>
            </div>
            <div style="font-size:28pt; opacity:0.25;">🧘</div>
          </div>
          <div style="flex:1;">
            <div class="narrative-block"><div class="narrative-label">Remedies by Life Area</div><div class="narrative-text">${escapeHtml(safeString(remedies.remediesByArea))}</div></div>
            <div class="narrative-block"><div class="narrative-label">Who Should Follow</div><div class="narrative-text">${escapeHtml(safeString(remedies.whoShouldFollow))}</div></div>
            <div class="tldr-box"><div class="tldr-label">Key Takeaway</div><div class="tldr-text">${escapeHtml(safeString(remedies.tldr))}</div></div>
            <div style="margin-top:5mm; background:linear-gradient(135deg, rgba(245,197,24,0.1), var(--gold-light)); border:1.5px solid rgba(245,197,24,0.5); border-radius:8px; padding:4mm 5mm;">
              <div style="font-size:9pt; font-weight:700; color:var(--gold-dark); margin-bottom:2mm; text-transform:uppercase; letter-spacing:1.5px;">
                General Spiritual Practices
              </div>
              <div style="font-size:11.5pt; color:#374151; line-height:1.6;">
                Recite the Gayatri Mantra at sunrise daily. Light a lamp or incense at your home altar each morning. Donate to the needy on auspicious days. Maintain a gratitude journal and review your week every Sunday. These consistent practices amplify the positive effects of any personalised remedy.
              </div>
            </div>
          </div>
          <div class="footer">
            <span class="footer-left">Vedic Astrology Roadmap ${year} · ${escapeHtml(fullName)}</span>
            <span class="footer-right">Page ${pageNum}</span>
          </div>
        </div>
        `;
        pageNum++;

        // Topic 9: Monthly Summary Cover Page (pageNum)
        monthsHtml += `
        <!-- Page ${pageNum}: Monthly Summary Cover -->
        <div class="img-page-bg bg-summary"></div>
        `;
        pageNum++;

        // Topic 9: Monthly Summary Content (pageNum)
        monthsHtml += `
        <!-- Page ${pageNum}: Monthly Summary Content -->
        <div class="page">
          <div class="month-banner">
            <div>
              <div class="month-banner-title">${monthName} ${year}</div>
              <div class="month-banner-section">Monthly Summary</div>
            </div>
            <div style="font-size:28pt; opacity:0.25;">📝</div>
          </div>
          <div style="flex:1;">
            <div style="background:linear-gradient(135deg, rgba(245, 197, 24, 0.15) 0%, var(--gold-light) 100%); border:2px solid var(--gold); border-radius:10px; padding:6mm 7mm; margin-bottom:4.5mm;">
              <div style="font-size:9pt; font-weight:700; text-transform:uppercase; letter-spacing:2px; color:var(--gold-dark); margin-bottom:3.5mm; padding-bottom:1.5mm; border-bottom:1.5px solid rgba(245,197,24,0.6);">
                Integrated Monthly Summary — ${monthName} ${year}
              </div>
              <div style="font-size:12.5pt; color:#111111; line-height:1.75; font-weight:500;">
                ${escapeHtml(safeString(summary.monthlySummary))}
              </div>
            </div>
            <div style="background:#FFFFFF; border:1.5px solid #E5E7EB; border-radius:8px; padding:4mm 5mm;">
              <div style="font-size:9pt; font-weight:700; text-transform:uppercase; letter-spacing:1.5px; color:var(--gold-dark); margin-bottom:2.5mm;">
                Quick Reference — ${monthName} Timing Windows
              </div>
              <div style="display:grid; grid-template-columns:1fr 1fr; gap:4mm;">
                <div>
                  <div style="font-size:9pt; font-weight:600; color:#059669; margin-bottom:1.5mm;">Favourable Days</div>
                  <div class="chip-grid">
                    ${(timing.supportDays || []).map(day => {
                      const dVal = day.split("-")[2];
                      const mVal = MONTHS[parseInt(day.split("-")[1], 10) - 1].substring(0, 3);
                      return `<span class="chip support">${dVal} ${mVal}</span>`;
                    }).join("")}
                  </div>
                </div>
                <div>
                  <div style="font-size:9pt; font-weight:600; color:#DC2626; margin-bottom:1.5mm;">Caution Days</div>
                  <div class="chip-grid">
                    ${(timing.cautionDays || []).map(day => {
                      const dVal = day.split("-")[2];
                      const mVal = MONTHS[parseInt(day.split("-")[1], 10) - 1].substring(0, 3);
                      return `<span class="chip caution">${dVal} ${mVal}</span>`;
                    }).join("")}
                  </div>
                </div>
              </div>
            </div>
          </div>
          <div class="footer">
            <span class="footer-left">Vedic Astrology Roadmap ${year} · ${escapeHtml(fullName)}</span>
            <span class="footer-right">Page ${pageNum}</span>
          </div>
        </div>
        `;
        pageNum++;
    });

    const formattedBirthDate = formatDate(dateOfbirth);

    return `<!DOCTYPE html>
<html>
<head>
  <meta charset="utf-8">
  <link rel="stylesheet" href="https://fonts.googleapis.com/css2?family=Roboto:wght@300;400;500;600;700;900&display=swap">
  <style>
    :root {
      --gold: #F5C518;
      --gold-dark: #9A7800;
      --gold-deep: #6B4A00;
      --gold-light: #FFF9E6;
      --dark-blue: #0B192C;
      --dark-blue-light: #1E293B;
    }
    
    * { box-sizing: border-box; margin: 0; padding: 0; }
    
    body {
      font-family: 'Roboto', 'Helvetica Neue', Arial, sans-serif;
      background: #FFFFFF;
      color: #111111;
      -webkit-print-color-adjust: exact;
      print-color-adjust: exact;
    }
    
    .page {
      width: 210mm;
      height: 297mm;
      padding: 15mm 16mm 12mm 16mm;
      background: #FFFFFF;
      page-break-after: always;
      page-break-inside: avoid;
      display: flex;
      flex-direction: column;
      overflow: hidden;
      position: relative;
    }
    
    .img-page {
      width: 210mm;
      height: 297mm;
      page-break-after: always;
      page-break-inside: avoid;
      overflow: hidden;
      display: block;
    }
    
    .img-page img {
      width: 210mm;
      height: 297mm;
      object-fit: fill;
      display: block;
    }

    .img-page-bg {
      width: 210mm;
      height: 297mm;
      page-break-after: always;
      page-break-inside: avoid;
      background-size: 100% 100%;
      background-repeat: no-repeat;
      background-position: center;
      display: block;
    }

    .bg-cover { background-image: url('${coverImg}'); }
    .bg-end { background-image: url('${endImg}'); }
    .bg-cosmic { background-image: url('${cosmicImg}'); }
    .bg-transits { background-image: url('${transitsImg}'); }
    .bg-auspicious { background-image: url('${auspiciousImg}'); }
    .bg-career { background-image: url('${careerImg}'); }
    .bg-wealth { background-image: url('${wealthImg}'); }
    .bg-health { background-image: url('${healthImg}'); }
    .bg-relation { background-image: url('${relationImg}'); }
    .bg-remedies { background-image: url('${remediesImg}'); }
    .bg-summary { background-image: url('${summaryImg}'); }
    ${monthCoversCssRules}
    
    .header {
      margin-bottom: 5mm;
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
      margin-top: 3mm;
    }
    
    .narrative-block {
      margin-bottom: 3.5mm;
    }
    
    .narrative-label {
      font-size: 9pt;
      font-weight: 700;
      text-transform: uppercase;
      letter-spacing: 1.5px;
      color: var(--gold-dark);
      margin-bottom: 1.5mm;
      padding-bottom: 1mm;
      border-bottom: 1.5px solid rgba(245, 197, 24, 0.3);
    }
    
    .narrative-text {
      font-size: 11.5pt;
      color: #374151;
      line-height: 1.6;
      text-align: justify;
    }
    
    .tldr-box {
      background: var(--gold-light);
      border: 1.5px solid var(--gold);
      border-radius: 8px;
      padding: 3.5mm 4.5mm;
      margin-top: 4mm;
    }
    
    .tldr-label {
      font-size: 8.5pt;
      font-weight: 700;
      text-transform: uppercase;
      letter-spacing: 1.5px;
      color: var(--gold-dark);
      margin-bottom: 1.5mm;
    }
    
    .tldr-text {
      font-size: 11.5pt;
      font-weight: 500;
      color: var(--dark-blue);
      line-height: 1.5;
      font-style: italic;
    }
    
    .info-card {
      background: #FFFFFF;
      border: 1.5px solid #E5E7EB;
      border-radius: 8px;
      padding: 4mm 5mm;
    }
    
    .info-card-title {
      font-size: 8.5pt;
      font-weight: 700;
      text-transform: uppercase;
      letter-spacing: 1.5px;
      color: var(--gold-dark);
      margin-bottom: 2.5mm;
      padding-bottom: 1.5mm;
      border-bottom: 1px solid rgba(245, 197, 24, 0.2);
    }
    
    .info-card-row {
      display: flex;
      justify-content: space-between;
      align-items: flex-start;
      padding: 2mm 0;
      border-bottom: 1px solid #F3F4F6;
      gap: 3mm;
    }
    
    .info-card-row:last-child {
      border-bottom: none;
    }
    
    .info-card-label {
      font-size: 10.5pt;
      color: #6B7280;
      font-weight: 500;
    }
    
    .info-card-value {
      font-size: 10.5pt;
      font-weight: 700;
      color: #111827;
      text-align: right;
    }
    
    .grid-2 {
      display: grid;
      grid-template-columns: 1fr 1fr;
      gap: 4.5mm;
      margin-bottom: 3.5mm;
    }
    
    .footer {
      margin-top: auto;
      padding-top: 3.5mm;
      border-top: 1.5px solid rgba(245, 197, 24, 0.2);
      display: flex;
      justify-content: space-between;
      align-items: center;
      font-size: 8.5pt;
      color: #6B7280;
    }
    
    .footer-left { font-weight: 500; }
    .footer-right { font-weight: 700; color: var(--gold-dark); }
    
    .table-wrap {
      border: 1.5px solid #E5E7EB;
      border-radius: 8px;
      overflow: hidden;
      margin-top: 2.5mm;
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
      padding: 3mm 3.5mm;
      text-align: left;
      border: none;
    }
    
    .premium-table td {
      padding: 2.5mm 3.5mm;
      font-size: 12.5pt;
      border-bottom: 1px solid #F3F4F6;
      vertical-align: middle;
      line-height: 1.5;
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
      font-size: 12.5pt;
      font-weight: 500;
      color: #374151;
    }
    
    .status-badge.direct {
      background: none;
      color: #374151;
      border: none;
      padding: 0;
    }
    
    .status-badge.retro {
      background: none;
      color: #374151;
      border: none;
      padding: 0;
    }
    
    .month-banner {
      background: linear-gradient(135deg, rgba(245, 197, 24, 0.15) 0%, var(--gold-light) 100%);
      border-radius: 8px;
      padding: 4mm 5mm;
      margin-bottom: 5mm;
      border: 1.5px solid var(--gold);
      display: flex;
      justify-content: space-between;
      align-items: center;
    }
    
    .month-banner-title {
      font-size: 8pt;
      font-weight: 700;
      color: var(--gold-dark);
      text-transform: uppercase;
      letter-spacing: 2.5px;
      margin-bottom: 0.8mm;
    }
    
    .month-banner-section {
      font-size: 18pt;
      font-weight: 800;
      color: var(--dark-blue);
    }
    
    .chip-grid {
      display: flex;
      flex-wrap: wrap;
      gap: 1.5mm;
      margin-top: 1.5mm;
    }
    
    .chip {
      border-radius: 4px;
      padding: 0.8mm 2.2mm;
      font-size: 10pt;
      font-weight: 600;
    }
    
    .chip.support {
      background: #DCFCE7;
      border: 1px solid #86EFAC;
      color: #059669;
    }
    
    .chip.caution {
      background: #FEF2F2;
      border: 1px solid #FECACA;
      color: #DC2626;
    }
    
    .toc-row {
      display: flex;
      align-items: baseline;
      padding: 1.8mm 0;
      border-bottom: 1px solid #F3F4F6;
    }
    
    .toc-num {
      font-size: 12.5pt;
      font-weight: 700;
      color: var(--gold);
      width: 10mm;
      flex-shrink: 0;
    }
    
    .toc-title {
      font-size: 12pt;
      font-weight: 500;
      color: #374151;
      flex: 1;
    }
    
    .toc-dots {
      flex: 1;
      border-bottom: 1.5px dotted #D1D5DB;
      margin: 0 4mm;
      max-width: 35mm;
    }
    
    .toc-page {
      font-size: 12pt;
      font-weight: 700;
      color: #111111;
      width: 15mm;
      text-align: right;
    }
    
    .charts-container {
      display: flex;
      flex-direction: row;
      justify-content: space-around;
      align-items: center;
      margin-top: 3mm;
      flex: 1;
      width: 100%;
    }
    
    .chart-box {
      border: 1.5px solid #E5E7EB;
      border-radius: 8px;
      background: #FFFFFF;
      padding: 3.5mm;
      display: flex;
      flex-direction: column;
      align-items: center;
    }
  </style>
</head>
<body>

  <!-- PAGE 1: COVER COVER -->
  <div class="img-page-bg bg-cover"></div>

  <!-- PAGE 2: ABOUT THIS REPORT -->
  <div class="page">
    <div class="header">
      <div class="header-eyebrow">
        <div class="eyebrow-line"></div>
        <span class="eyebrow-text">Introduction</span>
      </div>
      <h1 class="header-title">About This Report</h1>
      <p class="header-subtitle">Your personalised Vedic Astrology Roadmap for ${year}</p>
      <div class="header-gradient"></div>
    </div>
    <div style="flex:1;">
      <p style="margin-bottom:3.5mm; line-height:1.75; font-size:12.5pt; color:#374151; text-align:justify;">Welcome to your personalised Vedic Astrology Yearly Roadmap for ${year}. This comprehensive report has been meticulously prepared using your exact birth details — date, time, and place of birth — to create a highly personalised astrological forecast.</p>
      <p style="margin-bottom:3.5mm; line-height:1.75; font-size:12.5pt; color:#374151; text-align:justify;">This report analyses 12 months of your life through the lens of Vedic (Jyotish) and KP astrology. Each month covers eight critical life domains: Cosmic Overview, Transit Analysis, Auspicious Timing, Career, Wealth, Health, Relationships, and Remedies.</p>
      <p style="margin-bottom:3.5mm; line-height:1.75; font-size:12.5pt; color:#374151; text-align:justify;">The predictions in this report are derived from your natal chart (Rasi), divisional charts (Hora D2, Navamsa D9, Dasamsa D10), Vimshottari Dasha cycles, Ashtakvarga scores, and real-time planetary transits computed for each month of ${year}.</p>
      <p style="margin-bottom:3.5mm; line-height:1.75; font-size:12.5pt; color:#374151; text-align:justify;">Use this report as a strategic guide — not a rigid destiny map. The planetary energies described here represent tendencies and opportunities. Your free will, effort, and choices ultimately shape your outcomes. May this roadmap illuminate your path forward.</p>
    </div>
    <div class="footer">
      <span class="footer-left">Vedic Astrology Roadmap ${year} · ${escapeHtml(fullName)}</span>
      <span class="footer-right">Page 2</span>
    </div>
  </div>

  <!-- PAGE 3: HOW TO READ YOUR REPORT -->
  <div class="page">
    <div class="header">
      <div class="header-eyebrow">
        <div class="eyebrow-line"></div>
        <span class="eyebrow-text">Guide</span>
      </div>
      <h1 class="header-title">How To Read Your Report</h1>
      <p class="header-subtitle">Understanding the structure and terminology</p>
      <div class="header-gradient"></div>
    </div>
    <div style="flex:1;">
      <div style="font-size:11.5pt; line-height:1.6; color:#374151; margin-bottom:3.5mm; text-align:justify;">
        <p style="margin-bottom:3mm; line-height:1.7; text-align:justify;">This report is divided into clearly structured sections for easy navigation. The first section presents your birth details, cosmic identity, active Dasha periods, and natal horoscope charts. This establishes the foundation upon which all predictions are built.</p>
        <p style="margin-bottom:3mm; line-height:1.7; text-align:justify;">The monthly prediction sections form the core of this report. Each month begins with a full-page artistic illustration, followed by dedicated pages for each life domain. Every section contains detailed analysis backed by your actual planetary positions and transit data.</p>
        <p style="margin-bottom:3mm; line-height:1.7; text-align:justify;">When you encounter tables with dates, these represent calculated windows of opportunity or caution based on Moon transits through your houses. Favourable dates align with trinal and angular house transits, while caution dates correspond to dusthana (6th, 8th, 12th) house transits.</p>
        <p style="margin-bottom:3mm; line-height:1.7; text-align:justify;">The remedies section at the end of each month provides actionable spiritual practices, mantras, and lifestyle adjustments tailored to your chart. These are traditional Vedic prescriptions designed to strengthen weak planetary influences and enhance positive ones.</p>
      </div>
      
      <div style="font-size:9pt; font-weight:700; text-transform:uppercase; letter-spacing:1.5px; color:var(--gold-dark); margin-bottom:2mm;">
        Monthly Section Guide
      </div>
      <div class="table-wrap">
        <table class="premium-table">
          <thead>
            <tr>
              <th style="width: 25%; font-size:11pt; padding:1.8mm 3mm;">Section</th>
              <th style="font-size:11pt; padding:1.8mm 3mm;">What It Covers</th>
            </tr>
          </thead>
          <tbody>
            <tr>
              <td style="font-size:12pt; padding:1.2mm 3mm; font-weight:700; color:var(--dark-blue);">Cosmic Overview</td>
              <td style="font-size:12pt; padding:1.2mm 3mm;">Big-picture planetary energies, active yogas, house scores, and spiritual guidance</td>
            </tr>
            <tr>
              <td style="font-size:12pt; padding:1.2mm 3mm; font-weight:700; color:var(--dark-blue);">Transit Focus</td>
              <td style="font-size:12pt; padding:1.2mm 3mm;">Planetary movements, Dasha analysis, golden windows, and transit remedies</td>
            </tr>
            <tr>
              <td style="font-size:12pt; padding:1.2mm 3mm; font-weight:700; color:var(--dark-blue);">Auspicious Days</td>
              <td style="font-size:12pt; padding:1.2mm 3mm;">Favourable and unfavourable dates with day-wise timing guidance</td>
            </tr>
            <tr>
              <td style="font-size:12pt; padding:1.2mm 3mm; font-weight:700; color:var(--dark-blue);">Career</td>
              <td style="font-size:12pt; padding:1.2mm 3mm;">Professional growth, opportunities, challenges, lucky weeks, and remedies</td>
            </tr>
            <tr>
              <td style="font-size:12pt; padding:1.2mm 3mm; font-weight:700; color:var(--dark-blue);">Wealth</td>
              <td style="font-size:12pt; padding:1.2mm 3mm;">Financial outlook, investment timing, savings guidance, and wealth remedies</td>
            </tr>
            <tr>
              <td style="font-size:12pt; padding:1.2mm 3mm; font-weight:700; color:var(--dark-blue);">Health</td>
              <td style="font-size:12pt; padding:1.2mm 3mm;">Vitality patterns, risk periods, wellness timing, and health remedies</td>
            </tr>
            <tr>
              <td style="font-size:12pt; padding:1.2mm 3mm; font-weight:700; color:var(--dark-blue);">Relationships</td>
              <td style="font-size:12pt; padding:1.2mm 3mm;">Family harmony, romantic timing, transit influences, and interpersonal guidance</td>
            </tr>
            <tr>
              <td style="font-size:12pt; padding:1.2mm 3mm; font-weight:700; color:var(--dark-blue);">Remedies</td>
              <td style="font-size:12pt; padding:1.2mm 3mm;">Mantras, rituals, charity, and practical corrections for the month</td>
            </tr>
            <tr>
              <td style="font-size:12pt; padding:1.2mm 3mm; font-weight:700; color:var(--dark-blue);">Monthly Summary</td>
              <td style="font-size:12pt; padding:1.2mm 3mm;">Integrated one-page guidance summary for the entire month</td>
            </tr>
          </tbody>
        </table>
      </div>
    </div>
    <div class="footer">
      <span class="footer-left">Vedic Astrology Roadmap ${year} · ${escapeHtml(fullName)}</span>
      <span class="footer-right">Page 3</span>
    </div>
  </div>

  <!-- PAGE 4: WHAT IS VEDIC ASTROLOGY -->
  <div class="page">
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
      <p style="margin-bottom:3.5mm; line-height:1.75; font-size:12.5pt; color:#374151; text-align:justify;">Vedic Astrology, known as Jyotish Shastra, is one of the oldest systems of astronomical observation and prediction, originating in ancient India over 5,000 years ago. Unlike Western astrology which uses the Tropical zodiac, Vedic astrology employs the Sidereal zodiac, accounting for the precession of equinoxes.</p>
      <p style="margin-bottom:3.5mm; line-height:1.75; font-size:12.5pt; color:#374151; text-align:justify;">The foundation of Jyotish lies in the belief that celestial bodies — the Sun, Moon, Mars, Mercury, Jupiter, Venus, Saturn, and the lunar nodes Rahu and Ketu — exert measurable influences on human affairs. These nine celestial bodies, called the Navagraha, govern different aspects of life through their placement in the twelve houses and signs of the zodiac.</p>
      <p style="margin-bottom:3.5mm; line-height:1.75; font-size:12.5pt; color:#374151; text-align:justify;">A birth chart (Kundli) is a snapshot of the sky at the exact moment and location of your birth. It maps the positions of all nine planets across twelve houses, each governing specific life domains such as personality, wealth, communication, home, creativity, health, partnerships, transformation, fortune, career, gains, and spiritual liberation.</p>
      <p style="margin-bottom:3.5mm; line-height:1.75; font-size:12.5pt; color:#374151; text-align:justify;">This report also incorporates the KP (Krishnamurti Paddhati) system, a modern refinement of Vedic astrology that uses sub-lords and cuspal analysis for precise timing of events. The combination of traditional Parashari methods with KP techniques provides a comprehensive and accurate predictive framework.</p>
    </div>
    <div class="footer">
      <span class="footer-left">Vedic Astrology Roadmap ${year} · ${escapeHtml(fullName)}</span>
      <span class="footer-right">Page 4</span>
    </div>
  </div>

  <!-- PAGE 5: UNDERSTANDING DASHA SYSTEMS -->
  <div class="page">
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
      <div style="font-size:11.5pt; line-height:1.6; color:#374151; margin-bottom:3.5mm; text-align:justify;">
        <p style="margin-bottom:3mm; line-height:1.7; text-align:justify;">The Vimshottari Dasha system is the most widely used predictive timing tool in Vedic Astrology. It divides your life into planetary periods totalling 120 years, with each planet ruling a specific number of years. The sequence is: Ketu (7 years), Venus (20 years), Sun (6 years), Moon (10 years), Mars (7 years), Rahu (18 years), Jupiter (16 years), Saturn (19 years), and Mercury (17 years).</p>
        <p style="margin-bottom:3mm; line-height:1.7; text-align:justify;">Your starting Dasha is determined by the Moon's position in its birth Nakshatra at the exact moment of your birth. Each major period (Mahadasha) is further subdivided into sub-periods (Antardasha) and sub-sub-periods (Pratyantardasha), creating a layered system of planetary influence.</p>
        <p style="margin-bottom:3mm; line-height:1.7; text-align:justify;">During any given period, the Mahadasha lord sets the overarching theme of your life, while the Antardasha lord colours the specific experiences within that theme. The Pratyantardasha provides even finer timing for events. Understanding your current Dasha configuration is essential for interpreting the monthly predictions in this report.</p>
        <p style="margin-bottom:3mm; line-height:1.7; text-align:justify;">The interplay between Dasha lords and transiting planets creates unique windows of opportunity and challenge. When a benefic Dasha lord is supported by favourable transits, results tend to be positive. Conversely, a malefic Dasha lord combined with challenging transits requires greater caution and the application of remedial measures.</p>
      </div>
      
      <div class="table-wrap" style="margin-top: 1mm;">
        <table class="premium-table">
          <thead>
            <tr>
              <th style="font-size:11pt; padding:1.8mm 3mm;">Planet</th>
              <th style="font-size:11pt; padding:1.8mm 3mm;">Duration</th>
              <th style="font-size:11pt; padding:1.8mm 3mm;">Nature & Theme</th>
            </tr>
          </thead>
          <tbody>
            <tr><td style="font-size:12pt; padding:1.2mm 3mm; font-weight:700;">Ketu</td><td style="font-size:12pt; padding:1.2mm 3mm;">7 Years</td><td style="font-size:12pt; padding:1.2mm 3mm;">Spiritual, sudden changes, detachment, liberation</td></tr>
            <tr><td style="font-size:12pt; padding:1.2mm 3mm; font-weight:700;">Venus</td><td style="font-size:12pt; padding:1.2mm 3mm;">20 Years</td><td style="font-size:12pt; padding:1.2mm 3mm;">Luxury, love, creativity, material prosperity</td></tr>
            <tr><td style="font-size:12pt; padding:1.2mm 3mm; font-weight:700;">Sun</td><td style="font-size:12pt; padding:1.2mm 3mm;">6 Years</td><td style="font-size:12pt; padding:1.2mm 3mm;">Authority, vitality, government, leadership</td></tr>
            <tr><td style="font-size:12pt; padding:1.2mm 3mm; font-weight:700;">Moon</td><td style="font-size:12pt; padding:1.2mm 3mm;">10 Years</td><td style="font-size:12pt; padding:1.2mm 3mm;">Emotions, mind, nurturing, public image</td></tr>
            <tr><td style="font-size:12pt; padding:1.2mm 3mm; font-weight:700;">Mars</td><td style="font-size:12pt; padding:1.2mm 3mm;">7 Years</td><td style="font-size:12pt; padding:1.2mm 3mm;">Energy, courage, property, technical skills</td></tr>
            <tr><td style="font-size:12pt; padding:1.2mm 3mm; font-weight:700;">Rahu</td><td style="font-size:12pt; padding:1.2mm 3mm;">18 Years</td><td style="font-size:12pt; padding:1.2mm 3mm;">Ambition, foreign, unconventional paths</td></tr>
            <tr><td style="font-size:12pt; padding:1.2mm 3mm; font-weight:700;">Jupiter</td><td style="font-size:12pt; padding:1.2mm 3mm;">16 Years</td><td style="font-size:12pt; padding:1.2mm 3mm;">Wisdom, expansion, fortune, children</td></tr>
            <tr><td style="font-size:12pt; padding:1.2mm 3mm; font-weight:700;">Saturn</td><td style="font-size:12pt; padding:1.2mm 3mm;">19 Years</td><td style="font-size:12pt; padding:1.2mm 3mm;">Discipline, hard work, karma, delays</td></tr>
            <tr><td style="font-size:12pt; padding:1.2mm 3mm; font-weight:700;">Mercury</td><td style="font-size:12pt; padding:1.2mm 3mm;">17 Years</td><td style="font-size:12pt; padding:1.2mm 3mm;">Intelligence, business, communication</td></tr>
          </tbody>
        </table>
      </div>
    </div>
    <div class="footer">
      <span class="footer-left">Vedic Astrology Roadmap ${year} · ${escapeHtml(fullName)}</span>
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
              <td style="text-align:center; font-weight:800; color:var(--gold-dark); font-size:12pt;">${house}</td>
              <td style="font-weight:700; color:var(--dark-blue);">${h.name}</td>
              <td>${h.desc}</td>
            </tr>
          `).join("")}
        </tbody>
      </table>
    </div>
    <div class="footer">
      <span class="footer-left">Vedic Astrology Roadmap ${year} · ${escapeHtml(fullName)}</span>
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
            <td>Aries & Scorpio</td>
            <td style="font-style:italic; color:var(--gold-dark);">Aggressive, courageous</td>
            <td>Energy, siblings, property, courage, surgery, and military affairs</td>
          </tr>
          <tr>
            <td style="font-weight:700; color:var(--dark-blue);">Mercury (Budh)</td>
            <td>Gemini & Virgo</td>
            <td style="font-style:italic; color:var(--gold-dark);">Intellectual, communicative</td>
            <td>Intelligence, speech, commerce, education, writing, and analysis</td>
          </tr>
          <tr>
            <td style="font-weight:700; color:var(--dark-blue);">Jupiter (Guru)</td>
            <td>Sagittarius & Pisces</td>
            <td style="font-style:italic; color:var(--gold-dark);">Benevolent, expansive</td>
            <td>Wisdom, children, wealth, spirituality, teaching, and divine grace</td>
          </tr>
          <tr>
            <td style="font-weight:700; color:var(--dark-blue);">Venus (Shukra)</td>
            <td>Taurus & Libra</td>
            <td style="font-style:italic; color:var(--gold-dark);">Luxurious, artistic</td>
            <td>Love, marriage, beauty, art, vehicles, luxury, and material comfort</td>
          </tr>
          <tr>
            <td style="font-weight:700; color:var(--dark-blue);">Saturn (Shani)</td>
            <td>Capricorn & Aquarius</td>
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
      <span class="footer-left">Vedic Astrology Roadmap ${year} · ${escapeHtml(fullName)}</span>
      <span class="footer-right">Page 7</span>
    </div>
  </div>

  <!-- PAGE 8: DISCLAIMER -->
  <div class="page">
    <div class="header">
      <div class="header-eyebrow">
        <div class="eyebrow-line"></div>
        <span class="eyebrow-text">Legal Notice</span>
      </div>
      <h1 class="header-title">Disclaimer</h1>
      <p class="header-subtitle">Vedic and KP annual roadmap for the year ${year}</p>
      <div class="header-gradient"></div>
    </div>
    <div style="flex:1; font-size:13.5pt; line-height:1.75; text-align:justify; color:#374151;">
      <h3 style="font-size:14pt; font-weight:700; color:#0B192C; margin:4mm 0 2mm;">Disclaimer</h3>
      <p style="margin-bottom:3.5mm; line-height:1.7; text-align:justify;">This Yearly Vedic Astrology Report is generated using astrological calculations, planetary positions, transit analysis, and Dasha-based interpretations.</p>
      <p style="margin-bottom:3.5mm; line-height:1.7; text-align:justify;">Astrology is intended to provide guidance, insights, and possible trends based on celestial patterns. It should not be considered a guarantee of future events or outcomes. Individual experiences may vary depending on personal choices, circumstances, and free will.</p>
      <p style="margin-bottom:3.5mm; line-height:1.7; text-align:justify;">The information provided in this report is for informational, self-reflection, and entertainment purposes only. Any suggestions, timing guidance, or recommendations are meant to help you make more informed decisions and should not be treated as professional advice.</p>
      <p style="margin-bottom:3.5mm; line-height:1.7; text-align:justify;">Graho does not provide medical, legal, financial, psychological, or other professional services. For important decisions relating to health, finances, business, legal matters, or personal safety, please consult a qualified professional.</p>
      <p style="margin-bottom:3.5mm; line-height:1.7; text-align:justify;">While every effort is made to ensure accurate astrological calculations and interpretations, Graho makes no warranties regarding the completeness, accuracy, or reliability of any prediction, forecast, or recommendation. No specific result or outcome is guaranteed.</p>
      <p style="margin-bottom:3.5mm; line-height:1.7; text-align:justify;">By accessing and using this report, you acknowledge that all decisions and actions taken based on its contents are solely your responsibility.</p>
    </div>
    <div class="footer">
      <span class="footer-left">Vedic Astrology Roadmap ${year} · ${escapeHtml(fullName)}</span>
      <span class="footer-right">Page 8</span>
    </div>
  </div>

  <!-- PAGE 9: TABLE OF CONTENTS -->
  <div class="page">
    <div class="header">
      <div class="header-eyebrow">
        <div class="eyebrow-line"></div>
        <span class="eyebrow-text">Navigation</span>
      </div>
      <h1 class="header-title">Table of Contents</h1>
      <p class="header-subtitle">Quick reference to all sections of your report</p>
      <div class="header-gradient"></div>
    </div>
    <div style="display:grid; grid-template-columns:1fr 1fr; gap:8mm; margin-top:2mm; flex:1;">
      <div>
        <div class="toc-row"><div class="toc-num">1.</div><div class="toc-title">About This Report</div><div class="toc-dots"></div><div class="toc-page">Page 2</div></div>
        <div class="toc-row"><div class="toc-num">2.</div><div class="toc-title">How To Read Your Report</div><div class="toc-dots"></div><div class="toc-page">Page 3</div></div>
        <div class="toc-row"><div class="toc-num">3.</div><div class="toc-title">What is Vedic Astrology?</div><div class="toc-dots"></div><div class="toc-page">Page 4</div></div>
        <div class="toc-row"><div class="toc-num">4.</div><div class="toc-title">Understanding Dasha Systems</div><div class="toc-dots"></div><div class="toc-page">Page 5</div></div>
        <div class="toc-row"><div class="toc-num">5.</div><div class="toc-title">Houses & Their Significations</div><div class="toc-dots"></div><div class="toc-page">Page 6</div></div>
        <div class="toc-row"><div class="toc-num">6.</div><div class="toc-title">The Nine Planets (Navagraha)</div><div class="toc-dots"></div><div class="toc-page">Page 7</div></div>
        <div class="toc-row"><div class="toc-num">7.</div><div class="toc-title">Disclaimer</div><div class="toc-dots"></div><div class="toc-page">Page 8</div></div>
        <div class="toc-row"><div class="toc-num">8.</div><div class="toc-title">Cosmic Snapshot</div><div class="toc-dots"></div><div class="toc-page">Page 10</div></div>
        <div class="toc-row"><div class="toc-num">9.</div><div class="toc-title">Birth Planetary Positions</div><div class="toc-dots"></div><div class="toc-page">Page 11</div></div>
        <div class="toc-row"><div class="toc-num">10.</div><div class="toc-title">Active Yogas & Dasha Cycles</div><div class="toc-dots"></div><div class="toc-page">Page 12</div></div>
        <div class="toc-row"><div class="toc-num">11.</div><div class="toc-title">Birth Horoscope Charts</div><div class="toc-dots"></div><div class="toc-page">Page 13</div></div>
        <div class="toc-row"><div class="toc-num">12.</div><div class="toc-title">Energy Metrics & Ashtakvarga</div><div class="toc-dots"></div><div class="toc-page">Page 15</div></div>
      </div>
      <div>
        <div class="toc-row"><div class="toc-num">13.</div><div class="toc-title">January ${year} Predictions</div><div class="toc-dots"></div><div class="toc-page">Page 16</div></div>
        <div class="toc-row"><div class="toc-num">14.</div><div class="toc-title">February ${year} Predictions</div><div class="toc-dots"></div><div class="toc-page">Page 35</div></div>
        <div class="toc-row"><div class="toc-num">15.</div><div class="toc-title">March ${year} Predictions</div><div class="toc-dots"></div><div class="toc-page">Page 54</div></div>
        <div class="toc-row"><div class="toc-num">16.</div><div class="toc-title">April ${year} Predictions</div><div class="toc-dots"></div><div class="toc-page">Page 73</div></div>
        <div class="toc-row"><div class="toc-num">17.</div><div class="toc-title">May ${year} Predictions</div><div class="toc-dots"></div><div class="toc-page">Page 92</div></div>
        <div class="toc-row"><div class="toc-num">18.</div><div class="toc-title">June ${year} Predictions</div><div class="toc-dots"></div><div class="toc-page">Page 111</div></div>
        <div class="toc-row"><div class="toc-num">19.</div><div class="toc-title">July ${year} Predictions</div><div class="toc-dots"></div><div class="toc-page">Page 130</div></div>
        <div class="toc-row"><div class="toc-num">20.</div><div class="toc-title">August ${year} Predictions</div><div class="toc-dots"></div><div class="toc-page">Page 149</div></div>
        <div class="toc-row"><div class="toc-num">21.</div><div class="toc-title">September ${year} Predictions</div><div class="toc-dots"></div><div class="toc-page">Page 168</div></div>
        <div class="toc-row"><div class="toc-num">22.</div><div class="toc-title">October ${year} Predictions</div><div class="toc-dots"></div><div class="toc-page">Page 187</div></div>
        <div class="toc-row"><div class="toc-num">23.</div><div class="toc-title">November ${year} Predictions</div><div class="toc-dots"></div><div class="toc-page">Page 206</div></div>
        <div class="toc-row"><div class="toc-num">24.</div><div class="toc-title">December ${year} Predictions</div><div class="toc-dots"></div><div class="toc-page">Page 225</div></div>
      </div>
    </div>
    <div class="footer">
      <span class="footer-left">Vedic Astrology Roadmap ${year} · ${escapeHtml(fullName)}</span>
      <span class="footer-right">Page 9</span>
    </div>
  </div>

  <!-- PAGE 10: COSMIC SNAPSHOT -->
  <div class="page">
    <div class="header">
      <div class="header-eyebrow">
        <div class="eyebrow-line"></div>
        <span class="eyebrow-text">Birth Details & Coordinates</span>
      </div>
      <h1 class="header-title">Cosmic Snapshot</h1>
      <p class="header-subtitle">Your personal birth details and core astrological identity</p>
      <div class="header-gradient"></div>
    </div>
    <div style="flex:1; display:flex; flex-direction:column; gap:5mm; justify-content:center;">
      <div class="grid-2">
        <div class="info-card">
          <div class="info-card-title">Personal Information</div>
          <div class="info-card-row"><span class="info-card-label">Full Name</span><span class="info-card-value">${escapeHtml(fullName)}</span></div>
          <div class="info-card-row"><span class="info-card-label">Gender</span><span class="info-card-value">${escapeHtml(gender)}</span></div>
          <div class="info-card-row"><span class="info-card-label">Date of Birth</span><span class="info-card-value">${formattedBirthDate}</span></div>
          <div class="info-card-row"><span class="info-card-label">Time of Birth</span><span class="info-card-value">${escapeHtml(timeOfbirth)}</span></div>
          <div class="info-card-row"><span class="info-card-label">Place of Birth</span><span class="info-card-value">${escapeHtml(placeOfBirth)}</span></div>
          <div class="info-card-row"><span class="info-card-label">Roadmap Year</span><span class="info-card-value">${year}</span></div>
        </div>
        <div class="info-card">
          <div class="info-card-title">Core Cosmic Identity</div>
          <div class="info-card-row"><span class="info-card-label">Ascendant (Lagna)</span><span class="info-card-value">${escapeHtml(astro.ascendant)}</span></div>
          <div class="info-card-row"><span class="info-card-label">Moon Sign (Rashi)</span><span class="info-card-value">${escapeHtml(astro.moonSign)}</span></div>
          <div class="info-card-row"><span class="info-card-label">Sun Sign (Surya)</span><span class="info-card-value">${escapeHtml(astro.sunSign)}</span></div>
          <div class="info-card-row"><span class="info-card-label">Birth Nakshatra</span><span class="info-card-value">${escapeHtml(astro.nakshatra)}</span></div>
          <div class="info-card-row"><span class="info-card-label">Nakshatra Lord</span><span class="info-card-value">${escapeHtml(astro.nakshatraLord)}</span></div>
          <div class="info-card-row"><span class="info-card-label">Nakshatra Pada</span><span class="info-card-value">${escapeHtml(astro.nakshatraPada)}</span></div>
        </div>
      </div>
      <div class="info-card">
        <div class="info-card-title">Active Dasha Period — Vimshottari</div>
        <div style="display: grid; grid-template-columns: 1fr 1fr 1fr; gap: 4mm;">
          <div style="text-align: center; padding: 2.5mm 1.5mm; background: var(--gold-light); border-radius: 6px; border: 1.5px solid var(--gold);">
            <div style="font-size: 8.5pt; font-weight: 700; text-transform: uppercase; color: var(--gold-dark); margin-bottom: 1mm; letter-spacing: 0.5px;">Mahadasha</div>
            <div style="font-size: 13pt; font-weight: 700; color: var(--dark-blue);">${escapeHtml(dasha.mahadasha || "—")}</div>
          </div>
          <div style="text-align: center; padding: 2.5mm 1.5mm; background: var(--gold-light); border-radius: 6px; border: 1.5px solid var(--gold);">
            <div style="font-size: 8.5pt; font-weight: 700; text-transform: uppercase; color: var(--gold-dark); margin-bottom: 1mm; letter-spacing: 0.5px;">Antardasha</div>
            <div style="font-size: 13pt; font-weight: 700; color: var(--dark-blue);">${escapeHtml(dasha.antardasha || "—")}</div>
          </div>
          <div style="text-align: center; padding: 2.5mm 1.5mm; background: var(--gold-light); border-radius: 6px; border: 1.5px solid var(--gold);">
            <div style="font-size: 8.5pt; font-weight: 700; text-transform: uppercase; color: var(--gold-dark); margin-bottom: 1mm; letter-spacing: 0.5px;">Pratyantardasha</div>
            <div style="font-size: 13pt; font-weight: 700; color: var(--dark-blue);">${escapeHtml(dasha.pratyantardasha || "—")}</div>
          </div>
        </div>
      </div>
    </div>
    <div class="footer">
      <span class="footer-left">Vedic Astrology Roadmap ${year} · ${escapeHtml(fullName)}</span>
      <span class="footer-right">Page 10</span>
    </div>
  </div>

  <!-- PAGE 11: BIRTH PLANETARY POSITIONS -->
  <div class="page">
    <div class="header">
      <div class="header-eyebrow">
        <div class="eyebrow-line"></div>
        <span class="eyebrow-text">Natal Chart</span>
      </div>
      <h1 class="header-title">Birth Planetary Positions</h1>
      <p class="header-subtitle">Exact coordinate degrees and dignity status of planets at birth</p>
      <div class="header-gradient"></div>
    </div>
    <div style="flex:1;">
      <p style="font-size:11.5pt; color:#374151; line-height:1.6; margin-bottom:4mm; text-align:justify;">
        The table below shows the exact degrees and house placements of all nine planets in your birth chart, along with their astrological status and relative dignities at the moment of your birth.
      </p>
      <div class="table-wrap">
        <table class="premium-table">
          <thead>
            <tr>
              <th style="width: 20%; padding:2.5mm 3.5mm; font-size:11pt;">Planet</th>
              <th style="width: 25%; padding:2.5mm 3.5mm; font-size:11pt;">Sign Placement</th>
              <th style="width: 15%; padding:2.5mm 3.5mm; font-size:11pt;">House</th>
              <th style="width: 20%; padding:2.5mm 3.5mm; font-size:11pt;">Degree</th>
              <th style="padding:2.5mm 3.5mm; font-size:11pt;">Status & Dignity</th>
            </tr>
          </thead>
          <tbody>
            ${(reportData.birthPlanetaryTable || []).map(p => `
              <tr>
                <td style="font-weight:700; color:var(--dark-blue); font-size:10.5pt;">${escapeHtml(p.planet)}</td>
                <td>${escapeHtml(p.sign)}</td>
                <td style="text-align:center;">House ${p.house}</td>
                <td>${formatDegree(p.degree)}</td>
                <td>
                  <span class="status-badge direct">${escapeHtml(p.status || "Normal")}</span>
                </td>
              </tr>
            `).join("")}
          </tbody>
        </table>
      </div>
    </div>
    <div class="footer">
      <span class="footer-left">Vedic Astrology Roadmap ${year} · ${escapeHtml(fullName)}</span>
      <span class="footer-right">Page 11</span>
    </div>
  </div>

  <!-- PAGE 12: ACTIVE YOGAS & DASHA CYCLES -->
  <div class="page">
    <div class="header">
      <div class="header-eyebrow">
        <div class="eyebrow-line"></div>
        <span class="eyebrow-text">Yogas & Timing</span>
      </div>
      <h1 class="header-title">Active Yogas & Dasha Cycles</h1>
      <p class="header-subtitle">Vimshottari Dasha periods and key active planetary combinations</p>
      <div class="header-gradient"></div>
    </div>
    <div style="flex:1; display:flex; flex-direction:column; gap:4.5mm;">
      <div>
        <div style="font-size:9pt; font-weight:700; text-transform:uppercase; letter-spacing:1.5px; color:var(--gold-dark); margin-bottom:1.5mm;">
          Active Astrological Yogas
        </div>
        <div class="table-wrap">
          <table class="premium-table">
            <thead>
              <tr>
                <th style="width:35%; padding:2.5mm 3.5mm; font-size:11pt;">Yoga Name</th>
                <th style="width:20%; padding:2.5mm 3.5mm; font-size:11pt;">Strength</th>
                <th style="padding:2.5mm 3.5mm; font-size:11pt;">Significance & Effect</th>
              </tr>
            </thead>
            <tbody>
              ${(reportData.yogaSummary || []).map(y => `
                <tr>
                  <td style="font-weight:700; color:var(--dark-blue); font-size:10.5pt;">${escapeHtml(y.name)}</td>
                  <td style="font-style:italic; color:#6B7280;">${escapeHtml(y.strength)}</td>
                  <td style="font-size:10.5pt; line-height:1.4;">${escapeHtml(y.effect)}</td>
                </tr>
              `).join("")}
            </tbody>
          </table>
        </div>
      </div>

      <div>
        <div style="font-size:9pt; font-weight:700; text-transform:uppercase; letter-spacing:1.5px; color:var(--gold-dark); margin-bottom:1.5mm;">
          Current Dasha Configuration · Vimshottari
        </div>
        <div class="table-wrap">
          <table class="premium-table">
            <thead>
              <tr>
                <th style="width:35%; padding:2.5mm 3.5mm; font-size:11pt;">Dasha Level</th>
                <th style="width:25%; padding:2.5mm 3.5mm; font-size:11pt;">Ruling Planet</th>
                <th style="padding:2.5mm 3.5mm; font-size:11pt;">Period Timeline</th>
              </tr>
            </thead>
            <tbody>
              <tr>
                <td style="font-weight:700; color:var(--dark-blue);">Mahadasha (Major Period)</td>
                <td style="font-weight:700; color:var(--gold-deep);">${escapeHtml(dasha.mahadasha)}</td>
                <td style="color:#555555;">${dasha.fullDasha?.mahaStart || dasha.fullDasha?.mahaEnd ? `${formatDate(dasha.fullDasha.mahaStart)} → ${formatDate(dasha.fullDasha.mahaEnd)}` : "—"}</td>
              </tr>
              <tr>
                <td style="font-weight:700; color:var(--dark-blue);">Antardasha (Sub-Period)</td>
                <td style="font-weight:700; color:var(--gold-deep);">${escapeHtml(dasha.antardasha)}</td>
                <td style="color:#555555;">${dasha.fullDasha?.antarStart || dasha.fullDasha?.antarEnd ? `${formatDate(dasha.fullDasha.antarStart)} → ${formatDate(dasha.fullDasha.antarEnd)}` : "—"}</td>
              </tr>
              <tr>
                <td style="font-weight:700; color:var(--dark-blue);">Pratyantardasha (Sub-Sub)</td>
                <td style="font-weight:700; color:var(--gold-deep);">${escapeHtml(dasha.pratyantardasha)}</td>
                <td style="color:#555555;">${dasha.fullDasha?.pratyStart || dasha.fullDasha?.pratyEnd ? `${formatDate(dasha.fullDasha.pratyStart)} → ${formatDate(dasha.fullDasha.pratyEnd)}` : "—"}</td>
              </tr>
            </tbody>
          </table>
        </div>
      </div>

      <div style="background:var(--gold-light); border:1.5px solid var(--gold); border-radius:8px; padding:3.5mm 4.5mm;">
        <div style="font-size:9.5pt; font-weight:700; color:var(--gold-dark); margin-bottom:1.5mm;">Understanding Your Dasha</div>
        <p style="font-size:11pt; color:#374151; line-height:1.6;">
          The Mahadasha lord (${escapeHtml(dasha.mahadasha)}) governs the broad life themes you are experiencing. The Antardasha lord (${escapeHtml(dasha.antardasha)}) fine-tunes these themes into specific experiences. Pay special attention to predictions related to these planets.
        </p>
      </div>
    </div>
    <div class="footer">
      <span class="footer-left">Vedic Astrology Roadmap ${year} · ${escapeHtml(fullName)}</span>
      <span class="footer-right">Page 12</span>
    </div>
  </div>

  <!-- PAGE 13: BIRTH HOROSCOPE CHARTS -->
  <div class="page">
    <div class="header">
      <div class="header-eyebrow">
        <div class="eyebrow-line"></div>
        <span class="eyebrow-text">Zodiac Visualisations</span>
      </div>
      <h1 class="header-title">Birth Horoscope Charts</h1>
      <p class="header-subtitle">Rasi (D1) and Hora (D2) divisional charts</p>
      <div class="header-gradient"></div>
    </div>
    <div class="charts-container">
      ${renderChartSvg(charts.rasiChart, astro.ascendant, "Rasi Chart (D1)")}
      ${renderChartSvg(charts.horaChart, astro.ascendant, "Hora Chart (D2)")}
    </div>
    <div class="footer">
      <span class="footer-left">Vedic Astrology Roadmap ${year} · ${escapeHtml(fullName)}</span>
      <span class="footer-right">Page 13</span>
    </div>
  </div>

  <!-- PAGE 14: DIVISIONAL CHARTS -->
  <div class="page">
    <div class="header">
      <div class="header-eyebrow">
        <div class="eyebrow-line"></div>
        <span class="eyebrow-text">Divisional Charts</span>
      </div>
      <h1 class="header-title">Navamsa & Dasamsa</h1>
      <p class="header-subtitle">Navamsa (D9) and Dasamsa (D10) divisional charts</p>
      <div class="header-gradient"></div>
    </div>
    <div class="charts-container">
      ${renderChartSvg(charts.navamsaChart, astro.ascendant, "Navamsa Chart (D9)")}
      ${renderChartSvg(charts.dasamsaChart, astro.ascendant, "Dasamsa Chart (D10)")}
    </div>
    <div class="footer">
      <span class="footer-left">Vedic Astrology Roadmap ${year} · ${escapeHtml(fullName)}</span>
      <span class="footer-right">Page 14</span>
    </div>
  </div>

  <!-- PAGE 15: ENERGY METRICS & ASHTAKVARGA -->
  <div class="page">
    <div class="header">
      <div class="header-eyebrow">
        <div class="eyebrow-line"></div>
        <span class="eyebrow-text">Strength Analysis</span>
      </div>
      <h1 class="header-title">Energy Metrics & Ashtakvarga</h1>
      <p class="header-subtitle">Sarvashtakavarga scores and house strength overview</p>
      <div class="header-gradient"></div>
    </div>
    <div style="flex:1;">
      <p style="font-size:11.5pt; color:#374151; line-height:1.6; margin-bottom:3mm; text-align:justify;">
        Ashtakvarga is a unique Vedic system that quantifies the strength of each house in your chart on a scale of 0 to 56 points. Houses scoring 28 or above are considered strong and bring positive results for the life domains they govern. Houses below 28 require more conscious effort and remedial support.
      </p>
      <div class="table-wrap" style="flex:1; margin-top: 1mm;">
        <table class="premium-table">
          <thead>
            <tr>
              <th style="width: 12%; text-align:center; padding:2mm 3mm; font-size:11pt;">House</th>
              <th style="width: 18%; text-align:center; padding:2mm 3mm; font-size:11pt;">SAV Score</th>
              <th style="width: 25%; padding:2mm 3mm; font-size:11pt;">Strength</th>
              <th style="padding:2mm 3mm; font-size:11pt;">Life Domain</th>
            </tr>
          </thead>
          <tbody>
            ${[1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12].map(house => {
              const score = (reportData.energyMetrics?.scores && reportData.energyMetrics.scores[house]) ?? 28;
              const strength = getHouseStrength(score);
              const signification = HOUSE_SIGNIFICATIONS[house];
              return `
                <tr>
                  <td style="text-align:center; font-weight:800; color:var(--gold-dark); font-size:13pt;">${house}</td>
                  <td style="text-align:center; font-weight:800; font-size:13pt;">${score}</td>
                  <td>
                    <span style="font-weight:700; font-size:12.5pt; color:#374151;">${strength}</span>
                  </td>
                  <td style="font-size:12.5pt; font-weight:500;">${signification.name.split(" ")[0]}</td>
                </tr>
              `;
            }).join("")}
          </tbody>
        </table>
      </div>
    </div>
    <div class="footer">
      <span class="footer-left">Vedic Astrology Roadmap ${year} · ${escapeHtml(fullName)}</span>
      <span class="footer-right">Page 15</span>
    </div>
  </div>

  <!-- PAGES 16 to 243: 12 MONTHS PREDICTIONS -->
  ${monthsHtml}

  <!-- PAGE 244: CLOSING END COVER -->
  <div class="img-page-bg bg-end" style="page-break-after: avoid;"></div>

</body>
</html>
`;
}

/**
 * Generate PDF from Yearly report data
 * @param {Object} reportData - Complete yearly forecast payload
 * @param {Object} userRequest - User request coordinates
 * @returns {Promise<Buffer>} PDF buffer
 */
async function generateYearlyReportPDF(reportData, userRequest) {
    let browser = null;
    console.log("[Yearly PDF Service] Beginning PDF generation...");
    try {
        console.log("[Yearly PDF Service] Building HTML template...");
        const htmlContent = generateHTMLTemplate(reportData, userRequest);

        // Dump HTML for debugging and reference (matches temp folder behavior)
        try {
            const tempDir = path.join(__dirname, "../temp");
            if (!fs.existsSync(tempDir)) {
                fs.mkdirSync(tempDir, { recursive: true });
            }
            const htmlFileName = `yearly_report_${Date.now()}.html`;
            fs.writeFileSync(path.join(tempDir, htmlFileName), htmlContent, "utf8");
            console.log(`[Yearly PDF Service] Dumped HTML to temp for reference: ${htmlFileName}`);
        } catch (dumpErr) {
            console.warn("[Yearly PDF Service] Failed to write HTML dump (safe to ignore):", dumpErr.message);
        }

        console.log("[Yearly PDF Service] Launching browser...");
        browser = await puppeteer.launch(getPuppeteerLaunchOptions());

        const page = await browser.newPage();

        console.log("[Yearly PDF Service] Setting page content...");
        await page.setContent(htmlContent, {
            waitUntil: "load",
            timeout: 120000
        });

        console.log("[Yearly PDF Service] Printing to PDF...");
        const pdfBuffer = await page.pdf({
            format: "A4",
            printBackground: true,
            timeout: 120000,
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
            console.warn("[Yearly PDF Service] Browser close warning (safe to ignore):", closeError.message);
        }

        return Buffer.from(pdfBuffer);

    } catch (error) {
        if (browser) {
            try {
                await browser.close();
            } catch (closeError) {
                console.warn("[Yearly PDF Service] Browser close warning in catch (safe to ignore):", closeError.message);
            }
        }
        console.error("[Yearly PDF Service] Error generating PDF:", error);

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
    generateYearlyReportPDF,
};
