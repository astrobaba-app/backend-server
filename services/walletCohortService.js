const { Op } = require("sequelize");
const Wallet = require("../model/wallet/wallet");
const WalletTransaction = require("../model/wallet/walletTransaction");
const {
  COHORT_TYPES,
  WALLET_CATEGORIES,
  setUserCohortScores,
} = require("./interestCohortService");

const toAmount = (value) => {
  const parsed = Number.parseFloat(value ?? 0);
  return Number.isFinite(parsed) ? parsed : 0;
};

const daysBetween = (fromDate, toDate = new Date()) => {
  if (!fromDate) return null;
  const diffMs = toDate.getTime() - new Date(fromDate).getTime();
  return Math.max(0, Math.floor(diffMs / (24 * 60 * 60 * 1000)));
};

const getConfigNumber = (key, fallback) => {
  const parsed = Number(process.env[key]);
  return Number.isFinite(parsed) ? parsed : fallback;
};

const WALLET_COHORT_CONFIG = {
  lowBalanceThreshold: getConfigNumber("WALLET_COHORT_LOW_BALANCE_THRESHOLD", 50),
  highBalanceThreshold: getConfigNumber("WALLET_COHORT_HIGH_BALANCE_THRESHOLD", 300),
  repeatRechargeCount: getConfigNumber("WALLET_COHORT_REPEAT_RECHARGE_COUNT", 3),
};

function emptyWalletScores() {
  return WALLET_CATEGORIES.reduce((scores, category) => {
    scores[category] = 0;
    return scores;
  }, {});
}

function buildWalletCohortScores(metrics) {
  const scores = emptyWalletScores();
  const {
    balance,
    rechargeCount,
  } = metrics;

  if (rechargeCount === 0) {
    scores.NeverRecharged = 1;
  } else if (rechargeCount === 1) {
    scores.FirstRechargeCompleted = 1;
  }

  if (rechargeCount >= WALLET_COHORT_CONFIG.repeatRechargeCount) {
    scores.RepeatRecharger = rechargeCount;
  }

  if (balance > 0 && balance < WALLET_COHORT_CONFIG.lowBalanceThreshold) {
    scores.LowBalanceUser = Math.max(1, Math.round(WALLET_COHORT_CONFIG.lowBalanceThreshold - balance));
  } else if (balance >= WALLET_COHORT_CONFIG.highBalanceThreshold) {
    scores.HighBalanceUser = Math.round(balance);
  }

  return scores;
}

async function calculateWalletMetrics(userId) {
  const wallet = await Wallet.findOne({ where: { userId } });
  const now = new Date();
  const thirtyDaysAgo = new Date(now.getTime() - 30 * 24 * 60 * 60 * 1000);

  const rechargeTransactions = await WalletTransaction.findAll({
    where: {
      userId,
      type: "credit",
      status: "completed",
      paymentMethod: {
        [Op.notIn]: ["bonus", "signup_bonus", "refund"],
      },
    },
    attributes: ["id", "amount", "createdAt", "paymentMethod"],
    order: [["createdAt", "DESC"]],
  });

  const rechargeAmounts = rechargeTransactions.map((transaction) =>
    toAmount(transaction.amount)
  );
  const rechargeCount = rechargeTransactions.length;
  const totalRechargeAmount = rechargeAmounts.reduce((sum, amount) => sum + amount, 0);
  const averageRechargeAmount =
    rechargeCount > 0 ? totalRechargeAmount / rechargeCount : 0;
  const lastRechargeAt = rechargeTransactions[0]?.createdAt || null;
  const rechargeCountLast30Days = rechargeTransactions.filter(
    (transaction) => new Date(transaction.createdAt) >= thirtyDaysAgo
  ).length;

  const walletTotalRecharge = wallet ? toAmount(wallet.totalRecharge) : null;

  return {
    balance: toAmount(wallet?.balance),
    totalRechargeAmount:
      walletTotalRecharge !== null && walletTotalRecharge > 0
        ? walletTotalRecharge
        : totalRechargeAmount,
    totalSpent: toAmount(wallet?.totalSpent),
    rechargeCount,
    averageRechargeAmount,
    lastRechargeAt,
    daysSinceLastRecharge: daysBetween(lastRechargeAt, now),
    rechargeCountLast30Days,
    config: WALLET_COHORT_CONFIG,
  };
}

async function refreshUserWalletCohorts(userId) {
  if (!userId) {
    return { updated: false, reason: "missing_user_id" };
  }

  const metrics = await calculateWalletMetrics(userId);
  const scores = buildWalletCohortScores(metrics);

  console.log("[WalletCohort] Refreshing wallet cohorts", {
    userId,
    metrics: {
      balance: metrics.balance,
      rechargeCount: metrics.rechargeCount,
      totalRechargeAmount: metrics.totalRechargeAmount,
      daysSinceLastRecharge: metrics.daysSinceLastRecharge,
    },
    activeCategories: Object.entries(scores)
      .filter(([, score]) => Number(score || 0) > 0)
      .map(([category]) => category),
  });

  return setUserCohortScores({
    userId,
    cohortType: COHORT_TYPES.WALLET,
    scores,
    metadata: {
      metrics,
      refreshedAt: new Date().toISOString(),
    },
  });
}

function queueWalletCohortRefresh(userId, reason = "wallet_event") {
  console.log("[WalletCohort] Queueing wallet cohort refresh", {
    userId,
    reason,
  });

  setImmediate(async () => {
    try {
      await refreshUserWalletCohorts(userId);
    } catch (error) {
      console.error("[WalletCohort] Wallet cohort refresh failed:", {
        userId,
        reason,
        error: error.message,
      });
    }
  });
}

module.exports = {
  WALLET_COHORT_CONFIG,
  buildWalletCohortScores,
  calculateWalletMetrics,
  queueWalletCohortRefresh,
  refreshUserWalletCohorts,
};
