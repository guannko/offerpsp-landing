import assert from "node:assert/strict";
import { test } from "node:test";
import { EventEmitter } from "node:events";
import { Readable } from "node:stream";
import { createEvidenceFetcher, evidenceUrl, isPublicEvidenceAddress, requestEvidencePage } from "../api/_lib/safe-evidence-fetch.mjs";

const publicAddress = { address: "93.184.216.34", family: 4 };
const resolve = async () => [publicAddress];
const response = { statusCode: 200, body: "<title>Company</title>" };

test("public IP policy blocks private, link-local, mapped, transition, multicast and reserved space", () => {
  for (const ip of ["0.0.0.0", "10.1.1.1", "127.0.0.1", "100.64.0.1", "169.254.169.254", "172.16.1.1", "192.168.1.1", "192.0.0.1", "192.0.2.1", "198.19.0.1", "198.51.100.1", "203.0.113.1", "224.1.1.1", "255.255.255.255", "::1", "::ffff:127.0.0.1", "::ffff:7f00:1", "64:ff9b::7f00:1", "fe80::1", "fc00::1", "ff02::1", "2001::1", "2001:db8::1", "2002:7f00:1::", "3fff::1", "bad"]) assert.equal(isPublicEvidenceAddress(ip), false, ip);
  for (const ip of [publicAddress.address, "8.8.8.8", "2606:4700:4700::1111", "2001:4860:4860::8888"]) assert.equal(isPublicEvidenceAddress(ip), true, ip);
});
test("URL normalization rejects encoded loopback, credentials, nonstandard ports and local hostnames", () => {
  for (const url of ["http://2130706433", "http://0x7f000001", "http://127.1", "http://[::1]", "http://[::ffff:7f00:1]", "http://user:pass@site.org", "https://site.org:8443", "file:///etc/passwd", "http://localhost", "https://a.local", "https://a.internal", "https://site.org.", "https://site.org\\@127.0.0.1", "https://site.org/\nfoo"]) assert.throws(() => evidenceUrl(url), undefined, url);
  assert.equal(evidenceUrl("site.org/path?token=secret#fragment").href, "https://site.org/path");
});
test("all DNS answers are checked, including a mixed public/private answer", async () => {
  let sent = false;
  const fetch = createEvidenceFetcher({ resolve: async () => [publicAddress, { address: "10.0.0.1", family: 4 }], request: async () => { sent = true; } });
  assert.equal((await fetch("https://site.org")).error, "blocked_address");
  assert.equal(sent, false);
});
test("each redirect is re-resolved and pinned; cookies/auth and query values are never forwarded", async () => {
  const calls = [];
  const dns = [];
  const fetch = createEvidenceFetcher({ resolve: async (host) => { dns.push(host); return [publicAddress]; }, request: async (url, address, options) => {
    calls.push([url.href, address, options]);
    return calls.length === 1 ? { statusCode: 302, location: "https://other.org/path?token=secret" } : response;
  } });
  const result = await fetch("https://site.org");
  assert.deepEqual(dns, ["site.org", "other.org"]);
  assert.equal(result.final_url, "https://other.org/path");
  assert.equal(calls[1][1], publicAddress);
  assert.equal(calls[1][2].headers, undefined);
});
test("DNS rebinding between redirect hops is blocked before the second request", async () => {
  let dns = 0, sent = 0;
  const fetch = createEvidenceFetcher({ resolve: async () => ++dns === 1 ? [publicAddress] : [{ address: "127.0.0.1", family: 4 }], request: async () => { sent++; return { statusCode: 302, location: "/next" }; } });
  assert.equal((await fetch("https://site.org")).error, "blocked_address");
  assert.equal(sent, 1);
});
test("redirects to private IP, authenticated URL, downgrade and unlimited loops are rejected", async () => {
  for (const location of ["http://169.254.169.254/", "https://127.0.0.1", "https://user:pass@site.org", "http://site.org", "https://site.org:8443"]) {
    let sent = 0;
    const fetch = createEvidenceFetcher({ resolve, request: async () => { sent++; return { statusCode: 302, location }; } });
    assert.equal((await fetch("https://site.org")).error, "blocked_redirect");
    assert.equal(sent, 1);
  }
  let sent = 0;
  const fetch = createEvidenceFetcher({ resolve, request: async () => { sent++; return { statusCode: 302, location: "/next" }; } });
  assert.equal((await fetch("https://site.org")).error, "redirect_limit");
  assert.equal(sent, 4);
});
test("total timeout covers DNS and request, aborts work and prevents a late DNS result from sending", async () => {
  let lateResolve, sent = 0;
  const fetch = createEvidenceFetcher({ timeoutMs: 15, resolve: () => new Promise((resolve) => { lateResolve = resolve; }), request: async () => { sent++; return response; } });
  assert.equal((await fetch("https://site.org")).error, "timeout");
  lateResolve([publicAddress]);
  await new Promise((resolve) => setImmediate(resolve));
  assert.equal(sent, 0);
  let signal;
  const slow = createEvidenceFetcher({ resolve, timeoutMs: 15, request: async (_url, _address, options) => { signal = options.signal; return new Promise(() => {}); } });
  assert.equal((await slow("https://site.org")).error, "timeout");
  assert.equal(signal.aborted, true);
});

