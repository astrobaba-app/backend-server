const Kundli = require("../../model/horoscope/kundli");
const KundliReport = require("../../model/horoscope/kundliReport");
const YearlyReport = require("../../model/horoscope/yearlyReport");
const WealthReport = require("../../model/horoscope/wealthReport");
const SadeSatiReport = require("../../model/horoscope/sadeSatiReport");
const CompatibilityReport = require("../../model/horoscope/compatibilityReport");
const HealthReport = require("../../model/horoscope/healthReport");
const LoveRelationshipReport = require("../../model/horoscope/loveRelationshipReport");
const ReportGenerationRequest = require("../../model/report/reportGenerationRequest");
const UserRequest = require("../../model/user/userRequest");
const { generateKundliReportContent } = require("../../services/kundliReportAiService");
const { generateKundliReportPDF: buildKundliReportPDF } = require("../../services/kundliReportPdfService");
const { uploadPdfBuffer } = require("../../config/uploadConfig/cloudinaryPdfUpload");
const {
  buildDailyReportPayload,
  generateDailyReport,
  extractBasicDetails,
  mergeFinalResponse,
} = require("../../services/daily-kundli-report");
const {
  generateYearlyReport,
} = require("../../services/yearly-kundli-report");
const {
  generateYearlyReportPDF,
} = require("../../services/yearlyReportPdfService");
const {
  generateWealthReport,
} = require("../../services/wealth-kundli-report");
const {
  generateWealthReportPDF,
} = require("../../services/wealthReportPdfService");
const {
  generateSadeSatiReport,
} = require("../../services/sade-sati-kundli-report");
const {
  generateSadeSatiReportPDF,
} = require("../../services/sadeSatiReportPdfService");
const {
  generateCompatibilityReport,
} = require("../../services/compatibility-kundli-report");
const {
  generateCompatibilityReportPDF,
} = require("../../services/compatibilityReportPdfService");
const {
  generateHealthReport,
} = require("../../services/health-kundli-report");
const {
  generateHealthReportPDF,
} = require("../../services/healthReportPdfService");
const {
  generateLoveRelationshipReport,
} = require("../../services/love-relationship-kundli-report");
const {
  generateLoveRelationshipReportPDF,
} = require("../../services/loveRelationshipReportPdfService");
const {
  generateDailyReportPDF,
} = require("../../services/dailyReportPdfService");
const { generateQueuedPalmPdf } = require("../../services/palmReportPdfGenerationService");
const {
  REPORT_QUEUE_ENABLED,
  enqueueReportLlmRequest,
  enqueueReportPdfRequest,
} = require("../../services/reportGenerationQueueService");
const { markPalmJobCompletedAfterPdf } = require("../../services/palmQueueService");
const {
  notifyReportGenerationStatus,
} = require("../../services/reportNotificationService");
const {
  assertReportPurchaseAccess,
  markReportPurchaseConsumed,
} = require("../../services/reportPurchaseService");

const {
  getBasicDetails,
  getAstroDetails,
  getPanchang,
  getPlanetaryPositions,
  getAllCharts,
  getVimshottariDasha,
  getYoginiDasha,
  getManglikAnalysis,
  getAscendantReport,
  getGemstoneRemedies,
  getRudrakshaSuggestion,
  getAshtakavarga,
  getTransitChart,
  getCompleteHoroscope,
} = require("../../services/astroEngineService");

const DAILY_REPORT_GENERATION_PRICE = Number(process.env.DAILY_REPORT_GENERATION_PRICE || 0);
const YEARLY_REPORT_GENERATION_PRICE = Number(process.env.YEARLY_REPORT_GENERATION_PRICE || 0);
const WEALTH_REPORT_GENERATION_PRICE = Number(process.env.WEALTH_REPORT_GENERATION_PRICE || 0);

const isReportQueueWorkerMode = (req) => req?.reportQueueMode === "llm_worker";

const respondQueuedReport = async ({ req, res, reportType, message }) => {
  const reportRequest = await enqueueReportLlmRequest({
    userId: req.user.id,
    reportType,
    payload: req.body || {},
  });

  return res.status(202).json({
    success: true,
    queued: true,
    message,
    report: {
      reportRequestId: reportRequest.id,
      userRequestId: reportRequest.userRequestId || req.body?.userRequestId || null,
      status: reportRequest.status,
      reportType,
      createdAt: reportRequest.createdAt,
    },
  });
};

const saveReportGenerationRequest = async (req, values) => {
  if (req?.reportGenerationRequestId) {
    const existing = await ReportGenerationRequest.findByPk(req.reportGenerationRequestId);
    if (existing) {
      await existing.update(values);
      return existing;
    }
  }
  return ReportGenerationRequest.create(values);
};

const REPORT_HISTORY_PENDING_STATUSES = [
  "queued",
  "processing",
  "llm_processing",
  "retry_queued",
  "llm_completed",
  "pdf_processing",
  "pdf_failed",
  "failed",
  "reportllmworker_failed",
  "reportpdfworker_failed",
];

const formatQueuedReportHistoryItem = (request) => {
  const payload = request.requestPayload || {};
  const metadata = request.metadata || {};
  return {
    id: request.sourceId || request.id,
    reportRequestId: request.id,
    userRequestId: request.userRequestId || null,
    status: String(request.status || "").includes("failed") ? "failed" : "generating",
    fullName: payload.fullName || metadata.fullName || "Report request",
    dateOfbirth: payload.dateOfbirth || metadata.dateOfbirth || null,
    placeOfBirth: payload.placeOfBirth || metadata.placeOfBirth || "",
    timeOfbirth: payload.timeOfbirth || metadata.timeOfbirth || null,
    gender: payload.gender || metadata.gender || null,
    boyName: payload.boyName || metadata.boyName || null,
    girlName: payload.girlName || metadata.girlName || null,
    boyPlaceOfBirth: payload.boyPlaceOfBirth || metadata.boyPlaceOfBirth || null,
    girlPlaceOfBirth: payload.girlPlaceOfBirth || metadata.girlPlaceOfBirth || null,
    createdAt: request.createdAt,
    pdfUrl: request.pdfUrl || null,
    reportData: request.reportData || null,
    error: request.error || null,
  };
};

const getQueuedReportHistoryItems = async ({ userId, reportType, existingReports = [] }) => {
  const requests = await ReportGenerationRequest.findAll({
    where: {
      userId,
      reportType,
      status: REPORT_HISTORY_PENDING_STATUSES,
    },
    order: [["createdAt", "DESC"]],
  });

  const existingReportIds = new Set(existingReports.map((report) => String(report.id)));
  const existingRequestIds = new Set(existingReports.map((report) => String(report.reportRequestId || "")));

  return requests
    .filter((request) => {
      if (request.sourceId && existingReportIds.has(String(request.sourceId))) return false;
      if (existingRequestIds.has(String(request.id))) return false;
      return true;
    })
    .map(formatQueuedReportHistoryItem);
};

const createNoopReportResponse = (label) => ({
  status(code) {
    this.statusCode = code;
    return this;
  },
  json(payload) {
    console.log(`[${label}] Background response processed`);
    return payload;
  },
});

const handoffToPdfQueueIfWorker = async (req, reportGenerationRequest, sourceId = null) => {
  if (!isReportQueueWorkerMode(req) || !reportGenerationRequest) return false;
  await reportGenerationRequest.update({
    status: "llm_completed",
    metadata: {
      ...(reportGenerationRequest.metadata || {}),
      processingStatus: "pending_pdf",
      llmCompletedAt: new Date().toISOString(),
    },
  });
  await enqueueReportPdfRequest({
    reportRequest: reportGenerationRequest,
    sourceId: sourceId || reportGenerationRequest.sourceId,
  });
  return true;
};

const saveCachedReportGenerationRequestForWorker = async ({
  req,
  userId,
  userRequest,
  reportRecord,
  reportType,
  sourceType,
  price,
  finalResponseData,
  kundliId = null,
  requestPayload = {},
  llmResponse = {},
  metadata = {},
}) => {
  if (!isReportQueueWorkerMode(req) || !reportRecord || !finalResponseData) return null;

  const pdfMetadata = getStoredPdfMetadata(reportRecord);
  const hasPdf = Boolean(pdfMetadata.pdfUrl);

  const reportGenerationRequest = await saveReportGenerationRequest(req, {
    userId,
    userRequestId: userRequest.id,
    kundliId,
    reportType,
    sourceType,
    sourceId: reportRecord.id,
    status: hasPdf ? "completed" : "llm_completed",
    price,
    currency: "INR",
    inputTokens: 0,
    outputTokens: 0,
    totalTokens: 0,
    tokenUsage: {
      inputTokens: 0,
      outputTokens: 0,
      totalTokens: 0,
      skippedOpenAI: true,
      reason: "cached_report_data_used_by_worker",
    },
    requestPayload,
    llmResponse,
    reportData: finalResponseData,
    pdfUrl: pdfMetadata.pdfUrl || null,
    pdfPublicId: pdfMetadata.pdfPublicId || null,
    pdfFileName: pdfMetadata.pdfFileName || null,
    pdfUploadedAt: pdfMetadata.pdfUploadedAt || null,
    startedAt: new Date(),
    completedAt: hasPdf ? new Date() : null,
    metadata: {
      ...metadata,
      cachedReportDataUsed: true,
      pdfGeneration: hasPdf ? "uploaded" : "pending",
    },
  });

  console.log("[ReportQueue][LLM][CACHED_HANDOFF] Handed off cached data successfully");

  return reportGenerationRequest;
};

function buildAshtakvargaPayload(ashtakvargaData, ascLongitude) {
  if (!ashtakvargaData || !ashtakvargaData.sarvashtakavarga) return null;
  try {
    const sarvashtakavarga = ashtakvargaData.sarvashtakavarga;
    const individualCharts = sarvashtakavarga.individual_charts || {};

    const getPointsArray = (signPoints = []) =>
      signPoints.map((sp) => sp.points ?? 0);

    return {
      sav: getPointsArray(sarvashtakavarga.sign_points || []),
      sun: getPointsArray(individualCharts.Sun?.sign_points || []),
      moon: getPointsArray(individualCharts.Moon?.sign_points || []),
      mars: getPointsArray(individualCharts.Mars?.sign_points || []),
      mercury: getPointsArray(individualCharts.Mercury?.sign_points || []),
      jupiter: getPointsArray(individualCharts.Jupiter?.sign_points || []),
      venus: getPointsArray(individualCharts.Venus?.sign_points || []),
      saturn: getPointsArray(individualCharts.Saturn?.sign_points || []),
      asc: getPointsArray(individualCharts.Ascendant?.sign_points || []),
    };
  } catch (err) {
    console.error("buildAshtakvargaPayload error:", err);
    return null;
  }
}

const getUserRequestWithKundli = async (userId, userRequestId) => {
  const userRequest = await UserRequest.findOne({
    where: {
      id: userRequestId,
      userId,
    },
  });

  if (!userRequest) return null;

  const kundli = await Kundli.findOne({
    where: { requestId: userRequest.id },
  });

  if (!kundli) return null;

  userRequest.kundli = kundli;
  return userRequest;
};

const findOrCreateUserRequestWithKundli = async ({
  userId,
  userRequestId,
  fullName,
  gender,
  dateOfbirth,
  timeOfbirth,
  placeOfBirth,
  latitude,
  longitude,
}) => {
  if (userRequestId) {
    const userRequest = await UserRequest.findOne({
      where: {
        id: userRequestId,
        userId,
      },
    });

    if (!userRequest) {
      const error = new Error("Selected Kundli was not found for this user");
      error.statusCode = 404;
      throw error;
    }

    const kundli = await Kundli.findOne({
      where: { requestId: userRequest.id },
    });

    if (!kundli) {
      const error = new Error("Selected Kundli does not have saved Kundli data");
      error.statusCode = 409;
      throw error;
    }

    userRequest.kundli = kundli;
    return userRequest;
  }

  const parsedDob = new Date(dateOfbirth);
  let userRequest = await UserRequest.findOne({
    where: {
      userId,
      fullName: fullName.trim(),
      dateOfbirth: parsedDob,
      timeOfbirth: timeOfbirth.trim(),
      placeOfBirth: placeOfBirth.trim(),
      gender: gender.trim(),
    },
  });

  if (!userRequest) {
    userRequest = await UserRequest.create({
      userId,
      fullName: fullName.trim(),
      dateOfbirth: parsedDob,
      timeOfbirth: timeOfbirth.trim(),
      placeOfBirth: placeOfBirth.trim(),
      gender: gender.trim(),
      latitude: latitude ? parseFloat(latitude) : null,
      longitude: longitude ? parseFloat(longitude) : null,
    });
  }

  const kundli = await Kundli.findOne({
    where: { requestId: userRequest.id },
  });

  userRequest.kundli = kundli || null;
  return userRequest;
};

const buildUserDetails = (userRequest) => {
  return {
    fullName: userRequest.fullName,
    dateOfbirth: userRequest.dateOfbirth,
    timeOfbirth: userRequest.timeOfbirth,
    placeOfBirth: userRequest.placeOfBirth,
    gender: userRequest.gender,
  };
};

const sanitizeFileNameChunk = (value, fallback) => {
  const normalized = String(value || "")
    .trim()
    .replace(/[^a-zA-Z0-9-_]+/g, "_")
    .replace(/^_+|_+$/g, "")
    .slice(0, 60);

  return normalized || fallback;
};

const buildKundliPdfFileName = (userDetails, userRequestId) => {
  const safeName = sanitizeFileNameChunk(userDetails.fullName, "kundli_report");
  const safeRequestId = sanitizeFileNameChunk(String(userRequestId || "").slice(0, 12), "request");
  const year = new Date().getFullYear();

  return `${safeName}_${safeRequestId}_${year}.pdf`;
};

const getStoredPdfMetadata = (reportRecord) => {
  return {
    pdfUrl: reportRecord?.pdfUrl || null,
    pdfPublicId: reportRecord?.pdfPublicId || null,
    pdfFileName: reportRecord?.pdfFileName || null,
    pdfUploadedAt: reportRecord?.pdfUploadedAt || null,
  };
};

const ensureStoredKundliPdf = async ({ reportRecord, pdfBuffer, userDetails, userRequestId }) => {
  if (!reportRecord || reportRecord.pdfUrl || !pdfBuffer) {
    return getStoredPdfMetadata(reportRecord);
  }

  try {
    const fileName = buildKundliPdfFileName(userDetails, userRequestId);
    const uploadResult = await uploadPdfBuffer({
      buffer: pdfBuffer,
      fileName,
      folder: "graho/kundli-reports",
    });

    await reportRecord.update({
      pdfUrl: uploadResult.secure_url,
      pdfPublicId: uploadResult.public_id,
      pdfFileName: fileName,
      pdfUploadedAt: uploadResult.created_at
        ? new Date(uploadResult.created_at)
        : new Date(),
    });
  } catch (error) {
    console.error("[Kundli Report PDF] Cloudinary upload failed:", error.message || error);
  }

  return getStoredPdfMetadata(reportRecord);
};

const ensureStoredDailyPdf = async ({ reportRecord, pdfBuffer, userDetails, userRequestId }) => {
  if (!reportRecord || reportRecord.pdfUrl || !pdfBuffer) {
    return getStoredPdfMetadata(reportRecord);
  }

  try {
    const fileName = `daily_${buildKundliPdfFileName(userDetails, userRequestId)}`;
    const uploadResult = await uploadPdfBuffer({
      buffer: pdfBuffer,
      fileName,
      folder: "graho/daily-reports",
    });

    await reportRecord.update({
      pdfUrl: uploadResult.secure_url,
      pdfPublicId: uploadResult.public_id,
      pdfFileName: fileName,
      pdfUploadedAt: uploadResult.created_at
        ? new Date(uploadResult.created_at)
        : new Date(),
    });
  } catch (error) {
    console.error("[Daily Report PDF] Cloudinary upload failed:", error.message || error);
  }

  return getStoredPdfMetadata(reportRecord);
};

const uploadDailyPdfBuffer = async ({ reportRecord, pdfBuffer, userDetails, userRequestId }) => {
  if (!reportRecord || !pdfBuffer) {
    return getStoredPdfMetadata(reportRecord);
  }

  const fileName = `daily_${buildKundliPdfFileName(userDetails, userRequestId)}`;
  const uploadResult = await uploadPdfBuffer({
    buffer: pdfBuffer,
    fileName,
    folder: "graho/daily-reports",
  });

  await reportRecord.update({
    pdfUrl: uploadResult.secure_url,
    pdfPublicId: uploadResult.public_id,
    pdfFileName: fileName,
    pdfUploadedAt: uploadResult.created_at
      ? new Date(uploadResult.created_at)
      : new Date(),
  });

  return getStoredPdfMetadata(reportRecord);
};

const uploadYearlyPdfBuffer = async ({ reportRecord, pdfBuffer, userDetails, userRequestId }) => {
  if (!reportRecord || !pdfBuffer) {
    return getStoredPdfMetadata(reportRecord);
  }

  const fileName = `yearly_${buildKundliPdfFileName(userDetails, userRequestId)}`;
  const uploadResult = await uploadPdfBuffer({
    buffer: pdfBuffer,
    fileName,
    folder: "graho/yearly-reports",
  });

  await reportRecord.update({
    pdfUrl: uploadResult.secure_url,
    pdfPublicId: uploadResult.public_id,
    pdfFileName: fileName,
    pdfUploadedAt: uploadResult.created_at
      ? new Date(uploadResult.created_at)
      : new Date(),
  });

  return getStoredPdfMetadata(reportRecord);
};

