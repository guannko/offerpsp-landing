import {
  createCipheriv,
  createDecipheriv,
  createHash,
  randomBytes,
  randomUUID,
  timingSafeEqual,
} from "node:crypto";
import {
  HttpError,
  requireOfferPspStaff,
  sendJson,
  serviceSupabaseRequest,
} from "./staff-auth.mjs";

const fallbackOrigin = "https://ops-7q4m2x9k8v3n.vercel.app";
const allowedScopes = new Set(["offerpsp:read", "offerpsp:write", "offline_access"]);
const defaultScope = "offerpsp:read offerpsp:write offline_access";

function envValue(...names) {
  return String(names.map((name) => process.env[name]).find(Boolean) || "").trim();
}

function requiredEnv(label, ...names) {
  const value = envValue(...names);
  if (!value) throw new HttpError(503, `Missing server configuration: ${label}`);
  return value;
}

function cleanOrigin(value = envValue("OFFERPSP_MCP_ORIGIN") || fallbackOrigin) {
  try {
    const url = new URL(value);
    if (url.protocol !== "https:" && url.hostname !== "127.0.0.1") throw new Error("Invalid protocol");
    return `${url.protocol}//${url.host}`;
  } catch {
    return fallbackOrigin;
  }
}

export function offerPspOAuthOrigin() {
  return cleanOrigin();
}

export function offerPspMcpResource() {
  return `${offerPspOAuthOrigin()}/mcp`;
}

export function authorizationServerMetadata() {
  const origin = offerPspOAuthOrigin();
  return {
    issuer: origin,
    authorization_endpoint: `${origin}/oauth/authorize`,
    token_endpoint: `${origin}/oauth/token`,
    registration_endpoint: `${origin}/oauth/register`,
    response_types_supported: ["code"],
    grant_types_supported: ["authorization_code", "refresh_token"],
    code_challenge_methods_supported: ["S256"],
    token_endpoint_auth_methods_supported: ["none"],
    scopes_supported: [...allowedScopes],
    resource_indicators_supported: true,
  };
}

function encryptionKey() {
  const raw = requiredEnv("OFFERPSP_OAUTH_ENCRYPTION_KEY", "OFFERPSP_OAUTH_ENCRYPTION_KEY");
  const key = /^[0-9a-f]{64}$/i.test(raw) ? Buffer.from(raw, "hex") : Buffer.from(raw, "base64");
  if (key.length !== 32) throw new HttpError(503, "OFFERPSP_OAUTH_ENCRYPTION_KEY must contain 32 bytes");
  return key;
}

function encryptPayload(value) {
  const iv = randomBytes(12);
  const cipher = createCipheriv("aes-256-gcm", encryptionKey(), iv);
  const ciphertext = Buffer.concat([cipher.update(JSON.stringify(value), "utf8"), cipher.final()]);
  return ["v1", iv.toString("base64url"), cipher.getAuthTag().toString("base64url"), ciphertext.toString("base64url")].join(".");
}

function decryptPayload(value) {
  try {
    const [version, ivValue, tagValue, ciphertextValue] = String(value || "").split(".");
    if (version !== "v1" || !ivValue || !tagValue || !ciphertextValue) throw new Error("Invalid encrypted payload");
    const decipher = createDecipheriv("aes-256-gcm", encryptionKey(), Buffer.from(ivValue, "base64url"));
    decipher.setAuthTag(Buffer.from(tagValue, "base64url"));
    const plaintext = Buffer.concat([
      decipher.update(Buffer.from(ciphertextValue, "base64url")),
      decipher.final(),
    ]);
    return JSON.parse(plaintext.toString("utf8"));
  } catch {
    throw new HttpError(401, "OAuth session material is invalid");
  }
}

function sha256(value) {
  return createHash("sha256").update(String(value)).digest("hex");
}

function opaqueToken(prefix) {
  return `${prefix}${randomBytes(32).toString("base64url")}`;
}

function asArray(value) {
  return Array.isArray(value) ? value : value == null ? [] : [value];
}

function single(value) {
  return String(asArray(value)[0] || "").trim();
}

