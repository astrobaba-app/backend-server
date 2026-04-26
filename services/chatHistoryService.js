const { sequelize } = require("../dbConnection/dbConfig");
const ChatSession = require("../model/chat/chatSession");
const ChatMessage = require("../model/chat/chatMessage");
const ChatHistorySession = require("../model/chat/chatHistorySession");
const ChatHistoryMessage = require("../model/chat/chatHistoryMessage");

function toNumberOrZero(value) {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : 0;
}

async function archiveAndDeleteSession(sessionId, options = {}) {
  const { endReason = null, billedAmount = 0 } = options;

  if (!sessionId) {
    return { archived: false, reason: "missing_session_id" };
  }

  return sequelize.transaction(async (transaction) => {
    const session = await ChatSession.findByPk(sessionId, {
      transaction,
      lock: transaction.LOCK.UPDATE,
    });

    if (!session) {
      return { archived: false, reason: "session_not_found" };
    }

    const [historySession] = await ChatHistorySession.findOrCreate({
      where: { sourceSessionId: session.id },
      defaults: {
        sourceSessionId: session.id,
        userId: session.userId,
        astrologerId: session.astrologerId,
        status: session.status,
        requestStatus: session.requestStatus,
        startTime: session.startTime || new Date(),
        endTime: session.endTime || new Date(),
        totalMinutes: session.totalMinutes || 0,
        totalCost: toNumberOrZero(session.totalCost),
        billedAmount: toNumberOrZero(billedAmount),
        pricePerMinute: toNumberOrZero(session.pricePerMinute),
        endReason,
        lastMessagePreview: session.lastMessagePreview || null,
        lastMessageAt: session.lastMessageAt || null,
      },
      transaction,
    });

    const existingHistoryMessageCount = await ChatHistoryMessage.count({
      where: { historySessionId: historySession.id },
      transaction,
    });

    if (existingHistoryMessageCount === 0) {
      const liveMessages = await ChatMessage.findAll({
        where: { sessionId: session.id },
        order: [["createdAt", "ASC"]],
        transaction,
      });

      if (liveMessages.length > 0) {
        await ChatHistoryMessage.bulkCreate(
          liveMessages.map((message) => ({
            historySessionId: historySession.id,
            senderId: message.senderId,
            senderType: message.senderType,
            message: message.message,
            messageType: message.messageType,
            fileUrl: message.fileUrl,
            isDeleted: message.isDeleted,
            replyToMessageId: message.replyToMessageId,
            originalMessageId: message.id,
            originalCreatedAt: message.createdAt,
          })),
          { transaction }
        );
      }
    }

    await ChatMessage.destroy({ where: { sessionId: session.id }, transaction });
    await ChatSession.destroy({ where: { id: session.id }, transaction });

    return {
      archived: true,
      historySessionId: historySession.id,
      sourceSessionId: session.id,
    };
  });
}

function queueArchiveAndDeleteSession(sessionId, options = {}) {
  if (!sessionId) return;

  setImmediate(async () => {
    try {
      await archiveAndDeleteSession(sessionId, options);
    } catch (error) {
      console.error("Failed to archive chat session:", error);
    }
  });
}

module.exports = {
  archiveAndDeleteSession,
  queueArchiveAndDeleteSession,
};