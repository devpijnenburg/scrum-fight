const nodemailer = require('nodemailer');

const ROB_EMAIL = process.env.ROB_EMAIL || '';

let _transporter = null;
let _from = '';

function _getTransporter() {
  if (_transporter !== null) return _transporter;

  const smtpHost = (process.env.SMTP_HOST || '').trim();
  if (!smtpHost) {
    console.warn('[mail] SMTP_HOST niet ingesteld — e-mails worden overgeslagen.');
    _transporter = false;
    return false;
  }

  const smtpUser = (process.env.SMTP_USER || '').trim();
  const starttls = (process.env.SMTP_STARTTLS || 'true').trim().toLowerCase() !== 'false';
  const sslTls = (process.env.SMTP_SSL_TLS || 'false').trim().toLowerCase() === 'true';
  const port = parseInt(process.env.SMTP_PORT || '587', 10);
  const smtpFrom = (process.env.SMTP_FROM || `noreply@${smtpHost}`).trim();

  _from = smtpFrom;

  _transporter = nodemailer.createTransport({
    host: smtpHost,
    port,
    secure: sslTls,
    requireTLS: starttls && !sslTls,
    auth: smtpUser
      ? { user: smtpUser, pass: process.env.SMTP_PASSWORD || '' }
      : undefined,
  });

  return _transporter;
}

async function sendMail(to, subject, text) {
  const transporter = _getTransporter();
  if (!transporter) {
    console.warn(`[mail] Mail overgeslagen (geen SMTP): ${subject} → ${to}`);
    return;
  }
  try {
    await transporter.sendMail({ from: _from, to, subject, text });
    console.info(`[mail] Verstuurd: ${subject} → ${to}`);
  } catch (err) {
    console.error(`[mail] SMTP-fout bij versturen naar ${to} (onderwerp: ${subject}):`, err);
    throw err;
  }
}

async function sendAdminNotification(subject, text) {
  if (!ROB_EMAIL) {
    console.warn('[mail] ROB_EMAIL niet ingesteld — admin-notificatie overgeslagen.');
    return;
  }
  await sendMail(ROB_EMAIL, `[Scrum Fight] ${subject}`, text);
}

module.exports = { sendMail, sendAdminNotification };