function parseScopes(value) {
  const requested = String(value || defaultScope).trim().split(/\s+/).filter(Boolean);
  const unique = [...new Set(requested)];
  if (!unique.includes("offerpsp:read")) throw new HttpError(400, "scope must include offerpsp:read");
  if (unique.some((scope) => !allowedScopes.has(scope))) throw new HttpError(400, "Unsupported OAuth scope");
  return unique.join(" ");
}

function validRedirectUri(value) {
  try {
    const url = new URL(value);
    if (url.username || url.password || url.hash) return false;
    if (url.protocol === "https:") return true;
    return url.protocol === "http:" && (url.hostname === "127.0.0.1" || url.hostname === "[::1]");
  } catch {
    return false;
  }
}

function constantTimeEqual(left, right) {
  const a = Buffer.from(String(left));
  const b = Buffer.from(String(right));
  return a.length === b.length && timingSafeEqual(a, b);
}

function jsonCors(response) {
  response.setHeader("Access-Control-Allow-Origin", "*");
  response.setHeader("Access-Control-Allow-Headers", "Content-Type");
  response.setHeader("Access-Control-Allow-Methods", "POST, OPTIONS");
}

function oauthError(response, status, error, description) {
  jsonCors(response);
  response.setHeader("Cache-Control", "no-store");
  return response.status(status).json({ error, error_description: description });
}

function rows(value) {
  return Array.isArray(value) ? value : [];
}

async function findClient(clientId) {
  const result = await serviceSupabaseRequest(
    `offerpsp_mcp_oauth_clients?select=*&client_id=eq.${encodeURIComponent(clientId)}&revoked_at=is.null&limit=1`,
  );
  return rows(result)[0] || null;
}

async function supabaseAuthRequest(path, { token, apiKey, body }) {
  const supabaseUrl = requiredEnv("SUPABASE_URL", "SUPABASE_URL", "VITE_SUPABASE_URL").replace(/\/$/, "");
  const response = await fetch(`${supabaseUrl}/auth/v1/${path.replace(/^\//, "")}`, {
    method: "POST",
    headers: {
      apikey: apiKey,
      ...(token ? { authorization: `Bearer ${token}` } : {}),
      "content-type": "application/json",
    },
    body: JSON.stringify(body || {}),
  });
  const data = await response.json().catch(() => null);
  if (!response.ok) {
    throw new HttpError(response.status, data?.msg || data?.message || data?.error_description || data?.error || "Supabase Auth request failed");
  }
  return data;
}

async function createDedicatedStaffSession(user) {
  const serviceRole = requiredEnv("SUPABASE_SERVICE_ROLE_KEY", "SUPABASE_SERVICE_ROLE_KEY");
  const publishable = requiredEnv(
    "SUPABASE_PUBLISHABLE_KEY",
    "SUPABASE_PUBLISHABLE_KEY",
    "SUPABASE_ANON_KEY",
    "VITE_SUPABASE_PUBLISHABLE_KEY",
  );
  if (!user?.id || !user?.email) throw new HttpError(400, "Staff account must have a verified email address");
  const generated = await supabaseAuthRequest("admin/generate_link", {
    token: serviceRole,
    apiKey: serviceRole,
    body: { type: "magiclink", email: user.email },
  });
  // Raw GoTrue REST returns link properties at the top level. The Supabase JS
  // client transforms that payload into `data.properties`, so accept both
  // shapes and keep this server independent from the client SDK.
  const tokenHash = generated?.hashed_token || generated?.properties?.hashed_token;
  const verificationType = generated?.verification_type || generated?.properties?.verification_type || "magiclink";
  if (!tokenHash) throw new HttpError(502, "Supabase did not create a dedicated staff session link");
  const session = await supabaseAuthRequest("verify", {
    apiKey: publishable,
    body: { type: verificationType, token_hash: tokenHash },
  });
  if (session?.user?.id !== user.id || !session?.access_token || !session?.refresh_token) {
    throw new HttpError(502, "Dedicated staff session identity mismatch");
  }
  return session;
}

async function refreshDedicatedSession(refreshToken) {
  const publishable = requiredEnv(
    "SUPABASE_PUBLISHABLE_KEY",
    "SUPABASE_PUBLISHABLE_KEY",
    "SUPABASE_ANON_KEY",
    "VITE_SUPABASE_PUBLISHABLE_KEY",
  );
  const session = await supabaseAuthRequest("token?grant_type=refresh_token", {
    apiKey: publishable,
    body: { refresh_token: refreshToken },
  });
  if (!session?.access_token || !session?.refresh_token || !session?.user?.id) {
    throw new HttpError(502, "Supabase did not refresh the dedicated staff session");
  }
  return session;
}

