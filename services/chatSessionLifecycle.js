const Wallet = require("../model/wallet/wallet");
const WalletTransaction = require("../model/wallet/walletTransaction");
const AstrologerEarning = require("../model/astrologer/astrologerEarning");
const ChatSession = require("../model/chat/chatSession");
const Kundli = require("../model/horoscope/kundli");
const UserRequest = require("../model/user/userRequest");
const { sequelize } = require("../dbConnection/dbConfig");
const { Op } = require("sequelize");
const {
  getWalletBalanceBreakdown,
  buildWalletDebitPlan,
} = require("./walletService");

const PLATFORM_COMMISSION_PERCENTAGE = 10;

async function deleteSessionCreatedKundlis(session, transaction) {
  if (!session?.id || !session?.astrologerId) {
    return;
  }

  const sessionKundlis = await Kundli.findAll({
    where: {
      sessionId: session.id,
      createdBy: session.astrologerId,
    },
    attributes: ["requestId"],
    transaction,
    lock: transaction.LOCK.UPDATE,
  });

  const requestIds = sessionKundlis
    .map((kundli) => kundli.requestId)
    .filter(Boolean);

  if (requestIds.length === 0) {
    return;
  }

  await Kundli.destroy({
    where: {
      sessionId: session.id,
      createdBy: session.astrologerId,
    },
    transaction,
  });

  await UserRequest.destroy({
    where: {
      id: { [Op.in]: requestIds },
      userId: session.userId,
    },
    transaction,
  });
}

async function completeChatSessionWithBilling(session, io, options = {}) {
  const dbTransaction = await sequelize.transaction();
  let committed = false;

  try {
    const lockedSession = await ChatSession.findByPk(session.id, {
      transaction: dbTransaction,
      lock: dbTransaction.LOCK.UPDATE,
    });

    if (!lockedSession) {
      throw new Error("Chat session not found while finalizing billing");
    }

    if (lockedSession.status !== "active") {
      await deleteSessionCreatedKundlis(lockedSession, dbTransaction);
      await dbTransaction.commit();
      committed = true;
      return {
        endTime: lockedSession.endTime,
        currentMinutes: 0,
        currentCost: 0,
        totalMinutes: lockedSession.totalMinutes || 0,
        totalCost: parseFloat(lockedSession.totalCost || 0),
        billedAmount: 0,
      };
    }

    // Pending/unapproved requests should be closed without any billing.
    if (lockedSession.requestStatus !== "approved") {
      const endTime = new Date();

      await lockedSession.update(
        {
          status: "cancelled",
          endTime,
        },
        { transaction: dbTransaction }
      );

      await deleteSessionCreatedKundlis(lockedSession, dbTransaction);

      await dbTransaction.commit();
      committed = true;

      return {
        endTime,
        currentMinutes: 0,
        currentCost: 0,
        totalMinutes: lockedSession.totalMinutes || 0,
        totalCost: parseFloat(lockedSession.totalCost || 0),
        billedAmount: 0,
      };
    }

    const requestedEndTime = options.endTime ? new Date(options.endTime) : null;
    const endTime =
      requestedEndTime && Number.isFinite(requestedEndTime.getTime())
        ? requestedEndTime
        : new Date();
    const startTime = new Date(lockedSession.startTime);
    const durationMs = endTime - startTime;
    const currentMinutes = Math.max(1, Math.ceil(durationMs / (1000 * 60)));
    const pricePerMinute = parseFloat(lockedSession.pricePerMinute || 0);
    const currentCost = currentMinutes * pricePerMinute;

    const accumulatedMinutes = lockedSession.totalMinutes || 0;
    const accumulatedCost = parseFloat(lockedSession.totalCost || 0);
    const totalMinutes = accumulatedMinutes + currentMinutes;
    const totalCost = accumulatedCost + currentCost;

    await lockedSession.update(
      {
        endTime,
        totalMinutes,
        totalCost,
        status: "completed",
      },
      { transaction: dbTransaction }
    );

    await deleteSessionCreatedKundlis(lockedSession, dbTransaction);

    let billedAmount = 0;
    let updatedWalletBalance = null;
    let updatedRechargeBalance = null;

    const wallet = await Wallet.findOne({
      where: { userId: lockedSession.userId },
      transaction: dbTransaction,
      lock: dbTransaction.LOCK.UPDATE,
    });

    if (wallet && currentCost > 0) {
      const walletBreakdown = getWalletBalanceBreakdown(wallet);
      billedAmount = Math.min(walletBreakdown.rechargeBalance, currentCost);

      if (billedAmount > 0) {
        const debitPlan = buildWalletDebitPlan(wallet, billedAmount, {
          allowSignupBonusUsage: false,
        });
        updatedWalletBalance = debitPlan.nextBalance;
        updatedRechargeBalance = debitPlan.nextRechargeBalance;

        await wallet.update(
          {
            balance: updatedWalletBalance,
            signupBonusBalance: debitPlan.nextSignupBonusBalance,
            totalSpent: parseFloat(wallet.totalSpent || 0) + billedAmount,
          },
          { transaction: dbTransaction }
        );

        await WalletTransaction.create(
          {
            userId: lockedSession.userId,
            walletId: wallet.id,
            amount: billedAmount,
            type: "debit",
            status: "completed",
            description: `Chat consultation with astrologer - ${currentMinutes} minutes`,
            balanceBefore: debitPlan.previousBalance,
            balanceAfter: updatedWalletBalance,
            metadata: {
              chatSessionId: lockedSession.id,
              astrologerId: lockedSession.astrologerId,
              durationMinutes: currentMinutes,
              pricePerMinute,
              rechargeConsumed: debitPlan.rechargeConsumed,
              signupBonusConsumed: debitPlan.signupBonusConsumed,
            },
          },
          { transaction: dbTransaction }
        );

        // Chat sessions are reused per user+astrologer pair; create one earning per billed completion.
        const platformCommission = billedAmount * (PLATFORM_COMMISSION_PERCENTAGE / 100);
        const netEarning = billedAmount - platformCommission;

        await AstrologerEarning.create(
          {
            astrologerId: lockedSession.astrologerId,
            userId: lockedSession.userId,
            sessionId: lockedSession.id,
            sessionType: "chat",
            consultationType: "chat",
            durationMinutes: currentMinutes,
            pricePerMinute,
            totalAmount: billedAmount,
            platformCommission,
            commissionPercentage: PLATFORM_COMMISSION_PERCENTAGE,
            netEarning,
            paymentStatus: "pending",
            sessionStartTime: startTime,
            sessionEndTime: endTime,
          },
          { transaction: dbTransaction }
        );
      }
    }

    await dbTransaction.commit();
    committed = true;

    if (io && billedAmount > 0 && updatedWalletBalance !== null) {
      io.to(`user:${lockedSession.userId}`).emit("wallet:updated", {
        balance: updatedWalletBalance,
        rechargeBalance: updatedRechargeBalance,
        deduction: billedAmount,
        reason: "chat",
        sessionId: lockedSession.id,
      });
    }

    return {
      endTime,
      currentMinutes,
      currentCost,
      totalMinutes,
      totalCost,
      billedAmount,
    };
  } catch (error) {
    if (!committed) {
      await dbTransaction.rollback();
    }
    throw error;
  }
}

module.exports = {
  completeChatSessionWithBilling,
};
