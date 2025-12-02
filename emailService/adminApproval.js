const { transporter } = require("../config/nodemailerConfig/nodemailerConfig");

const sendAstrologerApprovalEmail = async (astrologer) => {
  try {
    await transporter.sendMail({
      from: process.env.ADMIN_EMAIL,
      to: astrologer.email,
      subject: "Your AstroBaba Profile Has Been Approved! ",
      html: `
        <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto;">
          <h2 style="color: #4CAF50;">Congratulations ${astrologer.fullName}!</h2>
          <p>Your astrologer profile on AstroBaba has been approved.</p>
          <p>You can now start accepting consultations and connecting with users.</p>
          <p><strong>Your Profile Details:</strong></p>
          <ul>
            <li>Name: ${astrologer.fullName}</li>
            <li>Email: ${astrologer.email}</li>
            <li>Skills: ${astrologer.skills.join(", ")}</li>
            <li>Languages: ${astrologer.languages.join(", ")}</li>
          </ul>
          <p>Login to your account and complete your profile setup.</p>
          <p>Best regards,<br>AstroBaba Team</p>
        </div>
      `,
    });
    return { success: true };
  } catch (error) {
    console.error("Error sending approval email:", error);
    return { success: false, error };
  }
};


const sendAstrologerRejectionEmail = async (astrologer, reason = null) => {
  try {
    await transporter.sendMail({
      from: process.env.ADMIN_EMAIL,
      to: astrologer.email,
      subject: "Update on Your AstroBaba Application",
      html: `
        <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto;">
          <h2 style="color: #f44336;">Application Status Update</h2>
          <p>Dear ${astrologer.fullName},</p>
          <p>Thank you for your interest in joining AstroBaba as an astrologer.</p>
          <p>Unfortunately, we are unable to approve your application at this time.</p>
          ${reason ? `<p><strong>Reason:</strong> ${reason}</p>` : ""}
          <p>If you believe this is an error or would like to reapply, please contact our support team.</p>
          <p>Best regards,<br>AstroBaba Team</p>
        </div>
      `,
    });
    return { success: true };
  } catch (error) {
    console.error("Error sending rejection email:", error);
    return { success: false, error };
  }
};

module.exports = {
  sendAstrologerApprovalEmail,
  sendAstrologerRejectionEmail,
};
