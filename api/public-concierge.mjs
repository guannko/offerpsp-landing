const windows = new Map();

const json = (response, status, body) => {
  response.statusCode = status;
  response.setHeader("Content-Type", "application/json; charset=utf-8");
  response.setHeader("Cache-Control", "no-store");
  response.setHeader("X-Content-Type-Options", "nosniff");
  response.end(JSON.stringify(body));
};

const clientAddress = (request) => String(request.headers["x-forwarded-for"] || request.socket?.remoteAddress || "unknown")
  .split(",")[0]
  .trim();

const isRateLimited = (request) => {
  const now = Date.now();
  const key = clientAddress(request);
  const current = windows.get(key);
  if (!current || now - current.startedAt >= 60_000) {
    windows.set(key, { startedAt: now, count: 1 });
    return false;
  }
  current.count += 1;
  return current.count > 12;
};

const validOrigin = (request) => {
  const origin = String(request.headers.origin || "");
  if (origin === "https://offerpsp.com") return true;
  return process.env.VERCEL_ENV !== "production"
    && /^https?:\/\/(?:localhost|127\.0\.0\.1)(?::\d+)?$/.test(origin);
};

const clean = (value, max) => String(value || "")
  .replace(/[\u0000-\u001f\u007f]/g, " ")
  .trim()
  .slice(0, max);

const resolveWebhookUrl = () => {
  const explicit = clean(process.env.PUBLIC_CONCIERGE_WEBHOOK_URL, 1000);
  if (explicit) return explicit;
  const sibling = clean(process.env.PORTAL_NOTIFICATION_WEBHOOK_URL || process.env.AIBOT_WEBHOOK_URL, 1000);
  if (!sibling) return "";
  try {
    const url = new URL(sibling);
    const parts = url.pathname.split("/").filter(Boolean);
    if (!parts.length) return "";
    parts[parts.length - 1] = "offerpsp-public-concierge-v1";
    url.pathname = `/${parts.join("/")}`;
    url.search = "";
    url.hash = "";
    return url.toString();
  } catch {
    return "";
  }
};

export default async function handler(request, response) {
  if (request.method !== "POST") return json(response, 405, { success: false, error: "Method not allowed" });
  if (!validOrigin(request)) return json(response, 403, { success: false, error: "Origin not allowed" });
  if (isRateLimited(request)) return json(response, 429, { success: false, error: "Please wait before sending another message" });
  if (Number(request.headers["content-length"] || 0) > 12_000) return json(response, 413, { success: false, error: "Payload too large" });

  let body;
  try {
    body = typeof request.body === "string" ? JSON.parse(request.body || "{}") : (request.body || {});
  } catch {
    return json(response, 400, { success: false, error: "Invalid JSON" });
  }

  const message = clean(body.message, 1200);
  const page = clean(body.page, 300);
  if (message.length < 2) return json(response, 400, { success: false, error: "Message is required" });

  const history = (Array.isArray(body.history) ? body.history : [])
    .slice(-6)
    .map((entry) => ({
      role: entry?.role === "assistant" ? "assistant" : "user",
      content: clean(entry?.content, 1000),
    }))
    .filter((entry) => entry.content);

  const webhookUrl = resolveWebhookUrl();
  const webhookSecret = clean(process.env.OFFERPSP_CONCIERGE_WEBHOOK_SECRET, 1000);
  if (!webhookUrl || !webhookSecret) {
    return json(response, 503, { success: false, error: "Concierge is temporarily unavailable" });
  }

  try {
    const upstream = await fetch(webhookUrl, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "x-offerpsp-concierge-secret": webhookSecret,
      },
      body: JSON.stringify({ message, history, page }),
      signal: AbortSignal.timeout(35_000),
    });
    const result = await upstream.json().catch(() => null);
    const answer = clean(result?.answer, 2400);
    if (!upstream.ok || result?.success !== true || !answer) {
      return json(response, 502, { success: false, error: "Concierge response was not confirmed" });
    }
    return json(response, 200, {
      success: true,
      answer,
      actions: [
        { id: "request_match", label: "Request a private match", href: "/#request" },
        { id: "contact_team", label: "Contact OfferPSP", href: "#contact" },
      ],
    });
  } catch {
    return json(response, 504, { success: false, error: "Concierge did not respond in time" });
  }
}

export const publicConciergeInternals = { resolveWebhookUrl };
