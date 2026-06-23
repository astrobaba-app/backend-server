const escapeHtml = (value) =>
  String(value ?? "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");

const buildSharedReportClosingStyles = () => `
  .shared-report-closing {
    background: #fffdf8 !important;
    color: #1f2937;
    padding: 12mm 16mm 18mm !important;
    font-family: Georgia, "Times New Roman", serif;
  }

  .shared-report-closing::before,
  .shared-report-closing::after {
    content: none !important;
    display: none !important;
  }

  .shared-closing-topbar {
    display: flex;
    align-items: center;
    justify-content: space-between;
    border-bottom: 1px solid #1f766f;
    padding-bottom: 2.5mm;
    margin-bottom: 9mm;
    color: #0f766e;
    font-family: Arial, sans-serif;
    font-size: 8.5px;
    font-weight: 800;
    letter-spacing: 1.2px;
    text-transform: uppercase;
  }

  .shared-closing-brand {
    text-align: center;
    margin-bottom: 4mm;
  }

  .shared-closing-logo {
    width: 26mm;
    height: auto;
    object-fit: contain;
    margin-bottom: 2mm;
  }

  .shared-closing-brand h2 {
    margin: 0;
    color: #9a5a11;
    font-size: 32px;
    line-height: 1;
  }

  .shared-closing-tagline {
    margin: 0;
    color: #7c5a30;
    font-size: 10px;
    font-style: italic;
  }

  .shared-closing-rule {
    height: 1px;
    background: #d7a45b;
    margin: 5mm 0 7mm;
  }

  .shared-about-copy {
    max-width: 162mm;
    margin: 0 auto 8mm;
    text-align: center;
    color: #4b5563;
    font-family: Arial, sans-serif;
    font-size: 11px;
    line-height: 1.55;
  }

  .shared-about-copy p {
    margin: 0 0 4mm;
  }

  .shared-policy-panel {
    max-width: 118mm;
    margin: 0 auto 8mm;
    padding: 0;
    border: 0 !important;
    box-shadow: none !important;
    background: transparent !important;
    text-align: left;
  }

  .shared-policy-panel h3 {
    margin: 0 0 3mm;
    padding-bottom: 2mm;
    border-bottom: 1px solid #d7a45b;
    color: #0f766e;
    font-size: 15px;
    line-height: 1.1;
  }

  .shared-policy-list {
    display: grid;
    grid-template-columns: 1fr 1fr;
    gap: 2.5mm 8mm;
    margin: 0;
    padding: 0;
    list-style: none;
    font-family: Arial, sans-serif;
  }

  .shared-policy-list li {
    position: relative;
    padding-left: 4mm;
    color: #374151;
    font-size: 10.5px;
    line-height: 1.35;
  }

  .shared-policy-list li::before {
    content: "-";
    position: absolute;
    left: 0;
    color: #c87914;
    font-weight: 700;
  }

  .shared-policy-list a {
    color: #374151;
    text-decoration: none;
  }

  .shared-app-panel {
    display: grid;
    grid-template-columns: 26mm 1fr;
    gap: 6mm;
    align-items: center;
    max-width: 174mm;
    margin: 0 auto 8mm;
    padding: 5mm 6mm;
    border: 1px solid rgba(74, 161, 149, 0.45);
    border-radius: 6px;
    background: #effaf7;
    text-align: left;
    font-family: Arial, sans-serif;
  }

  .shared-app-qr {
    width: 24mm;
    height: 24mm;
    object-fit: contain;
    padding: 2mm;
    background: #fff;
    border: 1px solid #d7e8e4;
  }

  .shared-app-panel h3 {
    margin: 0 0 1.5mm;
    color: #0f766e;
    font-size: 13px;
  }

  .shared-app-panel p {
    margin: 0 0 2mm;
    color: #374151;
    font-size: 9.5px;
    line-height: 1.35;
  }

  .shared-store-links {
    display: flex;
    gap: 3mm;
    align-items: center;
    margin-top: 2mm;
  }

  .shared-store-links a {
    color: #111827;
    font-size: 9px;
    font-weight: 700;
    text-decoration: none;
  }

  .shared-store-links img {
    height: 7mm;
    width: auto;
    object-fit: contain;
  }

  .shared-site-link {
    margin-top: 2mm !important;
  }

  .shared-site-link a {
    color: #0f766e;
    text-decoration: none;
    font-weight: 700;
  }

  .shared-closing-footer {
    position: relative;
    left: auto;
    right: auto;
    bottom: auto;
    margin-top: 7mm;
    border-top: 1px solid #0f766e;
    padding-top: 3mm;
    color: #7c5a30;
    font-family: Arial, sans-serif;
    font-size: 8.5px;
    text-align: center;
    letter-spacing: 0.2px;
  }

  .shared-closing-url {
    display: block;
    margin-top: 1.8mm;
    color: #b07110;
    font-size: 9px;
    font-weight: 800;
    letter-spacing: 1.7px;
    text-transform: uppercase;
  }
`;