const uploadWealthPdfBuffer = async ({ reportRecord, pdfBuffer, userDetails, userRequestId }) => {
  if (!reportRecord || !pdfBuffer) {
    return getStoredPdfMetadata(reportRecord);
  }

  const fileName = `wealth_${buildKundliPdfFileName(userDetails, userRequestId)}`;
  const uploadResult = await uploadPdfBuffer({
    buffer: pdfBuffer,
    fileName,
    folder: "graho/wealth-reports",
  });

  await reportRecord.update({
    pdfUrl: uploadResult.secure_url,
    pdfPublicId: uploadResult.public_id,
    pdfFileName: fileName,
    pdfUploadedAt: uploadResult.created_at
      ? new Date(uploadResult.created_at)
      : new Date(),
  });

  return getStoredPdfMetadata(reportRecord);
};

const getOrCreateStoredReport = async ({ userId, userRequestId, kundliData, userDetails }) => {
  let reportRecord = await KundliReport.findOne({
    where: {
      userId,
      userRequestId,
    },
  });

  if (reportRecord) {
    return {
      reportData: reportRecord.reportData,
      generatedAt: reportRecord.generatedAt,
      fromCache: true,
      reportRecord,
    };
  }

  console.log("[Kundli Report] Generating AI-enhanced content");
  const reportData = await generateKundliReportContent(kundliData, userDetails);

  reportRecord = await KundliReport.create({
    userId,
    userRequestId,
    reportData,
    generatedAt: new Date(),
  });

  return {
    reportData: reportRecord.reportData,
    generatedAt: reportRecord.generatedAt,
    fromCache: false,
    reportRecord,
  };
};

/**
 * Get all user's kundlis for report generation
 */
const getUserKundlisForReport = async (req, res) => {
  try {
    const userId = req.user.id;

    // Get all user requests with their kundlis
    const userRequests = await UserRequest.findAll({
      where: { userId },
      include: [
        {
          model: Kundli,
          as: "kundli",
          required: true, // Only get requests that have kundli data
        },
        {
          model: KundliReport,
          as: "kundliReport",
          required: false,
          attributes: ["id", "generatedAt", "pdfUrl", "pdfUploadedAt"],
        },
      ],
      order: [["createdAt", "DESC"]],
    });

    if (!userRequests || userRequests.length === 0) {
      return res.status(404).json({
        success: false,
        message: "No kundlis found. Please create a kundli first.",
      });
    }

    // Format the response
    const kundlis = userRequests.map((request) => ({
      id: request.id,
      fullName: request.fullName,
      dateOfbirth: request.dateOfbirth,
      timeOfbirth: request.timeOfbirth,
      placeOfBirth: request.placeOfBirth,
      gender: request.gender,
      createdAt: request.createdAt,
      hasKundli: !!request.kundli,
      hasReport: !!request.kundliReport,
      reportGeneratedAt: request.kundliReport?.generatedAt || null,
      hasPdf: Boolean(request.kundliReport?.pdfUrl),
      reportPdfUrl: request.kundliReport?.pdfUrl || null,
      reportPdfUploadedAt: request.kundliReport?.pdfUploadedAt || null,
    }));

    res.status(200).json({
      success: true,
      kundlis,
    });
  } catch (error) {
    console.error("Error fetching kundlis for report:", error);
    res.status(500).json({
      success: false,
      message: "Failed to fetch kundlis",
      error: error.message,
    });
  }
};

/**
 * Generate Kundli report with OpenAI enhancement
 */
const generateKundliReport = async (req, res) => {
  try {
    const userId = req.user.id;
    const { userRequestId } = req.body;

    if (!userRequestId) {
      return res.status(400).json({
        success: false,
        message: "userRequestId is required",
      });
    }

    // Fetch the user request and kundli
    const userRequest = await getUserRequestWithKundli(userId, userRequestId);

    if (!userRequest) {
      return res.status(404).json({
        success: false,
        message: "Kundli not found",
      });
    }

    const kundliData = userRequest.kundli;
    const userDetails = buildUserDetails(userRequest);

    const { reportData, generatedAt, fromCache, reportRecord } = await getOrCreateStoredReport({
      userId,
      userRequestId,
      kundliData,
      userDetails,
    });

    // Return the report content. If already generated earlier, return cached content.
    res.status(200).json({
      success: true,
      message: fromCache
        ? "Report already generated. Showing saved report."
        : "Report generated successfully",
      alreadyGenerated: fromCache,
      reportData: {
        ...reportData,
        userDetails,
        kundliId: kundliData.id,
        userRequestId,
        generatedAt,
        ...getStoredPdfMetadata(reportRecord),
      },
    });
  } catch (error) {
    console.error("Error generating kundli report:", error);
    res.status(500).json({
      success: false,
      message: "Failed to generate report",
      error: error.message,
    });
  }
};

/**
 * Get previously generated Kundli report content
 */
const getGeneratedKundliReport = async (req, res) => {
  try {
    const userId = req.user.id;
    const { userRequestId } = req.params;

    if (!userRequestId) {
      return res.status(400).json({
        success: false,
        message: "userRequestId is required",
      });
    }

    const userRequest = await getUserRequestWithKundli(userId, userRequestId);

    if (!userRequest) {
      return res.status(404).json({
        success: false,
        message: "Kundli not found",
      });
    }

    const reportRecord = await KundliReport.findOne({
      where: {
        userId,
        userRequestId,
      },
    });

    if (!reportRecord) {
      return res.status(404).json({
        success: false,
        message: "No generated report found for this kundli",
      });
    }

    const userDetails = buildUserDetails(userRequest);

    res.status(200).json({
      success: true,
      message: "Generated report fetched successfully",
      reportData: {
        ...reportRecord.reportData,
        userDetails,
        kundliId: userRequest.kundli.id,
        userRequestId,
        generatedAt: reportRecord.generatedAt,
        ...getStoredPdfMetadata(reportRecord),
      },
    });
  } catch (error) {
    console.error("Error fetching generated kundli report:", error);
    res.status(500).json({
      success: false,
      message: "Failed to fetch generated report",
      error: error.message,
    });
  }
};

/**
 * Generate and download PDF report
 */
const downloadKundliReportPDF = async (req, res) => {
  try {
    const userId = req.user.id;
    const { userRequestId } = req.body;

    if (!userRequestId) {
      return res.status(400).json({
        success: false,
        message: "userRequestId is required",
      });
    }

    // Fetch the user request and kundli
    const userRequest = await getUserRequestWithKundli(userId, userRequestId);

    if (!userRequest) {
      return res.status(404).json({
        success: false,
        message: "Kundli not found",
      });
    }

    const kundliData = userRequest.kundli;
    const userDetails = buildUserDetails(userRequest);

    // Reuse stored report if available; otherwise generate and save once.
    const { reportData, reportRecord } = await getOrCreateStoredReport({
      userId,
      userRequestId,
      kundliData,
      userDetails,
    });

    // Generate PDF
    console.log("[Kundli Report PDF] Generating PDF...");
    const pdfBuffer = await buildKundliReportPDF(reportData, kundliData, userDetails);

    // Persist the generated PDF once so users can access the stored file later.
    await ensureStoredKundliPdf({
      reportRecord,
      pdfBuffer,
      userDetails,
      userRequestId,
    });

    // Set response headers for PDF download
    const filename = reportRecord?.pdfFileName || buildKundliPdfFileName(userDetails, userRequestId);

    res.setHeader('Content-Type', 'application/pdf');
    res.setHeader('Content-Disposition', `attachment; filename="${filename}"`);
    res.setHeader('Content-Length', pdfBuffer.length);

    // Send the PDF
    res.send(pdfBuffer);

  } catch (error) {
    console.error("Error generating PDF:", error);
    res.status(500).json({
      success: false,
      message: "Failed to generate PDF",
      error: error.message,
    });
  }
};

/**
 * Preview PDF report (base64 encoded)
 */
const previewKundliReportPDF = async (req, res) => {
  try {
    const userId = req.user.id;
    const { userRequestId } = req.body;

    if (!userRequestId) {
      return res.status(400).json({
        success: false,
        message: "userRequestId is required",
      });
    }

    // Fetch the user request and kundli
    const userRequest = await getUserRequestWithKundli(userId, userRequestId);

    if (!userRequest) {
      return res.status(404).json({
        success: false,
        message: "Kundli not found",
      });
    }

    const kundliData = userRequest.kundli;
    const userDetails = buildUserDetails(userRequest);

    // Reuse stored report if available; otherwise generate and save once.
    const { reportData, reportRecord } = await getOrCreateStoredReport({
      userId,
      userRequestId,
      kundliData,
      userDetails,
    });

    // Generate PDF
    const pdfBuffer = await buildKundliReportPDF(reportData, kundliData, userDetails);
    const pdfMetadata = await ensureStoredKundliPdf({
      reportRecord,
      pdfBuffer,
      userDetails,
      userRequestId,
    });

    // Convert to base64 for preview
    const pdfBase64 = pdfBuffer.toString('base64');

    res.status(200).json({
      success: true,
      message: "PDF preview generated successfully",
      pdfData: `data:application/pdf;base64,${pdfBase64}`,
      ...pdfMetadata,
    });

  } catch (error) {
    console.error("Error generating PDF preview:", error);
    res.status(500).json({
      success: false,
      message: "Failed to generate PDF preview",
      error: error.message,
    });
  }
};

