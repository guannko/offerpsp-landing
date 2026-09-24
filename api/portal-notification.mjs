const json = (response, status, body) => {
  response.statusCode = status;
  response.setHeader("Content-Type", "application/json; charset=utf-8");
  response.setHeader("Cache-Control", "no-store");
  response.end(JSON.stringify(body));
};

export default async function handler(request, response) {
  if (request.method !== "POST") return json(response, 405, { success: false, error: "Method not allowed" });
  const supabaseUrl = String(process.env.SUPABASE_URL || "").replace(/\/$/, "");
  const supabaseKey = process.env.SUPABASE_PUBLISHABLE_KEY;
  const webhookUrl = process.env.PORTAL_NOTIFICATION_WEBHOOK_URL;
  const webhookSecret = process.env.AIBOT_WEBHOOK_SECRET;
  const authorization = String(request.headers.authorization || "");
  if (!supabaseUrl || !supabaseKey || !webhookUrl || !webhookSecret) return json(response, 503, { success: false, error: "Portal notification bridge is not configured" });
  if (!authorization.startsWith("Bearer ")) return json(response, 401, { success: false, error: "Authentication required" });

  let body = {};
  try {
    body = typeof request.body === "string" ? JSON.parse(request.body || "{}") : (request.body || {});
  } catch {
    return json(response, 400, { success: false, error: "Invalid JSON" });
  }
  const messageId = String(body.portal_message_id || "").trim();
  if (!/^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(messageId)) {
    return json(response, 400, { success: false, error: "Valid portal_message_id is required" });
  }

  const commonHeaders = { apikey: supabaseKey, Authorization: authorization };
  const userResponse = await fetch(`${supabaseUrl}/auth/v1/user`, { headers: commonHeaders });
  if (!userResponse.ok) return json(response, 401, { success: false, error: "Invalid session" });

  const visibleMessage = await fetch(
    `${supabaseUrl}/rest/v1/offerpsp_messages?select=id&id=eq.${encodeURIComponent(messageId)}&sender_type=eq.client&direction=eq.inbound&limit=1`,
    { headers: commonHeaders },
  );
  const rows = visibleMessage.ok ? await visibleMessage.json().catch(() => []) : [];
  if (!visibleMessage.ok || !Array.isArray(rows) || rows.length !== 1) {
    return json(response, 404, { success: false, error: "Portal message is not accessible" });
  }

  const notification = await fetch(webhookUrl, {
    method: "POST",
    headers: { "Content-Type": "application/json", "x-captain-secret": webhookSecret },
    body: JSON.stringify({ portal_message_id: messageId }),
    signal: AbortSignal.timeout(12_000),
  });
  if (!notification.ok) return json(response, 502, { success: false, error: `Notification gateway returned HTTP ${notification.status}` });
  return json(response, 202, { success: true, portal_message_id: messageId });
}
