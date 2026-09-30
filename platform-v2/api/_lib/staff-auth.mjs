const jsonHeaders = {
  "content-type": "application/json; charset=utf-8",
  "cache-control": "no-store",
};

export class HttpError extends Error {
  constructor(status, message, details) {
    super(message);
    this.name = "HttpError";
    this.status = status;
    this.details = details;
  }
}

export function sendJson(response, status, body) {
  Object.entries(jsonHeaders).forEach(([name, value]) => response.setHeader(name, value));
  return response.status(status).json(body);
}

export function sendError(response, error) {
  if (error instanceof HttpError) {
    return sendJson(response, error.status, {
      error: error.message,
      ...(error.details ? { details: error.details } : {}),
    });
  }

  console.error("Unhandled API error", error);
  return sendJson(response, 500, { error: "Internal server error" });
}

function firstEnv(...names) {
  return String(names.map((name) => process.env[name]).find(Boolean) || "").trim();
}

function requiredEnv(label, ...names) {
  const value = firstEnv(...names);
  if (!value) throw new HttpError(503, `Missing server configuration: ${label}`);
  return value.replace(/\/$/, "");
}

function bearerToken(request) {
  const value = String(request.headers.authorization || "");
  if (!value.toLowerCase().startsWith("bearer ")) {
    throw new HttpError(401, "Missing access token");
  }
  return value.slice(7).trim();
}

async function supabaseJson(url, token, init = {}, apiKeyOverride = "") {
  const publishableKey = apiKeyOverride || firstEnv(
    "SUPABASE_PUBLISHABLE_KEY",
    "SUPABASE_ANON_KEY",
    "VITE_SUPABASE_PUBLISHABLE_KEY",
  );
  const response = await fetch(url, {
    ...init,
    headers: {
      apikey: publishableKey,
      authorization: `Bearer ${token}`,
      "content-type": "application/json",
      ...(init.headers || {}),
    },
  });

  const text = await response.text();
  let data = null;
  try {
    data = text ? JSON.parse(text) : null;
  } catch {
    data = text || null;
  }
  if (!response.ok) {
    throw new HttpError(
      response.status,
      (typeof data === "object" && (data?.message || data?.error)) || "Supabase request failed",
    );
  }
  return data;
}

export async function requireOfferPspStaff(request) {
  const supabaseUrl = requiredEnv("SUPABASE_URL", "SUPABASE_URL", "VITE_SUPABASE_URL");
  requiredEnv(
    "SUPABASE_PUBLISHABLE_KEY",
    "SUPABASE_PUBLISHABLE_KEY",
    "SUPABASE_ANON_KEY",
    "VITE_SUPABASE_PUBLISHABLE_KEY",
  );
  const token = bearerToken(request);

  const user = await supabaseJson(`${supabaseUrl}/auth/v1/user`, token, { method: "GET" });
  const isStaff = await supabaseJson(`${supabaseUrl}/rest/v1/rpc/is_offerpsp_staff`, token, {
    method: "POST",
    body: "{}",
  });

  if (isStaff !== true) throw new HttpError(403, "Staff access required");
  return { supabaseUrl, token, user };
}

export async function requireOfferPspProvider(request, providerId, roles = null) {
  const supabaseUrl = requiredEnv("SUPABASE_URL", "SUPABASE_URL", "VITE_SUPABASE_URL");
  requiredEnv(
    "SUPABASE_PUBLISHABLE_KEY",
    "SUPABASE_PUBLISHABLE_KEY",
    "SUPABASE_ANON_KEY",
    "VITE_SUPABASE_PUBLISHABLE_KEY",
  );
  const token = bearerToken(request);
  const user = await supabaseJson(`${supabaseUrl}/auth/v1/user`, token, { method: "GET" });
  const allowed = await supabaseJson(
    `${supabaseUrl}/rest/v1/rpc/can_access_offerpsp_provider_workspace`,
    token,
    {
      method: "POST",
      body: JSON.stringify({ p_provider_id: providerId, p_roles: roles }),
    },
  );
  if (allowed !== true) throw new HttpError(403, "PSP workspace access required");
  return { supabaseUrl, token, user };
}

export async function providerSupabaseFetch(context, path, init = {}) {
  const publishableKey = requiredEnv(
    "SUPABASE_PUBLISHABLE_KEY",
    "SUPABASE_PUBLISHABLE_KEY",
    "SUPABASE_ANON_KEY",
    "VITE_SUPABASE_PUBLISHABLE_KEY",
  );
  const response = await fetch(`${context.supabaseUrl}/${path.replace(/^\//, "")}`, {
    ...init,
    headers: {
      apikey: publishableKey,
      authorization: `Bearer ${context.token}`,
      ...(init.headers || {}),
    },
  });
  if (!response.ok) throw new HttpError(response.status, "Private source download failed");
  return response;
}

export async function staffSupabaseRequest(context, path, init = {}) {
  return supabaseJson(`${context.supabaseUrl}/rest/v1/${path.replace(/^\//, "")}`, context.token, init);
}

export async function serviceSupabaseRequest(path, init = {}) {
  const supabaseUrl = requiredEnv("SUPABASE_URL", "SUPABASE_URL", "VITE_SUPABASE_URL");
  const serviceRoleKey = requiredEnv("SUPABASE_SERVICE_ROLE_KEY", "SUPABASE_SERVICE_ROLE_KEY");
  return supabaseJson(
    `${supabaseUrl}/rest/v1/${path.replace(/^\//, "")}`,
    serviceRoleKey,
    init,
    serviceRoleKey,
  );
}
