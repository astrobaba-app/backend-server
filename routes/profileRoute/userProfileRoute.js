const express = require("express");
const router = express.Router();
const {
  getProfile,
  updateProfile,
} = require("../../controller/profileController/userProfileController");
const {
  requestAccountDeletion,
  getDeletionRequestStatus,
  cancelDeletionRequest
} = require("../../controller/profileController/accountDeletionController");
const checkForAuthenticationCookie = require("../../middleware/authMiddleware");

// All profile routes are protected
router.get("/profile", checkForAuthenticationCookie(), getProfile);
router.put("/profile", checkForAuthenticationCookie(), updateProfile);

// Account deletion routes
router.post("/account-deletion", checkForAuthenticationCookie(), requestAccountDeletion);
router.get("/account-deletion/status", checkForAuthenticationCookie(), getDeletionRequestStatus);
router.delete("/account-deletion/:requestId", checkForAuthenticationCookie(), cancelDeletionRequest);

module.exports = router;
