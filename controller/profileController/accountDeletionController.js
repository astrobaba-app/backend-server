const AccountDeletionRequest = require("../../model/user/accountDeletionRequest");
const User = require("../../model/user/userAuth");

// User requests account deletion
const requestAccountDeletion = async (req, res) => {
  try {
    const userId = req.user.id;
    const { reason } = req.body;

    // Check if user exists
    const user = await User.findByPk(userId);
    if (!user) {
      return res.status(404).json({
        success: false,
        message: "User not found",
      });
    }

    // Check if there's already a pending request
    const existingRequest = await AccountDeletionRequest.findOne({
      where: {
        userId,
        status: 'pending'
      }
    });

    if (existingRequest) {
      return res.status(400).json({
        success: false,
        message: "You already have a pending account deletion request",
        request: existingRequest
      });
    }

    // Create new deletion request
    const deletionRequest = await AccountDeletionRequest.create({
      userId,
      reason: reason || null,
      status: 'pending',
      requestedAt: new Date()
    });

    res.status(201).json({
      success: true,
      message: "Account deletion request submitted successfully. Our team will review it shortly.",
      request: deletionRequest
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

// Get user's own deletion request status
const getDeletionRequestStatus = async (req, res) => {
  try {
    const userId = req.user.id;

    const deletionRequest = await AccountDeletionRequest.findOne({
      where: { userId },
      order: [['createdAt', 'DESC']]
    });

    if (!deletionRequest) {
      return res.status(404).json({
        success: false,
        message: "No deletion request found",
      });
    }

    res.status(200).json({
      success: true,
      request: deletionRequest
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

// Cancel pending deletion request
const cancelDeletionRequest = async (req, res) => {
  try {
    const userId = req.user.id;
    const { requestId } = req.params;

    const deletionRequest = await AccountDeletionRequest.findOne({
      where: {
        id: requestId,
        userId,
        status: 'pending'
      }
    });

    if (!deletionRequest) {
      return res.status(404).json({
        success: false,
        message: "No pending deletion request found",
      });
    }

    // Update status to rejected (cancelled by user)
    await deletionRequest.update({
      status: 'rejected',
      processedAt: new Date(),
      adminNotes: 'Cancelled by user'
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
  cancelDeletionRequest
};