const generateDailyKundaliReport = async (req, res) => {
  try {
    const userId = req.user.id;
    const {
      fullName,
      gender,
      dateOfbirth,
      timeOfbirth,
      placeOfBirth,
      latitude,
      longitude,
      userRequestId,
    } = req.body;

    if (!userRequestId && (!fullName || !gender || !dateOfbirth || !timeOfbirth || !placeOfBirth)) {
      return res.status(400).json({
        success: false,
        message: "Missing required fields (userRequestId or fullName, gender, dateOfbirth, timeOfbirth, placeOfBirth)",
      });
    }

    console.log("Received daily report request");

    if (!req.dailyReportBackgroundMode) {
      const reportPurchase = await assertReportPurchaseAccess({
        userId,
        reportType: "daily",
        accessToken: req.body.reportAccessToken,
      });

      const userRequest = await findOrCreateUserRequestWithKundli({
        userId,
        userRequestId,
        fullName,
        gender,
        dateOfbirth,
        timeOfbirth,
        placeOfBirth,
        latitude,
        longitude,
      });

      const reportGenerationRequest = await saveReportGenerationRequest(req, {
        userId,
        userRequestId: userRequest.id,
        kundliId: userRequest.kundli?.id || null,
        reportType: "daily_kundali",
        sourceType: "kundli_report",
        sourceId: null,
        status: "processing",
        price: DAILY_REPORT_GENERATION_PRICE,
        currency: "INR",
        requestPayload: {
          ...(req.body || {}),
          userRequestId: userRequest.id,
          fullName: userRequest.fullName || fullName,
          gender: userRequest.gender || gender,
          dateOfbirth: userRequest.dateOfbirth || dateOfbirth,
          timeOfbirth: userRequest.timeOfbirth || timeOfbirth,
          placeOfBirth: userRequest.placeOfBirth || placeOfBirth,
        },
        metadata: {
          fullName: userRequest.fullName || fullName,
          gender: userRequest.gender || gender,
          dateOfbirth: userRequest.dateOfbirth || dateOfbirth,
          timeOfbirth: userRequest.timeOfbirth || timeOfbirth,
          placeOfBirth: userRequest.placeOfBirth || placeOfBirth,
          processingStatus: "background_started",
        },
        startedAt: new Date(),
      });

      await markReportPurchaseConsumed(reportPurchase, {
        reportGenerationRequestId: reportGenerationRequest.id,
        userRequestId: userRequest.id,
      });

      setImmediate(() => {
        const backgroundReq = {
          user: { id: userId },
          body: { ...(req.body || {}) },
          dailyReportBackgroundMode: true,
          reportGenerationRequestId: reportGenerationRequest.id,
        };
        const backgroundRes = createNoopReportResponse("DailyReport");

        generateDailyKundaliReport(backgroundReq, backgroundRes).catch(async (error) => {
          console.error("[DailyReport][Background] Failed:", {
            reportRequestId: reportGenerationRequest.id,
            userId,
            message: error.message || String(error),
          });
          await reportGenerationRequest.update({
            status: "failed",
            error: error.message || String(error),
            completedAt: new Date(),
            metadata: {
              ...(reportGenerationRequest.metadata || {}),
              processingStatus: "background_failed",
            },
          });
        });
      });

      return res.status(202).json({
        success: true,
        queued: false,
        background: true,
        message: "Daily report request accepted. Track generation in My Reports.",
        report: {
          id: reportGenerationRequest.id,
          reportRequestId: reportGenerationRequest.id,
          userRequestId: userRequest.id,
          reportType: "daily_kundali",
          status: "processing",
          createdAt: reportGenerationRequest.createdAt,
        },
      });
    }

    const userRequest = await findOrCreateUserRequestWithKundli({
      userId,
      userRequestId,
      fullName,
      gender,
      dateOfbirth,
      timeOfbirth,
      placeOfBirth,
      latitude,
      longitude,
    });

    // Check if we have a KundliReport generated TODAY
    const todayStr = new Date().toISOString().slice(0, 10);
    let reportRecord = await KundliReport.findOne({
      where: {
        userId,
        userRequestId: userRequest.id,
      },
    });

    let finalResponseData;
    let reportGenerationRequest = null;
    let pdfMetadata = {};
    let dailyKundli = null;
    let dailyPayload = null;
    let dailyForecast = null;
    let tokenUsage = { inputTokens: 0, outputTokens: 0, totalTokens: 0, raw: {} };
    const dailyUserDetails = {
      fullName,
      gender,
      dateOfbirth,
      timeOfbirth,
      placeOfBirth,
    };
    if (reportRecord && reportRecord.generatedAt.toISOString().slice(0, 10) === todayStr) {
      finalResponseData = reportRecord.reportData;
      if (userRequest.kundli) {
        dailyKundli = userRequest.kundli.toJSON ? userRequest.kundli.toJSON() : userRequest.kundli;
      }
    } else {
      // Reuse existing Kundli from DB if available, otherwise fetch and save it
      let kundli;
      if (userRequest.kundli) {
        kundli = userRequest.kundli.toJSON ? userRequest.kundli.toJSON() : userRequest.kundli;
      } else {
        // Generate Kundli data in parallel
        const [
          basicDetails,
          astroDetails,
          panchang,
          planetary,
          charts,
          dasha,
          yogini,
          manglikAnalysis,
          personality,
          gemstoneRemedies,
          rudrakshaSuggestion,
          ashtakavarga,
          transit,
          completeHoroscope,
        ] = await Promise.allSettled([
          getBasicDetails(userRequest),
          getAstroDetails(userRequest),
          getPanchang(userRequest),
          getPlanetaryPositions(userRequest),
          getAllCharts(userRequest),
          getVimshottariDasha(userRequest),
          getYoginiDasha(userRequest),
          getManglikAnalysis(userRequest),
          getAscendantReport(userRequest),
          getGemstoneRemedies(userRequest),
          getRudrakshaSuggestion(userRequest),
          getAshtakavarga(userRequest),
          getTransitChart(userRequest),
          getCompleteHoroscope(userRequest),
        ]);

        const extractValue = (result, name) => {
          if (result.status === "fulfilled") return result.value;
          console.error(`${name} failed:`, result.reason?.message || result.reason);
          return null;
        };

        const basicDetailsVal = extractValue(basicDetails, "Basic Details");
        const astroDetailsVal = extractValue(astroDetails, "Astro Details");
        const panchangVal = extractValue(panchang, "Panchang");
        const planetaryVal = extractValue(planetary, "Planetary");
        const chartsVal = extractValue(charts, "Charts");
        const dashaVal = extractValue(dasha, "Vimshottari Dasha");
        const yoginiVal = extractValue(yogini, "Yogini Dasha");
        const manglikAnalysisVal = extractValue(manglikAnalysis, "Manglik");
        const personalityVal = extractValue(personality, "Personality");
        const gemstones = extractValue(gemstoneRemedies, "Gemstones");
        const rudraksha = extractValue(rudrakshaSuggestion, "Rudraksha");
        const ashtakvargaData = extractValue(ashtakavarga, "Ashtakavarga");
        const transitVal = extractValue(transit, "Transit");
        const horoscope = extractValue(completeHoroscope, "Complete Horoscope");

        const ashtakvargaPayload = buildAshtakvargaPayload(
          ashtakvargaData,
          basicDetailsVal?.ascendant?.longitude ?? 0
        );

        let yogas = null;
        if (horoscope && Array.isArray(horoscope.yoga_analysis)) {
          yogas = horoscope.yoga_analysis.map((yoga) => ({
            name: yoga.name,
            type: yoga.type,
            strength: yoga.strength,
            description: yoga.description,
            effects: yoga.effects,
          }));
        }

        const finalHoroscope = (horoscope && typeof horoscope === "object") ? { ...horoscope } : {};
        if (transitVal) finalHoroscope.transit = transitVal;

        const kundliDataObj = {
          requestId: userRequest.id,
          basicDetails: basicDetailsVal,
          astroDetails: astroDetailsVal,
          manglikAnalysis: manglikAnalysisVal,
          panchang: panchangVal,
          charts: chartsVal,
          dasha: dashaVal,
          yogini: yoginiVal,
          personality: personalityVal,
          planetary: planetaryVal,
          remedies: { gemstones, rudraksha },
          ashtakvarga: ashtakvargaPayload,
          yogas,
          horoscope: finalHoroscope,
        };

        const createdKundli = await Kundli.create(kundliDataObj);
        kundli = createdKundli.toJSON ? createdKundli.toJSON() : createdKundli;
      }

      dailyKundli = kundli;

      const timezone = req.body.timezone || "Asia/Kolkata";
      const currentDate = req.body.currentDate || todayStr;
      const lat = latitude ? parseFloat(latitude) : userRequest.latitude;
      const lng = longitude ? parseFloat(longitude) : userRequest.longitude;

      const payload = await buildDailyReportPayload(kundli, currentDate, timezone, lat, lng, userRequest);
      dailyPayload = payload;
      const dailyReportResult = await generateDailyReport(payload, userRequest, { includeMeta: true });
      dailyForecast = dailyReportResult.data;
      tokenUsage = dailyReportResult.tokenUsage || tokenUsage;
      const dailyReportBasicDetails = extractBasicDetails(kundli, userRequest, currentDate);

      const disclaimer = `## Disclaimer

This Daily Astrology Report is generated using astrological calculations, planetary positions, transit analysis, and Dasha-based interpretations available at the time of generation.

Astrology is intended to provide guidance, insights, and possible trends based on celestial patterns. It should not be considered a guarantee of future events or outcomes. Individual experiences may vary depending on personal choices, circumstances, and free will.

The information provided in this report is for informational, self-reflection, and entertainment purposes only. Any suggestions, timing guidance, or recommendations are meant to help you make more informed decisions and should not be treated as professional advice.

Graho does not provide medical, legal, financial, psychological, or other professional services. For important decisions relating to health, finances, business, legal matters, or personal safety, please consult a qualified professional.

While every effort is made to ensure accurate astrological calculations and interpretations, Graho makes no warranties regarding the completeness, accuracy, or reliability of any prediction, forecast, or recommendation. No specific result or outcome is guaranteed.

By accessing and using this report, you acknowledge that all decisions and actions taken based on its contents are solely your responsibility.

May this report serve as a source of awareness, reflection, and guidance as you navigate your day.`;

      finalResponseData = mergeFinalResponse(dailyReportBasicDetails, dailyForecast, payload.dasha, disclaimer);

      if (reportRecord) {
        await reportRecord.update({
          reportData: finalResponseData,
          generatedAt: new Date(),
        });
      } else {
        reportRecord = await KundliReport.create({
          userId,
          userRequestId: userRequest.id,
          reportData: finalResponseData,
          generatedAt: new Date(),
        });
      }

      reportGenerationRequest = await saveReportGenerationRequest(req, {
        userId,
        userRequestId: userRequest.id,
        kundliId: dailyKundli?.id || null,
        reportType: "daily_kundali",
        sourceType: "kundli_report",
        sourceId: reportRecord.id,
        status: "llm_completed",
        price: DAILY_REPORT_GENERATION_PRICE,
        currency: "INR",
        inputTokens: tokenUsage.inputTokens || 0,
        outputTokens: tokenUsage.outputTokens || 0,
        totalTokens: tokenUsage.totalTokens || 0,
        tokenUsage,
        requestPayload: dailyPayload || {},
        llmResponse: dailyForecast || {},
        reportData: finalResponseData || {},
        startedAt: new Date(),
        metadata: {
          reportDate: payload?.basicDetails?.reportDate || currentDate,
          timezone,
          pdfGeneration: "pending",
        },
      });

      console.log("[DailyReport][ReportRequest] LLM response saved successfully");
    }

    if (!reportGenerationRequest && req.reportGenerationRequestId && reportRecord && finalResponseData) {
      const cachedPdfMetadata = getStoredPdfMetadata(reportRecord);
      reportGenerationRequest = await saveReportGenerationRequest(req, {
        userId,
        userRequestId: userRequest.id,
        kundliId: dailyKundli?.id || userRequest.kundli?.id || null,
        reportType: "daily_kundali",
        sourceType: "kundli_report",
        sourceId: reportRecord.id,
        status: cachedPdfMetadata?.pdfUrl ? "completed" : "llm_completed",
        price: DAILY_REPORT_GENERATION_PRICE,
        currency: "INR",
        inputTokens: 0,
        outputTokens: 0,
        totalTokens: 0,
        tokenUsage: {},
        requestPayload: req.body || {},
        llmResponse: dailyForecast || finalResponseData?.dailyForecast || finalResponseData || {},
        reportData: finalResponseData || {},
        pdfUrl: cachedPdfMetadata?.pdfUrl || null,
        pdfPublicId: cachedPdfMetadata?.pdfPublicId || null,
        pdfFileName: cachedPdfMetadata?.pdfFileName || null,
        pdfUploadedAt: cachedPdfMetadata?.pdfUploadedAt || null,
        completedAt: cachedPdfMetadata?.pdfUrl ? new Date() : null,
        metadata: {
          reportDate: finalResponseData?.basicDetails?.reportDate || todayStr,
          pdfGeneration: cachedPdfMetadata?.pdfUrl ? "uploaded" : "pending",
          processingStatus: cachedPdfMetadata?.pdfUrl ? "cached_completed" : "cached_pdf_pending",
        },
      });
    }

    if (!reportGenerationRequest) {
      reportGenerationRequest = await saveCachedReportGenerationRequestForWorker({
        req,
        userId,
        userRequest,
        reportRecord,
        reportType: "daily_kundali",
        sourceType: "kundli_report",
        price: DAILY_REPORT_GENERATION_PRICE,
        finalResponseData,
        kundliId: dailyKundli?.id || userRequest.kundli?.id || null,
        requestPayload: req.body || {},
        llmResponse: dailyForecast || finalResponseData?.dailyForecast || finalResponseData || {},
        metadata: {
          reportDate: finalResponseData?.basicDetails?.reportDate || todayStr,
        },
      });
    }

    try {
      if (reportRecord?.pdfUrl) {
        pdfMetadata = getStoredPdfMetadata(reportRecord);
      } else {
        console.log("[DailyReport][PDF] Generating daily report PDF");

        const pdfBuffer = await generateDailyReportPDF(finalResponseData, dailyUserDetails);
        pdfMetadata = await ensureStoredDailyPdf({
          reportRecord,
          pdfBuffer,
          userDetails: dailyUserDetails,
          userRequestId: userRequest.id,
        });

        console.log("[DailyReport][PDF] Uploaded daily report PDF successfully");
      }

      if (reportGenerationRequest) {
        await reportGenerationRequest.update({
          status: "completed",
          pdfUrl: pdfMetadata?.pdfUrl || null,
          pdfPublicId: pdfMetadata?.pdfPublicId || null,
          pdfFileName: pdfMetadata?.pdfFileName || null,
          pdfUploadedAt: pdfMetadata?.pdfUploadedAt || null,
          completedAt: new Date(),
          metadata: {
            ...(reportGenerationRequest.metadata || {}),
            pdfGeneration: pdfMetadata?.pdfUrl ? "uploaded" : "skipped",
          },
        });
        await notifyReportGenerationStatus(reportGenerationRequest, "completed");
      }
    } catch (pdfError) {
      console.error("[DailyReport][PDF] Generation/upload failed:", pdfError.message || pdfError);
      if (reportGenerationRequest) {
        await reportGenerationRequest.update({
          status: "pdf_failed",
          error: pdfError.message || String(pdfError),
          completedAt: new Date(),
          metadata: {
            ...(reportGenerationRequest.metadata || {}),
            pdfGeneration: "failed",
          },
        });
        await notifyReportGenerationStatus(reportGenerationRequest, "pdf_failed");
      }
    }



    res.status(200).json({
      success: true,
      data: finalResponseData,
      report: {
        id: reportRecord?.id || null,
        reportRequestId: reportGenerationRequest?.id || null,
        ...pdfMetadata,
      },
    });
  } catch (error) {
    console.error("Error in generateDailyKundaliReport:", error);
    if (req.dailyReportBackgroundMode && req.reportGenerationRequestId) {
      try {
        const reportGenerationRequest = await ReportGenerationRequest.findByPk(req.reportGenerationRequestId);
        if (reportGenerationRequest) {
          await reportGenerationRequest.update({
            status: "failed",
            error: error.message || String(error),
            completedAt: new Date(),
            metadata: {
              ...(reportGenerationRequest.metadata || {}),
              processingStatus: "background_failed",
            },
          });
          await notifyReportGenerationStatus(reportGenerationRequest, "failed");
        }
      } catch (statusError) {
        console.error("[DailyReport][Background] Failed to update failure status:", statusError.message || statusError);
      }
    }
    res.status(error.statusCode || 500).json({
      success: false,
      message: "Failed to generate daily kundali report",
      error: error.message,
    });
  }
};

const getDailyKundaliHistory = async (req, res) => {
  try {
    const userId = req.user.id;

    const reports = await KundliReport.findAll({
      where: { userId },
      include: [
        {
          model: UserRequest,
          as: "userRequest",
          required: true,
        },
      ],
      order: [["generatedAt", "DESC"]],
    });

    const formattedReports = reports.map((r) => ({
      id: r.id,
      userRequestId: r.userRequestId,
      status: "completed",
      fullName: r.userRequest.fullName,
      dateOfbirth: r.userRequest.dateOfbirth,
      placeOfBirth: r.userRequest.placeOfBirth,
      createdAt: r.generatedAt,
      pdfUrl: r.pdfUrl || null,
      reportData: r.reportData || null,
    }));
    const queuedReports = await getQueuedReportHistoryItems({
      userId,
      reportType: "daily_kundali",
      existingReports: formattedReports,
    });

    res.status(200).json({
      success: true,
      reports: [...queuedReports, ...formattedReports].sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime()),
    });
  } catch (error) {
    console.error("Error in getDailyKundaliHistory:", error);
    res.status(500).json({
      success: false,
      message: "Failed to fetch daily report history",
      error: error.message,
    });
  }
};

/**
 * Delete a daily kundali report by ID
 */
const deleteDailyKundaliReport = async (req, res) => {
  try {
    const userId = req.user.id;
    const { id } = req.params;

    if (!id) {
      return res.status(400).json({
        success: false,
        message: "Report ID is required",
      });
    }

    const reportRecord = await KundliReport.findOne({
      where: { id, userId },
    });

    if (!reportRecord) {
      return res.status(404).json({
        success: false,
        message: "Report not found or you do not have permission to delete it",
      });
    }

    await reportRecord.destroy();

    return res.status(200).json({
      success: true,
      message: "Report deleted successfully",
    });
  } catch (error) {
    console.error("Error deleting daily kundali report:", error);
    return res.status(500).json({
      success: false,
      message: "Failed to delete report",
      error: error.message,
    });
  }
};

const getDailyReportRecordForUser = async ({ userId, reportId }) => {
  return KundliReport.findOne({
    where: { id: reportId, userId },
    include: [
      {
        model: UserRequest,
        as: "userRequest",
        required: true,
      },
    ],
  });
};

const buildDailyUserDetailsFromRecord = (reportRecord) => ({
  fullName: reportRecord.userRequest.fullName,
  gender: reportRecord.userRequest.gender,
  dateOfbirth: reportRecord.userRequest.dateOfbirth,
  timeOfbirth: reportRecord.userRequest.timeOfbirth,
  placeOfBirth: reportRecord.userRequest.placeOfBirth,
});

const regenerateDailyReportPdf = async (req, res) => {
  try {
    const userId = req.user.id;
    const { id } = req.params;

    const reportRecord = await getDailyReportRecordForUser({ userId, reportId: id });
    if (!reportRecord) {
      return res.status(404).json({
        success: false,
        message: "Daily report not found or you do not have permission to access it",
      });
    }

    if (!reportRecord.reportData) {
      return res.status(409).json({
        success: false,
        message: "Stored daily report data is not available for PDF regeneration",
      });
    }

    const userDetails = buildDailyUserDetailsFromRecord(reportRecord);
    const reportRequest = await ReportGenerationRequest.create({
      userId,
      userRequestId: reportRecord.userRequestId,
      kundliId: null,
      reportType: "daily_kundali",
      sourceType: "daily_temp_regen",
      sourceId: reportRecord.id,
      status: "pdf_regenerating",
      price: 0,
      currency: "INR",
      inputTokens: 0,
      outputTokens: 0,
      totalTokens: 0,
      tokenUsage: { inputTokens: 0, outputTokens: 0, totalTokens: 0, skippedOpenAI: true },
      requestPayload: { reportId: reportRecord.id, userRequestId: reportRecord.userRequestId },
      llmResponse: {},
      reportData: reportRecord.reportData,
      startedAt: new Date(),
      metadata: { reason: "temporary_pdf_regeneration_from_stored_daily_data" },
    });

    const pdfBuffer = await generateDailyReportPDF(reportRecord.reportData, userDetails);
    const pdfMetadata = await uploadDailyPdfBuffer({
      reportRecord,
      pdfBuffer,
      userDetails,
      userRequestId: reportRecord.userRequestId,
    });

    await reportRequest.update({
      status: "completed",
      pdfUrl: pdfMetadata.pdfUrl,
      pdfPublicId: pdfMetadata.pdfPublicId,
      pdfFileName: pdfMetadata.pdfFileName,
      pdfUploadedAt: pdfMetadata.pdfUploadedAt,
      completedAt: new Date(),
    });

    console.log("[Daily PDF] regenerated from stored data successfully");

    return res.status(200).json({
      success: true,
      message: "Daily report PDF regenerated from stored data",
      reportRequestId: reportRequest.id,
      ...pdfMetadata,
    });
  } catch (error) {
    console.error("[Daily PDF] regenerate failed:", error);
    return res.status(500).json({
      success: false,
      message: "Failed to regenerate daily report PDF",
      error: error.message,
    });
  }
};

const downloadDailyReportPdf = async (req, res) => {
  try {
    const userId = req.user.id;
    const { id } = req.params;

    const reportRecord = await getDailyReportRecordForUser({ userId, reportId: id });
    if (!reportRecord) {
      return res.status(404).json({
        success: false,
        message: "Daily report not found or you do not have permission to access it",
      });
    }

    let pdfMetadata = getStoredPdfMetadata(reportRecord);
    if (!pdfMetadata.pdfUrl) {
      if (!reportRecord.reportData) {
        return res.status(409).json({
          success: false,
          message: "Stored daily report data is not available for PDF generation",
        });
      }

      const userDetails = buildDailyUserDetailsFromRecord(reportRecord);
      const pdfBuffer = await generateDailyReportPDF(reportRecord.reportData, userDetails);
      pdfMetadata = await uploadDailyPdfBuffer({
        reportRecord,
        pdfBuffer,
        userDetails,
        userRequestId: reportRecord.userRequestId,
      });
    }

    const cloudinaryResponse = await fetch(pdfMetadata.pdfUrl);
    if (!cloudinaryResponse.ok) {
      throw new Error(`Cloudinary PDF fetch failed with status ${cloudinaryResponse.status}`);
    }

    const pdfBuffer = Buffer.from(await cloudinaryResponse.arrayBuffer());
    const fileName = pdfMetadata.pdfFileName || `daily_report_${String(id).slice(0, 8)}.pdf`;

    res.setHeader("Content-Type", "application/pdf");
    res.setHeader("Content-Disposition", `attachment; filename="${fileName}"`);
    res.setHeader("Content-Length", pdfBuffer.length);
    return res.send(pdfBuffer);
  } catch (error) {
    console.error("[Daily PDF] download failed:", error);
    return res.status(500).json({
      success: false,
      message: "Failed to download daily report PDF",
      error: error.message,
    });
  }
};

const generateYearlyPdfInBackground = async (reportRecord, userRequest, reportGenerationRequest = null) => {
  try {
    console.log("[Yearly PDF Background] Generating PDF...");
    const pdfBuffer = await generateYearlyReportPDF(reportRecord.reportData, userRequest);

    console.log(`[Yearly PDF Background] Uploading to Cloudinary...`);
    const pdfMetadata = await uploadYearlyPdfBuffer({
      reportRecord,
      pdfBuffer,
      userDetails: userRequest,
      userRequestId: userRequest.id,
    });

    if (reportGenerationRequest) {
      await reportGenerationRequest.update({
        status: "completed",
        pdfUrl: pdfMetadata.pdfUrl,
        pdfPublicId: pdfMetadata.pdfPublicId,
        pdfFileName: pdfMetadata.pdfFileName,
        pdfUploadedAt: pdfMetadata.pdfUploadedAt,
        completedAt: new Date(),
        metadata: {
          ...(reportGenerationRequest.metadata || {}),
          pdfGeneration: "uploaded",
        },
      });
      await notifyReportGenerationStatus(reportGenerationRequest, "completed");
    }

    console.log("[Yearly PDF Background] Successfully completed");
  } catch (error) {
    console.error(`[Yearly PDF Background] Failed for report ID: ${reportRecord.id}:`, error.message || error);
    if (reportGenerationRequest) {
      await reportGenerationRequest.update({
        status: "pdf_failed",
        error: error.message || String(error),
        completedAt: new Date(),
        metadata: {
          ...(reportGenerationRequest.metadata || {}),
          pdfGeneration: "failed",
        },
      });
      await notifyReportGenerationStatus(reportGenerationRequest, "pdf_failed");
    }
  }
};

