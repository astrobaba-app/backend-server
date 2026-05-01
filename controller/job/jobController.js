const { Op } = require("sequelize");
const Job = require("../../model/job/job");
const JobApplication = require("../../model/job/jobApplication");
const {
  enqueueJobApplicationConfirmationEmail,
} = require("../../services/jobApplicationEmailQueue");
const {
  sendJobApplicationAcceptedEmail,
  sendJobApplicationRejectedEmail,
} = require("../../emailService/jobApplicationEmail");

const ALLOWED_MODES = ["remote", "hybrid", "onsite"];
const ALLOWED_TYPES = ["full-time", "intern", "contract", "part-time"];
const ALLOWED_GENDERS = ["male", "female", "other"];
const EMAIL_PATTERN = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

const normalizeStringArray = (value) => {
  if (value === undefined || value === null) return [];
  if (!Array.isArray(value)) return null;

  return value
    .map((item) => (typeof item === "string" ? item.trim() : ""))
    .filter(Boolean);
};

const parsePagination = (query) => {
  const page = Math.max(parseInt(query.page, 10) || 1, 1);
  const limit = Math.min(Math.max(parseInt(query.limit, 10) || 20, 1), 100);
  const offset = (page - 1) * limit;
  return { page, limit, offset };
};

const toBoolean = (value) => {
  if (value === true || value === "true") return true;
  if (value === false || value === "false") return false;
  return false;
};

const normalizeOptionalUrl = (value) => {
  if (typeof value !== "string") return null;
  const trimmed = value.trim();
  return trimmed || null;
};

const isValidHttpUrl = (value) => {
  try {
    const parsed = new URL(value);
    return parsed.protocol === "http:" || parsed.protocol === "https:";
  } catch {
    return false;
  }
};

const createJob = async (req, res) => {
  try {
    const {
      title,
      description,
      bulletPoints,
      mode,
      type,
      startDate,
      whatWeExpectFromYou,
      skills,
      isActive,
    } = req.body;

    if (!title || !description) {
      return res.status(400).json({
        success: false,
        message: "title and description are required",
      });
    }

    if (!mode || !ALLOWED_MODES.includes(mode)) {
      return res.status(400).json({
        success: false,
        message: `mode must be one of: ${ALLOWED_MODES.join(", ")}`,
      });
    }

    if (!type || !ALLOWED_TYPES.includes(type)) {
      return res.status(400).json({
        success: false,
        message: `type must be one of: ${ALLOWED_TYPES.join(", ")}`,
      });
    }

    const normalizedBulletPoints = normalizeStringArray(bulletPoints);
    const normalizedExpectations = normalizeStringArray(whatWeExpectFromYou);
    const normalizedSkills = normalizeStringArray(skills);

    if (
      normalizedBulletPoints === null ||
      normalizedExpectations === null ||
      normalizedSkills === null
    ) {
      return res.status(400).json({
        success: false,
        message:
          "bulletPoints, whatWeExpectFromYou, and skills must be arrays of strings",
      });
    }

    if (startDate) {
      const parsedStartDate = new Date(startDate);
      if (Number.isNaN(parsedStartDate.getTime())) {
        return res.status(400).json({
          success: false,
          message: "startDate must be a valid date",
        });
      }
    }

    const job = await Job.create({
      title: title.trim(),
      description: description.trim(),
      bulletPoints: normalizedBulletPoints,
      mode,
      type,
      startDate: startDate || null,
      whatWeExpectFromYou: normalizedExpectations,
      skills: normalizedSkills,
      isActive: typeof isActive === "boolean" ? isActive : true,
      createdByAdminId: req.user?.id || null,
    });

    return res.status(201).json({
      success: true,
      message: "Job created successfully",
      job,
    });
  } catch (error) {
    console.error("Create job error:", error);
    return res.status(500).json({
      success: false,
      message: "Failed to create job",
      error: error.message,
    });
  }
};

