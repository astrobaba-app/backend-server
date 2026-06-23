const PalmFeature = require("../model/palm/palmFeature");
const PalmReport = require("../model/palm/palmReport");
const PalmUpload = require("../model/palm/palmUpload");
const { uploadPdfBuffer } = require("../config/uploadConfig/cloudinaryPdfUpload");
const { generatePalmReportPDF } = require("./palmReportPdfService");

const sanitizeFileNamePart = (value, fallback = "palm_report") =>
  String(value || fallback)
    .replace(/[^a-zA-Z0-9-_]+/g, "_")
    .replace(/^_+|_+$/g, "")
    .slice(0, 60) || fallback;

const generateAndUploadPalmPdf = async ({ upload, report, features, userRequest, reportRequest }) => {
  console.log("[PalmQueue][PDF] Generating palm report PDF", {
    palmUploadId: upload.id,
    reportId: report.id,
    reportRequestId: reportRequest?.id || null,
    userRequestId: userRequest?.id || report?.userRequestId || null,
  });

  const pdfBuffer = await generatePalmReportPDF({
    palmImages: upload.imageUrls || [],
    features: features?.features || {},
    structuredInsights: report.structuredInsights || {},
    finalNarrative: report.finalNarrative || "",
    generatedAt: report.createdAt || upload.createdAt,
  });

  const safeName = sanitizeFileNamePart(userRequest?.fullName, "palm_report");
  const fileName = `palm_report_${safeName}_${Date.now()}.pdf`;
  const uploadResult = await uploadPdfBuffer({
    buffer: pdfBuffer,
    fileName,
    folder: "graho/palm-reports",
  });

  await report.update({
    pdfUrl: uploadResult.secure_url,
    pdfPublicId: uploadResult.public_id,
    pdfFileName: fileName,
    pdfUploadedAt: new Date(),
  });

  if (reportRequest) {
    await reportRequest.update({
      status: "completed",
      pdfUrl: uploadResult.secure_url,
      pdfPublicId: uploadResult.public_id,
      pdfFileName: fileName,
      pdfUploadedAt: new Date(),
      completedAt: new Date(),
    });
  }

  console.log("[PalmQueue][PDF] Uploaded palm report PDF", {
    palmUploadId: upload.id,
    reportId: report.id,
    pdfUrl: uploadResult.secure_url,
  });

  return {
    pdfUrl: uploadResult.secure_url,
    pdfPublicId: uploadResult.public_id,
    pdfFileName: fileName,
    pdfUploadedAt: new Date(),
  };
};

const generateQueuedPalmPdf = async (reportGenerationRequest) => {
  const upload = await PalmUpload.findOne({
    where: {
      id: reportGenerationRequest.sourceId,
      userId: reportGenerationRequest.userId,
    },
  });
  if (!upload) throw new Error("Palm upload not found for queued PDF");

  const report = await PalmReport.findOne({ where: { palmUploadId: upload.id } });
  if (!report?.finalNarrative) throw new Error("Palm report narrative not found for queued PDF");

  const features = await PalmFeature.findOne({ where: { palmUploadId: upload.id } });
  if (!features) throw new Error("Palm features not found for queued PDF");

  return generateAndUploadPalmPdf({
    upload,
    report,
    features,
    userRequest: null,
    reportRequest: reportGenerationRequest,
  });
};

module.exports = {
  generateAndUploadPalmPdf,
  generateQueuedPalmPdf,
};
