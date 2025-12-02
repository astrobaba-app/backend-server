const Order = require("../../model/store/order");
const Cart = require("../../model/store/cart");
const Product = require("../../model/store/product");
const User = require("../../model/user/user");
const Wallet = require("../../model/wallet/wallet");
const WalletTransaction = require("../../model/wallet/walletTransaction");
const sequelize = require("../../config/database/database");
const {
  sendOrderConfirmationEmail,
  sendDigitalProductEmail,
  sendOrderStatusUpdateEmail,
} = require("../../emailService/storeOrderEmail");

// Helper function to generate unique order number
const generateOrderNumber = async () => {
  const year = new Date().getFullYear();
  const randomNum = Math.floor(Math.random() * 1000000)
    .toString()
    .padStart(6, "0");
  const orderNumber = `ORD-${year}-${randomNum}`;

  // Check if order number already exists
  const existing = await Order.findOne({ where: { orderNumber } });
  if (existing) {
    return generateOrderNumber(); // Recursively generate new number
  }

  return orderNumber;
};

// Helper function to determine order type
const determineOrderType = (items) => {
  const hasDigital = items.some((item) => item.productType === "digital");
  const hasPhysical = items.some((item) => item.productType === "physical");

  if (hasDigital && hasPhysical) return "mixed";
  if (hasDigital) return "digital";
  return "physical";
};

