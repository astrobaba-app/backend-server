const express = require("express");
const router = express.Router();
const {
  getProfile,
  updateProfile,
} = require("../../controller/profileController/userProfileController");
const checkForAuthenticationCookie = require("../../middleware/authMiddleware");

// All profile routes are protected
router.get("/profile", checkForAuthenticationCookie(), getProfile);
router.put("/profile", checkForAuthenticationCookie(), updateProfile);

module.exports = router;
