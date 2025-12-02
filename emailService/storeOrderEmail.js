const transporter = require("../config/nodemailerConfig/nodemailerConfig");

// Send order confirmation email
exports.sendOrderConfirmationEmail = async (user, order) => {
  try {
    const orderItemsHtml = order.items
      .map(
        (item) => `
      <tr>
        <td style="padding: 10px; border-bottom: 1px solid #eee;">
          <strong>${item.productName}</strong><br/>
          <span style="color: #666; font-size: 12px;">Qty: ${item.quantity}</span>
        </td>
        <td style="padding: 10px; border-bottom: 1px solid #eee; text-align: right;">
          ₹${item.price} × ${item.quantity}
        </td>
        <td style="padding: 10px; border-bottom: 1px solid #eee; text-align: right;">
          <strong>₹${(item.price * item.quantity).toFixed(2)}</strong>
        </td>
      </tr>
    `
      )
      .join("");

    const deliverySection =
      order.orderType === "physical" || order.orderType === "mixed"
        ? `
      <div style="margin-top: 30px; padding: 20px; background-color: #f8f9fa; border-radius: 8px;">
        <h3 style="color: #333; margin-top: 0;">📦 Delivery Address</h3>
        <p style="margin: 5px 0; color: #555;">
          <strong>${order.deliveryAddress.name}</strong><br/>
          ${order.deliveryAddress.addressLine1}<br/>
          ${order.deliveryAddress.addressLine2 ? order.deliveryAddress.addressLine2 + "<br/>" : ""}
          ${order.deliveryAddress.city}, ${order.deliveryAddress.state} - ${order.deliveryAddress.pincode}<br/>
          Phone: ${order.deliveryAddress.phone}
        </p>
      </div>
    `
        : "";

    const digitalSection =
      order.orderType === "digital"
        ? `
      <div style="margin-top: 30px; padding: 20px; background-color: #e8f5e9; border-radius: 8px;">
        <h3 style="color: #2e7d32; margin-top: 0;">📧 Digital Product Delivery</h3>
        <p style="color: #555;">
          Your digital products will be sent to your email within a few minutes. 
          You can also access them from your account dashboard.
        </p>
      </div>
    `
        : "";

    const mailOptions = {
      from: `"AstroBaba Store" <${process.env.ADMIN_EMAIL}>`,
      to: user.email,
      subject: `Order Confirmed - ${order.orderNumber}`,
      html: `
        <!DOCTYPE html>
        <html>
        <head>
          <meta charset="UTF-8">
          <meta name="viewport" content="width=device-width, initial-scale=1.0">
        </head>
        <body style="font-family: Arial, sans-serif; line-height: 1.6; color: #333; max-width: 600px; margin: 0 auto; padding: 20px;">
          <div style="background: linear-gradient(135deg, #667eea 0%, #764ba2 100%); padding: 30px; text-align: center; border-radius: 10px 10px 0 0;">
            <h1 style="color: white; margin: 0; font-size: 28px;">🎉 Order Confirmed!</h1>
            <p style="color: #f0f0f0; margin: 10px 0 0 0;">Thank you for your purchase</p>
          </div>
          
          <div style="background-color: #ffffff; padding: 30px; border: 1px solid #e0e0e0; border-top: none;">
            <p style="font-size: 16px; color: #555;">Hi ${user.fullName || "Customer"},</p>
            
            <p style="color: #555;">
              Your order has been confirmed and is being processed. Here are your order details:
            </p>
            
            <div style="background-color: #f5f5f5; padding: 20px; border-radius: 8px; margin: 20px 0;">
              <h3 style="margin-top: 0; color: #333;">Order Details</h3>
              <p style="margin: 5px 0;"><strong>Order Number:</strong> <span style="color: #667eea; font-size: 18px;">${order.orderNumber}</span></p>
              <p style="margin: 5px 0;"><strong>Order Date:</strong> ${new Date(order.createdAt).toLocaleDateString("en-IN", {
                year: "numeric",
                month: "long",
                day: "numeric",
              })}</p>
              <p style="margin: 5px 0;"><strong>Order Type:</strong> <span style="text-transform: capitalize;">${order.orderType}</span></p>
              <p style="margin: 5px 0;"><strong>Payment Method:</strong> <span style="text-transform: capitalize;">${order.paymentMethod}</span></p>
              <p style="margin: 5px 0;"><strong>Payment Status:</strong> 
                <span style="color: ${order.paymentStatus === "completed" ? "#2e7d32" : "#ff9800"}; font-weight: bold; text-transform: capitalize;">
                  ${order.paymentStatus}
                </span>
              </p>
            </div>
            
            <h3 style="color: #333; margin-top: 30px;">Order Items</h3>
            <table style="width: 100%; border-collapse: collapse; margin-top: 15px;">
              <thead>
                <tr style="background-color: #f5f5f5;">
                  <th style="padding: 10px; text-align: left; border-bottom: 2px solid #ddd;">Product</th>
                  <th style="padding: 10px; text-align: right; border-bottom: 2px solid #ddd;">Price</th>
                  <th style="padding: 10px; text-align: right; border-bottom: 2px solid #ddd;">Total</th>
                </tr>
              </thead>
              <tbody>
                ${orderItemsHtml}
              </tbody>
            </table>
            
            <div style="margin-top: 20px; padding-top: 20px; border-top: 2px solid #eee;">
              <table style="width: 100%;">
                <tr>
                  <td style="padding: 5px; text-align: right; color: #555;">Subtotal:</td>
                  <td style="padding: 5px; text-align: right; width: 120px;"><strong>₹${order.subtotal}</strong></td>
                </tr>
                ${
                  order.discount > 0
                    ? `
                <tr>
                  <td style="padding: 5px; text-align: right; color: #2e7d32;">Discount:</td>
                  <td style="padding: 5px; text-align: right; color: #2e7d32;">-₹${order.discount}</td>
                </tr>
                `
                    : ""
                }
                ${
                  order.shippingCharges > 0
                    ? `
                <tr>
                  <td style="padding: 5px; text-align: right; color: #555;">Shipping:</td>
                  <td style="padding: 5px; text-align: right;">₹${order.shippingCharges}</td>
                </tr>
                `
                    : ""
                }
                ${
                  order.taxAmount > 0
                    ? `
                <tr>
                  <td style="padding: 5px; text-align: right; color: #555;">Tax:</td>
                  <td style="padding: 5px; text-align: right;">₹${order.taxAmount}</td>
                </tr>
                `
                    : ""
                }
                <tr style="border-top: 2px solid #667eea;">
                  <td style="padding: 10px 5px; text-align: right; font-size: 18px; color: #333;"><strong>Total Amount:</strong></td>
                  <td style="padding: 10px 5px; text-align: right; font-size: 20px; color: #667eea;"><strong>₹${order.totalAmount}</strong></td>
                </tr>
              </table>
            </div>
            
            ${deliverySection}
            ${digitalSection}
            
            <div style="margin-top: 30px; padding: 20px; background-color: #fff3cd; border-left: 4px solid #ffc107; border-radius: 4px;">
              <p style="margin: 0; color: #856404;">
                <strong>📌 What's Next?</strong><br/>
                ${
                  order.orderType === "digital"
                    ? "You will receive your digital products via email shortly."
                    : "We will process your order and ship it within 2-3 business days. You'll receive tracking details once shipped."
                }
              </p>
            </div>
            
            <div style="text-align: center; margin-top: 30px;">
              <a href="${process.env.FRONTEND_URL}/orders/${order.orderNumber}" 
                 style="display: inline-block; padding: 12px 30px; background-color: #667eea; color: white; text-decoration: none; border-radius: 5px; font-weight: bold;">
                View Order Details
              </a>
            </div>
            
            <p style="margin-top: 30px; color: #777; font-size: 14px;">
              If you have any questions about your order, please contact our support team.
            </p>
            
            <div style="margin-top: 30px; padding-top: 20px; border-top: 1px solid #eee; text-align: center; color: #999; font-size: 12px;">
              <p style="margin: 5px 0;">© ${new Date().getFullYear()} AstroBaba. All rights reserved.</p>
              <p style="margin: 5px 0;">Order Number: ${order.orderNumber}</p>
            </div>
          </div>
        </body>
        </html>
      `,
    };

    await transporter.sendMail(mailOptions);
    console.log(`Order confirmation email sent to ${user.email}`);
  } catch (error) {
    console.error("Error sending order confirmation email:", error);
    throw error;
  }
};

