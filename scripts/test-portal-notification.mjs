import assert from "node:assert/strict";
import handler from "../api/portal-notification.mjs";

const originalFetch = globalThis.fetch;
const originalEnv = { ...process.env };
const MESSAGE_ID = "11111111-1111-4111-8111-111111111111";

function responseRecorder() {
  return {
    statusCode: 0,
    headers: {},
    body: null,
    setHeader(name, value) { this.headers[name.toLowerCase()] = value; },
    end(value) { this.body = JSON.parse(value); },
  };
}

try {
  process.env.SUPABASE_URL = "https://supabase.test";
  process.env.SUPABASE_PUBLISHABLE_KEY = "public-test-key";
  process.env.PORTAL_NOTIFICATION_WEBHOOK_URL = "https://n8n.test/webhook/portal";
  process.env.AIBOT_WEBHOOK_SECRET = "bridge-secret";
  const calls = [];
  globalThis.fetch = async (url, init = {}) => {
    calls.push({ url: String(url), init });
    if (String(url).endsWith("/auth/v1/user")) return Response.json({ id: "client-id" });
    if (String(url).includes("/rest/v1/offerpsp_messages?")) return Response.json([{ id: MESSAGE_ID }]);
    if (String(url).endsWith("/webhook/portal")) return Response.json({ success: true });
    throw new Error(`Unexpected URL ${url}`);
  };
  const response = responseRecorder();
  await handler({
    method: "POST",
    headers: { authorization: "Bearer client-token" },
    body: { portal_message_id: MESSAGE_ID },
  }, response);
  assert.equal(response.statusCode, 202);
  const notification = calls.find((call) => call.url.endsWith("/webhook/portal"));
  assert.equal(notification.init.headers["x-captain-secret"], "bridge-secret");
  assert.deepEqual(JSON.parse(notification.init.body), { portal_message_id: MESSAGE_ID });

  const anonymous = responseRecorder();
  await handler({ method: "POST", headers: {}, body: { portal_message_id: MESSAGE_ID } }, anonymous);
  assert.equal(anonymous.statusCode, 401);
  console.log("Portal notification bridge contract tests passed");
} finally {
  globalThis.fetch = originalFetch;
  process.env = originalEnv;
}
