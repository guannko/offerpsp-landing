import assert from 'node:assert/strict';
import sendEmail from '../api/send-email.mjs';
import extractDocument from '../api/extract-document.mjs';
import parseOffer from '../api/parse-offer.mjs';
import extractOfferPdf from '../api/_lib/extract-offer-pdf-handler.mjs';

// Synthetic configuration only; an unexpected network call fails immediately.
process.env.VITE_SUPABASE_URL = 'https://example.invalid';
process.env.VITE_SUPABASE_PUBLISHABLE_KEY = 'qa-publishable';
process.env.N8N_EMAIL_WEBHOOK_URL = 'https://example.invalid/sender';
process.env.AIBOT_WEBHOOK_SECRET = 'qa-webhook';
process.env.OFFERPSP_PARSER_TOKEN = 'qa-parser';
globalThis.fetch = async () => { throw new Error('Denied request must not reach transport'); };

function responseFixture() {
  return {
    statusCode: null, headers: new Map(), body: '',
    status(value) { this.statusCode = value; return this; },
    setHeader(key, value) { this.headers.set(key.toLowerCase(), value); return this; },
    end(value) { this.body = value; return this; },
    send(value) { this.body = value; return this; },
  };
}
const failures = [];
for (const [name, handler] of Object.entries({ sendEmail, extractDocument, parseOffer, extractOfferPdf })) {
  for (const method of ['POST', 'GET']) {
    const response = responseFixture();
    await handler({ method, headers: {}, body: {} }, response);
    assert.equal(response.statusCode, method === 'POST' ? 401 : 405, `${name}: denial status`);
    if (response.headers.get('cache-control') !== 'no-store') failures.push(`${name} ${method}`);
  }
}
assert.deepEqual(failures, [], `Private API responses missing no-store: ${failures.join(', ')}`);
console.log('PASS: eight private API denial/method responses explicitly disable caching; no transport invoked');
