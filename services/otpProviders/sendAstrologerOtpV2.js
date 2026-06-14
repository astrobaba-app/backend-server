const sendAstrologerOtpV2 = async ({ phoneNumber, otp }) => {
  // Dummy provider hook: replace this with Twilio/MSG91/etc later.
  console.log(`[Astrologer OTP V2] Sending OTP ${otp} to ${phoneNumber}`);
  return { success: true };
};

module.exports = sendAstrologerOtpV2;