const generateYearlyKundaliReport = async (req, res) => {
  try {
    const userId = req.user.id;
    const {
      fullName,
      gender,
      dateOfbirth,
      timeOfbirth,
      placeOfBirth,
      latitude,
      longitude,
      userRequestId,
    } = req.body;

    if (!userRequestId && (!fullName || !gender || !dateOfbirth || !timeOfbirth || !placeOfBirth)) {
      return res.status(400).json({
        success: false,
        message: "Missing required fields (userRequestId or fullName, gender, dateOfbirth, timeOfbirth, placeOfBirth)",
      });
    }

    let reportPurchase = null;
    if (!isReportQueueWorkerMode(req)) {
      reportPurchase = await assertReportPurchaseAccess({
        userId,
        reportType: "yearly",
        accessToken: req.body.reportAccessToken,
      });
    }

    if (REPORT_QUEUE_ENABLED() && !isReportQueueWorkerMode(req)) {
      await markReportPurchaseConsumed(reportPurchase, {
        queuedReportType: "yearly_kundali",
      });
      return respondQueuedReport({
        req,
        res,
        reportType: "yearly_kundali",
        message: "Yearly report request queued. It will be processed by the scheduled report worker.",
      });
    }

    console.log("Received yearly report request");

    const userRequest = await findOrCreateUserRequestWithKundli({
      userId,
      userRequestId,
      fullName,
      gender,
      dateOfbirth,
      timeOfbirth,
      placeOfBirth,
      latitude,
      longitude,
    });

    if (reportPurchase) {
      await markReportPurchaseConsumed(reportPurchase, {
        userRequestId: userRequest.id,
      });
    }

    const year = parseInt(req.body.year || new Date().getFullYear(), 10);
    const timezone = req.body.timezone || "Asia/Kolkata";
    const lat = latitude ? parseFloat(latitude) : userRequest.latitude;
    const lng = longitude ? parseFloat(longitude) : userRequest.longitude;

    // Check if we have a YearlyReport generated already for this request and year
    let reportRecord = await YearlyReport.findOne({
      where: {
        userId,
        userRequestId: userRequest.id,
      },
    });

    let finalResponseData;
    let yearlyKundli = null;
    let reportGenerationRequest = null;
    if (reportRecord && reportRecord.reportData?.year === year) {
      finalResponseData = reportRecord.reportData;
      console.log(`[YearlyReportController] Serving cached predictions for year ${year}`);
      if (!reportRecord.pdfUrl) {
        if (!isReportQueueWorkerMode(req)) {
          generateYearlyPdfInBackground(reportRecord, userRequest);
        }
      }
    } else {
      // Reuse existing Kundli from DB if available, otherwise fetch and save it
      let kundli;
      if (userRequest.kundli) {
        kundli = userRequest.kundli.toJSON ? userRequest.kundli.toJSON() : userRequest.kundli;
      } else {
        // Generate Kundli data in parallel
        const [
          basicDetails,
          astroDetails,
          panchang,
          planetary,
          charts,
          dasha,
          yogini,
          manglikAnalysis,
          personality,
          gemstoneRemedies,
          rudrakshaSuggestion,
          ashtakavarga,
          transit,
          completeHoroscope,
        ] = await Promise.allSettled([
          getBasicDetails(userRequest),
          getAstroDetails(userRequest),
          getPanchang(userRequest),
          getPlanetaryPositions(userRequest),
          getAllCharts(userRequest),
          getVimshottariDasha(userRequest),
          getYoginiDasha(userRequest),
          getManglikAnalysis(userRequest),
          getAscendantReport(userRequest),
          getGemstoneRemedies(userRequest),
          getRudrakshaSuggestion(userRequest),
          getAshtakavarga(userRequest),
          getTransitChart(userRequest),
          getCompleteHoroscope(userRequest),
        ]);

        const extractValue = (result, name) => {
          if (result.status === "fulfilled") return result.value;
          console.error(`${name} failed:`, result.reason?.message || result.reason);
          return null;
        };

        const basicDetailsVal = extractValue(basicDetails, "Basic Details");
        const astroDetailsVal = extractValue(astroDetails, "Astro Details");
        const panchangVal = extractValue(panchang, "Panchang");
        const planetaryVal = extractValue(planetary, "Planetary");
        const chartsVal = extractValue(charts, "Charts");
        const dashaVal = extractValue(dasha, "Vimshottari Dasha");
        const yoginiVal = extractValue(yogini, "Yogini Dasha");
        const manglikAnalysisVal = extractValue(manglikAnalysis, "Manglik");
        const personalityVal = extractValue(personality, "Personality");
        const gemstones = extractValue(gemstoneRemedies, "Gemstones");
        const rudraksha = extractValue(rudrakshaSuggestion, "Rudraksha");
        const ashtakvargaData = extractValue(ashtakavarga, "Ashtakavarga");
        const transitVal = extractValue(transit, "Transit");
        const horoscope = extractValue(completeHoroscope, "Complete Horoscope");

        const ashtakvargaPayload = buildAshtakvargaPayload(
          ashtakvargaData,
          basicDetailsVal?.ascendant?.longitude ?? 0
        );

        let yogas = null;
        if (horoscope && Array.isArray(horoscope.yoga_analysis)) {
          yogas = horoscope.yoga_analysis.map((yoga) => ({
            name: yoga.name,
            type: yoga.type,
            strength: yoga.strength,
            description: yoga.description,
            effects: yoga.effects,
          }));
        }

        const finalHoroscope = (horoscope && typeof horoscope === "object") ? { ...horoscope } : {};
        if (transitVal) finalHoroscope.transit = transitVal;

        const kundliDataObj = {
          requestId: userRequest.id,
          basicDetails: basicDetailsVal,
          astroDetails: astroDetailsVal,
          manglikAnalysis: manglikAnalysisVal,
          panchang: panchangVal,
          charts: chartsVal,
          dasha: dashaVal,
          yogini: yoginiVal,
          personality: personalityVal,
          planetary: planetaryVal,
          remedies: { gemstones, rudraksha },
          ashtakvarga: ashtakvargaPayload,
          yogas,
          horoscope: finalHoroscope,
        };

        const createdKundli = await Kundli.create(kundliDataObj);
        kundli = createdKundli.toJSON ? createdKundli.toJSON() : createdKundli;
      }

      yearlyKundli = kundli;
      finalResponseData = await generateYearlyReport(kundli, year, timezone, lat, lng, userRequest);
      //   console.log("finalResponseData", JSON.stringify(finalResponseData, null, 2));
      if (reportRecord) {
        await reportRecord.update({
          reportData: finalResponseData,
          generatedAt: new Date(),
          pdfUrl: null, // Reset as predictions have changed
        });
      } else {
        reportRecord = await YearlyReport.create({
          userId,
          userRequestId: userRequest.id,
          reportData: finalResponseData,
          generatedAt: new Date(),
        });
      }

      reportGenerationRequest = await saveReportGenerationRequest(req, {
        userId,
        userRequestId: userRequest.id,
        kundliId: yearlyKundli?.id || null,
        reportType: "yearly_kundali",
        sourceType: "yearly_kundli_report",
        sourceId: reportRecord.id,
        status: "llm_completed",
        price: YEARLY_REPORT_GENERATION_PRICE,
        currency: "INR",
        inputTokens: 0,
        outputTokens: 0,
        totalTokens: 0,
        tokenUsage: {
          inputTokens: 0,
          outputTokens: 0,
          totalTokens: 0,
          unavailableBecause: "yearly_service_llm_logic_left_unchanged",
        },
        requestPayload: {
          year,
          timezone,
          latitude: lat,
          longitude: lng,
          userRequestId: userRequest.id,
        },
        llmResponse: finalResponseData || {},
        reportData: finalResponseData || {},
        startedAt: new Date(),
        metadata: {
          reportYear: year,
          pdfGeneration: "pending",
        },
      });

      console.log("[YearlyReport][ReportRequest] LLM response saved successfully");

      if (await handoffToPdfQueueIfWorker(req, reportGenerationRequest, reportRecord?.id || null)) {
        return res.status(202).json({
          success: true,
          queued: true,
          message: "Yearly report LLM completed. PDF generation queued.",
          report: {
            id: reportRecord?.id || null,
            reportRequestId: reportGenerationRequest?.id || null,
            status: "llm_completed",
          },
        });
      }

      // console.log("pdf start hoga");
      generateYearlyPdfInBackground(reportRecord, userRequest, reportGenerationRequest);
    }

    if (!reportGenerationRequest) {
      reportGenerationRequest = await saveCachedReportGenerationRequestForWorker({
        req,
        userId,
        userRequest,
        reportRecord,
        reportType: "yearly_kundali",
        sourceType: "yearly_kundli_report",
        price: YEARLY_REPORT_GENERATION_PRICE,
        finalResponseData,
        kundliId: userRequest.kundli?.id || null,
        requestPayload: {
          ...(req.body || {}),
          userRequestId: userRequest.id,
          year,
          timezone,
        },
        llmResponse: finalResponseData || {},
        metadata: {
          reportYear: year,
        },
      });
    }

    if (isReportQueueWorkerMode(req) && reportGenerationRequest?.pdfUrl) {
      return res.status(200).json({
        success: true,
        cached: true,
        message: "Yearly report already has a PDF. Queue request marked completed.",
        report: {
          id: reportRecord?.id || null,
          reportRequestId: reportGenerationRequest?.id || null,
          status: "completed",
          ...getStoredPdfMetadata(reportRecord),
        },
      });
    }

    if (await handoffToPdfQueueIfWorker(req, reportGenerationRequest, reportRecord?.id || null)) {
      return res.status(202).json({
        success: true,
        queued: true,
        message: "Yearly report LLM completed. PDF generation queued.",
        report: {
          id: reportRecord?.id || null,
          reportRequestId: reportGenerationRequest?.id || null,
          status: "llm_completed",
        },
      });
    }

    // console.log("final response data for yearly report prediction:");
    //   console.log(JSON.stringify(finalResponseData, null, 2));

    res.status(200).json({
      success: true,
      data: finalResponseData,
      report: {
        id: reportRecord?.id || null,
        reportRequestId: reportGenerationRequest?.id || null,
        ...getStoredPdfMetadata(reportRecord),
      },
    });
  } catch (error) {
    console.error("Error in generateYearlyKundaliReport:", error);
    res.status(error.statusCode || 500).json({
      success: false,
      message: "Failed to generate yearly report",
      error: error.message,
    });
  }
};

const getYearlyKundaliHistory = async (req, res) => {
  try {
    const userId = req.user.id;

    const reports = await YearlyReport.findAll({
      where: { userId },
      include: [
        {
          model: UserRequest,
          as: "userRequest",
          required: true,
        },
      ],
      order: [["generatedAt", "DESC"]],
    });

    const formattedReports = reports.map((r) => ({
      id: r.id,
      userRequestId: r.userRequestId,
      status: r.pdfUrl ? "completed" : "generating",
      fullName: r.userRequest.fullName,
      dateOfbirth: r.userRequest.dateOfbirth,
      placeOfBirth: r.userRequest.placeOfBirth,
      timeOfbirth: r.userRequest.timeOfbirth,
      gender: r.userRequest.gender,
      createdAt: r.generatedAt,
      pdfUrl: r.pdfUrl || null,
      reportData: r.reportData || null,
    }));
    const queuedReports = await getQueuedReportHistoryItems({
      userId,
      reportType: "yearly_kundali",
      existingReports: formattedReports,
    });

    res.status(200).json({
      success: true,
      reports: [...queuedReports, ...formattedReports].sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime()),
    });
  } catch (error) {
    console.error("Error in getYearlyKundaliHistory:", error);
    res.status(500).json({
      success: false,
      message: "Failed to fetch yearly report history",
      error: error.message,
    });
  }
};

const deleteYearlyKundaliReport = async (req, res) => {
  try {
    const userId = req.user.id;
    const { id } = req.params;

    if (!id) {
      return res.status(400).json({
        success: false,
        message: "Report ID is required",
      });
    }

    const reportRecord = await YearlyReport.findOne({
      where: { id, userId },
    });

    if (!reportRecord) {
      return res.status(404).json({
        success: false,
        message: "Report not found or you do not have permission to delete it",
      });
    }

    await reportRecord.destroy();

    return res.status(200).json({
      success: true,
      message: "Report deleted successfully",
    });
  } catch (error) {
    console.error("Error deleting yearly kundali report:", error);
    return res.status(500).json({
      success: false,
      message: "Failed to delete report",
      error: error.message,
    });
  }
};

const getYearlyReportRecordForUser = async ({ userId, reportId }) => {
  return YearlyReport.findOne({
    where: { id: reportId, userId },
    include: [
      {
        model: UserRequest,
        as: "userRequest",
        required: true,
      },
    ],
  });
};

const buildYearlyUserDetailsFromRecord = (reportRecord) => ({
  id: reportRecord.userRequest.id,
  userId: reportRecord.userId,
  fullName: reportRecord.userRequest.fullName,
  gender: reportRecord.userRequest.gender,
  dateOfbirth: reportRecord.userRequest.dateOfbirth,
  timeOfbirth: reportRecord.userRequest.timeOfbirth,
  placeOfBirth: reportRecord.userRequest.placeOfBirth,
  latitude: reportRecord.userRequest.latitude,
  longitude: reportRecord.userRequest.longitude,
});

const regenerateYearlyReportPdf = async (req, res) => {
  try {
    const userId = req.user.id;
    const { id } = req.params;

    const reportRecord = await getYearlyReportRecordForUser({ userId, reportId: id });
    if (!reportRecord) {
      return res.status(404).json({
        success: false,
        message: "Yearly report not found or you do not have permission to access it",
      });
    }

    if (!reportRecord.reportData) {
      return res.status(409).json({
        success: false,
        message: "Stored yearly report data is not available for PDF regeneration",
      });
    }

    const userDetails = buildYearlyUserDetailsFromRecord(reportRecord);
    const reportRequest = await ReportGenerationRequest.create({
      userId,
      userRequestId: reportRecord.userRequestId,
      kundliId: null,
      reportType: "yearly_kundali",
      sourceType: "yearly_temp_regen",
      sourceId: reportRecord.id,
      status: "pdf_regenerating",
      price: 0,
      currency: "INR",
      inputTokens: 0,
      outputTokens: 0,
      totalTokens: 0,
      tokenUsage: { inputTokens: 0, outputTokens: 0, totalTokens: 0, skippedOpenAI: true },
      requestPayload: { reportId: reportRecord.id, userRequestId: reportRecord.userRequestId },
      llmResponse: {},
      reportData: reportRecord.reportData,
      startedAt: new Date(),
      metadata: { reason: "temporary_pdf_regeneration_from_stored_yearly_data" },
    });

    const pdfBuffer = await generateYearlyReportPDF(reportRecord.reportData, userDetails);
    const pdfMetadata = await uploadYearlyPdfBuffer({
      reportRecord,
      pdfBuffer,
      userDetails,
      userRequestId: reportRecord.userRequestId,
    });

    await reportRequest.update({
      status: "completed",
      pdfUrl: pdfMetadata.pdfUrl,
      pdfPublicId: pdfMetadata.pdfPublicId,
      pdfFileName: pdfMetadata.pdfFileName,
      pdfUploadedAt: pdfMetadata.pdfUploadedAt,
      completedAt: new Date(),
    });

    console.log("[Yearly PDF] regenerated from stored data successfully");

    return res.status(200).json({
      success: true,
      message: "Yearly report PDF regenerated from stored data",
      reportRequestId: reportRequest.id,
      ...pdfMetadata,
    });
  } catch (error) {
    console.error("[Yearly PDF] regenerate failed:", error);
    return res.status(500).json({
      success: false,
      message: "Failed to regenerate yearly report PDF",
      error: error.message,
    });
  }
};

const downloadYearlyReportPdf = async (req, res) => {
  try {
    const userId = req.user.id;
    const { id } = req.params;

    const reportRecord = await getYearlyReportRecordForUser({ userId, reportId: id });
    if (!reportRecord) {
      return res.status(404).json({
        success: false,
        message: "Yearly report not found or you do not have permission to access it",
      });
    }

    let pdfMetadata = getStoredPdfMetadata(reportRecord);
    if (!pdfMetadata.pdfUrl) {
      if (!reportRecord.reportData) {
        return res.status(409).json({
          success: false,
          message: "Stored yearly report data is not available for PDF generation",
        });
      }

      const userDetails = buildYearlyUserDetailsFromRecord(reportRecord);
      const pdfBuffer = await generateYearlyReportPDF(reportRecord.reportData, userDetails);
      pdfMetadata = await uploadYearlyPdfBuffer({
        reportRecord,
        pdfBuffer,
        userDetails,
        userRequestId: reportRecord.userRequestId,
      });
    }

    const cloudinaryResponse = await fetch(pdfMetadata.pdfUrl);
    if (!cloudinaryResponse.ok) {
      throw new Error(`Cloudinary PDF fetch failed with status ${cloudinaryResponse.status}`);
    }

    const pdfBuffer = Buffer.from(await cloudinaryResponse.arrayBuffer());
    const fileName = pdfMetadata.pdfFileName || `yearly_report_${String(id).slice(0, 8)}.pdf`;

    res.setHeader("Content-Type", "application/pdf");
    res.setHeader("Content-Disposition", `attachment; filename="${fileName}"`);
    res.setHeader("Content-Length", pdfBuffer.length);
    return res.send(pdfBuffer);
  } catch (error) {
    console.error("[Yearly PDF] download failed:", error);
    return res.status(500).json({
      success: false,
      message: "Failed to download yearly report PDF",
      error: error.message,
    });
  }
};