const buildSharedReportClosingPage = (options = {}) => {
  const websiteUrl = options.websiteUrl || "https://www.graho.in";
  const playStoreUrl = options.playStoreUrl || "https://play.google.com/store/apps/details?id=com.graho";
  const appStoreUrl = options.appStoreUrl || "https://apps.apple.com";
  const logo = options.logo || "";
  const qrCode = options.qrCode || "";
  const googlePlayBadge = options.googlePlayBadge || "";
  const appStoreBadge = options.appStoreBadge || "";
  const pageTag = options.pageTag || "Policies & App";
  const extraClass = options.extraClass || "";

  const policyLinks = options.policyLinks || [
    { label: "Terms & Conditions", url: `${websiteUrl}/policies/terms_conditions` },
    { label: "Privacy Policy", url: `${websiteUrl}/policies/privacy` },
    { label: "Cancellation & Refund Policy", url: `${websiteUrl}/policies/cancellation_refund` },
    { label: "Shipping Policy", url: `${websiteUrl}/policies/shipping_delivery` },
  ];

  const aboutParagraphs = options.aboutParagraphs || [
    "Graho is a modern astrology and spiritual guidance platform dedicated to helping individuals gain deeper insights into their lives through trusted astrological knowledge and personalized guidance. Our mission is to make astrology more accessible, understandable, and relevant for today's generation by providing meaningful insights that support better decision-making and self-discovery.",
    "Through services such as Kundli generation, horoscope analysis, compatibility reports, numerology insights, palmistry readings, and Vastu guidance, Graho offers a comprehensive experience tailored to each individual's unique profile. Whether users are seeking clarity in their career, relationships, finances, health, or personal growth, Graho provides detailed and personalized reports designed to help them navigate life's opportunities and challenges with confidence.",
    "Many people struggle to access reliable astrological guidance or find it difficult to understand complex astrological concepts. Graho addresses this challenge by presenting insights in a simple, user-friendly, and easily accessible format, allowing users to explore and benefit from astrology anytime and anywhere. By combining authenticity, convenience, and a seamless digital experience, Graho empowers users to make informed decisions and gain a deeper understanding of themselves and their life journey.",
    "At Graho, trust, privacy, and user satisfaction are at the heart of everything we do. Our goal is to create a dependable platform where users can confidently explore astrological guidance, discover new perspectives, and unlock greater clarity in every stage of life.",
  ];

  return `
    <section class="page shared-report-closing ${extraClass}">
      <div class="shared-closing-topbar">
        <span>About Graho</span>
        <span>${escapeHtml(pageTag)}</span>
      </div>

      <div class="shared-closing-brand">
        ${logo ? `<img class="shared-closing-logo" src="${logo}" alt="Graho" />` : `<h2>Graho</h2>`}
        <p class="shared-closing-tagline">Grah Disha, Jeevan Disha.</p>
      </div>

      <div class="shared-closing-rule"></div>

      <div class="shared-about-copy">
        ${aboutParagraphs.map((paragraph) => `<p>${escapeHtml(paragraph)}</p>`).join("")}
      </div>

      <div class="shared-policy-panel">
        <h3>Quick Links &amp; Policies</h3>
        <ul class="shared-policy-list">
          ${policyLinks
            .map((link) => `<li><a href="${escapeHtml(link.url)}">${escapeHtml(link.label)}</a></li>`)
            .join("")}
        </ul>
      </div>

      <div class="shared-app-panel">
        ${qrCode ? `<img class="shared-app-qr" src="${qrCode}" alt="Download Graho app QR code" />` : ""}
        <div>
          <h3>Download Graho App</h3>
          <p>Scan the QR code to install the application on your mobile device and access personalized daily guidance anytime.</p>
          <div class="shared-store-links">
            ${googlePlayBadge ? `<a href="${playStoreUrl}"><img src="${googlePlayBadge}" alt="Get it on Google Play" /></a>` : `<a href="${playStoreUrl}">Google Play</a>`}
            ${appStoreBadge ? `<a href="${appStoreUrl}"><img src="${appStoreBadge}" alt="Download on the App Store" /></a>` : `<a href="${appStoreUrl}">App Store</a>`}
          </div>
          <p class="shared-site-link"><b>Website:</b> <a href="${websiteUrl}">${websiteUrl}</a></p>
        </div>
      </div>

      <div class="shared-closing-footer">
        Copyright &copy; 2025-26 Graho. All Rights Reserved.
        <span class="shared-closing-url">www.graho.in</span>
      </div>
    </section>
  `;
};

module.exports = {
  buildSharedReportClosingPage,
  buildSharedReportClosingStyles,
};
