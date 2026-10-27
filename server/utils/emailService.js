const nodemailer = require('nodemailer');

/* An explicit opt-out, so a run that means to be silent is not reported as a mistake */
const emailDisabled = process.env.EMAIL_DISABLED === '1' || process.env.EMAIL_DISABLED === 'true';

if (emailDisabled) {
  console.log('• Email sending is disabled for this run (EMAIL_DISABLED), so new accounts skip email verification');
} else if (!process.env.EMAIL_USER || !process.env.EMAIL_PASS) {
  /* Without credentials every send is skipped, so the problem is announced once at startup */
  console.error(
    '✗ EMAIL_USER / EMAIL_PASS are not set — verification and recovery emails ' +
    'will NOT send, and new accounts skip email verification. Add them to your .env (see env.example for instructions).'
  );
}

let transporter = null;
let injected = false;

/* Built on first use, so no Gmail transport exists while email is off or a stub stands in */
const getTransporter = () => {
  if (!transporter) {
    transporter = nodemailer.createTransport({
      service: 'gmail',
      auth: {
        user: process.env.EMAIL_USER,
        pass: process.env.EMAIL_PASS,
      },
    });
  }
  return transporter;
};

/* Lets the tests drop in a stub, which is how no mail leaves the machine during a run */
const setTransporter = (replacement) => {
  transporter = replacement;
  injected = true;
};

/* Lets a send be skipped rather than fail every time, as the missing setup is reported once at startup */
const canSend = () =>
  !emailDisabled && (injected || (!!process.env.EMAIL_USER && !!process.env.EMAIL_PASS));

/* Has Gmail check the credentials at startup, so a bad password shows in the log before any user needs a mail */
if (process.env.NODE_ENV !== 'test' && canSend()) {
  getTransporter().verify()
    .then(() => console.log('✓ Email transporter ready — credentials accepted by Gmail'))
    .catch(err => console.error('✗ Email transporter configuration error:', err.message));
}

/* Styles are inline because mail clients throw away stylesheets, and shared so both mails match */
const shell = (inner) => `
      <div style="font-family:Georgia,serif;background:#0d2438;color:#a5e1fc;padding:40px;border-radius:12px;max-width:480px;margin:auto;">
        ${inner}
        <p style="margin-top:32px;color:#9dd9fb;font-style:italic;">— The Puck team</p>
      </div>
    `;

/* The link is a button, with the address written out under it for mail clients which strip links */
const sendVerificationEmail = async (toEmail, link) => {
  if (!canSend()) return;

  const mailOptions = {
    from: `"Puck" <${process.env.EMAIL_USER}>`,
    to: toEmail,
    subject: 'Verify your Puck email ✦',
    html: shell(`
        <h1 style="color:#9dd9fb;letter-spacing:0.08em;margin-bottom:8px;">Welcome to Puck</h1>
        <p style="font-style:italic;color:#8ad6fb;margin-bottom:24px;">Your journey begins.</p>
        <p style="line-height:1.7;">Your account has been created. Open the link below to verify this email address and unlock it. The link expires in 24 hours.</p>
        <div style="text-align:center;margin:28px 0;">
          <a href="${link}" style="display:inline-block;padding:12px 28px;background:#1d5f8f;color:#e3f4ff;font-size:18px;font-weight:bold;letter-spacing:0.08em;text-decoration:none;border-radius:8px;">Verify my email</a>
        </div>
        <p style="line-height:1.7;font-size:13px;color:#8ad6fb;word-break:break-all;">If the button does nothing, paste this into your browser: ${link}</p>
        <p style="line-height:1.7;">If you didn't create a Puck account, you can safely ignore this email — nothing will happen without the link.</p>`),
  };
  await getTransporter().sendMail(mailOptions);
};

const sendPasswordResetEmail = async (toEmail, code) => {
  if (!canSend()) return;

  const mailOptions = {
    from: `"Puck" <${process.env.EMAIL_USER}>`,
    to: toEmail,
    subject: 'Your Puck recovery code ✦',
    html: shell(`
        <h1 style="color:#9dd9fb;letter-spacing:0.08em;margin-bottom:8px;">Password Reset</h1>
        <p style="font-style:italic;color:#8ad6fb;margin-bottom:24px;">A key to reclaim your account.</p>
        <p style="line-height:1.7;">Use the code below to reset your Puck password. It expires in 15 minutes.</p>
        <div style="font-size:34px;font-weight:bold;letter-spacing:0.3em;color:#9dd9fb;text-align:center;margin:28px 0;">${code}</div>
        <p style="line-height:1.7;">If you didn't request this, you can safely ignore this email — your password will remain unchanged.</p>`),
  };
  await getTransporter().sendMail(mailOptions);
};

module.exports = { sendVerificationEmail, sendPasswordResetEmail, setTransporter, canSend };