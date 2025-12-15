/**
 * Admin routes for horoscope cache management
 * Optional: Include these in your admin routes file if you want manual control
 * 
 * Usage in main admin route file:
 * const horoscopeCacheRoutes = require('./horoscopeCacheAdminRoute');
 * router.use('/horoscope', horoscopeCacheRoutes);
 */

const express = require('express');
const router = express.Router();
const {
  generateHoroscopesManually,
  getCacheStats,
  getSchedulerInfo,
  triggerCleanup,
  invalidateCache,
  regenerateAll
} = require('../../controller/admin/horoscopeCacheAdminController');

// Optional: Add authentication middleware here
// const { authMiddleware, adminMiddleware } = require('../../middleware/authMiddleware');
// router.use(authMiddleware);
// router.use(adminMiddleware);

/**
 * @route   POST /api/admin/horoscope/generate/:period
 * @desc    Manually generate horoscopes for a specific period
 * @access  Admin
 * @params  period - daily | weekly | monthly | yearly
 * @example POST /api/admin/horoscope/generate/daily
 */
router.post('/generate/:period', generateHoroscopesManually);

/**
 * @route   GET /api/admin/horoscope/cache-stats
 * @desc    Get cache statistics (total, active, expired, by period)
 * @access  Admin
 * @example GET /api/admin/horoscope/cache-stats
 */
router.get('/cache-stats', getCacheStats);

/**
 * @route   GET /api/admin/horoscope/scheduler-status
 * @desc    Get scheduler status and cron job information
 * @access  Admin
 * @example GET /api/admin/horoscope/scheduler-status
 */
router.get('/scheduler-status', getSchedulerInfo);

/**
 * @route   POST /api/admin/horoscope/cleanup
 * @desc    Manually trigger cleanup of expired horoscopes
 * @access  Admin
 * @example POST /api/admin/horoscope/cleanup
 */
router.post('/cleanup', triggerCleanup);

/**
 * @route   DELETE /api/admin/horoscope/cache/:zodiacSign/:period
 * @desc    Invalidate cache for specific sign and period
 * @access  Admin
 * @params  zodiacSign - aries, taurus, etc.
 * @params  period - daily | weekly | monthly | yearly
 * @example DELETE /api/admin/horoscope/cache/aries/daily
 */
router.delete('/cache/:zodiacSign/:period', invalidateCache);

/**
 * @route   POST /api/admin/horoscope/regenerate-all
 * @desc    Regenerate all horoscopes for all signs and all periods
 * @access  Admin
 * @example POST /api/admin/horoscope/regenerate-all
 */
router.post('/regenerate-all', regenerateAll);

module.exports = router;