const getJobs = async (req, res) => {
  try {
    const { type, mode, search } = req.query;
    const { page, limit, offset } = parsePagination(req.query);

    const where = { isActive: true };

    if (type) {
      if (!ALLOWED_TYPES.includes(type)) {
        return res.status(400).json({
          success: false,
          message: `type must be one of: ${ALLOWED_TYPES.join(", ")}`,
        });
      }
      where.type = type;
    }

    if (mode) {
      if (!ALLOWED_MODES.includes(mode)) {
        return res.status(400).json({
          success: false,
          message: `mode must be one of: ${ALLOWED_MODES.join(", ")}`,
        });
      }
      where.mode = mode;
    }

    if (search) {
      where[Op.or] = [
        { title: { [Op.iLike]: `%${search}%` } },
        { description: { [Op.iLike]: `%${search}%` } },
      ];
    }

    const { rows, count } = await Job.findAndCountAll({
      where,
      order: [
        ["startDate", "ASC"],
        ["createdAt", "DESC"],
      ],
      offset,
      limit,
    });

    return res.status(200).json({
      success: true,
      jobs: rows,
      pagination: {
        total: count,
        page,
        limit,
        totalPages: Math.ceil(count / limit),
      },
    });
  } catch (error) {
    console.error("Get jobs error:", error);
    return res.status(500).json({
      success: false,
      message: "Failed to fetch jobs",
      error: error.message,
    });
  }
};

const getAdminJobs = async (req, res) => {
  try {
    const { type, mode, search, isActive } = req.query;
    const { page, limit, offset } = parsePagination(req.query);

    const where = {};

    if (typeof isActive !== "undefined") {
      where.isActive = isActive === "true";
    }

    if (type) {
      if (!ALLOWED_TYPES.includes(type)) {
        return res.status(400).json({
          success: false,
          message: `type must be one of: ${ALLOWED_TYPES.join(", ")}`,
        });
      }
      where.type = type;
    }

    if (mode) {
      if (!ALLOWED_MODES.includes(mode)) {
        return res.status(400).json({
          success: false,
          message: `mode must be one of: ${ALLOWED_MODES.join(", ")}`,
        });
      }
      where.mode = mode;
    }

    if (search) {
      where[Op.or] = [
        { title: { [Op.iLike]: `%${search}%` } },
        { description: { [Op.iLike]: `%${search}%` } },
      ];
    }

    const { rows, count } = await Job.findAndCountAll({
      where,
      order: [["createdAt", "DESC"]],
      offset,
      limit,
    });

    return res.status(200).json({
      success: true,
      jobs: rows,
      pagination: {
        total: count,
        page,
        limit,
        totalPages: Math.ceil(count / limit),
      },
    });
  } catch (error) {
    console.error("Get admin jobs error:", error);
    return res.status(500).json({
      success: false,
      message: "Failed to fetch jobs",
      error: error.message,
    });
  }
};

const getJobById = async (req, res) => {
  try {
    const { jobId } = req.params;

    const job = await Job.findOne({
      where: {
        id: jobId,
        isActive: true,
      },
    });

    if (!job) {
      return res.status(404).json({
        success: false,
        message: "Job not found",
      });
    }

    return res.status(200).json({
      success: true,
      job,
    });
  } catch (error) {
    console.error("Get job by id error:", error);
    return res.status(500).json({
      success: false,
      message: "Failed to fetch job details",
      error: error.message,
    });
  }
};

