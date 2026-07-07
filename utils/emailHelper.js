const nodemailer = require('nodemailer');

// Create reusable transporter using Gmail
const transporter = nodemailer.createTransport({
  service: 'gmail',
  auth: {
    user: process.env.EMAIL_USER,
    pass: process.env.EMAIL_PASS,
  },
});

// Send live session invite to lecturer
async function sendLiveInvite({ lecturerEmail, lecturerName, studentName, liveTitle, liveId }) {
  try {
    await transporter.sendMail({
      from: `"UniWeb Platform" <${process.env.EMAIL_USER}>`,
      to: lecturerEmail,
      subject: `📡 Live Session Started: ${liveTitle}`,
      html: `
        <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto;">
          
          <div style="background: #16a34a; padding: 24px; border-radius: 8px 8px 0 0;">
            <h1 style="color: white; margin: 0; font-size: 22px;">🎓 UniWeb</h1>
          </div>

          <div style="background: white; padding: 24px; border: 1px solid #e5e7eb; border-radius: 0 0 8px 8px;">
            
            <h2 style="color: #1f2937;">Hi ${lecturerName || 'Lecturer'},</h2>
            
            <p style="color: #4b5563; line-height: 1.6;">
              Your student <strong>${studentName}</strong> has started a live session on your behalf:
            </p>

            <div style="background: #f0fdf4; border: 1px solid #dcfce7; border-radius: 8px; padding: 16px; margin: 20px 0;">
              <p style="margin: 0; color: #15803d; font-weight: 600; font-size: 16px;">
                📡 ${liveTitle}
              </p>
            </div>

            <p style="color: #4b5563; line-height: 1.6;">
              Click the button below to join the live session now:
            </p>

            <a 
              href="http://localhost:3000/live" 
              style="
                display: inline-block;
                background: #16a34a;
                color: white;
                padding: 12px 28px;
                border-radius: 8px;
                text-decoration: none;
                font-weight: 600;
                font-size: 15px;
                margin: 8px 0;
              "
            >
              Join Live Session →
            </a>

            <p style="color: #9ca3af; font-size: 13px; margin-top: 24px;">
              This notification was sent by UniWeb. If you did not expect this, 
              please contact your department administrator.
            </p>

          </div>

        </div>
      `,
    });
    console.log('✅ Live invite email sent to:', lecturerEmail);
    return true;
  } catch (error) {
    console.error('❌ Email send failed:', error.message);
    return false;
  }
}

module.exports = { sendLiveInvite };