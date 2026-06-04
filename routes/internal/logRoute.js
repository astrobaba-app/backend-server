const express = require("express");
const router = express.Router();
const { createInternalOpenAIRequestLog } = require("../../controller/internal/internalLogController");

router.post("/openai-request-logs", createInternalOpenAIRequestLog);

module.exports = router;
