const express = require("express");
const router = express.Router();
const {
  getAllAstrologers,
  getAstrologerById,
  getTopRatedAstrologers,
  searchAstrologers,
} = require("../../controller/astrologer/astrologerController");

// Public routes - All users can access
router.get("/", getAllAstrologers);
router.get("/top-rated", getTopRatedAstrologers);
router.get("/search", searchAstrologers);
router.get("/:astrologerId", getAstrologerById);

module.exports = router;
