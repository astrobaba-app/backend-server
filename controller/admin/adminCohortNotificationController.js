const axios = require("axios");
const FormData = require("form-data");
require("dotenv").config();

const NOTIFICATION_SERVER_URL = process.env.NOTIFICATION_SERVER_URL || "http://localhost:6002";
const INTERNAL_TOKEN = process.env.NOTIFICATION_INTERNAL_TOKEN;

const cohortBroadcastNotification = async (req, res) => {
  try {
    const { title, message, actionUrl, targetCohorts, combinationLogic, targetDominantCohortOnly, scheduledAt } = req.body;
    const adminId = req.user.id;
    const adminName = req.user.name;

    const response = await axios.post(
      `${NOTIFICATION_SERVER_URL}/api/internal/notifications/cohort-broadcast-notification`,
      {
        title,
        message,
        actionUrl,
        targetCohorts,
        combinationLogic,
        targetDominantCohortOnly,
        scheduledAt,
        adminId,
        adminName,
      },
      {
        headers: {
          Authorization: `Bearer ${INTERNAL_TOKEN}`,
        },
      }
    );

    res.status(response.status).json(response.data);
  } catch (error) {
    console.error("Error in cohortBroadcastNotification proxy:", error.response?.data || error.message);
    res.status(500).json({
      success: false,
      message: "Failed to forward cohort broadcast request",
      error: error.response?.data?.message || error.message,
    });
  }
};

const cohortExcelUploadNotification = async (req, res) => {
  try {
    if (!req.file) {
      return res.status(400).json({ success: false, message: "No excel file provided" });
    }

    const adminId = req.user.id;
    const adminName = req.user.name;
    const { deliveryMode, planType, startDate, times, targetCohorts, combinationLogic, targetDominantCohortOnly } = req.body;

    const form = new FormData();
    form.append("excelFile", req.file.buffer, req.file.originalname);
    form.append("adminId", String(adminId));
    form.append("adminName", String(adminName));

    if (deliveryMode) form.append("deliveryMode", deliveryMode);
    if (planType) form.append("planType", planType);
    if (startDate) form.append("startDate", startDate);
    if (times) form.append("times", typeof times === "object" ? JSON.stringify(times) : times);
    if (targetCohorts) form.append("targetCohorts", typeof targetCohorts === "object" ? JSON.stringify(targetCohorts) : targetCohorts);
    if (combinationLogic) form.append("combinationLogic", combinationLogic);
    if (targetDominantCohortOnly !== undefined) form.append("targetDominantCohortOnly", String(targetDominantCohortOnly));

    const response = await axios.post(
      `${NOTIFICATION_SERVER_URL}/api/internal/notifications/cohort-excel-upload`,
      form,
      {
        headers: {
          ...form.getHeaders(),
          Authorization: `Bearer ${INTERNAL_TOKEN}`,
        },
      }
    );

    res.status(response.status).json(response.data);
  } catch (error) {
    console.error("Error in cohortExcelUpload proxy:", error.response?.data || error.message);
    res.status(500).json({
      success: false,
      message: "Failed to forward cohort excel upload",
      error: error.response?.data?.message || error.message,
    });
  }
};

const getCohortNotificationTemplate = async (req, res) => {
  const XLSX = require("xlsx");
  const rows = [
    {
      title: "Exclusive Pro Offer",
      message: "Check out this special offer for premium users.",
      action_url: "https://graho.app/premium",
    },
    {
      title: "Love Horoscope Update",
      message: "See what the stars have in store for your relationships.",
      action_url: "https://graho.app/love",
    },
  ];

  const worksheet = XLSX.utils.json_to_sheet(rows);
  const workbook = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(workbook, worksheet, "Cohort Notifications");
  const buffer = XLSX.write(workbook, { type: "buffer", bookType: "xlsx" });

  res.setHeader(
    "Content-Type",
    "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet"
  );
  res.setHeader(
    "Content-Disposition",
    'attachment; filename="cohort-push-template.xlsx"'
  );
  return res.send(buffer);
};

module.exports = {
  cohortBroadcastNotification,
  cohortExcelUploadNotification,
  getCohortNotificationTemplate,
};
