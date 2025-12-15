/**
 * Admin endpoints for managing horoscope cache
 * Optional: Add these to your admin routes if you want manual control
 */

const { 
  generateAllHoroscopesForPeriod, 
  getCachedHoroscope,
  cleanupExpiredHoroscopes 
} = require('../../services/horoscopeGenerationService');
const { getSchedulerStatus, initializeScheduler } = require('../../services/horoscopeScheduler');
const CachedHoroscope = require('../../model/horoscope/cachedHoroscope');

/**
 * Manually trigger horoscope generation for a specific period
 * POST /api/admin/horoscope/generate/:period
 * @param period - 'daily' | 'weekly' | 'monthly' | 'yearly'
 */
const generateHoroscopesManually = async (req, res) => {
  try {
    const { period } = req.params;
    const validPeriods = ['daily', 'weekly', 'monthly', 'yearly'];
    
    if (!validPeriods.includes(period)) {
      return res.status(400).json({
        success: false,
        message: `Invalid period. Must be one of: ${validPeriods.join(', ')}`
      });
    }
    
    console.log(`[Admin] Manually generating ${period} horoscopes for all signs...`);
    await generateAllHoroscopesForPeriod(period, new Date());
    
    res.json({
      success: true,
      message: `Successfully generated ${period} horoscopes for all 12 zodiac signs`,
      timestamp: new Date()
    });
  } catch (error) {
    console.error('[Admin] Manual generation error:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to generate horoscopes',
      error: error.message
    });
  }
};

/**
 * Get cache statistics
 * GET /api/admin/horoscope/cache-stats
 */
const getCacheStats = async (req, res) => {
  try {
    const { Op } = require('sequelize');
    
    // Get total cached entries
    const total = await CachedHoroscope.count();
    
    // Get active entries
    const active = await CachedHoroscope.count({
      where: { isActive: true }
    });
    
    // Get expired entries
    const expired = await CachedHoroscope.count({
      where: {
        validUntil: { [Op.lt]: new Date() },
        isActive: true
      }
    });
    
    // Get entries by period
    const byPeriod = await CachedHoroscope.findAll({
      attributes: [
        'period',
        [require('sequelize').fn('COUNT', '*'), 'count']
      ],
      where: { isActive: true },
      group: ['period']
    });
    
    // Get recent entries
    const recent = await CachedHoroscope.findAll({
      limit: 10,
      order: [['generatedAt', 'DESC']],
      attributes: ['zodiacSign', 'period', 'periodKey', 'generatedAt', 'validUntil']
    });
    
    res.json({
      success: true,
      stats: {
        total,
        active,
        expired,
        byPeriod: byPeriod.map(p => ({
          period: p.period,
          count: parseInt(p.dataValues.count)
        })),
        recent: recent.map(r => ({
          sign: r.zodiacSign,
          period: r.period,
          key: r.periodKey,
          generatedAt: r.generatedAt,
          validUntil: r.validUntil
        }))
      }
    });
  } catch (error) {
    console.error('[Admin] Cache stats error:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to fetch cache statistics',
      error: error.message
    });
  }
};

/**
 * Get scheduler status and job information
 * GET /api/admin/horoscope/scheduler-status
 */
const getSchedulerInfo = async (req, res) => {
  try {
    const status = getSchedulerStatus();
    
    res.json({
      success: true,
      scheduler: status
    });
  } catch (error) {
    console.error('[Admin] Scheduler status error:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to fetch scheduler status',
      error: error.message
    });
  }
};

/**
 * Manually trigger cleanup of expired horoscopes
 * POST /api/admin/horoscope/cleanup
 */
const triggerCleanup = async (req, res) => {
  try {
    console.log('[Admin] Manually triggering cleanup...');
    await cleanupExpiredHoroscopes();
    
    res.json({
      success: true,
      message: 'Cleanup completed successfully',
      timestamp: new Date()
    });
  } catch (error) {
    console.error('[Admin] Cleanup error:', error);
    res.status(500).json({
      success: false,
      message: 'Cleanup failed',
      error: error.message
    });
  }
};

/**
 * Invalidate cache for a specific sign and period
 * DELETE /api/admin/horoscope/cache/:zodiacSign/:period
 */
const invalidateCache = async (req, res) => {
  try {
    const { zodiacSign, period } = req.params;
    
    const validSigns = [
      "aries", "taurus", "gemini", "cancer",
      "leo", "virgo", "libra", "scorpio",
      "sagittarius", "capricorn", "aquarius", "pisces"
    ];
    
    const validPeriods = ['daily', 'weekly', 'monthly', 'yearly'];
    
    if (!validSigns.includes(zodiacSign.toLowerCase())) {
      return res.status(400).json({
        success: false,
        message: 'Invalid zodiac sign'
      });
    }
    
    if (!validPeriods.includes(period)) {
      return res.status(400).json({
        success: false,
        message: 'Invalid period'
      });
    }
    
    // Deactivate all matching entries
    const updated = await CachedHoroscope.update(
      { isActive: false },
      {
        where: {
          zodiacSign: zodiacSign.toLowerCase(),
          period: period,
          isActive: true
        }
      }
    );
    
    res.json({
      success: true,
      message: `Invalidated ${updated[0]} cache entries for ${zodiacSign} ${period}`,
      timestamp: new Date()
    });
  } catch (error) {
    console.error('[Admin] Cache invalidation error:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to invalidate cache',
      error: error.message
    });
  }
};

/**
 * Regenerate all horoscopes (all signs, all periods)
 * POST /api/admin/horoscope/regenerate-all
 */
const regenerateAll = async (req, res) => {
  try {
    console.log('[Admin] Regenerating all horoscopes...');
    
    const results = {
      daily: null,
      weekly: null,
      monthly: null,
      yearly: null
    };
    
    // Generate for all periods
    for (const period of ['daily', 'weekly', 'monthly', 'yearly']) {
      try {
        await generateAllHoroscopesForPeriod(period, new Date());
        results[period] = 'success';
        console.log(`[Admin] ✓ ${period} horoscopes regenerated`);
      } catch (error) {
        results[period] = error.message;
        console.error(`[Admin] ✗ ${period} horoscopes failed:`, error.message);
      }
    }
    
    res.json({
      success: true,
      message: 'Regeneration completed',
      results,
      timestamp: new Date()
    });
  } catch (error) {
    console.error('[Admin] Regenerate all error:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to regenerate horoscopes',
      error: error.message
    });
  }
};

module.exports = {
  generateHoroscopesManually,
  getCacheStats,
  getSchedulerInfo,
  triggerCleanup,
  invalidateCache,
  regenerateAll
};
