const sendUserOtpV2 = async ({ mobile, otp }) => {
  // Dummy provider hook: replace this with the production SMS provider later.
  console.log(`[User OTP V2] Sending OTP ${otp} to ${mobile}`);
  return { success: true };
};

module.exports = sendUserOtpV2;
