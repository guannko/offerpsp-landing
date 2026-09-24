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
  process.env.AIBOT_COMMAND_WEBHOOK_SECRET = "command-secret";
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
  let completionAttempts = 0;
  let senderShouldFail = false;
  globalThis.fetch = async (url, init = {}) => {
    calls.push({ url: String(url), init });
    if (String(url).endsWith("/auth/v1/user")) return Response.json({ id: "staff-id", email: "staff@example.test" });
    if (String(url).endsWith("/rpc/is_offerpsp_staff")) return Response.json(true);
    if (String(url).endsWith("/rpc/get_offerpsp_integration_settings")) return Response.json([
      { key: "n8n", enabled: true, configuration: { operations_enabled: true } },
      { key: "email", enabled: true, configuration: {} },
      { key: "telegram", enabled: true, configuration: {} },
    ]);
    if (String(url).endsWith("/rpc/begin_offerpsp_email_delivery")) return Response.json({
      success: true,
      send_allowed: true,
      state: "claimed",
      attempt_id: "11111111-1111-4111-8111-111111111111",
      to_email: "merchant@example.test",
      subject: "Canonical subject",
      body: "Canonical body",
      lead_internal_id: null,
    });
    if (String(url).endsWith("/rpc/complete_offerpsp_email_delivery")) {
      completionAttempts += 1;
      if (completionAttempts < 3) throw new Error("temporary journal outage");
      return Response.json({ success: true });
    }
    if (String(url).endsWith("/rpc/mark_offerpsp_email_delivery_uncertain")) return Response.json({ success: true, state: "uncertain" });
    if (String(url).endsWith("/rpc/record_offerpsp_telegram_message")) return Response.json({ success: true });
    if (String(url).includes("/webhook/email")) return senderShouldFail
      ? Response.json({ success: false, message: "SMTP outcome unavailable" }, { status: 502 })
      : Response.json({ success: true });
    if (String(url).includes("/webhook/telegram")) return Response.json({ success: true, message_id: 42 });
    throw new Error(`Unexpected URL ${url}`);
  };

  const emailResponse = responseRecorder();
  await emailHandler(request({ to: "merchant@example.test", subject: "Subject", body: "Body", draft_id: 17 }), emailResponse);
  assert.equal(emailResponse.statusCode, 207);
  assert.equal(emailResponse.body.success, true);
  assert.equal(emailResponse.body.journal_recorded, true);
  assert.match(emailResponse.body.warning, /IMAP Sent copy/i);
  assert.equal(completionAttempts, 3);
  assert.equal(calls.find((call) => call.url.endsWith("/webhook/email")).init.headers["x-captain-secret"], "bridge-secret");
  assert.deepEqual(JSON.parse(calls.find((call) => call.url.endsWith("/webhook/email")).init.body), {
    to: "merchant@example.test",
    subject: "Canonical subject",
    body: "Canonical body",
    from_name: "OfferPSP",
    from_email: "bizdev@offerpsp.com",
    reply_to: "bizdev@offerpsp.com",
    lead_id: null,
    draft_id: 17,
    delivery_attempt_id: "11111111-1111-4111-8111-111111111111",
  });
  assert.deepEqual(JSON.parse(calls.find((call) => call.url.endsWith("/rpc/complete_offerpsp_email_delivery")).init.body), {
    p_draft_id: 17,
    p_attempt_id: "11111111-1111-4111-8111-111111111111",
    p_external_message_id: null,
    p_provider: "smtp",
    p_archive_status: "failed",
    p_archive_error: "SMTP response did not include Message-ID",
  });

  calls = [];
  senderShouldFail = true;
  const uncertainEmailResponse = responseRecorder();
  await emailHandler(request({ to: "ignored@example.test", subject: "Ignored", body: "Ignored", draft_id: 18 }), uncertainEmailResponse);
  assert.equal(uncertainEmailResponse.statusCode, 502);
  assert.equal(uncertainEmailResponse.body.delivery_uncertain, true);
  assert.match(uncertainEmailResponse.body.error, /not retried automatically/i);
  assert.equal(calls.filter((call) => call.url.endsWith("/rpc/mark_offerpsp_email_delivery_uncertain")).length, 1);
  assert.equal(calls.filter((call) => call.url.endsWith("/rpc/complete_offerpsp_email_delivery")).length, 0);
  senderShouldFail = false;

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

  calls = [];
  globalThis.fetch = async (url, init = {}) => {
    calls.push({ url: String(url), init });
    if (String(url).endsWith("/auth/v1/user")) return Response.json({ id: "staff-id" });
    if (String(url).endsWith("/rpc/is_offerpsp_staff")) return Response.json(true);
    if (String(url).endsWith("/webhook/aibot")) return Response.json({ success: true });
    throw new Error(`Unexpected URL ${url}`);
  };
  const aibotResponse = responseRecorder();
  await aibotHandler(request({ message: "Do the task", session_id: "session_12345" }), aibotResponse);
  assert.equal(aibotResponse.statusCode, 502);
  assert.match(aibotResponse.body.error, /empty answer/i);
  assert.equal(calls.find((call) => call.url.endsWith("/webhook/aibot")).init.headers["x-captain-secret"], "command-secret");

  console.log("Integration bridge contract tests passed");
} finally {
  globalThis.fetch = originalFetch;
  process.env = originalEnv;
}