// Checkout
exports.checkout = async (req, res) => {
  const transaction = await sequelize.transaction();

  try {
    const userId = req.user.id;
    const {
      paymentMethod, // wallet, razorpay, cod
      deliveryAddress, // Required for physical products
      customerNotes,
      razorpayPaymentId, // If payment via Razorpay
    } = req.body;

    // Validate payment method
    if (!["wallet", "razorpay", "cod"].includes(paymentMethod)) {
      return res.status(400).json({
        success: false,
        message: "Invalid payment method",
      });
    }

    // Get user
    const user = await User.findByPk(userId);
    if (!user) {
      await transaction.rollback();
      return res.status(404).json({
        success: false,
        message: "User not found",
      });
    }

    // Get cart items
    const cartItems = await Cart.findAll({
      where: { userId },
      include: [{ model: Product, as: "product" }],
      transaction,
    });

    if (cartItems.length === 0) {
      await transaction.rollback();
      return res.status(400).json({
        success: false,
        message: "Cart is empty",
      });
    }

    // Validate all products and prepare order items
    const orderItems = [];
    let subtotal = 0;
    let orderType = null;
    const digitalProducts = [];

    for (const cartItem of cartItems) {
      const product = cartItem.product;

      // Validate product is active
      if (!product || !product.isActive) {
        await transaction.rollback();
        return res.status(400).json({
          success: false,
          message: `Product ${product?.productName || "unknown"} is not available`,
        });
      }

      // Check stock for physical products
      if (product.productType === "physical") {
        if (product.stock < cartItem.quantity) {
          await transaction.rollback();
          return res.status(400).json({
            success: false,
            message: `Insufficient stock for ${product.productName}. Only ${product.stock} available`,
          });
        }

        // Reduce stock
        await product.update(
          {
            stock: product.stock - cartItem.quantity,
            soldCount: product.soldCount + cartItem.quantity,
          },
          { transaction }
        );
      } else {
        // Increase soldCount for digital products
        await product.update(
          { soldCount: product.soldCount + cartItem.quantity },
          { transaction }
        );

        digitalProducts.push({
          productId: product.id,
          productName: product.productName,
          digitalFileUrl: product.digitalFileUrl,
          downloadLinkExpiry: product.downloadLinkExpiry,
        });
      }

      const currentPrice = product.discountPrice || product.price;
      const itemTotal = parseFloat(currentPrice) * cartItem.quantity;
      subtotal += itemTotal;

      orderItems.push({
        productId: product.id,
        productName: product.productName,
        quantity: cartItem.quantity,
        price: parseFloat(currentPrice),
        productType: product.productType,
        digitalFileUrl: product.digitalFileUrl,
        images: product.images,
      });
    }

    // Determine order type
    orderType = determineOrderType(orderItems);

    // Validate delivery address for physical products
    if (
      (orderType === "physical" || orderType === "mixed") &&
      !deliveryAddress
    ) {
      await transaction.rollback();
      return res.status(400).json({
        success: false,
        message: "Delivery address is required for physical products",
      });
    }

    // Calculate shipping (free for digital, ₹50 for physical orders below ₹500)
    let shippingCharges = 0;
    if (orderType === "physical" || orderType === "mixed") {
      shippingCharges = subtotal >= 500 ? 0 : 50;
    }

    // Calculate tax (18% GST)
    const taxAmount = parseFloat(((subtotal + shippingCharges) * 0.18).toFixed(2));

    // Calculate total
    const totalAmount = parseFloat((subtotal + shippingCharges + taxAmount).toFixed(2));

    // Process payment
    let paymentStatus = "pending";
    let transactionId = null;

    if (paymentMethod === "wallet") {
      // Check wallet balance
      const wallet = await Wallet.findOne({ where: { userId }, transaction });
      if (!wallet || wallet.balance < totalAmount) {
        await transaction.rollback();
        return res.status(402).json({
          success: false,
          message: "Insufficient wallet balance",
          required: totalAmount,
          available: wallet?.balance || 0,
        });
      }

      // Deduct from wallet
      await wallet.update(
        { balance: wallet.balance - totalAmount },
        { transaction }
      );

      // Create wallet transaction
      const walletTx = await WalletTransaction.create(
        {
          walletId: wallet.id,
          type: "debit",
          amount: totalAmount,
          description: "Store order payment",
          balanceAfter: wallet.balance - totalAmount,
          status: "completed",
          metadata: { orderType: "store_purchase" },
        },
        { transaction }
      );

      paymentStatus = "completed";
      transactionId = walletTx.id;
    } else if (paymentMethod === "razorpay") {
      if (!razorpayPaymentId) {
        await transaction.rollback();
        return res.status(400).json({
          success: false,
          message: "Razorpay payment ID is required",
        });
      }
      // In production, verify Razorpay payment here
      paymentStatus = "completed";
      transactionId = razorpayPaymentId;
    } else if (paymentMethod === "cod") {
      // COD only for physical products
      if (orderType === "digital") {
        await transaction.rollback();
        return res.status(400).json({
          success: false,
          message: "Cash on delivery is not available for digital products",
        });
      }
      paymentStatus = "pending"; // Payment will be collected on delivery
    }

    // Generate order number
    const orderNumber = await generateOrderNumber();

    // Prepare digital download links
    let digitalDownloadLinks = null;
    if (digitalProducts.length > 0) {
      digitalDownloadLinks = digitalProducts.map((dp) => {
        const expiresAt = new Date();
        expiresAt.setDate(expiresAt.getDate() + (dp.downloadLinkExpiry || 30));
        return {
          productId: dp.productId,
          productName: dp.productName,
          downloadUrl: dp.digitalFileUrl,
          expiresAt: expiresAt.toISOString(),
        };
      });
    }

    // Create order
    const order = await Order.create(
      {
        orderNumber,
        userId,
        items: orderItems,
        subtotal,
        shippingCharges,
        taxAmount,
        totalAmount,
        paymentMethod,
        paymentStatus,
        transactionId,
        orderType,
        orderStatus: paymentStatus === "completed" ? "confirmed" : "pending",
        deliveryAddress,
        digitalDownloadLinks,
        downloadLinkSentAt: digitalProducts.length > 0 ? new Date() : null,
        confirmedAt: paymentStatus === "completed" ? new Date() : null,
        customerNotes,
      },
      { transaction }
    );

    // Clear cart
    await Cart.destroy({ where: { userId }, transaction });

    // Commit transaction
    await transaction.commit();

    // Send emails (outside transaction)
    try {
      await sendOrderConfirmationEmail(user, order);

      // Send digital product email if applicable
      if (digitalProducts.length > 0 && paymentStatus === "completed") {
        await sendDigitalProductEmail(user, order, digitalDownloadLinks);
      }
    } catch (emailError) {
      console.error("Error sending emails:", emailError);
      // Don't fail the order if email fails
    }

    return res.status(201).json({
      success: true,
      message: "Order placed successfully",
      order: {
        id: order.id,
        orderNumber: order.orderNumber,
        totalAmount: order.totalAmount,
        orderStatus: order.orderStatus,
        paymentStatus: order.paymentStatus,
        orderType: order.orderType,
        digitalDownloadLinks: digitalDownloadLinks,
      },
    });
  } catch (error) {
    await transaction.rollback();
    console.error("Error during checkout:", error);
    return res.status(500).json({
      success: false,
      message: "Failed to process order",
      error: error.message,
    });
  }
};

