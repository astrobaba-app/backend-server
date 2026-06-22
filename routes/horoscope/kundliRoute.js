const express = require("express");
const router = express.Router();
const {
  createKundli,
  createKundliFromWhatsapp,
  formatWhatsappKundliInputFast,
  askQuestionInWhatsappSession,
  getKundli,
  getAllKundlis,
  deleteKundli,
  getAllUserRequests,
  checkAiReportStatus,
  refreshAshtakvarga,
  generateKundliShareLink,
  getSharedKundli,
  createKundliFromWhatsappV2
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
// new whatsapp flow api
router.post("/whatsapp/create-v2", createKundliFromWhatsappV2);


router.post("/whatsapp/format", formatWhatsappKundliInputFast);
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
