const Kundli = require("../../model/horoscope/kundli");
const KundliReport = require("../../model/horoscope/kundliReport");
const YearlyReport = require("../../model/horoscope/yearlyReport");
const WealthReport = require("../../model/horoscope/wealthReport");
const SadeSatiReport = require("../../model/horoscope/sadeSatiReport");
const HealthReport = require("../../model/horoscope/healthReport");
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
  generateHealthReport,
} = require("../../services/health-kundli-report");
const {
  generateHealthReportPDF,
} = require("../../services/healthReportPdfService");
// Note: dailyReportPdfService removed — PDF is now generated on the frontend via html2pdf.js

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
    } = req.body;

    if (!fullName || !gender || !dateOfbirth || !timeOfbirth || !placeOfBirth) {
      return res.status(400).json({
        success: false,
        message: "Missing required fields (fullName, gender, dateOfbirth, timeOfbirth, placeOfBirth)",
      });
    }

    console.log("Received daily report request for:", { fullName, gender, dateOfbirth, timeOfbirth, placeOfBirth });

    // Find or create UserRequest using robust date parsing to avoid duplicate creation
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
      include: [
        {
          model: Kundli,
          as: "kundli",
        },
      ],
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

    // Check if we have a KundliReport generated TODAY
    const todayStr = new Date().toISOString().slice(0, 10);
    let reportRecord = await KundliReport.findOne({
      where: {
        userId,
        userRequestId: userRequest.id,
      },
    });

    let finalResponseData;
    if (reportRecord && reportRecord.generatedAt.toISOString().slice(0, 10) === todayStr) {
      finalResponseData = reportRecord.reportData;
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

      const timezone = req.body.timezone || "Asia/Kolkata";
      const currentDate = req.body.currentDate || todayStr;
      const lat = latitude ? parseFloat(latitude) : userRequest.latitude;
      const lng = longitude ? parseFloat(longitude) : userRequest.longitude;

      const payload = await buildDailyReportPayload(kundli, currentDate, timezone, lat, lng, userRequest);
      const dailyForecast = await generateDailyReport(payload, userRequest);
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
    }

    console.log("final response data for daily report:", finalResponseData);

    res.status(200).json({
      success: true,
      data: finalResponseData,
    });
  } catch (error) {
    console.error("Error in generateDailyKundaliReport:", error);
    res.status(500).json({
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

    res.status(200).json({
      success: true,
      reports: formattedReports,
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

const generateYearlyPdfInBackground = async (reportRecord, userRequest) => {
  try {
    console.log(`[Yearly PDF Background] Generating PDF for report ID: ${reportRecord.id}...`);
    const pdfBuffer = await generateYearlyReportPDF(reportRecord.reportData, userRequest);

    const safeName = (userRequest.fullName ?? "yearly_report").replace(/\s+/g, "_");
    const fileName = `yearly_report_${safeName}_${Date.now()}.pdf`;

    console.log(`[Yearly PDF Background] Uploading to Cloudinary...`);
    const uploadResult = await uploadPdfBuffer({
      buffer: pdfBuffer,
      fileName,
      folder: "graho/yearly-reports",
    });

    console.log(`[Yearly PDF Background] Saving pdfUrl in database...`);
    await reportRecord.update({
      pdfUrl: uploadResult.secure_url,
      pdfPublicId: uploadResult.public_id,
      pdfFileName: fileName,
      pdfUploadedAt: new Date(),
    });
    console.log(`[Yearly PDF Background] Successfully completed for report ID: ${reportRecord.id}`);
  } catch (error) {
    console.error(`[Yearly PDF Background] Failed for report ID: ${reportRecord.id}:`, error.message || error);
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
    } = req.body;

    if (!fullName || !gender || !dateOfbirth || !timeOfbirth || !placeOfBirth) {
      return res.status(400).json({
        success: false,
        message: "Missing required fields (fullName, gender, dateOfbirth, timeOfbirth, placeOfBirth)",
      });
    }

    console.log("Received yearly report request for:", { fullName, gender, dateOfbirth, timeOfbirth, placeOfBirth });

    // Find or create UserRequest using robust date parsing to avoid duplicate creation
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
      include: [
        {
          model: Kundli,
          as: "kundli",
        },
      ],
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
    if (reportRecord && reportRecord.reportData?.year === year) {
      finalResponseData = reportRecord.reportData;
      console.log(`[YearlyReportController] Serving cached predictions for year ${year}`);
      if (!reportRecord.pdfUrl) {
        generateYearlyPdfInBackground(reportRecord, userRequest);
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
      // console.log("pdf start hoga");
      generateYearlyPdfInBackground(reportRecord, userRequest);
    }

    // console.log("final response data for yearly report prediction:");
    //   console.log(JSON.stringify(finalResponseData, null, 2));

    res.status(200).json({
      success: true,
      data: finalResponseData,
    });
  } catch (error) {
    console.error("Error in generateYearlyKundaliReport:", error);
    res.status(500).json({
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

    res.status(200).json({
      success: true,
      reports: formattedReports,
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

const generateWealthPdfInBackground = async (reportRecord, userRequest) => {
  try {
    console.log(`[Wealth PDF Background] Generating PDF for report ID: ${reportRecord.id}...`);
    const pdfBuffer = await generateWealthReportPDF(reportRecord.reportData, userRequest);

    const safeName = (userRequest.fullName ?? "wealth_report").replace(/\s+/g, "_");
    const fileName = `wealth_report_${safeName}_${Date.now()}.pdf`;

    console.log(`[Wealth PDF Background] Uploading to Cloudinary...`);
    const uploadResult = await uploadPdfBuffer({
      buffer: pdfBuffer,
      fileName,
      folder: "graho/wealth-reports",
    });

    console.log(`[Wealth PDF Background] Saving pdfUrl in database...`);
    await reportRecord.update({
      pdfUrl: uploadResult.secure_url,
      pdfPublicId: uploadResult.public_id,
      pdfFileName: fileName,
      pdfUploadedAt: new Date(),
    });
    console.log(`[Wealth PDF Background] Successfully completed for report ID: ${reportRecord.id}`);
  } catch (error) {
    console.error(`[Wealth PDF Background] Failed for report ID: ${reportRecord.id}:`, error.message || error);
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
    } = req.body;

    if (!fullName || !gender || !dateOfbirth || !timeOfbirth || !placeOfBirth) {
      return res.status(400).json({
        success: false,
        message: "Missing required fields (fullName, gender, dateOfbirth, timeOfbirth, placeOfBirth)",
      });
    }

    console.log("Received wealth report request for:", { fullName, gender, dateOfbirth, timeOfbirth, placeOfBirth });

    // Find or create UserRequest using robust date parsing to avoid duplicate creation
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
      include: [
        {
          model: Kundli,
          as: "kundli",
        },
      ],
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
    if (reportRecord) {
      finalResponseData = reportRecord.reportData;
      console.log(`[WealthReportController] Serving cached predictions`);
      if (!reportRecord.pdfUrl) {
        generateWealthPdfInBackground(reportRecord, userRequest);
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
      generateWealthPdfInBackground(reportRecord, userRequest);
    }

    res.status(200).json({
      success: true,
      data: finalResponseData,
    });
  } catch (error) {
    console.error("Error in generateWealthKundaliReport:", error);
    res.status(500).json({
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

    res.status(200).json({
      success: true,
      reports: formattedReports,
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

const generateSadeSatiPdfInBackground = async (reportRecord, userRequest) => {
  try {
    console.log(`[Sade Sati PDF Background] Generating PDF for report ID: ${reportRecord.id}...`);
    const pdfBuffer = await generateSadeSatiReportPDF(reportRecord.reportData, userRequest);

    const safeName = (userRequest.fullName ?? "sadesati_report").replace(/\s+/g, "_");
    const fileName = `sadesati_report_${safeName}_${Date.now()}.pdf`;

    console.log(`[Sade Sati PDF Background] Uploading to Cloudinary...`);
    const uploadResult = await uploadPdfBuffer({
      buffer: pdfBuffer,
      fileName,
      folder: "graho/sadesati-reports",
    });

    console.log(`[Sade Sati PDF Background] Saving pdfUrl in database...`);
    await reportRecord.update({
      pdfUrl: uploadResult.secure_url,
      pdfPublicId: uploadResult.public_id,
      pdfFileName: fileName,
      pdfUploadedAt: new Date(),
    });
    console.log(`[Sade Sati PDF Background] Successfully completed for report ID: ${reportRecord.id}`);
  } catch (error) {
    console.error(`[Sade Sati PDF Background] Failed for report ID: ${reportRecord.id}:`, error.message || error);
  }
};

const generateSadeSatiKundaliReport = async (req, res) => {
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
    } = req.body;

    if (!fullName || !gender || !dateOfbirth || !timeOfbirth || !placeOfBirth) {
      return res.status(400).json({
        success: false,
        message: "Missing required fields (fullName, gender, dateOfbirth, timeOfbirth, placeOfBirth)",
      });
    }

    console.log("Received Sade Sati report request for:", { fullName, gender, dateOfbirth, timeOfbirth, placeOfBirth });

    // Find or create UserRequest using robust date parsing to avoid duplicate creation
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
      include: [
        {
          model: Kundli,
          as: "kundli",
        },
      ],
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

    // Check if we have a SadeSatiReport generated already for this request
    let reportRecord = await SadeSatiReport.findOne({
      where: {
        userId,
        userRequestId: userRequest.id,
      },
    });

    let finalResponseData;
    if (reportRecord) {
      finalResponseData = reportRecord.reportData;
      console.log(`[SadeSatiReportController] Serving cached predictions`);
      if (!reportRecord.pdfUrl) {
        generateSadeSatiPdfInBackground(reportRecord, userRequest);
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

      finalResponseData = await generateSadeSatiReport(kundli, userRequest);
      
      if (reportRecord) {
        await reportRecord.update({
          reportData: finalResponseData,
          generatedAt: new Date(),
          pdfUrl: null, // Reset as predictions have changed
        });
      } else {
        reportRecord = await SadeSatiReport.create({
          userId,
          userRequestId: userRequest.id,
          reportData: finalResponseData,
          generatedAt: new Date(),
        });
      }
      generateSadeSatiPdfInBackground(reportRecord, userRequest);
    }

    res.status(200).json({
      success: true,
      data: finalResponseData,
    });
  } catch (error) {
    console.error("Error in generateSadeSatiKundaliReport:", error);
    res.status(500).json({
      success: false,
      message: "Failed to generate Sade Sati report",
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

    res.status(200).json({
      success: true,
      reports: formattedReports,
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

const generateHealthPdfInBackground = async (reportRecord, userRequest) => {
  try {
    console.log(`[Health PDF Background] Generating PDF for report ID: ${reportRecord.id}...`);
    const pdfBuffer = await generateHealthReportPDF(reportRecord.reportData, userRequest);

    const safeName = (userRequest.fullName ?? "health_report").replace(/\s+/g, "_");
    const fileName = `health_report_${safeName}_${Date.now()}.pdf`;

    console.log(`[Health PDF Background] Uploading to Cloudinary...`);
    const uploadResult = await uploadPdfBuffer({
      buffer: pdfBuffer,
      fileName,
      folder: "graho/health-reports",
    });

    console.log(`[Health PDF Background] Saving pdfUrl in database...`);
    await reportRecord.update({
      pdfUrl: uploadResult.secure_url,
      pdfPublicId: uploadResult.public_id,
      pdfFileName: fileName,
      pdfUploadedAt: new Date(),
    });
    console.log(`[Health PDF Background] Successfully completed for report ID: ${reportRecord.id}`);
  } catch (error) {
    console.error(`[Health PDF Background] Failed for report ID: ${reportRecord.id}:`, error.message || error);
  }
};

const generateHealthKundaliReport = async (req, res) => {
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
    } = req.body;

    if (!fullName || !gender || !dateOfbirth || !timeOfbirth || !placeOfBirth) {
      return res.status(400).json({
        success: false,
        message: "Missing required fields (fullName, gender, dateOfbirth, timeOfbirth, placeOfBirth)",
      });
    }

    console.log("Received Health report request for:", { fullName, gender, dateOfbirth, timeOfbirth, placeOfBirth });

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
      include: [
        {
          model: Kundli,
          as: "kundli",
        },
      ],
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

    let reportRecord = await HealthReport.findOne({
      where: {
        userId,
        userRequestId: userRequest.id,
      },
    });

    let finalResponseData;
    if (reportRecord) {
      finalResponseData = reportRecord.reportData;
      console.log(`[HealthReportController] Serving cached predictions`);
      if (!reportRecord.pdfUrl) {
        generateHealthPdfInBackground(reportRecord, userRequest);
      }
    } else {
      let kundli;
      if (userRequest.kundli) {
        kundli = userRequest.kundli.toJSON ? userRequest.kundli.toJSON() : userRequest.kundli;
      } else {
        const [
          basicDetails, astroDetails, panchang, planetary, charts, dasha, yogini,
          manglikAnalysis, personality, gemstoneRemedies, rudrakshaSuggestion,
          ashtakavarga, transit, completeHoroscope,
        ] = await Promise.allSettled([
          getBasicDetails(userRequest), getAstroDetails(userRequest), getPanchang(userRequest),
          getPlanetaryPositions(userRequest), getAllCharts(userRequest), getVimshottariDasha(userRequest),
          getYoginiDasha(userRequest), getManglikAnalysis(userRequest), getAscendantReport(userRequest),
          getGemstoneRemedies(userRequest), getRudrakshaSuggestion(userRequest),
          getAshtakavarga(userRequest), getTransitChart(userRequest), getCompleteHoroscope(userRequest),
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
            name: yoga.name, type: yoga.type, strength: yoga.strength,
            description: yoga.description, effects: yoga.effects,
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

      finalResponseData = await generateHealthReport(kundli, userRequest);

      if (reportRecord) {
        await reportRecord.update({
          reportData: finalResponseData,
          generatedAt: new Date(),
          pdfUrl: null,
        });
      } else {
        reportRecord = await HealthReport.create({
          userId,
          userRequestId: userRequest.id,
          reportData: finalResponseData,
          generatedAt: new Date(),
        });
      }
      generateHealthPdfInBackground(reportRecord, userRequest);
    }

    res.status(200).json({
      success: true,
      data: finalResponseData,
    });
  } catch (error) {
    console.error("Error in generateHealthKundaliReport:", error);
    res.status(500).json({
      success: false,
      message: "Failed to generate Health report",
      error: error.message,
    });
  }
};

const getHealthKundaliHistory = async (req, res) => {
  try {
    const userId = req.user.id;

    const reports = await HealthReport.findAll({
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

    res.status(200).json({
      success: true,
      reports: formattedReports,
    });
  } catch (error) {
    console.error("Error in getHealthKundaliHistory:", error);
    res.status(500).json({
      success: false,
      message: "Failed to fetch Health report history",
      error: error.message,
    });
  }
};

const deleteHealthKundaliReport = async (req, res) => {
  try {
    const userId = req.user.id;
    const { id } = req.params;

    if (!id) {
      return res.status(400).json({
        success: false,
        message: "Report ID is required",
      });
    }

    const reportRecord = await HealthReport.findOne({
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
    console.error("Error deleting Health report:", error);
    return res.status(500).json({
      success: false,
      message: "Failed to delete report",
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
  generateDailyKundaliReport,
  getDailyKundaliHistory,
  deleteDailyKundaliReport,
  generateYearlyKundaliReport,
  getYearlyKundaliHistory,
  deleteYearlyKundaliReport,
  generateWealthKundaliReport,
  getWealthKundaliHistory,
  deleteWealthKundaliReport,
  generateSadeSatiKundaliReport,
  getSadeSatiKundaliHistory,
  deleteSadeSatiKundaliReport,
  generateHealthKundaliReport,
  getHealthKundaliHistory,
  deleteHealthKundaliReport,
};
