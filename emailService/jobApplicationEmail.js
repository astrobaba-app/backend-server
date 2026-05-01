const { transporter } = require("../config/nodemailerConfig/nodemailerConfig");

const sendJobApplicationReceivedEmail = async ({ to, fullName, jobTitle }) => {
  const safeName = fullName || "Candidate";
  const safeRole = jobTitle || "the selected role";

  const mailOptions = {
    from: `"Graho Careers" <${process.env.ADMIN_EMAIL}>`,
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

const sendJobApplicationAcceptedEmail = async ({ to, fullName, jobTitle }) => {
  const safeName = fullName || "Candidate";
  const safeRole = jobTitle || "the role you applied for";

  const mailOptions = {
    from: `"Graho Careers" <${process.env.ADMIN_EMAIL}>`,
    to,
    subject: `Congratulations! Your ${safeRole} application is accepted`,
    html: `
      <div style="font-family: Arial, sans-serif; line-height: 1.6; color: #1f2937;">
        <h2 style="margin-bottom: 8px;">Hi ${safeName},</h2>
        <p style="margin-top: 0;">Congratulations on being accepted for <strong>${safeRole}</strong> at Graho.</p>
        <p>After careful evaluation, we are excited to move forward with your application.</p>
        <p>Our hiring team will contact you soon with the offer letter and next steps.</p>
        <p style="margin-top: 24px;">Regards,<br/>Graho Careers Team</p>
      </div>
    `,
  };

  return transporter.sendMail(mailOptions);
};

const sendJobApplicationRejectedEmail = async ({ to, fullName, jobTitle, reason }) => {
  const safeName = fullName || "Candidate";
  const safeRole = jobTitle || "the role you applied for";

  const mailOptions = {
    from: `"Graho Careers" <${process.env.ADMIN_EMAIL}>`,
    to,
    subject: `Update on your ${safeRole} application`,
    html: `
      <div style="font-family: Arial, sans-serif; line-height: 1.6; color: #1f2937;">
        <h2 style="margin-bottom: 8px;">Hi ${safeName},</h2>
        <p style="margin-top: 0;">Thank you for applying for <strong>${safeRole}</strong> at Graho.</p>
        <p>After careful consideration, we will not be moving forward with your application at this time.</p>
        ${reason ? `<p><strong>Note:</strong> ${reason}</p>` : ""}
        <p>We appreciate your interest and wish you all the best in your search.</p>
        <p style="margin-top: 24px;">Regards,<br/>Graho Careers Team</p>
      </div>
    `,
  };

  return transporter.sendMail(mailOptions);
};

module.exports = {
  sendJobApplicationReceivedEmail,
  sendJobApplicationAcceptedEmail,
  sendJobApplicationRejectedEmail,
};
