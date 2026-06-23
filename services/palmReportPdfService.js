const fs = require("fs");
const path = require("path");
const puppeteer = require("puppeteer");
const axios = require("axios");
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

  return candidates.find((candidate) => fs.existsSync(candidate)) || null;
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
  if (chromePath) options.executablePath = chromePath;
  return options;
};

const escapeHtml = (value) =>
  String(value ?? "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");

const stripMarkdown = (value) =>
  String(value || "")
    .replace(/\*\*/g, "")
    .replace(/\r\n/g, "\n")
    .trim();

const imageToDataUri = (fileName) => {
  try {
    const requestedPath = path.join(BACKEND_REPORT_IMAGES, fileName);
    const parsed = path.parse(fileName);
    const candidates = [
      requestedPath,
      path.join(BACKEND_REPORT_IMAGES, `${parsed.name}.png`),
      path.join(BACKEND_REPORT_IMAGES, `${parsed.name}.jpg`),
      path.join(BACKEND_REPORT_IMAGES, `${parsed.name}.jpeg`),
      path.join(FRONTEND_PUBLIC_IMAGES, fileName),
      path.join(FRONTEND_PUBLIC_IMAGES, `${parsed.name}.png`),
      path.join(FRONTEND_PUBLIC_IMAGES, `${parsed.name}.jpg`),
      path.join(FRONTEND_PUBLIC_IMAGES, `${parsed.name}.jpeg`),
    ];
    const fullPath = candidates.find((candidate) => fs.existsSync(candidate));
    if (!fullPath) return "";
    const buffer = fs.readFileSync(fullPath);
    const ext = path.extname(fullPath).toLowerCase();
    const mime = ext === ".jpg" || ext === ".jpeg" ? "image/jpeg" : "image/png";
    return `data:${mime};base64,${buffer.toString("base64")}`;
  } catch {
    return "";
  }
};

const remoteImageToDataUri = async (url) => {
  const source = String(url || "").trim();
  if (!source || source.startsWith("data:image/")) return source;

  try {
    const optimizedSource = source.includes("res.cloudinary.com") && source.includes("/image/upload/")
      ? source.replace("/image/upload/", "/image/upload/f_jpg,q_auto:good,w_1200,c_limit/")
      : source;
    const response = await axios.get(optimizedSource, {
      responseType: "arraybuffer",
      timeout: 30000,
      maxContentLength: 12 * 1024 * 1024,
      maxBodyLength: 12 * 1024 * 1024,
    });
    const contentType = String(response.headers?.["content-type"] || "image/jpeg").split(";")[0];
    return `data:${contentType};base64,${Buffer.from(response.data).toString("base64")}`;
  } catch (error) {
    console.warn("[Palm PDF] unable to embed uploaded palm image", {
      message: error?.message,
    });
    return source;
  }
};

const asArray = (value) => (Array.isArray(value) ? value : []);

const asText = (value, fallback = "") => {
  const text = String(value || "").trim();
  return text || fallback;
};

const normalizeTable = (value) =>
  asArray(value)
    .map((row) => ({
      feature: asText(row?.feature, "Palm marker"),
      observation: asText(row?.observation, "Observed in uploaded palm image"),
      interpretation: asText(row?.interpretation, "Supports the chapter theme."),
    }))
    .filter((row) => row.feature || row.observation || row.interpretation);

const fallbackSectionsFromNarrative = (finalNarrative) => {
  const text = stripMarkdown(finalNarrative);
  if (!text) return [];

  const chunks = text
    .split(/(?=\n?[A-Z][A-Za-z ,&]+:)/g)
    .map((chunk) => chunk.replace(/^\s+|\s+$/g, ""))
    .filter(Boolean);

  if (!chunks.length) {
    return [{ title: "Life Direction Summary", opening: "", body: text, table: [], success_codes: [], golden_warnings: [] }];
  }

  return chunks.slice(0, 9).map((chunk, index) => {
    const [titlePart, ...bodyParts] = chunk.split(":");
    return {
      title: asText(titlePart, `Chapter ${index + 1}`),
      opening: "",
      body: bodyParts.join(":").trim() || chunk,
      table: [],
      success_codes: [],
      golden_warnings: [],
    };
  });
};

const REFERENCE_REPORT_OUTLINE = [
  { key: "personality_foundation", title: "Personality and Life Foundation", legacy: ["personality"] },
  { key: "childhood_conditioning", title: "Childhood and Conditioning", legacy: ["personality", "strengths"] },
  { key: "thinking_emotional_style", title: "Thinking and Emotional Style", legacy: ["love", "personality"] },
  { key: "career_direction", title: "Career Direction and Path", legacy: ["career"] },
  { key: "wealth_asset_pattern", title: "Wealth, Money and Asset Pattern", legacy: ["guidance", "career"] },
  { key: "love_marriage_patterns", title: "Love and Marriage Patterns", legacy: ["love"] },
  { key: "major_life_shifts", title: "Major Life Shifts", legacy: ["challenges", "career"] },
  { key: "life_direction_summary", title: "Life Direction Summary", legacy: ["guidance", "strengths", "challenges"] },
];

const insightSummary = (value, fallback) => {
  if (typeof value === "string") return asText(value, fallback);
  if (value && typeof value === "object") {
    return asText(value.summary, fallback);
  }
  return fallback;
};

const buildLegacyChapter = ({ outline, legacySections, structuredInsights }) => {
  const matching = outline.legacy
    .map((name) => legacySections.find((section) => section.title.toLowerCase() === name))
    .filter(Boolean);
  const combinedBody = matching.map((section) => section.body).filter(Boolean).join("\n\n");
  const lineData = structuredInsights?.line_interpretations || {};
  const strengths = asArray(structuredInsights?.strengths).filter(Boolean).map(String);
  const weaknesses = asArray(structuredInsights?.weaknesses).filter(Boolean).map(String);

  const chapterFallbacks = {
    personality_foundation: [
      insightSummary(structuredInsights?.personality_traits, "Your palm indicates an adaptable temperament with a practical outer expression."),
      "The overall hand shape, line clarity, and thumb structure describe the foundation of how you approach responsibility, relationships, and personal growth.",
    ],
    childhood_conditioning: [
      insightSummary(lineData?.life_line, "The Life Line reflects the early foundations of vitality, security, and independence."),
      "Early conditioning is best understood as a starting pattern rather than a permanent limitation. Your choices continue to reshape how these traits are expressed.",
    ],
    thinking_emotional_style: [
      insightSummary(structuredInsights?.emotional_traits, "Your emotional style combines sensitivity with a need for practical clarity."),
      insightSummary(lineData?.wisdom_line, "The Head Line reflects how thought, intuition, and judgment work together."),
    ],
    career_direction: [
      insightSummary(structuredInsights?.career_traits, "Your career path develops through experience, adaptability, and increasing responsibility."),
      insightSummary(lineData?.fate_line, "The Fate Line reflects professional direction and the way work identity develops over time."),
    ],
    wealth_asset_pattern: [
      insightSummary(structuredInsights?.financial_tendencies, "Financial progress is supported by planning, patience, and disciplined retention."),
      "The strongest wealth pattern comes from protecting long-term priorities while allowing career experience to compound steadily.",
    ],
    love_marriage_patterns: [
      insightSummary(structuredInsights?.love_traits, "Your relationship style values emotional connection, trust, and consistent support."),
      insightSummary(lineData?.love_line, "The Heart Line reflects emotional rhythm, attachment, and the way affection is communicated."),
    ],
    major_life_shifts: [
      weaknesses.length ? `Important transition themes include ${weaknesses.join(", ")}.` : "Major shifts are likely to reward preparation, flexibility, and calm decision-making.",
      insightSummary(lineData?.life_line, "The Life Line reflects vitality, recovery, movement, and major changes of environment."),
    ],
    life_direction_summary: [
      strengths.length ? `Your strongest visible qualities include ${strengths.join(", ")}.` : "Your overall direction is shaped by adaptability, steady effort, and growing self-awareness.",
      insightSummary(structuredInsights?.leadership_qualities, "Leadership develops as confidence, judgment, and responsibility become more consistent."),
      insightSummary(structuredInsights?.spiritual_tendencies, "Intuition and reflection can support clearer long-term choices."),
    ],
  };
  const supportingBody = asArray(chapterFallbacks[outline.key]);
  const bodyParts = [combinedBody, ...supportingBody]
    .map((item) => asText(item))
    .filter(Boolean);
  const uniqueBodyParts = [...new Set(bodyParts)];

  return {
    key: outline.key,
    title: outline.title,
    opening: `This chapter interprets ${outline.title.toLowerCase()} through the visible structures and combined themes of your palm.`,
    body: uniqueBodyParts.join("\n\n"),
    table: [],
    success_codes: [],
    golden_warnings: [],
  };
};

