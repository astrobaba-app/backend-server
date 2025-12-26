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
router.post("/tickets", checkForAuthenticationCookie(), ...upload.array("images", 5), createTicket);
router.get("/tickets/my-tickets", checkForAuthenticationCookie(), getMyTickets);
router.get("/tickets/:ticketId", checkForAuthenticationCookie(), getTicketDetails);
router.post("/tickets/:ticketId/reply", checkForAuthenticationCookie(), ...upload.array("images", 5), replyToTicket);

// Upload route for images
router.post("/upload", checkForAuthenticationCookie(), ...upload.array("images", 5), (req, res) => {
  try {
    if (!req.files || req.files.length === 0) {
      return res.status(400).json({ success: false, message: "No files uploaded" });
    }
    const urls = req.files.map(file => file.location || file.path);
    res.status(200).json({ success: true, urls });
  } catch (error) {
    console.error("Error uploading images:", error);
    res.status(500).json({ success: false, message: "Failed to upload images" });
  }
});

// Admin routes
router.get(
  "/admin/tickets",
  checkForAuthenticationCookie(),
  authorizeRoles(["admin", "superadmin", "masteradmin"]),
  getAllTickets
);
router.get(
  "/admin/tickets/statistics",
  checkForAuthenticationCookie(),
  authorizeRoles(["admin", "superadmin", "masteradmin"]),
  getTicketStatistics
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
