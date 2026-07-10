const AstrologerNotification = require("../../model/notification/astrologerNotification");
const astrologerNotificationService = require("../../services/astrologerNotificationService");

const getAstrologerNotifications = async (req, res) => {
  try {
    const astrologerId = req.user.id;
    const { isRead } = req.query;
    const rawPage = Number.parseInt(req.query.page, 10);
    const rawLimit = Number.parseInt(req.query.limit, 10);
    const page = Number.isFinite(rawPage) && rawPage > 0 ? rawPage : 1;
    const limit =
      Number.isFinite(rawLimit) && rawLimit > 0 ? Math.min(rawLimit, 50) : 20;
    const offset = (page - 1) * limit;
    const includeUnreadCount = req.query.includeUnreadCount === "true";

    const where = { astrologerId };
    if (isRead !== undefined) {
      where.isRead = isRead === "true";
    }

    const rows = await AstrologerNotification.findAll({
      where,
      order: [["createdAt", "DESC"]],
      limit: limit + 1,
      offset,
    });

    const hasMore = rows.length > limit;
    const notifications = hasMore ? rows.slice(0, limit) : rows;

    let unreadCount;
    if (includeUnreadCount) {
      unreadCount = await astrologerNotificationService.getUnreadCount(astrologerId);
    }

    res.status(200).json({
      success: true,
      notifications,
      unreadCount,
      pagination: {
        page,
        limit,
        hasMore,
        nextPage: hasMore ? page + 1 : null,
      },
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      message: "Failed to fetch astrologer notifications",
      error: error.message,
    });
  }
};

const getAstrologerUnreadCount = async (req, res) => {
  try {
    const unreadCount = await astrologerNotificationService.getUnreadCount(
      req.user.id
    );

    res.status(200).json({
      success: true,
      unreadCount,
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      message: "Failed to fetch unread count",
      error: error.message,
    });
  }
};

const markAstrologerNotificationAsRead = async (req, res) => {
  try {
    await astrologerNotificationService.markAsRead(
      req.params.notificationId,
      req.user.id
    );

    res.status(200).json({
      success: true,
      message: "Notification marked as read",
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      message: error.message || "Failed to mark notification as read",
    });
  }
};

const markAllAstrologerNotificationsAsRead = async (req, res) => {
  try {
    await astrologerNotificationService.markAllAsRead(req.user.id);

    res.status(200).json({
      success: true,
      message: "All notifications marked as read",
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      message: "Failed to mark all notifications as read",
      error: error.message,
    });
  }
};

const deleteAstrologerNotification = async (req, res) => {
  try {
    const notification = await AstrologerNotification.findOne({
      where: {
        id: req.params.notificationId,
        astrologerId: req.user.id,
      },
    });

    if (!notification) {
      return res.status(404).json({
        success: false,
        message: "Notification not found",
      });
    }

    await notification.destroy();

    res.status(200).json({
      success: true,
      message: "Notification deleted successfully",
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      message: "Failed to delete notification",
      error: error.message,
    });
  }
};

module.exports = {
  getAstrologerNotifications,
  getAstrologerUnreadCount,
  markAstrologerNotificationAsRead,
  markAllAstrologerNotificationsAsRead,
  deleteAstrologerNotification,
};
