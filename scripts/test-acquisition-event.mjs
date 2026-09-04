import assert from "node:assert/strict";
import handler from "../api/acquisition-event.mjs";

const originalFetch = globalThis.fetch;
const originalEnv = { ...process.env };
const FLOW_ID = "11111111-1111-4111-8111-111111111111";

function responseRecorder() {
  return {
    statusCode: 0,
    headers: {},
    body: null,
    setHeader(name, value) { this.headers[name.toLowerCase()] = value; },
    end(value) { this.body = JSON.parse(value); },
  };
}

const request = (body, headers = {}) => ({
  method: "POST",
  headers: {
    origin: "https://offerpsp.com",
    "x-forwarded-for": "203.0.113.7",
    ...headers,
  },
  body,
});

try {
  process.env.VERCEL_ENV = "production";
  process.env.SUPABASE_URL = "https://supabase.test";
  process.env.SUPABASE_PUBLISHABLE_KEY = "public-test-key";
  process.env.OFFERPSP_EVENT_INGEST_SECRET = "single-purpose-test-secret";
  const calls = [];
  globalThis.fetch = async (url, init = {}) => {
    calls.push({ url: String(url), init });
    return new Response(null, { status: 201 });
  };

  const accepted = responseRecorder();
  await handler(request({
    event_name: "lead_form_open",
    flow_id: FLOW_ID,
    page_path: "/",
    placement: "hero",
    is_qa: true,
    ignored_personal_field: "must-not-be-forwarded",
  }), accepted);
  assert.equal(accepted.statusCode, 202);
  assert.equal(calls.length, 1);
  assert.equal(calls[0].url, "https://supabase.test/rest/v1/offerpsp_experience_events");
  const stored = JSON.parse(calls[0].init.body);
  assert.deepEqual(stored, {
    event_name: "lead_form_open",
    flow_id: FLOW_ID,
    page_path: "/",
    placement: "hero",
    is_qa: true,
  });
  assert.equal(calls[0].init.headers.apikey, "public-test-key");
  assert.equal(calls[0].init.headers["x-offerpsp-ingest-secret"], "single-purpose-test-secret");

  const unsupported = responseRecorder();
  await handler(request({ event_name: "email_value", flow_id: FLOW_ID, page_path: "/" }), unsupported);
  assert.equal(unsupported.statusCode, 400);
  assert.equal(calls.length, 1);

  const foreignOrigin = responseRecorder();
  await handler(request({ event_name: "process_click", flow_id: FLOW_ID, page_path: "/" }, { origin: "https://example.com" }), foreignOrigin);
  assert.equal(foreignOrigin.statusCode, 403);
  assert.equal(calls.length, 1);

  console.log("PASS acquisition events accept only safe first-party funnel data");
} finally {
  globalThis.fetch = originalFetch;
  process.env = originalEnv;
}
