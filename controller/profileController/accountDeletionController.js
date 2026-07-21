const AccountDeletionRequest = require("../../model/user/accountDeletionRequest");

const requestAccountDeletion = async (req, res) => {
  try {
    const existingRequest = await AccountDeletionRequest.findOne({
      where: {
        userId: req.user.id,
        status: "pending",
      },
    });

    if (existingRequest) {
      return res.status(400).json({
        success: false,
        message: "You already have a pending account deletion request",
      });
    }

    const deletionRequest = await AccountDeletionRequest.create({
      userId: req.user.id,
      reason: req.body.reason || null,
      status: "pending",
      requestedAt: new Date(),
    });

    res.status(201).json({
      success: true,
      message: "Account deletion request submitted successfully. Our team will review it shortly.",
      request: deletionRequest,
    });
  } catch (error) {
    console.error("Request account deletion error:", error);
    res.status(500).json({
      success: false,
      message: "Failed to submit account deletion request",
      error: error.message,
    });
  }
};

const getDeletionRequestStatus = async (req, res) => {
  try {
    const deletionRequest = await AccountDeletionRequest.findOne({
      where: {
        userId: req.user.id,
      },
      order: [["createdAt", "DESC"]],
    });

    res.status(200).json({
      success: true,
      request: deletionRequest,
    });
  } catch (error) {
    console.error("Get deletion request status error:", error);
    res.status(500).json({
      success: false,
      message: "Failed to fetch deletion request status",
      error: error.message,
    });
  }
};

const cancelDeletionRequest = async (req, res) => {
  try {
    const deletionRequest = await AccountDeletionRequest.findOne({
      where: {
        id: req.params.requestId,
        userId: req.user.id,
        status: "pending",
      },
    });

    if (!deletionRequest) {
      return res.status(404).json({
        success: false,
        message: "Pending deletion request not found",
      });
    }

    await deletionRequest.update({
      status: "rejected",
      processedAt: new Date(),
    });

    res.status(200).json({
      success: true,
      message: "Account deletion request cancelled successfully",
    });
  } catch (error) {
    console.error("Cancel deletion request error:", error);
    res.status(500).json({
      success: false,
      message: "Failed to cancel deletion request",
      error: error.message,
    });
  }
};

module.exports = {
  requestAccountDeletion,
  getDeletionRequestStatus,
  cancelDeletionRequest,
};
