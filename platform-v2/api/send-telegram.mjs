const json = (response, status, body) => {
  response.statusCode = status;
  response.setHeader("Content-Type", "application/json; charset=utf-8");
  response.setHeader("Cache-Control", "no-store");
  response.end(JSON.stringify(body));
};

async function rpc(url, key, authorization, name, body = {}) {
  const response = await fetch(`${url}/rest/v1/rpc/${name}`, {
    method: "POST",
    headers: { apikey: key, Authorization: authorization, "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
  const data = await response.json().catch(() => null);
  return { ok: response.ok, data };
}

export default async function handler(request, response) {
  if (request.method !== "POST") return json(response, 405, { success: false, error: "Method not allowed" });
  const supabaseUrl = process.env.SUPABASE_URL || process.env.VITE_SUPABASE_URL;
  const supabaseKey = process.env.SUPABASE_PUBLISHABLE_KEY || process.env.VITE_SUPABASE_PUBLISHABLE_KEY;
  const senderUrl = process.env.N8N_TELEGRAM_WEBHOOK_URL;
  const authorization = request.headers.authorization || "";
  if (!supabaseUrl || !supabaseKey || !senderUrl) return json(response, 503, { success: false, error: "Telegram bridge is not configured" });
  if (!authorization.startsWith("Bearer ")) return json(response, 401, { success: false, error: "Authentication required" });

  const userResponse = await fetch(`${supabaseUrl}/auth/v1/user`, { headers: { apikey: supabaseKey, Authorization: authorization } });
  if (!userResponse.ok) return json(response, 401, { success: false, error: "Invalid session" });
  const staff = await rpc(supabaseUrl, supabaseKey, authorization, "is_offerpsp_staff");
  if (!staff.ok || staff.data !== true) return json(response, 403, { success: false, error: "Active OfferPSP staff account required" });

  const requestBody = typeof request.body === "string" ? JSON.parse(request.body || "{}") : (request.body || {});
  const chatId = String(requestBody.chat_id || "").trim();
  const message = String(requestBody.message || "").trim();
  const leadId = requestBody.lead_id || null;
  if (!/^-?\d+$/.test(chatId) || !message) return json(response, 400, { success: false, error: "Valid Telegram chat ID and message are required" });
  if (message.length > 4096) return json(response, 400, { success: false, error: "Telegram message exceeds 4096 characters" });

  const settings = await rpc(supabaseUrl, supabaseKey, authorization, "get_offerpsp_integration_settings");
  const n8n = Array.isArray(settings.data) ? settings.data.find((item) => item.key === "n8n") : null;
  const telegram = Array.isArray(settings.data) ? settings.data.find((item) => item.key === "telegram") : null;
  if (!n8n?.enabled || n8n.configuration?.operations_enabled !== true) return json(response, 409, { success: false, error: "n8n operational automations are disabled in integration settings" });
  if (!telegram?.enabled) return json(response, 409, { success: false, error: "Telegram channel is disabled in integration settings" });

  let deliveryStatus = "failed";
  let deliveryError = null;
  let messageId = null;
  try {
    const delivery = await fetch(senderUrl, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ chat_id: chatId, text: message }),
    });
    const result = await delivery.json().catch(() => ({}));
    if (!delivery.ok || result.success === false || result.ok === false) throw new Error(result.error || result.message || "Telegram sender failed");
    deliveryStatus = "sent";
    messageId = result.message_id || result.result?.message_id || result.data?.message_id || null;
  } catch (error) {
    deliveryError = error instanceof Error ? error.message : "Telegram sender failed";
  }

  const history = await rpc(supabaseUrl, supabaseKey, authorization, "record_offerpsp_telegram_message", {
    p_chat_id: chatId,
    p_message_text: message,
    p_status: deliveryStatus,
    p_external_message_id: messageId ? String(messageId) : null,
    p_error_message: deliveryError,
    p_lead_id: leadId,
  });
  if (deliveryStatus === "failed") return json(response, 502, { success: false, error: deliveryError });
  return json(response, 200, {
    success: true,
    chat_id: chatId,
    message_id: messageId,
    recorded: history.ok,
    warning: history.ok ? null : "Message was delivered but could not be written to the outbound history",
  });
}
