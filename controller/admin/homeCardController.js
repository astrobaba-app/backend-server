const AdminSettings = require("../../model/admin/adminSettings");
const User = require("../../model/user/userAuth");
const UserInterestCohort = require("../../model/interest/userInterestCohort");
const { Op } = require("sequelize");
const {
  FREE_CHAT_TYPES,
  getUserFreeChatSummary,
} = require("../../services/freeChatService");

// In-memory cache for ultra-fast response without DB hammering
let cachedSettings = null;
let cacheTimestamp = 0;
const CACHE_TTL_MS = 60 * 1000; // 60 seconds

const isAiEligibleAllocation = (allocation) => {
  const type = String(allocation?.applicableChatType || "").toLowerCase();
  return type === FREE_CHAT_TYPES.AI || type === FREE_CHAT_TYPES.BOTH;
};

const invalidateCache = () => {
  cachedSettings = null;
  cacheTimestamp = 0;
};

const DEFAULT_SETTINGS = {
  isEnabled: true,
  title: "{name}, facing any confusion?",
  subtitle: "Talk to our verified astrologers and get your first question answered for free.",
  buttonText: "Free Chat",
  targetCondition: "ALL", // "ALL", "FIRST_TIME_USER", "CUSTOM_USERS"
  targetUserIds: [],
  fallbackCarouselItems: [
    {
      id: "1",
      title: "Daily Horoscope",
      subtitle: "Check what the stars say today",
      actionTab: "daily",
    },
    {
      id: "2",
      title: "Free Kundli",
      subtitle: "Generate your detailed birth chart for free",
      actionTab: "kundli",
    },
    {
      id: "3",
      title: "Kundli Matching",
      subtitle: "Check compatibility & guna milan with partner",
      actionTab: "match",
    },
  ],
  carouselIntervalSeconds: 4,
};

/**
 * Fetch home card settings from DB or Cache
 */
const getSettingsInternal = async (forceRefresh = false) => {
  const now = Date.now();
  if (!forceRefresh && cachedSettings && now - cacheTimestamp < CACHE_TTL_MS) {
    return cachedSettings;
  }

  let setting = await AdminSettings.findOne({
    where: { settingKey: "home_free_chat_card" },
  });

  if (!setting) {
    try {
      setting = await AdminSettings.create({
        settingKey: "home_free_chat_card",
        settingValue: JSON.stringify(DEFAULT_SETTINGS),
        description: "Home screen Free Chat promotional card and fallback banner configuration",
        isActive: DEFAULT_SETTINGS.isEnabled,
      });
    } catch (err) {
      if (err.name === "SequelizeUniqueConstraintError") {
        setting = await AdminSettings.findOne({
          where: { settingKey: "home_free_chat_card" },
        });
      } else {
        throw err;
      }
    }
  }

  let parsedValue = {};
  try {
    parsedValue = JSON.parse(setting.settingValue || "{}");
  } catch (e) {
    console.error("Failed to parse home_free_chat_card settingValue:", e);
  }

  const mergedSettings = {
    ...DEFAULT_SETTINGS,
    ...parsedValue,
    isEnabled: setting.isActive,
  };

  cachedSettings = mergedSettings;
  cacheTimestamp = now;
  return mergedSettings;
};

/**
 * Get home card settings (Admin)
 */
const getHomeCardSettings = async (req, res) => {
  try {
    const settings = await getSettingsInternal(true);
    res.status(200).json({
      success: true,
      settings,
    });
  } catch (error) {
    console.error("Get home card settings error:", error);
    res.status(500).json({
      success: false,
      message: "Failed to fetch home card settings",
      error: error.message,
    });
  }
};

/**
 * Update home card settings (Admin)
 */
const updateHomeCardSettings = async (req, res) => {
  try {
    const {
      isEnabled,
      title,
      subtitle,
      buttonText,
      targetCondition,
      targetUserIds,
      fallbackCarouselItems,
      carouselIntervalSeconds,
    } = req.body;

    let setting = await AdminSettings.findOne({
      where: { settingKey: "home_free_chat_card" },
    });

    const currentSettings = await getSettingsInternal();
    const newSettings = {
      ...currentSettings,
      title: title !== undefined ? title : currentSettings.title,
      subtitle: subtitle !== undefined ? subtitle : currentSettings.subtitle,
      buttonText: buttonText !== undefined ? buttonText : currentSettings.buttonText,
      targetCondition: targetCondition !== undefined ? targetCondition : currentSettings.targetCondition,
      targetUserIds: Array.isArray(targetUserIds) ? targetUserIds : currentSettings.targetUserIds,
      fallbackCarouselItems: Array.isArray(fallbackCarouselItems) ? fallbackCarouselItems : currentSettings.fallbackCarouselItems,
      carouselIntervalSeconds: typeof carouselIntervalSeconds === "number" ? carouselIntervalSeconds : currentSettings.carouselIntervalSeconds,
      isEnabled: isEnabled !== undefined ? Boolean(isEnabled) : currentSettings.isEnabled,
    };

    if (!setting) {
      setting = await AdminSettings.create({
        settingKey: "home_free_chat_card",
        settingValue: JSON.stringify(newSettings),
        description: "Home screen Free Chat promotional card and fallback banner configuration",
        isActive: newSettings.isEnabled,
      });
    } else {
      await setting.update({
        settingValue: JSON.stringify(newSettings),
        isActive: newSettings.isEnabled,
      });
    }

    invalidateCache();
    const updated = await getSettingsInternal(true);

    res.status(200).json({
      success: true,
      message: "Home card settings updated successfully",
      settings: updated,
    });
  } catch (error) {
    console.error("Update home card settings error:", error);
    res.status(500).json({
      success: false,
      message: "Failed to update home card settings",
      error: error.message,
    });
  }
};

