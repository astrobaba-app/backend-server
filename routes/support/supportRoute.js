const express = require("express");
const router = express.Router();
const multer = require("multer");
const {
  createTicket,
  getMyTickets,
  getTicketDetails,
  replyToTicket,
  getAllTickets,
  getTicketDetailsAdmin,
  replyToTicketAdmin,
  updateTicketStatus,
  assignTicket,
  getTicketStatistics,
} = require("../../controller/support/supportController");
const checkForAuthenticationCookie = require("../../middleware/authMiddleware");

// User routes
router.post(
  "/create",
  checkForAuthenticationCookie(),
  createTicket
);
router.get("/my-tickets", checkForAuthenticationCookie(), getMyTickets);
router.get("/ticket/:ticketId", checkForAuthenticationCookie(), getTicketDetails);
router.post(
  "/ticket/:ticketId/reply",
  checkForAuthenticationCookie(),
  replyToTicket
);

// Admin routes
router.get("/admin/tickets", getAllTickets);
router.get("/admin/ticket/:ticketId", getTicketDetailsAdmin);
router.post(
  "/admin/ticket/:ticketId/reply",
  replyToTicketAdmin
);
router.patch("/admin/ticket/:ticketId/status", updateTicketStatus);
router.patch("/admin/ticket/:ticketId/assign", assignTicket);
router.get("/admin/statistics", getTicketStatistics);

module.exports = router;
