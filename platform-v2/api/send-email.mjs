const json = (response, status, body) => {
  response.statusCode = status;
  response.setHeader("Content-Type", "application/json; charset=utf-8");
  response.end(JSON.stringify(body));
};

export default async function handler(request, response) {
  if (request.method !== "POST") return json(response, 405, { success: false, error: "Method not allowed" });
  const supabaseUrl = process.env.SUPABASE_URL || process.env.VITE_SUPABASE_URL;
  const supabaseKey = process.env.SUPABASE_PUBLISHABLE_KEY || process.env.VITE_SUPABASE_PUBLISHABLE_KEY;
  const senderUrl = process.env.N8N_EMAIL_WEBHOOK_URL;
  if (!supabaseUrl || !supabaseKey || !senderUrl) return json(response, 503, { success: false, error: "Email bridge is not configured" });
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
  const to = String(body.to || "").trim().toLowerCase();
  const subject = String(body.subject || "").trim();
  const emailBody = String(body.body || "").trim();
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(to) || !subject || !emailBody) return json(response, 400, { success: false, error: "Valid recipient, subject and body are required" });
  if (subject.length > 240 || emailBody.length > 50000) return json(response, 400, { success: false, error: "Email is too large" });

  const configuration = emailSettings.configuration || {};
  const delivery = await fetch(senderUrl, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ to, subject, body: emailBody, from_name: configuration.from_name || "OfferPSP", from_email: configuration.from_email || "bizdev@offerpsp.com", reply_to: configuration.reply_to || "bizdev@offerpsp.com", lead_id: body.lead_id || null }) });
  const result = await delivery.json().catch(() => ({}));
  if (!delivery.ok || result.success === false) return json(response, 502, { success: false, error: result.message || "Email sender failed" });
  return json(response, 200, { success: true, to });
}
