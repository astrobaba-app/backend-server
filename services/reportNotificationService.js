const notificationService = require("./notificationService");

const REPORT_LABELS = {
  daily_kundali: "Daily report",
  yearly_kundali: "Yearly report",
  wealth_kundali: "Wealth report",
  sade_sati_kundali: "Sade Sati report",
  palmistry: "Palm report",
};

const getReportLabel = (reportType) =>
  REPORT_LABELS[reportType] || "Your report";

const getNotificationKey = (status) => {
  const value = String(status || "").toLowerCase();
  if (value === "completed") return "completed";
  if (value.includes("failed")) return "failed";
  return null;
};

const notifyReportGenerationStatus = async (reportRequest, statusOverride) => {
  if (!reportRequest?.userId) {
    return null;
  }

  const status = statusOverride || reportRequest.status;
  const notificationKey = getNotificationKey(status);

  if (!notificationKey) {
    return null;
  }

  const metadata = reportRequest.metadata || {};
  const reportNotifications = metadata.reportNotifications || {};

  if (reportNotifications[notificationKey]?.sentAt) {
    return null;
  }

  const reportLabel = getReportLabel(reportRequest.reportType);
  const isCompleted = notificationKey === "completed";
  const title = isCompleted
    ? `${reportLabel} is ready`
    : `${reportLabel} update`;
  const message = isCompleted
    ? "Your report has been prepared and is ready to download."
    : "We could not prepare your report right now. Please open My Reports to check the latest status.";

  try {
    const notification = await notificationService.sendToUser(reportRequest.userId, {
      type: "general",
      title,
      message,
      actionUrl: "/reports",
      priority: isCompleted ? "high" : "medium",
      data: {
        notificationCategory: "report_generation",
        reportRequestId: String(reportRequest.id),
        reportType: String(reportRequest.reportType || ""),
        reportStatus: String(status || ""),
        pdfUrl: reportRequest.pdfUrl || "",
      },
    });

    await reportRequest.update({
      metadata: {
        ...metadata,
        reportNotifications: {
          ...reportNotifications,
          [notificationKey]: {
            sentAt: new Date().toISOString(),
            notificationId: notification?.id || null,
            status,
          },
        },
      },
    });

    return notification;
  } catch (error) {
    console.error("[ReportNotification] Failed to notify user", {
      reportRequestId: reportRequest.id,
      userId: reportRequest.userId,
      status,
      message: error.message,
    });
    return null;
  }
};

module.exports = {
  notifyReportGenerationStatus,
};
