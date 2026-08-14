const json = (response, status, body) => {
  response.statusCode = status;
  response.setHeader("Content-Type", "application/json; charset=utf-8");
  response.setHeader("Cache-Control", "no-store");
  response.end(JSON.stringify(body));
};

function healthUrl(senderUrl, explicitUrl, path) {
  if (explicitUrl) return String(explicitUrl).trim();
  if (!senderUrl) return "";
  try {
    const url = new URL(senderUrl);
    url.pathname = url.pathname.includes("/webhook/")
      ? url.pathname.replace(/\/webhook\/.+$/, `/webhook/${path}`)
      : `/webhook/${path}`;
    url.search = "";
    return url.toString();
  } catch {
    return "";
  }
}

async function probeGateway(url, secret, channel) {
  const configured = Boolean(url && secret);
  if (!configured) return { configured: false, reachable: false, authenticated: false, delivery_tested: false, detail: `${channel}: server connector is not configured` };
  try {
    const probe = await fetch(url, {
      method: "GET",
      headers: { "x-captain-secret": secret },
      signal: AbortSignal.timeout(6_000),
    });
    const result = await probe.json().catch(() => null);
    const healthy = probe.ok && result?.success === true && result?.check === "authenticated_gateway";
    return {
      configured: true,
      reachable: healthy,
      authenticated: healthy,
      delivery_tested: false,
      detail: healthy ? `${channel}: authenticated gateway responded` : `${channel}: gateway returned HTTP ${probe.status}`,
    };
  } catch (error) {
    return {
      configured: true,
      reachable: false,
      authenticated: false,
      delivery_tested: false,
      detail: `${channel}: ${error instanceof Error ? error.message : "gateway unavailable"}`,
    };
  }
}

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

  const webhookSecret = String(process.env.AIBOT_WEBHOOK_SECRET || "").trim();
  const emailUrl = healthUrl(process.env.N8N_EMAIL_WEBHOOK_URL, process.env.N8N_EMAIL_HEALTH_URL, "offerpsp-email-gateway-health");
  const telegramUrl = healthUrl(process.env.N8N_TELEGRAM_WEBHOOK_URL, process.env.N8N_TELEGRAM_HEALTH_URL, "offerpsp-telegram-gateway-health");
  const [email, telegram] = await Promise.all([
    probeGateway(emailUrl, webhookSecret, "Email"),
    probeGateway(telegramUrl, webhookSecret, "Telegram"),
  ]);
  const checks = {
    supabase: { configured: true, reachable: true, authenticated: true, delivery_tested: true, detail: "Supabase staff session verified" },
    email,
    telegram,
    n8n: {
      configured: email.configured && telegram.configured,
      reachable: email.reachable && telegram.reachable,
      authenticated: email.authenticated && telegram.authenticated,
      delivery_tested: false,
      detail: email.reachable && telegram.reachable ? "Both authenticated n8n gateways responded" : "One or more n8n gateways failed",
    },
  };

  if (request.method === "POST") {
    let body = {};
    try {
      body = typeof request.body === "string" ? JSON.parse(request.body || "{}") : (request.body || {});
    } catch {
      return json(response, 400, { success: false, error: "Invalid JSON" });
    }
    const integration = String(body.integration || "");
    if (!Object.hasOwn(checks, integration)) return json(response, 400, { success: false, error: "Unknown integration" });
    const check = checks[integration];
    if (!check.reachable || !check.authenticated) return json(response, 503, { success: false, error: check.detail, check });
    return json(response, 200, { success: true, check, checked_at: new Date().toISOString() });
  }

  return json(response, 200, { success: true, checks, checked_at: new Date().toISOString() });
}
