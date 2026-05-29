const axios = require("axios");
const { transporter } = require("../config/nodemailerConfig/nodemailerConfig");

const AISENSY_ENDPOINT =
  process.env.AISENSY_CAMPAIGN_ENDPOINT ||
  "https://backend.aisensy.com/campaign/t1/api/v2";

const WELCOME_EMAIL_SUBJECT = "Welcome to Graho";
const WELCOME_EMAIL_FROM = process.env.ADMIN_EMAIL
  ? `"Graho Team" <${process.env.ADMIN_EMAIL}>`
  : "Graho Team";
const WEBSITE_URL = process.env.FRONTEND_URL || "https://graho.in";
const PLAYSTORE_URL =
  process.env.PLAYSTORE_URL ||
  "https://play.google.com/store/apps/details?id=com.graho";
const WELCOME_EMAIL_TEXT = `Hello! 👋
Thank you for joining Graho!

Guess what? ₹50 is credited to your wallet!
Chat with our expert astrologers and get your answers today.`;
const WELCOME_EMAIL_HTML = `
<div style="background:#f8fafc;padding:28px 16px;font-family:Arial,Helvetica,sans-serif;color:#1f2937;">
  <div style="max-width:620px;margin:0 auto;background:#ffffff;border:1px solid #e5e7eb;border-radius:14px;overflow:hidden;">
    <div style="background:#fff7ed;padding:18px 24px;border-bottom:1px solid #fde7cf;">
      <p style="margin:0;font-size:13px;letter-spacing:.2px;color:#9a3412;">Graho Team</p>
      <h1 style="margin:8px 0 0;font-size:24px;line-height:1.3;color:#111827;">Welcome to Graho! 👋</h1>
    </div>
    <div style="padding:24px;">
      <p style="margin:0 0 14px;font-size:16px;line-height:1.7;">Thank you for joining Graho.</p>
      <p style="margin:0 0 14px;font-size:16px;line-height:1.7;">
        Guess what? <strong>₹50 is credited to your wallet!</strong>
      </p>
      <p style="margin:0 0 22px;font-size:16px;line-height:1.7;">
        Chat with our expert astrologers and get your answers today.
      </p>
      <a href="${WEBSITE_URL}" style="display:inline-block;background:#ea580c;color:#ffffff;text-decoration:none;font-weight:700;padding:12px 18px;border-radius:10px;">
        Start Exploring Graho
      </a>
      <div style="margin-top:16px;padding:14px;border:1px solid #fde7cf;background:#fffbeb;border-radius:10px;">
        <p style="margin:0 0 10px;font-size:14px;line-height:1.6;color:#7c2d12;">
          For the best experience, download our app from Play Store.
        </p>
        <a href="${PLAYSTORE_URL}" style="display:inline-block;background:#16a34a;color:#ffffff;text-decoration:none;font-weight:700;padding:10px 16px;border-radius:8px;">
          Download on Play Store
        </a>
      </div>
      <p style="margin:22px 0 0;font-size:14px;line-height:1.6;color:#4b5563;">
        Website: <a href="${WEBSITE_URL}" style="color:#c2410c;text-decoration:none;">${WEBSITE_URL}</a>
      </p>
    </div>
  </div>
</div>
`;

const formatIndianPhone = (mobile) => {
  const digits = String(mobile || "").replace(/\D/g, "");
  if (!digits) return null;

  const lastTen = digits.slice(-10);
  if (!/^[6-9]\d{9}$/.test(lastTen)) return null;

  return `+91${lastTen}`;
};

const sendWhatsappWelcomeCampaign = async (mobile) => {
  const apiKey = process.env.AISENSY_API_KEY;
  const campaignName = process.env.AISENSY_CAMPAIGN_NAME;
  const formattedPhone = formatIndianPhone(mobile);

  if (!apiKey || !campaignName || !formattedPhone) {
    return {
      success: false,
      skipped: true,
      reason: "missing_config_or_phone",
    };
  }

  const payload = {
    apiKey,
    campaignName,
    destination: formattedPhone,
    userName: formattedPhone,
    templateParams: [],
  };

  try {
    await axios.post(AISENSY_ENDPOINT, payload, {
      headers: { "Content-Type": "application/json" },
      timeout: 10000,
    });

    return { success: true };
  } catch (error) {
    console.error("Failed to trigger AiSensy campaign:", error.message);
    return { success: false, skipped: false, reason: "request_failed" };
  }
};

const sendWelcomeEmail = async (email) => {
  if (!email) {
    return { success: false, skipped: true, reason: "missing_email" };
  }

  try {
    await transporter.sendMail({
      from: WELCOME_EMAIL_FROM,
      to: email,
      subject: WELCOME_EMAIL_SUBJECT,
      text: WELCOME_EMAIL_TEXT,
      html: WELCOME_EMAIL_HTML,
    });

    return { success: true };
  } catch (error) {
    console.error("Failed to send welcome email:", error.message);
    return { success: false, skipped: false, reason: "send_failed" };
  }
};

const handleNewUserOnboarding = async ({ mobile, email }) => {
  const [whatsappResult, emailResult] = await Promise.all([
    sendWhatsappWelcomeCampaign(mobile),
    sendWelcomeEmail(email),
  ]);

  return {
    whatsapp: whatsappResult,
    email: emailResult,
  };
};

module.exports = {
  handleNewUserOnboarding,
};
