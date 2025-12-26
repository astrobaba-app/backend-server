const SupportTicket = require("../../model/support/supportTicket");
const TicketReply = require("../../model/support/ticketReply");
const User = require("../../model/user/userAuth");
const Admin = require("../../model/admin/admin");
const { Op, fn, col } = require("sequelize");
const {
  sendTicketCreatedEmail,
  sendTicketReplyEmail,
  sendTicketStatusUpdateEmail,
} = require("../../emailService/supportTicketEmail");
const {
  uploadToSupabase,
} = require("../../config/uploadConfig/supabaseUpload");

const generateTicketNumber = async () => {
  const year = new Date().getFullYear();
  const randomNum = Math.floor(Math.random() * 1000000)
    .toString()
    .padStart(6, "0");
  const ticketNumber = `TKT-${year}-${randomNum}`;

  const existing = await SupportTicket.findOne({
    where: { ticketNumber },
  });

  if (existing) {
    return generateTicketNumber(); // Recursive call if collision
  }

  return ticketNumber;
};

// ============= USER ROUTES =============

const createTicket = async (req, res) => {
  try {
    const userId = req.user.id;
    console.log("User ID creating ticket:", userId);
    const { subject, description, category, priority = "medium" } = req.body;

    if (!subject || !description) {
      return res.status(400).json({
        success: false,
        message: "Subject and description are required",
      });
    }

    // Get uploaded image URLs from upload middleware
    const imageUrls = req.fileUrls || [];

    // Generate unique ticket number
    const ticketNumber = await generateTicketNumber();

    // Create ticket
    const ticket = await SupportTicket.create({
      ticketNumber,
      userId,
      subject,
      description,
      images: imageUrls,
      category,
      priority,
      status: "open",
    });

    // Get user details
    const user = await User.findByPk(userId, {
      attributes: ["fullName", "email"],
    });

    // Send confirmation email
    await sendTicketCreatedEmail(user, ticket);

    res.status(201).json({
      success: true,
      message:
        "Support ticket created successfully. Check your email for confirmation.",
      ticket: {
        id: ticket.id,
        ticketNumber: ticket.ticketNumber,
        subject: ticket.subject,
        description: ticket.description,
        images: ticket.images,
        status: ticket.status,
        priority: ticket.priority,
        category: ticket.category,
        createdAt: ticket.createdAt,
      },
    });
  } catch (error) {
    console.error("Create ticket error:", error);
    res.status(500).json({
      success: false,
      message: "Failed to create support ticket",
      error: error.message,
    });
  }
};

/**
 * Get user's tickets (User)
 */
const getMyTickets = async (req, res) => {
  try {
    const userId = req.user.id;
    const { status, page = 1, limit = 20 } = req.query;
    const offset = (page - 1) * limit;

    const where = { userId };
    if (status) {
      where.status = status;
    }

    const { rows: tickets, count } = await SupportTicket.findAndCountAll({
      where,
      order: [["createdAt", "DESC"]],
      limit: parseInt(limit),
      offset: parseInt(offset),
      include: [
        {
          model: Admin,
          as: "admin",
          attributes: ["id", "name"],
          required: false,
        },
      ],
    });

    res.status(200).json({
      success: true,
      tickets,
      pagination: {
        total: count,
        page: parseInt(page),
        limit: parseInt(limit),
        totalPages: Math.ceil(count / limit),
      },
    });
  } catch (error) {
    console.error("Get my tickets error:", error);
    res.status(500).json({
      success: false,
      message: "Failed to fetch tickets",
      error: error.message,
    });
  }
};

/**
 * Get ticket details with replies (User)
 */