// Get my orders
exports.getMyOrders = async (req, res) => {
  try {
    const userId = req.user.id;
    const {
      page = 1,
      limit = 10,
      orderStatus,
      orderType,
      paymentStatus,
    } = req.query;

    const offset = (page - 1) * limit;
    const where = { userId };

    if (orderStatus) where.orderStatus = orderStatus;
    if (orderType) where.orderType = orderType;
    if (paymentStatus) where.paymentStatus = paymentStatus;

    const { count, rows: orders } = await Order.findAndCountAll({
      where,
      limit: parseInt(limit),
      offset: parseInt(offset),
      order: [["createdAt", "DESC"]],
      attributes: [
        "id",
        "orderNumber",
        "orderType",
        "orderStatus",
        "paymentStatus",
        "totalAmount",
        "items",
        "createdAt",
        "deliveredAt",
      ],
    });

    return res.status(200).json({
      success: true,
      orders,
      pagination: {
        total: count,
        page: parseInt(page),
        limit: parseInt(limit),
        totalPages: Math.ceil(count / limit),
      },
    });
  } catch (error) {
    console.error("Error fetching orders:", error);
    return res.status(500).json({
      success: false,
      message: "Failed to fetch orders",
      error: error.message,
    });
  }
};

// Get order details
exports.getOrderDetails = async (req, res) => {
  try {
    const userId = req.user.id;
    const { orderNumber } = req.params;

    const order = await Order.findOne({
      where: { orderNumber, userId },
    });

    if (!order) {
      return res.status(404).json({
        success: false,
        message: "Order not found",
      });
    }

    return res.status(200).json({
      success: true,
      order,
    });
  } catch (error) {
    console.error("Error fetching order details:", error);
    return res.status(500).json({
      success: false,
      message: "Failed to fetch order details",
      error: error.message,
    });
  }
};

// Track order
exports.trackOrder = async (req, res) => {
  try {
    const userId = req.user.id;
    const { orderNumber } = req.params;

    const order = await Order.findOne({
      where: { orderNumber, userId },
      attributes: [
        "id",
        "orderNumber",
        "orderStatus",
        "orderType",
        "trackingNumber",
        "courierName",
        "trackingUrl",
        "confirmedAt",
        "shippedAt",
        "deliveredAt",
        "createdAt",
      ],
    });

    if (!order) {
      return res.status(404).json({
        success: false,
        message: "Order not found",
      });
    }

    // Build tracking timeline
    const timeline = [
      {
        status: "pending",
        label: "Order Placed",
        timestamp: order.createdAt,
        completed: true,
      },
      {
        status: "confirmed",
        label: "Order Confirmed",
        timestamp: order.confirmedAt,
        completed: !!order.confirmedAt,
      },
    ];

    if (order.orderType !== "digital") {
      timeline.push(
        {
          status: "processing",
          label: "Processing",
          completed: ["processing", "packed", "shipped", "out_for_delivery", "delivered"].includes(
            order.orderStatus
          ),
        },
        {
          status: "shipped",
          label: "Shipped",
          timestamp: order.shippedAt,
          completed: !!order.shippedAt,
        },
        {
          status: "delivered",
          label: "Delivered",
          timestamp: order.deliveredAt,
          completed: !!order.deliveredAt,
        }
      );
    }

    return res.status(200).json({
      success: true,
      tracking: {
        orderNumber: order.orderNumber,
        currentStatus: order.orderStatus,
        orderType: order.orderType,
        trackingNumber: order.trackingNumber,
        courierName: order.courierName,
        trackingUrl: order.trackingUrl,
        timeline,
      },
    });
  } catch (error) {
    console.error("Error tracking order:", error);
    return res.status(500).json({
      success: false,
      message: "Failed to track order",
      error: error.message,
    });
  }
};

