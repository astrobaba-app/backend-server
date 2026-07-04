const express = require("express");
const {
  getShareTypes,
  resolveAppShareLink,
  resolveShareLink,
} = require("../../controller/share/shareController");

const router = express.Router();

router.get("/types", getShareTypes);
router.get("/app", resolveAppShareLink);
router.get("/:type/:id", resolveShareLink);

module.exports = router;
