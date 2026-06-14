const express = require('express');
const {
  redirectToGoogle,
  googleCallback,
  googleMobileLogin,
} = require('../../controller/authController/googleAuthController');


const router = express.Router();

router.get('/google', redirectToGoogle);
router.get('/google/callback', googleCallback);
router.post('/google/mobile', googleMobileLogin);

module.exports = router;
