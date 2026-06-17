const XLSX = require("xlsx");
const scheduledNotificationService = require("../../services/scheduledNotificationService");

const parseTimes = (value) => {
  if (Array.isArray(value)) return value;
  if (typeof value === "string") {
    try {
      const parsed = JSON.parse(value);
      if (Array.isArray(parsed)) return parsed;
    } catch {
      return value.split(",").map((item) => item.trim());
    }
  }
  return [];
};

const parseWorkbookRows = (file) => {
  if (!file?.buffer) {
    throw new Error("Excel file is required");
  }

  const workbook = XLSX.read(file.buffer, {
    type: "buffer",
    cellDates: true,
  });
  const rows = [];

  workbook.SheetNames.forEach((sheetName) => {
    const sheet = workbook.Sheets[sheetName];
    const sheetRows = XLSX.utils.sheet_to_json(sheet, { defval: "" });
    rows.push(...sheetRows);
  });

  return rows;
};

const uploadScheduledNotifications = async (req, res) => {
  try {
    const rows = parseWorkbookRows(req.file);
    const batchPayload = await scheduledNotificationService.createBatchFromRows({
      adminId: req.user.id,
      name: req.body.name,
      planType: req.body.planType,
      scheduleMode: req.body.scheduleMode,
      startDate: req.body.startDate,
      times: parseTimes(req.body.times),
      sourceFileName: req.file.originalname,
      rows,
    });

    return res.status(201).json({
      success: true,
      message: "Scheduled notifications uploaded successfully",
      ...batchPayload,
    });
  } catch (error) {
    console.error("Upload scheduled notifications error:", error);
    return res.status(400).json({
      success: false,
      message: error.message || "Failed to upload scheduled notifications",
    });
  }
};

const listScheduledNotificationBatches = async (req, res) => {
  try {
    const result = await scheduledNotificationService.listBatches(req.query);
    return res.status(200).json({ success: true, ...result });
  } catch (error) {
    console.error("List scheduled notification batches error:", error);
    return res.status(500).json({
      success: false,
      message: "Failed to fetch scheduled notification batches",
      error: error.message,
    });
  }
};

const getScheduledNotificationBatch = async (req, res) => {
  try {
    const result = await scheduledNotificationService.getBatch(req.params.batchId);
    if (!result) {
      return res.status(404).json({ success: false, message: "Scheduled batch not found" });
    }

    return res.status(200).json({ success: true, ...result });
  } catch (error) {
    console.error("Get scheduled notification batch error:", error);
    return res.status(500).json({
      success: false,
      message: "Failed to fetch scheduled notification batch",
      error: error.message,
    });
  }
};

const getScheduledNotificationGroups = async (req, res) => {
  try {
    const groups = await scheduledNotificationService.getGroupedItems(req.query);
    return res.status(200).json({ success: true, groups });
  } catch (error) {
    console.error("Get scheduled notification groups error:", error);
    return res.status(500).json({
      success: false,
      message: "Failed to fetch scheduled notification groups",
      error: error.message,
    });
  }
};

const getScheduledNotificationHistory = async (req, res) => {
  try {
    const result = await scheduledNotificationService.getSentHistory(req.query);
    return res.status(200).json({ success: true, ...result });
  } catch (error) {
    console.error("Get scheduled notification history error:", error);
    return res.status(500).json({
      success: false,
      message: "Failed to fetch scheduled notification history",
      error: error.message,
    });
  }
};

const updateScheduledNotificationItem = async (req, res) => {
  try {
    const item = await scheduledNotificationService.updateItem(req.params.itemId, req.body);
    return res.status(200).json({
      success: true,
      message: "Scheduled notification updated",
      item,
    });
  } catch (error) {
    return res.status(400).json({
      success: false,
      message: error.message || "Failed to update scheduled notification",
    });
  }
};

const cancelScheduledNotificationItem = async (req, res) => {
  try {
    const item = await scheduledNotificationService.cancelItem(req.params.itemId);
    return res.status(200).json({
      success: true,
      message: "Scheduled notification cancelled",
      item,
    });
  } catch (error) {
    return res.status(400).json({
      success: false,
      message: error.message || "Failed to cancel scheduled notification",
    });
  }
};

const cancelScheduledNotificationBatch = async (req, res) => {
  try {
    const result = await scheduledNotificationService.cancelBatch(req.params.batchId);
    return res.status(200).json({
      success: true,
      message: "Scheduled batch cancelled",
      ...result,
    });
  } catch (error) {
    return res.status(400).json({
      success: false,
      message: error.message || "Failed to cancel scheduled batch",
    });
  }
};

const deleteScheduledNotificationBatch = async (req, res) => {
  try {
    await scheduledNotificationService.deleteBatch(req.params.batchId);
    return res.status(200).json({
      success: true,
      message: "Scheduled batch deleted",
    });
  } catch (error) {
    return res.status(400).json({
      success: false,
      message: error.message || "Failed to delete scheduled batch",
    });
  }
};

const getScheduledNotificationTemplate = async (req, res) => {
  const rows = [
    {
      title: "Daily Horoscope Is Ready",
      message: "Open Graho to read your updated horoscope.",
      action_url: "https://graho.app/horoscope",
    },
    {
      title: "Evening Consultation Offer",
      message: "Book your consultation slot before 9 PM.",
      action_url: "https://graho.app/consult",
    },
  ];

  const worksheet = XLSX.utils.json_to_sheet(rows);
  const workbook = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(workbook, worksheet, "Notifications");
  const buffer = XLSX.write(workbook, { type: "buffer", bookType: "xlsx" });

  res.setHeader(
    "Content-Type",
    "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet"
  );
  res.setHeader(
    "Content-Disposition",
    'attachment; filename="scheduled-notifications-template.xlsx"'
  );
  return res.send(buffer);
};

module.exports = {
  uploadScheduledNotifications,
  listScheduledNotificationBatches,
  getScheduledNotificationBatch,
  getScheduledNotificationGroups,
  getScheduledNotificationHistory,
  updateScheduledNotificationItem,
  cancelScheduledNotificationItem,
  cancelScheduledNotificationBatch,
  deleteScheduledNotificationBatch,
  getScheduledNotificationTemplate,
};
