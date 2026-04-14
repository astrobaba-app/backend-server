const { transporter } = require("../config/nodemailerConfig/nodemailerConfig");

const sendJobApplicationReceivedEmail = async ({ to, fullName, jobTitle }) => {
  const safeName = fullName || "Candidate";
  const safeRole = jobTitle || "the selected role";

  const mailOptions = {
    from: process.env.ADMIN_EMAIL,
    to,
    subject: `Application Received: ${safeRole}`,
    html: `
      <div style="font-family: Arial, sans-serif; line-height: 1.6; color: #1f2937;">
        <h2 style="margin-bottom: 8px;">Hi ${safeName},</h2>
        <p style="margin-top: 0;">Thank you for applying for <strong>${safeRole}</strong> at Graho.</p>
        <p>Your form has been received successfully.</p>
        <p>If you are shortlisted, our hiring team will contact you for the next round.</p>
        <p style="margin-top: 24px;">Regards,<br/>Graho Careers Team</p>
      </div>
    `,
  };

  return transporter.sendMail(mailOptions);
};

module.exports = {
  sendJobApplicationReceivedEmail,
};
