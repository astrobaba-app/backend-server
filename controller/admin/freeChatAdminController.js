const {
  grantFreeChatAllocations,
  listFreeChatAllocationsForAdmin,
  revokeFreeChatAllocation,
} = require("../../services/freeChatService");
const {
  enqueueFreeChatGrantNotifications,
} = require("../../services/freeChatGrantNotificationQueue");

const grantAdminFreeChatAllocations = async (req, res) => {
  try {
    const adminId = req.admin?.id || req.user?.id;
    const {
      targetMode = "single",
      userIds,
      minutes,
      applicableChatType,
      campaignName,
      reason,
      notificationTitle,
      notificationBody,
      expiresAt,
      filters,
      metadata,
    } = req.body || {};

    const result = await grantFreeChatAllocations({
      adminId,
      targetMode,
      userIds,
      minutes,
      applicableChatType,
      campaignName,
      reason,
      expiresAt,
      filters,
      metadata,
    });

    setImmediate(() => {
      enqueueFreeChatGrantNotifications({
        userIds: result.targetUserIds,
        allocationsByUserId: Object.fromEntries(
          (result.allocations || []).map((allocation) => [
            String(allocation.userId),
            allocation,
          ])
        ),
        notificationTitle,
        notificationBody,
      }).catch((queueError) => {
        console.error("Free chat grant notification queue error:", queueError);
      });
    });

    return res.status(201).json({
      success: true,
      message: "Free chat allocations saved successfully. Notifications are being queued.",
      grantedCount: result.targetUserIds.length,
      allocations: result.allocations,
    });
  } catch (error) {
    console.error("Grant free chat allocations error:", error);
    return res.status(400).json({
      success: false,
      message: error.message || "Failed to grant free chat allocations",
    });
  }
};

const getAdminFreeChatAllocations = async (req, res) => {
  try {
    const result = await listFreeChatAllocationsForAdmin(req.query || {});

    return res.status(200).json({
      success: true,
      ...result,
    });
  } catch (error) {
    console.error("List free chat allocations error:", error);
    return res.status(500).json({
      success: false,
      message: "Failed to fetch free chat allocations",
      error: error.message,
    });
  }
};

const revokeAdminFreeChatAllocation = async (req, res) => {
  try {
    const adminId = req.admin?.id || req.user?.id;
    const allocation = await revokeFreeChatAllocation({
      allocationId: req.params.allocationId,
      adminId,
    });

    return res.status(200).json({
      success: true,
      message: "Free chat allocation revoked successfully",
      allocation,
    });
  } catch (error) {
    console.error("Revoke free chat allocation error:", error);
    return res.status(400).json({
      success: false,
      message: error.message || "Failed to revoke free chat allocation",
    });
  }
};

module.exports = {
  getAdminFreeChatAllocations,
  grantAdminFreeChatAllocations,
  revokeAdminFreeChatAllocation,
};
