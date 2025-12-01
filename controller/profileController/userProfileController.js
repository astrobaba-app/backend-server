const User = require("../../model/user/userAuth");

/**
 * Get user profile
 */
const getProfile = async (req, res) => {
  try {
    const userId = req.user.id; // Assuming auth middleware adds user to req

    const user = await User.findByPk(userId, {
      attributes: [
        "id",
        "googleId",
        "fullName",
        "email",
        "mobile",
        "gender",
        "dateOfbirth",
        "timeOfbirth",
        "placeOfBirth",
        "latitude",
        "longitude",
        "isUserRequested",
        "createdAt",
      ],
    });

    if (!user) {
      return res.status(404).json({
        success: false,
        message: "User not found",
      });
    }

    res.status(200).json({
      success: true,
      user,
    });
  } catch (error) {
    console.error("Get profile error:", error);
    res.status(500).json({
      success: false,
      message: "Failed to fetch profile",
      error: error.message,
    });
  }
};

/**
 * Update user profile
 */
const updateProfile = async (req, res) => {
  try {
    const userId = req.user.id;
    const {
      fullName,
      email,
      gender,
      dateOfbirth,
      timeOfbirth,
      placeOfBirth,
      latitude,
      longitude,
    } = req.body;

    const user = await User.findByPk(userId);

    if (!user) {
      return res.status(404).json({
        success: false,
        message: "User not found",
      });
    }

    // Update fields if provided
    if (fullName !== undefined) user.fullName = fullName;
    if (email !== undefined) user.email = email;
    if (gender !== undefined) user.gender = gender;
    if (dateOfbirth !== undefined) user.dateOfbirth = dateOfbirth;
    if (timeOfbirth !== undefined) user.timeOfbirth = timeOfbirth;
    if (placeOfBirth !== undefined) user.placeOfBirth = placeOfBirth;
    if (latitude !== undefined) user.latitude = latitude;
    if (longitude !== undefined) user.longitude = longitude;

    await user.save();

    res.status(200).json({
      success: true,
      message: "Profile updated successfully",
      user: {
        id: user.id,
        fullName: user.fullName,
        email: user.email,
        mobile: user.mobile,
        gender: user.gender,
        dateOfbirth: user.dateOfbirth,
        timeOfbirth: user.timeOfbirth,
        placeOfBirth: user.placeOfBirth,
        latitude: user.latitude,
        longitude: user.longitude,
      },
    });
  } catch (error) {
    console.error("Update profile error:", error);
    res.status(500).json({
      success: false,
      message: "Failed to update profile",
      error: error.message,
    });
  }
};

module.exports = {
  getProfile,
  updateProfile,
};
