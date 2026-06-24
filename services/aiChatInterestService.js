const AIChatSession = require("../model/aiChat/aiChatSession");
const {
  normalizeClassificationPayload,
  recordIntentClassification,
} = require("./interestCohortService");

const buildFinalClassificationFromSignals = (signals) => {
  if (!Array.isArray(signals) || signals.length === 0) {
    console.log("[InterestCohort][AI] No interest signals available for final classification");
    return null;
  }

  const categoryScores = new Map();
  const confidenceByCategory = new Map();
  let validSignalCount = 0;

  signals.forEach((signal) => {
    const normalized = normalizeClassificationPayload(signal);
    if (!normalized) return;

    validSignalCount += 1;
    const primaryWeight = 10 * normalized.confidence;
    categoryScores.set(
      normalized.primaryIntent,
      (categoryScores.get(normalized.primaryIntent) || 0) + primaryWeight
    );
    confidenceByCategory.set(
      normalized.primaryIntent,
      Math.max(confidenceByCategory.get(normalized.primaryIntent) || 0, normalized.confidence)
    );

    if (normalized.secondaryIntent) {
      const secondaryWeight = 5 * normalized.confidence;
      categoryScores.set(
        normalized.secondaryIntent,
        (categoryScores.get(normalized.secondaryIntent) || 0) + secondaryWeight
      );
      confidenceByCategory.set(
        normalized.secondaryIntent,
        Math.max(confidenceByCategory.get(normalized.secondaryIntent) || 0, normalized.confidence)
      );
    }
  });

  const ranked = [...categoryScores.entries()].sort((a, b) => b[1] - a[1]);
  if (!ranked.length) {
    console.log("[InterestCohort][AI] No valid interest signals after normalization", {
      signalCount: signals.length,
    });
    return null;
  }

  const [primaryIntent, primaryWeightedScore] = ranked[0];
  const secondaryIntent = ranked[1]?.[0] || null;
  const maxPossibleScore = Math.max(validSignalCount * 10, 1);
  const aggregateConfidence = Math.max(
    confidenceByCategory.get(primaryIntent) || 0,
    Math.min(primaryWeightedScore / maxPossibleScore, 1)
  );

  const finalClassification = {
    primaryIntent,
    secondaryIntent,
    confidence: aggregateConfidence,
  };

  console.log("[InterestCohort][AI] Built final classification from session signals", {
    signalCount: signals.length,
    validSignalCount,
    rankedCategories: ranked.slice(0, 5).map(([category, weightedScore]) => ({
      category,
      weightedScore,
    })),
    finalClassification,
  });

  return finalClassification;
};

async function findAiSessionForInterestFinalization({ userId, sessionId }) {
  if (sessionId) {
    console.log("[InterestCohort][AI] Resolving AI session by provided session id", {
      userId,
      sessionId,
    });
    return AIChatSession.findOne({
      where: { id: sessionId, userId },
    });
  }

  console.log("[InterestCohort][AI] Resolving latest active AI session for user", {
    userId,
  });
  return AIChatSession.findOne({
    where: { userId, isActive: true },
    order: [
      ["lastMessageAt", "DESC"],
      ["updatedAt", "DESC"],
    ],
  });
}

async function finalizeAiChatInterestSession({ userId, sessionId = null, markInactive = true }) {
  if (!userId) {
    console.log("[InterestCohort][AI] Cannot finalize AI interest; missing userId");
    return { finalized: false, reason: "missing_user_id" };
  }

  const session = await findAiSessionForInterestFinalization({ userId, sessionId });
  if (!session) {
    console.log("[InterestCohort][AI] Cannot finalize AI interest; session not found", {
      userId,
      sessionId,
    });
    return { finalized: false, reason: "session_not_found" };
  }

  const signalCount = Array.isArray(session.interestSignals)
    ? session.interestSignals.length
    : 0;

  console.log("[InterestCohort][AI] Finalizing AI chat interest session", {
    userId,
    sessionId: session.id,
    requestedSessionId: sessionId,
    signalCount,
    markInactive,
  });

  const classification = buildFinalClassificationFromSignals(session.interestSignals);
  if (!classification) {
    return { finalized: false, reason: "no_classification", sessionId: session.id };
  }

  const result = await recordIntentClassification({
    userId: session.userId,
    sessionId: session.id,
    sessionType: "ai_chat",
    source: "ai_chat_session_end",
    classification,
    metadata: {
      signalCount,
      classificationSource: "session_interest_signals",
    },
  });

  if (markInactive && session.isActive) {
    await session.update({ isActive: false });
  }

  console.log("[InterestCohort][AI] Final session interest record result", {
    userId: session.userId,
    sessionId: session.id,
    recorded: result.recorded,
    reason: result.reason || null,
    primaryIntent: classification.primaryIntent,
    secondaryIntent: classification.secondaryIntent,
    confidence: classification.confidence,
  });

  return {
    finalized: result.recorded,
    reason: result.reason || null,
    sessionId: session.id,
    classification,
  };
}

function queueAiChatInterestFinalization(payload) {
  console.log("[InterestCohort][AI] Queueing AI interest finalization", payload);
  setImmediate(async () => {
    try {
      await finalizeAiChatInterestSession(payload);
    } catch (error) {
      console.error("[InterestCohort][AI] AI interest finalization failed:", error);
    }
  });
}

module.exports = {
  buildFinalClassificationFromSignals,
  finalizeAiChatInterestSession,
  queueAiChatInterestFinalization,
};