function safeSession(session) {
  return {
    access_token: String(session.access_token),
    refresh_token: String(session.refresh_token),
    expires_at: Number(session.expires_at || Math.floor(Date.now() / 1000) + Number(session.expires_in || 3600)),
    user_id: String(session.user?.id || session.user_id || ""),
  };
}

async function issueTokenPair({ clientId, actorUserId, scope, resource, session, familyId = randomUUID() }) {
  const normalized = safeSession(session);
  if (normalized.user_id !== actorUserId) throw new HttpError(401, "OAuth staff session identity mismatch");
  const accessToken = opaqueToken("op_at_");
  const refreshToken = opaqueToken("op_rt_");
  const now = Date.now();
  const sessionExpiresAt = normalized.expires_at * 1000;
  const accessExpiresAt = new Date(Math.min(now + 15 * 60_000, sessionExpiresAt - 30_000));
  if (accessExpiresAt.getTime() <= now) throw new HttpError(401, "Dedicated staff session already expired");
  const encrypted = encryptPayload(normalized);
  await serviceSupabaseRequest("offerpsp_mcp_oauth_access_tokens", {
    method: "POST",
    headers: { Prefer: "return=minimal" },
    body: JSON.stringify({
      token_hash: sha256(accessToken), family_id: familyId, client_id: clientId,
      actor_user_id: actorUserId, scope, resource, session_ciphertext: encrypted,
      expires_at: accessExpiresAt.toISOString(),
    }),
  });
  await serviceSupabaseRequest("offerpsp_mcp_oauth_refresh_tokens", {
    method: "POST",
    headers: { Prefer: "return=minimal" },
    body: JSON.stringify({
      token_hash: sha256(refreshToken), family_id: familyId, client_id: clientId,
      actor_user_id: actorUserId, scope, resource, session_ciphertext: encrypted,
      expires_at: new Date(now + 30 * 24 * 60 * 60_000).toISOString(),
    }),
  });
  return {
    access_token: accessToken,
    token_type: "Bearer",
    expires_in: Math.max(1, Math.floor((accessExpiresAt.getTime() - now) / 1000)),
    refresh_token: refreshToken,
    scope,
  };
}

export async function oauthMetadataHandler(request, response) {
  if (request.method !== "GET") {
    response.setHeader("Allow", "GET");
    return sendJson(response, 405, { error: "Method not allowed" });
  }
  response.setHeader("Access-Control-Allow-Origin", "*");
  response.setHeader("Cache-Control", "public, max-age=300");
  return response.status(200).json(authorizationServerMetadata());
}

export async function oauthRegisterHandler(request, response) {
  jsonCors(response);
  if (request.method === "OPTIONS") return response.status(204).end();
  if (request.method !== "POST") return oauthError(response, 405, "invalid_request", "Method not allowed");
  const recentClients = await serviceSupabaseRequest(
    `offerpsp_mcp_oauth_clients?select=client_id&created_at=gt.${encodeURIComponent(new Date(Date.now() - 60 * 60_000).toISOString())}&limit=101`,
  );
  if (rows(recentClients).length >= 100) {
    return oauthError(response, 429, "temporarily_unavailable", "OAuth client registration rate limit reached");
  }
  const body = request.body && typeof request.body === "object" ? request.body : {};
  const redirectUris = asArray(body.redirect_uris).map((value) => String(value).trim());
  if (!redirectUris.length || redirectUris.length > 10 || redirectUris.some((uri) => !validRedirectUri(uri))) {
    return oauthError(response, 400, "invalid_redirect_uri", "Every redirect URI must be an exact HTTPS or loopback HTTP URL");
  }
  if (new Set(redirectUris).size !== redirectUris.length) {
    return oauthError(response, 400, "invalid_client_metadata", "Duplicate redirect URIs are not allowed");
  }
  const authMethod = String(body.token_endpoint_auth_method || "none");
  if (authMethod !== "none") return oauthError(response, 400, "invalid_client_metadata", "Only public PKCE clients are supported");
  const grantTypes = asArray(body.grant_types || ["authorization_code", "refresh_token"]);
  const responseTypes = asArray(body.response_types || ["code"]);
  if (grantTypes.some((value) => !["authorization_code", "refresh_token"].includes(value)) || responseTypes.some((value) => value !== "code")) {
    return oauthError(response, 400, "invalid_client_metadata", "Unsupported grant or response type");
  }
  const clientName = String(body.client_name || "Codex / ChatGPT").trim().slice(0, 120);
  if (!clientName) return oauthError(response, 400, "invalid_client_metadata", "client_name is required");
  const clientId = opaqueToken("op_client_");
  await serviceSupabaseRequest("offerpsp_mcp_oauth_clients", {
    method: "POST",
    headers: { Prefer: "return=minimal" },
    body: JSON.stringify({
      client_id: clientId,
      client_name: clientName,
      redirect_uris: redirectUris,
      token_endpoint_auth_method: "none",
      metadata: {
        application_type: String(body.application_type || "native").slice(0, 40),
        software_id: body.software_id ? String(body.software_id).slice(0, 200) : null,
      },
    }),
  });
  response.setHeader("Cache-Control", "no-store");
  return response.status(201).json({
    client_id: clientId,
    client_id_issued_at: Math.floor(Date.now() / 1000),
    client_name: clientName,
    redirect_uris: redirectUris,
    token_endpoint_auth_method: "none",
    grant_types: ["authorization_code", "refresh_token"],
    response_types: ["code"],
  });
}

