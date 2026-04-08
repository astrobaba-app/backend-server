const {
  getWhatsappAuthSetting,
  saveWhatsappAuthSetting,
  maskApiKey,
} = require("../../services/whatsappAuthSettingsService");

/**
 * Get WhatsApp auth settings
 */
const getWhatsappAuthSettings = async (req, res) => {
  try {
    const setting = await getWhatsappAuthSetting();

    res.status(200).json({
      success: true,
      settings: {
        isEnabled: setting.isEnabled,
        isConfigured: setting.isConfigured,
        apiKeyMasked: maskApiKey(setting.apiKey),
        updatedAt: setting.updatedAt,
      },
    });
  } catch (error) {
    console.error("Get WhatsApp auth settings error:", error);
    res.status(500).json({
      success: false,
      message: "Failed to fetch WhatsApp auth settings",
      error: error.message,
    });
  }
};

/**
 * Update WhatsApp auth settings
 */
const updateWhatsappAuthSettings = async (req, res) => {
  try {
    const { apiKey, isEnabled } = req.body;

    if (apiKey === undefined && isEnabled === undefined) {
      return res.status(400).json({
        success: false,
        message: "At least one of apiKey or isEnabled is required",
      });
    }

    if (apiKey !== undefined) {
      if (typeof apiKey !== "string" || !apiKey.trim()) {
        return res.status(400).json({
          success: false,
          message: "apiKey must be a non-empty string",
        });
      }

      if (apiKey.trim().length < 12) {
        return res.status(400).json({
          success: false,
          message: "apiKey must be at least 12 characters",
        });
      }
    }

    if (isEnabled !== undefined && typeof isEnabled !== "boolean") {
      return res.status(400).json({
        success: false,
        message: "isEnabled must be true or false",
      });
    }

    const setting = await saveWhatsappAuthSetting({ apiKey, isEnabled });

    res.status(200).json({
      success: true,
      message: "WhatsApp auth settings updated successfully",
      settings: {
        isEnabled: setting.isEnabled,
        isConfigured: setting.isConfigured,
        apiKeyMasked: maskApiKey(setting.apiKey),
        updatedAt: setting.updatedAt,
      },
    });
  } catch (error) {
    console.error("Update WhatsApp auth settings error:", error);
    res.status(500).json({
      success: false,
      message: "Failed to update WhatsApp auth settings",
      error: error.message,
    });
  }
};

module.exports = {
  getWhatsappAuthSettings,
  updateWhatsappAuthSettings,
};