/**
 * Toggle home card ON/OFF (Admin)
 */
const toggleHomeCard = async (req, res) => {
  try {
    let setting = await AdminSettings.findOne({
      where: { settingKey: "home_free_chat_card" },
    });

    if (!setting) {
      setting = await AdminSettings.create({
        settingKey: "home_free_chat_card",
        settingValue: JSON.stringify(DEFAULT_SETTINGS),
        description: "Home screen Free Chat promotional card and fallback banner configuration",
        isActive: !DEFAULT_SETTINGS.isEnabled,
      });
    } else {
      await setting.update({
        isActive: !setting.isActive,
      });
    }

    invalidateCache();
    const updated = await getSettingsInternal(true);

    res.status(200).json({
      success: true,
      message: `Home card ${updated.isEnabled ? "enabled" : "disabled"} successfully`,
      settings: updated,
    });
  } catch (error) {
    console.error("Toggle home card error:", error);
    res.status(500).json({
      success: false,
      message: "Failed to toggle home card",
      error: error.message,
    });
  }
};

/**
 * Get evaluated home card config for logged-in user (Mobile App)
 */
const getUserHomeCardConfig = async (req, res) => {
  try {
    const settings = await getSettingsInternal();
    const userId = req.user?.id;

    let showCard = settings.isEnabled;
    let userName = "User";
    let freeChatPreview = null;
    let userActiveCohorts = [];

    if (userId) {
      try {
        const user = await User.findByPk(userId, {
          attributes: ["id", "fullName", "createdAt"],
        });
        if (user) {
          if (user.fullName && user.fullName.trim()) {
            userName = user.fullName.trim().split(" ")[0]; // First name or full name
          }

          if (showCard && settings.targetCondition === "FIRST_TIME_USER") {
            // Check if account created within last 7 days
            const created = new Date(user.createdAt).getTime();
            const sevenDaysMs = 7 * 24 * 60 * 60 * 1000;
            if (Date.now() - created > sevenDaysMs) {
              showCard = false;
            }
          } else if (showCard && settings.targetCondition === "CUSTOM_USERS") {
            const ids = settings.targetUserIds || [];
            if (!ids.includes(userId) && !ids.includes(String(userId))) {
              showCard = false;
            }
          }
        }

        const freeChatPayload = await getUserFreeChatSummary(userId);
        const matchingAllocation = (freeChatPayload?.allocations || []).find(
          isAiEligibleAllocation
        );

        if (matchingAllocation) {
          freeChatPreview = {
            id: matchingAllocation.id,
            minutes: Number(matchingAllocation.minutes || 0) || 0,
            applicableChatType: matchingAllocation.applicableChatType,
          };
        }

        if (!freeChatPreview) {
          showCard = false;
        }

        // Fetch User Interest Cohorts
        try {
          const activeCohorts = await UserInterestCohort.findAll({
            where: {
              userId,
              cohortType: "interest",
              isActive: true,
              scoreAtAssignment: { [Op.gt]: 0 },
            },
            attributes: ["category"],
          });
          
          if (activeCohorts && activeCohorts.length > 0) {
            userActiveCohorts = activeCohorts.map(c => c.category);
          }
        } catch (cohortErr) {
          console.error("Error fetching user cohorts for home card:", cohortErr);
        }

      } catch (dbErr) {
        console.error("Error evaluating user condition for home card:", dbErr);
        showCard = false;
      }
    } else {
      showCard = false;
    }

    // Replace {name} placeholder in title
    const rawTitle = settings.title || DEFAULT_SETTINGS.title;
    const processedTitle = rawTitle.replace(/\{name\}/gi, userName);

    console.log(`[HomeCardConfig] Sending config for user ${userName}. Active Cohorts:`, userActiveCohorts);

    res.status(200).json({
      success: true,
      config: {
        showCard,
        isEnabled: settings.isEnabled,
        targetCondition: settings.targetCondition,
        title: processedTitle,
        subtitle: settings.subtitle || DEFAULT_SETTINGS.subtitle,
        buttonText: settings.buttonText || DEFAULT_SETTINGS.buttonText,
        freeChatPreview,
        fallbackCarouselItems: settings.fallbackCarouselItems || DEFAULT_SETTINGS.fallbackCarouselItems,
        carouselIntervalSeconds: settings.carouselIntervalSeconds || 4,
        activeInterestCohorts: userActiveCohorts,
      },
    });
  } catch (error) {
    console.error("Get user home card config error:", error);
    // Return default fallback on error so app never breaks
    res.status(200).json({
      success: true,
      config: {
        showCard: false,
        isEnabled: true,
        targetCondition: "ALL",
        title: "User, facing any confusion?",
        subtitle: "Talk to our verified astrologers and get your first question answered for free.",
        buttonText: "Free Chat",
        freeChatPreview: null,
        fallbackCarouselItems: DEFAULT_SETTINGS.fallbackCarouselItems,
        carouselIntervalSeconds: 4,
        activeInterestCohorts: [],
      },
    });
  }
};

module.exports = {
  getHomeCardSettings,
  updateHomeCardSettings,
  toggleHomeCard,
  getUserHomeCardConfig,
};