const normalizeReportSections = (structuredInsights, finalNarrative) => {
  const sections = asArray(structuredInsights?.report_sections)
    .map((section, index) => ({
      key: asText(section?.key),
      title: asText(section?.title, `Chapter ${index + 1}`),
      opening: asText(section?.opening),
      body: asText(section?.body),
      table: normalizeTable(section?.table),
      success_codes: asArray(section?.success_codes).filter(Boolean).map(String),
      golden_warnings: asArray(section?.golden_warnings).filter(Boolean).map(String),
    }))
    .filter((section) => section.opening || section.body || section.table.length);

  if (sections.length >= 6) {
    return REFERENCE_REPORT_OUTLINE.map((outline) => {
      const exact = sections.find(
        (section) =>
          section.key === outline.key ||
          section.title.toLowerCase() === outline.title.toLowerCase()
      );
      return exact || buildLegacyChapter({ outline, legacySections: sections, structuredInsights });
    });
  }

  const legacySections = [...sections, ...fallbackSectionsFromNarrative(finalNarrative)]
    .filter((section) => section.title.toLowerCase() !== "palmistry report")
    .map((section) => ({ ...section, title: section.title.toLowerCase() }));

  return REFERENCE_REPORT_OUTLINE.map((outline) =>
    buildLegacyChapter({ outline, legacySections, structuredInsights })
  );
};

const featureLineSummary = (value, fallback) => {
  if (typeof value === "string") return { quality: value, summary: fallback };
  if (value && typeof value === "object") {
    return {
      quality: asText(value.quality, asText(value.type, "Observed")),
      summary: asText(value.notes, asText(value.summary, fallback)),
    };
  }
  return { quality: "Observed", summary: fallback };
};

const normalizeLinePlates = (structuredInsights, features) => {
  const fallback = [
    ["life_line", "Life Line", "life-line.jpeg", "The line of vitality, recovery, and major transitions."],
    ["love_line", "Love / Heart Line", "love-line.jpeg", "The line of emotional rhythm, attachment, and partnership."],
    ["wisdom_line", "Wisdom / Head Line", "wisdom-line.jpeg", "The line of thought, judgment, and decision-making."],
    ["fate_line", "Fate / Career Line", "fate-line.jpeg", "The line of work direction, responsibility, and ambition."],
    ["summary_line", "Life Direction Summary", "summary-line.jpeg", "A synthesis of the strongest visible palm themes."],
  ];
  const source = structuredInsights?.line_interpretations || {};

  return fallback.map(([key, label, fileName, defaultSummary]) => {
    const item = source[key] || {};
    const featureKey = key === "love_line" ? "heart_line" : key === "wisdom_line" ? "head_line" : key;
    const extracted = featureLineSummary(features?.[featureKey], defaultSummary);
    return {
      key,
      label: asText(item.label, label),
      quality: asText(item.quality, extracted.quality),
      summary: asText(item.summary, extracted.summary),
      image: imageToDataUri(fileName),
    };
  });
};

const buildLineNarrative = (line) => {
  const label = asText(line?.label, "Palm Line");
  const quality = asText(line?.quality, "Observed");
  const summary = asText(
    line?.summary,
    "This line contributes to the overall palmistry interpretation and should be read with the rest of the palm."
  );

  return `${label} appears ${quality.toLowerCase()} in this reading. ${summary} This page isolates the line so the report reads more like a professional chapter instead of a quick visual note.`;
};

const compactProfileValue = (value, fallback = "Not detected") => {
  let result = "";

  if (value && typeof value === "object" && !Array.isArray(value)) {
    result = Object.entries(value)
      .slice(0, 3)
      .map(([key, item]) => `${key.replace(/_/g, " ")}: ${asText(item, fallback)}`)
      .join(" | ");
  } else if (Array.isArray(value)) {
    result = value.slice(0, 4).map((item) => asText(item)).filter(Boolean).join(", ");
  } else {
    result = asText(value, fallback);
  }

  return result.length > 110 ? `${result.slice(0, 107).trimEnd()}...` : result;
};

const normalizeProfileRows = (structuredInsights, features) => {
  const rows = asArray(structuredInsights?.profile_table)
    .map((row) => ({ label: asText(row?.label), value: compactProfileValue(row?.value) }))
    .filter((row) => row.label && row.value);

  if (rows.length) return rows;
  return [
    { label: "Hand Shape", value: compactProfileValue(features?.hand_shape) },
    { label: "Line Clarity", value: compactProfileValue(features?.line_clarity) },
    { label: "Thumb Structure", value: compactProfileValue(features?.thumb_structure) },
    { label: "Finger Proportions", value: compactProfileValue(features?.finger_proportions) },
  ];
};

const listMarkup = (items) =>
  asArray(items)
    .slice(0, 4)
    .map((item) => `<li>${escapeHtml(item)}</li>`)
    .join("");

const tableMarkup = (rows) => {
  if (!rows.length) return "";
  return `
    <table class="chapter-table">
      <thead>
        <tr><th>Feature</th><th>Observation</th><th>Meaning</th></tr>
      </thead>
      <tbody>
        ${rows
          .slice(0, 4)
          .map(
            (row) => `
              <tr>
                <td>${escapeHtml(row.feature)}</td>
                <td>${escapeHtml(row.observation)}</td>
                <td>${escapeHtml(row.interpretation)}</td>
              </tr>`
          )
          .join("")}
      </tbody>
    </table>
  `;
};