// Cancel order
exports.cancelOrder = async (req, res) => {
  const transaction = await sequelize.transaction();

  try {
    const userId = req.user.id;
    const { orderNumber } = req.params;
    const { cancellationReason } = req.body;

    const order = await Order.findOne({
      where: { orderNumber, userId },
      transaction,
    });

    if (!order) {
      await transaction.rollback();
      return res.status(404).json({
        success: false,
        message: "Order not found",
      });
    }

    // Check if order can be cancelled
    if (["shipped", "out_for_delivery", "delivered", "cancelled"].includes(order.orderStatus)) {
      await transaction.rollback();
      return res.status(400).json({
        success: false,
        message: `Order cannot be cancelled as it is already ${order.orderStatus}`,
      });
    }

    // Restore stock for physical products
    for (const item of order.items) {
      if (item.productType === "physical") {
        const product = await Product.findByPk(item.productId, { transaction });
        if (product) {
          await product.update(
            {
              stock: product.stock + item.quantity,
              soldCount: Math.max(0, product.soldCount - item.quantity),
            },
            { transaction }
          );
        }
      }
    }

    // Process refund if payment was completed
    if (order.paymentStatus === "completed" && order.paymentMethod === "wallet") {
      const wallet = await Wallet.findOne({ where: { userId }, transaction });
      if (wallet) {
        await wallet.update(
          { balance: wallet.balance + parseFloat(order.totalAmount) },
          { transaction }
        );

        await WalletTransaction.create(
          {
            walletId: wallet.id,
            type: "credit",
            amount: order.totalAmount,
            description: `Refund for cancelled order ${orderNumber}`,
            balanceAfter: wallet.balance + parseFloat(order.totalAmount),
            status: "completed",
            metadata: { orderNumber, refundType: "order_cancellation" },
          },
          { transaction }
        );
      }
    }

    // Update order
    await order.update(
      {
        orderStatus: "cancelled",
        paymentStatus: order.paymentStatus === "completed" ? "refunded" : "cancelled",
        cancelledAt: new Date(),
        cancellationReason,
      },
      { transaction }
    );

    await transaction.commit();

    // Send email notification
    try {
      const user = await User.findByPk(userId);
      await sendOrderStatusUpdateEmail(user, order, order.orderStatus, "cancelled");
    } catch (emailError) {
      console.error("Error sending cancellation email:", emailError);
    }

    return res.status(200).json({
      success: true,
      message: "Order cancelled successfully",
      refunded: order.paymentStatus === "refunded",
    });
  } catch (error) {
    await transaction.rollback();
    console.error("Error cancelling order:", error);
    return res.status(500).json({
      success: false,
      message: "Failed to cancel order",
      error: error.message,
    });
  }
};

// ==================== ADMIN: Order Management ====================

// Get all orders (admin)
exports.getAllOrders = async (req, res) => {
  try {
    const {
      page = 1,
      limit = 20,
      orderStatus,
      orderType,
      paymentStatus,
      search,
    } = req.query;

    const offset = (page - 1) * limit;
    const where = {};

    if (orderStatus) where.orderStatus = orderStatus;
    if (orderType) where.orderType = orderType;
    if (paymentStatus) where.paymentStatus = paymentStatus;

    // Search by order number
    if (search) {
      where.orderNumber = { [sequelize.Op.iLike]: `%${search}%` };
    }

    const { count, rows: orders } = await Order.findAndCountAll({
      where,
      include: [
        {
          model: User,
          as: "user",
          attributes: ["id", "fullName", "email", "phoneNumber"],
        },
      ],
      limit: parseInt(limit),
      offset: parseInt(offset),
      order: [["createdAt", "DESC"]],
    });

    return res.status(200).json({
      success: true,
      orders,
      pagination: {
        total: count,
        page: parseInt(page),
        limit: parseInt(limit),
        totalPages: Math.ceil(count / limit),
      },
    });
  } catch (error) {
    console.error("Error fetching orders:", error);
    return res.status(500).json({
      success: false,
      message: "Failed to fetch orders",
      error: error.message,
    });
  }
};