export async function oauthAuthorizeHandler(request, response) {
  if (request.method !== "GET") {
    response.setHeader("Allow", "GET");
    return sendJson(response, 405, { error: "Method not allowed" });
  }
  const query = request.query || {};
  const clientId = single(query.client_id);
  const redirectUri = single(query.redirect_uri);
  const client = await findClient(clientId);
  if (!client) throw new HttpError(400, "Unknown or revoked OAuth client");
  if (!client.redirect_uris.includes(redirectUri)) throw new HttpError(400, "redirect_uri is not registered for this client");
  if (single(query.response_type) !== "code") throw new HttpError(400, "Only response_type=code is supported");
  if (single(query.code_challenge_method) !== "S256") throw new HttpError(400, "PKCE S256 is required");
  const codeChallenge = single(query.code_challenge);
  if (!/^[A-Za-z0-9_-]{43,128}$/.test(codeChallenge)) throw new HttpError(400, "Invalid PKCE code_challenge");
  const resource = single(query.resource);
  if (resource !== offerPspMcpResource()) throw new HttpError(400, "OAuth resource must be the OfferPSP MCP endpoint");
  const scope = parseScopes(single(query.scope));
  const state = single(query.state);
  if (state.length > 2000) throw new HttpError(400, "OAuth state is too long");
  const recentRequests = await serviceSupabaseRequest(
    `offerpsp_mcp_oauth_requests?select=id&created_at=gt.${encodeURIComponent(new Date(Date.now() - 60 * 60_000).toISOString())}&limit=501`,
  );
  if (rows(recentRequests).length >= 500) throw new HttpError(429, "OAuth authorization rate limit reached");
  const inserted = await serviceSupabaseRequest("offerpsp_mcp_oauth_requests", {
    method: "POST",
    headers: { Prefer: "return=representation" },
    body: JSON.stringify({
      client_id: clientId,
      redirect_uri: redirectUri,
      state_ciphertext: state ? encryptPayload({ state }) : null,
      scope,
      resource,
      code_challenge: codeChallenge,
      code_challenge_method: "S256",
    }),
  });
  const authorizationId = rows(inserted)[0]?.id;
  if (!authorizationId) throw new HttpError(502, "OAuth authorization request was not stored");
  await serviceSupabaseRequest(`offerpsp_mcp_oauth_clients?client_id=eq.${encodeURIComponent(clientId)}`, {
    method: "PATCH", headers: { Prefer: "return=minimal" }, body: JSON.stringify({ last_used_at: new Date().toISOString() }),
  });
  response.setHeader("Cache-Control", "no-store");
  response.setHeader("Location", `${offerPspOAuthOrigin()}/oauth/consent?authorization_id=${encodeURIComponent(authorizationId)}`);
  return response.status(302).end();
}