const buildPalmReportHtml = async ({ palmImages, features, structuredInsights, finalNarrative, generatedAt }) => {
  const [coverImage, closingAssets] = [
    imageToDataUri("palmistry-report.jpeg"),
    {
      logo: imageToDataUri("logo.png"),
      qrCode: imageToDataUri("QR.png"),
      googlePlayBadge: imageToDataUri("googleplay.png"),
      appStoreBadge: imageToDataUri("appstore.png"),
    },
  ];
  const websiteUrl = "https://www.graho.in";
  const playStoreUrl = "https://play.google.com/store/apps/details?id=com.graho";
  const appStoreUrl = "https://apps.apple.com";
  const policyLinks = [
    { label: "Terms & Conditions", url: `${websiteUrl}/policies/terms_conditions` },
    { label: "Privacy Policy", url: `${websiteUrl}/policies/privacy` },
    { label: "Cancellation & Refund Policy", url: `${websiteUrl}/policies/cancellation_refund` },
    { label: "Shipping Policy", url: `${websiteUrl}/policies/shipping_delivery` },
  ];
  const sections = normalizeReportSections(structuredInsights, finalNarrative);
  const linePlates = normalizeLinePlates(structuredInsights, features);
  const profileRows = normalizeProfileRows(structuredInsights, features);
  const palmImage = asArray(palmImages)[0] || "";
  const created = generatedAt ? new Date(generatedAt).toLocaleDateString("en-IN") : new Date().toLocaleDateString("en-IN");
  const sectionSuccessCodes = sections.flatMap((section) => asArray(section.success_codes)).filter(Boolean).map(String);
  const sectionWarnings = sections.flatMap((section) => asArray(section.golden_warnings)).filter(Boolean).map(String);
  const successCodes = asArray(structuredInsights?.success_codes).filter(Boolean).map(String);
  const goldenWarnings = asArray(structuredInsights?.golden_warnings).filter(Boolean).map(String);
  const finalSuccessCodes = [...new Set([...successCodes, ...sectionSuccessCodes])].slice(0, 6);
  const finalWarnings = [...new Set([...goldenWarnings, ...sectionWarnings])].slice(0, 6);
  if (!finalSuccessCodes.length) {
    finalSuccessCodes.push(
      "Build consistent habits before chasing large outcomes.",
      "Use intuition as a signal, then confirm important choices with practical facts.",
      "Protect your energy during transitions and keep long-term priorities visible."
    );
  }
  if (!finalWarnings.length) {
    finalWarnings.push(
      "Avoid impulsive career or relationship decisions during emotionally reactive phases.",
      "Do not neglect rest, recovery, and financial discipline during periods of change.",
      "Treat palmistry as reflective guidance rather than a fixed prediction."
    );
  }
  const linePlateMap = Object.fromEntries(linePlates.map((line) => [line.key, line]));
  const sectionMap = Object.fromEntries(sections.map((section) => [section.key, section]));

  const chapterPageMarkup = (sectionKey, chapterNumber, options = {}) => {
    const section = sectionMap[sectionKey];
    if (!section) return "";
    const includeFinalGuidance = Boolean(options.includeFinalGuidance);
    const contentLength = `${section.opening || ""}${section.body || ""}`.length;
    const densityClass =
      contentLength > 3400 ? "chapter-very-dense" : contentLength > 2400 ? "chapter-dense" : "";

    return `
      <section class="page ${chapterNumber % 2 === 0 ? "white" : ""}">
        <div class="page-content">
          <p class="kicker">Detailed Palm Intelligence</p>
          <h2>${escapeHtml(section.title)}</h2>
          <article class="chapter ${densityClass} ${includeFinalGuidance ? "chapter-with-guidance" : ""}">
            <div class="chapter-header">
              <span class="num">${chapterNumber}</span>
              <div>
                ${section.opening ? `<p class="muted chapter-opening"><b>${escapeHtml(section.opening)}</b></p>` : ""}
              </div>
            </div>
            ${section.body ? `<p class="chapter-body">${escapeHtml(section.body)}</p>` : ""}
            ${tableMarkup(section.table)}
            ${
              !includeFinalGuidance && (asArray(section.success_codes).length || asArray(section.golden_warnings).length)
                ? `<div class="codes-grid">
                    ${
                      asArray(section.success_codes).length
                        ? `<div class="codes-box">
                            <b>Success Codes</b>
                            <ul>${listMarkup(section.success_codes.slice(0, 3))}</ul>
                          </div>`
                        : ""
                    }
                    ${
                      asArray(section.golden_warnings).length
                        ? `<div class="codes-box warn">
                            <b>Golden Warnings</b>
                            <ul>${listMarkup(section.golden_warnings.slice(0, 2))}</ul>
                          </div>`
                        : ""
                    }
                  </div>`
                : ""
            }
            ${
              includeFinalGuidance
                ? `<div class="summary-page">
                    <div class="codes-box">
                      <b>Success Codes</b>
                      <ul>${listMarkup(finalSuccessCodes.slice(0, 3))}</ul>
                    </div>
                    <div class="codes-box warn">
                      <b>Golden Warnings</b>
                      <ul>${listMarkup(finalWarnings.slice(0, 3))}</ul>
                    </div>
                  </div>`
                : ""
            }
          </article>
        </div>
        <div class="footer"><span>${escapeHtml(section.title)}</span><span>graho.in</span></div>
      </section>`;
  };

  const linePageMarkup = (lineKey, chapterLabel) => {
    const line = linePlateMap[lineKey];
    if (!line) return "";

    return `
      <section class="page image-only-page">
        <div class="image-only-wrap line-image-only">
          ${line.image ? `<img src="${line.image}" alt="${escapeHtml(line.label)}" />` : ""}
        </div>
      </section>`;
  };

  const publicationPages = [
    linePageMarkup("life_line", "Line Detail 01"),
    chapterPageMarkup("personality_foundation", 1),
    chapterPageMarkup("childhood_conditioning", 2),
    chapterPageMarkup("thinking_emotional_style", 3),
    linePageMarkup("fate_line", "Line Detail 02"),
    chapterPageMarkup("career_direction", 4),
    chapterPageMarkup("wealth_asset_pattern", 5),
    linePageMarkup("love_line", "Line Detail 03"),
    chapterPageMarkup("love_marriage_patterns", 6),
    linePageMarkup("wisdom_line", "Line Detail 04"),
    chapterPageMarkup("major_life_shifts", 7),
    linePageMarkup("summary_line", "Line Detail 05"),
    chapterPageMarkup("life_direction_summary", 8, { includeFinalGuidance: true }),
  ].join("");
  const tocGroups = [
    {
      title: "Core Palm Lines",
      entries: [
        ["Life Line", 5],
        ["Fate / Career Line", 9],
      ],
    },
    {
      title: "Personality & Constitution",
      entries: [
        ["Personality & Life Foundation", 6],
        ["Childhood & Conditioning", 7],
        ["Thinking & Emotional Style", 8],
      ],
    },
    {
      title: "Career Path",
      entries: [
        ["Career Direction & Path", 10],
        ["Wealth, Money & Asset Pattern", 11],
      ],
    },
    {
      title: "Love & Marriage",
      entries: [
        ["Love / Heart Line", 12],
        ["Love & Marriage Patterns", 13],
      ],
    },
    {
      title: "Mind & Future Turning Points",
      entries: [
        ["Wisdom / Head Line", 14],
        ["Major Life Shifts", 15],
      ],
    },
    {
      title: "Life Direction Summary",
      entries: [
        ["Life Direction Line Summary", 16],
        ["Life Direction Summary", 17],
        ["About This Report", 18],
      ],
    },
  ];
  const tocMarkup = tocGroups
    .map(
      (group) => `
        <div class="toc-group">
          <div class="toc-group-title">
            <span>${escapeHtml(group.title)}</span>
          </div>
          <div class="toc-entry-list">
            ${group.entries
              .map(
                ([label, pageNumber]) => `
                  <div class="toc-entry">
                    <span>${escapeHtml(label)}</span>
                    <span class="toc-dots"></span>
                    <b>${pageNumber}</b>
                  </div>`
              )
              .join("")}
          </div>
        </div>`
    )
    .join("");

  return `<!doctype html>
<html>
<head>
  <meta charset="utf-8" />
  <style>
    @page { size: A4; margin: 0; }
    * { box-sizing: border-box; }
    body {
      margin: 0;
      background:
        radial-gradient(circle at top, rgba(255, 214, 135, 0.34), transparent 34%),
        linear-gradient(180deg, #f7ead0 0%, #fdf8ef 100%);
      color: #13233d;
      font-family: Georgia, "Times New Roman", serif;
      font-size: 11.8px;
      line-height: 1.68;
    }
    .page {
      width: 210mm;
      height: 297mm;
      min-height: 297mm;
      padding: 14mm 14mm 12mm;
      background:
        radial-gradient(circle at top left, rgba(247, 192, 96, 0.13), transparent 26%),
        radial-gradient(circle at bottom right, rgba(255, 214, 153, 0.14), transparent 24%),
        linear-gradient(180deg, #fffdf8 0%, #fff8eb 100%);
      page-break-after: always;
      display: flex;
      flex-direction: column;
      justify-content: space-between;
      overflow: hidden;
      position: relative;
    }
    .page.white {
      background:
        radial-gradient(circle at top right, rgba(255, 214, 153, 0.10), transparent 20%),
        linear-gradient(180deg, #ffffff 0%, #fffaf1 100%);
    }
    .page::before {
      content: "";
      position: absolute;
      inset: 6mm;
      border: 1.4px solid rgba(222, 167, 71, 0.85);
      border-radius: 14px;
      pointer-events: none;
    }
    .page::after {
      content: "";
      position: absolute;
      inset: 8mm;
      border: 1px solid rgba(244, 210, 151, 0.9);
      border-radius: 11px;
      pointer-events: none;
    }
    .page:last-child { page-break-after: auto; }
    .cover-page {
      padding: 0;
      background: #fff9e8;
    }
    .cover-page::before,
    .cover-page::after {
      display: none;
    }
    .cover-full {
      width: 210mm;
      height: 297mm;
      object-fit: cover;
      display: block;
    }
    .page-content {
      width: 100%;
      flex: 1;
      position: relative;
      z-index: 1;
    }
    .kicker {
      color: #f05a14;
      font-size: 8.5px;
      font-weight: 800;
      letter-spacing: 3.6px;
      text-transform: uppercase;
    }
    h1, h2, h3 {
      margin: 0;
      font-family: Cinzel, Georgia, serif;
      color: #06111f;
      line-height: 1.15;
    }
    h1 { font-size: 34px; }
    h2 {
      font-size: 26px;
      letter-spacing: 0.2px;
    }
    h3 {
      font-size: 16.5px;
      letter-spacing: 0.15px;
    }
    p { margin: 0; }
    .muted { color: #44556f; }
    .profile-grid {
      display: grid;
      grid-template-columns: 1fr 1fr;
      gap: 6px;
      margin-top: 8px;
    }
    .profile-card, .toc-card, .line-card, .chapter, .note-card {
      border: 1px solid rgba(232, 186, 104, 0.85);
      background: linear-gradient(180deg, rgba(255,255,255,0.96), rgba(255,247,232,0.96));
      border-radius: 16px;
      padding: 12px;
      box-shadow: 0 10px 22px rgba(175, 132, 46, 0.08);
    }
    .profile-card b {
      display: block;
      color: #a15c00;
      font-size: 8px;
      letter-spacing: 1.4px;
      text-transform: uppercase;
      margin-bottom: 4px;
    }
    .profile-card {
      min-width: 0;
      overflow: hidden;
      padding: 8px;
    }
    .profile-card span {
      display: block;
      color: #354761;
      font-size: 8px;
      line-height: 1.32;
      overflow-wrap: anywhere;
      word-break: break-word;
    }
    .toc-book {
      max-width: 160mm;
      margin: 11mm auto 0;
    }
    .toc-ornament {
      display: flex;
      align-items: center;
      gap: 5mm;
      color: #d58a1b;
      margin-bottom: 8mm;
    }
    .toc-ornament::before,
    .toc-ornament::after {
      content: "";
      height: 1px;
      flex: 1;
      background: linear-gradient(90deg, transparent, #dca241, transparent);
    }
    .toc-ornament span {
      font-size: 17px;
      color: #ef7c17;
    }
    .toc-group {
      margin-top: 5mm;
      break-inside: avoid;
    }
    .toc-group-title {
      position: relative;
      border-left: 3px solid #ed7518;
      border-radius: 0 8px 8px 0;
      padding: 3mm 4mm;
      background:
        linear-gradient(90deg, rgba(255, 222, 161, 0.88), rgba(255, 244, 220, 0.76)),
        #fff4db;
      color: #6d4108;
      font-family: Cinzel, Georgia, serif;
      font-size: 13px;
      font-weight: 700;
      box-shadow: 0 5px 12px rgba(176, 123, 34, 0.08);
    }
    .toc-entry-list {
      padding: 2mm 4mm 0 7mm;
    }
    .toc-entry {
      display: flex;
      align-items: baseline;
      gap: 3mm;
      padding: 1.5mm 0;
      color: #394b65;
      font-size: 10.8px;
    }
    .toc-entry b {
      color: #e86d13;
      font-family: Georgia, serif;
      font-size: 10.5px;
    }
    .toc-dots {
      flex: 1;
      border-bottom: 1px dotted rgba(186, 133, 51, 0.52);
      transform: translateY(-1.5px);
    }
    .num {
      display: inline-flex;
      width: 24px;
      height: 24px;
      border-radius: 999px;
      background: linear-gradient(180deg, #fff0bf, #ffd977);
      color: #f05a14;
      align-items: center;
      justify-content: center;
      font-weight: 800;
      font-size: 9px;
      box-shadow: 0 4px 10px rgba(239, 150, 36, 0.22);
    }
    .palm-source {
      display: flex;
      flex-direction: column;
      gap: 6mm;
      height: 100%;
      margin-top: 5mm;
    }
    .palm-profile-header {
      display: grid;
      grid-template-columns: 1fr 1.1fr;
      gap: 8mm;
      align-items: end;
    }
    .palm-photo-wrap {
      border: 1px solid rgba(232, 186, 104, 0.85);
      background: linear-gradient(180deg, #fffefb, #fff4dd);
      border-radius: 20px;
      padding: 5mm;
      height: 206mm;
      display: flex;
      align-items: center;
      justify-content: center;
      box-shadow: inset 0 0 0 1px rgba(255,255,255,0.55);
    }
    .palm-photo {
      width: 100%;
      height: 100%;
      object-fit: contain;
      border-radius: 12px;
    }
    .line-page {
      display: grid;
      grid-template-columns: 1.18fr 0.82fr;
      gap: 10mm;
      align-items: start;
      height: 178mm;
    }
    .line-visual {
      border: 1px solid rgba(232, 186, 104, 0.85);
      background:
        radial-gradient(circle at top left, rgba(255, 215, 150, 0.18), transparent 28%),
        linear-gradient(180deg, #fffdfa, #fff2db);
      border-radius: 22px;
      padding: 5mm;
      height: 178mm;
      min-height: 0;
      display: flex;
      align-items: center;
      justify-content: center;
      box-shadow:
        inset 0 0 0 1px rgba(255,255,255,0.5),
        0 12px 26px rgba(160, 120, 44, 0.08);
    }
    .line-visual img {
      width: 100%;
      height: 168mm;
      max-height: 168mm;
      object-fit: contain;
      background: transparent;
      mix-blend-mode: multiply;
    }
    .line-detail {
      border: 1px solid rgba(232, 186, 104, 0.85);
      background: linear-gradient(180deg, rgba(255,255,255,0.98), rgba(255,247,235,0.98));
      border-radius: 22px;
      padding: 7mm 7mm;
      min-height: 0;
      box-shadow: 0 12px 26px rgba(160, 120, 44, 0.08);
    }
    .line-header {
      display: flex;
      align-items: center;
      justify-content: space-between;
      gap: 6mm;
    }
    .line-header-mark {
      width: 31mm;
      height: 31mm;
      border: 1px dashed #eeb25f;
      border-radius: 999px;
      display: flex;
      align-items: center;
      justify-content: center;
      flex-shrink: 0;
      padding: 3mm;
    }
    .line-header-mark img {
      width: 100%;
      height: 100%;
      object-fit: contain;
      mix-blend-mode: multiply;
    }
    .line-observed {
      margin-top: 10mm;
      border-radius: 12px;
      background: linear-gradient(135deg, #f45b08, #ff8a1e 52%, #ff9d35);
      color: white;
      padding: 4mm 5mm;
      font-size: 9.4px;
      font-weight: 800;
      letter-spacing: 2.3px;
      text-transform: uppercase;
      text-align: center;
      box-shadow: 0 8px 16px rgba(247, 105, 17, 0.24);
    }
    .line-copy-box {
      margin-top: 6mm;
      border: 1px solid #efb56f;
      background:
        radial-gradient(circle at top left, rgba(255, 219, 173, 0.20), transparent 28%),
        linear-gradient(180deg, #fffefb, #fff7ea);
      border-radius: 18px;
      padding: 7mm 6mm;
      height: 139mm;
      min-height: 0;
      overflow: hidden;
      box-shadow: inset 0 0 0 1px rgba(255,255,255,0.42);
    }
    .line-copy-box p {
      color: #20314a;
      font-size: 12.2px;
      line-height: 1.82;
    }
    .line-title-row {
      display: flex;
      align-items: center;
      gap: 4mm;
      margin-bottom: 6mm;
    }
    .line-rule {
      height: 1.5px;
      background: linear-gradient(90deg, rgba(245, 177, 90, 0.12), #f5b15a, rgba(245, 177, 90, 0.12));
      flex: 1;
    }
    .line-star {
      color: #f05a14;
      font-size: 16px;
      line-height: 1;
    }
    .quality {
      display: inline-block;
      margin-top: 0;
      border-radius: 999px;
      background: linear-gradient(180deg, #fff3d8, #ffe5b6);
      color: #b35a00;
      padding: 5px 11px;
      font-size: 10.6px;
      font-weight: 800;
      text-transform: uppercase;
      letter-spacing: 1.1px;
    }
    .chapter {
      margin-top: 14px;
      page-break-inside: avoid;
      min-height: 0;
      max-height: 235mm;
      overflow: hidden;
    }
    .chapter-header {
      display: grid;
      grid-template-columns: 28px 1fr;
      gap: 10px;
      align-items: start;
    }
    .chapter-body {
      margin-top: 10px;
      color: #31435e;
      white-space: pre-line;
      font-size: 12px;
      line-height: 1.8;
    }
    .chapter-dense .chapter-body {
      font-size: 9.8px;
      line-height: 1.43;
    }
    .chapter-dense .chapter-table {
      margin-top: 8px;
      font-size: 9.4px;
    }
    .chapter-very-dense .chapter-body {
      font-size: 8.8px;
      line-height: 1.34;
    }
    .chapter-very-dense .codes-grid {
      gap: 5px;
      margin-top: 6px;
    }
    .chapter-very-dense .codes-box {
      padding: 7px;
      font-size: 7.7px;
      line-height: 1.25;
    }
    .chapter-very-dense .chapter-table {
      margin-top: 6px;
      font-size: 8.7px;
    }
    .chapter-very-dense .chapter-table th,
    .chapter-very-dense .chapter-table td {
      padding: 5px;
    }
    .chapter-with-guidance .chapter-body {
      max-height: 120mm;
      overflow: hidden;
      font-size: 9.5px;
      line-height: 1.42;
    }
    .chapter-with-guidance .chapter-table {
      margin-top: 6px;
      font-size: 8.3px;
    }
    .chapter-with-guidance .chapter-table th,
    .chapter-with-guidance .chapter-table td {
      padding: 5px;
    }
    .chapter-with-guidance .summary-page {
      gap: 6px;
      margin-top: 7px;
    }
    .chapter-with-guidance .codes-box {
      max-height: 48mm;
      overflow: hidden;
      padding: 8px;
      font-size: 8.2px;
      line-height: 1.32;
    }
    .chapter-with-guidance .codes-box b {
      font-size: 7.5px;
    }
    .chapter-with-guidance li {
      margin-bottom: 2px;
    }
    .chapter-table {
      width: 100%;
      border-collapse: collapse;
      margin-top: 12px;
      font-size: 10.4px;
      overflow: hidden;
      border-radius: 12px;
      box-shadow: 0 8px 18px rgba(162, 122, 43, 0.08);
    }
    .chapter-table th {
      background: linear-gradient(180deg, #fff1c9, #ffe49c);
      color: #5b3a00;
      text-align: left;
      padding: 8px;
      text-transform: uppercase;
      letter-spacing: 1.1px;
      font-size: 8.2px;
    }
    .chapter-table td {
      border-top: 1px solid #f1e0aa;
      padding: 8px;
      vertical-align: top;
      background: rgba(255,255,255,0.88);
    }
    .codes-grid {
      display: grid;
      grid-template-columns: 1fr 1fr;
      gap: 8px;
      margin-top: 10px;
    }
    .codes-box {
      border-radius: 14px;
      padding: 12px;
      background: linear-gradient(180deg, #f6fff8, #ecfbf1);
      border: 1px solid #bbf7d0;
      box-shadow: 0 10px 18px rgba(114, 176, 128, 0.08);
    }
    .codes-box.warn {
      background: linear-gradient(180deg, #fffaf4, #fff2e4);
      border-color: #fed7aa;
      box-shadow: 0 10px 18px rgba(214, 144, 75, 0.08);
    }
    .codes-box b {
      display: block;
      font-size: 9px;
      letter-spacing: 1.4px;
      text-transform: uppercase;
      margin-bottom: 5px;
    }
    .summary-page {
      display: grid;
      grid-template-columns: 1fr 1fr;
      gap: 9px;
      margin-top: 12px;
    }
    .summary-page ul {
      margin-top: 5px;
    }
    ul { margin: 0; padding-left: 14px; }
    li { margin-bottom: 5px; }
    .footer {
      margin-top: 8mm;
      display: flex;
      justify-content: space-between;
      color: #b07110;
      font-size: 8px;
      letter-spacing: 1.4px;
      text-transform: uppercase;
      position: relative;
      z-index: 1;
    }
    .prose-page {
      max-width: 154mm;
      margin: 18mm auto 0;
    }
    .prose-page p {
      margin-top: 7mm;
      color: #354761;
      font-size: 12.4px;
      line-height: 1.9;
    }
    .prose-lead {
      border-left: 3px solid #f08a24;
      padding-left: 6mm;
      color: #20314a !important;
      font-size: 13.2px !important;
    }
    .closing-page {
      max-width: 168mm;
      margin: 8mm auto 0;
      text-align: center;
    }
    .closing-logo {
      width: 25mm;
      height: 25mm;
      object-fit: contain;
    }
    .closing-tagline {
      margin-top: 3mm;
      color: #354761;
      font-size: 11px;
      font-style: italic;
    }
    .closing-rule {
      width: 100%;
      height: 1px;
      margin: 7mm 0;
      background: linear-gradient(90deg, transparent, #e8ba68 12%, #e8ba68 88%, transparent);
    }
    .policy-panel {
      max-width: 126mm;
      margin: 0 auto;
      border: 1px solid rgba(232, 186, 104, 0.85);
      border-radius: 16px;
      padding: 8mm 10mm;
      text-align: left;
      background:
        radial-gradient(circle at top left, rgba(255, 211, 128, 0.32), transparent 38%),
        linear-gradient(180deg, #fffdf8, #fff1d5);
      box-shadow: 0 14px 28px rgba(155, 113, 35, 0.10);
    }
    .policy-panel h3 {
      padding-bottom: 3mm;
      border-bottom: 1px solid rgba(232, 186, 104, 0.85);
    }
    .policy-list {
      display: grid;
      grid-template-columns: 1fr 1fr;
      gap: 3mm 8mm;
      margin-top: 5mm;
      padding: 0;
      list-style: none;
    }
    .policy-list li {
      position: relative;
      margin: 0;
      padding-left: 4mm;
      color: #354761;
      font-size: 10.8px;
    }
    .policy-list li::before {
      content: "•";
      position: absolute;
      left: 0;
      color: #f05a14;
    }
    .app-download-panel {
      display: grid;
      grid-template-columns: 27mm 1fr;
      gap: 7mm;
      align-items: center;
      margin-top: 8mm;
      padding: 7mm;
      border: 1px solid rgba(150, 203, 195, 0.9);
      border-radius: 16px;
      background: linear-gradient(135deg, #effaf7, #f8fffd);
      text-align: left;
      box-shadow: 0 12px 24px rgba(78, 143, 132, 0.08);
    }
    .app-qr {
      width: 27mm;
      height: 27mm;
      object-fit: contain;
      padding: 2mm;
      background: #fff;
      border: 1px solid #d7e8e4;
      border-radius: 8px;
    }
    .store-badges {
      display: flex;
      gap: 3mm;
      align-items: center;
      margin-top: 4mm;
    }
    .store-badges img {
      height: 8mm;
      width: auto;
      object-fit: contain;
    }
    .closing-copyright {
      margin-top: 22mm;
      padding-top: 5mm;
      border-top: 1px solid rgba(232, 186, 104, 0.85);
      color: #6c5a3b;
      font-size: 8.5px;
      letter-spacing: 0.4px;
    }
    .closing-url {
      display: block;
      margin-top: 2mm;
      color: #b07110;
      font-size: 9px;
      font-weight: 700;
      letter-spacing: 1.8px;
      text-transform: uppercase;
    }

    ${buildSharedReportClosingStyles()}

    /* Final professional report skin: clean white pages, no ornamental frames. */
    body {
      background: #ffffff !important;
      color: #111827;
      font-size: 15px !important;
    }
    .page:not(.cover-page):not(.image-only-page):not(.uploaded-image-page),
    .page.white {
      background: #ffffff !important;
      padding: 14mm 16mm 10mm;
    }
    .cover-page {
      background: #fff9e8 !important;
      padding: 0 !important;
    }
    .cover-full {
      display: block;
      height: 297mm;
      object-fit: cover;
      width: 210mm;
    }
    .page::before,
    .page::after,
    .cover-page::before,
    .cover-page::after {
      content: none !important;
      display: none !important;
    }
    .palm-photo-wrap,
    .line-visual,
    .line-detail,
    .line-copy-box {
      border: 0 !important;
      border-radius: 0 !important;
      box-shadow: none !important;
    }
    .toc-ornament,
    .line-title-row,
    .closing-rule {
      display: none !important;
    }
    h1,
    h2,
    h3 {
      color: #14213d;
    }
    h2 {
      font-size: 34px !important;
      line-height: 1.18 !important;
    }
    h3 {
      font-size: 20px !important;
      line-height: 1.25 !important;
    }
    .kicker {
      color: #b7791f !important;
      font-size: 11px !important;
      letter-spacing: 1.8px;
    }
    .muted,
    .footer {
      color: #6b7280;
      font-size: 12px !important;
    }
    .footer {
      border-top: 1px solid #e5e7eb;
      padding-top: 4mm;
    }
    .num {
      background: #ffffff !important;
      border: 1px solid #d1d5db;
      box-shadow: none !important;
      color: #111827 !important;
    }
    .quality,
    .line-observed,
    .toc-group-title {
      background: transparent !important;
      border: 0 !important;
      box-shadow: none !important;
      color: #9a5f08 !important;
    }
    .toc-card,
    .line-card,
    .note-card,
    .policy-panel {
      background: #fffaf0 !important;
      border: 0 !important;
      box-shadow: none !important;
    }
    .toc-group-title {
      font-size: 13px !important;
      letter-spacing: 1.5px !important;
    }
    .toc-entry {
      font-size: 14px !important;
      line-height: 1.5 !important;
      padding: 2.2mm 0 !important;
    }
    .toc-entry b {
      font-size: 13px !important;
    }
    .toc-entry-list {
      padding-top: 3mm !important;
    }
    .profile-card b {
      font-size: 10.5px !important;
    }
    .profile-card span {
      font-size: 11px !important;
      line-height: 1.45 !important;
    }
    .chapter {
      background:
        linear-gradient(180deg, rgba(255, 251, 240, 0.98), rgba(255, 255, 255, 0.98)) !important;
      border: 0 !important;
      box-shadow: none !important;
      padding: 8mm 9mm 7mm;
    }
    .prose-page p {
      font-size: 15.2px !important;
      line-height: 1.9 !important;
    }
    .prose-lead {
      font-size: 16px !important;
      line-height: 1.78 !important;
    }
    .chapter-header .muted {
      font-size: 14px !important;
      line-height: 1.58 !important;
    }
    .chapter-body {
      font-size: 16px !important;
      line-height: 1.72 !important;
    }
    .chapter-dense .chapter-body {
      font-size: 14px !important;
      line-height: 1.58 !important;
    }
    .chapter-very-dense .chapter-body,
    .chapter-with-guidance .chapter-body {
      font-size: 12.4px !important;
      line-height: 1.48 !important;
    }
    .chapter-table {
      font-size: 12px !important;
    }
    .chapter-table {
      border: 1px solid #e5e7eb !important;
      border-collapse: collapse;
      border-radius: 0 !important;
      box-shadow: none !important;
    }
    .chapter-table th {
      background: #fff2cc !important;
      color: #14213d !important;
      font-size: 9.6px !important;
      padding: 9px !important;
    }
    .chapter-table td {
      background: #ffffff !important;
      border-top: 1px solid #e5e7eb;
      padding: 10px !important;
    }
    .codes-box {
      background: #fff8e6 !important;
      border: 0 !important;
      padding: 6mm 7mm;
      font-size: 12px !important;
      line-height: 1.5 !important;
    }
    .codes-box b {
      font-size: 10px !important;
    }
    .codes-box li {
      margin-bottom: 5px !important;
    }
    .codes-box.warn {
      background: #fff1f2 !important;
    }
    .image-only-page {
      align-items: center;
      justify-content: center;
      padding: 0 !important;
    }
    .image-only-wrap {
      align-items: center;
      background: #ffffff;
      display: flex;
      height: 297mm;
      justify-content: center;
      width: 210mm;
    }
    .image-only-wrap img {
      display: block;
      max-height: 270mm;
      max-width: 190mm;
      object-fit: contain;
    }
    .line-image-only img {
      mix-blend-mode: normal;
    }
    .uploaded-image-page {
      background: #ffffff !important;
      padding: 14mm 16mm 12mm !important;
      justify-content: flex-start;
    }
    .uploaded-image-title {
      color: #14213d;
      font-size: 34px;
      margin: 0 0 8mm;
    }
    .uploaded-image-wrap {
      align-items: center;
      background: #ffffff;
      display: flex;
      flex: 1;
      justify-content: center;
      width: 100%;
    }
    .uploaded-image-wrap img {
      display: block;
      max-height: 242mm;
      max-width: 178mm;
      object-fit: contain;
    }
    .closing-page {
      height: 100%;
      margin: 0 auto;
      max-width: 178mm;
      position: relative;
      text-align: left;
    }
    .closing-page::before {
      content: "Graho   Graho   Graho   Graho   Graho   Graho   Graho   Graho   Graho   Graho   Graho   Graho";
      color: rgba(226, 178, 62, 0.09);
      font-size: 13px;
      left: 0;
      letter-spacing: 20px;
      line-height: 30mm;
      position: absolute;
      right: 0;
      top: 7mm;
      transform: rotate(-12deg);
      white-space: normal;
      z-index: 0;
    }
    .closing-inner {
      display: flex;
      flex-direction: column;
      min-height: 100%;
      position: relative;
      z-index: 1;
    }
    .closing-topbar {
      align-items: center;
      border-bottom: 1.5px solid #4f8f86;
      display: flex;
      justify-content: space-between;
      padding-bottom: 3mm;
    }
    .closing-topbar .kicker {
      margin: 0;
    }
    .closing-topbar span {
      color: #6b7280;
      font-size: 11px;
      font-weight: 700;
    }
    .closing-brand {
      align-items: center;
      display: flex;
      flex-direction: column;
      margin: 9mm 0 5mm;
      text-align: center;
    }
    .closing-logo {
      height: 20mm;
      object-fit: contain;
      width: 20mm;
    }
    .closing-tagline {
      color: #6b4b11;
      font-size: 13px;
      font-style: italic;
      margin-top: 2mm;
    }
    .closing-main-rule {
      background: #b8894a;
      height: 1px;
      margin: 0 0 6mm;
      width: 100%;
    }
    .closing-grid {
      display: grid;
      gap: 7mm;
      grid-template-columns: 1fr 1fr;
    }
    .closing-card {
      background: rgba(255, 255, 255, 0.92);
      border: 1px solid #eadcc7;
      border-radius: 8px;
      padding: 6mm 8mm;
    }
    .policy-only-card {
      margin: 0 auto;
      max-width: 118mm;
      width: 100%;
    }
    .closing-card h3 {
      border-bottom: 1px solid #cda66e;
      color: #257267;
      font-size: 22px;
      margin: 0 0 5mm;
      padding-bottom: 2mm;
    }
    .closing-list {
      list-style: none;
      margin: 0;
      padding: 0;
    }
    .closing-list li {
      color: #2f3a4a;
      font-size: 14px;
      line-height: 1.6;
      margin-bottom: 2.6mm;
      padding-left: 4mm;
      position: relative;
    }
    .closing-list li::before {
      color: #b7791f;
      content: "+";
      font-weight: 700;
      left: 0;
      position: absolute;
    }
    .closing-list a {
      color: #2f3a4a;
      text-decoration: none;
    }
    .app-download-panel {
      background: #eefaf8 !important;
      border: 1px solid #b7d9d4 !important;
      border-radius: 8px !important;
      box-shadow: none !important;
      display: grid;
      gap: 7mm;
      grid-template-columns: 31mm 1fr;
      margin-top: 8mm;
      padding: 6mm;
    }
    .app-qr {
      background: #ffffff;
      border: 1px solid #d7e8e4;
      border-radius: 3px;
      height: 31mm;
      object-fit: contain;
      padding: 2mm;
      width: 31mm;
    }
    .app-download-panel h3 {
      color: #257267;
      font-size: 18px;
      margin: 0;
    }
    .app-download-panel p {
      color: #2f3a4a;
      font-size: 12.5px;
      line-height: 1.55;
      margin-top: 2mm;
    }
    .store-badges {
      display: flex;
      gap: 3mm;
      margin-top: 3mm;
    }
    .store-badges img {
      height: 8.5mm;
      object-fit: contain;
      width: auto;
    }
    .closing-copyright {
      border-top: 1.5px solid #4f8f86;
      color: #6b4b11;
      font-size: 11px;
      letter-spacing: 0.2px;
      margin-top: auto;
      padding-top: 4mm;
      position: static;
      text-align: center;
    }
    .closing-url {
      color: #b7791f;
      display: block;
      font-size: 12px;
      font-weight: 800;
      letter-spacing: 1.6px;
      margin-top: 2mm;
      text-transform: uppercase;
    }

    /* Typography consistency lock for every text-bearing report page. */
    .page:not(.cover-page):not(.image-only-page) {
      font-size: 16px !important;
    }
    .chapter-opening {
      font-size: 16px !important;
      line-height: 1.58 !important;
      margin-top: 6px !important;
    }
    .chapter-body,
    .chapter-dense .chapter-body,
    .chapter-very-dense .chapter-body,
    .chapter-with-guidance .chapter-body {
      font-size: 16px !important;
      line-height: 1.68 !important;
      max-height: none !important;
      overflow: visible !important;
    }
    .chapter-with-guidance .summary-page {
      gap: 12px !important;
      margin-top: 12px !important;
    }
    .chapter-with-guidance .codes-box,
    .chapter-very-dense .codes-box,
    .codes-box {
      font-size: 13.5px !important;
      line-height: 1.55 !important;
      max-height: none !important;
      overflow: visible !important;
      padding: 6mm 7mm !important;
    }
    .chapter-with-guidance .codes-box b,
    .chapter-very-dense .codes-box b,
    .codes-box b {
      font-size: 11.5px !important;
    }
    .chapter-table,
    .chapter-dense .chapter-table,
    .chapter-very-dense .chapter-table,
    .chapter-with-guidance .chapter-table {
      font-size: 12.5px !important;
    }
    .toc-entry,
    .closing-list li,
    .app-download-panel p,
    .footer,
    .muted {
      font-size: 14px !important;
    }
    .toc-page {
      padding: 10mm 16mm 8mm !important;
    }
    .toc-page .toc-book {
      margin-top: 3mm !important;
      max-width: 156mm !important;
    }
    .toc-page h2 {
      font-size: 28px !important;
      margin-top: 2mm !important;
    }
    .toc-page .kicker {
      font-size: 9px !important;
    }
    .toc-page .toc-group {
      margin-top: 3.2mm !important;
      break-inside: auto !important;
    }
    .toc-page .toc-group-title {
      font-size: 10.5px !important;
      letter-spacing: 1.2px !important;
      padding: 1.2mm 0 !important;
    }
    .toc-page .toc-entry-list {
      padding: 1mm 2mm 0 3mm !important;
    }
    .toc-page .toc-entry {
      font-size: 10.8px !important;
      line-height: 1.22 !important;
      padding: 1.05mm 0 !important;
    }
    .toc-page .toc-entry b {
      font-size: 10.5px !important;
    }
    .toc-page .footer {
      font-size: 8.8px !important;
      margin-top: 4mm !important;
      padding-top: 2mm !important;
    }
    .policy-only-card {
      background: transparent !important;
      border: 0 !important;
      box-shadow: none !important;
      padding-left: 0 !important;
      padding-right: 0 !important;
    }

    /* Long narrative chapters must paginate instead of clipping or colliding. */
    .page:not(.cover-page):not(.image-only-page):not(.uploaded-image-page) {
      -webkit-box-decoration-break: clone;
      box-decoration-break: clone;
      height: auto !important;
      min-height: 297mm !important;
      overflow: visible !important;
      padding-top: 18mm !important;
      padding-bottom: 14mm !important;
    }
    .page:not(.cover-page):not(.image-only-page):not(.uploaded-image-page) .page-content {
      padding-top: 0;
    }
    .chapter,
    .chapter-dense,
    .chapter-very-dense,
    .chapter-with-guidance {
      break-inside: auto !important;
      max-height: none !important;
      overflow: visible !important;
      page-break-inside: auto !important;
    }
    .chapter-table,
    .codes-grid,
    .codes-box,
    .summary-page {
      break-inside: avoid;
      page-break-inside: avoid;
    }
    .shared-report-closing {
      height: 297mm !important;
      min-height: 297mm !important;
      overflow: hidden !important;
      padding-bottom: 18mm !important;
    }
    .shared-app-panel {
      margin-bottom: 9mm !important;
    }
    .shared-closing-footer {
      margin-top: 7mm !important;
      position: relative !important;
    }
  </style>
</head>
<body>
  <section class="page cover-page">
    ${coverImage ? `<img class="cover-full" src="${coverImage}" alt="Palmistry Report Cover" />` : ""}
  </section>

  <section class="page white">
    <div class="page-content prose-page">
      <p class="kicker">Important Information</p>
      <h2>Disclaimer</h2>
      <p class="prose-lead">
        This Palmistry Report has been prepared using the traditional principles of Hasta
        Samudrika Shastra together with structured analysis of the palm image supplied by the user.
      </p>
      <p>
        The report is designed to offer meaningful insight into personality, habits, emotional
        patterns, career direction, relationships, financial tendencies, and major life shifts.
        Palmistry describes visible tendencies and symbolic patterns. It does not predict the
        future with absolute certainty or create fixed outcomes.
      </p>
      <p>
        Free will, personal effort, environment, education, health, and the decisions made over
        time remain central to every life journey. Use this report as a tool for reflection,
        self-awareness, and thoughtful planning.
      </p>
      <p>
        This report is not a substitute for medical, psychological, legal, financial, or
        professional career advice. Decisions in those areas should always be made with an
        appropriately qualified professional.
      </p>
      <div class="note-card" style="margin-top:14mm;">
        <p style="margin:0; color:#6d4b13;">
          May this report help you understand your strengths with greater clarity and approach
          your choices with patience, discipline, and confidence.
        </p>
      </div>
    </div>
    <div class="footer"><span>Disclaimer</span><span>graho.in</span></div>
  </section>

  <section class="page white toc-page">
    <div class="page-content">
      <div class="toc-book">
        <div class="toc-ornament"><span>&#10022;</span></div>
        <p class="kicker" style="text-align:center;">Inside Your Palmistry Report</p>
        <h2 style="text-align:center; margin-top:3mm; font-size:30px;">Table of Contents</h2>
        ${tocMarkup}
      </div>
    </div>
    <div class="footer"><span>Table of Contents</span><span>graho.in</span></div>
  </section>

  <section class="page uploaded-image-page">
    <h2 class="uploaded-image-title">User Uploaded Image</h2>
    <div class="uploaded-image-wrap uploaded-palm-only">
      ${palmImage ? `<img src="${escapeHtml(palmImage)}" alt="Uploaded palm image" />` : `<p class="muted">Uploaded palm image unavailable.</p>`}
    </div>
  </section>

  ${publicationPages}

  ${buildSharedReportClosingPage({
    ...closingAssets,
    websiteUrl,
    playStoreUrl,
    appStoreUrl,
    policyLinks,
  })}
</body>
</html>`;
};

