const { transporter } = require("../config/nodemailerConfig/nodemailerConfig");

/**
 * Send ticket creation confirmation email to user
 */
const sendTicketCreatedEmail = async (user, ticket) => {
  try {
    await transporter.sendMail({
      from: process.env.ADMIN_EMAIL,
      to: user.email,
      subject: `Support Ticket Created - ${ticket.ticketNumber}`,
      html: `
        <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto; padding: 20px; border: 1px solid #ddd; border-radius: 10px;">
          <h2 style="color: #4CAF50; text-align: center;">Ticket Created Successfully! 🎫</h2>
          
          <div style="background-color: #f9f9f9; padding: 15px; border-radius: 5px; margin: 20px 0;">
            <p style="margin: 5px 0;"><strong>Ticket Number:</strong> <span style="color: #2196F3; font-size: 18px;">${ticket.ticketNumber}</span></p>
            <p style="margin: 5px 0;"><strong>Subject:</strong> ${ticket.subject}</p>
            <p style="margin: 5px 0;"><strong>Status:</strong> <span style="color: #FF9800; font-weight: bold;">${ticket.status.toUpperCase()}</span></p>
            <p style="margin: 5px 0;"><strong>Priority:</strong> ${ticket.priority}</p>
            <p style="margin: 5px 0;"><strong>Category:</strong> ${ticket.category}</p>
          </div>
          
          <p>Dear ${user.fullName},</p>
          
          <p>Thank you for contacting AstroBaba support. Your support ticket has been created successfully.</p>
          
          <div style="background-color: #fff3cd; padding: 15px; border-left: 4px solid #ffc107; margin: 20px 0;">
            <p style="margin: 0;"><strong>📋 Your Description:</strong></p>
            <p style="margin: 10px 0 0 0;">${ticket.description}</p>
          </div>
          
          <p><strong>What happens next?</strong></p>
          <ul style="line-height: 1.8;">
            <li>Our support team will review your ticket shortly</li>
            <li>You'll receive an email when we reply to your ticket</li>
            <li>Average response time: 24-48 hours</li>
            <li>You can check your ticket status anytime using the ticket number</li>
          </ul>
          
          <p style="margin-top: 30px;">If you have any urgent concerns, please don't hesitate to reach out.</p>
          
          <hr style="border: none; border-top: 1px solid #ddd; margin: 30px 0;">
          
          <p style="color: #666; font-size: 12px; text-align: center;">
            This is an automated message. Please do not reply to this email.<br>
            For assistance, use your ticket number: <strong>${ticket.ticketNumber}</strong>
          </p>
          
          <p style="text-align: center; margin-top: 20px;">
            Best regards,<br>
            <strong>AstroBaba Support Team</strong>
          </p>
        </div>
      `,
    });
    return { success: true };
  } catch (error) {
    console.error("Error sending ticket created email:", error);
    return { success: false, error };
  }
};

/**
 * Send email to user when admin replies to ticket
 */
const sendTicketReplyEmail = async (user, ticket, reply, adminName) => {
  try {
    await transporter.sendMail({
      from: process.env.ADMIN_EMAIL,
      to: user.email,
      subject: `Reply on Your Ticket - ${ticket.ticketNumber}`,
      html: `
        <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto; padding: 20px; border: 1px solid #ddd; border-radius: 10px;">
          <h2 style="color: #2196F3; text-align: center;">New Reply on Your Support Ticket 💬</h2>
          
          <div style="background-color: #f9f9f9; padding: 15px; border-radius: 5px; margin: 20px 0;">
            <p style="margin: 5px 0;"><strong>Ticket Number:</strong> <span style="color: #2196F3; font-size: 18px;">${ticket.ticketNumber}</span></p>
            <p style="margin: 5px 0;"><strong>Subject:</strong> ${ticket.subject}</p>
            <p style="margin: 5px 0;"><strong>Status:</strong> <span style="color: ${ticket.status === 'resolved' ? '#4CAF50' : '#FF9800'}; font-weight: bold;">${ticket.status.toUpperCase()}</span></p>
          </div>
          
          <p>Dear ${user.fullName},</p>
          
          <p>Our support team has replied to your ticket.</p>
          
          <div style="background-color: #e3f2fd; padding: 15px; border-left: 4px solid #2196F3; margin: 20px 0;">
            <p style="margin: 0 0 10px 0;"><strong>👤 ${adminName} replied:</strong></p>
            <p style="margin: 0; white-space: pre-wrap;">${reply.message}</p>
          </div>
          
          ${reply.attachments && reply.attachments.length > 0 ? `
          <div style="margin: 20px 0;">
            <p><strong>📎 Attachments:</strong></p>
            <ul>
              ${reply.attachments.map((url, idx) => `<li><a href="${url}" target="_blank">Attachment ${idx + 1}</a></li>`).join('')}
            </ul>
          </div>
          ` : ''}
          
          <div style="text-align: center; margin: 30px 0;">
            <a href="${process.env.FRONTEND_URL}/support/tickets/${ticket.ticketNumber}" 
               style="background-color: #2196F3; color: white; padding: 12px 30px; text-decoration: none; border-radius: 5px; display: inline-block; font-weight: bold;">
              View Full Conversation
            </a>
          </div>
          
          <p style="margin-top: 30px;">If you need further assistance, you can reply to this ticket from your account.</p>
          
          <hr style="border: none; border-top: 1px solid #ddd; margin: 30px 0;">
          
          <p style="color: #666; font-size: 12px; text-align: center;">
            This is an automated message. Please do not reply to this email.<br>
            Use your account to reply to ticket: <strong>${ticket.ticketNumber}</strong>
          </p>
          
          <p style="text-align: center; margin-top: 20px;">
            Best regards,<br>
            <strong>AstroBaba Support Team</strong>
          </p>
        </div>
      `,
    });
    return { success: true };
  } catch (error) {
    console.error("Error sending ticket reply email:", error);
    return { success: false, error };
  }
};