function fakeTransport({ chunks = [Buffer.from("hello")], headers = { "content-type": "text/html" }, statusCode = 200 } = {}, inspect = () => {}) {
  return (url, options, callback) => {
    inspect(url, options);
    const req = new EventEmitter();
    req.end = () => queueMicrotask(() => {
      const res = Readable.from(chunks);
      res.headers = headers; res.statusCode = statusCode;
      callback(res);
    });
    return req;
  };
}
async function transported(config, inspect, kind = "website") {
  return requestEvidencePage(new URL("https://site.org"), publicAddress,
    { signal: new AbortController().signal, maxBytes: 10, kind }, { https: fakeTransport(config, inspect) });
}
test("actual transport uses pinned lookup, TLS host identity and no shared agent", async () => {
  const result = await transported({}, (url, options) => {
    assert.equal(url.hostname, "site.org");
    assert.equal(options.agent, false);
    assert.equal(options.rejectUnauthorized, undefined); // Node's default verification remains on.
    assert.equal(options.checkServerIdentity, undefined);
    assert.equal(options.headers["accept-encoding"], "identity");
    assert.equal(options.headers.authorization, undefined);
    options.lookup("site.org", {}, (err, address, family) => { assert.equal(err, null); assert.equal(address, publicAddress.address); assert.equal(family, 4); });
    options.lookup("site.org", { all: true }, (err, addresses) => { assert.equal(err, null); assert.deepEqual(addresses, [publicAddress]); });
  });
  assert.equal(result.body, "hello");
});
test("transport rejects oversized declared/chunked bodies, compression and non-document content", async () => {
  await assert.rejects(transported({ headers: { "content-type": "text/html", "content-length": "11" } }), /response_too_large/);
  await assert.rejects(transported({ chunks: [Buffer.alloc(6), Buffer.alloc(6)] }), /response_too_large/);
  await assert.rejects(transported({ headers: { "content-type": "text/html", "content-encoding": "gzip" } }), /unsupported_content/);
  await assert.rejects(transported({ headers: { "content-type": "application/pdf" } }), /unsupported_content/);
});
test("RDAP parsing is bounded and failures do not persist raw error messages or URLs", async () => {
  const fetch = createEvidenceFetcher({ resolve, request: async () => ({ statusCode: 200, body: '{"events":[]}' }) });
  assert.deepEqual((await fetch("https://rdap.org/domain/site.org", { kind: "rdap" })).body, { events: [] });
  const bad = createEvidenceFetcher({ resolve, request: async () => { throw new Error("secret-in-URL"); } });
  assert.deepEqual(await bad("https://site.org"), { statusCode: 0, body: "", error: "fetch_failed" });
});
