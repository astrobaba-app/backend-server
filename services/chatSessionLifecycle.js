const Wallet = require("../model/wallet/wallet");
const WalletTransaction = require("../model/wallet/walletTransaction");
const AstrologerEarning = require("../model/astrologer/astrologerEarning");

const PLATFORM_COMMISSION_PERCENTAGE = 10;

async function completeChatSessionWithBilling(session, io) {
  // Pending/unapproved requests should be closed without any billing.
  if (session.requestStatus !== "approved") {
    const endTime = new Date();
    await session.update({
      status: "cancelled",
      endTime,
    });

    return {
      endTime,
      currentMinutes: 0,
      currentCost: 0,
      totalMinutes: session.totalMinutes || 0,
      totalCost: parseFloat(session.totalCost || 0),
      billedAmount: 0,
    };
  }

  const endTime = new Date();
  const startTime = new Date(session.startTime);
  const durationMs = endTime - startTime;
  const currentMinutes = Math.max(1, Math.ceil(durationMs / (1000 * 60)));
  const currentCost = currentMinutes * parseFloat(session.pricePerMinute || 0);

  const accumulatedMinutes = session.totalMinutes || 0;
  const accumulatedCost = parseFloat(session.totalCost || 0);
  const totalMinutes = accumulatedMinutes + currentMinutes;
  const totalCost = accumulatedCost + currentCost;

  await session.update({
    endTime,
    totalMinutes,
    totalCost,
    status: "completed",
  });

  let billedAmount = 0;
  const wallet = await Wallet.findOne({ where: { userId: session.userId } });

  if (wallet && currentCost > 0) {
    const currentBalance = parseFloat(wallet.balance || 0);
    billedAmount = Math.min(currentBalance, currentCost);

    if (billedAmount > 0) {
      await wallet.update({
        balance: currentBalance - billedAmount,
        totalSpent: parseFloat(wallet.totalSpent || 0) + billedAmount,
      });

      await WalletTransaction.create({
        userId: session.userId,
        walletId: wallet.id,
        amount: billedAmount,
        type: "debit",
        status: "completed",
        description: `Chat consultation with astrologer - ${currentMinutes} minutes`,
        balanceBefore: currentBalance,
        balanceAfter: currentBalance - billedAmount,
        metadata: {
          chatSessionId: session.id,
          astrologerId: session.astrologerId,
          durationMinutes: currentMinutes,
          pricePerMinute: parseFloat(session.pricePerMinute || 0),
        },
      });

      const platformCommission = billedAmount * (PLATFORM_COMMISSION_PERCENTAGE / 100);
      const netEarning = billedAmount - platformCommission;

      await AstrologerEarning.create({
        astrologerId: session.astrologerId,
        userId: session.userId,
        sessionId: session.id,
        sessionType: "chat",
        consultationType: "chat",
        durationMinutes: currentMinutes,
        pricePerMinute: parseFloat(session.pricePerMinute || 0),
        totalAmount: billedAmount,
        platformCommission,
        commissionPercentage: PLATFORM_COMMISSION_PERCENTAGE,
        netEarning,
        paymentStatus: "pending",
        sessionStartTime: startTime,
        sessionEndTime: endTime,
      });

      if (io) {
        io.to(`user:${session.userId}`).emit("wallet:updated", {
          balance: currentBalance - billedAmount,
          deduction: billedAmount,
          reason: "chat",
          sessionId: session.id,
        });
      }
    }
  }

  return {
    endTime,
    currentMinutes,
    currentCost,
    totalMinutes,
    totalCost,
    billedAmount,
  };
}

module.exports = {
  completeChatSessionWithBilling,
};
