import assert from "node:assert/strict";
import { createHash, randomBytes } from "node:crypto";
import {
  authorizationServerMetadata,
  oauthAuthorizeHandler,
  oauthDecisionHandler,
  oauthRegisterHandler,
  oauthRequestHandler,
  oauthTokenHandler,
  requireOfferPspMcpStaff,
} from "../api/_lib/offerpsp-oauth.mjs";

process.env.SUPABASE_URL = "https://supabase.test";
process.env.SUPABASE_PUBLISHABLE_KEY = "publishable-test-key";
process.env.SUPABASE_SERVICE_ROLE_KEY = "service-role-test-key";
process.env.OFFERPSP_MCP_ORIGIN = "https://ops.test";
process.env.OFFERPSP_OAUTH_ENCRYPTION_KEY = Buffer.alloc(32, 11).toString("base64");

const staffUser = { id: "11111111-1111-4111-8111-111111111111", email: "staff@example.test" };
const tables = {
  offerpsp_mcp_oauth_clients: [],
  offerpsp_mcp_oauth_requests: [],
  offerpsp_mcp_oauth_codes: [],
  offerpsp_mcp_oauth_refresh_tokens: [],
  offerpsp_mcp_oauth_access_tokens: [],
};

function responseMock() {
  return {
    statusCode: 200, headers: {}, payload: null,
    setHeader(name, value) { this.headers[String(name).toLowerCase()] = value; },
    status(code) { this.statusCode = code; return this; },
    json(value) { this.payload = value; return this; },
    end(value = "") { this.payload = value || null; return this; },
  };
}

function defaultRow(table, body) {
  const now = new Date();
  if (table === "offerpsp_mcp_oauth_requests") return {
    id: crypto.randomUUID(), status: "pending", created_at: now.toISOString(),
    expires_at: new Date(now.getTime() + 600_000).toISOString(), actor_user_id: null,
    decided_at: null, error_message: null, ...body,
  };
  if (table === "offerpsp_mcp_oauth_codes") return {
    created_at: now.toISOString(), expires_at: new Date(now.getTime() + 120_000).toISOString(),
    consumed_at: null, ...body,
  };
  if (table === "offerpsp_mcp_oauth_access_tokens") return {
    created_at: now.toISOString(), revoked_at: null, ...body,
  };
  if (table === "offerpsp_mcp_oauth_refresh_tokens") return {
    created_at: now.toISOString(), consumed_at: null, revoked_at: null, replaced_by_hash: null, ...body,
  };
  return { created_at: now.toISOString(), last_used_at: null, revoked_at: null, ...body };
}

function matches(row, params) {
  for (const [key, raw] of params) {
    if (["select", "limit", "order"].includes(key)) continue;
    const value = decodeURIComponent(raw);
    if (value.startsWith("eq.") && String(row[key]) !== value.slice(3)) return false;
    if (value === "is.null" && row[key] != null) return false;
    if (value.startsWith("gt.") && !(new Date(row[key]).getTime() > new Date(value.slice(3)).getTime())) return false;
  }
  return true;
}

global.fetch = async (input, init = {}) => {
  const url = new URL(String(input));
  if (url.pathname === "/auth/v1/admin/generate_link") {
    return Response.json({ properties: { hashed_token: "generated-magic-link-hash" } });
  }
  if (url.pathname === "/auth/v1/verify") {
    return Response.json({
      access_token: "dedicated-access-1", refresh_token: "dedicated-refresh-1",
      expires_in: 3600, expires_at: Math.floor(Date.now() / 1000) + 3600, user: staffUser,
    });
  }
  if (url.pathname === "/auth/v1/token" && url.searchParams.get("grant_type") === "refresh_token") {
    return Response.json({
      access_token: "dedicated-access-2", refresh_token: "dedicated-refresh-2",
      expires_in: 3600, expires_at: Math.floor(Date.now() / 1000) + 3600, user: staffUser,
    });
  }
  if (url.pathname === "/auth/v1/user") return Response.json(staffUser);
  if (url.pathname === "/rest/v1/rpc/is_offerpsp_staff") return Response.json(true);

  const prefix = "/rest/v1/";
  if (!url.pathname.startsWith(prefix)) throw new Error(`Unexpected fetch ${url}`);
  const table = url.pathname.slice(prefix.length);
  const rows = tables[table];
  if (!rows) throw new Error(`Unexpected REST table ${table}`);
  const method = String(init.method || "GET").toUpperCase();
  if (method === "GET") return Response.json(rows.filter((row) => matches(row, url.searchParams)));
  if (method === "POST") {
    const body = JSON.parse(String(init.body || "{}"));
    const records = (Array.isArray(body) ? body : [body]).map((value) => defaultRow(table, value));
    rows.push(...records);
    return Response.json(String(init.headers?.Prefer || init.headers?.prefer || "").includes("return=minimal") ? null : records);
  }
  if (method === "PATCH") {
    const body = JSON.parse(String(init.body || "{}"));
    const changed = rows.filter((row) => matches(row, url.searchParams));
    changed.forEach((row) => Object.assign(row, body));
    return Response.json(String(init.headers?.Prefer || init.headers?.prefer || "").includes("return=representation") ? changed : null);
  }
  if (method === "DELETE") {
    const keep = rows.filter((row) => !matches(row, url.searchParams));
    tables[table].splice(0, rows.length, ...keep);
    return Response.json(null);
  }
  throw new Error(`Unexpected REST method ${method}`);
};

