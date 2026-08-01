const Admin = require("../../model/admin/admin");
const Astrologer = require("../../model/astrologer/astrologer");
const AstrologerBroadcastLog = require("../../model/admin/astrologerBroadcastLog");
const astrologerNotificationService = require("../../services/astrologerNotificationService");
const axios = require("axios");

const normalizeTargetAstrologerIds = async (targetAstrologerIds = []) => {
  const uniqueIds = Array.from(
    new Set((targetAstrologerIds || []).map((id) => String(id)).filter(Boolean))
  );

  if (!uniqueIds.length) {
    return [];
  }

  const astrologers = await Astrologer.findAll({
    where: { id: uniqueIds },
    attributes: ["id"],
  });

  return astrologers.map((item) => String(item.id));
};

const sendAstrologerNotification = async (req, res) => {
  try {
    const { title, message, actionUrl, data, targetAstrologerIds } = req.body;

    if (!title || !message) {
      return res.status(400).json({
        success: false,
        message: "Title and message are required",
      });
    }

    const normalizedTargetIds = await normalizeTargetAstrologerIds(
      targetAstrologerIds
    );
    const targetMode = normalizedTargetIds.length ? "selected" : "all";

    const admin = await Admin.findByPk(req.user.id, { attributes: ["id", "name"] });

    if (targetMode === "all" && process.env.USE_STANDALONE_NOTIFICATION_SERVER === 'true') {
      const response = await axios.post(`${process.env.NOTIFICATION_SERVER_URL}/api/internal/notifications/broadcast-astrologer-notification`, {
        title,
        message,
        actionUrl,
        data: { notificationAudience: "astrologer", ...(data || {}) },
        adminId: req.user.id,
        adminName: admin?.name || ""
      }, {
        headers: { 'Authorization': `Bearer ${process.env.NOTIFICATION_INTERNAL_TOKEN}` }
      });
      return res.status(200).json(response.data);
    }

    const broadcastLog = await AstrologerBroadcastLog.create({
      adminId: req.user.id,
      adminName: admin?.name || "",
      title,
      message,
      actionUrl: actionUrl || null,
      targetMode,
      targetAstrologerIds: normalizedTargetIds,
      totalAstrologers: 0,
      pushSuccessCount: 0,
      pushFailureCount: 0,
    });

    const payload = {
      type: "admin_broadcast",
      title,
      message,
      data: {
        ...(data || {}),
        notificationAudience: "astrologer",
        astrologerBroadcastLogId: broadcastLog.id,
      },
      actionUrl,
      priority: "high",
      sendPush: true,
    };

    const result = normalizedTargetIds.length
      ? await astrologerNotificationService.sendToAstrologers(
          normalizedTargetIds,
          payload
        )
      : await astrologerNotificationService.broadcastToAllAstrologers(payload);

    await broadcastLog.update({
      totalAstrologers: result.totalSent || 0,
      pushSuccessCount: result.pushSuccessCount || 0,
      pushFailureCount: result.pushFailureCount || 0,
    });

    res.status(200).json({
      success: true,
      message:
        targetMode === "all"
          ? "Astrologer broadcast sent successfully"
          : "Astrologer notification sent successfully",
      data: {
        targetMode,
        totalAstrologers: result.totalSent || 0,
        pushSuccessCount: result.pushSuccessCount || 0,
        pushFailureCount: result.pushFailureCount || 0,
      },
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      message: "Failed to send astrologer notification",
      error: error.message,
    });
  }
};

const getAstrologerBroadcastHistory = async (req, res) => {
  try {
    const page = Math.max(1, parseInt(req.query.page, 10) || 1);
    const limit = Math.min(50, Math.max(1, parseInt(req.query.limit, 10) || 10));
    const offset = (page - 1) * limit;

    const { rows, count } = await AstrologerBroadcastLog.findAndCountAll({
      order: [["createdAt", "DESC"]],
      limit,
      offset,
    });

    res.status(200).json({
      success: true,
      history: rows,
      pagination: {
        total: count,
        page,
        limit,
        totalPages: Math.ceil(count / limit),
      },
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      message: "Failed to fetch astrologer broadcast history",
      error: error.message,
    });
  }
};

const resendAstrologerBroadcast = async (req, res) => {
  try {
    const log = await AstrologerBroadcastLog.findByPk(req.params.logId);

    if (!log) {
      return res.status(404).json({
        success: false,
        message: "Broadcast log not found",
      });
    }

    const admin = await Admin.findByPk(req.user.id, { attributes: ["id", "name"] });

    if (log.targetMode === "all" && process.env.USE_STANDALONE_NOTIFICATION_SERVER === 'true') {
      const response = await axios.post(`${process.env.NOTIFICATION_SERVER_URL}/api/internal/notifications/broadcast-astrologer-notification`, {
        title: log.title,
        message: log.message,
        actionUrl: log.actionUrl,
        data: { notificationAudience: "astrologer" },
        adminId: req.user.id,
        adminName: admin?.name || "",
        sourceAstrologerBroadcastLogId: log.id
      }, {
        headers: { 'Authorization': `Bearer ${process.env.NOTIFICATION_INTERNAL_TOKEN}` }
      });
      return res.status(200).json(response.data);
    }

    const newLog = await AstrologerBroadcastLog.create({
      adminId: req.user.id,
      adminName: admin?.name || "",
      title: log.title,
      message: log.message,
      actionUrl: log.actionUrl,
      targetMode: log.targetMode,
      targetAstrologerIds: log.targetAstrologerIds || [],
      totalAstrologers: 0,
      pushSuccessCount: 0,
      pushFailureCount: 0,
    });

    const targetAstrologerIds = Array.isArray(log.targetAstrologerIds)
      ? log.targetAstrologerIds.map((id) => String(id))
      : [];

    const payload = {
      type: "admin_broadcast",
      title: log.title,
      message: log.message,
      data: {
        notificationAudience: "astrologer",
        astrologerBroadcastLogId: newLog.id,
        sourceAstrologerBroadcastLogId: log.id,
      },
      actionUrl: log.actionUrl,
      priority: "high",
      sendPush: true,
    };

    const result =
      log.targetMode === "selected" && targetAstrologerIds.length
        ? await astrologerNotificationService.sendToAstrologers(
            targetAstrologerIds,
            payload
          )
        : await astrologerNotificationService.broadcastToAllAstrologers(payload);

    await newLog.update({
      totalAstrologers: result.totalSent || 0,
      pushSuccessCount: result.pushSuccessCount || 0,
      pushFailureCount: result.pushFailureCount || 0,
    });

    res.status(200).json({
      success: true,
      message: "Astrologer notification resent successfully",
      data: {
        logId: newLog.id,
        totalAstrologers: result.totalSent || 0,
        pushSuccessCount: result.pushSuccessCount || 0,
        pushFailureCount: result.pushFailureCount || 0,
      },
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      message: "Failed to resend astrologer notification",
      error: error.message,
    });
  }
};

module.exports = {
  sendAstrologerNotification,
  getAstrologerBroadcastHistory,
  resendAstrologerBroadcast,
};
