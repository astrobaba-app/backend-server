const express = require("express");
const router = express.Router();

// Import all store routes
const productRoute = require("./productRoute");
const cartRoute = require("./cartRoute");
const orderRoute = require("./orderRoute");
const reviewRoute = require("./reviewRoute");

// Mount routes
router.use(productRoute);
router.use(cartRoute);
router.use(orderRoute);
router.use(reviewRoute);

module.exports = router;
