/**
 * Script to clear all active/scheduled live sessions
 * Run this when an astrologer is stuck with "already have an active session" error
 * 
 * Usage:
 *   node scripts/clearActiveLiveSessions.js
 *   
 * Or to clear sessions for a specific astrologer:
 *   node scripts/clearActiveLiveSessions.js <astrologerId>
 */

require("dotenv").config();
const { sequelize } = require("../dbConnection/dbConfig");
const LiveSession = require("../model/live/liveSession");
const { Op } = require("sequelize");

async function clearActiveLiveSessions() {
  try {
    console.log("🔍 Checking for active/scheduled live sessions...\n");

    // Get astrologer ID from command line argument (optional)
    const astrologerId = process.argv[2];

    const whereClause = {
      status: { [Op.in]: ["scheduled", "live"] },
    };

    if (astrologerId) {
      whereClause.astrologerId = astrologerId;
      console.log(`📌 Filtering for astrologer ID: ${astrologerId}\n`);
    }

    // Find all active/scheduled sessions
    const activeSessions = await LiveSession.findAll({
      where: whereClause,
      attributes: ["id", "astrologerId", "title", "status", "createdAt"],
    });

    if (activeSessions.length === 0) {
      console.log("✅ No active or scheduled live sessions found.");
      process.exit(0);
    }

    console.log(`Found ${activeSessions.length} active/scheduled session(s):\n`);
    activeSessions.forEach((session, index) => {
      console.log(`${index + 1}. Session ID: ${session.id}`);
      console.log(`   Astrologer ID: ${session.astrologerId}`);
      console.log(`   Title: ${session.title}`);
      console.log(`   Status: ${session.status}`);
      console.log(`   Created: ${session.createdAt}`);
      console.log("");
    });

    // Update all to 'ended' status
    const [updatedCount] = await LiveSession.update(
      { 
        status: "ended",
        endedAt: new Date() 
      },
      { where: whereClause }
    );

    console.log(`✅ Successfully ended ${updatedCount} live session(s).\n`);
    console.log("You can now start a new live session!");

  } catch (error) {
    console.error("❌ Error clearing live sessions:", error);
    process.exit(1);
  } finally {
    await sequelize.close();
  }
}

// Run the script
clearActiveLiveSessions();
