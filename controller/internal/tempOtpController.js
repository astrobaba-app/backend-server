const { normalizeIndianMobile } = require("../../services/firebasePhoneAuthService");
const { sendMsg91Otp } = require("../../services/msg91OtpService");

const isEnabled = () =>
  String(process.env.TEMP_MSG91_OTP_ENABLED || "false").toLowerCase() ===
  "true";

const sendTemporaryMsg91Otp = async (req, res) => {
  try {
    if (!isEnabled()) {
      return res.status(404).json({
        success: false,
        message: "Temporary MSG91 OTP route is disabled",
      });
    }

    const expectedApiKey = String(
      process.env.TEMP_MSG91_OTP_API_KEY || ""
    ).trim();
    const providedApiKey = String(req.headers["x-internal-api-key"] || "").trim();

    if (!expectedApiKey || providedApiKey !== expectedApiKey) {
      return res.status(401).json({
        success: false,
        message: "Invalid internal API key",
      });
    }

    const normalizedMobile = normalizeIndianMobile(req.body.mobile);
    if (!normalizedMobile) {
      return res.status(400).json({
        success: false,
        message: "Please provide a valid Indian mobile number",
      });
    }

    const otp = req.body.otp ? String(req.body.otp).trim() : undefined;
    if (otp && !/^\d{4,6}$/.test(otp)) {
      return res.status(400).json({
        success: false,
        message: "OTP must contain 4 to 6 digits",
      });
    }

    const providerResponse = await sendMsg91Otp({
      mobile: `91${normalizedMobile}`,
      otp,
      variables:
        req.body.variables &&
        typeof req.body.variables === "object" &&
        !Array.isArray(req.body.variables)
          ? req.body.variables
          : {},
    });

    return res.status(200).json({
      success: true,
      message: "OTP sent successfully through MSG91",
      mobile: normalizedMobile,
      providerResponse,
    });
  } catch (error) {
    console.error("Temporary MSG91 OTP error:", error);
    return res.status(error.statusCode || 500).json({
      success: false,
      message: error.message || "Failed to send OTP through MSG91",
      providerResponse: error.providerResponse,
    });
  }
};

module.exports = {
  sendTemporaryMsg91Otp,
};
