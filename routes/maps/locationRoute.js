const express = require('express');
const router = express.Router();
const { getStates, getCities, validateLocation } = require('../../controller/maps/locationController');

// Public routes - no authentication required for location data
router.get('/states', getStates);
router.get('/cities', getCities);
router.post('/validate', validateLocation);

module.exports = router;
