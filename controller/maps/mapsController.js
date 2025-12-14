const axios = require('axios');

const GOOGLE_MAPS_API_KEY = process.env.MAPS_API_KEY;

// GET /api/maps/autocomplete?input=...
const getAutocompleteSuggestions = async (req, res) => {
  try {
    const { input } = req.query;

    if (!input || !input.trim()) {
      return res.status(400).json({
        success: false,
        message: 'Query parameter "input" is required',
      });
    }

    if (!GOOGLE_MAPS_API_KEY) {
      return res.status(500).json({
        success: false,
        message: 'Google Maps API key is not configured on the server',
      });
    }

    const response = await axios.get('https://maps.googleapis.com/maps/api/place/autocomplete/json', {
      params: {
        input: input.trim(),
        types: '(cities)',
        components: 'country:in',
        key: GOOGLE_MAPS_API_KEY,
      },
    });

    return res.status(200).json(response.data);
  } catch (error) {
    console.error('Maps autocomplete error:', error.response?.data || error.message || error);
    return res.status(500).json({
      success: false,
      message: 'Failed to fetch place suggestions',
      error: error.response?.data || error.message,
    });
  }
};

// GET /api/maps/details?placeId=...
const getPlaceDetails = async (req, res) => {
  try {
    const { placeId } = req.query;

    if (!placeId) {
      return res.status(400).json({
        success: false,
        message: 'Query parameter "placeId" is required',
      });
    }

    if (!GOOGLE_MAPS_API_KEY) {
      return res.status(500).json({
        success: false,
        message: 'Google Maps API key is not configured on the server',
      });
    }

    const response = await axios.get('https://maps.googleapis.com/maps/api/place/details/json', {
      params: {
        place_id: placeId,
        fields: 'geometry',
        key: GOOGLE_MAPS_API_KEY,
      },
    });

    return res.status(200).json(response.data);
  } catch (error) {
    console.error('Maps place details error:', error.response?.data || error.message || error);
    return res.status(500).json({
      success: false,
      message: 'Failed to fetch place details',
      error: error.response?.data || error.message,
    });
  }
};

module.exports = {
  getAutocompleteSuggestions,
  getPlaceDetails,
};
