const express = require("express");
const router = express.Router();
const checkForAuthenticationCookie = require("../../middleware/authMiddleware");
const { authorizeRoles } = require("../../middleware/roleMiddleware");
const {
  getAstrologerEarningsDashboard,
  createPayoutRequest,
  getMyPayoutRequests,
} = require("../../controller/astrologer/earningController");

router.get(
  "/dashboard",
  checkForAuthenticationCookie(),
  authorizeRoles(["astrologer"]),
  getAstrologerEarningsDashboard
);

router.post(
  "/payout-request",
  checkForAuthenticationCookie(),
  authorizeRoles(["astrologer"]),
  createPayoutRequest
);

router.get(
  "/payout-requests",
  checkForAuthenticationCookie(),
  authorizeRoles(["astrologer"]),
  getMyPayoutRequests
);

module.exports = router;