const submitJobApplication = async (req, res) => {
  try {
    const { jobId } = req.params;
    const {
      profession,
      fullName,
      email,
      phone,
      gender,
      linkedinProfileUrl,
      githubPortfolioUrl,
      consentForJobUpdates,
    } = req.body;

    if (!fullName || !email || !phone || !gender) {
      return res.status(400).json({
        success: false,
        message:
          "fullName, email, phone and gender are required fields",
      });
    }

    if (!ALLOWED_GENDERS.includes(gender)) {
      return res.status(400).json({
        success: false,
        message: `gender must be one of: ${ALLOWED_GENDERS.join(", ")}`,
      });
    }

    const normalizedEmail = email.trim().toLowerCase();
    if (!EMAIL_PATTERN.test(normalizedEmail)) {
      return res.status(400).json({
        success: false,
        message: "Please provide a valid email address",
      });
    }

    const normalizedLinkedInUrl = normalizeOptionalUrl(linkedinProfileUrl);
    const normalizedPortfolioUrl = normalizeOptionalUrl(githubPortfolioUrl);

    if (normalizedLinkedInUrl && !isValidHttpUrl(normalizedLinkedInUrl)) {
      return res.status(400).json({
        success: false,
        message: "LinkedIn profile link must be a valid URL",
      });
    }

    if (normalizedPortfolioUrl && !isValidHttpUrl(normalizedPortfolioUrl)) {
      return res.status(400).json({
        success: false,
        message: "GitHub/Portfolio link must be a valid URL",
      });
    }

    const job = await Job.findOne({
      where: {
        id: jobId,
        isActive: true,
      },
    });

    if (!job) {
      return res.status(404).json({
        success: false,
        message: "Selected job is not available",
      });
    }

    if (!req.file || !req.fileUrl) {
      return res.status(400).json({
        success: false,
        message: "Resume is required and must be uploaded as PDF",
      });
    }

    const application = await JobApplication.create({
      jobId: job.id,
      profession:
        typeof profession === "string" && profession.trim()
          ? profession.trim()
          : "Not provided",
      fullName: fullName.trim(),
      email: normalizedEmail,
      phone: phone.trim(),
      linkedInUrl: normalizedLinkedInUrl,
      portfolioUrl: normalizedPortfolioUrl,
      gender,
      resumeUrl: req.fileUrl,
      resumePublicId: req.filePublicId || null,
      resumeFileName: req.file.originalname || null,
      consentForJobUpdates: toBoolean(consentForJobUpdates),
      emailStatus: "pending",
    });

    // Queue email to keep API response fast and process notifications one-by-one.
    enqueueJobApplicationConfirmationEmail(application.id).catch((error) => {
      console.error("Failed to enqueue job application email:", error);
    });

    return res.status(201).json({
      success: true,
      message:
        "Your application has been received successfully. If shortlisted, our team will contact you for the next round.",
      applicationId: application.id,
    });
  } catch (error) {
    console.error("Submit job application error:", error);
    return res.status(500).json({
      success: false,
      message: "Failed to submit job application",
      error: error.message,
    });
  }
};

const updateJobStatus = async (req, res) => {
  try {
    const { jobId } = req.params;
    const { isActive } = req.body;

    if (typeof isActive !== "boolean") {
      return res.status(400).json({
        success: false,
        message: "isActive must be a boolean",
      });
    }

    const job = await Job.findByPk(jobId);

    if (!job) {
      return res.status(404).json({
        success: false,
        message: "Job not found",
      });
    }

    job.isActive = isActive;
    await job.save();

    return res.status(200).json({
      success: true,
      message: `Job ${isActive ? "activated" : "deactivated"} successfully`,
      job,
    });
  } catch (error) {
    console.error("Update job status error:", error);
    return res.status(500).json({
      success: false,
      message: "Failed to update job status",
      error: error.message,
    });
  }
};

const getAdminJobApplications = async (req, res) => {
  try {
    const { search, jobId, gender } = req.query;
    const { page, limit, offset } = parsePagination(req.query);

    const where = {};

    if (jobId) {
      where.jobId = jobId;
    }

    if (gender) {
      if (!ALLOWED_GENDERS.includes(gender)) {
        return res.status(400).json({
          success: false,
          message: `gender must be one of: ${ALLOWED_GENDERS.join(", ")}`,
        });
      }

      where.gender = gender;
    }

    if (search) {
      where[Op.or] = [
        { fullName: { [Op.iLike]: `%${search}%` } },
        { email: { [Op.iLike]: `%${search}%` } },
        { phone: { [Op.iLike]: `%${search}%` } },
        { profession: { [Op.iLike]: `%${search}%` } },
      ];
    }

    const { rows, count } = await JobApplication.findAndCountAll({
      where,
      include: [
        {
          model: Job,
          as: "job",
          attributes: ["id", "title", "type", "mode", "isActive", "startDate"],
        },
      ],
      order: [["createdAt", "DESC"]],
      offset,
      limit,
    });

    return res.status(200).json({
      success: true,
      applications: rows,
      pagination: {
        total: count,
        page,
        limit,
        totalPages: Math.ceil(count / limit),
      },
    });
  } catch (error) {
    console.error("Get admin job applications error:", error);
    return res.status(500).json({
      success: false,
      message: "Failed to fetch job applications",
      error: error.message,
    });
  }
};

const getAdminJobApplicationById = async (req, res) => {
  try {
    const { applicationId } = req.params;

    const application = await JobApplication.findByPk(applicationId, {
      include: [
        {
          model: Job,
          as: "job",
        },
      ],
    });

    if (!application) {
      return res.status(404).json({
        success: false,
        message: "Job application not found",
      });
    }

    return res.status(200).json({
      success: true,
      application,
    });
  } catch (error) {
    console.error("Get admin job application by id error:", error);
    return res.status(500).json({
      success: false,
      message: "Failed to fetch job application details",
      error: error.message,
    });
  }
};

