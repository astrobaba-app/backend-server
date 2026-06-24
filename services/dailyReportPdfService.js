const puppeteer = require("puppeteer");
const fs = require("fs");
const path = require("path");
const {
  buildSharedReportClosingPage,
  buildSharedReportClosingStyles,
} = require("./reportClosingPageService");

const BACKEND_REPORT_IMAGES = path.resolve(__dirname, "../images");
const FRONTEND_PUBLIC_IMAGES = path.resolve(__dirname, "../../Frontend-server/public/images");

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
    const parsed = path.parse(fileName);
    const candidates = [
      path.join(BACKEND_REPORT_IMAGES, fileName),
      path.join(BACKEND_REPORT_IMAGES, `${parsed.name}.png`),
      path.join(BACKEND_REPORT_IMAGES, `${parsed.name}.jpg`),
      path.join(BACKEND_REPORT_IMAGES, `${parsed.name}.jpeg`),
      path.join(FRONTEND_PUBLIC_IMAGES, fileName),
      path.join(FRONTEND_PUBLIC_IMAGES, `${parsed.name}.png`),
      path.join(FRONTEND_PUBLIC_IMAGES, `${parsed.name}.jpg`),
      path.join(FRONTEND_PUBLIC_IMAGES, `${parsed.name}.jpeg`),
    ];
    const fullPath = candidates.find((candidate) => fs.existsSync(candidate));
    if (!fullPath) {
      console.warn(`[Daily PDF Service] Image not found for ${fileName}`);
      return "";
    }
    const buffer = fs.readFileSync(fullPath);
    const ext = path.extname(fullPath).toLowerCase();
    const mime = ext === ".jpg" || ext === ".jpeg" ? "image/jpeg" : "image/png";
    return `data:${mime};base64,${buffer.toString("base64")}`;
  } catch (error) {
    console.error(`[Daily PDF Service] Error reading image ${fileName}:`, error);
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

const formatMarkdownToHtml = (markdown) => {
  if (!markdown) return "";
  return markdown
    .replace(/^##\s+(.*)$/gim, "<h2>$1</h2>")
    .replace(/^#\s+(.*)$/gim, "<h1>$1</h1>")
    .replace(/\*\*(.*?)\*\*/g, "<strong>$1</strong>")
    .replace(/\*(.*?)\*/g, "<em>$1</em>")
    .split(/\n\n+/)
    .map(para => {
      para = para.trim();
      if (!para) return "";
      if (para.startsWith("<h2>") || para.startsWith("<h1>")) return para;
      if (para.startsWith("-") || para.startsWith("*")) {
        const items = para.split(/\n[-*]\s+/).map(item => {
          const cleanItem = item.replace(/^[-*]\s+/, "").trim();
          return cleanItem ? `<li>${cleanItem}</li>` : "";
        }).filter(Boolean).join("");
        return `<ul>${items}</ul>`;
      }
      return `<p>${para}</p>`;
    })
    .join("\n");
};

/**
 * Generate PDF from Daily report data
 * @param {Object} reportData - Daily forecast content and metadata
 * @param {Object} userDetails - User basic details
 * @returns {Promise<Buffer>} PDF buffer
 */
async function generateDailyReportPDF(reportData, userDetails) {
  let browser = null;
  try {
    const htmlContent = await generateDailyHTMLTemplate(reportData, userDetails);
    browser = await puppeteer.launch(getPuppeteerLaunchOptions());
    const page = await browser.newPage();

    await page.setContent(htmlContent, {
      waitUntil: "domcontentloaded",
      timeout: 45000,
    });

    const pdfBuffer = await page.pdf({
      format: "A4",
      printBackground: true,
      margin: {
        top: 0,
        right: 0,
        bottom: 0,
        left: 0
      },
      timeout: 120000,
    });

    try {
      await browser.close();
    } catch (closeError) {
      console.warn("[Daily PDF Service] Browser close warning (safe to ignore):", closeError.message);
    }
    return Buffer.isBuffer(pdfBuffer) ? pdfBuffer : Buffer.from(pdfBuffer);
  } catch (error) {
    if (browser) {
      try {
        await browser.close();
      } catch (closeError) {
        console.warn("[Daily PDF Service] Browser close warning in catch (safe to ignore):", closeError.message);
      }
    }
    console.error("[Daily PDF Service] Error generating daily PDF:", error);
    throw new Error(`Failed to generate daily PDF: ${error.message}`);
  }
}

async function generateDailyHTMLTemplate(reportData, userDetails) {
  const coverImg = imageToDataUri("dailyfirstpage.jpg");
  const closingAssets = {
    logo: imageToDataUri("logo.png"),
    qrCode: imageToDataUri("QR.png"),
    googlePlayBadge: imageToDataUri("googleplay.png"),
    appStoreBadge: imageToDataUri("appstore.png"),
  };

  const { fullName, gender, dateOfbirth, timeOfbirth, placeOfBirth } = userDetails;

  const basicDetails = reportData.basicDetails || {};
  const activeDasha = reportData.activeDasha || {};
  const moonTransit = reportData.moonTransit || {};
  const forecast = reportData.dailyForecast || {};

  const reportDate = basicDetails.reportDate || new Date().toISOString().slice(0, 10);
  const formattedReportDate = new Date(reportDate).toLocaleDateString("en-US", {
    weekday: "long",
    year: "numeric",
    month: "long",
    day: "numeric"
  });

  const formattedBirthDate = dateOfbirth ? new Date(dateOfbirth).toLocaleDateString("en-US", {
    year: "numeric",
    month: "long",
    day: "numeric"
  }) : "--";

  const descriptionHtml = formatMarkdownToHtml(reportData.disclaimer);

  // Table of Contents sections
  const tocEntries = [
    { title: "1. Disclaimer & Description", page: 2 },
    { title: "2. Table of Contents", page: 3 },
    { title: "3. Cosmic Snapshot (Basic Kundli)", page: 4 },
    { title: "4. Daily Predictions & Forecast", page: 5 },
    { title: "5. Planetary Action Guides", page: 6 },
    { title: "6. Smart Time Windows", page: 7 }
  ];

  const timeWindows = forecast.smartTimeWindows || [];
  const timeWindowChunks = [];
  for (let index = 0; index < timeWindows.length; index += 6) {
    timeWindowChunks.push(timeWindows.slice(index, index + 6));
  }
  if (!timeWindowChunks.length) {
    timeWindowChunks.push([]);
  }

  const renderTimeWindowsRows = (rows) => rows.map(w => `
    <tr>
      <td>${escapeHtml(w.timeWindow || w.time)}</td>
      <td>${escapeHtml(w.favourableActivities || w.activities || "N/A")}</td>
      <td>${escapeHtml(w.areasForCaution || w.caution || "None")}</td>
    </tr>
  `).join("");

  const smartWindowPages = timeWindowChunks.map((chunk, index) => `
    <div class="page page-content smart-window-page">
      <div class="section-header">
        <div class="section-title">Smart Time Windows${timeWindowChunks.length > 1 ? ` - ${index + 1}` : ""}</div>
        <div class="section-subtitle">Astrological hourly breakdown & activities timing recommendations</div>
      </div>
      
      <table class="windows-table">
        <thead>
          <tr>
            <th style="width: 24%;">Time Window</th>
            <th style="width: 39%;">Favourable Activities</th>
            <th style="width: 37%;">Areas for Caution</th>
          </tr>
        </thead>
        <tbody>
          ${chunk.length ? renderTimeWindowsRows(chunk) : `
            <tr>
              <td colspan="3">No smart time windows available for this report.</td>
            </tr>
          `}
        </tbody>
      </table>
      
      <div class="pdf-footer">
        <span>Daily Kundli & Forecast Report</span>
        <span>Page ${7 + index}</span>
      </div>
    </div>
  `).join("");

  return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <title>Daily Kundli & Forecast Report</title>
  <style>
    @page {
      size: A4 portrait;
      margin: 0;
    }
    
    * {
      margin: 0;
      padding: 0;
      box-sizing: border-box;
    }
    
    body {
      font-family: Arial, Helvetica, sans-serif;
      color: #000000;
      background: #ffffff;
      -webkit-print-color-adjust: exact;
    }
    
    .page {
      width: 210mm;
      height: 297mm;
      position: relative;
      page-break-after: always;
      background-size: 100% 100%;
      background-repeat: no-repeat;
      background-position: center;
      overflow: hidden;
    }
    
    .page:last-child {
      page-break-after: avoid;
    }
    
    /* Cover Page Styles */
    .page-cover {
      background-image: url('${coverImg}');
      background-size: cover;
      background-position: center;
    }
    
    /* Content Page Styles */
    .page-content {
      background: #ffffff !important;
      padding: 28mm 22mm 24mm 22mm;
      display: flex;
      flex-direction: column;
    }
    
    .section-header {
      border-bottom: 2px solid #d9911f;
      padding-bottom: 2.5mm;
      margin-bottom: 6mm;
    }
    
    .section-title {
      font-size: 18pt;
      font-weight: 700;
      color: #7a3e12;
      text-transform: uppercase;
      letter-spacing: 1px;
    }
    
    .section-subtitle {
      font-size: 10pt;
      color: #0f766e;
      margin-top: 1mm;
      font-weight: 500;
    }
    
    /* Description (Page 2) & General Text Styles */
    .text-container {
      font-size: 10.5pt;
      line-height: 1.6;
      color: #000000;
      text-align: justify;
    }
    
    .text-container h2 {
      font-size: 13pt;
      font-weight: 700;
      margin: 5mm 0 2mm 0;
      color: #000000;
    }
    
    .text-container p {
      margin-bottom: 4mm;
    }
    
    .text-container ul {
      margin-bottom: 4mm;
      padding-left: 6mm;
    }
    
    .text-container li {
      margin-bottom: 1.5mm;
    }
    
    /* Table of Contents (Page 3) */
    .toc-container {
      margin-top: 10mm;
      width: 100%;
    }
    
    .toc-row {
      display: flex;
      align-items: baseline;
      justify-content: space-between;
      margin-bottom: 5mm;
      font-size: 12pt;
      font-weight: 500;
    }
    
    .toc-title {
      color: #334155;
    }
    
    .toc-dots {
      flex-grow: 1;
      border-bottom: 2px dotted #d9911f;
      margin: 0 4mm;
    }
    
    .toc-page {
      font-weight: 700;
      color: #c87914;
    }
    
    /* Basic Kundli Details (Page 4) */
    .kundli-grid {
      display: grid;
      grid-template-columns: 1fr 1fr;
      gap: 5mm;
      margin-bottom: 6mm;
    }
    
    .premium-card {
      background: linear-gradient(180deg, #fffaf0, #ffffff);
      border: 1px solid #f0c66f;
      border-radius: 6px;
      padding: 4.5mm;
      box-shadow: 0 6px 18px rgba(122, 62, 18, 0.08);
    }
    
    .premium-card h3 {
      font-size: 11pt;
      font-weight: 700;
      text-transform: uppercase;
      color: #0f766e;
      border-bottom: 1px solid #f0c66f;
      padding-bottom: 1.5mm;
      margin-bottom: 3mm;
      letter-spacing: 0.5px;
    }
    
    .card-row {
      display: flex;
      justify-content: space-between;
      margin-bottom: 2mm;
      font-size: 9.5pt;
      line-height: 1.4;
    }
    
    .card-label {
      font-weight: 500;
      color: #64748b;
    }
    
    .card-value {
      font-weight: 700;
      color: #7a3e12;
      text-align: right;
    }
    
    /* Daily Forecast Page 5 & 6 */
    .forecast-section {
      margin-bottom: 5mm;
    }
    
    .forecast-title {
      font-size: 12pt;
      font-weight: 700;
      color: #0f766e;
      text-transform: uppercase;
      margin-bottom: 2mm;
      display: flex;
      align-items: center;
      gap: 2mm;
    }
    
    .forecast-title::after {
      content: "";
      flex-grow: 1;
      height: 1px;
      background: #f0c66f;
    }
    
    .forecast-body {
      font-size: 10pt;
      line-height: 1.55;
      color: #1f2937;
      margin-bottom: 4mm;
      text-align: justify;
      background: #fffaf0;
      border-left: 3px solid #d9911f;
      padding: 3mm 4mm;
    }
    
    .bullet-list {
      margin-bottom: 4mm;
      padding-left: 5mm;
    }
    
    .bullet-list li {
      font-size: 9.5pt;
      line-height: 1.5;
      margin-bottom: 2mm;
      color: #1f2937;
    }
    
    .lucky-grid {
      display: grid;
      grid-template-columns: 1fr 1fr 1fr;
      gap: 4mm;
      margin-top: 2mm;
    }
    
    .lucky-item-card {
      background: linear-gradient(180deg, #fff8db, #ffffff);
      border: 1px solid #f0c66f;
      border-radius: 4px;
      padding: 3mm;
      text-align: center;
    }
    
    .lucky-item-label {
      font-size: 8pt;
      font-weight: 700;
      text-transform: uppercase;
      color: #0f766e;
      margin-bottom: 1mm;
    }
    
    .lucky-item-value {
      font-size: 10.5pt;
      font-weight: 700;
      color: #7a3e12;
    }
    
    /* Table styling (Page 7) */
    .windows-table {
      width: 100%;
      border-collapse: collapse;
      margin-top: 2mm;
      box-shadow: 0 8px 22px rgba(122, 62, 18, 0.08);
    }
    
    .windows-table th {
      background-color: #0f766e;
      color: #ffffff;
      font-weight: 700;
      font-size: 8.8pt;
      text-transform: uppercase;
      padding: 2.6mm 3mm;
      text-align: left;
      border: 1px solid #0f766e;
    }
    
    .windows-table td {
      padding: 2.7mm 3mm;
      font-size: 8.5pt;
      line-height: 1.32;
      border: 1px solid #ead8b5;
      color: #263238;
      vertical-align: top;
    }
    
    .windows-table tr:nth-child(even) {
      background-color: #fffaf0;
    }

    .windows-table tr:nth-child(odd) {
      background-color: #ffffff;
    }
    
    ${buildSharedReportClosingStyles()}
    
    /* Header/Footer Overlay details */
    .pdf-footer {
      position: absolute;
      bottom: 12mm;
      left: 22mm;
      right: 22mm;
      display: flex;
      justify-content: space-between;
      font-size: 7.5pt;
      color: #888888;
      border-top: 1px solid rgba(0,0,0,0.08);
      padding-top: 2mm;
      pointer-events: none;
    }
  </style>
</head>
<body>

  <!-- PAGE 1: Cover Page -->
  <div class="page page-cover">
  </div>

  <!-- PAGE 2: Description (Disclaimer) -->
  <div class="page page-content">
    <div class="section-header">
      <div class="section-title">Description</div>
      <div class="section-subtitle">Scope, guidance, and disclaimer of your daily astrological analysis</div>
    </div>
    <div class="text-container">
      ${descriptionHtml}
    </div>
    <div class="pdf-footer">
      <span>Daily Kundli & Forecast Report</span>
      <span>Page 2</span>
    </div>
  </div>

  <!-- PAGE 3: Table of Contents -->
  <div class="page page-content">
    <div class="section-header">
      <div class="section-title">Table of Contents</div>
      <div class="section-subtitle">Summary index of the sections contained in this briefing</div>
    </div>
    <div class="toc-container">
      ${tocEntries.map(e => `
        <div class="toc-row">
          <span class="toc-title">${escapeHtml(e.title)}</span>
          <span class="toc-dots"></span>
          <span class="toc-page">Page ${e.page}</span>
        </div>
      `).join("")}
    </div>
    <div class="pdf-footer">
      <span>Daily Kundli & Forecast Report</span>
      <span>Page 3</span>
    </div>
  </div>

  <!-- PAGE 4: Basic Kundli Details -->
  <div class="page page-content">
    <div class="section-header">
      <div class="section-title">Cosmic Snapshot</div>
      <div class="section-subtitle">Basic birth details, ascendant, planetary transits & active dasha chain</div>
    </div>
    
    <div class="kundli-grid">
      <!-- Card 1: Personal Details -->
      <div class="premium-card">
        <h3>Personal Details</h3>
        <div class="card-row">
          <span class="card-label">Name</span>
          <span class="card-value">${escapeHtml(fullName)}</span>
        </div>
        <div class="card-row">
          <span class="card-label">Gender</span>
          <span class="card-value">${escapeHtml(gender)}</span>
        </div>
        <div class="card-row">
          <span class="card-label">Birth Date</span>
          <span class="card-value">${escapeHtml(formattedBirthDate)}</span>
        </div>
        <div class="card-row">
          <span class="card-label">Birth Place</span>
          <span class="card-value">${escapeHtml(placeOfBirth)}</span>
        </div>
        <div class="card-row">
          <span class="card-label">Current Age</span>
          <span class="card-value">${escapeHtml(basicDetails.age ?? "--")} Years</span>
        </div>
      </div>
      
      <!-- Card 2: Birth Kundli Coordinates -->
      <div class="premium-card">
        <h3>Kundli Snapshot</h3>
        <div class="card-row">
          <span class="card-label">Ascendant (Lagna)</span>
          <span class="card-value">${escapeHtml(basicDetails.ascendant ?? "--")}</span>
        </div>
        <div class="card-row">
          <span class="card-label">Moon Sign (Rashi)</span>
          <span class="card-value">${escapeHtml(basicDetails.moonSign ?? "--")}</span>
        </div>
        <div class="card-row">
          <span class="card-label">Nakshatra Today</span>
          <span class="card-value">${escapeHtml(moonTransit.nakshatra ?? "--")}</span>
        </div>
        <div class="card-row">
          <span class="card-label">Report Date</span>
          <span class="card-value">${escapeHtml(reportDate)}</span>
        </div>
      </div>
    </div>
    
    <div class="kundli-grid">
      <!-- Card 3: Active Dasha Period -->
      <div class="premium-card">
        <h3>Active Dasha Chain</h3>
        <div class="card-row">
          <span class="card-label">Mahadasha</span>
          <span class="card-value">${escapeHtml(activeDasha.mahadasha ?? "--")}</span>
        </div>
        <div class="card-row">
          <span class="card-label">Antardasha</span>
          <span class="card-value">${escapeHtml(activeDasha.antardasha ?? "--")}</span>
        </div>
        <div class="card-row">
          <span class="card-label">Pratyantardasha</span>
          <span class="card-value">${escapeHtml(activeDasha.pratyantardasha ?? "--")}</span>
        </div>
      </div>
      
      <!-- Card 4: Moon Transit Today -->
      <div class="premium-card">
        <h3>Transit System</h3>
        <div class="card-row">
          <span class="card-label">Moon Sign</span>
          <span class="card-value">${escapeHtml(moonTransit.sign ?? "--")}</span>
        </div>
        <div class="card-row">
          <span class="card-label">Day Lord</span>
          <span class="card-value">${escapeHtml(moonTransit.dayLord ?? "--")}</span>
        </div>
        <div class="card-row">
          <span class="card-label">Moment Lord</span>
          <span class="card-value">${escapeHtml(moonTransit.momentLord ?? "--")}</span>
        </div>
      </div>
    </div>
    
    <div class="pdf-footer">
      <span>Daily Kundli & Forecast Report</span>
      <span>Page 4</span>
    </div>
  </div>

  <!-- PAGE 5: Daily Predictions & Forecast Overview -->
  <div class="page page-content">
    <div class="section-header">
      <div class="section-title">Daily Forecast & predictions</div>
      <div class="section-subtitle">Forecast for ${escapeHtml(formattedReportDate)}</div>
    </div>
    
    <div class="forecast-section">
      <div class="forecast-title">Today's Energy Overview</div>
      <div class="forecast-body">
        ${escapeHtml(forecast.yourDayOverview || "No overview available for today.")}
      </div>
    </div>
    
    <div class="forecast-section">
      <div class="forecast-title">Today's Focus Priorities</div>
      <ul class="bullet-list">
        ${(forecast.todaysFocus || []).map(f => `<li>${escapeHtml(f)}</li>`).join("")}
      </ul>
    </div>
    
    <div class="forecast-section">
      <div class="forecast-title">Lucky Astrological Support</div>
      <div class="lucky-grid">
        <div class="lucky-item-card">
          <div class="lucky-item-label">Lucky Color</div>
          <div class="lucky-item-value">${escapeHtml(forecast.luckySupport?.luckyColor || "--")}</div>
        </div>
        <div class="lucky-item-card">
          <div class="lucky-item-label">Lucky Number</div>
          <div class="lucky-item-value">${escapeHtml(forecast.luckySupport?.luckyNumber || "--")}</div>
        </div>
        <div class="lucky-item-card">
          <div class="lucky-item-label">Lucky Item</div>
          <div class="lucky-item-value">${escapeHtml(forecast.luckySupport?.luckyItem || "--")}</div>
        </div>
      </div>
    </div>
    
    <div class="pdf-footer">
      <span>Daily Kundli & Forecast Report</span>
      <span>Page 5</span>
    </div>
  </div>

  <!-- PAGE 6: Planetary Action Guides & Opportunities -->
  <div class="page page-content">
    <div class="section-header">
      <div class="section-title">Cosmic Action Guides</div>
      <div class="section-subtitle">Personalized action guides based on planetary signals</div>
    </div>
    
    <div class="forecast-section">
      <div class="forecast-title">Hidden Opportunity</div>
      <div class="forecast-body">
        ${escapeHtml(forecast.hiddenOpportunity || "No hidden opportunities flagged for today.")}
      </div>
    </div>
    
    <div class="forecast-section">
      <div class="forecast-title">Work, Productivity & Money</div>
      <div class="forecast-body">
        ${escapeHtml(forecast.actionGuide?.workProductivityMoney || "Standard energetic work alignment.")}
      </div>
    </div>
    
    <div class="forecast-section">
      <div class="forecast-title">Relationships & Communication</div>
      <div class="forecast-body">
        ${escapeHtml(forecast.actionGuide?.relationships || "Standard connection harmony.")}
      </div>
    </div>
    
    <div class="forecast-section">
      <div class="forecast-title">Health, Vitality & Energy</div>
      <div class="forecast-body">
        ${escapeHtml(forecast.actionGuide?.healthAndEnergy || "Standard physical vitality tips.")}
      </div>
    </div>
    
    <div class="pdf-footer">
      <span>Daily Kundli & Forecast Report</span>
      <span>Page 6</span>
    </div>
  </div>

  ${smartWindowPages}

  ${buildSharedReportClosingPage(closingAssets)}

</body>
</html>
  `;
}

module.exports = {
  generateDailyReportPDF,
};
