const puppeteer = require("puppeteer");

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
    const htmlContent = generateHTMLTemplate(reportData, userDetails);
    
    // Launch browser
    browser = await puppeteer.launch({
      headless: true,
      args: ['--no-sandbox', '--disable-setuid-sandbox']
    });
    
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
    throw new Error(`Failed to generate PDF: ${error.message}`);
  }
}

/**
 * Generate HTML template for PDF - 8 pages exactly matching the reference format
 */
function generateHTMLTemplate(reportData, userDetails) {
  const { fullName, dateOfbirth, timeOfbirth, placeOfBirth } = userDetails;
  const rc = reportData.reportContent;
  
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
    
    .chart-diamond {
      width: 400px;
      height: 400px;
      margin: 0 auto 20px;
      position: relative;
      transform: rotate(45deg);
    }
    
    .diamond-border {
      width: 100%;
      height: 100%;
      border: 2px solid #f4c430;
      position: relative;
    }
    
    .diamond-line-v {
      position: absolute;
      top: 0;
      left: 50%;
      width: 1px;
      height: 100%;
      background: #f4c430;
    }
    
    .diamond-line-h {
      position: absolute;
      left: 0;
      top: 50%;
      width: 100%;
      height: 1px;
      background: #f4c430;
    }
    
    .house-number {
      position: absolute;
      font-size: 12px;
      color: #f4c430;
      font-weight: 500;
      transform: rotate(-45deg);
    }
    
    .h-top { top: -5px; left: 50%; transform: translate(-50%, 0) rotate(-45deg); }
    .h-right { top: 50%; right: -5px; transform: translate(0, -50%) rotate(-45deg); }
    .h-bottom { bottom: -5px; left: 50%; transform: translate(-50%, 0) rotate(-45deg); }
    .h-left { top: 50%; left: -5px; transform: translate(0, -50%) rotate(-45deg); }
    .h-tr { top: 10%; right: 10%; transform: rotate(-45deg); }
    .h-br { bottom: 10%; right: 10%; transform: rotate(-45deg); }
    .h-bl { bottom: 10%; left: 10%; transform: rotate(-45deg); }
    .h-tl { top: 10%; left: 10%; transform: rotate(-45deg); }
    .h-center-t { top: 25%; left: 50%; transform: translate(-50%, 0) rotate(-45deg); }
    .h-center-r { top: 50%; right: 25%; transform: translate(0, -50%) rotate(-45deg); }
    .h-center-b { bottom: 25%; left: 50%; transform: translate(-50%, 0) rotate(-45deg); }
    .h-center-l { top: 50%; left: 25%; transform: translate(0, -50%) rotate(-45deg); }
    
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
      <div class="chart-diamond">
        <div class="diamond-border">
          <div class="diamond-line-v"></div>
          <div class="diamond-line-h"></div>
          <div class="house-number h-top">Asc [1st House]</div>
          <div class="house-number h-tr">2</div>
          <div class="house-number h-right">3</div>
          <div class="house-number h-br">4</div>
          <div class="house-number h-bottom">5</div>
          <div class="house-number h-bl">6</div>
          <div class="house-number h-left">7</div>
          <div class="house-number h-tl">8</div>
          <div class="house-number h-center-t">12</div>
          <div class="house-number h-center-r">9</div>
          <div class="house-number h-center-b">10</div>
          <div class="house-number h-center-l">11</div>
        </div>
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
