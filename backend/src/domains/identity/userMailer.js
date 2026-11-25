const { sendMail } = require('../../shared/mailer');

function baseUrl() {
  return process.env.BASE_URL || 'http://localhost';
}

async function sendVerificationEmail({ name, email }, token) {
  await sendMail(
    email,
    'Bevestig je e-mailadres — ScrumFight',
    `Hoi ${name},\n\nKlik op de link hieronder om je e-mailadres te bevestigen:\n\n${baseUrl()}/verify-email.html?token=${token}\n\nDeze link is eenmalig geldig.\n\nGroeten,\nScrumFight`
  );
}

async function sendLoginCodeEmail({ name, email }, code) {
  await sendMail(
    email,
    'Je inlogcode — ScrumFight',
    `Hoi ${name},\n\nJe inlogcode is: ${code}\n\nDeze code is 10 minuten geldig.\n\nGroeten,\nScrumFight`
  );
}

module.exports = { sendVerificationEmail, sendLoginCodeEmail };
