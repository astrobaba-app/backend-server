const axios = require("axios");

const MSG91_SEND_OTP_URL = "https://control.msg91.com/api/v5/otp";

const getRequiredConfig = () => {
  const authKey = String(process.env.MSG91_AUTH_KEY || "").trim();
  const templateId = String(process.env.MSG91_OTP_TEMPLATE_ID || "").trim();

  if (!authKey || !templateId) {
    const error = new Error(
      "MSG91_AUTH_KEY and MSG91_OTP_TEMPLATE_ID must be configured"
    );
    error.statusCode = 503;
    throw error;
  }

  return { authKey, templateId };
};

const assertMsg91OtpConfigured = () => {
  getRequiredConfig();
};

const sendMsg91Otp = async ({ mobile, otp, variables = {} }) => {
  const { authKey, templateId } = getRequiredConfig();
  const params = {
    authkey: authKey,
    template_id: templateId,
    mobile,
  };

  if (otp) {
    params.otp = otp;
  }

  try {
    const response = await axios.post(MSG91_SEND_OTP_URL, variables, {
      params,
      headers: {
        Accept: "application/json",
        "Content-Type": "application/json",
      },
      timeout: 10000,
    });

    return response.data;
  } catch (error) {
    const providerMessage =
      error.response?.data?.message ||
      error.response?.data?.error ||
      error.message ||
      "Unknown MSG91 error";
    const serviceError = new Error(`MSG91 failed to send OTP: ${providerMessage}`);
    serviceError.statusCode = error.response?.status || 502;
    serviceError.providerResponse = error.response?.data;
    throw serviceError;
  }
};

module.exports = {
  assertMsg91OtpConfigured,
  sendMsg91Otp,
};
