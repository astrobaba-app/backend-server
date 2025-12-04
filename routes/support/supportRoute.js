const express = require("express");
const router = express.Router();
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
const {authorizeRoles} = require("../../middleware/roleMiddleware");
const upload = require("../../config/uploadConfig/supabaseUpload");

// User routes
router.post("/user/create", checkForAuthenticationCookie(), ...upload.array("images", 5), createTicket);
router.get("/user/my-tickets", checkForAuthenticationCookie(), getMyTickets);
router.get(
  "/user/ticket/:ticketId",
  checkForAuthenticationCookie(),
  getTicketDetails
);
router.post(
  "/user/ticket/:ticketId/reply",
  checkForAuthenticationCookie(),
  replyToTicket
);

// Admin routes
router.get(
  "/admin/tickets",
  checkForAuthenticationCookie(),
  authorizeRoles(["admin", "superadmin", "masteradmin"]),
  getAllTickets
);
router.get(
  "/admin/ticket/:ticketId",
  checkForAuthenticationCookie(),
  authorizeRoles(["admin", "superadmin", "masteradmin"]),
  getTicketDetailsAdmin
);
router.post(
  "/admin/ticket/:ticketId/reply",
  checkForAuthenticationCookie(),
  authorizeRoles(["admin", "superadmin", "masteradmin"]),
  ...upload.array("images", 5),
  replyToTicketAdmin
);
router.patch(
  "/admin/ticket/:ticketId/status",
  checkForAuthenticationCookie(),
  authorizeRoles(["admin", "superadmin", "masteradmin"]),
  updateTicketStatus
);

module.exports = router;