const generatePalmReportPDF = async ({ palmImages, features, structuredInsights, finalNarrative, generatedAt }) => {
  let browser = null;
  try {
    const embeddedPalmImages = await Promise.all(asArray(palmImages).map(remoteImageToDataUri));
    const html = await buildPalmReportHtml({
      palmImages: embeddedPalmImages,
      features,
      structuredInsights,
      finalNarrative,
      generatedAt,
    });
    browser = await puppeteer.launch(getPuppeteerLaunchOptions());
    const page = await browser.newPage();
    await page.setContent(html, { waitUntil: "load", timeout: 120000 });
    await page.evaluate(async () => {
      const images = Array.from(document.images || []);
      await Promise.all(
        images.map((img) => {
          if (img.complete) return Promise.resolve();
          return new Promise((resolve) => {
            const done = () => resolve();
            img.addEventListener("load", done, { once: true });
            img.addEventListener("error", done, { once: true });
            setTimeout(done, 8000);
          });
        })
      );
      await new Promise((resolve) => setTimeout(resolve, 250));
    });
    const pdfBuffer = await page.pdf({
      format: "A4",
      printBackground: true,
      timeout: 120000,
      margin: { top: 0, right: 0, bottom: 0, left: 0 },
    });
    try {
      await browser.close();
    } catch (closeError) {
      console.warn("[Palm PDF Service] Browser close warning (safe to ignore):", closeError.message);
    }
    return Buffer.isBuffer(pdfBuffer) ? pdfBuffer : Buffer.from(pdfBuffer);
  } catch (error) {
    if (browser) {
      try {
        await browser.close();
      } catch (closeError) {
        console.warn("[Palm PDF Service] Browser close warning in catch (safe to ignore):", closeError.message);
      }
    }
    const isMissingBrowser =
      typeof error?.message === "string" &&
      (error.message.includes("Could not find Chrome") || error.message.includes("Could not find Chromium"));
    if (isMissingBrowser) {
      throw new Error(
        "Failed to generate palm PDF: Chrome is not installed for Puppeteer. Run `npm run install:chrome` in backend-server or set PUPPETEER_EXECUTABLE_PATH."
      );
    }
    throw new Error(`Failed to generate palm PDF: ${error.message}`);
  }
};

module.exports = { generatePalmReportPDF };
