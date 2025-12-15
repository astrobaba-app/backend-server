const cron = require('node-cron');
const { generateAllHoroscopesForPeriod } = require('./horoscopeGenerationService');

// Store cron jobs
let cronJobs = {
  daily: null,
  weekly: null,
  monthly: null,
  yearly: null,
  cleanup: null,
};

let isInitialized = false;

/**
 * Initialize all horoscope cron jobs
 */
function initializeScheduler() {
  if (isInitialized) {
    console.log('[HoroscopeScheduler] Already initialized');
    return;
  }

  const timezone = process.env.TZ || 'Asia/Kolkata';
  console.log(`[HoroscopeScheduler] Initializing with timezone: ${timezone}`);

  try {
    // Daily horoscope - Every day at 12:00 AM
    cronJobs.daily = cron.schedule('0 0 * * *', async () => {
      console.log('[HoroscopeScheduler] Running daily horoscope generation...');
      try {
        await generateAllHoroscopesForPeriod('daily', new Date());
        console.log('[HoroscopeScheduler] Daily generation completed successfully');
      } catch (error) {
        console.error('[HoroscopeScheduler] Daily generation failed:', error?.message);
      }
    }, {
      timezone,
      scheduled: true
    });

    // Weekly horoscope - Every Sunday at 12:00 AM
    cronJobs.weekly = cron.schedule('0 0 * * 0', async () => {
      console.log('[HoroscopeScheduler] Running weekly horoscope generation...');
      try {
        await generateAllHoroscopesForPeriod('weekly', new Date());
        console.log('[HoroscopeScheduler] Weekly generation completed successfully');
      } catch (error) {
        console.error('[HoroscopeScheduler] Weekly generation failed:', error?.message);
      }
    }, {
      timezone,
      scheduled: true
    });

    // Monthly horoscope - 1st day of month at 12:00 AM
    cronJobs.monthly = cron.schedule('0 0 1 * *', async () => {
      console.log('[HoroscopeScheduler] Running monthly horoscope generation...');
      try {
        await generateAllHoroscopesForPeriod('monthly', new Date());
        console.log('[HoroscopeScheduler] Monthly generation completed successfully');
      } catch (error) {
        console.error('[HoroscopeScheduler] Monthly generation failed:', error?.message);
      }
    }, {
      timezone,
      scheduled: true
    });

    // Yearly horoscope - January 1st at 12:00 AM
    cronJobs.yearly = cron.schedule('0 0 1 1 *', async () => {
      console.log('[HoroscopeScheduler] Running yearly horoscope generation...');
      try {
        await generateAllHoroscopesForPeriod('yearly', new Date());
        console.log('[HoroscopeScheduler] Yearly generation completed successfully');
      } catch (error) {
        console.error('[HoroscopeScheduler] Yearly generation failed:', error?.message);
      }
    }, {
      timezone,
      scheduled: true
    });

    // Cleanup expired horoscopes - Every day at 2:00 AM
    cronJobs.cleanup = cron.schedule('0 2 * * *', async () => {
      console.log('[HoroscopeScheduler] Running cleanup of expired horoscopes...');
      try {
        const { cleanupExpiredHoroscopes } = require('./horoscopeGenerationService');
        await cleanupExpiredHoroscopes();
        console.log('[HoroscopeScheduler] Cleanup completed successfully');
      } catch (error) {
        console.error('[HoroscopeScheduler] Cleanup failed:', error?.message);
      }
    }, {
      timezone,
      scheduled: true
    });

    isInitialized = true;
    console.log('[HoroscopeScheduler] Cron jobs initialized successfully');
    console.log('[HoroscopeScheduler] - Daily: 0 0 * * * (Every day at midnight)');
    console.log('[HoroscopeScheduler] - Weekly: 0 0 * * 0 (Every Sunday at midnight)');
    console.log('[HoroscopeScheduler] - Monthly: 0 0 1 * * (1st of month at midnight)');
    console.log('[HoroscopeScheduler] - Yearly: 0 0 1 1 * (January 1st at midnight)');
    console.log('[HoroscopeScheduler] - Cleanup: 0 2 * * * (Every day at 2 AM)');

    // Optional: Generate initial horoscopes on startup
    generateInitialHoroscopes();

  } catch (error) {
    console.error('[HoroscopeScheduler] Initialization failed:', error?.message);
    throw error;
  }
}

/**
 * Generate initial horoscopes on server startup (optional)
 */
async function generateInitialHoroscopes() {
  console.log('[HoroscopeScheduler] Generating initial horoscopes for current period...');
  
  try {
    // Generate daily horoscopes for today
    console.log('[HoroscopeScheduler] Generating initial daily horoscopes...');
    await generateAllHoroscopesForPeriod('daily', new Date());
    console.log('[HoroscopeScheduler] Initial daily horoscopes generated');
  } catch (error) {
    console.error('[HoroscopeScheduler] Failed to generate initial horoscopes:', error?.message);
    // Don't throw - this is optional and shouldn't stop server startup
  }
}

/**
 * Stop all cron jobs
 */
function stopScheduler() {
  console.log('[HoroscopeScheduler] Stopping all cron jobs...');
  
  Object.keys(cronJobs).forEach(key => {
    if (cronJobs[key]) {
      cronJobs[key].stop();
      cronJobs[key] = null;
    }
  });
  
  isInitialized = false;
  console.log('[HoroscopeScheduler] All cron jobs stopped');
}

/**
 * Get scheduler status
 */
function getSchedulerStatus() {
  return {
    initialized: isInitialized,
    timezone: process.env.TZ || 'Asia/Kolkata',
    jobs: [
      { name: 'daily', active: cronJobs.daily !== null, schedule: '0 0 * * *' },
      { name: 'weekly', active: cronJobs.weekly !== null, schedule: '0 0 * * 0' },
      { name: 'monthly', active: cronJobs.monthly !== null, schedule: '0 0 1 * *' },
      { name: 'yearly', active: cronJobs.yearly !== null, schedule: '0 0 1 1 *' },
      { name: 'cleanup', active: cronJobs.cleanup !== null, schedule: '0 2 * * *' },
    ]
  };
}

module.exports = {
  initializeScheduler,
  generateInitialHoroscopes,
  stopScheduler,
  getSchedulerStatus,
};
