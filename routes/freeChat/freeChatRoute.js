const express = require("express");
const router = express.Router();

const checkForAuthenticationCookie = require("../../middleware/authMiddleware");
const { getMyFreeChatSummary } = require("../../controller/freeChat/freeChatController");

router.get("/me", checkForAuthenticationCookie(), getMyFreeChatSummary);

module.exports = router;
