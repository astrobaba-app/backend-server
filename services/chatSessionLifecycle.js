const Wallet = require("../model/wallet/wallet");
const WalletTransaction = require("../model/wallet/walletTransaction");
const AstrologerEarning = require("../model/astrologer/astrologerEarning");
const ChatSession = require("../model/chat/chatSession");
const { sequelize } = require("../dbConnection/dbConfig");

const PLATFORM_COMMISSION_PERCENTAGE = 10;

async function completeChatSessionWithBilling(session, io) {
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

    const endTime = new Date();
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

    let billedAmount = 0;
    let updatedWalletBalance = null;

    const wallet = await Wallet.findOne({
      where: { userId: lockedSession.userId },
      transaction: dbTransaction,
      lock: dbTransaction.LOCK.UPDATE,
    });

    if (wallet && currentCost > 0) {
      const currentBalance = parseFloat(wallet.balance || 0);
      billedAmount = Math.min(currentBalance, currentCost);

      if (billedAmount > 0) {
        updatedWalletBalance = currentBalance - billedAmount;

        await wallet.update(
          {
            balance: updatedWalletBalance,
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
            balanceBefore: currentBalance,
            balanceAfter: updatedWalletBalance,
            metadata: {
              chatSessionId: lockedSession.id,
              astrologerId: lockedSession.astrologerId,
              durationMinutes: currentMinutes,
              pricePerMinute,
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
