const express = require("express");
const router = express.Router();
const {
  getProfile,
  updateProfile,
  updateLanguagePreference,
} = require("../../controller/profileController/userProfileController");
const {
  requestAccountDeletion,
  getDeletionRequestStatus,
  cancelDeletionRequest
} = require("../../controller/profileController/accountDeletionController");
const checkForAuthenticationCookie = require("../../middleware/authMiddleware");
const optionalAuthentication = require("../../middleware/optionalMiddleware");
const { getUserHomeCardConfig } = require("../../controller/admin/homeCardController");

// All profile routes are protected
router.get("/profile", checkForAuthenticationCookie(), getProfile);
router.put("/profile", checkForAuthenticationCookie(), updateProfile);
router.put("/language", checkForAuthenticationCookie(), updateLanguagePreference);

// Account deletion routes
router.post("/account-deletion", checkForAuthenticationCookie(), requestAccountDeletion);
router.get("/account-deletion/status", checkForAuthenticationCookie(), getDeletionRequestStatus);
router.delete("/account-deletion/:requestId", checkForAuthenticationCookie(), cancelDeletionRequest);

// Home screen configuration (works for both guests and authenticated users)
router.get("/home-card-config", optionalAuthentication(), getUserHomeCardConfig);

module.exports = router;
