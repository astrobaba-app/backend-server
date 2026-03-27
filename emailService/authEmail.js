const { transporter } = require("../config/nodemailerConfig/nodemailerConfig");

const sendAstrologerPasswordResetOTPEmail = async ({ to, fullName, otp }) => {
	try {
		await transporter.sendMail({
			from: process.env.ADMIN_EMAIL,
			to,
			subject: "Graho Password Reset OTP",
			html: `
				<div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto; padding: 20px; border: 1px solid #ddd; border-radius: 10px;">
					<h2 style="color: #1f2937; text-align: center;">Password Reset Verification</h2>
					<p>Hello ${fullName || "Astrologer"},</p>
					<p>Use the OTP below to reset your Graho astrologer account password.</p>
					<div style="margin: 24px 0; text-align: center;">
						<span style="display: inline-block; letter-spacing: 8px; font-size: 28px; font-weight: 700; padding: 12px 20px; background: #f3f4f6; border-radius: 8px;">${otp}</span>
					</div>
					<p>This OTP is valid for 10 minutes.</p>
					<p>If you did not request this, you can ignore this email.</p>
					<hr style="border: none; border-top: 1px solid #ddd; margin: 24px 0;">
					<p style="font-size: 12px; color: #6b7280;">This is an automated message from Graho.</p>
				</div>
			`,
		});

		return { success: true };
	} catch (error) {
		console.error("Error sending password reset OTP email:", error);
		throw error;
	}
};

module.exports = {
	sendAstrologerPasswordResetOTPEmail,
};

