const Feedback = require("../../model/feedback/feedback");
const User = require("../../model/user/userAuth");
const Astrologer = require("../../model/astrologer/astrologer");
const { Op } = require("sequelize");

const ONE_WEEK_IN_MS = 7 * 24 * 60 * 60 * 1000;

const getActorContext = (req) => {
  const actorId = req.user.id;
  const actorRole = req.user.role === "astrologer" ? "astrologer" : "user";
  const actorKey = actorRole === "astrologer" ? "astrologerId" : "userId";

  return { actorId, actorRole, actorKey };
};

const resetExpiredSubmissionWindow = async (actorRole, actorId) => {
  const actorKey = actorRole === "astrologer" ? "astrologerId" : "userId";
  const sevenDaysAgo = new Date(Date.now() - ONE_WEEK_IN_MS);

  await Feedback.update(
    { isSubmit: false },
    {
      where: {
        [actorKey]: actorId,
        isSubmit: true,
        createdAt: {
          [Op.lt]: sevenDaysAgo,
        },
      },
    }
  );
};

const getActiveSubmission = async (actorKey, actorId) =>
  Feedback.findOne({
    where: {
      [actorKey]: actorId,
      isSubmit: true,
      createdAt: {
        [Op.gte]: new Date(Date.now() - ONE_WEEK_IN_MS),
      },
    },
    order: [["createdAt", "DESC"]],
  });

const getFeedbackStatus = async (req, res) => {
  try {
    const { actorId, actorRole, actorKey } = getActorContext(req);

    await resetExpiredSubmissionWindow(actorRole, actorId);

    const activeSubmission = await getActiveSubmission(actorKey, actorId);

    if (!activeSubmission) {
      return res.status(200).json({
        success: true,
        canSubmit: true,
        isSubmitted: false,
        nextAllowedAt: null,
        feedback: null,
      });
    }

    const nextAllowedAt = new Date(
      new Date(activeSubmission.createdAt).getTime() + ONE_WEEK_IN_MS
    );

    return res.status(200).json({
      success: true,
      canSubmit: false,
      isSubmitted: true,
      nextAllowedAt,
      feedback: activeSubmission,
    });
  } catch (error) {
    console.error("Get feedback status error:", error);
    return res.status(500).json({
      success: false,
      message: "Failed to fetch feedback status",
      error: error.message,
    });
  }
};

const createFeedback = async (req, res) => {
  try {
    const { actorId, actorRole, actorKey } = getActorContext(req);
    const { rating, review } = req.body;
    const reviewText = typeof review === "string" ? review.trim() : "";

    if (rating === undefined) {
      return res.status(400).json({
        success: false,
        message: "Rating is required",
      });
    }

    const parsedRating = Number(rating);
    if (!Number.isInteger(parsedRating) || parsedRating < 1 || parsedRating > 5) {
      return res.status(400).json({
        success: false,
        message: "Rating must be an integer between 1 and 5",
      });
    }

    await resetExpiredSubmissionWindow(actorRole, actorId);

    const activeSubmission = await getActiveSubmission(actorKey, actorId);

    if (activeSubmission) {
      const nextAllowedAt = new Date(
        new Date(activeSubmission.createdAt).getTime() + ONE_WEEK_IN_MS
      );

      return res.status(400).json({
        success: false,
        message: "You can submit feedback only once in 7 days",
        nextAllowedAt,
      });
    }

    const feedbackPayload = {
      rating: parsedRating,
      review: reviewText || null,
      isSubmit: true,
      userId: null,
      astrologerId: null,
    };
    const nextAllowedAt = new Date(Date.now() + ONE_WEEK_IN_MS);

    if (actorRole === "astrologer") {
      const astrologer = await Astrologer.findByPk(actorId, {
        attributes: ["id", "fullName", "email"],
      });

      if (!astrologer) {
        return res.status(404).json({
          success: false,
          message: "Astrologer not found",
        });
      }

      feedbackPayload.astrologerId = actorId;

      const feedback = await Feedback.create(feedbackPayload);

      return res.status(201).json({
        success: true,
        message: "Feedback created successfully",
        nextAllowedAt,
        feedback: {
          ...feedback.toJSON(),
          astrologer,
        },
      });
    }

    const user = await User.findByPk(actorId, {
      attributes: ["id", "fullName", "email"],
    });

    if (!user) {
      return res.status(404).json({
        success: false,
        message: "User not found",
      });
    }

    feedbackPayload.userId = actorId;

    const feedback = await Feedback.create(feedbackPayload);

    return res.status(201).json({
      success: true,
      message: "Feedback created successfully",
      nextAllowedAt,
      feedback: {
        ...feedback.toJSON(),
        user,
      },
    });
  } catch (error) {
    console.error("Create feedback error:", error);
    return res.status(500).json({
      success: false,
      message: "Failed to create feedback",
      error: error.message,
    });
  }
};

module.exports = {
  getFeedbackStatus,
  createFeedback,
};