const getAdminJobApplicationResume = async (req, res) => {
  try {
    const { applicationId } = req.params;

    const application = await JobApplication.findByPk(applicationId, {
      attributes: ["id", "resumeUrl", "resumeFileName"],
    });

    if (!application) {
      return res.status(404).json({
        success: false,
        message: "Job application not found",
      });
    }

    if (!application.resumeUrl) {
      return res.status(404).json({
        success: false,
        message: "Resume not available for this application",
      });
    }

    const upstreamResponse = await fetch(application.resumeUrl);

    if (!upstreamResponse.ok) {
      return res.status(502).json({
        success: false,
        message: "Unable to retrieve resume file",
      });
    }

    const fileBuffer = Buffer.from(await upstreamResponse.arrayBuffer());
    const rawFileName =
      typeof application.resumeFileName === "string" &&
      application.resumeFileName.trim()
        ? application.resumeFileName.trim()
        : `resume-${application.id}.pdf`;

    const normalizedFileName = rawFileName.toLowerCase().endsWith(".pdf")
      ? rawFileName
      : `${rawFileName}.pdf`;

    const safeFileName = normalizedFileName.replace(/[\r\n\"]/g, "");

    res.setHeader("Content-Type", "application/pdf");
    res.setHeader("Content-Length", String(fileBuffer.length));
    res.setHeader(
      "Content-Disposition",
      `inline; filename="${safeFileName}"`
    );

    return res.status(200).send(fileBuffer);
  } catch (error) {
    console.error("Get admin job application resume error:", error);
    return res.status(500).json({
      success: false,
      message: "Failed to fetch job application resume",
      error: error.message,
    });
  }
};

const acceptJobApplication = async (req, res) => {
  try {
    const { applicationId } = req.params;

    const application = await JobApplication.findByPk(applicationId, {
      include: [
        {
          model: Job,
          as: "job",
        },
      ],
    });

    if (!application) {
      return res.status(404).json({
        success: false,
        message: "Job application not found",
      });
    }

    if (application.acceptanceEmailSentAt || application.rejectionEmailSentAt) {
      return res.status(400).json({
        success: false,
        message: "A decision email has already been sent",
      });
    }

    await sendJobApplicationAcceptedEmail({
      to: application.email,
      fullName: application.fullName,
      jobTitle: application.job?.title || "the role you applied for",
    });

    application.acceptanceEmailSentAt = new Date();
    await application.save();

    return res.status(200).json({
      success: true,
      message: "Acceptance email sent successfully",
      application,
    });
  } catch (error) {
    console.error("Accept job application error:", error);
    return res.status(500).json({
      success: false,
      message: "Failed to send acceptance email",
      error: error.message,
    });
  }
};

const rejectJobApplication = async (req, res) => {
  try {
    const { applicationId } = req.params;
    const { reason } = req.body || {};

    const application = await JobApplication.findByPk(applicationId, {
      include: [
        {
          model: Job,
          as: "job",
        },
      ],
    });

    if (!application) {
      return res.status(404).json({
        success: false,
        message: "Job application not found",
      });
    }

    if (application.acceptanceEmailSentAt || application.rejectionEmailSentAt) {
      return res.status(400).json({
        success: false,
        message: "A decision email has already been sent",
      });
    }

    await sendJobApplicationRejectedEmail({
      to: application.email,
      fullName: application.fullName,
      jobTitle: application.job?.title || "the role you applied for",
      reason: typeof reason === "string" && reason.trim() ? reason.trim() : null,
    });

    application.rejectionEmailSentAt = new Date();
    await application.save();

    return res.status(200).json({
      success: true,
      message: "Rejection email sent successfully",
      application,
    });
  } catch (error) {
    console.error("Reject job application error:", error);
    return res.status(500).json({
      success: false,
      message: "Failed to send rejection email",
      error: error.message,
    });
  }
};

module.exports = {
  createJob,
  getJobs,
  getAdminJobs,
  getJobById,
  submitJobApplication,
  updateJobStatus,
  getAdminJobApplications,
  getAdminJobApplicationById,
  getAdminJobApplicationResume,
  acceptJobApplication,
  rejectJobApplication,
};