const getTicketDetails = async (req, res) => {
  try {
    const userId = req.user.id;
    const { ticketId } = req.params;

    const ticket = await SupportTicket.findOne({
      where: { id: ticketId, userId },
      include: [
        {
          model: Admin,
          as: "admin",
          attributes: ["id", "name", "email"],
          required: false,
        },
      ],
    });

    if (!ticket) {
      return res.status(404).json({
        success: false,
        message: "Ticket not found",
      });
    }

    // Get all replies (exclude internal notes)
    const replies = await TicketReply.findAll({
      where: {
        ticketId,
        isInternal: false,
      },
      order: [["createdAt", "ASC"]],
    });

    // Format replies with sender info
    const formattedReplies = await Promise.all(
      replies.map(async (reply) => {
        let senderInfo = {};
        if (reply.repliedByType === "admin") {
          const admin = await Admin.findByPk(reply.repliedBy, {
            attributes: ["name"],
          });
          senderInfo = { name: admin?.name || "Support Team", type: "admin" };
        } else {
          const user = await User.findByPk(reply.repliedBy, {
            attributes: ["fullName"],
          });
          senderInfo = { name: user?.fullName || "You", type: "user" };
        }

        return {
          id: reply.id,
          message: reply.message,
          attachments: reply.attachments,
          repliedBy: reply.repliedBy,
          repliedByType: reply.repliedByType,
          replier: senderInfo,
          createdAt: reply.createdAt,
        };
      })
    );

    res.status(200).json({
      success: true,
      ticket,
      replies: formattedReplies,
    });
  } catch (error) {
    console.error("Get ticket details error:", error);
    res.status(500).json({
      success: false,
      message: "Failed to fetch ticket details",
      error: error.message,
    });
  }
};

/**
 * Reply to ticket (User)
 */
const replyToTicket = async (req, res) => {
  try {
    const userId = req.user.id;
    const { ticketId } = req.params;
    const { message } = req.body;

    if (!message) {
      return res.status(400).json({
        success: false,
        message: "Message is required",
      });
    }

    // Check if ticket belongs to user
    const ticket = await SupportTicket.findOne({
      where: { id: ticketId, userId },
    });

    if (!ticket) {
      return res.status(404).json({
        success: false,
        message: "Ticket not found",
      });
    }

    if (ticket.status === "closed") {
      return res.status(400).json({
        success: false,
        message: "Cannot reply to a closed ticket",
      });
    }

    // Handle attachments
    let attachmentUrls = [];
    if (req.files && req.files.length > 0) {
      for (const file of req.files) {
        const uploadResult = await uploadToSupabase(
          file.buffer,
          file.originalname,
          "support-tickets"
        );

        if (uploadResult.success) {
          attachmentUrls.push(uploadResult.url);
        }
      }
    }

    // Create reply
    const reply = await TicketReply.create({
      ticketId,
      repliedBy: userId,
      repliedByType: "user",
      message,
      attachments: attachmentUrls,
      isInternal: false,
    });

    // Update ticket
    await ticket.update({
      lastRepliedAt: new Date(),
      status: ticket.status === "resolved" ? "open" : ticket.status,
    });

    res.status(201).json({
      success: true,
      message: "Reply added successfully",
      reply: {
        id: reply.id,
        message: reply.message,
        attachments: reply.attachments,
        createdAt: reply.createdAt,
      },
    });
  } catch (error) {
    console.error("Reply to ticket error:", error);
    res.status(500).json({
      success: false,
      message: "Failed to add reply",
      error: error.message,
    });
  }
};

// ============= ADMIN ROUTES =============

/**
 * Get all tickets (Admin)
 */
const getAllTickets = async (req, res) => {
  try {
    const {
      status,
      priority,
      category,
      search,
      page = 1,
      limit = 20,
    } = req.query;
    const offset = (page - 1) * limit;

    const where = {};

    if (status) where.status = status;
    if (priority) where.priority = priority;
    if (category) where.category = category;
    if (search) {
      where[Op.or] = [
        { ticketNumber: { [Op.iLike]: `%${search}%` } },
        { subject: { [Op.iLike]: `%${search}%` } },
      ];
    }

    const { rows: tickets, count } = await SupportTicket.findAndCountAll({
      where,
      order: [
        ["priority", "DESC"], // urgent first
        ["createdAt", "DESC"],
      ],
      limit: parseInt(limit),
      offset: parseInt(offset),
      include: [
        {
          model: User,
          as: "user",
          attributes: ["id", "fullName", "email", "mobile"],
        },
        {
          model: Admin,
          as: "admin",
          attributes: ["id", "name"],
          required: false,
        },
      ],
    });

    res.status(200).json({
      success: true,
      tickets,
      pagination: {
        total: count,
        page: parseInt(page),
        limit: parseInt(limit),
        totalPages: Math.ceil(count / limit),
      },
    });
  } catch (error) {
    console.error("Get all tickets error:", error);
    res.status(500).json({
      success: false,
      message: "Failed to fetch tickets",
      error: error.message,
    });
  }
};