// Update order status (admin)
exports.updateOrderStatus = async (req, res) => {
  try {
    const { orderNumber } = req.params;
    const {
      orderStatus,
      trackingNumber,
      courierName,
      trackingUrl,
      adminNotes,
    } = req.body;

    const order = await Order.findOne({
      where: { orderNumber },
      include: [{ model: User, as: "user" }],
    });

    if (!order) {
      return res.status(404).json({
        success: false,
        message: "Order not found",
      });
    }

    const oldStatus = order.orderStatus;
    const updateData = {};

    if (orderStatus) {
      updateData.orderStatus = orderStatus;

      // Update timestamps based on status
      if (orderStatus === "confirmed" && !order.confirmedAt) {
        updateData.confirmedAt = new Date();
      }
      if (orderStatus === "shipped" && !order.shippedAt) {
        updateData.shippedAt = new Date();
      }
      if (orderStatus === "delivered" && !order.deliveredAt) {
        updateData.deliveredAt = new Date();
        updateData.paymentStatus = "completed"; // Mark payment as completed on delivery for COD
      }
    }

    if (trackingNumber) updateData.trackingNumber = trackingNumber;
    if (courierName) updateData.courierName = courierName;
    if (trackingUrl) updateData.trackingUrl = trackingUrl;
    if (adminNotes) updateData.adminNotes = adminNotes;

    await order.update(updateData);

    // Send email notification
    if (orderStatus && orderStatus !== oldStatus) {
      try {
        await sendOrderStatusUpdateEmail(order.user, order, oldStatus, orderStatus);
      } catch (emailError) {
        console.error("Error sending status update email:", emailError);
      }
    }

    return res.status(200).json({
      success: true,
      message: "Order updated successfully",
      order,
    });
  } catch (error) {
    console.error("Error updating order:", error);
    return res.status(500).json({
      success: false,
      message: "Failed to update order",
      error: error.message,
    });
  }
};

// Get order statistics (admin)
exports.getOrderStatistics = async (req, res) => {
  try {
    const { days = 30 } = req.query;
    const startDate = new Date();
    startDate.setDate(startDate.getDate() - parseInt(days));

    // Total orders
    const totalOrders = await Order.count();

    // Orders by status
    const ordersByStatus = await Order.findAll({
      attributes: [
        "orderStatus",
        [sequelize.fn("COUNT", sequelize.col("id")), "count"],
      ],
      group: ["orderStatus"],
      raw: true,
    });

    // Orders by type
    const ordersByType = await Order.findAll({
      attributes: [
        "orderType",
        [sequelize.fn("COUNT", sequelize.col("id")), "count"],
      ],
      group: ["orderType"],
      raw: true,
    });

    // Revenue stats
    const revenueStats = await Order.findOne({
      attributes: [
        [sequelize.fn("SUM", sequelize.col("totalAmount")), "totalRevenue"],
        [sequelize.fn("AVG", sequelize.col("totalAmount")), "averageOrderValue"],
      ],
      where: {
        paymentStatus: "completed",
      },
      raw: true,
    });

    // Recent orders
    const recentOrders = await Order.count({
      where: {
        createdAt: {
          [sequelize.Op.gte]: startDate,
        },
      },
    });

    return res.status(200).json({
      success: true,
      statistics: {
        total: totalOrders,
        recent: recentOrders,
        byStatus: ordersByStatus,
        byType: ordersByType,
        revenue: {
          total: parseFloat(revenueStats.totalRevenue || 0).toFixed(2),
          average: parseFloat(revenueStats.averageOrderValue || 0).toFixed(2),
        },
      },
    });
  } catch (error) {
    console.error("Error fetching statistics:", error);
    return res.status(500).json({
      success: false,
      message: "Failed to fetch statistics",
      error: error.message,
    });
  }
};
