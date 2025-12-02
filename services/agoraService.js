const { RtcTokenBuilder, RtcRole } = require("agora-token");
const crypto = require("crypto");

class AgoraService {
  constructor() {
    this.appId = process.env.AGORA_APP_ID;
    this.appCertificate = process.env.AGORA_APP_CERTIFICATE;
    
    if (!this.appId || !this.appCertificate) {
      console.warn("⚠️ Agora credentials not found in environment variables");
    }
  }

  /**
   * Generate unique channel name
   */
  generateChannelName(prefix = "channel") {
    const timestamp = Date.now();
    const random = crypto.randomBytes(4).toString("hex");
    return `${prefix}_${timestamp}_${random}`;
  }

  /**
   * Generate Agora RTC Token
   * @param {string} channelName - Channel name
   * @param {number} uid - User ID (0 for dynamic assignment)
   * @param {string} role - 'publisher' or 'subscriber'
   * @param {number} expirationTimeInSeconds - Token validity (default 3600 = 1 hour)
   */
  generateRtcToken(channelName, uid = 0, role = "publisher", expirationTimeInSeconds = 3600) {
    if (!this.appId || !this.appCertificate) {
      throw new Error("Agora credentials not configured");
    }

    const currentTimestamp = Math.floor(Date.now() / 1000);
    const privilegeExpiredTs = currentTimestamp + expirationTimeInSeconds;

    // Set role
    const rtcRole = role === "publisher" ? RtcRole.PUBLISHER : RtcRole.SUBSCRIBER;

    // Generate token
    const token = RtcTokenBuilder.buildTokenWithUid(
      this.appId,
      this.appCertificate,
      channelName,
      uid,
      rtcRole,
      privilegeExpiredTs,
      privilegeExpiredTs
    );

    return {
      token,
      appId: this.appId,
      channelName,
      uid,
      expiresAt: new Date(privilegeExpiredTs * 1000),
    };
  }

  /**
   * Generate token for live streaming (astrologer as host)
   */
  generateLiveStreamToken(channelName, uid = 0) {
    return this.generateRtcToken(channelName, uid, "publisher", 7200); // 2 hours
  }

  /**
   * Generate token for viewer (subscriber role)
   */
  generateViewerToken(channelName, uid = 0) {
    return this.generateRtcToken(channelName, uid, "subscriber", 7200); // 2 hours
  }

  /**
   * Generate token for 1-on-1 call (both as publishers)
   */
  generateCallToken(channelName, uid = 0) {
    return this.generateRtcToken(channelName, uid, "publisher", 3600); // 1 hour
  }

  /**
   * Generate unique UID for user
   */
  generateUid() {
    return Math.floor(Math.random() * 1000000) + 1000;
  }
}

module.exports = new AgoraService();
