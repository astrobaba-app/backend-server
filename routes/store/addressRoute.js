const express = require("express");
const router = express.Router();
const addressController = require("../../controller/store/addressController");
const checkForAuthenticationCookie = require("../../middleware/authMiddleware");

router.use(checkForAuthenticationCookie());

router.post("/", addressController.createAddress);
router.get("/", addressController.getAllAddresses);
router.get("/:id", addressController.getAddressById);
router.put("/:id/set-default", addressController.setDefaultAddress);
router.put("/:id", addressController.updateAddress);
router.delete("/:id", addressController.deleteAddress);

module.exports = router;
