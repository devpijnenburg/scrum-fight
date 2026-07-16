const { sendMail } = require('../../config/email');

function baseUrl() {
  return process.env.BASE_URL || 'http://localhost';
}

async function sendVerificationEmail({ name, email }, token) {
  await sendMail(
    email,
    'Bevestig je e-mailadres — Scrum Fight',
    `Hoi ${name},\n\nKlik op de link hieronder om je e-mailadres te bevestigen:\n\n${baseUrl()}/verify-email.html?token=${token}\n\nDeze link is eenmalig geldig.\n\nGroeten,\nScrum Fight`
  );
}

async function sendLoginCodeEmail({ name, email }, code) {
  await sendMail(
    email,
    'Je inlogcode — Scrum Fight',
    `Hoi ${name},\n\nJe inlogcode is: ${code}\n\nDeze code is 10 minuten geldig.\n\nGroeten,\nScrum Fight`
  );
}

module.exports = { sendVerificationEmail, sendLoginCodeEmail };
