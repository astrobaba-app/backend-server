const axios = require('axios');
const crypto = require('crypto');

/**
 * Normalizes and hashes a string using SHA-256 as required by Meta Conversions API
 */
const hashData = (data) => {
  if (!data) return null;
  const normalized = String(data).trim().toLowerCase();
  if (!normalized) return null;
  return crypto.createHash('sha256').update(normalized).digest('hex');
};

/**
 * Normalizes phone number to international format before hashing
 * Assumes Indian numbers if 10 digits long
 */
const hashPhone = (mobile) => {
  if (!mobile) return null;
  let phoneStr = String(mobile).replace(/\D/g, ''); // Remove non-digits
  
  if (!phoneStr) return null;

  // Assuming Indian numbers if exactly 10 digits
  if (phoneStr.length === 10) {
    phoneStr = '91' + phoneStr;
  }
  
  return hashData(phoneStr);
};

/**
 * Sends a Purchase event to Meta Conversions API
 * @param {Object} params
 * @param {Object} params.user - User object (from DB)
 * @param {number} params.amount - The recharge amount
 * @param {string} params.currency - Currency code (e.g., 'INR')
 * @param {string} params.transactionId - Unique ID for deduplication
 * @param {string} [params.clientIp] - User's IP address
 * @param {string} [params.userAgent] - User's browser/device agent
 */
const trackPurchaseEvent = async ({
  user,
  amount,
  currency = 'INR',
  transactionId,
  clientIp,
  userAgent,
}) => {
  try {
    const pixelId = process.env.META_PIXEL_ID;
    const accessToken = process.env.META_ACCESS_TOKEN;

    if (!pixelId || !accessToken) {
      console.warn('[Meta CAPI] Missing META_PIXEL_ID or META_ACCESS_TOKEN in env. Skipping event.');
      return;
    }

    if (!amount || amount <= 0) return;

    // Build user_data safely
    const userData = {};

    if (user && user.email) {
      const hashedEmail = hashData(user.email);
      if (hashedEmail) userData.em = hashedEmail;
    }

    if (user && user.mobile) {
      const hashedPhone = hashPhone(user.mobile);
      if (hashedPhone) userData.ph = hashedPhone;
    }

    // Include external_id (user's ID in our DB) if available
    if (user && user.id) {
      userData.external_id = hashData(user.id);
    }

    if (clientIp) userData.client_ip_address = clientIp;
    if (userAgent) userData.client_user_agent = userAgent;

    const payload = {
      data: [
        {
          event_name: 'Purchase',
          event_time: Math.floor(Date.now() / 1000), // Unix timestamp in seconds
          action_source: 'app',
          user_data: userData,
          custom_data: {
            currency: currency,
            value: Number(amount),
            order_id: transactionId,
          },
        },
      ],
    };

    const url = `https://graph.facebook.com/v19.0/${pixelId}/events?access_token=${accessToken}`;

    // Send async request, don't await the response here as we don't want to block the user flow
    axios.post(url, payload)
      .then(response => {
        console.log(`[Meta CAPI] Purchase event sent successfully for transaction: ${transactionId}`);
      })
      .catch(error => {
        const errorMsg = error.response?.data?.error?.message || error.message;
        console.error(`[Meta CAPI] Failed to send Purchase event: ${errorMsg}`);
      });

  } catch (err) {
    console.error('[Meta CAPI] Unexpected error:', err.message);
  }
};

module.exports = {
  trackPurchaseEvent,
};
