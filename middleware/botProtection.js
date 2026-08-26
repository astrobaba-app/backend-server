const admin = require('../config/firebaseConfig');
const axios = require('axios');

const verifyBotProtection = async (req, res, next) => {
  // Allow toggling enforcement via environment variable for easier rollout
  if (process.env.ENFORCE_BOT_PROTECTION !== 'true') {
    return next();
  }

  try {
    const clientType = req.headers['x-client-type'] || 'app'; // Default to app if not specified

    if (clientType === 'web') {
      // 1. Verify reCAPTCHA for web clients
      const recaptchaToken = req.headers['x-recaptcha-token'];
      if (!recaptchaToken) {
        return res.status(401).json({ success: false, message: 'Missing reCAPTCHA token' });
      }

      const secretKey = process.env.RECAPTCHA_SECRET_KEY;
      if (!secretKey) {
        console.error('RECAPTCHA_SECRET_KEY is not defined in .env');
        // If the server isn't configured, we block the request to ensure security isn't bypassed by misconfiguration
        return res.status(500).json({ success: false, message: 'Server configuration error' });
      }

      const response = await axios.post(
        `https://www.google.com/recaptcha/api/siteverify?secret=${secretKey}&response=${recaptchaToken}`
      );
      
      // Score ranges from 0.0 to 1.0 (1.0 is very likely a good interaction, 0.0 is very likely a bot)
      if (response.data.success && response.data.score >= 0.5) {
        return next();
      } else {
        console.warn('reCAPTCHA verification failed or score too low:', response.data);
        return res.status(403).json({ success: false, message: 'reCAPTCHA verification failed' });
      }
    } else {
      // 2. Verify Firebase App Check for mobile apps
      const appCheckToken = req.header('X-Firebase-AppCheck');

      if (!appCheckToken) {
        return res.status(403).json({ success: false, message: 'Missing Firebase App Check token' });
      }

      const appCheckClaims = await admin.appCheck().verifyToken(appCheckToken);
      
      // If we reach here, the token is valid. 
      // appCheckClaims can be used if you need to check if the token was a replay, etc.
      if (appCheckClaims) {
         return next();
      }
    }
  } catch (error) {
    console.error('Bot Protection Error:', error.message);
    return res.status(403).json({ success: false, message: 'Unauthorized request - Bot protection failed' });
  }
};

module.exports = { verifyBotProtection };