const metadata = authorizationServerMetadata();
assert.equal(metadata.issuer, "https://ops.test");
assert.equal(metadata.registration_endpoint, "https://ops.test/oauth/register");
assert.deepEqual(metadata.code_challenge_methods_supported, ["S256"]);
assert.deepEqual(metadata.token_endpoint_auth_methods_supported, ["none"]);

const callback = "http://127.0.0.1:43123/callback/test";
const registerResponse = responseMock();
await oauthRegisterHandler({
  method: "POST",
  body: { client_name: "Codex test", redirect_uris: [callback], token_endpoint_auth_method: "none" },
}, registerResponse);
assert.equal(registerResponse.statusCode, 201);
const clientId = registerResponse.payload.client_id;
assert.match(clientId, /^op_client_/);

const verifier = randomBytes(48).toString("base64url");
const challenge = createHash("sha256").update(verifier).digest("base64url");
const authorizeResponse = responseMock();
await oauthAuthorizeHandler({
  method: "GET",
  query: {
    client_id: clientId,
    redirect_uri: callback,
    response_type: "code",
    code_challenge: challenge,
    code_challenge_method: "S256",
    resource: "https://ops.test/mcp",
    scope: "offerpsp:read offerpsp:write offline_access",
    state: "codex-state",
  },
}, authorizeResponse);
assert.equal(authorizeResponse.statusCode, 302);
const authorizationId = new URL(authorizeResponse.headers.location).searchParams.get("authorization_id");
assert.ok(authorizationId);

const detailsResponse = responseMock();
await oauthRequestHandler({ method: "GET", query: { authorization_id: authorizationId } }, detailsResponse, { user: staffUser });
assert.equal(detailsResponse.payload.client.name, "Codex test");
assert.equal(detailsResponse.payload.staff.email, staffUser.email);

const decisionResponse = responseMock();
await oauthDecisionHandler({ method: "POST", body: { authorization_id: authorizationId, decision: "approve" } }, decisionResponse, { user: staffUser });
assert.equal(decisionResponse.statusCode, 200);
const callbackUrl = new URL(decisionResponse.payload.redirect_url);
assert.equal(callbackUrl.searchParams.get("state"), "codex-state");
const code = callbackUrl.searchParams.get("code");
assert.match(code, /^op_ac_/);

const tokenResponse = responseMock();
await oauthTokenHandler({
  method: "POST",
  body: {
    grant_type: "authorization_code", code, client_id: clientId,
    redirect_uri: callback, code_verifier: verifier, resource: "https://ops.test/mcp",
  },
}, tokenResponse);
assert.equal(tokenResponse.statusCode, 200);
assert.match(tokenResponse.payload.access_token, /^op_at_/);
assert.match(tokenResponse.payload.refresh_token, /^op_rt_/);
const firstAccessToken = tokenResponse.payload.access_token;
const firstRefreshToken = tokenResponse.payload.refresh_token;

const context = await requireOfferPspMcpStaff({ headers: { authorization: `Bearer ${firstAccessToken}` } });
assert.equal(context.user.id, staffUser.id);
assert.equal(context.token, "dedicated-access-1");
assert.ok(context.oauth.scopes.has("offerpsp:write"));

const refreshResponse = responseMock();
await oauthTokenHandler({
  method: "POST",
  body: { grant_type: "refresh_token", refresh_token: firstRefreshToken, client_id: clientId, resource: "https://ops.test/mcp" },
}, refreshResponse);
assert.equal(refreshResponse.statusCode, 200);
assert.notEqual(refreshResponse.payload.access_token, firstAccessToken);
await assert.rejects(
  () => requireOfferPspMcpStaff({ headers: { authorization: `Bearer ${firstAccessToken}` } }),
  /invalid or expired/,
);

const replayResponse = responseMock();
await oauthTokenHandler({
  method: "POST",
  body: { grant_type: "refresh_token", refresh_token: firstRefreshToken, client_id: clientId, resource: "https://ops.test/mcp" },
}, replayResponse);
assert.equal(replayResponse.statusCode, 400);
assert.equal(replayResponse.payload.error, "invalid_grant");
await assert.rejects(
  () => requireOfferPspMcpStaff({ headers: { authorization: `Bearer ${refreshResponse.payload.access_token}` } }),
  /invalid or expired/,
);

console.log("OfferPSP OAuth 2.1 tests passed");
