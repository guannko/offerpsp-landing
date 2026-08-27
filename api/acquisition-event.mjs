const EVENT_NAMES = new Set([
  "hero_cta_click",
  "process_click",
  "vertical_brief_click",
  "lead_form_open",
  "lead_form_start",
  "lead_consent_checked",
  "lead_submit_attempt",
  "lead_submit_success",
  "lead_submit_failure",
]);

const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const SAFE_PATH_PATTERN = /^\/[a-z0-9._/-]*$/i;
const SAFE_LABEL_PATTERN = /^[a-z0-9_/-]+$/i;
const windows = new Map();

const json = (response, status, body) => {
  response.statusCode = status;
  response.setHeader("Content-Type", "application/json; charset=utf-8");
  response.setHeader("Cache-Control", "no-store");
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
  return current.count > 40;
};

const validOrigin = (request) => {
  const origin = String(request.headers.origin || "");
  if (origin === "https://offerpsp.com") return true;
  if (process.env.VERCEL_ENV !== "production" && /^https?:\/\/(?:localhost|127\.0\.0\.1)(?::\d+)?$/.test(origin)) return true;
  return false;
};

export default async function handler(request, response) {
  if (request.method !== "POST") return json(response, 405, { success: false, error: "Method not allowed" });
  if (!validOrigin(request)) return json(response, 403, { success: false, error: "Origin not allowed" });
  if (isRateLimited(request)) return json(response, 429, { success: false, error: "Rate limit exceeded" });
  if (Number(request.headers["content-length"] || 0) > 4096) return json(response, 413, { success: false, error: "Payload too large" });

  let body;
  try {
    body = typeof request.body === "string" ? JSON.parse(request.body || "{}") : (request.body || {});
  } catch {
    return json(response, 400, { success: false, error: "Invalid JSON" });
  }

  const eventName = String(body.event_name || "").trim();
  const flowId = String(body.flow_id || "").trim();
  const pagePath = String(body.page_path || "").trim();
  const placement = String(body.placement || "").trim();
  if (!EVENT_NAMES.has(eventName)) return json(response, 400, { success: false, error: "Unsupported event" });
  if (!UUID_PATTERN.test(flowId)) return json(response, 400, { success: false, error: "Invalid flow_id" });
  if (!SAFE_PATH_PATTERN.test(pagePath) || pagePath.length > 160) return json(response, 400, { success: false, error: "Invalid page_path" });
  if (placement && (!SAFE_LABEL_PATTERN.test(placement) || placement.length > 80)) {
    return json(response, 400, { success: false, error: "Invalid placement" });
  }

  const supabaseUrl = String(process.env.SUPABASE_URL || "").replace(/\/$/, "");
  const publishableKey = String(process.env.SUPABASE_PUBLISHABLE_KEY || "");
  const ingestSecret = String(process.env.OFFERPSP_EVENT_INGEST_SECRET || "");
  if (!supabaseUrl || !publishableKey || !ingestSecret) {
    return json(response, 503, { success: false, error: "Event storage is not configured" });
  }

  const storageResponse = await fetch(`${supabaseUrl}/rest/v1/offerpsp_experience_events`, {
    method: "POST",
    headers: {
      apikey: publishableKey,
      Authorization: `Bearer ${publishableKey}`,
      "Content-Type": "application/json",
      "x-offerpsp-ingest-secret": ingestSecret,
      Prefer: "return=minimal",
    },
    body: JSON.stringify({
      event_name: eventName,
      flow_id: flowId,
      page_path: pagePath,
      placement: placement || null,
      is_qa: body.is_qa === true,
    }),
    signal: AbortSignal.timeout(4_000),
  });

  if (!storageResponse.ok) return json(response, 502, { success: false, error: "Event storage unavailable" });
  return json(response, 202, { success: true });
}
