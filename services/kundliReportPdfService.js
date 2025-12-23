const puppeteer = require("puppeteer");
const path = require("path");
const fs = require("fs");

/**
 * Generate PDF from Kundli report data
 * @param {Object} reportData - Enhanced report content from OpenAI
 * @param {Object} kundliData - Complete kundli data with charts
 * @param {Object} userDetails - User basic details
 * @returns {Promise<Buffer>} PDF buffer
 */
async function generateKundliReportPDF(reportData, kundliData, userDetails) {
  let browser = null;
  
  try {
    const { fullName, dateOfbirth, timeOfbirth, placeOfBirth } = userDetails;
    
    // Extract chart data for visualization
    const chartData = kundliData.charts?.north_indian_chart || kundliData.charts?.south_indian_chart || [];
    
    // Create HTML content for PDF
    const htmlContent = generateHTMLTemplate(reportData, userDetails, chartData);
    
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
    
    // Generate PDF
    const pdfBuffer = await page.pdf({
      format: 'A4',
      printBackground: true,
      margin: {
        top: '20mm',
        right: '15mm',
        bottom: '20mm',
        left: '15mm'
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
 * Generate HTML template for PDF
 */
function generateHTMLTemplate(reportData, userDetails, chartData) {
  const { fullName, dateOfbirth, timeOfbirth, placeOfBirth } = userDetails;
  const currentYear = new Date().getFullYear();
  
  // Process chart data for visualization
  const chartHTML = generateChartHTML(chartData);
  
  return `
<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>Yearly Vedic Astrology Report - ${fullName}</title>
  <style>
    * {
      margin: 0;
      padding: 0;
      box-sizing: border-box;
    }
    
    body {
      font-family: 'Georgia', 'Times New Roman', serif;
      background: #0a1628;
      color: #e8eaed;
      line-height: 1.6;
    }
    
    .page {
      background: linear-gradient(135deg, #0a1628 0%, #1a2744 100%);
      min-height: 100vh;
      padding: 40px;
    }
    
    .header {
      text-align: center;
      margin-bottom: 40px;
      border-bottom: 2px solid #d4af37;
      padding-bottom: 30px;
    }
    
    .main-title {
      font-size: 42px;
      font-weight: 700;
      color: #d4af37;
      margin-bottom: 15px;
      text-transform: uppercase;
      letter-spacing: 2px;
    }
    
    .subtitle {
      font-size: 18px;
      color: #b8b8b8;
      margin-bottom: 10px;
    }
    
    .birth-details {
      background: rgba(212, 175, 55, 0.1);
      border: 1px solid #d4af37;
      border-radius: 8px;
      padding: 20px;
      margin: 30px 0;
    }
    
    .birth-details-grid {
      display: grid;
      grid-template-columns: repeat(2, 1fr);
      gap: 15px;
    }
    
    .detail-item {
      font-size: 14px;
    }
    
    .detail-label {
      color: #d4af37;
      font-weight: 600;
      margin-right: 8px;
    }
    
    .detail-value {
      color: #e8eaed;
    }
    
    .chart-container {
      margin: 40px 0;
      text-align: center;
    }
    
    .chart-title {
      font-size: 24px;
      color: #d4af37;
      margin-bottom: 20px;
      font-weight: 600;
    }
    
    .chart-wrapper {
      display: inline-block;
      position: relative;
      width: 400px;
      height: 400px;
    }
    
    .chart {
      width: 100%;
      height: 100%;
      position: relative;
      transform: rotate(45deg);
      border: 3px solid #d4af37;
    }
    
    .chart-house {
      position: absolute;
      width: 50%;
      height: 50%;
      display: flex;
      align-items: center;
      justify-content: center;
      border: 1.5px solid #d4af37;
      font-size: 12px;
      color: #d4af37;
      font-weight: 600;
    }
    
    .house-1 { top: 0; left: 50%; transform: rotate(-45deg); }
    .house-2 { top: 0; right: 0; transform: rotate(-45deg); }
    .house-3 { top: 25%; right: 0; transform: rotate(-45deg); }
    .house-4 { top: 50%; right: 0; transform: rotate(-45deg); }
    .house-5 { bottom: 0; right: 0; transform: rotate(-45deg); }
    .house-6 { bottom: 0; right: 50%; transform: rotate(-45deg); }
    .house-7 { bottom: 0; left: 0; transform: rotate(-45deg); }
    .house-8 { bottom: 25%; left: 0; transform: rotate(-45deg); }
    .house-9 { top: 50%; left: 0; transform: rotate(-45deg); }
    .house-10 { top: 25%; left: 0; transform: rotate(-45deg); }
    .house-11 { top: 0; left: 0; transform: rotate(-45deg); }
    .house-12 { top: 0; left: 25%; transform: rotate(-45deg); }
    
    .house-label {
      position: absolute;
      bottom: 5px;
      right: 5px;
      font-size: 10px;
      opacity: 0.7;
    }
    
    .chart-note {
      margin-top: 15px;
      font-size: 12px;
      color: #b8b8b8;
      font-style: italic;
    }
    
    .content-section {
      margin: 40px 0;
      page-break-inside: avoid;
    }
    
    .section-title {
      font-size: 28px;
      color: #d4af37;
      margin-bottom: 20px;
      font-weight: 600;
      border-left: 4px solid #d4af37;
      padding-left: 15px;
    }
    
    .section-content {
      background: rgba(26, 39, 68, 0.5);
      border: 1px solid rgba(212, 175, 55, 0.3);
      border-radius: 8px;
      padding: 25px;
      font-size: 15px;
      line-height: 1.8;
      text-align: justify;
    }
    
    .section-content p {
      margin-bottom: 15px;
    }
    
    .remedies-list {
      list-style: none;
      padding: 0;
    }
    
    .remedies-list li {
      background: rgba(212, 175, 55, 0.1);
      border-left: 3px solid #d4af37;
      padding: 12px 15px;
      margin-bottom: 10px;
      border-radius: 4px;
    }
    
    .remedies-list li:before {
      content: "✦ ";
      color: #d4af37;
      font-weight: bold;
      margin-right: 8px;
    }
    
    .footer {
      margin-top: 60px;
      text-align: center;
      padding-top: 30px;
      border-top: 2px solid #d4af37;
      font-size: 13px;
      color: #b8b8b8;
    }
    
    .footer-note {
      margin-top: 10px;
      font-style: italic;
    }
    
    @media print {
      .page-break {
        page-break-before: always;
      }
    }
  </style>
</head>
<body>
  <div class="page">
    <!-- Header -->
    <div class="header">
      <h1 class="main-title">Yearly Vedic Astrology Report</h1>
      <p class="subtitle">Prepared exclusively for ${fullName}</p>
    </div>
    
    <!-- Birth Details -->
    <div class="birth-details">
      <div class="birth-details-grid">
        <div class="detail-item">
          <span class="detail-label">Name:</span>
          <span class="detail-value">${fullName}</span>
        </div>
        <div class="detail-item">
          <span class="detail-label">Date of Birth:</span>
          <span class="detail-value">${dateOfbirth}</span>
        </div>
        <div class="detail-item">
          <span class="detail-label">Time of Birth:</span>
          <span class="detail-value">${timeOfbirth}</span>
        </div>
        <div class="detail-item">
          <span class="detail-label">Place of Birth:</span>
          <span class="detail-value">${placeOfBirth}</span>
        </div>
      </div>
    </div>
    
    <!-- Overview Section -->
    <div class="content-section">
      <h2 class="section-title">Overview - ${currentYear}</h2>
      <div class="section-content">
        ${formatTextContent(reportData.reportContent.overview)}
      </div>
    </div>
    
    <!-- Birth Chart -->
    <div class="chart-container">
      <h2 class="chart-title">Birth Chart (Kundli)</h2>
      ${chartHTML}
      <p class="chart-note">North Indian Style Vedic Chart</p>
    </div>
    
    <!-- Page Break -->
    <div class="page-break"></div>
    
    <!-- Career & Finance Section -->
    <div class="content-section">
      <h2 class="section-title">Career & Finance</h2>
      <div class="section-content">
        ${formatTextContent(reportData.reportContent.careerFinance)}
      </div>
    </div>
    
    <!-- Relationships Section -->
    <div class="content-section">
      <h2 class="section-title">Relationships</h2>
      <div class="section-content">
        ${formatTextContent(reportData.reportContent.relationships)}
      </div>
    </div>
    
    <!-- Health & Wellness Section -->
    <div class="content-section">
      <h2 class="section-title">Health & Wellness</h2>
      <div class="section-content">
        ${formatTextContent(reportData.reportContent.healthWellness)}
      </div>
    </div>
    
    <!-- Spiritual Growth Section -->
    <div class="content-section">
      <h2 class="section-title">Spiritual Growth</h2>
      <div class="section-content">
        ${formatTextContent(reportData.reportContent.spiritualGrowth)}
      </div>
    </div>
    
    <!-- Monthly Predictions Section -->
    <div class="content-section">
      <h2 class="section-title">Monthly Predictions</h2>
      <div class="section-content">
        ${formatTextContent(reportData.reportContent.monthlyPredictions)}
      </div>
    </div>
    
    <!-- Remedies Section -->
    ${reportData.reportContent.remedies && reportData.reportContent.remedies.length > 0 ? `
    <div class="content-section">
      <h2 class="section-title">Recommended Remedies</h2>
      <div class="section-content">
        <ul class="remedies-list">
          ${reportData.reportContent.remedies.map(remedy => `<li>${remedy}</li>`).join('')}
        </ul>
      </div>
    </div>
    ` : ''}
    
    <!-- Footer -->
    <div class="footer">
      <p>Generated by Graho - Your Trusted Astrology Platform</p>
      <p class="footer-note">This report is based on Vedic astrology principles and should be used for guidance purposes.</p>
    </div>
  </div>
</body>
</html>
  `;
}

/**
 * Generate chart HTML visualization
 */
function generateChartHTML(chartData) {
  // Create a simple diamond chart visualization
  // chartData is an array where each element represents a house
  
  if (!chartData || chartData.length === 0) {
    return '<p style="color: #b8b8b8;">Chart data not available</p>';
  }
  
  let chartHTML = '<div class="chart-wrapper"><div class="chart">';
  
  // North Indian chart has 12 houses
  for (let i = 1; i <= 12; i++) {
    const houseData = chartData.find(h => h.house === i) || {};
    const planets = houseData.planets || houseData.sign || i;
    
    chartHTML += `
      <div class="chart-house house-${i}">
        <span>${planets}</span>
        <span class="house-label">${i}</span>
      </div>
    `;
  }
  
  chartHTML += '</div></div>';
  
  return chartHTML;
}

/**
 * Format text content with paragraphs
 */
function formatTextContent(text) {
  if (!text) return '<p>Content not available</p>';
  
  // Split by double newlines or periods followed by newlines
  const paragraphs = text.split(/\n\n|\.\s+(?=[A-Z])/);
  
  return paragraphs
    .filter(p => p.trim())
    .map(p => `<p>${p.trim()}</p>`)
    .join('');
}

module.exports = {
  generateKundliReportPDF,
};
