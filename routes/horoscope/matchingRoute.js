const express = require("express");
const router = express.Router();
const {
  createMatching,
  getAllMatchings,
  getMatchingById,
  deleteMatching,
} = require("../../controller/horoscope/matchingController");
const checkForAuthenticationCookie = require("../../middleware/authMiddleware");

router.post("/create", checkForAuthenticationCookie(), createMatching);
router.get("/all",checkForAuthenticationCookie(), getAllMatchings);
router.get("/:matchingId",checkForAuthenticationCookie(), getMatchingById);
router.delete("/:matchingId",checkForAuthenticationCookie(), deleteMatching);

module.exports = router;