/**
 * Get ticket details (Admin)
 */
const getTicketDetailsAdmin = async (req, res) => {
  try {
    const { ticketId } = req.params;

    const ticket = await SupportTicket.findByPk(ticketId, {
      include: [
        {
          model: User,
          as: "user",
          attributes: ["id", "fullName", "email", "mobile"],
        },
        {
          model: Admin,
          as: "admin",
          attributes: ["id", "name", "email"],
          required: false,
        },
      ],
    });

    if (!ticket) {
      return res.status(404).json({
        success: false,
        message: "Ticket not found",
      });
    }

    // Get all replies including internal notes
    const replies = await TicketReply.findAll({
      where: { ticketId },
      order: [["createdAt", "ASC"]],
    });

    // Format replies with sender info
    const formattedReplies = await Promise.all(
      replies.map(async (reply) => {
        let senderInfo = {};
        if (reply.repliedByType === "admin") {
          const admin = await Admin.findByPk(reply.repliedBy, {
            attributes: ["name"],
          });
          senderInfo = { name: admin?.name || "Admin", type: "admin" };
        } else {
          const user = await User.findByPk(reply.repliedBy, {
            attributes: ["fullName"],
          });
          senderInfo = { name: user?.fullName || "User", type: "user" };
        }

        return {
          id: reply.id,
          message: reply.message,
          attachments: reply.attachments,
          isInternal: reply.isInternal,
          repliedBy: reply.repliedBy,
          repliedByType: reply.repliedByType,
          replier: senderInfo,
          createdAt: reply.createdAt,
        };
      })
    );

    res.status(200).json({
      success: true,
      ticket,
      replies: formattedReplies,
    });
  } catch (error) {
    console.error("Get ticket details admin error:", error);
    res.status(500).json({
      success: false,
      message: "Failed to fetch ticket details",
      error: error.message,
    });
  }
};

/**
 * Reply to ticket (Admin)
 */
const replyToTicketAdmin = async (req, res) => {
  try {
    const adminId = req.user.id;
    const { ticketId } = req.params;
    const { message, isInternal = false } = req.body;

    if (!message) {
      return res.status(400).json({
        success: false,
        message: "Message is required",
      });
    }

    const ticket = await SupportTicket.findByPk(ticketId, {
      include: [
        {
          model: User,
          as: "user",
          attributes: ["fullName", "email"],
        },
      ],
    });

    if (!ticket) {
      return res.status(404).json({
        success: false,
        message: "Ticket not found",
      });
    }

    // Handle attachments
    let attachmentUrls = [];
    if (req.files && req.files.length > 0) {
      for (const file of req.files) {
        const uploadResult = await uploadToSupabase(
          file.buffer,
          file.originalname,
          "support-tickets"
        );

        if (uploadResult.success) {
          attachmentUrls.push(uploadResult.url);
        }
      }
    }

    // Create reply
    const reply = await TicketReply.create({
      ticketId,
      repliedBy: adminId,
      repliedByType: "admin",
      message,
      attachments: attachmentUrls,
      isInternal,
    });

    // Update ticket
    await ticket.update({
      lastRepliedAt: new Date(),
      adminId: ticket.adminId || adminId, // Assign to admin if not already assigned
    });

    // Send email to user (only if not internal note)
    if (!isInternal) {
      const admin = await Admin.findByPk(adminId, { attributes: ["name"] });
      try {
        await sendTicketReplyEmail(ticket.user, ticket, reply, admin.name);
      } catch (error) {
        console.error("Email send error e", error);
        res.status(500).json({
          success: false,
          message: "Failed to send mail reply",
          error: error.message,
        });
      }
    }

    res.status(201).json({
      success: true,
      message: isInternal
        ? "Internal note added successfully"
        : "Reply sent successfully. User has been notified via email.",
      reply: {
        id: reply.id,
        message: reply.message,
        attachments: reply.attachments,
        isInternal: reply.isInternal,
        createdAt: reply.createdAt,
      },
    });
  } catch (error) {
    console.error("Reply to ticket admin error:", error);
    res.status(500).json({
      success: false,
      message: "Failed to add reply",
      error: error.message,
    });
  }
};

/**
 * Update ticket status (Admin)
 */
