const { Op } = require("sequelize");
const Job = require("../model/job/job");
const JobApplication = require("../model/job/jobApplication");
const { sendJobApplicationReceivedEmail } = require("../emailService/jobApplicationEmail");

const MAX_EMAIL_ATTEMPTS = 3;
const WORKER_INTERVAL_MS = 3000;

let isProcessing = false;
let workerStarted = false;

const isJobApplicationEmailQueueEnabled = () => {
  return String(process.env.JOB_APPLICATION_EMAIL_QUEUE_ENABLED || "false").toLowerCase() === "true";
};

const processNextQueuedJobApplicationEmail = async () => {
  if (isProcessing) {
    return;
  }

  let application = null;
  isProcessing = true;

  try {
    application = await JobApplication.findOne({
      where: {
        emailStatus: {
          [Op.in]: ["pending", "failed"],
        },
        emailAttempts: {
          [Op.lt]: MAX_EMAIL_ATTEMPTS,
        },
      },
      order: [["createdAt", "ASC"]],
    });

    if (!application) {
      return;
    }

    application.emailStatus = "processing";
    application.emailAttempts = (application.emailAttempts || 0) + 1;
    application.emailLastError = null;
    await application.save();

    const relatedJob = await Job.findByPk(application.jobId);

    await sendJobApplicationReceivedEmail({
      to: application.email,
      fullName: application.fullName,
      jobTitle: relatedJob?.title || "the role you applied for",
    });

    application.emailStatus = "sent";
    application.emailSentAt = new Date();
    application.emailLastError = null;
    await application.save();
  } catch (error) {
    console.error("Job application email queue error:", error);

    if (application) {
      application.emailStatus = "failed";
      application.emailLastError = error.message || "Email sending failed";
      await application.save().catch(() => null);
    }
  } finally {
    isProcessing = false;
  }
};

const enqueueJobApplicationConfirmationEmail = async (applicationId) => {
  if (!applicationId) {
    return;
  }

  await JobApplication.update(
    {
      emailStatus: "pending",
    },
    {
      where: {
        id: applicationId,
      },
    }
  );

  if (isJobApplicationEmailQueueEnabled()) {
    setImmediate(() => {
      void processNextQueuedJobApplicationEmail();
    });
  }
};

const startJobApplicationEmailQueueWorker = () => {
  if (!isJobApplicationEmailQueueEnabled()) {
    console.log("Job application email queue worker disabled by JOB_APPLICATION_EMAIL_QUEUE_ENABLED=false");
    return;
  }

  if (workerStarted) {
    return;
  }

  workerStarted = true;

  setInterval(() => {
    void processNextQueuedJobApplicationEmail();
  }, WORKER_INTERVAL_MS);

  console.log("Job application email queue worker initialized");
};

module.exports = {
  enqueueJobApplicationConfirmationEmail,
  startJobApplicationEmailQueueWorker,
};
