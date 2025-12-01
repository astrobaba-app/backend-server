const express = require("express");
const router = express.Router();
const {
  createKundli,
  getKundli,
  getAllKundlis,
  getAllUserRequests,
} = require("../../controller/horoscope/kundliController");
const checkForAuthenticationCookie = require("../../middleware/authMiddleware");


router.post("/create", checkForAuthenticationCookie(), createKundli);

router.get("/all", checkForAuthenticationCookie(), getAllKundlis);
router.get("/user-requests", checkForAuthenticationCookie(), getAllUserRequests);
router.get("/:userRequestId", checkForAuthenticationCookie(), getKundli);

module.exports = router;