// Send digital product email with download links
exports.sendDigitalProductEmail = async (user, order, downloadLinks) => {
  try {
    const downloadLinksHtml = downloadLinks
      .map(
        (link) => `
      <div style="margin: 15px 0; padding: 15px; background-color: #f8f9fa; border-radius: 8px; border-left: 4px solid #667eea;">
        <h4 style="margin: 0 0 10px 0; color: #333;">${link.productName}</h4>
        <p style="margin: 5px 0; color: #666; font-size: 13px;">
          Valid until: ${new Date(link.expiresAt).toLocaleDateString("en-IN", {
            year: "numeric",
            month: "long",
            day: "numeric",
          })}
        </p>
        <a href="${link.downloadUrl}" 
           style="display: inline-block; margin-top: 10px; padding: 10px 20px; background-color: #667eea; color: white; text-decoration: none; border-radius: 5px; font-weight: bold;">
          📥 Download Now
        </a>
      </div>
    `
      )
      .join("");

    const mailOptions = {
      from: `"AstroBaba Store" <${process.env.ADMIN_EMAIL}>`,
      to: user.email,
      subject: `Your Digital Products - ${order.orderNumber}`,
      html: `
        <!DOCTYPE html>
        <html>
        <head>
          <meta charset="UTF-8">
          <meta name="viewport" content="width=device-width, initial-scale=1.0">
        </head>
        <body style="font-family: Arial, sans-serif; line-height: 1.6; color: #333; max-width: 600px; margin: 0 auto; padding: 20px;">
          <div style="background: linear-gradient(135deg, #2e7d32 0%, #66bb6a 100%); padding: 30px; text-align: center; border-radius: 10px 10px 0 0;">
            <h1 style="color: white; margin: 0; font-size: 28px;">📧 Your Digital Products Are Ready!</h1>
            <p style="color: #f0f0f0; margin: 10px 0 0 0;">Download your products below</p>
          </div>
          
          <div style="background-color: #ffffff; padding: 30px; border: 1px solid #e0e0e0; border-top: none;">
            <p style="font-size: 16px; color: #555;">Hi ${user.fullName || "Customer"},</p>
            
            <p style="color: #555;">
              Thank you for your purchase! Your digital products are ready to download. 
              Please find the download links below:
            </p>
            
            <div style="background-color: #e8f5e9; padding: 20px; border-radius: 8px; margin: 20px 0;">
              <p style="margin: 0; color: #555;"><strong>Order Number:</strong> <span style="color: #2e7d32; font-size: 18px;">${order.orderNumber}</span></p>
            </div>
            
            <h3 style="color: #333; margin-top: 30px;">📦 Your Downloads</h3>
            ${downloadLinksHtml}
            
            <div style="margin-top: 30px; padding: 20px; background-color: #fff3cd; border-left: 4px solid #ffc107; border-radius: 4px;">
              <p style="margin: 0; color: #856404;">
                <strong>⚠️ Important Notes:</strong><br/>
                • Download links are valid for ${order.downloadLinkExpiry || 30} days<br/>
                • You can also access your downloads from your account dashboard<br/>
                • Keep these links safe and do not share them with others<br/>
                • If you face any issues, contact our support team
              </p>
            </div>
            
            <div style="text-align: center; margin-top: 30px;">
              <a href="${process.env.FRONTEND_URL}/orders/${order.orderNumber}" 
                 style="display: inline-block; padding: 12px 30px; background-color: #2e7d32; color: white; text-decoration: none; border-radius: 5px; font-weight: bold;">
                View Order Details
              </a>
            </div>
            
            <p style="margin-top: 30px; color: #777; font-size: 14px;">
              Need help? Contact our support team at any time.
            </p>
            
            <div style="margin-top: 30px; padding-top: 20px; border-top: 1px solid #eee; text-align: center; color: #999; font-size: 12px;">
              <p style="margin: 5px 0;">© ${new Date().getFullYear()} AstroBaba. All rights reserved.</p>
              <p style="margin: 5px 0;">Order Number: ${order.orderNumber}</p>
            </div>
          </div>
        </body>
        </html>
      `,
    };

    await transporter.sendMail(mailOptions);
    console.log(`Digital product email sent to ${user.email}`);
  } catch (error) {
    console.error("Error sending digital product email:", error);
    throw error;
  }
};

