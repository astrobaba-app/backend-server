const AdminSettings = require("../../model/admin/adminSettings");

/**
 * Get signup bonus settings
 */
const getSignupBonusSettings = async (req, res) => {
  try {
    let setting = await AdminSettings.findOne({
      where: { settingKey: "signup_bonus" },
    });

    if (!setting) {
      // Create default setting if it doesn't exist
      try {
        setting = await AdminSettings.create({
          settingKey: "signup_bonus",
          settingValue: JSON.stringify({ amount: 50 }),
          description: "Signup bonus credited to new users upon registration",
          isActive: false,
        });
      } catch (createError) {
        // If creation fails due to unique constraint (race condition),
        // try to fetch the setting again
        if (createError.name === 'SequelizeUniqueConstraintError') {
          setting = await AdminSettings.findOne({
            where: { settingKey: "signup_bonus" },
          });
          if (!setting) {
            throw new Error("Failed to fetch or create signup bonus settings");
          }
        } else {
          throw createError;
        }
      }
    }

    const settingValue = JSON.parse(setting.settingValue);

    res.status(200).json({
      success: true,
      settings: {
        isEnabled: setting.isActive,
        amount: parseFloat(settingValue.amount || 50),
        description: setting.description,
      },
    });
  } catch (error) {
    console.error("Get signup bonus settings error:", error);
    res.status(500).json({
      success: false,
      message: "Failed to fetch signup bonus settings",
      error: error.message,
    });
  }
};

/**
 * Update signup bonus settings
 */
const updateSignupBonusSettings = async (req, res) => {
  try {
    const { isEnabled, amount } = req.body;

    if (amount !== undefined && (isNaN(amount) || amount < 0)) {
      return res.status(400).json({
        success: false,
        message: "Amount must be a positive number",
      });
    }

    let setting = await AdminSettings.findOne({
      where: { settingKey: "signup_bonus" },
    });

    if (!setting) {
      // Create setting if it doesn't exist
      setting = await AdminSettings.create({
        settingKey: "signup_bonus",
        settingValue: JSON.stringify({ amount: amount || 50 }),
        description: "Signup bonus credited to new users upon registration",
        isActive: isEnabled !== undefined ? isEnabled : false,
      });
    } else {
      // Update existing setting
      const currentValue = JSON.parse(setting.settingValue);
      const newValue = {
        amount: amount !== undefined ? amount : currentValue.amount,
      };

      await setting.update({
        settingValue: JSON.stringify(newValue),
        isActive: isEnabled !== undefined ? isEnabled : setting.isActive,
      });
    }

    const settingValue = JSON.parse(setting.settingValue);

    res.status(200).json({
      success: true,
      message: "Signup bonus settings updated successfully",
      settings: {
        isEnabled: setting.isActive,
        amount: parseFloat(settingValue.amount),
        description: setting.description,
      },
    });
  } catch (error) {
    console.error("Update signup bonus settings error:", error);
    res.status(500).json({
      success: false,
      message: "Failed to update signup bonus settings",
      error: error.message,
    });
  }
};

/**
 * Toggle signup bonus on/off
 */
const toggleSignupBonus = async (req, res) => {
  try {
    let setting = await AdminSettings.findOne({
      where: { settingKey: "signup_bonus" },
    });

    if (!setting) {
      // Create setting if it doesn't exist
      setting = await AdminSettings.create({
        settingKey: "signup_bonus",
        settingValue: JSON.stringify({ amount: 50 }),
        description: "Signup bonus credited to new users upon registration",
        isActive: true,
      });
    } else {
      // Toggle the active status
      await setting.update({
        isActive: !setting.isActive,
      });
    }

    const settingValue = JSON.parse(setting.settingValue);

    res.status(200).json({
      success: true,
      message: `Signup bonus ${setting.isActive ? "enabled" : "disabled"} successfully`,
      settings: {
        isEnabled: setting.isActive,
        amount: parseFloat(settingValue.amount),
        description: setting.description,
      },
    });
  } catch (error) {
    console.error("Toggle signup bonus error:", error);
    res.status(500).json({
      success: false,
      message: "Failed to toggle signup bonus",
      error: error.message,
    });
  }
};

module.exports = {
  getSignupBonusSettings,
  updateSignupBonusSettings,
  toggleSignupBonus,
};
