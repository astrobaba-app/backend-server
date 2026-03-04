const express = require("express");
const router = express.Router();
const {
  createKundli,
  getKundli,
  getAllKundlis,
  getAllUserRequests,
  checkAiReportStatus,
  refreshAshtakvarga,
} = require("../../controller/horoscope/kundliController");
const {
  getUserKundlisForCall,
  getKundliForCall,
} = require("../../controller/horoscope/kundliForCallController");
const checkForAuthenticationCookie = require("../../middleware/authMiddleware");
const checkForAstrologerRole = require("../../middleware/roleMiddleware");


router.post("/create", checkForAuthenticationCookie(), createKundli);

router.get("/all", checkForAuthenticationCookie(), getAllKundlis);
router.get("/user-requests", checkForAuthenticationCookie(), getAllUserRequests);
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

module.exports = router;
