const AdminSettings = require("../../model/admin/adminSettings");

const DEFAULT_SHARE_SETTINGS = {
  blog: true,
  astrologer: true,
  product: true,
  discussion: true,
  horoscope: true,
  report: true,
  kundli: true,
  matching: true,
  app: true,
};

/**
 * Get share visibility settings for admin panel
 */
const getShareSettingsAdmin = async (req, res) => {
  try {
    let setting = await AdminSettings.findOne({
      where: { settingKey: "app_share_settings" },
    });

    if (!setting) {
      try {
        setting = await AdminSettings.create({
          settingKey: "app_share_settings",
          settingValue: JSON.stringify(DEFAULT_SHARE_SETTINGS),
          description: "Controls visibility of share buttons on mobile app screens",
          isActive: true,
        });
      } catch (createError) {
        if (createError.name === 'SequelizeUniqueConstraintError') {
          setting = await AdminSettings.findOne({
            where: { settingKey: "app_share_settings" },
          });
        } else {
          throw createError;
        }
      }
    }

    let parsedSettings = DEFAULT_SHARE_SETTINGS;
    try {
      if (setting && setting.settingValue) {
        parsedSettings = { ...DEFAULT_SHARE_SETTINGS, ...JSON.parse(setting.settingValue) };
      }
    } catch (e) {
      console.warn("[AdminShareSettings] Failed to parse JSON:", e.message);
    }

    return res.status(200).json({
      success: true,
      settings: parsedSettings,
    });
  } catch (error) {
    console.error("Get share settings error:", error);
    return res.status(500).json({
      success: false,
      message: "Failed to fetch share settings",
      error: error.message,
    });
  }
};

/**
 * Update share visibility settings from admin panel
 */
const updateShareSettingsAdmin = async (req, res) => {
  try {
    const { settings } = req.body;

    if (!settings || typeof settings !== 'object') {
      return res.status(400).json({
        success: false,
        message: "Settings object is required",
      });
    }

    let setting = await AdminSettings.findOne({
      where: { settingKey: "app_share_settings" },
    });

    const cleanSettings = {
      blog:       settings.blog !== false,
      astrologer: settings.astrologer !== false,
      product:    settings.product !== false,
      discussion: settings.discussion !== false,
      horoscope:  settings.horoscope !== false,
      report:     settings.report !== false,
      kundli:     settings.kundli !== false,
      matching:   settings.matching !== false,
      app:        settings.app !== false,
    };

    if (!setting) {
      setting = await AdminSettings.create({
        settingKey: "app_share_settings",
        settingValue: JSON.stringify(cleanSettings),
        description: "Controls visibility of share buttons on mobile app screens",
        isActive: true,
      });
    } else {
      await setting.update({
        settingValue: JSON.stringify(cleanSettings),
      });
    }

    return res.status(200).json({
      success: true,
      message: "Share settings updated successfully",
      settings: cleanSettings,
    });
  } catch (error) {
    console.error("Update share settings error:", error);
    return res.status(500).json({
      success: false,
      message: "Failed to update share settings",
      error: error.message,
    });
  }
};

module.exports = {
  getShareSettingsAdmin,
  updateShareSettingsAdmin,
};
