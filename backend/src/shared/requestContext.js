// Context van het HTTP-verzoek dat nu wordt afgehandeld.
//
// Elk verzoek krijgt een korte request-id. De logger zet die automatisch als
// `req=…` in elke logregel die tijdens dat verzoek geschreven wordt, ook diep
// in services en repositories. In Seq vind je met `req = '1a2b3c4d'` alles
// wat bij één verzoek hoort. De id gaat ook terug naar de client in de header
// X-Request-Id, zodat je een foutmelding van een gebruiker kunt terugvinden.

const crypto = require('crypto');
const { AsyncLocalStorage } = require('async_hooks');

const storage = new AsyncLocalStorage();

// Een id van een proxy ervoor (nginx) mag doorgegeven worden, mits hij er
// onschuldig uitziet; anders maken we zelf een nieuwe.
const SAFE_ID = /^[A-Za-z0-9_-]{4,64}$/;

function newRequestId() {
  return crypto.randomBytes(4).toString('hex');
}

function requestIdFrom(header) {
  return typeof header === 'string' && SAFE_ID.test(header) ? header : newRequestId();
}

// Express-middleware: vóór alle routes registreren.
function requestContext(req, res, next) {
  const id = requestIdFrom(req.get('X-Request-Id'));
  req.id = id;
  res.set('X-Request-Id', id);
  storage.run({ req: id }, next);
}

// Velden van het lopende verzoek (of null buiten een verzoek).
function currentContext() {
  return storage.getStore() || null;
}

module.exports = { requestContext, currentContext, requestIdFrom, newRequestId };
