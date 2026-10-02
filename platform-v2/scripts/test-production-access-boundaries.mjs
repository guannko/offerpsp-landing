import assert from 'node:assert/strict';

// Bounded anonymous/invalid-token diagnostics only. No valid session, business
// identifiers, file payloads, destinations or communication content are used.
const origin = 'https://ops-7q4m2x9k8v3n.vercel.app';
const startedAt = new Date().toISOString();
const requireNoStore = process.argv.includes('--require-no-store');
const routes = [
  ['/api/integration-health', 'GET'],
  ['/api/aibot-command', 'POST'],
  ['/api/send-email', 'POST'],
  ['/api/send-telegram', 'POST'],
  ['/api/extract-document', 'POST'],
  ['/api/parse-offer', 'POST'],
  ['/api/unified-search', 'GET'],
  ['/api/hybrid-memory-search', 'POST'],
  ['/api/search-index-sync', 'POST'],
  ['/api/poll-mailbox', 'POST'],
  ['/api/extract-offer-pdf', 'POST'],
  ['/api/oauth/request', 'POST'],
  ['/api/oauth/decision', 'POST'],
  ['/mcp', 'POST', { jsonrpc: '2.0', id: 'qa-denied-read', method: 'tools/list' }],
];
const results = [];
for (const [path, method, body = {}] of routes) {
  for (const mode of ['anonymous', 'invalid-bearer']) {
    const started = performance.now();
    const response = await fetch(`${origin}${path}`, {
      method,
      redirect: 'manual',
      headers: {
        'content-type': 'application/json',
        ...(mode === 'invalid-bearer' ? { authorization: 'Bearer QA-INVALID-NOT-A-CREDENTIAL' } : {}),
      },
      ...(method === 'POST' ? { body: JSON.stringify(body) } : {}),
      signal: AbortSignal.timeout(15000),
    });
    const text = await response.text();
    let payload;
    try { payload = JSON.parse(text); } catch { payload = null; }
    const result = {
      path, method, mode, status: response.status,
      json: payload != null,
      cacheControl: response.headers.get('cache-control'),
      elapsedMs: Math.round(performance.now() - started),
      error: payload?.error?.message ?? payload?.error ?? null,
      pass: [401, 403].includes(response.status) && payload != null &&
        (!requireNoStore || response.headers.get('cache-control') === 'no-store'),
    };
    results.push(result);
    console.log(JSON.stringify(result));
  }
}
console.log(JSON.stringify({ kind: 'summary', startedAt, finishedAt: new Date().toISOString(), requireNoStore,
  requests: results.length, passed: results.filter(x => x.pass).length,
  failed: results.filter(x => !x.pass).length,
  limit: 'Authentication-denial diagnostics, not penetration testing or a capacity test' }));
assert.equal(results.filter(x => !x.pass).length, 0, 'Review failed boundary diagnostics individually');
