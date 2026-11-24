const nodemailer = require('nodemailer');
const { createLogger } = require('./logger');

const log = createLogger('mail');

let _transporter = null;
let _from = '';

function _getTransporter() {
  if (_transporter !== null) return _transporter;

  const smtpHost = (process.env.SMTP_HOST || '').trim();
  if (!smtpHost) {
    log.warn('SMTP_HOST niet ingesteld, e-mails worden overgeslagen');
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
    log.warn('Mail overgeslagen (geen SMTP)', { subject, to });
    return;
  }
  try {
    await transporter.sendMail({ from: _from, to, subject, text });
    log.info('Mail verstuurd', { subject, to });
  } catch (err) {
    log.error('SMTP-fout bij versturen', { subject, to }, err);
    throw err;
  }
}

module.exports = { sendMail };
