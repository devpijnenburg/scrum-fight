const speakeasy = require('speakeasy');

function verifyTotpCode(secret, code) {
  return speakeasy.totp.verify({ secret, encoding: 'base32', token: code, window: 1 });
}

module.exports = { verifyTotpCode };
