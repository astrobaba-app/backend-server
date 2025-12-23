const Kundli = require("../../model/horoscope/kundli");
const UserRequest = require("../../model/user/userRequest");
const { generateKundliReportContent } = require("../../services/kundliReportAiService");
const { generateKundliReportPDF } = require("../../services/kundliReportPdfService");

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
    const userRequest = await UserRequest.findOne({
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

    if (!userRequest) {
      return res.status(404).json({
        success: false,
        message: "Kundli not found",
      });
    }

    const kundliData = userRequest.kundli;

    // User details for the report
    const userDetails = {
      fullName: userRequest.fullName,
      dateOfbirth: userRequest.dateOfbirth,
      timeOfbirth: userRequest.timeOfbirth,
      placeOfBirth: userRequest.placeOfBirth,
      gender: userRequest.gender,
    };

    // Generate enhanced content using OpenAI
    console.log("[Kundli Report] Generating AI-enhanced content for:", userDetails.fullName);
    const reportData = await generateKundliReportContent(kundliData, userDetails);

    // Return the enhanced content (PDF generation will be done separately for preview)
    res.status(200).json({
      success: true,
      message: "Report content generated successfully",
      reportData: {
        ...reportData,
        userDetails,
        kundliId: kundliData.id,
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
    const userRequest = await UserRequest.findOne({
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

    if (!userRequest) {
      return res.status(404).json({
        success: false,
        message: "Kundli not found",
      });
    }

    const kundliData = userRequest.kundli;

    // User details for the report
    const userDetails = {
      fullName: userRequest.fullName,
      dateOfbirth: userRequest.dateOfbirth,
      timeOfbirth: userRequest.timeOfbirth,
      placeOfBirth: userRequest.placeOfBirth,
      gender: userRequest.gender,
    };

    // Generate enhanced content using OpenAI
    console.log("[Kundli Report PDF] Generating content for:", userDetails.fullName);
    const reportData = await generateKundliReportContent(kundliData, userDetails);

    // Generate PDF
    console.log("[Kundli Report PDF] Generating PDF...");
    const pdfBuffer = await generateKundliReportPDF(reportData, kundliData, userDetails);

    // Set response headers for PDF download
    const filename = `Kundli_Report_${userDetails.fullName.replace(/\s+/g, '_')}_${new Date().getFullYear()}.pdf`;
    
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
    const userRequest = await UserRequest.findOne({
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

    if (!userRequest) {
      return res.status(404).json({
        success: false,
        message: "Kundli not found",
      });
    }

    const kundliData = userRequest.kundli;

    // User details for the report
    const userDetails = {
      fullName: userRequest.fullName,
      dateOfbirth: userRequest.dateOfbirth,
      timeOfbirth: userRequest.timeOfbirth,
      placeOfBirth: userRequest.placeOfBirth,
      gender: userRequest.gender,
    };

    // Generate enhanced content using OpenAI
    const reportData = await generateKundliReportContent(kundliData, userDetails);

    // Generate PDF
    const pdfBuffer = await generateKundliReportPDF(reportData, kundliData, userDetails);

    // Convert to base64 for preview
    const pdfBase64 = pdfBuffer.toString('base64');

    res.status(200).json({
      success: true,
      message: "PDF preview generated successfully",
      pdfData: `data:application/pdf;base64,${pdfBase64}`,
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
  downloadKundliReportPDF,
  previewKundliReportPDF,
};