async function loadAuthorizationRequest(authorizationId) {
  if (!/^[0-9a-f-]{36}$/i.test(authorizationId)) throw new HttpError(400, "Invalid authorization_id");
  const result = await serviceSupabaseRequest(
    `offerpsp_mcp_oauth_requests?select=*&id=eq.${encodeURIComponent(authorizationId)}&limit=1`,
  );
  const record = rows(result)[0];
  if (!record) throw new HttpError(404, "OAuth authorization request not found");
  if (new Date(record.expires_at).getTime() <= Date.now()) throw new HttpError(410, "OAuth authorization request expired");
  const client = await findClient(record.client_id);
  if (!client) throw new HttpError(400, "OAuth client was revoked");
  return { record, client };
}

export async function oauthRequestHandler(request, response, staffContext) {
  if (request.method !== "GET") return sendJson(response, 405, { error: "Method not allowed" });
  const { record, client } = await loadAuthorizationRequest(single(request.query?.authorization_id));
  if (record.status !== "pending") throw new HttpError(409, `OAuth authorization request is ${record.status}`);
  return sendJson(response, 200, {
    authorization_id: record.id,
    client: { client_id: client.client_id, name: client.client_name },
    redirect_uri: record.redirect_uri,
    scope: record.scope,
    resource: record.resource,
    staff: { id: staffContext.user.id, email: staffContext.user.email },
    expires_at: record.expires_at,
  });
}

function authorizationRedirect(record, parameters) {
  const url = new URL(record.redirect_uri);
  for (const [key, value] of Object.entries(parameters)) if (value != null && value !== "") url.searchParams.set(key, String(value));
  if (record.state_ciphertext) url.searchParams.set("state", decryptPayload(record.state_ciphertext).state);
  return url.toString();
}

export async function oauthDecisionHandler(request, response, staffContext) {
  if (request.method !== "POST") return sendJson(response, 405, { error: "Method not allowed" });
  const authorizationId = String(request.body?.authorization_id || "");
  const decision = String(request.body?.decision || "");
  const { record } = await loadAuthorizationRequest(authorizationId);
  if (record.status !== "pending") throw new HttpError(409, `OAuth authorization request is ${record.status}`);
  if (decision === "deny") {
    await serviceSupabaseRequest(`offerpsp_mcp_oauth_requests?id=eq.${encodeURIComponent(record.id)}&status=eq.pending`, {
      method: "PATCH", headers: { Prefer: "return=minimal" },
      body: JSON.stringify({ status: "denied", actor_user_id: staffContext.user.id, decided_at: new Date().toISOString() }),
    });
    return sendJson(response, 200, { redirect_url: authorizationRedirect(record, { error: "access_denied" }) });
  }
  if (decision !== "approve") throw new HttpError(400, "decision must be approve or deny");

  const claiming = await serviceSupabaseRequest(`offerpsp_mcp_oauth_requests?id=eq.${encodeURIComponent(record.id)}&status=eq.pending&expires_at=gt.${encodeURIComponent(new Date().toISOString())}`, {
    method: "PATCH", headers: { Prefer: "return=representation" },
    body: JSON.stringify({ status: "approving", actor_user_id: staffContext.user.id }),
  });
  if (rows(claiming).length !== 1) throw new HttpError(409, "OAuth authorization request was already handled");

  let codeHash = "";
  try {
    const session = await createDedicatedStaffSession(staffContext.user);
    const code = opaqueToken("op_ac_");
    codeHash = sha256(code);
    await serviceSupabaseRequest("offerpsp_mcp_oauth_codes", {
      method: "POST", headers: { Prefer: "return=minimal" },
      body: JSON.stringify({
        code_hash: codeHash,
        request_id: record.id,
        client_id: record.client_id,
        redirect_uri: record.redirect_uri,
        scope: record.scope,
        resource: record.resource,
        code_challenge: record.code_challenge,
        actor_user_id: staffContext.user.id,
        session_ciphertext: encryptPayload(safeSession(session)),
      }),
    });
    await serviceSupabaseRequest(`offerpsp_mcp_oauth_requests?id=eq.${encodeURIComponent(record.id)}&status=eq.approving`, {
      method: "PATCH", headers: { Prefer: "return=minimal" },
      body: JSON.stringify({ status: "approved", decided_at: new Date().toISOString(), error_message: null }),
    });
    return sendJson(response, 200, { redirect_url: authorizationRedirect(record, { code }) });
  } catch (error) {
    if (codeHash) {
      await serviceSupabaseRequest(`offerpsp_mcp_oauth_codes?code_hash=eq.${codeHash}`, { method: "DELETE", headers: { Prefer: "return=minimal" } }).catch(() => null);
    }
    await serviceSupabaseRequest(`offerpsp_mcp_oauth_requests?id=eq.${encodeURIComponent(record.id)}&status=eq.approving`, {
      method: "PATCH", headers: { Prefer: "return=minimal" },
      body: JSON.stringify({ status: "pending", actor_user_id: null, error_message: String(error?.message || "Authorization failed").slice(0, 500) }),
    }).catch(() => null);
    throw error;
  }
}

