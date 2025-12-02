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
const validateAdminToken = require("../../middleware/validateAdminToken");

// Configure multer for file uploads
const upload = multer({
  storage: multer.memoryStorage(),
  limits: {
    fileSize: 5 * 1024 * 1024, // 5MB limit
  },
  fileFilter: (req, file, cb) => {
    // Accept images only
    if (file.mimetype.startsWith("image/")) {
      cb(null, true);
    } else {
      cb(new Error("Only image files are allowed"), false);
    }
  },
});

// User routes
router.post(
  "/create",
  checkForAuthenticationCookie(),
  upload.array("images", 5), // Max 5 images
  createTicket
);
router.get("/my-tickets", checkForAuthenticationCookie(), getMyTickets);
router.get("/ticket/:ticketId", checkForAuthenticationCookie(), getTicketDetails);
router.post(
  "/ticket/:ticketId/reply",
  checkForAuthenticationCookie(),
  upload.array("attachments", 3),
  replyToTicket
);

// Admin routes
router.get("/admin/tickets", validateAdminToken, getAllTickets);
router.get("/admin/ticket/:ticketId", validateAdminToken, getTicketDetailsAdmin);
router.post(
  "/admin/ticket/:ticketId/reply",
  validateAdminToken,
  upload.array("attachments", 5),
  replyToTicketAdmin
);
router.patch("/admin/ticket/:ticketId/status", validateAdminToken, updateTicketStatus);
router.patch("/admin/ticket/:ticketId/assign", validateAdminToken, assignTicket);
router.get("/admin/statistics", validateAdminToken, getTicketStatistics);

module.exports = router;
