const { DataTypes } = require("sequelize");
const { sequelize } = require("../../dbConnection/dbConfig");

const Order = sequelize.define(
  "Order",
  {
    id: {
      type: DataTypes.UUID,
      defaultValue: DataTypes.UUIDV4,
      primaryKey: true,
    },
    orderNumber: {
      type: DataTypes.STRING(20),
      unique: true,
      allowNull: false,
      comment: "Format: ORD-YYYY-XXXXXX",
    },
    userId: {
      type: DataTypes.UUID,
      allowNull: false,
      references: {
        model: "users",
        key: "id",
      },
      onDelete: "CASCADE",
    },
    items: {
      type: DataTypes.JSONB,
      allowNull: false,
      comment:
        "Array of order items: [{productId, productName, quantity, price, productType, digitalFileUrl}]",
    },
    subtotal: {
      type: DataTypes.DECIMAL(10, 2),
      allowNull: false,
    },
    discount: {
      type: DataTypes.DECIMAL(10, 2),
      defaultValue: 0,
    },
    shippingCharges: {
      type: DataTypes.DECIMAL(10, 2),
      defaultValue: 0,
    },
    taxAmount: {
      type: DataTypes.DECIMAL(10, 2),
      defaultValue: 0,
    },
    totalAmount: {
      type: DataTypes.DECIMAL(10, 2),
      allowNull: false,
    },
    paymentMethod: {
      type: DataTypes.ENUM("wallet", "razorpay", "cod"),
      allowNull: false,
    },
    paymentStatus: {
      type: DataTypes.ENUM("pending", "completed", "failed", "refunded"),
      defaultValue: "pending",
    },
    transactionId: {
      type: DataTypes.STRING(100),
      comment: "Razorpay payment ID or wallet transaction ID",
    },
    orderType: {
      type: DataTypes.ENUM("digital", "physical", "mixed"),
      allowNull: false,
      comment: "Digital: reports/pdfs, Physical: shipped items, Mixed: both",
    },
    orderStatus: {
      type: DataTypes.ENUM(
        "pending",
        "confirmed",
        "processing",
        "packed",
        "shipped",
        "out_for_delivery",
        "delivered",
        "cancelled",
        "refunded"
      ),
      defaultValue: "pending",
    },
    // Delivery details (for physical products)
    deliveryAddress: {
      type: DataTypes.JSONB,
      comment:
        "Full address: {name, phone, email, addressLine1, addressLine2, city, state, pincode, country, landmark}",
    },
    trackingNumber: {
      type: DataTypes.STRING(100),
    },
    courierName: {
      type: DataTypes.STRING(100),
    },
    trackingUrl: {
      type: DataTypes.TEXT,
    },
    // Digital product delivery
    digitalDownloadLinks: {
      type: DataTypes.JSONB,
      comment:
        "Array of download links for digital products: [{productId, productName, downloadUrl, expiresAt}]",
    },
    downloadLinkSentAt: {
      type: DataTypes.DATE,
    },
    // Order timeline
    confirmedAt: {
      type: DataTypes.DATE,
    },
    shippedAt: {
      type: DataTypes.DATE,
    },
    deliveredAt: {
      type: DataTypes.DATE,
    },
    cancelledAt: {
      type: DataTypes.DATE,
    },
    cancellationReason: {
      type: DataTypes.TEXT,
    },
    // Notes
    customerNotes: {
      type: DataTypes.TEXT,
    },
    adminNotes: {
      type: DataTypes.TEXT,
    },
  },
  {
    tableName: "orders",
    timestamps: true,
    indexes: [
      {
        fields: ["orderNumber"],
        unique: true,
      },
      {
        fields: ["userId"],
      },
      {
        fields: ["orderStatus"],
      },
      {
        fields: ["paymentStatus"],
      },
      {
        fields: ["orderType"],
      },
      {
        fields: ["createdAt"],
      },
    ],
  }
);

module.exports = Order;
