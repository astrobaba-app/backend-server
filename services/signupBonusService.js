const AdminSettings = require("../model/admin/adminSettings");
const { creditWallet } = require("./walletService");

/**
 * Get signup bonus settings from admin settings
 * @returns {Promise<Object>} Signup bonus settings
 */
const getSignupBonusSettings = async () => {
  try {
    const setting = await AdminSettings.findOne({
      where: { settingKey: "signup_bonus" },
    });

    if (!setting) {
      // Return default settings if not found
      return {
        isEnabled: false,
        amount: 50,
      };
    }

    const settingValue = JSON.parse(setting.settingValue);

    return {
      isEnabled: setting.isActive,
      amount: parseFloat(settingValue.amount || 50),
    };
  } catch (error) {
    console.error("Get signup bonus settings error:", error);
    // Return default settings on error
    return {
      isEnabled: false,
      amount: 50,
    };
  }
};

/**
 * Apply signup bonus to a new user
 * @param {string} userId - User ID
 * @param {string} registrationMethod - Method used for registration (phone/google)
 * @returns {Promise<Object>} Result of bonus application
 */
const applySignupBonus = async (userId, registrationMethod = "unknown") => {
  try {
    // Get signup bonus settings
    const bonusSettings = await getSignupBonusSettings();

    if (!bonusSettings.isEnabled) {
      return {
        success: false,
        message: "Signup bonus is currently disabled",
        bonusApplied: false,
      };
    }

    if (bonusSettings.amount <= 0) {
      return {
        success: false,
        message: "Invalid bonus amount",
        bonusApplied: false,
      };
    }

    // Credit the signup bonus to user's wallet
    const result = await creditWallet(
      userId,
      bonusSettings.amount,
      `Signup bonus for registering via ${registrationMethod}`,
      "signup_bonus"
    );

    return {
      success: true,
      message: `₹${bonusSettings.amount} signup bonus credited successfully`,
      bonusApplied: true,
      amount: bonusSettings.amount,
      wallet: result.wallet,
    };
  } catch (error) {
    console.error("Apply signup bonus error:", error);
    return {
      success: false,
      message: "Failed to apply signup bonus",
      error: error.message,
      bonusApplied: false,
    };
  }
};

module.exports = {
  getSignupBonusSettings,
  applySignupBonus,
};
