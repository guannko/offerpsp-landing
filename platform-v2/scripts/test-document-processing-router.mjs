import assert from "node:assert/strict";
import handler from "../api/document-processing.mjs";

function responseCapture() {
  return {
    statusCode: 200,
    headers: {},
    body: null,
    setHeader(name, value) { this.headers[name.toLowerCase()] = value; return this; },
    status(value) { this.statusCode = value; return this; },
    send(value) { this.body = JSON.parse(String(value)); return this; },
    json(value) { this.body = value; return this; },
    end(value) { if (value) this.body = JSON.parse(String(value)); return this; },
  };
}

const unknown = responseCapture();
await handler({ method: "GET", query: {}, headers: {} }, unknown);
assert.equal(unknown.statusCode, 404);

const mailbox = responseCapture();
await handler({ method: "POST", query: { module: "poll-mailbox" }, headers: {} }, mailbox);
assert.equal(mailbox.statusCode, 401);

const previousParserToken = process.env.OFFERPSP_PARSER_TOKEN;
delete process.env.OFFERPSP_PARSER_TOKEN;
const pdf = responseCapture();
await handler({ method: "POST", query: { module: "extract-offer-pdf" }, headers: {}, body: {} }, pdf);
assert.equal(pdf.statusCode, 503);
if (previousParserToken) process.env.OFFERPSP_PARSER_TOKEN = previousParserToken;

const providerPreflight = responseCapture();
await handler({
  method: "OPTIONS",
  query: { module: "provider-offer-source" },
  headers: { origin: "https://offerpsp.com" },
}, providerPreflight);
assert.equal(providerPreflight.statusCode, 204);
assert.equal(providerPreflight.headers["access-control-allow-origin"], "https://offerpsp.com");

console.log("Document processing router tests passed");