const updateTicketStatus = async (req, res) => {
  try {
    const { ticketId } = req.params;
    const { status, priority } = req.body;

    const ticket = await SupportTicket.findByPk(ticketId, {
      include: [
        {
          model: User,
          as: "user",
          attributes: ["fullName", "email"],
        },
      ],
    });

    if (!ticket) {
      return res.status(404).json({
        success: false,
        message: "Ticket not found",
      });
    }

    const oldStatus = ticket.status;
    const updates = {};

    if (status && status !== oldStatus) {
      updates.status = status;
      if (status === "resolved" || status === "closed") {
        updates.resolvedAt = new Date();
      }
    }

    if (priority) {
      updates.priority = priority;
    }

    await ticket.update(updates);

    // Send email notification if status changed
    if (status && status !== oldStatus) {
      await sendTicketStatusUpdateEmail(ticket.user, ticket, oldStatus, status);
    }

    res.status(200).json({
      success: true,
      message: "Ticket updated successfully. User has been notified via email.",
      ticket,
    });
  } catch (error) {
    console.error("Update ticket status error:", error);
    res.status(500).json({
      success: false,
      message: "Failed to update ticket",
      error: error.message,
    });
  }
};

/**
 * Assign ticket to admin (Admin)
 */
const assignTicket = async (req, res) => {
  try {
    const { ticketId } = req.params;
    const { adminId } = req.body;

    const ticket = await SupportTicket.findByPk(ticketId);

    if (!ticket) {
      return res.status(404).json({
        success: false,
        message: "Ticket not found",
      });
    }

    // Verify admin exists
    const admin = await Admin.findByPk(adminId);
    if (!admin) {
      return res.status(404).json({
        success: false,
        message: "Admin not found",
      });
    }

    await ticket.update({ adminId });

    res.status(200).json({
      success: true,
      message: `Ticket assigned to ${admin.name}`,
      ticket,
    });
  } catch (error) {
    console.error("Assign ticket error:", error);
    res.status(500).json({
      success: false,
      message: "Failed to assign ticket",
      error: error.message,
    });
  }
};

/**
 * Get ticket statistics (Admin)
 */
const getTicketStatistics = async (req, res) => {
  try {
    const { days = 30 } = req.query;
    const daysAgo = new Date();
    daysAgo.setDate(daysAgo.getDate() - parseInt(days));

    const totalTickets = await SupportTicket.count();
    const openTickets = await SupportTicket.count({
      where: { status: "open" },
    });
    const inProgressTickets = await SupportTicket.count({
      where: { status: "in_progress" },
    });
    const resolvedTickets = await SupportTicket.count({
      where: { status: "resolved" },
    });
    const closedTickets = await SupportTicket.count({
      where: { status: "closed" },
    });

    const recentTickets = await SupportTicket.count({
      where: { createdAt: { [Op.gte]: daysAgo } },
    });

    // By priority
    const urgentTickets = await SupportTicket.count({
      where: {
        priority: "urgent",
        status: { [Op.notIn]: ["closed", "resolved"] },
      },
    });

    const highPriorityTickets = await SupportTicket.count({
      where: {
        priority: "high",
        status: { [Op.notIn]: ["closed", "resolved"] },
      },
    });

    // By category
    const categoryCounts = await SupportTicket.findAll({
      attributes: [
        "category",
        [fn("COUNT", col("id")), "count"],
      ],
      group: ["category"],
      raw: true,
    });

    res.status(200).json({
      success: true,
      statistics: {
        total: totalTickets,
        byStatus: {
          open: openTickets,
          inProgress: inProgressTickets,
          resolved: resolvedTickets,
          closed: closedTickets,
        },
        recentTickets: recentTickets,
        urgentTickets,
        highPriorityTickets,
        byCategory: categoryCounts,
      },
      period: `Last ${days} days`,
    });
  } catch (error) {
    console.error("Get ticket statistics error:", error);
    res.status(500).json({
      success: false,
      message: "Failed to fetch statistics",
      error: error.message,
    });
  }
};

module.exports = {
  // User routes
  createTicket,
  getMyTickets,
  getTicketDetails,
  replyToTicket,

  // Admin routes
  getAllTickets,
  getTicketDetailsAdmin,
  replyToTicketAdmin,
  updateTicketStatus,
  assignTicket,
  getTicketStatistics,
};
