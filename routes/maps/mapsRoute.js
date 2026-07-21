const express = require('express');
const router = express.Router();
const {
  getAutocompleteSuggestions,
  getPlaceDetails,
  reverseGeocodeLocation,
} = require('../../controller/maps/mapsController');
const checkForAuthenticationCookie = require('../../middleware/authMiddleware');

router.get('/autocomplete', checkForAuthenticationCookie.optional(), getAutocompleteSuggestions);
router.get('/details', checkForAuthenticationCookie.optional(), getPlaceDetails);
router.get('/reverse-geocode', checkForAuthenticationCookie.optional(), reverseGeocodeLocation);

module.exports = router;
