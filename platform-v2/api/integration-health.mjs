const json = (response, status, body) => {
  response.statusCode = status;
  response.setHeader("Content-Type", "application/json; charset=utf-8");
  response.setHeader("Cache-Control", "no-store");
  response.end(JSON.stringify(body));
};

export default async function handler(request, response) {
  if (!["GET", "POST"].includes(request.method)) return json(response, 405, { success: false, error: "Method not allowed" });
  const supabaseUrl = process.env.SUPABASE_URL || process.env.VITE_SUPABASE_URL;
  const supabaseKey = process.env.SUPABASE_PUBLISHABLE_KEY || process.env.VITE_SUPABASE_PUBLISHABLE_KEY;
  const authorization = request.headers.authorization || "";
  if (!supabaseUrl || !supabaseKey) return json(response, 503, { success: false, error: "Supabase is not configured" });
  if (!authorization.startsWith("Bearer ")) return json(response, 401, { success: false, error: "Authentication required" });

  const userResponse = await fetch(`${supabaseUrl}/auth/v1/user`, { headers: { apikey: supabaseKey, Authorization: authorization } });
  if (!userResponse.ok) return json(response, 401, { success: false, error: "Invalid session" });
  const staffResponse = await fetch(`${supabaseUrl}/rest/v1/rpc/is_offerpsp_staff`, { method: "POST", headers: { apikey: supabaseKey, Authorization: authorization, "Content-Type": "application/json" }, body: "{}" });
  const isStaff = staffResponse.ok ? await staffResponse.json() : false;
  if (isStaff !== true) return json(response, 403, { success: false, error: "Active OfferPSP staff account required" });

  const checks = {
    supabase: true,
    n8n_email_webhook: Boolean(process.env.N8N_EMAIL_WEBHOOK_URL),
    n8n_telegram_webhook: Boolean(process.env.N8N_TELEGRAM_WEBHOOK_URL),
  };

  if (request.method === "POST") {
    const body = typeof request.body === "string" ? JSON.parse(request.body || "{}") : (request.body || {});
    const integration = String(body.integration || "");
    const success = integration === "supabase"
      || (integration === "email" && checks.n8n_email_webhook)
      || (integration === "telegram" && checks.n8n_telegram_webhook)
      || (integration === "n8n" && checks.n8n_email_webhook && checks.n8n_telegram_webhook);
    if (!["supabase", "n8n", "email", "telegram"].includes(integration)) return json(response, 400, { success: false, error: "Unknown integration" });
    await fetch(`${supabaseUrl}/rest/v1/rpc/record_offerpsp_integration_test`, {
      method: "POST",
      headers: { apikey: supabaseKey, Authorization: authorization, "Content-Type": "application/json" },
      body: JSON.stringify({ p_integration_key: integration, p_success: success, p_error: success ? null : "Server-side connector is not configured" }),
    });
    if (!success) return json(response, 503, { success: false, error: "Server-side connector is not configured" });
  }

  return json(response, 200, {
    success: true,
    checks,
    checked_at: new Date().toISOString(),
  });
}
