const express = require('express');
const router = express.Router();
const { getAutocompleteSuggestions, getPlaceDetails } = require('../../controller/maps/mapsController');
const checkForAuthenticationCookie = require('../../middleware/authMiddleware');

router.get('/autocomplete', checkForAuthenticationCookie(), getAutocompleteSuggestions);
router.get('/details', checkForAuthenticationCookie(), getPlaceDetails);

module.exports = router;