function formBody(request) {
  if (request.body && typeof request.body === "object") return request.body;
  return Object.fromEntries(new URLSearchParams(String(request.body || "")));
}

async function authorizationCodeGrant(body) {
  const code = String(body.code || "");
  const clientId = String(body.client_id || "");
  const redirectUri = String(body.redirect_uri || "");
  const verifier = String(body.code_verifier || "");
  const resource = String(body.resource || offerPspMcpResource());
  if (!code || !clientId || !redirectUri || !verifier || !body.resource) throw new HttpError(400, "Missing authorization_code grant parameter");
  if (!/^[A-Za-z0-9._~-]{43,128}$/.test(verifier)) throw new HttpError(400, "Invalid PKCE code_verifier");
  const result = await serviceSupabaseRequest(`offerpsp_mcp_oauth_codes?select=*&code_hash=eq.${sha256(code)}&limit=1`);
  const record = rows(result)[0];
  if (!record || record.consumed_at || new Date(record.expires_at).getTime() <= Date.now()) throw new HttpError(400, "Authorization code is invalid or expired");
  if (record.client_id !== clientId || record.redirect_uri !== redirectUri || record.resource !== resource) throw new HttpError(400, "Authorization code binding mismatch");
  const challenge = createHash("sha256").update(verifier).digest("base64url");
  if (!constantTimeEqual(challenge, record.code_challenge)) throw new HttpError(400, "PKCE verification failed");
  const consumed = await serviceSupabaseRequest(`offerpsp_mcp_oauth_codes?code_hash=eq.${record.code_hash}&consumed_at=is.null&expires_at=gt.${encodeURIComponent(new Date().toISOString())}`, {
    method: "PATCH", headers: { Prefer: "return=representation" }, body: JSON.stringify({ consumed_at: new Date().toISOString() }),
  });
  if (rows(consumed).length !== 1) throw new HttpError(400, "Authorization code was already consumed");
  const session = decryptPayload(record.session_ciphertext);
  return issueTokenPair({ clientId, actorUserId: record.actor_user_id, scope: record.scope, resource: record.resource, session });
}

async function revokeFamily(familyId) {
  const now = new Date().toISOString();
  await Promise.all([
    serviceSupabaseRequest(`offerpsp_mcp_oauth_access_tokens?family_id=eq.${encodeURIComponent(familyId)}&revoked_at=is.null`, {
      method: "PATCH", headers: { Prefer: "return=minimal" }, body: JSON.stringify({ revoked_at: now }),
    }),
    serviceSupabaseRequest(`offerpsp_mcp_oauth_refresh_tokens?family_id=eq.${encodeURIComponent(familyId)}&revoked_at=is.null`, {
      method: "PATCH", headers: { Prefer: "return=minimal" }, body: JSON.stringify({ revoked_at: now }),
    }),
  ]);
}