/**
 * Send email when ticket status changes
 */
const sendTicketStatusUpdateEmail = async (user, ticket, oldStatus, newStatus) => {
  try {
    const statusColors = {
      open: '#FF9800',
      in_progress: '#2196F3',
      resolved: '#4CAF50',
      closed: '#9E9E9E'
    };

    const statusEmojis = {
      open: '🔓',
      in_progress: '⚙️',
      resolved: '✅',
      closed: '🔒'
    };

    await transporter.sendMail({
      from: process.env.ADMIN_EMAIL,
      to: user.email,
      subject: `Ticket Status Updated - ${ticket.ticketNumber}`,
      html: `
        <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto; padding: 20px; border: 1px solid #ddd; border-radius: 10px;">
          <h2 style="color: ${statusColors[newStatus]}; text-align: center;">Ticket Status Updated ${statusEmojis[newStatus]}</h2>
          
          <div style="background-color: #f9f9f9; padding: 15px; border-radius: 5px; margin: 20px 0;">
            <p style="margin: 5px 0;"><strong>Ticket Number:</strong> <span style="color: #2196F3; font-size: 18px;">${ticket.ticketNumber}</span></p>
            <p style="margin: 5px 0;"><strong>Subject:</strong> ${ticket.subject}</p>
          </div>
          
          <p>Dear ${user.fullName},</p>
          
          <p>The status of your support ticket has been updated.</p>
          
          <div style="text-align: center; margin: 30px 0;">
            <div style="display: inline-block; padding: 10px 20px; background-color: #ffebee; border-radius: 5px; margin-right: 10px;">
              <span style="color: ${statusColors[oldStatus]}; font-weight: bold;">${oldStatus.toUpperCase()}</span>
            </div>
            <span style="font-size: 24px; margin: 0 10px;">→</span>
            <div style="display: inline-block; padding: 10px 20px; background-color: #e8f5e9; border-radius: 5px; margin-left: 10px;">
              <span style="color: ${statusColors[newStatus]}; font-weight: bold;">${newStatus.toUpperCase()}</span>
            </div>
          </div>
          
          ${newStatus === 'resolved' ? `
          <div style="background-color: #e8f5e9; padding: 15px; border-left: 4px solid #4CAF50; margin: 20px 0;">
            <p style="margin: 0;"><strong>✅ Your issue has been resolved!</strong></p>
            <p style="margin: 10px 0 0 0;">If your issue persists or you need further assistance, please reply to the ticket or create a new one.</p>
          </div>
          ` : ''}
          
          ${newStatus === 'closed' ? `
          <div style="background-color: #f5f5f5; padding: 15px; border-left: 4px solid #9E9E9E; margin: 20px 0;">
            <p style="margin: 0;"><strong>🔒 This ticket has been closed.</strong></p>
            <p style="margin: 10px 0 0 0;">If you need further help, please create a new support ticket.</p>
          </div>
          ` : ''}
          
          <div style="text-align: center; margin: 30px 0;">
            <a href="${process.env.FRONTEND_URL}/support/tickets/${ticket.ticketNumber}" 
               style="background-color: #2196F3; color: white; padding: 12px 30px; text-decoration: none; border-radius: 5px; display: inline-block; font-weight: bold;">
              View Ticket Details
            </a>
          </div>
          
          <hr style="border: none; border-top: 1px solid #ddd; margin: 30px 0;">
          
          <p style="color: #666; font-size: 12px; text-align: center;">
            This is an automated message. Please do not reply to this email.
          </p>
          
          <p style="text-align: center; margin-top: 20px;">
            Best regards,<br>
            <strong>AstroBaba Support Team</strong>
          </p>
        </div>
      `,
    });
    return { success: true };
  } catch (error) {
    console.error("Error sending ticket status update email:", error);
    return { success: false, error };
  }
};

module.exports = {
  sendTicketCreatedEmail,
  sendTicketReplyEmail,
  sendTicketStatusUpdateEmail,
};
