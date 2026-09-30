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

function safeContext(value) {
  const source = value && typeof value === "object" ? value : {};
  const output = {};
  for (const key of ["path", "page", "entity_type", "entity_id", "entity_name"]) {
    if (source[key] == null) continue;
    output[key] = String(source[key]).slice(0, key === "path" ? 500 : 200);
  }
  return output;
}

export const config = { maxDuration: 120 };

export default async function handler(request, response) {
  if (request.method !== "POST") return json(response, 405, { success: false, error: "Method not allowed" });
  const supabaseUrl = process.env.SUPABASE_URL || process.env.VITE_SUPABASE_URL;
  const supabaseKey = process.env.SUPABASE_PUBLISHABLE_KEY || process.env.VITE_SUPABASE_PUBLISHABLE_KEY;
  const webhookUrl = process.env.AIBOT_WEBHOOK_URL;
  // Keep the interactive AIBot credential isolated from the email/Telegram
  // gateways. The fallback preserves existing deployments during rotation.
  const webhookSecret = process.env.AIBOT_COMMAND_WEBHOOK_SECRET || process.env.AIBOT_WEBHOOK_SECRET;
  const authorization = request.headers.authorization || "";
  if (!supabaseUrl || !supabaseKey || !webhookUrl || !webhookSecret) return json(response, 503, { success: false, error: "AIBot bridge is not configured" });
  if (!authorization.startsWith("Bearer ")) return json(response, 401, { success: false, error: "Authentication required" });

  const userResponse = await fetch(`${supabaseUrl}/auth/v1/user`, { headers: { apikey: supabaseKey, Authorization: authorization } });
  if (!userResponse.ok) return json(response, 401, { success: false, error: "Invalid session" });
  const user = await userResponse.json().catch(() => null);
  const staff = await rpc(supabaseUrl, supabaseKey, authorization, "is_offerpsp_staff");
  if (!staff.ok || staff.data !== true) return json(response, 403, { success: false, error: "Active OfferPSP staff account required" });

  let body = {};
  try {
    body = typeof request.body === "string" ? JSON.parse(request.body || "{}") : (request.body || {});
  } catch {
    return json(response, 400, { success: false, error: "Invalid JSON" });
  }
  const message = String(body.message || "").trim();
  const sessionId = String(body.session_id || "").trim();
  if (!message || message.length > 6000) return json(response, 400, { success: false, error: "Message must contain 1–6000 characters" });
  if (!/^[a-zA-Z0-9:_-]{8,180}$/.test(sessionId)) return json(response, 400, { success: false, error: "Invalid AIBot session" });

  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 110_000);
  try {
    const agentResponse = await fetch(webhookUrl, {
      method: "POST",
      headers: { "Content-Type": "application/json", "x-captain-secret": webhookSecret },
      body: JSON.stringify({
        message,
        session_id: sessionId,
        context: safeContext(body.context),
        user: { id: user?.id || null, email: user?.email || null },
      }),
      signal: controller.signal,
    });
    const result = await agentResponse.json().catch(() => null);
    if (!agentResponse.ok || result?.success === false) return json(response, 502, { success: false, error: result?.error || "AIBot workflow failed" });
    const payload = Array.isArray(result) ? result[0] : result;
    const answer = String(payload?.answer || payload?.message || payload?.output || "").trim();
    if (!answer) return json(response, 502, { success: false, error: "AIBot returned an empty answer" });
    return json(response, 200, {
      success: true,
      answer,
      confirmation_required: payload?.confirmation_required === true,
      confirmation_token: payload?.confirmation_token || null,
    });
  } catch (error) {
    const timeoutError = error instanceof Error && error.name === "AbortError";
    return json(response, 504, { success: false, error: timeoutError ? "AIBot превысил время ожидания" : "AIBot недоступен" });
  } finally {
    clearTimeout(timeout);
  }
}
