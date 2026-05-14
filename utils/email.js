const nodemailer = require('nodemailer');

// Create transporter using env configuration
const transporter = nodemailer.createTransport({
  host: process.env.SMTP_HOST,
  port: Number(process.env.SMTP_PORT) || 465,
  secure: true,
  auth: {
    user: process.env.SMTP_USERNAME,
    pass: process.env.SMTP_PASSWORD
  }
});

const sendEmail = async ({ to, subject, html }) => {
  if (!process.env.SMTP_USERNAME || !process.env.SMTP_PASSWORD) {
    throw new Error('SMTP credentials are not configured');
  }

  const mailOptions = {
    from: process.env.SMTP_USERNAME,
    to,
    subject,
    html
  };

  await transporter.sendMail(mailOptions);
};

module.exports = sendEmail;







