const Cart = require("../../model/store/cart");
const Product = require("../../model/store/product");
const User = require("../../model/user/user");

// Add product to cart
exports.addToCart = async (req, res) => {
  try {
    const userId = req.user.id;
    const { productId, quantity = 1 } = req.body;

    if (!productId) {
      return res.status(400).json({
        success: false,
        message: "Product ID is required",
      });
    }

    // Validate product exists and is active
    const product = await Product.findByPk(productId);
    if (!product) {
      return res.status(404).json({
        success: false,
        message: "Product not found",
      });
    }

    if (!product.isActive) {
      return res.status(400).json({
        success: false,
        message: "Product is not available",
      });
    }

    // Check stock for physical products
    if (product.productType === "physical" && product.stock < quantity) {
      return res.status(400).json({
        success: false,
        message: `Only ${product.stock} items available in stock`,
      });
    }

    // Check if product already in cart
    const existingCartItem = await Cart.findOne({
      where: { userId, productId },
    });

    if (existingCartItem) {
      // Update quantity
      const newQuantity = existingCartItem.quantity + quantity;

      // Check stock again
      if (product.productType === "physical" && product.stock < newQuantity) {
        return res.status(400).json({
          success: false,
          message: `Cannot add more. Only ${product.stock} items available`,
        });
      }

      await existingCartItem.update({ quantity: newQuantity });

      return res.status(200).json({
        success: true,
        message: "Cart updated successfully",
        cartItem: existingCartItem,
      });
    }

    // Add new item to cart
    const currentPrice = product.discountPrice || product.price;
    const cartItem = await Cart.create({
      userId,
      productId,
      quantity,
      priceAtAdd: currentPrice,
    });

    return res.status(201).json({
      success: true,
      message: "Product added to cart",
      cartItem,
    });
  } catch (error) {
    console.error("Error adding to cart:", error);
    return res.status(500).json({
      success: false,
      message: "Failed to add product to cart",
      error: error.message,
    });
  }
};

// Get user's cart
exports.getMyCart = async (req, res) => {
  try {
    const userId = req.user.id;

    const cartItems = await Cart.findAll({
      where: { userId },
      include: [
        {
          model: Product,
          as: "product",
          attributes: [
            "id",
            "productName",
            "slug",
            "price",
            "discountPrice",
            "images",
            "category",
            "productType",
            "stock",
            "isActive",
            "averageRating",
          ],
        },
      ],
      order: [["createdAt", "DESC"]],
    });

    // Calculate cart summary
    let subtotal = 0;
    let totalItems = 0;
    const validItems = [];
    const unavailableItems = [];

    for (const item of cartItems) {
      const product = item.product;

      // Check if product is still available
      if (!product || !product.isActive) {
        unavailableItems.push(item);
        continue;
      }

      // Check stock for physical products
      if (product.productType === "physical" && product.stock < item.quantity) {
        item.dataValues.stockIssue = true;
        item.dataValues.availableStock = product.stock;
      }

      const currentPrice = product.discountPrice || product.price;
      const itemTotal = parseFloat(currentPrice) * item.quantity;

      subtotal += itemTotal;
      totalItems += item.quantity;

      item.dataValues.currentPrice = currentPrice;
      item.dataValues.itemTotal = itemTotal;
      validItems.push(item);
    }

    return res.status(200).json({
      success: true,
      cart: {
        items: validItems,
        unavailableItems,
        summary: {
          totalItems,
          subtotal: subtotal.toFixed(2),
          estimatedTotal: subtotal.toFixed(2),
        },
      },
    });
  } catch (error) {
    console.error("Error fetching cart:", error);
    return res.status(500).json({
      success: false,
      message: "Failed to fetch cart",
      error: error.message,
    });
  }
};

// Update cart item quantity
exports.updateCartQuantity = async (req, res) => {
  try {
    const userId = req.user.id;
    const { cartItemId } = req.params;
    const { quantity } = req.body;

    if (!quantity || quantity < 1) {
      return res.status(400).json({
        success: false,
        message: "Quantity must be at least 1",
      });
    }

    const cartItem = await Cart.findOne({
      where: { id: cartItemId, userId },
      include: [{ model: Product, as: "product" }],
    });

    if (!cartItem) {
      return res.status(404).json({
        success: false,
        message: "Cart item not found",
      });
    }

    const product = cartItem.product;

    // Check stock for physical products
    if (product.productType === "physical" && product.stock < quantity) {
      return res.status(400).json({
        success: false,
        message: `Only ${product.stock} items available in stock`,
      });
    }

    await cartItem.update({ quantity });

    return res.status(200).json({
      success: true,
      message: "Cart updated successfully",
      cartItem,
    });
  } catch (error) {
    console.error("Error updating cart:", error);
    return res.status(500).json({
      success: false,
      message: "Failed to update cart",
      error: error.message,
    });
  }
};

// Remove item from cart
exports.removeFromCart = async (req, res) => {
  try {
    const userId = req.user.id;
    const { cartItemId } = req.params;

    const cartItem = await Cart.findOne({
      where: { id: cartItemId, userId },
    });

    if (!cartItem) {
      return res.status(404).json({
        success: false,
        message: "Cart item not found",
      });
    }

    await cartItem.destroy();

    return res.status(200).json({
      success: true,
      message: "Item removed from cart",
    });
  } catch (error) {
    console.error("Error removing from cart:", error);
    return res.status(500).json({
      success: false,
      message: "Failed to remove item from cart",
      error: error.message,
    });
  }
};

// Clear cart
exports.clearCart = async (req, res) => {
  try {
    const userId = req.user.id;

    await Cart.destroy({ where: { userId } });

    return res.status(200).json({
      success: true,
      message: "Cart cleared successfully",
    });
  } catch (error) {
    console.error("Error clearing cart:", error);
    return res.status(500).json({
      success: false,
      message: "Failed to clear cart",
      error: error.message,
    });
  }
};

// Get cart count
exports.getCartCount = async (req, res) => {
  try {
    const userId = req.user.id;

    const count = await Cart.count({ where: { userId } });

    return res.status(200).json({
      success: true,
      count,
    });
  } catch (error) {
    console.error("Error fetching cart count:", error);
    return res.status(500).json({
      success: false,
      message: "Failed to fetch cart count",
      error: error.message,
    });
  }
};