const generateWealthPdfInBackground = async (reportRecord, userRequest, reportGenerationRequest = null) => {
  try {
    console.log("[Wealth PDF Background] Generating PDF...");
    const pdfBuffer = await generateWealthReportPDF(reportRecord.reportData, userRequest);

    console.log(`[Wealth PDF Background] Uploading to Cloudinary...`);
    const pdfMetadata = await uploadWealthPdfBuffer({
      reportRecord,
      pdfBuffer,
      userDetails: userRequest,
      userRequestId: userRequest.id,
    });

    if (reportGenerationRequest) {
      await reportGenerationRequest.update({
        status: "completed",
        pdfUrl: pdfMetadata.pdfUrl,
        pdfPublicId: pdfMetadata.pdfPublicId,
        pdfFileName: pdfMetadata.pdfFileName,
        pdfUploadedAt: pdfMetadata.pdfUploadedAt,
        completedAt: new Date(),
        metadata: {
          ...(reportGenerationRequest.metadata || {}),
          pdfGeneration: "uploaded",
        },
      });
      await notifyReportGenerationStatus(reportGenerationRequest, "completed");
    }

    console.log("[Wealth PDF Background] Successfully completed");
  } catch (error) {
    console.error(`[Wealth PDF Background] Failed for report ID: ${reportRecord.id}:`, error.message || error);
    if (reportGenerationRequest) {
      await reportGenerationRequest.update({
        status: "pdf_failed",
        error: error.message || String(error),
        completedAt: new Date(),
        metadata: {
          ...(reportGenerationRequest.metadata || {}),
          pdfGeneration: "failed",
        },
      });
      await notifyReportGenerationStatus(reportGenerationRequest, "pdf_failed");
    }
  }
};

const generateWealthKundaliReport = async (req, res) => {
  try {
    const userId = req.user.id;
    const {
      fullName,
      gender,
      dateOfbirth,
      timeOfbirth,
      placeOfBirth,
      latitude,
      longitude,
      userRequestId,
    } = req.body;

    if (!userRequestId && (!fullName || !gender || !dateOfbirth || !timeOfbirth || !placeOfBirth)) {
      return res.status(400).json({
        success: false,
        message: "Missing required fields (userRequestId or fullName, gender, dateOfbirth, timeOfbirth, placeOfBirth)",
      });
    }

    let reportPurchase = null;
    if (!isReportQueueWorkerMode(req)) {
      reportPurchase = await assertReportPurchaseAccess({
        userId,
        reportType: "wealth",
        accessToken: req.body.reportAccessToken,
      });
    }

    if (REPORT_QUEUE_ENABLED() && !isReportQueueWorkerMode(req)) {
      await markReportPurchaseConsumed(reportPurchase, {
        queuedReportType: "wealth_kundali",
      });
      return respondQueuedReport({
        req,
        res,
        reportType: "wealth_kundali",
        message: "Wealth report request queued. It will be processed by the scheduled report worker.",
      });
    }

    console.log("Received wealth report request");

    const userRequest = await findOrCreateUserRequestWithKundli({
      userId,
      userRequestId,
      fullName,
      gender,
      dateOfbirth,
      timeOfbirth,
      placeOfBirth,
      latitude,
      longitude,
    });

    if (reportPurchase) {
      await markReportPurchaseConsumed(reportPurchase, {
        userRequestId: userRequest.id,
      });
    }

    const timezone = req.body.timezone || "Asia/Kolkata";
    const lat = latitude ? parseFloat(latitude) : userRequest.latitude;
    const lng = longitude ? parseFloat(longitude) : userRequest.longitude;

    // Check if we have a WealthReport generated already for this request
    let reportRecord = await WealthReport.findOne({
      where: {
        userId,
        userRequestId: userRequest.id,
      },
    });

    let finalResponseData;
    let wealthKundli = null;
    let reportGenerationRequest = null;
    if (reportRecord) {
      finalResponseData = reportRecord.reportData;
      console.log(`[WealthReportController] Serving cached predictions`);
      if (!reportRecord.pdfUrl) {
        reportGenerationRequest = await saveReportGenerationRequest(req, {
          userId,
          userRequestId: userRequest.id,
          kundliId: userRequest.kundli?.id || null,
          reportType: "wealth_kundali",
          sourceType: "wealth_cached_pdf_generation",
          sourceId: reportRecord.id,
          status: "pdf_regenerating",
          price: 0,
          currency: "INR",
          inputTokens: 0,
          outputTokens: 0,
          totalTokens: 0,
          tokenUsage: { inputTokens: 0, outputTokens: 0, totalTokens: 0, skippedOpenAI: true },
          requestPayload: { reportId: reportRecord.id, userRequestId: userRequest.id },
          llmResponse: {},
          reportData: finalResponseData || {},
          startedAt: new Date(),
          metadata: { reason: "cached_wealth_report_missing_pdf" },
        });
        if (await handoffToPdfQueueIfWorker(req, reportGenerationRequest, reportRecord?.id || null)) {
          return res.status(202).json({
            success: true,
            queued: true,
            message: "Cached wealth report found. PDF generation queued.",
            report: {
              id: reportRecord?.id || null,
              reportRequestId: reportGenerationRequest?.id || null,
              status: "llm_completed",
            },
          });
        }
        generateWealthPdfInBackground(reportRecord, userRequest, reportGenerationRequest);
      }
    } else {
      // Reuse existing Kundli from DB if available, otherwise fetch and save it
      let kundli;
      if (userRequest.kundli) {
        kundli = userRequest.kundli.toJSON ? userRequest.kundli.toJSON() : userRequest.kundli;
      } else {
        // Generate Kundli data in parallel
        const [
          basicDetails,
          astroDetails,
          panchang,
          planetary,
          charts,
          dasha,
          yogini,
          manglikAnalysis,
          personality,
          gemstoneRemedies,
          rudrakshaSuggestion,
          ashtakavarga,
          transit,
          completeHoroscope,
        ] = await Promise.allSettled([
          getBasicDetails(userRequest),
          getAstroDetails(userRequest),
          getPanchang(userRequest),
          getPlanetaryPositions(userRequest),
          getAllCharts(userRequest),
          getVimshottariDasha(userRequest),
          getYoginiDasha(userRequest),
          getManglikAnalysis(userRequest),
          getAscendantReport(userRequest),
          getGemstoneRemedies(userRequest),
          getRudrakshaSuggestion(userRequest),
          getAshtakavarga(userRequest),
          getTransitChart(userRequest),
          getCompleteHoroscope(userRequest),
        ]);

        const extractValue = (result, name) => {
          if (result.status === "fulfilled") return result.value;
          console.error(`${name} failed:`, result.reason?.message || result.reason);
          return null;
        };

        const basicDetailsVal = extractValue(basicDetails, "Basic Details");
        const astroDetailsVal = extractValue(astroDetails, "Astro Details");
        const panchangVal = extractValue(panchang, "Panchang");
        const planetaryVal = extractValue(planetary, "Planetary");
        const chartsVal = extractValue(charts, "Charts");
        const dashaVal = extractValue(dasha, "Vimshottari Dasha");
        const yoginiVal = extractValue(yogini, "Yogini Dasha");
        const manglikAnalysisVal = extractValue(manglikAnalysis, "Manglik");
        const personalityVal = extractValue(personality, "Personality");
        const gemstones = extractValue(gemstoneRemedies, "Gemstones");
        const rudraksha = extractValue(rudrakshaSuggestion, "Rudraksha");
        const ashtakvargaData = extractValue(ashtakavarga, "Ashtakavarga");
        const transitVal = extractValue(transit, "Transit");
        const horoscope = extractValue(completeHoroscope, "Complete Horoscope");

        const ashtakvargaPayload = buildAshtakvargaPayload(
          ashtakvargaData,
          basicDetailsVal?.ascendant?.longitude ?? 0
        );

        let yogas = null;
        if (horoscope && Array.isArray(horoscope.yoga_analysis)) {
          yogas = horoscope.yoga_analysis.map((yoga) => ({
            name: yoga.name,
            type: yoga.type,
            strength: yoga.strength,
            description: yoga.description,
            effects: yoga.effects,
          }));
        }

        const finalHoroscope = (horoscope && typeof horoscope === "object") ? { ...horoscope } : {};
        if (transitVal) finalHoroscope.transit = transitVal;

        const kundliDataObj = {
          requestId: userRequest.id,
          basicDetails: basicDetailsVal,
          astroDetails: astroDetailsVal,
          manglikAnalysis: manglikAnalysisVal,
          panchang: panchangVal,
          charts: chartsVal,
          dasha: dashaVal,
          yogini: yoginiVal,
          personality: personalityVal,
          planetary: planetaryVal,
          remedies: { gemstones, rudraksha },
          ashtakvarga: ashtakvargaPayload,
          yogas,
          horoscope: finalHoroscope,
        };

        const createdKundli = await Kundli.create(kundliDataObj);
        kundli = createdKundli.toJSON ? createdKundli.toJSON() : createdKundli;
      }

      wealthKundli = kundli;
      finalResponseData = await generateWealthReport(kundli, userRequest);
      
      if (reportRecord) {
        await reportRecord.update({
          reportData: finalResponseData,
          generatedAt: new Date(),
          pdfUrl: null, // Reset as predictions have changed
        });
      } else {
        reportRecord = await WealthReport.create({
          userId,
          userRequestId: userRequest.id,
          reportData: finalResponseData,
          generatedAt: new Date(),
        });
      }

      reportGenerationRequest = await saveReportGenerationRequest(req, {
        userId,
        userRequestId: userRequest.id,
        kundliId: wealthKundli?.id || null,
        reportType: "wealth_kundali",
        sourceType: "wealth_kundli_report",
        sourceId: reportRecord.id,
        status: "llm_completed",
        price: WEALTH_REPORT_GENERATION_PRICE,
        currency: "INR",
        inputTokens: 0,
        outputTokens: 0,
        totalTokens: 0,
        tokenUsage: {
          inputTokens: 0,
          outputTokens: 0,
          totalTokens: 0,
          unavailableBecause: "wealth_service_llm_logic_left_unchanged",
        },
        requestPayload: {
          timezone,
          latitude: lat,
          longitude: lng,
          userRequestId: userRequest.id,
        },
        llmResponse: finalResponseData || {},
        reportData: finalResponseData || {},
        startedAt: new Date(),
        metadata: {
          pdfGeneration: "pending",
        },
      });

      console.log("[WealthReport][ReportRequest] LLM response saved successfully");

      if (await handoffToPdfQueueIfWorker(req, reportGenerationRequest, reportRecord?.id || null)) {
        return res.status(202).json({
          success: true,
          queued: true,
          message: "Wealth report LLM completed. PDF generation queued.",
          report: {
            id: reportRecord?.id || null,
            reportRequestId: reportGenerationRequest?.id || null,
            status: "llm_completed",
          },
        });
      }

      generateWealthPdfInBackground(reportRecord, userRequest, reportGenerationRequest);
    }

    if (!reportGenerationRequest) {
      reportGenerationRequest = await saveCachedReportGenerationRequestForWorker({
        req,
        userId,
        userRequest,
        reportRecord,
        reportType: "wealth_kundali",
        sourceType: "wealth_kundli_report",
        price: WEALTH_REPORT_GENERATION_PRICE,
        finalResponseData,
        kundliId: userRequest.kundli?.id || wealthKundli?.id || null,
        requestPayload: {
          ...(req.body || {}),
          userRequestId: userRequest.id,
          timezone,
          latitude: lat,
          longitude: lng,
        },
        llmResponse: finalResponseData || {},
        metadata: {
          reportKind: "wealth",
        },
      });
    }

    if (isReportQueueWorkerMode(req) && reportGenerationRequest?.pdfUrl) {
      return res.status(200).json({
        success: true,
        cached: true,
        message: "Wealth report already has a PDF. Queue request marked completed.",
        report: {
          id: reportRecord?.id || null,
          reportRequestId: reportGenerationRequest?.id || null,
          status: "completed",
          ...getStoredPdfMetadata(reportRecord),
        },
      });
    }

    if (await handoffToPdfQueueIfWorker(req, reportGenerationRequest, reportRecord?.id || null)) {
      return res.status(202).json({
        success: true,
        queued: true,
        message: "Wealth report LLM completed. PDF generation queued.",
        report: {
          id: reportRecord?.id || null,
          reportRequestId: reportGenerationRequest?.id || null,
          status: "llm_completed",
        },
      });
    }

    res.status(200).json({
      success: true,
      data: finalResponseData,
      report: {
        id: reportRecord?.id || null,
        reportRequestId: reportGenerationRequest?.id || null,
        ...getStoredPdfMetadata(reportRecord),
      },
    });
  } catch (error) {
    console.error("Error in generateWealthKundaliReport:", error);
    res.status(error.statusCode || 500).json({
      success: false,
      message: "Failed to generate wealth report",
      error: error.message,
    });
  }
};

const getWealthKundaliHistory = async (req, res) => {
  try {
    const userId = req.user.id;

    const reports = await WealthReport.findAll({
      where: { userId },
      include: [
        {
          model: UserRequest,
          as: "userRequest",
          required: true,
        },
      ],
      order: [["generatedAt", "DESC"]],
    });

    const formattedReports = reports.map((r) => ({
      id: r.id,
      userRequestId: r.userRequestId,
      status: r.pdfUrl ? "completed" : "generating",
      fullName: r.userRequest.fullName,
      dateOfbirth: r.userRequest.dateOfbirth,
      placeOfBirth: r.userRequest.placeOfBirth,
      timeOfbirth: r.userRequest.timeOfbirth,
      gender: r.userRequest.gender,
      createdAt: r.generatedAt,
      pdfUrl: r.pdfUrl || null,
      reportData: r.reportData || null,
    }));
    const queuedReports = await getQueuedReportHistoryItems({
      userId,
      reportType: "wealth_kundali",
      existingReports: formattedReports,
    });

    res.status(200).json({
      success: true,
      reports: [...queuedReports, ...formattedReports].sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime()),
    });
  } catch (error) {
    console.error("Error in getWealthKundaliHistory:", error);
    res.status(500).json({
      success: false,
      message: "Failed to fetch wealth report history",
      error: error.message,
    });
  }
};

const deleteWealthKundaliReport = async (req, res) => {
  try {
    const userId = req.user.id;
    const { id } = req.params;

    if (!id) {
      return res.status(400).json({
        success: false,
        message: "Report ID is required",
      });
    }

    const reportRecord = await WealthReport.findOne({
      where: { id, userId },
    });

    if (!reportRecord) {
      return res.status(404).json({
        success: false,
        message: "Report not found or you do not have permission to delete it",
      });
    }

    await reportRecord.destroy();

    return res.status(200).json({
      success: true,
      message: "Report deleted successfully",
    });
  } catch (error) {
    console.error("Error deleting wealth kundali report:", error);
    return res.status(500).json({
      success: false,
      message: "Failed to delete report",
      error: error.message,
    });
  }
};

const getWealthReportRecordForUser = async ({ userId, reportId }) => {
  return WealthReport.findOne({
    where: { id: reportId, userId },
    include: [
      {
        model: UserRequest,
        as: "userRequest",
        required: true,
      },
    ],
  });
};

const buildWealthUserDetailsFromRecord = (reportRecord) => ({
  id: reportRecord.userRequest.id,
  userId: reportRecord.userId,
  fullName: reportRecord.userRequest.fullName,
  gender: reportRecord.userRequest.gender,
  dateOfbirth: reportRecord.userRequest.dateOfbirth,
  timeOfbirth: reportRecord.userRequest.timeOfbirth,
  placeOfBirth: reportRecord.userRequest.placeOfBirth,
  latitude: reportRecord.userRequest.latitude,
  longitude: reportRecord.userRequest.longitude,
});

const uploadSadeSatiPdfBuffer = async ({ reportRecord, pdfBuffer, userRequest }) => {
  if (!reportRecord || !pdfBuffer) {
    return getStoredPdfMetadata(reportRecord);
  }

  const safeName = (userRequest.fullName ?? "sadesati_report").replace(/s+/g, "_");
  const fileName = `sadesati_report_${safeName}_${Date.now()}.pdf`;
  const uploadResult = await uploadPdfBuffer({
    buffer: pdfBuffer,
    fileName,
    folder: "graho/sadesati-reports",
  });

  await reportRecord.update({
    pdfUrl: uploadResult.secure_url,
    pdfPublicId: uploadResult.public_id,
    pdfFileName: fileName,
    pdfUploadedAt: uploadResult.created_at ? new Date(uploadResult.created_at) : new Date(),
  });

  return getStoredPdfMetadata(reportRecord);
};