// Send order status update email
exports.sendOrderStatusUpdateEmail = async (user, order, oldStatus, newStatus) => {
  try {
    const statusColors = {
      pending: "#ff9800",
      confirmed: "#2196f3",
      processing: "#9c27b0",
      packed: "#673ab7",
      shipped: "#3f51b5",
      out_for_delivery: "#00bcd4",
      delivered: "#4caf50",
      cancelled: "#f44336",
      refunded: "#9e9e9e",
    };

    const statusEmojis = {
      pending: "⏳",
      confirmed: "✅",
      processing: "⚙️",
      packed: "📦",
      shipped: "🚚",
      out_for_delivery: "🏃",
      delivered: "🎉",
      cancelled: "❌",
      refunded: "💰",
    };

    const statusMessages = {
      confirmed: "Great news! Your order has been confirmed and will be processed soon.",
      processing: "Your order is being processed and prepared for shipment.",
      packed: "Your order has been packed and is ready to ship!",
      shipped: "Your order is on its way! Track your shipment using the details below.",
      out_for_delivery: "Your order is out for delivery and will arrive soon!",
      delivered: "Your order has been delivered successfully. We hope you love it!",
      cancelled: "Your order has been cancelled. If you didn't request this, please contact support.",
      refunded: "Your refund has been processed and will reflect in your account soon.",
    };

    const trackingSection =
      newStatus === "shipped" || newStatus === "out_for_delivery"
        ? `
      <div style="margin-top: 30px; padding: 20px; background-color: #e3f2fd; border-radius: 8px;">
        <h3 style="color: #1565c0; margin-top: 0;">📍 Tracking Information</h3>
        ${order.trackingNumber ? `<p style="margin: 5px 0;"><strong>Tracking Number:</strong> ${order.trackingNumber}</p>` : ""}
        ${order.courierName ? `<p style="margin: 5px 0;"><strong>Courier:</strong> ${order.courierName}</p>` : ""}
        ${
          order.trackingUrl
            ? `
          <div style="margin-top: 15px;">
            <a href="${order.trackingUrl}" 
               style="display: inline-block; padding: 10px 20px; background-color: #1565c0; color: white; text-decoration: none; border-radius: 5px; font-weight: bold;">
              🔍 Track Shipment
            </a>
          </div>
        `
            : ""
        }
      </div>
    `
        : "";

    const mailOptions = {
      from: `"AstroBaba Store" <${process.env.ADMIN_EMAIL}>`,
      to: user.email,
      subject: `Order ${newStatus.replace(/_/g, " ").toUpperCase()} - ${order.orderNumber}`,
      html: `
        <!DOCTYPE html>
        <html>
        <head>
          <meta charset="UTF-8">
          <meta name="viewport" content="width=device-width, initial-scale=1.0">
        </head>
        <body style="font-family: Arial, sans-serif; line-height: 1.6; color: #333; max-width: 600px; margin: 0 auto; padding: 20px;">
          <div style="background: linear-gradient(135deg, ${statusColors[newStatus]} 0%, ${statusColors[newStatus]}dd 100%); padding: 30px; text-align: center; border-radius: 10px 10px 0 0;">
            <h1 style="color: white; margin: 0; font-size: 28px;">${statusEmojis[newStatus]} Order Status Updated</h1>
            <p style="color: #f0f0f0; margin: 10px 0 0 0; text-transform: capitalize;">${newStatus.replace(/_/g, " ")}</p>
          </div>
          
          <div style="background-color: #ffffff; padding: 30px; border: 1px solid #e0e0e0; border-top: none;">
            <p style="font-size: 16px; color: #555;">Hi ${user.fullName || "Customer"},</p>
            
            <p style="color: #555;">${statusMessages[newStatus]}</p>
            
            <div style="background-color: #f5f5f5; padding: 20px; border-radius: 8px; margin: 20px 0;">
              <p style="margin: 0; color: #555;"><strong>Order Number:</strong> <span style="color: ${statusColors[newStatus]}; font-size: 18px;">${order.orderNumber}</span></p>
              <div style="margin-top: 20px; padding: 15px; background-color: white; border-radius: 8px;">
                <div style="display: flex; align-items: center; justify-content: center;">
                  <span style="padding: 8px 15px; background-color: ${statusColors[oldStatus]}; color: white; border-radius: 20px; font-size: 14px; text-transform: capitalize;">
                    ${oldStatus.replace(/_/g, " ")}
                  </span>
                  <span style="margin: 0 15px; color: #999; font-size: 20px;">→</span>
                  <span style="padding: 8px 15px; background-color: ${statusColors[newStatus]}; color: white; border-radius: 20px; font-size: 14px; font-weight: bold; text-transform: capitalize;">
                    ${newStatus.replace(/_/g, " ")}
                  </span>
                </div>
              </div>
            </div>
            
            ${trackingSection}
            
            <div style="text-align: center; margin-top: 30px;">
              <a href="${process.env.FRONTEND_URL}/orders/${order.orderNumber}" 
                 style="display: inline-block; padding: 12px 30px; background-color: ${statusColors[newStatus]}; color: white; text-decoration: none; border-radius: 5px; font-weight: bold;">
                View Order Details
              </a>
            </div>
            
            <p style="margin-top: 30px; color: #777; font-size: 14px;">
              If you have any questions about your order, please contact our support team.
            </p>
            
            <div style="margin-top: 30px; padding-top: 20px; border-top: 1px solid #eee; text-align: center; color: #999; font-size: 12px;">
              <p style="margin: 5px 0;">© ${new Date().getFullYear()} AstroBaba. All rights reserved.</p>
              <p style="margin: 5px 0;">Order Number: ${order.orderNumber}</p>
            </div>
          </div>
        </body>
        </html>
      `,
    };

    await transporter.sendMail(mailOptions);
    console.log(`Order status update email sent to ${user.email}`);
  } catch (error) {
    console.error("Error sending order status update email:", error);
    throw error;
  }
};
