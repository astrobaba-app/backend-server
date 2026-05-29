const PalmUpload = require("../../model/palm/palmUpload");
const PalmFeature = require("../../model/palm/palmFeature");
const PalmReport = require("../../model/palm/palmReport");
const AIJob = require("../../model/palm/aiJob");
const { enqueuePalmJob } = require("../../services/palmQueueService");
const { checkPalmEngineHealth } = require("../../services/palmReadingService");

const createPalmReadingJob = async (req, res) => {
  try {
    const userId = req.user.id;
    const uploadedPalmImages = req.uploadedPalmImages || [];
    if (!uploadedPalmImages.length) {
      return res.status(400).json({ success: false, message: "At least one palm image is required" });
    }

    const health = await checkPalmEngineHealth();
    if (!health.ok) {
      console.error("[PalmController] Palm engine unavailable", health);
      return res.status(503).json({
        success: false,
        message: "Palm AI engine is temporarily unavailable. Please try again in a minute.",
        details: health,
      });
    }

    const metadata = {
      gender: req.body.gender || null,
      ageRange: req.body.ageRange || null,
      dominantHand: req.body.dominantHand || null,
      notes: req.body.notes || null,
    };

    const palmUpload = await PalmUpload.create({
      userId,
      imageUrls: uploadedPalmImages.map((item) => item.url),
      imageHash: uploadedPalmImages[0]?.hash || null,
      metadata,
    });

    const job = await AIJob.create({
      userId,
      palmUploadId: palmUpload.id,
      type: "palm_reading",
      status: "queued",
      stage: "queued",
      progress: 8,
      stageMessage: "Upload complete. Your palm report is entering the analysis queue.",
    });

    await enqueuePalmJob(job.id);
    return res.status(202).json({
      success: true,
      jobId: job.id,
      palmUploadId: palmUpload.id,
      status: "queued",
      optimization: {
        processedImages: uploadedPalmImages.length,
        ignoredImages: req.ignoredPalmImagesCount || 0,
      },
    });
  } catch (error) {
    return res.status(500).json({ success: false, message: "Failed to queue palm reading", error: error.message });
  }
};

const getPalmReadingJob = async (req, res) => {
  try {
    const userId = req.user.id;
    const { jobId } = req.params;
    const job = await AIJob.findOne({ where: { id: jobId, userId } });
    if (!job) return res.status(404).json({ success: false, message: "Job not found" });

    const response = { success: true, job };
    if (job.status === "completed") {
      const feature = await PalmFeature.findOne({ where: { palmUploadId: job.palmUploadId } });
      const report = await PalmReport.findOne({ where: { palmUploadId: job.palmUploadId } });
      const upload = await PalmUpload.findByPk(job.palmUploadId);
      response.result = {
        palmImages: upload?.imageUrls || [],
        extractedFeatures: feature?.features || {},
        structuredInsights: report?.structuredInsights || {},
        finalNarrativeReport: report?.finalNarrative || "",
        confidenceScores: report?.confidenceScores || feature?.confidenceScores || {},
      };
    }
    return res.status(200).json(response);
  } catch (error) {
    return res.status(500).json({ success: false, message: "Failed to fetch job", error: error.message });
  }
};

const getPalmReadingHistory = async (req, res) => {
  try {
    const userId = req.user.id;
    const uploads = await PalmUpload.findAll({
      where: { userId },
      include: [
        { model: AIJob, as: "aiJob", required: false },
        { model: PalmFeature, as: "features", required: false },
        { model: PalmReport, as: "report", required: false },
      ],
      order: [["createdAt", "DESC"]],
      limit: 50,
    });

    const history = uploads.map((item) => ({
      palmUploadId: item.id,
      createdAt: item.createdAt,
      images: item.imageUrls || [],
      metadata: item.metadata || {},
      job: item.aiJob
        ? {
            id: item.aiJob.id,
            status: item.aiJob.status,
            stage: item.aiJob.stage,
            progress: item.aiJob.progress,
            stageMessage: item.aiJob.stageMessage,
            completedAt: item.aiJob.completedAt,
          }
        : null,
      report: item.report
        ? {
            structuredInsights: item.report.structuredInsights || {},
            finalNarrative: item.report.finalNarrative || "",
            confidenceScores: item.report.confidenceScores || {},
          }
        : null,
      features: item.features?.features || {},
    }));

    return res.status(200).json({ success: true, history });
  } catch (error) {
    return res.status(500).json({ success: false, message: "Failed to fetch palm history", error: error.message });
  }
};

module.exports = { createPalmReadingJob, getPalmReadingJob, getPalmReadingHistory };