const regenerateWealthReportPdf = async (req, res) => {
  try {
    const userId = req.user.id;
    const { id } = req.params;

    const reportRecord = await getWealthReportRecordForUser({ userId, reportId: id });
    if (!reportRecord) {
      return res.status(404).json({
        success: false,
        message: "Wealth report not found or you do not have permission to access it",
      });
    }

    if (!reportRecord.reportData) {
      return res.status(409).json({
        success: false,
        message: "Stored wealth report data is not available for PDF regeneration",
      });
    }

    const userDetails = buildWealthUserDetailsFromRecord(reportRecord);
    const reportRequest = await ReportGenerationRequest.create({
      userId,
      userRequestId: reportRecord.userRequestId,
      kundliId: null,
      reportType: "wealth_kundali",
      sourceType: "wealth_temp_regen",
      sourceId: reportRecord.id,
      status: "pdf_regenerating",
      price: 0,
      currency: "INR",
      inputTokens: 0,
      outputTokens: 0,
      totalTokens: 0,
      tokenUsage: { inputTokens: 0, outputTokens: 0, totalTokens: 0, skippedOpenAI: true },
      requestPayload: { reportId: reportRecord.id, userRequestId: reportRecord.userRequestId },
      llmResponse: {},
      reportData: reportRecord.reportData,
      startedAt: new Date(),
      metadata: { reason: "temporary_pdf_regeneration_from_stored_wealth_data" },
    });

    const pdfBuffer = await generateWealthReportPDF(reportRecord.reportData, userDetails);
    const pdfMetadata = await uploadWealthPdfBuffer({
      reportRecord,
      pdfBuffer,
      userDetails,
      userRequestId: reportRecord.userRequestId,
    });

    await reportRequest.update({
      status: "completed",
      pdfUrl: pdfMetadata.pdfUrl,
      pdfPublicId: pdfMetadata.pdfPublicId,
      pdfFileName: pdfMetadata.pdfFileName,
      pdfUploadedAt: pdfMetadata.pdfUploadedAt,
      completedAt: new Date(),
    });

    console.log("[Wealth PDF] regenerated from stored data successfully");

    return res.status(200).json({
      success: true,
      message: "Wealth report PDF regenerated from stored data",
      reportRequestId: reportRequest.id,
      ...pdfMetadata,
    });
  } catch (error) {
    console.error("[Wealth PDF] regenerate failed:", error);
    return res.status(500).json({
      success: false,
      message: "Failed to regenerate wealth report PDF",
      error: error.message,
    });
  }
};

const downloadWealthReportPdf = async (req, res) => {
  try {
    const userId = req.user.id;
    const { id } = req.params;

    const reportRecord = await getWealthReportRecordForUser({ userId, reportId: id });
    if (!reportRecord) {
      return res.status(404).json({
        success: false,
        message: "Wealth report not found or you do not have permission to access it",
      });
    }

    let pdfMetadata = getStoredPdfMetadata(reportRecord);
    if (!pdfMetadata.pdfUrl) {
      if (!reportRecord.reportData) {
        return res.status(409).json({
          success: false,
          message: "Stored wealth report data is not available for PDF generation",
        });
      }

      const userDetails = buildWealthUserDetailsFromRecord(reportRecord);
      const pdfBuffer = await generateWealthReportPDF(reportRecord.reportData, userDetails);
      pdfMetadata = await uploadWealthPdfBuffer({
        reportRecord,
        pdfBuffer,
        userDetails,
        userRequestId: reportRecord.userRequestId,
      });
    }

    const cloudinaryResponse = await fetch(pdfMetadata.pdfUrl);
    if (!cloudinaryResponse.ok) {
      throw new Error(`Cloudinary PDF fetch failed with status ${cloudinaryResponse.status}`);
    }

    const pdfBuffer = Buffer.from(await cloudinaryResponse.arrayBuffer());
    const fileName = pdfMetadata.pdfFileName || `wealth_report_${String(id).slice(0, 8)}.pdf`;

    res.setHeader("Content-Type", "application/pdf");
    res.setHeader("Content-Disposition", `attachment; filename="${fileName}"`);
    res.setHeader("Content-Length", pdfBuffer.length);
    return res.send(pdfBuffer);
  } catch (error) {
    console.error("[Wealth PDF] download failed:", error);
    return res.status(500).json({
      success: false,
      message: "Failed to download wealth report PDF",
      error: error.message,
    });
  }
};





const getSadeSatiKundaliHistory = async (req, res) => {
  try {
    const userId = req.user.id;

    const reports = await SadeSatiReport.findAll({
      where: { userId },
      include: [
        {
          model: UserRequest,
          as: "userRequest",
          required: true,
        },
      ],
      order: [["generatedAt", "DESC"]],
    });

    const formattedReports = reports.map((r) => ({
      id: r.id,
      userRequestId: r.userRequestId,
      status: r.pdfUrl ? "completed" : "generating",
      fullName: r.userRequest.fullName,
      dateOfbirth: r.userRequest.dateOfbirth,
      placeOfBirth: r.userRequest.placeOfBirth,
      timeOfbirth: r.userRequest.timeOfbirth,
      gender: r.userRequest.gender,
      createdAt: r.generatedAt,
      pdfUrl: r.pdfUrl || null,
      reportData: r.reportData || null,
    }));
    const queuedReports = await getQueuedReportHistoryItems({
      userId,
      reportType: "sade_sati_kundali",
      existingReports: formattedReports,
    });

    res.status(200).json({
      success: true,
      reports: [...queuedReports, ...formattedReports].sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime()),
    });
  } catch (error) {
    console.error("Error in getSadeSatiKundaliHistory:", error);
    res.status(500).json({
      success: false,
      message: "Failed to fetch Sade Sati report history",
      error: error.message,
    });
  }
};

const deleteSadeSatiKundaliReport = async (req, res) => {
  try {
    const userId = req.user.id;
    const { id } = req.params;

    if (!id) {
      return res.status(400).json({
        success: false,
        message: "Report ID is required",
      });
    }

    const reportRecord = await SadeSatiReport.findOne({
      where: { id, userId },
    });

    if (!reportRecord) {
      return res.status(404).json({
        success: false,
        message: "Report not found or you do not have permission to delete it",
      });
    }

    await reportRecord.destroy();

    return res.status(200).json({
      success: true,
      message: "Report deleted successfully",
    });
  } catch (error) {
    console.error("Error deleting Sade Sati report:", error);
    return res.status(500).json({
      success: false,
      message: "Failed to delete report",
      error: error.message,
    });
  }
};

const generateQueuedReportPdf = async (reportGenerationRequest) => {
  if (!reportGenerationRequest?.sourceId) {
    throw new Error("Queued PDF job is missing sourceId");
  }

  let reportRecord;
  let userDetails;
  let pdfBuffer;
  let pdfMetadata;

  if (reportGenerationRequest.reportType === "yearly_kundali") {
    reportRecord = await getYearlyReportRecordForUser({
      userId: reportGenerationRequest.userId,
      reportId: reportGenerationRequest.sourceId,
    });
    if (!reportRecord?.reportData) throw new Error("Yearly report data not found for queued PDF");
    userDetails = buildYearlyUserDetailsFromRecord(reportRecord);
    pdfBuffer = await generateYearlyReportPDF(reportRecord.reportData, userDetails);
    pdfMetadata = await uploadYearlyPdfBuffer({
      reportRecord,
      pdfBuffer,
      userDetails,
      userRequestId: reportRecord.userRequestId,
    });
  } else if (reportGenerationRequest.reportType === "wealth_kundali") {
    reportRecord = await getWealthReportRecordForUser({
      userId: reportGenerationRequest.userId,
      reportId: reportGenerationRequest.sourceId,
    });
    if (!reportRecord?.reportData) throw new Error("Wealth report data not found for queued PDF");
    userDetails = buildWealthUserDetailsFromRecord(reportRecord);
    pdfBuffer = await generateWealthReportPDF(reportRecord.reportData, userDetails);
    pdfMetadata = await uploadWealthPdfBuffer({
      reportRecord,
      pdfBuffer,
      userDetails,
      userRequestId: reportRecord.userRequestId,
    });
  } else if (reportGenerationRequest.reportType === "sade_sati_kundali") {
    reportRecord = await SadeSatiReport.findOne({
      where: { id: reportGenerationRequest.sourceId, userId: reportGenerationRequest.userId },
      include: [{ model: UserRequest, as: "userRequest", required: true }],
    });
    if (!reportRecord?.reportData) throw new Error("Sade Sati report data not found for queued PDF");
    pdfBuffer = await generateSadeSatiReportPDF(reportRecord.reportData, reportRecord.userRequest);
    pdfMetadata = await uploadSadeSatiPdfBuffer({
      reportRecord,
      pdfBuffer,
      userRequest: reportRecord.userRequest,
    });
  } else if (reportGenerationRequest.reportType === "compatibility_kundali") {
    reportRecord = await CompatibilityReport.findOne({
      where: { id: reportGenerationRequest.sourceId, userId: reportGenerationRequest.userId },
    });
    if (!reportRecord?.reportData) throw new Error("Compatibility report data not found for queued PDF");
    pdfBuffer = await generateCompatibilityReportPDF(reportRecord);
    pdfMetadata = await uploadCompatibilityPdfBuffer({
      reportRecord,
      pdfBuffer,
      userRequest: null,
    });
  } else if (reportGenerationRequest.reportType === "health_kundali") {
    reportRecord = await HealthReport.findOne({
      where: { id: reportGenerationRequest.sourceId, userId: reportGenerationRequest.userId },
      include: [{ model: UserRequest, as: "userRequest", required: true }],
    });
    if (!reportRecord?.reportData) throw new Error("Health report data not found for queued PDF");
    pdfBuffer = await generateHealthReportPDF(reportRecord.reportData, reportRecord.userRequest);
    pdfMetadata = await uploadHealthPdfBuffer({
      reportRecord,
      pdfBuffer,
      userRequest: reportRecord.userRequest,
    });
  } else if (reportGenerationRequest.reportType === "love_relationship_kundali") {
    reportRecord = await LoveRelationshipReport.findOne({
      where: { id: reportGenerationRequest.sourceId, userId: reportGenerationRequest.userId },
      include: [{ model: UserRequest, as: "userRequest", required: true }],
    });
    if (!reportRecord?.reportData) throw new Error("Love Relationship report data not found for queued PDF");
    pdfBuffer = await generateLoveRelationshipReportPDF(reportRecord.reportData, reportRecord.userRequest);
    pdfMetadata = await uploadLoveRelationshipPdfBuffer({
      reportRecord,
      pdfBuffer,
      userRequest: reportRecord.userRequest,
    });
  } else if (reportGenerationRequest.reportType === "palmistry") {
    pdfMetadata = await generateQueuedPalmPdf(reportGenerationRequest);
    await markPalmJobCompletedAfterPdf({
      jobId: reportGenerationRequest.metadata?.jobId || null,
      userId: reportGenerationRequest.userId,
    });
  } else {
    throw new Error(`Unsupported queued PDF report type: ${reportGenerationRequest.reportType}`);
  }

  await reportGenerationRequest.update({
    status: "completed",
    pdfUrl: pdfMetadata?.pdfUrl || null,
    pdfPublicId: pdfMetadata?.pdfPublicId || null,
    pdfFileName: pdfMetadata?.pdfFileName || null,
    pdfUploadedAt: pdfMetadata?.pdfUploadedAt || null,
    completedAt: new Date(),
    metadata: {
      ...(reportGenerationRequest.metadata || {}),
      processingStatus: "completed",
      pdfGeneration: pdfMetadata?.pdfUrl ? "uploaded" : "skipped",
      pdfCompletedAt: new Date().toISOString(),
    },
  });
  await notifyReportGenerationStatus(reportGenerationRequest, "completed");

  return pdfMetadata;
};




// SADE SATI
const generateSadeSatiPdfInBackground = async (reportRecord, userRequest, reportGenerationRequest = null) => {
  try {
    console.log("[Sade Sati PDF Background] Generating PDF...");
    const pdfBuffer = await generateSadeSatiReportPDF(reportRecord.reportData, userRequest);
    const safeName = (userRequest.fullName ?? "sadesati_report").replace(/s+/g, "_");
    const fileName = `sadesati_report_${safeName}_${Date.now()}.pdf`;
    console.log(`[Sade Sati PDF Background] Uploading to Cloudinary...`);
    const uploadResult = await uploadPdfBuffer({ buffer: pdfBuffer, fileName, folder: "graho/sadesati-reports" });
    
    await reportRecord.update({
      pdfUrl: uploadResult.secure_url,
      pdfPublicId: uploadResult.public_id,
      pdfFileName: fileName,
      pdfUploadedAt: new Date(),
    });

    if (reportGenerationRequest) {
      await reportGenerationRequest.update({
        status: "completed",
        pdfUrl: uploadResult.secure_url,
        pdfPublicId: uploadResult.public_id,
        pdfFileName: fileName,
        pdfUploadedAt: new Date(),
        completedAt: new Date(),
        metadata: { ...(reportGenerationRequest.metadata || {}), pdfGeneration: "uploaded" },
      });
      await notifyReportGenerationStatus(reportGenerationRequest, "completed");
    }
    console.log("[Sade Sati PDF Background] Successfully completed");
  } catch (error) {
    console.error(`[Sade Sati PDF Background] Failed for report ID: ${reportRecord.id}:`, error.message || error);
    if (reportGenerationRequest) {
      await reportGenerationRequest.update({
        status: "pdf_failed",
        error: error.message || String(error),
        completedAt: new Date(),
        metadata: { ...(reportGenerationRequest.metadata || {}), pdfGeneration: "failed" },
      });
      await notifyReportGenerationStatus(reportGenerationRequest, "pdf_failed");
    }
  }
};