async function refreshTokenGrant(body) {
  const refreshToken = String(body.refresh_token || "");
  const clientId = String(body.client_id || "");
  const resource = String(body.resource || "");
  if (!refreshToken || !clientId || !resource) throw new HttpError(400, "Missing refresh_token grant parameter");
  const result = await serviceSupabaseRequest(`offerpsp_mcp_oauth_refresh_tokens?select=*&token_hash=eq.${sha256(refreshToken)}&limit=1`);
  const record = rows(result)[0];
  if (!record) throw new HttpError(400, "Refresh token is invalid");
  if (record.client_id !== clientId) throw new HttpError(400, "Refresh token client mismatch");
  if (record.resource !== resource) throw new HttpError(400, "Refresh token resource mismatch");
  if (record.consumed_at || record.revoked_at || new Date(record.expires_at).getTime() <= Date.now()) {
    await revokeFamily(record.family_id);
    throw new HttpError(400, "Refresh token is invalid or was already used");
  }
  const consumed = await serviceSupabaseRequest(`offerpsp_mcp_oauth_refresh_tokens?token_hash=eq.${record.token_hash}&consumed_at=is.null&revoked_at=is.null`, {
    method: "PATCH", headers: { Prefer: "return=representation" }, body: JSON.stringify({ consumed_at: new Date().toISOString() }),
  });
  if (rows(consumed).length !== 1) {
    await revokeFamily(record.family_id);
    throw new HttpError(400, "Refresh token was already consumed");
  }
  await serviceSupabaseRequest(`offerpsp_mcp_oauth_access_tokens?family_id=eq.${encodeURIComponent(record.family_id)}&revoked_at=is.null`, {
    method: "PATCH", headers: { Prefer: "return=minimal" }, body: JSON.stringify({ revoked_at: new Date().toISOString() }),
  });
  const oldSession = decryptPayload(record.session_ciphertext);
  const session = await refreshDedicatedSession(oldSession.refresh_token);
  if (session.user?.id !== record.actor_user_id) {
    await revokeFamily(record.family_id);
    throw new HttpError(401, "Refreshed staff session identity mismatch");
  }
  const tokens = await issueTokenPair({
    clientId,
    actorUserId: record.actor_user_id,
    scope: record.scope,
    resource: record.resource,
    session,
    familyId: record.family_id,
  });
  await serviceSupabaseRequest(`offerpsp_mcp_oauth_refresh_tokens?token_hash=eq.${record.token_hash}`, {
    method: "PATCH", headers: { Prefer: "return=minimal" }, body: JSON.stringify({ replaced_by_hash: sha256(tokens.refresh_token) }),
  });
  return tokens;
}

export async function oauthTokenHandler(request, response) {
  jsonCors(response);
  if (request.method === "OPTIONS") return response.status(204).end();
  if (request.method !== "POST") return oauthError(response, 405, "invalid_request", "Method not allowed");
  response.setHeader("Cache-Control", "no-store");
  try {
    const body = formBody(request);
    const grantType = String(body.grant_type || "");
    const result = grantType === "authorization_code"
      ? await authorizationCodeGrant(body)
      : grantType === "refresh_token"
        ? await refreshTokenGrant(body)
        : null;
    if (!result) return oauthError(response, 400, "unsupported_grant_type", "Only authorization_code and refresh_token are supported");
    return response.status(200).json(result);
  } catch (error) {
    const status = error instanceof HttpError && error.status >= 400 && error.status < 500 ? error.status : 500;
    return oauthError(response, status, status === 500 ? "server_error" : "invalid_grant", error?.message || "OAuth token request failed");
  }
}

export async function requireOfferPspMcpStaff(request) {
  const value = String(request.headers.authorization || "");
  if (!value.toLowerCase().startsWith("bearer ")) throw new HttpError(401, "Missing OfferPSP OAuth access token");
  const accessToken = value.slice(7).trim();
  const result = await serviceSupabaseRequest(
    `offerpsp_mcp_oauth_access_tokens?select=*&token_hash=eq.${sha256(accessToken)}&revoked_at=is.null&expires_at=gt.${encodeURIComponent(new Date().toISOString())}&limit=1`,
  );
  const record = rows(result)[0];
  if (!record || record.resource !== offerPspMcpResource()) throw new HttpError(401, "OfferPSP OAuth access token is invalid or expired");
  const session = decryptPayload(record.session_ciphertext);
  if (session.user_id !== record.actor_user_id || !session.access_token) throw new HttpError(401, "OfferPSP OAuth session binding mismatch");
  const context = await requireOfferPspStaff({ headers: { authorization: `Bearer ${session.access_token}` } });
  if (context.user.id !== record.actor_user_id) throw new HttpError(401, "OfferPSP staff identity mismatch");
  return {
    ...context,
    oauth: {
      clientId: record.client_id,
      familyId: record.family_id,
      resource: record.resource,
      scopes: new Set(String(record.scope).split(/\s+/).filter(Boolean)),
    },
  };
}
