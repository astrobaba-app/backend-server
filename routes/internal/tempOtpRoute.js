const express = require("express");
const {
  sendTemporaryMsg91Otp,
} = require("../../controller/internal/tempOtpController");

const router = express.Router();

router.post("/send", sendTemporaryMsg91Otp);

module.exports = router;