const generateSadeSatiKundaliReport = async (req, res) => {
  try {
    const userId = req.user.id;
    const { fullName, gender, dateOfbirth, timeOfbirth, placeOfBirth, latitude, longitude, userRequestId } = req.body;
    
    let reportPurchase = null;
    if (!isReportQueueWorkerMode(req)) {
      reportPurchase = await assertReportPurchaseAccess({ userId, reportType: "sade-sati", accessToken: req.body.reportAccessToken });
    }

    if (REPORT_QUEUE_ENABLED() && !isReportQueueWorkerMode(req)) {
      await markReportPurchaseConsumed(reportPurchase, { queuedReportType: "sade_sati_kundali" });
      return respondQueuedReport({ req, res, reportType: "sade_sati_kundali", message: "Sade Sati report request queued. It will be processed by the scheduled report worker." });
    }

    const userRequest = await findOrCreateUserRequestWithKundli({ userId, userRequestId, fullName, gender, dateOfbirth, timeOfbirth, placeOfBirth, latitude, longitude });
    if (reportPurchase) await markReportPurchaseConsumed(reportPurchase, { userRequestId: userRequest.id });

    let reportRecord = await SadeSatiReport.findOne({ where: { userId, userRequestId: userRequest.id } });
    let finalResponseData;
    let reportGenerationRequest = null;
    
    if (reportRecord) {
      finalResponseData = reportRecord.reportData;
      if (!reportRecord.pdfUrl) {
        reportGenerationRequest = await saveReportGenerationRequest(req, {
          userId, userRequestId: userRequest.id, kundliId: userRequest.kundli?.id || null, reportType: "sade_sati_kundali",
          sourceType: "sade_sati_cached_pdf_generation", sourceId: reportRecord.id, status: "llm_completed",
          price: Number(process.env.SADE_SATI_REPORT_GENERATION_PRICE || 0), currency: "INR",
          requestPayload: { reportId: reportRecord.id, userRequestId: userRequest.id }, llmResponse: {}, reportData: finalResponseData || {},
          startedAt: new Date(), metadata: { reason: "cached_sade_sati_report_missing_pdf", pdfGeneration: "pending" },
        });
        if (await handoffToPdfQueueIfWorker(req, reportGenerationRequest, reportRecord?.id || null)) {
          return res.status(202).json({ success: true, queued: true, message: "Cached Sade Sati report found. PDF generation queued.", report: { id: reportRecord?.id || null, reportRequestId: reportGenerationRequest?.id || null, status: "llm_completed" } });
        }
        generateSadeSatiPdfInBackground(reportRecord, userRequest, reportGenerationRequest);
      }
    } else {
      let kundli;
      if (userRequest.kundli) {
        kundli = userRequest.kundli.toJSON ? userRequest.kundli.toJSON() : userRequest.kundli;
      } else {
        const [
          basicDetails,
          astroDetails,
          panchang,
          planetary,
          charts,
          dasha,
          yogini,
          manglikAnalysis,
          personality,
          gemstoneRemedies,
          rudrakshaSuggestion,
          ashtakavarga,
          transit,
          completeHoroscope,
        ] = await Promise.allSettled([
          getBasicDetails(userRequest),
          getAstroDetails(userRequest),
          getPanchang(userRequest),
          getPlanetaryPositions(userRequest),
          getAllCharts(userRequest),
          getVimshottariDasha(userRequest),
          getYoginiDasha(userRequest),
          getManglikAnalysis(userRequest),
          getAscendantReport(userRequest),
          getGemstoneRemedies(userRequest),
          getRudrakshaSuggestion(userRequest),
          getAshtakavarga(userRequest),
          getTransitChart(userRequest),
          getCompleteHoroscope(userRequest),
        ]);

        const extractValue = (result, name) => {
          if (result.status === "fulfilled") return result.value;
          console.error(`${name} failed:`, result.reason?.message || result.reason);
          return null;
        };

        const basicDetailsVal = extractValue(basicDetails, "Basic Details");
        const astroDetailsVal = extractValue(astroDetails, "Astro Details");
        const panchangVal = extractValue(panchang, "Panchang");
        const planetaryVal = extractValue(planetary, "Planetary");
        const chartsVal = extractValue(charts, "Charts");
        const dashaVal = extractValue(dasha, "Vimshottari Dasha");
        const yoginiVal = extractValue(yogini, "Yogini Dasha");
        const manglikAnalysisVal = extractValue(manglikAnalysis, "Manglik");
        const personalityVal = extractValue(personality, "Personality");
        const gemstones = extractValue(gemstoneRemedies, "Gemstones");
        const rudraksha = extractValue(rudrakshaSuggestion, "Rudraksha");
        const ashtakvargaData = extractValue(ashtakavarga, "Ashtakavarga");
        const transitVal = extractValue(transit, "Transit");
        const horoscope = extractValue(completeHoroscope, "Complete Horoscope");

        const ashtakvargaPayload = buildAshtakvargaPayload(
          ashtakvargaData,
          basicDetailsVal?.ascendant?.longitude ?? 0
        );

        let yogas = null;
        if (horoscope && Array.isArray(horoscope.yoga_analysis)) {
          yogas = horoscope.yoga_analysis.map((yoga) => ({
            name: yoga.name,
            type: yoga.type,
            strength: yoga.strength,
            description: yoga.description,
            effects: yoga.effects,
          }));
        }

        const finalHoroscope = (horoscope && typeof horoscope === "object") ? { ...horoscope } : {};
        if (transitVal) finalHoroscope.transit = transitVal;

        const kundliDataObj = {
          requestId: userRequest.id,
          basicDetails: basicDetailsVal,
          astroDetails: astroDetailsVal,
          manglikAnalysis: manglikAnalysisVal,
          panchang: panchangVal,
          charts: chartsVal,
          dasha: dashaVal,
          yogini: yoginiVal,
          personality: personalityVal,
          planetary: planetaryVal,
          remedies: { gemstones, rudraksha },
          ashtakvarga: ashtakvargaPayload,
          yogas,
          horoscope: finalHoroscope,
        };

        const createdKundli = await Kundli.create(kundliDataObj);
        kundli = createdKundli.toJSON ? createdKundli.toJSON() : createdKundli;
        userRequest.kundli = createdKundli;
      }
      finalResponseData = await generateSadeSatiReport(kundli || {}, userRequest);
      reportRecord = await SadeSatiReport.create({ userId, userRequestId: userRequest.id, reportData: finalResponseData, generatedAt: new Date() });
      
      reportGenerationRequest = await saveReportGenerationRequest(req, {
        userId, userRequestId: userRequest.id, kundliId: userRequest.kundli?.id || null, reportType: "sade_sati_kundali",
        sourceType: "sade_sati_kundli_report", sourceId: reportRecord.id, status: "llm_completed",
        price: Number(process.env.SADE_SATI_REPORT_GENERATION_PRICE || 0), currency: "INR",
        requestPayload: { userRequestId: userRequest.id }, llmResponse: finalResponseData || {}, reportData: finalResponseData || {},
        startedAt: new Date(), metadata: { pdfGeneration: "pending" },
      });
      if (await handoffToPdfQueueIfWorker(req, reportGenerationRequest, reportRecord?.id || null)) {
        return res.status(202).json({ success: true, queued: true, message: "Sade Sati report LLM completed. PDF generation queued.", report: { id: reportRecord?.id || null, reportRequestId: reportGenerationRequest?.id || null, status: "llm_completed" } });
      }
      generateSadeSatiPdfInBackground(reportRecord, userRequest, reportGenerationRequest);
    }

    if (!reportGenerationRequest) reportGenerationRequest = await saveCachedReportGenerationRequestForWorker({ req, userId, userRequest, reportRecord, reportType: "sade_sati_kundali", sourceType: "sade_sati_kundli_report", price: Number(process.env.SADE_SATI_REPORT_GENERATION_PRICE || 0), finalResponseData, kundliId: userRequest.kundli?.id || null, requestPayload: { ...(req.body || {}), userRequestId: userRequest.id }, llmResponse: finalResponseData || {}, metadata: { reportKind: "sade_sati" } });
    if (isReportQueueWorkerMode(req)) return res.status(200).json({ success: true, worker_processed: true, message: "Report generated successfully via worker", reportRequestId: reportGenerationRequest?.id, reportRecordId: reportRecord?.id });
    
    return res.status(200).json({ success: true, report: { id: reportRecord.id, pdfUrl: reportRecord.pdfUrl, pdfFileName: reportRecord.pdfFileName, pdfPublicId: reportRecord.pdfPublicId, status: "completed" } });
  } catch (error) {
    console.error("[generateSadeSatiKundaliReport] ERROR:", error);
    res.status(500).json({ success: false, message: error.message });
  }
};

// COMPATIBILITY
const generateCompatibilityPdfInBackground = async (reportRecord, userRequest, reportGenerationRequest = null) => {
  try {
    const pdfBuffer = await generateCompatibilityReportPDF(reportRecord);
    const fileName = `compatibility_report_${Date.now()}.pdf`;
    const uploadResult = await uploadPdfBuffer({ buffer: pdfBuffer, fileName, folder: "graho/compatibility-reports" });
    
    await reportRecord.update({ pdfUrl: uploadResult.secure_url, pdfPublicId: uploadResult.public_id, pdfFileName: fileName, pdfUploadedAt: new Date() });

    if (reportGenerationRequest) {
      await reportGenerationRequest.update({
        status: "completed", pdfUrl: uploadResult.secure_url, pdfPublicId: uploadResult.public_id, pdfFileName: fileName, pdfUploadedAt: new Date(),
        completedAt: new Date(), metadata: { ...(reportGenerationRequest.metadata || {}), pdfGeneration: "uploaded" },
      });
      await notifyReportGenerationStatus(reportGenerationRequest, "completed");
    }
  } catch (error) {
    if (reportGenerationRequest) {
      await reportGenerationRequest.update({ status: "pdf_failed", error: error.message || String(error), completedAt: new Date(), metadata: { ...(reportGenerationRequest.metadata || {}), pdfGeneration: "failed" } });
      await notifyReportGenerationStatus(reportGenerationRequest, "pdf_failed");
    }
  }
};

const generateCompatibilityKundaliReport = async (req, res) => {
  try {
    const userId = req.user.id;
    const { boy, girl, reportAccessToken } = req.body;
    
    if (!boy || !girl) {
      throw new Error("Missing partner details. This is likely an older, incomplete request payload.");
    }

    let reportPurchase = null;
    if (!isReportQueueWorkerMode(req)) {
      reportPurchase = await assertReportPurchaseAccess({ userId, reportType: "compatibility", accessToken: reportAccessToken });
    }

    if (REPORT_QUEUE_ENABLED() && !isReportQueueWorkerMode(req)) {
      await markReportPurchaseConsumed(reportPurchase, { queuedReportType: "compatibility_kundali" });
      return respondQueuedReport({ req, res, reportType: "compatibility_kundali", message: "Compatibility report request queued." });
    }

    if (reportPurchase) await markReportPurchaseConsumed(reportPurchase, { metadata: { boyName: boy.fullName, girlName: girl.fullName } });

    let finalResponseData = await generateCompatibilityReport(req.body, { userId });
    
    let reportRecord = await CompatibilityReport.create({ 
      userId, 
      boyName: boy.fullName,
      boyDateOfBirth: boy.dateOfbirth,
      boyTimeOfBirth: boy.timeOfbirth,
      boyPlaceOfBirth: boy.placeOfBirth,
      boyLatitude: boy.latitude,
      boyLongitude: boy.longitude,
      girlName: girl.fullName,
      girlDateOfBirth: girl.dateOfbirth,
      girlTimeOfBirth: girl.timeOfbirth,
      girlPlaceOfBirth: girl.placeOfBirth,
      girlLatitude: girl.latitude,
      girlLongitude: girl.longitude,
      reportData: finalResponseData 
    });
      
    let reportGenerationRequest = await saveReportGenerationRequest(req, {
      userId, userRequestId: null, kundliId: null, reportType: "compatibility_kundali",
      sourceType: "compatibility_report", sourceId: reportRecord.id, status: "llm_completed",
      price: 0, currency: "INR", requestPayload: req.body, llmResponse: finalResponseData || {}, reportData: finalResponseData || {},
      startedAt: new Date(), metadata: { pdfGeneration: "pending" },
    });
    
    if (await handoffToPdfQueueIfWorker(req, reportGenerationRequest, reportRecord?.id || null)) return res.status(202).json({ success: true, queued: true });
    
    // Background PDF generation
    generateCompatibilityPdfInBackground(reportRecord, { userId }, reportGenerationRequest);
    
    if (!reportGenerationRequest) reportGenerationRequest = await saveCachedReportGenerationRequestForWorker({ req, userId, userRequest: { userId }, reportRecord, reportType: "compatibility_kundali", sourceType: "compatibility_report", price: 0, finalResponseData, kundliId: null, requestPayload: req.body, llmResponse: finalResponseData || {}, metadata: {} });
    if (isReportQueueWorkerMode(req)) return res.status(200).json({ success: true, worker_processed: true });
    
    return res.status(200).json({ success: true, report: { id: reportRecord.id, pdfUrl: reportRecord.pdfUrl, pdfFileName: reportRecord.pdfFileName, pdfPublicId: reportRecord.pdfPublicId, status: "completed" } });
  } catch (error) {
    console.error("[generateCompatibilityKundaliReport] ERROR:", error);
    res.status(500).json({ success: false, message: error.message });
  }
};

// HEALTH
const generateHealthPdfInBackground = async (reportRecord, userRequest, reportGenerationRequest = null) => {
  try {
    const pdfBuffer = await generateHealthReportPDF(reportRecord.reportData, userRequest);
    const fileName = `health_report_${Date.now()}.pdf`;
    const uploadResult = await uploadPdfBuffer({ buffer: pdfBuffer, fileName, folder: "graho/health-reports" });
    
    await reportRecord.update({ pdfUrl: uploadResult.secure_url, pdfPublicId: uploadResult.public_id, pdfFileName: fileName, pdfUploadedAt: new Date() });

    if (reportGenerationRequest) {
      await reportGenerationRequest.update({
        status: "completed", pdfUrl: uploadResult.secure_url, pdfPublicId: uploadResult.public_id, pdfFileName: fileName, pdfUploadedAt: new Date(),
        completedAt: new Date(), metadata: { ...(reportGenerationRequest.metadata || {}), pdfGeneration: "uploaded" },
      });
      await notifyReportGenerationStatus(reportGenerationRequest, "completed");
    }
  } catch (error) {
    if (reportGenerationRequest) {
      await reportGenerationRequest.update({ status: "pdf_failed", error: error.message || String(error), completedAt: new Date(), metadata: { ...(reportGenerationRequest.metadata || {}), pdfGeneration: "failed" } });
      await notifyReportGenerationStatus(reportGenerationRequest, "pdf_failed");
    }
  }
};

const generateHealthKundaliReport = async (req, res) => {
  try {
    const userId = req.user.id;
    const { userRequestId, fullName, gender, dateOfbirth, timeOfbirth, placeOfBirth, latitude, longitude } = req.body;
    
    let reportPurchase = null;
    if (!isReportQueueWorkerMode(req)) {
      reportPurchase = await assertReportPurchaseAccess({ userId, reportType: "health", accessToken: req.body.reportAccessToken });
    }

    if (REPORT_QUEUE_ENABLED() && !isReportQueueWorkerMode(req)) {
      await markReportPurchaseConsumed(reportPurchase, { queuedReportType: "health_kundali" });
      return respondQueuedReport({ req, res, reportType: "health_kundali", message: "Health report request queued." });
    }

    const userRequest = await findOrCreateUserRequestWithKundli({ userId, userRequestId, fullName, gender, dateOfbirth, timeOfbirth, placeOfBirth, latitude, longitude });
    if (reportPurchase) await markReportPurchaseConsumed(reportPurchase, { userRequestId: userRequest.id });

    let reportRecord = await HealthReport.findOne({ where: { userId, userRequestId: userRequest.id } });
    let finalResponseData;
    let reportGenerationRequest = null;
    
    if (reportRecord) {
      finalResponseData = reportRecord.reportData;
      if (!reportRecord.pdfUrl) {
        reportGenerationRequest = await saveReportGenerationRequest(req, {
          userId, userRequestId: userRequest.id, kundliId: userRequest.kundli?.id || null, reportType: "health_kundali",
          sourceType: "health_cached_pdf", sourceId: reportRecord.id, status: "llm_completed",
          price: 0, currency: "INR", requestPayload: { reportId: reportRecord.id }, llmResponse: {}, reportData: finalResponseData || {},
          startedAt: new Date(), metadata: { reason: "cached_pdf_missing", pdfGeneration: "pending" },
        });
        if (await handoffToPdfQueueIfWorker(req, reportGenerationRequest, reportRecord?.id || null)) return res.status(202).json({ success: true, queued: true });
        generateHealthPdfInBackground(reportRecord, userRequest, reportGenerationRequest);
      }
    } else {
      let kundli = userRequest.kundli?.toJSON ? userRequest.kundli.toJSON() : userRequest.kundli;
      finalResponseData = await generateHealthReport(kundli || {}, userRequest);
      reportRecord = await HealthReport.create({ userId, userRequestId: userRequest.id, reportData: finalResponseData });
      
      reportGenerationRequest = await saveReportGenerationRequest(req, {
        userId, userRequestId: userRequest.id, kundliId: userRequest.kundli?.id || null, reportType: "health_kundali",
        sourceType: "health_report", sourceId: reportRecord.id, status: "llm_completed",
        price: 0, currency: "INR", requestPayload: { userRequestId: userRequest.id }, llmResponse: finalResponseData || {}, reportData: finalResponseData || {},
        startedAt: new Date(), metadata: { pdfGeneration: "pending" },
      });
      if (await handoffToPdfQueueIfWorker(req, reportGenerationRequest, reportRecord?.id || null)) return res.status(202).json({ success: true, queued: true });
      generateHealthPdfInBackground(reportRecord, userRequest, reportGenerationRequest);
    }

    if (!reportGenerationRequest) reportGenerationRequest = await saveCachedReportGenerationRequestForWorker({ req, userId, userRequest, reportRecord, reportType: "health_kundali", sourceType: "health_report", price: 0, finalResponseData, kundliId: userRequest.kundli?.id || null, requestPayload: { userRequestId: userRequest.id }, llmResponse: finalResponseData || {}, metadata: {} });
    if (isReportQueueWorkerMode(req)) return res.status(200).json({ success: true, worker_processed: true });
    
    return res.status(200).json({ success: true, report: { id: reportRecord.id, pdfUrl: reportRecord.pdfUrl, pdfFileName: reportRecord.pdfFileName, pdfPublicId: reportRecord.pdfPublicId, status: "completed" } });
  } catch (error) {
    console.error("[generateHealthKundaliReport] ERROR:", error);
    res.status(500).json({ success: false, message: error.message });
  }
};

// LOVE RELATIONSHIP
const generateLoveRelationshipPdfInBackground = async (reportRecord, userRequest, reportGenerationRequest = null) => {
  try {
    const pdfBuffer = await generateLoveRelationshipReportPDF(reportRecord.reportData, userRequest);
    const fileName = `love_report_${Date.now()}.pdf`;
    const uploadResult = await uploadPdfBuffer({ buffer: pdfBuffer, fileName, folder: "graho/love-reports" });
    
    await reportRecord.update({ pdfUrl: uploadResult.secure_url, pdfPublicId: uploadResult.public_id, pdfFileName: fileName, pdfUploadedAt: new Date() });

    if (reportGenerationRequest) {
      await reportGenerationRequest.update({
        status: "completed", pdfUrl: uploadResult.secure_url, pdfPublicId: uploadResult.public_id, pdfFileName: fileName, pdfUploadedAt: new Date(),
        completedAt: new Date(), metadata: { ...(reportGenerationRequest.metadata || {}), pdfGeneration: "uploaded" },
      });
      await notifyReportGenerationStatus(reportGenerationRequest, "completed");
    }
  } catch (error) {
    if (reportGenerationRequest) {
      await reportGenerationRequest.update({ status: "pdf_failed", error: error.message || String(error), completedAt: new Date(), metadata: { ...(reportGenerationRequest.metadata || {}), pdfGeneration: "failed" } });
      await notifyReportGenerationStatus(reportGenerationRequest, "pdf_failed");
    }
  }
};

