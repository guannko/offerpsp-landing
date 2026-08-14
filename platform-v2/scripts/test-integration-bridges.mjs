import assert from "node:assert/strict";
import aibotHandler from "../api/aibot-command.mjs";
import healthHandler from "../api/integration-health.mjs";
import emailHandler from "../api/send-email.mjs";
import telegramHandler from "../api/send-telegram.mjs";

const originalFetch = globalThis.fetch;
const originalEnv = { ...process.env };

function responseRecorder() {
  return {
    statusCode: 0,
    headers: {},
    body: null,
    setHeader(name, value) { this.headers[name.toLowerCase()] = value; },
    end(value) { this.body = JSON.parse(value); },
  };
}

function configure() {
  process.env.SUPABASE_URL = "https://supabase.test";
  process.env.SUPABASE_PUBLISHABLE_KEY = "public-test-key";
  process.env.AIBOT_WEBHOOK_SECRET = "bridge-secret";
  process.env.AIBOT_WEBHOOK_URL = "https://n8n.test/webhook/aibot";
  process.env.N8N_EMAIL_WEBHOOK_URL = "https://n8n.test/webhook/email";
  process.env.N8N_TELEGRAM_WEBHOOK_URL = "https://n8n.test/webhook/telegram";
}

function request(body = {}) {
  return { method: "POST", headers: { authorization: "Bearer staff-token" }, body };
}

try {
  configure();

  let calls = [];
  globalThis.fetch = async (url, init = {}) => {
    calls.push({ url: String(url), init });
    if (String(url).endsWith("/auth/v1/user")) return Response.json({ id: "staff-id", email: "staff@example.test" });
    if (String(url).endsWith("/rpc/is_offerpsp_staff")) return Response.json(true);
    if (String(url).endsWith("/rpc/get_offerpsp_integration_settings")) return Response.json([
      { key: "n8n", enabled: true, configuration: { operations_enabled: true } },
      { key: "email", enabled: true, configuration: {} },
      { key: "telegram", enabled: true, configuration: {} },
    ]);
    if (String(url).endsWith("/rpc/record_offerpsp_telegram_message")) return Response.json({ success: true });
    if (String(url).includes("/webhook/email")) return Response.json({ success: true });
    if (String(url).includes("/webhook/telegram")) return Response.json({ success: true, message_id: 42 });
    throw new Error(`Unexpected URL ${url}`);
  };

  const emailResponse = responseRecorder();
  await emailHandler(request({ to: "merchant@example.test", subject: "Subject", body: "Body" }), emailResponse);
  assert.equal(emailResponse.statusCode, 200);
  assert.equal(calls.find((call) => call.url.endsWith("/webhook/email")).init.headers["x-captain-secret"], "bridge-secret");

  calls = [];
  const telegramResponse = responseRecorder();
  await telegramHandler(request({ chat_id: "12345", message: "Hello" }), telegramResponse);
  assert.equal(telegramResponse.statusCode, 200);
  assert.equal(calls.find((call) => call.url.endsWith("/webhook/telegram")).init.headers["x-captain-secret"], "bridge-secret");

  calls = [];
  globalThis.fetch = async (url, init = {}) => {
    calls.push({ url: String(url), init });
    if (String(url).endsWith("/auth/v1/user")) return Response.json({ id: "staff-id" });
    if (String(url).endsWith("/rpc/is_offerpsp_staff")) return Response.json(true);
    if (String(url).endsWith("/rpc/record_offerpsp_integration_test")) return Response.json(true);
    if (String(url).includes("gateway-health")) return Response.json({ success: true, check: "authenticated_gateway" });
    throw new Error(`Unexpected URL ${url}`);
  };
  const healthResponse = responseRecorder();
  await healthHandler({ method: "GET", headers: { authorization: "Bearer staff-token" } }, healthResponse);
  assert.equal(healthResponse.statusCode, 200);
  assert.equal(healthResponse.body.checks.email.authenticated, true);
  assert.equal(healthResponse.body.checks.email.delivery_tested, false);
  assert.equal(calls.filter((call) => call.url.includes("gateway-health")).every((call) => call.init.method === "GET"), true);
  assert.equal(calls.filter((call) => call.url.includes("gateway-health")).every((call) => call.init.headers["x-captain-secret"] === "bridge-secret"), true);

  calls = [];
  const recordedHealthResponse = responseRecorder();
  await healthHandler(request({ integration: "email" }), recordedHealthResponse);
  assert.equal(recordedHealthResponse.statusCode, 200);
  assert.equal(recordedHealthResponse.body.recorded, true);
  const recordCall = calls.find((call) => call.url.endsWith("/rpc/record_offerpsp_integration_test"));
  assert.deepEqual(JSON.parse(recordCall.init.body), {
    p_integration_key: "email",
    p_success: true,
    p_error: null,
  });

  globalThis.fetch = async (url) => {
    if (String(url).endsWith("/auth/v1/user")) return Response.json({ id: "staff-id" });
    if (String(url).endsWith("/rpc/is_offerpsp_staff")) return Response.json(true);
    if (String(url).endsWith("/webhook/aibot")) return Response.json({ success: true });
    throw new Error(`Unexpected URL ${url}`);
  };
  const aibotResponse = responseRecorder();
  await aibotHandler(request({ message: "Do the task", session_id: "session_12345" }), aibotResponse);
  assert.equal(aibotResponse.statusCode, 502);
  assert.match(aibotResponse.body.error, /empty answer/i);

  console.log("Integration bridge contract tests passed");
} finally {
  globalThis.fetch = originalFetch;
  process.env = originalEnv;
}
