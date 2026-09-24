import { deliverClaimedEmail } from "./_lib/email-delivery.mjs";

const json = (response, status, body) => {
  response.statusCode = status;
  response.setHeader("Content-Type", "application/json; charset=utf-8");
  response.end(JSON.stringify(body));
};

const rpc = async ({ supabaseUrl, supabaseKey, authorization, name, body }) => {
  const response = await fetch(`${supabaseUrl}/rest/v1/rpc/${name}`, {
    method: "POST",
    headers: { apikey: supabaseKey, Authorization: authorization, "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
  const result = await response.json().catch(() => ({}));
  return { ok: response.ok, status: response.status, result };
};

export default async function handler(request, response) {
  if (request.method !== "POST") return json(response, 405, { success: false, error: "Method not allowed" });
  const supabaseUrl = process.env.SUPABASE_URL || process.env.VITE_SUPABASE_URL;
  const supabaseKey = process.env.SUPABASE_PUBLISHABLE_KEY || process.env.VITE_SUPABASE_PUBLISHABLE_KEY;
  const senderUrl = process.env.N8N_EMAIL_WEBHOOK_URL;
  const webhookSecret = process.env.AIBOT_WEBHOOK_SECRET;
  if (!supabaseUrl || !supabaseKey || !senderUrl || !webhookSecret) return json(response, 503, { success: false, error: "Email bridge is not configured" });
  const authorization = request.headers.authorization || "";
  if (!authorization.startsWith("Bearer ")) return json(response, 401, { success: false, error: "Authentication required" });

  const userResponse = await fetch(`${supabaseUrl}/auth/v1/user`, { headers: { apikey: supabaseKey, Authorization: authorization } });
  if (!userResponse.ok) return json(response, 401, { success: false, error: "Invalid session" });
  const user = await userResponse.json();
  const staffResponse = await fetch(`${supabaseUrl}/rest/v1/rpc/is_offerpsp_staff`, { method: "POST", headers: { apikey: supabaseKey, Authorization: authorization, "Content-Type": "application/json" }, body: "{}" });
  const isStaff = staffResponse.ok ? await staffResponse.json() : false;
  if (isStaff !== true) return json(response, 403, { success: false, error: "Active OfferPSP staff account required" });

  const settingsResponse = await fetch(`${supabaseUrl}/rest/v1/rpc/get_offerpsp_integration_settings`, { method: "POST", headers: { apikey: supabaseKey, Authorization: authorization, "Content-Type": "application/json" }, body: "{}" });
  const settings = settingsResponse.ok ? await settingsResponse.json() : [];
  const n8nSettings = Array.isArray(settings) ? settings.find((item) => item.key === "n8n") : null;
  const emailSettings = Array.isArray(settings) ? settings.find((item) => item.key === "email") : null;
  if (!n8nSettings?.enabled || n8nSettings.configuration?.operations_enabled !== true) return json(response, 409, { success: false, error: "n8n operational automations are disabled in integration settings" });
  if (!emailSettings?.enabled) return json(response, 409, { success: false, error: "Email channel is disabled in integration settings" });

  const body = typeof request.body === "string" ? JSON.parse(request.body || "{}") : (request.body || {});
  const draftId = Number(body.draft_id);
  if (!Number.isSafeInteger(draftId) || draftId <= 0) return json(response, 400, { success: false, error: "Valid draft ID is required" });

  const claim = await rpc({
    supabaseUrl,
    supabaseKey,
    authorization,
    name: "begin_offerpsp_email_delivery",
    body: { p_draft_id: draftId },
  });
  if (!claim.ok || claim.result?.success === false) {
    return json(response, claim.status >= 400 ? claim.status : 409, { success: false, error: claim.result?.message || claim.result?.error || "Email delivery claim failed" });
  }
  if (claim.result?.already_sent === true) {
    return json(response, 200, {
      success: true,
      already_sent: true,
      to: null,
      message_id: claim.result.external_message_id || null,
      warning: null,
    });
  }
  if (claim.result?.send_allowed !== true) {
    return json(response, 409, {
      success: false,
      delivery_uncertain: true,
      error: "This email delivery is already in progress or requires reconciliation. It was not sent again.",
      state: claim.result?.state || "claimed",
    });
  }

  const configuration = emailSettings.configuration || {};
  const delivered = await deliverClaimedEmail({
    claim: claim.result,
    draftId,
    configuration,
    callRpc: async (name, body) => {
      const result = await rpc({ supabaseUrl, supabaseKey, authorization, name, body });
      if (!result.ok) throw new Error(result.result?.message || result.result?.error || `Delivery journal returned HTTP ${result.status}`);
      return result.result;
    },
    completeRpc: "complete_offerpsp_email_delivery",
    uncertainRpc: "mark_offerpsp_email_delivery_uncertain",
  });
  return json(response, delivered.status, delivered.body);
}
