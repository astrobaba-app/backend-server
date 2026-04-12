const express = require("express");
const router = express.Router();
const {
  createKundli,
  createKundliFromWhatsapp,
  askQuestionInWhatsappSession,
  getKundli,
  getAllKundlis,
  deleteKundli,
  getAllUserRequests,
  checkAiReportStatus,
  refreshAshtakvarga,
  generateKundliShareLink,
  getSharedKundli,
} = require("../../controller/horoscope/kundliController");
const {
  getUserKundlisForCall,
  getKundliForCall,
  getUserKundlisForChat,
  getKundliShareViewForChat,
} = require("../../controller/horoscope/kundliForCallController");
const checkForAuthenticationCookie = require("../../middleware/authMiddleware");
const checkForAstrologerRole = require("../../middleware/roleMiddleware");


router.post("/create", checkForAuthenticationCookie(), createKundli);
router.post("/whatsapp/create", createKundliFromWhatsapp);
router.post("/whatsapp/session/ask", askQuestionInWhatsappSession);

router.get("/shared/:userRequestId", getSharedKundli);

router.get("/all", checkForAuthenticationCookie(), getAllKundlis);
router.get("/user-requests", checkForAuthenticationCookie(), getAllUserRequests);
router.post("/:userRequestId/share-link", checkForAuthenticationCookie(), generateKundliShareLink);
router.delete("/:userRequestId", checkForAuthenticationCookie(), deleteKundli);
router.get("/:userRequestId", checkForAuthenticationCookie(), getKundli);
router.get("/:userRequestId/ai-status", checkForAuthenticationCookie(), checkAiReportStatus);
router.put("/:userRequestId/refresh-ashtakvarga", checkForAuthenticationCookie(), refreshAshtakvarga);

// Routes for astrologer to view user's kundli during call
router.get(
  "/call/:callId/user-kundlis",
  checkForAuthenticationCookie(),
  
  getUserKundlisForCall
);
router.get(
  "/call/:callId/kundli/:userRequestId",
  checkForAuthenticationCookie(),

  getKundliForCall
);

// Routes for astrologer to view user's kundli during chat
router.get(
  "/chat/:sessionId/user-kundlis",
  checkForAuthenticationCookie(),
  getUserKundlisForChat
);
router.get(
  "/chat/:sessionId/kundli/:userRequestId/share-view",
  checkForAuthenticationCookie(),
  getKundliShareViewForChat
);

module.exports = router;
