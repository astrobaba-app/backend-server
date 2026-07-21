const axios = require('axios');

const GOOGLE_MAPS_API_KEY = process.env.MAPS_API_KEY;
const PLACES_BASE_URL = 'https://maps.googleapis.com/maps/api/place';
const GEOCODING_BASE_URL = 'https://maps.googleapis.com/maps/api/geocode/json';

const getGoogleErrorMessage = (fallbackMessage, responseData) =>
  responseData?.error_message || responseData?.message || fallbackMessage;

// GET /api/maps/autocomplete?input=...
const getAutocompleteSuggestions = async (req, res) => {
  try {
    const {
      input,
      types = '(cities)',
      components,
    } = req.query;

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

    const params = {
      input: input.trim(),
      types,
      key: GOOGLE_MAPS_API_KEY,
    };

    if (components) {
      params.components = components;
    }

    const response = await axios.get(`${PLACES_BASE_URL}/autocomplete/json`, {
      params,
      timeout: 5000,
    });

    if (response.data?.status && response.data.status !== 'OK' && response.data.status !== 'ZERO_RESULTS') {
      return res.status(400).json({
        success: false,
        message: getGoogleErrorMessage(
          'Failed to fetch place suggestions',
          response.data,
        ),
        googleStatus: response.data.status,
        error: response.data,
      });
    }

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

    const response = await axios.get(`${PLACES_BASE_URL}/details/json`, {
      params: {
        place_id: placeId,
        fields: 'geometry',
        key: GOOGLE_MAPS_API_KEY,
      },
      timeout: 5000,
    });

    if (response.data?.status && response.data.status !== 'OK') {
      return res.status(400).json({
        success: false,
        message: getGoogleErrorMessage(
          'Failed to fetch place details',
          response.data,
        ),
        googleStatus: response.data.status,
        error: response.data,
      });
    }

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

// GET /api/maps/reverse-geocode?latlng=22.5726,88.3639
const reverseGeocodeLocation = async (req, res) => {
  try {
    const { latlng } = req.query;

    if (!latlng || !String(latlng).trim()) {
      return res.status(400).json({
        success: false,
        message: 'Query parameter "latlng" is required',
      });
    }

    if (!GOOGLE_MAPS_API_KEY) {
      return res.status(500).json({
        success: false,
        message: 'Google Maps API key is not configured on the server',
      });
    }

    const response = await axios.get(GEOCODING_BASE_URL, {
      params: {
        latlng: String(latlng).trim(),
        key: GOOGLE_MAPS_API_KEY,
      },
      timeout: 5000,
    });

    if (response.data?.status && response.data.status !== 'OK') {
      return res.status(400).json({
        success: false,
        message: getGoogleErrorMessage(
          'Failed to reverse geocode location',
          response.data,
        ),
        googleStatus: response.data.status,
        error: response.data,
      });
    }

    return res.status(200).json(response.data);
  } catch (error) {
    console.error('Maps reverse geocode error:', error.response?.data || error.message || error);
    return res.status(500).json({
      success: false,
      message: 'Failed to reverse geocode location',
      error: error.response?.data || error.message,
    });
  }
};

module.exports = {
  getAutocompleteSuggestions,
  getPlaceDetails,
  reverseGeocodeLocation,
};
