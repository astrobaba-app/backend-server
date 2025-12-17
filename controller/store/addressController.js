const Address = require("../../model/user/address");
const User = require("../../model/user/userAuth");

// Create a new address
exports.createAddress = async (req, res) => {
  try {
    const userId = req.user.id;
    const {
      fullName,
      phone,
      addressLine1,
      addressLine2,
      city,
      state,
      pincode,
      country,
      landmark,
      addressType,
      isDefault,
    } = req.body;

    // Validate required fields
    if (!fullName || !phone || !addressLine1 || !city || !state || !pincode) {
      return res.status(400).json({
        success: false,
        message: "Please provide all required fields",
      });
    }

    // If this address is marked as default, unset other default addresses
    if (isDefault) {
      await Address.update(
        { isDefault: false },
        { where: { userId, isDefault: true } }
      );
    }

    // Create the address
    const address = await Address.create({
      userId,
      fullName,
      phone,
      addressLine1,
      addressLine2,
      city,
      state,
      pincode,
      country: country || "India",
      landmark,
      addressType: addressType || "home",
      isDefault: isDefault || false,
    });

    return res.status(201).json({
      success: true,
      message: "Address created successfully",
      address,
    });
  } catch (error) {
    console.error("Error creating address:", error);
    return res.status(500).json({
      success: false,
      message: "Failed to create address",
      error: error.message,
    });
  }
};

// Get all addresses for the logged-in user
exports.getAllAddresses = async (req, res) => {
  try {
    const userId = req.user.id;

    const addresses = await Address.findAll({
      where: { userId },
      order: [
        ["isDefault", "DESC"],
        ["createdAt", "DESC"],
      ],
    });

    return res.status(200).json({
      success: true,
      count: addresses.length,
      addresses,
    });
  } catch (error) {
    console.error("Error fetching addresses:", error);
    return res.status(500).json({
      success: false,
      message: "Failed to fetch addresses",
      error: error.message,
    });
  }
};


// Get a single address by ID
exports.getAddressById = async (req, res) => {
  try {
    const userId = req.user.id;
    const { id } = req.params;

    const address = await Address.findOne({
      where: { id, userId },
    });

    if (!address) {
      return res.status(404).json({
        success: false,
        message: "Address not found",
      });
    }

    return res.status(200).json({
      success: true,
      address,
    });
  } catch (error) {
    console.error("Error fetching address:", error);
    return res.status(500).json({
      success: false,
      message: "Failed to fetch address",
      error: error.message,
    });
  }
};

// Update an address
exports.updateAddress = async (req, res) => {
  try {
    const userId = req.user.id;
    const { id } = req.params;
    const {
      fullName,
      phone,
      addressLine1,
      addressLine2,
      city,
      state,
      pincode,
      country,
      landmark,
      addressType,
      isDefault,
    } = req.body;

    // Find the address
    const address = await Address.findOne({
      where: { id, userId },
    });

    if (!address) {
      return res.status(404).json({
        success: false,
        message: "Address not found",
      });
    }

    // If this address is marked as default, unset other default addresses
    if (isDefault && !address.isDefault) {
      await Address.update(
        { isDefault: false },
        { where: { userId, isDefault: true } }
      );
    }

    // Update the address
    await address.update({
      fullName: fullName || address.fullName,
      phone: phone || address.phone,
      addressLine1: addressLine1 || address.addressLine1,
      addressLine2: addressLine2 !== undefined ? addressLine2 : address.addressLine2,
      city: city || address.city,
      state: state || address.state,
      pincode: pincode || address.pincode,
      country: country || address.country,
      landmark: landmark !== undefined ? landmark : address.landmark,
      addressType: addressType || address.addressType,
      isDefault: isDefault !== undefined ? isDefault : address.isDefault,
    });

    return res.status(200).json({
      success: true,
      message: "Address updated successfully",
      address,
    });
  } catch (error) {
    console.error("Error updating address:", error);
    return res.status(500).json({
      success: false,
      message: "Failed to update address",
      error: error.message,
    });
  }
};

// Delete an address
exports.deleteAddress = async (req, res) => {
  try {
    const userId = req.user.id;
    const { id } = req.params;

    // Find the address
    const address = await Address.findOne({
      where: { id, userId },
    });

    if (!address) {
      return res.status(404).json({
        success: false,
        message: "Address not found",
      });
    }

    // Delete the address
    await address.destroy();

    return res.status(200).json({
      success: true,
      message: "Address deleted successfully",
    });
  } catch (error) {
    console.error("Error deleting address:", error);
    return res.status(500).json({
      success: false,
      message: "Failed to delete address",
      error: error.message,
    });
  }
};

// Set an address as default
exports.setDefaultAddress = async (req, res) => {
  try {
    const userId = req.user.id;
    const { id } = req.params;

    // Find the address
    const address = await Address.findOne({
      where: { id, userId },
    });

    if (!address) {
      return res.status(404).json({
        success: false,
        message: "Address not found",
      });
    }

    // If address is already default, no need to update
    if (address.isDefault) {
      return res.status(200).json({
        success: true,
        message: "Address is already set as default",
        address,
      });
    }

    // Unset all other default addresses for this user
    await Address.update(
      { isDefault: false },
      { where: { userId, isDefault: true } }
    );

    // Set this address as default
    await address.update({ isDefault: true });

    return res.status(200).json({
      success: true,
      message: "Default address updated successfully",
      address,
    });
  } catch (error) {
    console.error("Error setting default address:", error);
    return res.status(500).json({
      success: false,
      message: "Failed to set default address",
      error: error.message,
    });
  }
};
