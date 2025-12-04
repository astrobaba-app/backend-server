const getClientIp = (req) => {
  // Priority order for IP detection:
  // 1. x-forwarded-for - Most common header set by proxies/load balancers (Nginx, Apache, AWS ELB)
  // 2. x-real-ip - Set by Nginx when using proxy_pass
  // 3. cf-connecting-ip - Cloudflare specific header (real client IP)
  // 4. x-client-ip - Some proxies use this
  // 5. x-cluster-client-ip - Used in cluster environments
  // 6. req.ip - Express built-in (trust proxy must be enabled)
  // 7. req.connection.remoteAddress - Direct connection
  // 8. req.socket.remoteAddress - Socket connection
  
  let ipAddress = 
    req.headers['x-forwarded-for']?.split(',')[0]?.trim() || // First IP if chain exists
    req.headers['x-real-ip'] ||
    req.headers['cf-connecting-ip'] ||
    req.headers['x-client-ip'] ||
    req.headers['x-cluster-client-ip'] ||
    req.ip ||
    req.connection?.remoteAddress ||
    req.socket?.remoteAddress ||
    '0.0.0.0';

  // Clean IPv6 localhost to IPv4 for consistency
  if (ipAddress === '::1' || ipAddress === '::ffff:127.0.0.1') {
    ipAddress = '127.0.0.1';
  }

  // Remove IPv6 prefix if present
  if (ipAddress.startsWith('::ffff:')) {
    ipAddress = ipAddress.replace('::ffff:', '');
  }

  return ipAddress;
};

/**
 * Get user agent from request headers
 * 
 * @param {Object} req - Express request object
 * @returns {String} - User agent string
 */
const getUserAgent = (req) => {
  return req.headers['user-agent'] || 'Unknown';
};

/**
 * Get user ID from authenticated request
 * 
 * @param {Object} req - Express request object
 * @returns {String|null} - User ID if authenticated, null otherwise
 */
const getUserId = (req) => {
  return req.user?.id || null;
};

/**
 * Get client information bundle
 * 
 * @param {Object} req - Express request object
 * @returns {Object} - { userId, ipAddress, userAgent }
 */
const getClientInfo = (req) => {
  return {
    userId: getUserId(req),
    ipAddress: getClientIp(req),
    userAgent: getUserAgent(req),
  };
};

module.exports = {
  getClientIp,
  getUserAgent,
  getUserId,
  getClientInfo,
};
