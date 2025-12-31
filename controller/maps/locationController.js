const {
  getAllStates,
  getCitiesByState,
  validatePincode,
  isValidState,
  isValidCity,
} = require('../../utils/indianLocations');

// GET /api/location/states - Get all Indian states
const getStates = async (req, res) => {
  try {
    const states = getAllStates();
    return res.status(200).json({
      success: true,
      states,
    });
  } catch (error) {
    console.error('Get states error:', error);
    return res.status(500).json({
      success: false,
      message: 'Failed to fetch states',
      error: error.message,
    });
  }
};

// GET /api/location/cities?state=StateName - Get cities by state
const getCities = async (req, res) => {
  try {
    const { state } = req.query;

    if (!state) {
      return res.status(400).json({
        success: false,
        message: 'State parameter is required',
      });
    }

    if (!isValidState(state)) {
      return res.status(400).json({
        success: false,
        message: 'Invalid state name',
      });
    }

    const cities = getCitiesByState(state);
    return res.status(200).json({
      success: true,
      state,
      cities,
    });
  } catch (error) {
    console.error('Get cities error:', error);
    return res.status(500).json({
      success: false,
      message: 'Failed to fetch cities',
      error: error.message,
    });
  }
};

// POST /api/location/validate - Validate location data
const validateLocation = async (req, res) => {
  try {
    const { state, city, pincode } = req.body;
    const errors = {};

    if (state && !isValidState(state)) {
      errors.state = 'Invalid state name';
    }

    if (state && city && !isValidCity(state, city)) {
      errors.city = `City not found in ${state}`;
    }

    if (pincode && !validatePincode(pincode)) {
      errors.pincode = 'Invalid pincode. Must be 6 digits';
    }

    if (Object.keys(errors).length > 0) {
      return res.status(400).json({
        success: false,
        message: 'Validation failed',
        errors,
      });
    }

    return res.status(200).json({
      success: true,
      message: 'Location data is valid',
    });
  } catch (error) {
    console.error('Validate location error:', error);
    return res.status(500).json({
      success: false,
      message: 'Failed to validate location',
      error: error.message,
    });
  }
};

module.exports = {
  getStates,
  getCities,
  validateLocation,
};
