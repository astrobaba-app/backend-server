const { sequelize } = require("../dbConnection/dbConfig");
// Initialize all Sequelize model associations
require("../model/associations/associations");

const ChatSession = require("../model/chat/chatSession");
const ChatMessage = require("../model/chat/chatMessage");
const ChatHistorySession = require("../model/chat/chatHistorySession");
const ChatHistoryMessage = require("../model/chat/chatHistoryMessage");

async function runMigration() {
  console.log("Starting chat history migration to unified message timeline...");

  try {
    // Drop NOT NULL constraint and foreign key constraint on sessionId in Postgres if present
    try {
      await sequelize.query('ALTER TABLE "chat_messages" ALTER COLUMN "sessionId" DROP NOT NULL;');
      await sequelize.query('ALTER TABLE "chat_messages" DROP CONSTRAINT IF EXISTS "chat_messages_sessionId_fkey";');
    } catch (dbErr) {
      console.log("Postgres alter column note:", dbErr.message);
    }

    // Ensure ChatMessage schema has user_id, astrologer_id
    await ChatMessage.sync({ alter: true });
    console.log("ChatMessage table schema synchronized.");

    // Fetch total count of archived history messages
    const totalHistoryMessages = await ChatHistoryMessage.count();
    console.log(`Found ${totalHistoryMessages} archived history messages to process.`);

    if (totalHistoryMessages === 0) {
      console.log("No historical messages to migrate.");
      process.exit(0);
    }

    const batchSize = 500;
    let offset = 0;
    let migratedCount = 0;
    let skippedCount = 0;

    while (offset < totalHistoryMessages) {
      console.log(`Processing batch ${offset} to ${offset + batchSize}...`);

      const historyMessages = await ChatHistoryMessage.findAll({
        limit: batchSize,
        offset: offset,
        order: [["createdAt", "ASC"]],
      });

      for (const msg of historyMessages) {
        const historySession = await ChatHistorySession.findByPk(msg.historySessionId);

        if (!historySession) {
          skippedCount++;
          continue;
        }

        const messageIdToUse = msg.originalMessageId || msg.id;
        const targetUserId = historySession.userId;
        const targetAstrologerId = historySession.astrologerId;
        const targetSessionId = historySession.sourceSessionId;
        const createdAtToUse = msg.originalCreatedAt || msg.createdAt;

        // Check if session currently exists in active chat_sessions table
        const activeSession = await ChatSession.findByPk(targetSessionId);
        const sessionIdToUse = activeSession ? targetSessionId : null;

        // Check if message already exists in chat_messages
        const existing = await ChatMessage.findByPk(messageIdToUse);

        if (existing) {
          // Update userId and astrologerId if missing
          if (!existing.userId || !existing.astrologerId) {
            await existing.update({
              userId: targetUserId,
              astrologerId: targetAstrologerId,
            });
          }
          skippedCount++;
        } else {
          // Create message record in primary chat_messages table
          await ChatMessage.create({
            id: messageIdToUse,
            sessionId: sessionIdToUse,
            userId: targetUserId,
            astrologerId: targetAstrologerId,
            senderId: msg.senderId,
            senderType: msg.senderType,
            message: msg.message || "",
            messageType: msg.messageType || "text",
            fileUrl: msg.fileUrl || null,
            isDeleted: msg.isDeleted || false,
            replyToMessageId: msg.replyToMessageId || null,
            createdAt: createdAtToUse,
            updatedAt: msg.updatedAt || createdAtToUse,
          });
          migratedCount++;
        }
      }

      offset += batchSize;
    }

    console.log(`Migration complete! Successfully migrated ${migratedCount} messages, skipped ${skippedCount} already existing/invalid messages.`);
    process.exit(0);
  } catch (error) {
    console.error("Migration error:", error);
    process.exit(1);
  }
}

runMigration();
