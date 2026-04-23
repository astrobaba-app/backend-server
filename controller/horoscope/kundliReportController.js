const Kundli = require("../../model/horoscope/kundli");
const KundliReport = require("../../model/horoscope/kundliReport");
const UserRequest = require("../../model/user/userRequest");
const { generateKundliReportContent } = require("../../services/kundliReportAiService");
const { generateKundliReportPDF: buildKundliReportPDF } = require("../../services/kundliReportPdfService");
const { uploadPdfBuffer } = require("../../config/uploadConfig/cloudinaryPdfUpload");

const getUserRequestWithKundli = async (userId, userRequestId) => {
  return UserRequest.findOne({
    where: {
      id: userRequestId,
      userId,
    },
    include: [
      {
        model: Kundli,
        as: "kundli",
        required: true,
      },
    ],
  });
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

  console.log("[Kundli Report] Generating AI-enhanced content for:", userDetails.fullName);
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

module.exports = {
  getUserKundlisForReport,
  generateKundliReport,
  getGeneratedKundliReport,
  downloadKundliReportPDF,
  previewKundliReportPDF,
};
