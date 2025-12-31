const User = require("../../model/user/userAuth");
const { validatePincode, isValidState, isValidCity } = require("../../utils/indianLocations");


const getProfile = async (req, res) => {
  try {
    const userId = req.user.id; 

    const user = await User.findByPk(userId);

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
      currentAddress,
      city,
      state,
      country,
      pincode
    } = req.body;

    const user = await User.findByPk(userId);

    if (!user) {
      return res.status(404).json({
        success: false,
        message: "User not found",
      });
    }

    // Helper function to validate date
    const isValidDate = (dateString) => {
      if (!dateString || dateString === 'Invalid date' || dateString.trim() === '') {
        return false;
      }
      const date = new Date(dateString);
      return date instanceof Date && !isNaN(date.getTime());
    };

    // Helper function to validate time (HH:MM format)
    const isValidTime = (timeString) => {
      if (!timeString || timeString === ':' || timeString.trim() === '') {
        return false;
      }
      // Check if time matches HH:MM or HH:MM:SS format
      const timeRegex = /^([0-1]?[0-9]|2[0-3]):[0-5][0-9](:[0-5][0-9])?$/;
      return timeRegex.test(timeString);
    };

    // Update fields if provided
    if (fullName !== undefined) user.fullName = fullName;
    if (email !== undefined) user.email = email;
    if (gender !== undefined) user.gender = gender;
    
    // Validate and update dateOfbirth
    if (dateOfbirth !== undefined) {
      if (dateOfbirth === null || dateOfbirth === '') {
        user.dateOfbirth = null;
      } else if (isValidDate(dateOfbirth)) {
        user.dateOfbirth = dateOfbirth;
      } else {
        return res.status(400).json({
          success: false,
          message: "Invalid date format for date of birth",
        });
      }
    }
    
    // Validate and update timeOfbirth
    if (timeOfbirth !== undefined) {
      if (timeOfbirth === null || timeOfbirth === '') {
        user.timeOfbirth = null;
      } else if (isValidTime(timeOfbirth)) {
        user.timeOfbirth = timeOfbirth;
      } else {
        return res.status(400).json({
          success: false,
          message: "Invalid time format for time of birth. Expected format: HH:MM",
        });
      }
    }
    
    if (placeOfBirth !== undefined) user.placeOfBirth = placeOfBirth;
    
    // Handle latitude and longitude - convert empty strings to null
    if (latitude !== undefined) {
      user.latitude = latitude === "" || latitude === null ? null : parseFloat(latitude);
    }
    if (longitude !== undefined) {
      user.longitude = longitude === "" || longitude === null ? null : parseFloat(longitude);
    }
    
    if (currentAddress !== undefined) user.currentAddress = currentAddress;
    if (city !== undefined) user.city = city;
    
    // Validate state if provided
    if (state !== undefined) {
      if (state && !isValidState(state)) {
        return res.status(400).json({
          success: false,
          message: "Invalid state. Please select a valid Indian state",
        });
      }
      user.state = state;
    }
    
    // Validate country (only India allowed)
    if (country !== undefined) {
      if (country && country !== "India") {
        return res.status(400).json({
          success: false,
          message: "Only India is supported for country selection",
        });
      }
      user.country = country || "India";
    }
    
    // Validate pincode if provided
    if (pincode !== undefined) {
      if (pincode && !validatePincode(pincode)) {
        return res.status(400).json({
          success: false,
          message: "Invalid pincode. Indian pincode must be 6 digits",
        });
      }
      user.pincode = pincode;
    }
    
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
        currentAddress: user.currentAddress,
        city: user.city,
        state: user.state,
        country: user.country,
        pincode: user.pincode,
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