const generateLoveRelationshipKundaliReport = async (req, res) => {
  try {
    const userId = req.user.id;
    const { userRequestId, fullName, gender, dateOfbirth, timeOfbirth, placeOfBirth, latitude, longitude } = req.body;
    
    let reportPurchase = null;
    if (!isReportQueueWorkerMode(req)) {
      reportPurchase = await assertReportPurchaseAccess({ userId, reportType: "love-relationship", accessToken: req.body.reportAccessToken });
    }

    if (REPORT_QUEUE_ENABLED() && !isReportQueueWorkerMode(req)) {
      await markReportPurchaseConsumed(reportPurchase, { queuedReportType: "love_relationship_kundali" });
      return respondQueuedReport({ req, res, reportType: "love_relationship_kundali", message: "Love Relationship report request queued." });
    }

    const userRequest = await findOrCreateUserRequestWithKundli({ userId, userRequestId, fullName, gender, dateOfbirth, timeOfbirth, placeOfBirth, latitude, longitude });
    if (reportPurchase) await markReportPurchaseConsumed(reportPurchase, { userRequestId: userRequest.id });

    let reportRecord = await LoveRelationshipReport.findOne({ where: { userId, userRequestId: userRequest.id } });
    let finalResponseData;
    let reportGenerationRequest = null;
    
    if (reportRecord) {
      finalResponseData = reportRecord.reportData;
      if (!reportRecord.pdfUrl) {
        reportGenerationRequest = await saveReportGenerationRequest(req, {
          userId, userRequestId: userRequest.id, kundliId: userRequest.kundli?.id || null, reportType: "love_relationship_kundali",
          sourceType: "love_relationship_cached_pdf", sourceId: reportRecord.id, status: "llm_completed",
          price: 0, currency: "INR", requestPayload: { reportId: reportRecord.id }, llmResponse: {}, reportData: finalResponseData || {},
          startedAt: new Date(), metadata: { reason: "cached_pdf_missing", pdfGeneration: "pending" },
        });
        if (await handoffToPdfQueueIfWorker(req, reportGenerationRequest, reportRecord?.id || null)) return res.status(202).json({ success: true, queued: true });
        generateLoveRelationshipPdfInBackground(reportRecord, userRequest, reportGenerationRequest);
      }
    } else {
      let kundli = userRequest.kundli?.toJSON ? userRequest.kundli.toJSON() : userRequest.kundli;
      finalResponseData = await generateLoveRelationshipReport(kundli || {}, userRequest);
      reportRecord = await LoveRelationshipReport.create({ userId, userRequestId: userRequest.id, reportData: finalResponseData });
      
      reportGenerationRequest = await saveReportGenerationRequest(req, {
        userId, userRequestId: userRequest.id, kundliId: userRequest.kundli?.id || null, reportType: "love_relationship_kundali",
        sourceType: "love_relationship_report", sourceId: reportRecord.id, status: "llm_completed",
        price: 0, currency: "INR", requestPayload: { userRequestId: userRequest.id }, llmResponse: finalResponseData || {}, reportData: finalResponseData || {},
        startedAt: new Date(), metadata: { pdfGeneration: "pending" },
      });
      if (await handoffToPdfQueueIfWorker(req, reportGenerationRequest, reportRecord?.id || null)) return res.status(202).json({ success: true, queued: true });
      generateLoveRelationshipPdfInBackground(reportRecord, userRequest, reportGenerationRequest);
    }

    if (!reportGenerationRequest) reportGenerationRequest = await saveCachedReportGenerationRequestForWorker({ req, userId, userRequest, reportRecord, reportType: "love_relationship_kundali", sourceType: "love_relationship_report", price: 0, finalResponseData, kundliId: userRequest.kundli?.id || null, requestPayload: { userRequestId: userRequest.id }, llmResponse: finalResponseData || {}, metadata: {} });
    if (isReportQueueWorkerMode(req)) return res.status(200).json({ success: true, worker_processed: true });
    
    return res.status(200).json({ success: true, report: { id: reportRecord.id, pdfUrl: reportRecord.pdfUrl, pdfFileName: reportRecord.pdfFileName, pdfPublicId: reportRecord.pdfPublicId, status: "completed" } });
  } catch (error) {
    console.error("[generateLoveRelationshipKundaliReport] ERROR:", error);
    res.status(500).json({ success: false, message: error.message });
  }
};





// --- COMPATIBILITY CRUD ---
const getCompatibilityKundaliHistory = async (req, res) => {
  try {
    const userId = req.user.id;
    const reports = await CompatibilityReport.findAll({ where: { userId }, order: [['createdAt', 'DESC']] });
    
    const formattedReports = reports.map((r) => ({
      id: r.id,
      userRequestId: r.userRequestId,
      status: r.pdfUrl ? "completed" : "generating",
      boyName: r.boyName,
      girlName: r.girlName,
      boyPlaceOfBirth: r.boyPlaceOfBirth,
      girlPlaceOfBirth: r.girlPlaceOfBirth,
      createdAt: r.generatedAt || r.createdAt,
      pdfUrl: r.pdfUrl || null,
      reportData: r.reportData || null,
    }));
    
    const queuedReports = await getQueuedReportHistoryItems({
      userId,
      reportType: "compatibility_kundali",
      existingReports: formattedReports,
    });

    res.status(200).json({ success: true, reports: [...queuedReports, ...formattedReports].sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime()) });
  } catch (error) { res.status(500).json({ success: false, message: error.message }); }
};
const deleteCompatibilityKundaliReport = async (req, res) => {
  try {
    await CompatibilityReport.destroy({ where: { id: req.params.id, userId: req.user.id } });
    res.status(200).json({ success: true, message: "Report deleted" });
  } catch (error) { res.status(500).json({ success: false, message: error.message }); }
};
const regenerateCompatibilityReportPdf = async (req, res) => {
  try {
    const reportRecord = await CompatibilityReport.findOne({ where: { id: req.params.id, userId: req.user.id } });
    if (!reportRecord) return res.status(404).json({ success: false });
    const pdfBuffer = await generateCompatibilityReportPDF(reportRecord);
    const pdfMetadata = await uploadCompatibilityPdfBuffer({ reportRecord, pdfBuffer, userRequest: null });
    res.status(200).json({ success: true, ...pdfMetadata });
  } catch (error) { res.status(500).json({ success: false, message: error.message }); }
};
const downloadCompatibilityReportPdf = async (req, res) => {
  try {
    const reportRecord = await CompatibilityReport.findOne({ where: { id: req.params.id, userId: req.user.id } });
    if (!reportRecord || !reportRecord.pdfUrl) return res.status(404).json({ success: false });
    const fetchUrl = reportRecord.pdfUrl.replace("/upload/", "/upload/fl_attachment/");
    const response = await fetch(fetchUrl);
    res.setHeader("Content-Disposition", `attachment; filename="${reportRecord.pdfFileName || "compatibility_report.pdf"}"`);
    res.send(Buffer.from(await response.arrayBuffer()));
  } catch (error) { res.status(500).json({ success: false, message: error.message }); }
};
const uploadCompatibilityPdfBuffer = async ({ reportRecord, pdfBuffer, userRequest }) => {
  if (!reportRecord || !pdfBuffer) return { pdfUrl: reportRecord?.pdfUrl };
  const fileName = `compatibility_report_${Date.now()}.pdf`;
  const uploadResult = await uploadPdfBuffer({ buffer: pdfBuffer, fileName, folder: "graho/compatibility-reports" });
  await reportRecord.update({ pdfUrl: uploadResult.secure_url, pdfPublicId: uploadResult.public_id, pdfFileName: fileName, pdfUploadedAt: new Date() });
  return { pdfUrl: reportRecord.pdfUrl, pdfFileName: reportRecord.pdfFileName, pdfPublicId: reportRecord.pdfPublicId };
};

// --- HEALTH CRUD ---
const getHealthKundaliHistory = async (req, res) => {
  try {
    const userId = req.user.id;
    const reports = await HealthReport.findAll({ where: { userId }, include: [{ model: UserRequest, as: 'userRequest', required: true }], order: [['createdAt', 'DESC']] });

    const formattedReports = reports.map((r) => ({
      id: r.id,
      userRequestId: r.userRequestId,
      status: r.pdfUrl ? "completed" : "generating",
      fullName: r.userRequest.fullName,
      dateOfbirth: r.userRequest.dateOfbirth,
      placeOfBirth: r.userRequest.placeOfBirth,
      timeOfbirth: r.userRequest.timeOfbirth,
      gender: r.userRequest.gender,
      createdAt: r.generatedAt || r.createdAt,
      pdfUrl: r.pdfUrl || null,
      reportData: r.reportData || null,
    }));

    const queuedReports = await getQueuedReportHistoryItems({
      userId,
      reportType: "health_kundali",
      existingReports: formattedReports,
    });

    res.status(200).json({ success: true, reports: [...queuedReports, ...formattedReports].sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime()) });
  } catch (error) { res.status(500).json({ success: false, message: error.message }); }
};
const deleteHealthKundaliReport = async (req, res) => {
  try {
    await HealthReport.destroy({ where: { id: req.params.id, userId: req.user.id } });
    res.status(200).json({ success: true, message: "Report deleted" });
  } catch (error) { res.status(500).json({ success: false, message: error.message }); }
};
const regenerateHealthReportPdf = async (req, res) => {
  try {
    const reportRecord = await HealthReport.findOne({ where: { id: req.params.id, userId: req.user.id }, include: [{ model: UserRequest, as: 'userRequest' }] });
    if (!reportRecord) return res.status(404).json({ success: false });
    const pdfBuffer = await generateHealthReportPDF(reportRecord.reportData, reportRecord.userRequest);
    const pdfMetadata = await uploadHealthPdfBuffer({ reportRecord, pdfBuffer, userRequest: reportRecord.userRequest });
    res.status(200).json({ success: true, ...pdfMetadata });
  } catch (error) { res.status(500).json({ success: false, message: error.message }); }
};
const downloadHealthReportPdf = async (req, res) => {
  try {
    const reportRecord = await HealthReport.findOne({ where: { id: req.params.id, userId: req.user.id } });
    if (!reportRecord || !reportRecord.pdfUrl) return res.status(404).json({ success: false });
    const fetchUrl = reportRecord.pdfUrl.replace("/upload/", "/upload/fl_attachment/");
    const response = await fetch(fetchUrl);
    res.setHeader("Content-Disposition", `attachment; filename="${reportRecord.pdfFileName || "health_report.pdf"}"`);
    res.send(Buffer.from(await response.arrayBuffer()));
  } catch (error) { res.status(500).json({ success: false, message: error.message }); }
};
const uploadHealthPdfBuffer = async ({ reportRecord, pdfBuffer, userRequest }) => {
  if (!reportRecord || !pdfBuffer) return { pdfUrl: reportRecord?.pdfUrl };
  const fileName = `health_report_${Date.now()}.pdf`;
  const uploadResult = await uploadPdfBuffer({ buffer: pdfBuffer, fileName, folder: "graho/health-reports" });
  await reportRecord.update({ pdfUrl: uploadResult.secure_url, pdfPublicId: uploadResult.public_id, pdfFileName: fileName, pdfUploadedAt: new Date() });
  return { pdfUrl: reportRecord.pdfUrl, pdfFileName: reportRecord.pdfFileName, pdfPublicId: reportRecord.pdfPublicId };
};

// --- LOVE RELATIONSHIP CRUD ---
const getLoveRelationshipKundaliHistory = async (req, res) => {
  try {
    const userId = req.user.id;
    const reports = await LoveRelationshipReport.findAll({ where: { userId }, include: [{ model: UserRequest, as: 'userRequest', required: true }], order: [['createdAt', 'DESC']] });

    const formattedReports = reports.map((r) => ({
      id: r.id,
      userRequestId: r.userRequestId,
      status: r.pdfUrl ? "completed" : "generating",
      fullName: r.userRequest.fullName,
      dateOfbirth: r.userRequest.dateOfbirth,
      placeOfBirth: r.userRequest.placeOfBirth,
      timeOfbirth: r.userRequest.timeOfbirth,
      gender: r.userRequest.gender,
      createdAt: r.generatedAt || r.createdAt,
      pdfUrl: r.pdfUrl || null,
      reportData: r.reportData || null,
    }));

    const queuedReports = await getQueuedReportHistoryItems({
      userId,
      reportType: "love_relationship_kundali",
      existingReports: formattedReports,
    });

    res.status(200).json({ success: true, reports: [...queuedReports, ...formattedReports].sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime()) });
  } catch (error) { res.status(500).json({ success: false, message: error.message }); }
};
const deleteLoveRelationshipKundaliReport = async (req, res) => {
  try {
    await LoveRelationshipReport.destroy({ where: { id: req.params.id, userId: req.user.id } });
    res.status(200).json({ success: true, message: "Report deleted" });
  } catch (error) { res.status(500).json({ success: false, message: error.message }); }
};
const regenerateLoveRelationshipReportPdf = async (req, res) => {
  try {
    const reportRecord = await LoveRelationshipReport.findOne({ where: { id: req.params.id, userId: req.user.id }, include: [{ model: UserRequest, as: 'userRequest' }] });
    if (!reportRecord) return res.status(404).json({ success: false });
    const pdfBuffer = await generateLoveRelationshipReportPDF(reportRecord.reportData, reportRecord.userRequest);
    const pdfMetadata = await uploadLoveRelationshipPdfBuffer({ reportRecord, pdfBuffer, userRequest: reportRecord.userRequest });
    res.status(200).json({ success: true, ...pdfMetadata });
  } catch (error) { res.status(500).json({ success: false, message: error.message }); }
};
const downloadLoveRelationshipReportPdf = async (req, res) => {
  try {
    const reportRecord = await LoveRelationshipReport.findOne({ where: { id: req.params.id, userId: req.user.id } });
    if (!reportRecord || !reportRecord.pdfUrl) return res.status(404).json({ success: false });
    const fetchUrl = reportRecord.pdfUrl.replace("/upload/", "/upload/fl_attachment/");
    const response = await fetch(fetchUrl);
    res.setHeader("Content-Disposition", `attachment; filename="${reportRecord.pdfFileName || "love_report.pdf"}"`);
    res.send(Buffer.from(await response.arrayBuffer()));
  } catch (error) { res.status(500).json({ success: false, message: error.message }); }
};
const uploadLoveRelationshipPdfBuffer = async ({ reportRecord, pdfBuffer, userRequest }) => {
  if (!reportRecord || !pdfBuffer) return { pdfUrl: reportRecord?.pdfUrl };
  const fileName = `love_report_${Date.now()}.pdf`;
  const uploadResult = await uploadPdfBuffer({ buffer: pdfBuffer, fileName, folder: "graho/love-reports" });
  await reportRecord.update({ pdfUrl: uploadResult.secure_url, pdfPublicId: uploadResult.public_id, pdfFileName: fileName, pdfUploadedAt: new Date() });
  return { pdfUrl: reportRecord.pdfUrl, pdfFileName: reportRecord.pdfFileName, pdfPublicId: reportRecord.pdfPublicId };
};

const regenerateSadeSatiReportPdf = async (req, res) => {
  try {
    const reportRecord = await SadeSatiReport.findOne({ where: { id: req.params.id, userId: req.user.id }, include: [{ model: UserRequest, as: 'userRequest' }] });
    if (!reportRecord) return res.status(404).json({ success: false });
    const pdfBuffer = await generateSadeSatiReportPDF(reportRecord.reportData, reportRecord.userRequest);
    const pdfMetadata = await uploadSadeSatiPdfBuffer({ reportRecord, pdfBuffer, userRequest: reportRecord.userRequest });
    res.status(200).json({ success: true, ...pdfMetadata });
  } catch (error) { res.status(500).json({ success: false, message: error.message }); }
};
const downloadSadeSatiReportPdf = async (req, res) => {
  try {
    const reportRecord = await SadeSatiReport.findOne({ where: { id: req.params.id, userId: req.user.id } });
    if (!reportRecord || !reportRecord.pdfUrl) return res.status(404).json({ success: false });
    const fetchUrl = reportRecord.pdfUrl.replace("/upload/", "/upload/fl_attachment/");
    const response = await fetch(fetchUrl);
    res.setHeader("Content-Disposition", `attachment; filename="${reportRecord.pdfFileName || "sadesati_report.pdf"}"`);
    res.send(Buffer.from(await response.arrayBuffer()));
  } catch (error) { res.status(500).json({ success: false, message: error.message }); }
};


module.exports = {
  generateCompatibilityKundaliReport,
  getCompatibilityKundaliHistory,
  deleteCompatibilityKundaliReport,
  regenerateCompatibilityReportPdf,
  downloadCompatibilityReportPdf,
  generateHealthKundaliReport,
  getHealthKundaliHistory,
  deleteHealthKundaliReport,
  regenerateHealthReportPdf,
  downloadHealthReportPdf,
  generateLoveRelationshipKundaliReport,
  getLoveRelationshipKundaliHistory,
  deleteLoveRelationshipKundaliReport,
  regenerateLoveRelationshipReportPdf,
  downloadLoveRelationshipReportPdf,
  regenerateSadeSatiReportPdf,
  downloadSadeSatiReportPdf,
  getUserKundlisForReport,
  generateKundliReport,
  getGeneratedKundliReport,
  downloadKundliReportPDF,
  previewKundliReportPDF,
  generateDailyKundaliReport,
  getDailyKundaliHistory,
  deleteDailyKundaliReport,
  regenerateDailyReportPdf,
  downloadDailyReportPdf,
  generateYearlyKundaliReport,
  getYearlyKundaliHistory,
  deleteYearlyKundaliReport,
  regenerateYearlyReportPdf,
  downloadYearlyReportPdf,
  generateWealthKundaliReport,
  getWealthKundaliHistory,
  deleteWealthKundaliReport,
  regenerateWealthReportPdf,
  downloadWealthReportPdf,
  generateSadeSatiKundaliReport,
  getSadeSatiKundaliHistory,
  deleteSadeSatiKundaliReport,
  generateQueuedReportPdf,
};
