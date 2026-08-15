import assert from "node:assert/strict";
import { createCipheriv } from "node:crypto";
import { readFile } from "node:fs/promises";
import { offerPspMcpHandler as mcpHandler, resourceMetadata } from "../api/_lib/offerpsp-mcp-http.mjs";
import { offerPspTools } from "../api/_lib/offerpsp-mcp.mjs";
import { offerPspActionsOpenApi } from "../api/_lib/offerpsp-actions.mjs";

process.env.SUPABASE_URL = "https://supabase.test";
process.env.SUPABASE_PUBLISHABLE_KEY = "publishable-test-key";
process.env.SUPABASE_SERVICE_ROLE_KEY = "service-role-test-key";
process.env.OFFERPSP_MCP_ORIGIN = "https://ops.test";
const encryptionKey = Buffer.alloc(32, 7);
process.env.OFFERPSP_OAUTH_ENCRYPTION_KEY = encryptionKey.toString("base64");

function encrypt(value) {
  const iv = Buffer.alloc(12, 3);
  const cipher = createCipheriv("aes-256-gcm", encryptionKey, iv);
  const ciphertext = Buffer.concat([cipher.update(JSON.stringify(value), "utf8"), cipher.final()]);
  return ["v1", iv.toString("base64url"), cipher.getAuthTag().toString("base64url"), ciphertext.toString("base64url")].join(".");
}

const staffUserId = "11111111-1111-4111-8111-111111111111";
const oauthSession = encrypt({
  access_token: "supabase-user-token",
  refresh_token: "supabase-refresh-token",
  expires_at: Math.floor(Date.now() / 1000) + 3600,
  user_id: staffUserId,
});

const calls = [];
global.fetch = async (url, init = {}) => {
  calls.push({ url: String(url), init });
  if (String(url).includes("/rest/v1/offerpsp_mcp_oauth_access_tokens?")) return Response.json([{
    token_hash: "mocked-by-query",
    family_id: "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa",
    client_id: "op_client_test",
    actor_user_id: staffUserId,
    scope: "offerpsp:read offerpsp:write offline_access",
    resource: "https://ops.test/mcp",
    session_ciphertext: oauthSession,
    expires_at: new Date(Date.now() + 900_000).toISOString(),
    revoked_at: null,
  }]);
  if (String(url).endsWith("/auth/v1/user")) return Response.json({ id: staffUserId, email: "staff@example.test" });
  if (String(url).endsWith("/rpc/is_offerpsp_staff")) return Response.json(true);
  if (String(url).endsWith("/rpc/get_offerpsp_staff_search_index_snapshot")) return Response.json({
    leads: [{ lead_id: "22222222-2222-4222-8222-222222222222", company: "Example Merchant", work_email: "ops@example.test", record_state: "active" }],
    management: { providers: [], organizations: [] }, coverage: { routes: [] },
    captains_bridge: { casino_leads: [], psp_providers: [] },
  });
  if (String(url).endsWith("/rpc/record_offerpsp_mcp_action")) return Response.json({ ok: true, journal_id: "33333333-3333-4333-8333-333333333333" });
  if (String(url).endsWith("/rpc/save_offerpsp_task")) return Response.json({ id: "44444444-4444-4444-8444-444444444444", title: "Follow up" });
  if (String(url).includes("/api/aibot-command")) return Response.json({ success: true, answer: "Prepared only", confirmation_required: false });
  throw new Error(`Unexpected fetch: ${url}`);
};

function responseMock() {
  return {
    statusCode: 200, headers: {}, payload: null,
    setHeader(name, value) { this.headers[String(name).toLowerCase()] = value; },
    status(code) { this.statusCode = code; return this; },
    json(value) { this.payload = value; return this; },
    end(value = "") { this.payload = value ? JSON.parse(value) : null; return this; },
  };
}

function request(body, authorization = "Bearer staff-token") {
  return { method: "POST", body, headers: { authorization, host: "ops.test", "x-forwarded-proto": "https" } };
}

const metadata = resourceMetadata({ SUPABASE_URL: "https://supabase.test", OFFERPSP_MCP_ORIGIN: "https://ops.test" });
assert.equal(metadata.resource, "https://ops.test/mcp");
assert.deepEqual(metadata.authorization_servers, ["https://ops.test"]);
assert.deepEqual(metadata.scopes_supported, ["offerpsp:read", "offerpsp:write", "offline_access"]);

const unauthorized = responseMock();
await mcpHandler(request({ jsonrpc: "2.0", id: 1, method: "initialize", params: {} }, ""), unauthorized);
assert.equal(unauthorized.statusCode, 401);
assert.match(unauthorized.headers["www-authenticate"], /oauth-protected-resource/);

const initialized = responseMock();
await mcpHandler(request({ jsonrpc: "2.0", id: 2, method: "initialize", params: { protocolVersion: "2025-06-18" } }), initialized);
assert.equal(initialized.statusCode, 200);
assert.equal(initialized.payload.result.serverInfo.name, "offerpsp-operator");
assert.match(initialized.payload.result.instructions, /BIXOFFPSP/);

const listed = responseMock();
await mcpHandler(request({ jsonrpc: "2.0", id: 3, method: "tools/list" }), listed);
assert.equal(listed.payload.result.tools.length, offerPspTools.length);
assert.ok(listed.payload.result.tools.every((item) => item.securitySchemes?.[0]?.type === "oauth2"));
assert.deepEqual(listed.payload.result.tools.find((item) => item.name === "search").securitySchemes[0].scopes, ["offerpsp:read"]);
assert.deepEqual(listed.payload.result.tools.find((item) => item.name === "create_task").securitySchemes[0].scopes, ["offerpsp:read", "offerpsp:write"]);
assert.equal(listed.payload.result.tools.find((item) => item.name === "search").annotations.readOnlyHint, true);
assert.equal(listed.payload.result.tools.find((item) => item.name === "confirm_bulk_operation").annotations.destructiveHint, true);

const searched = responseMock();
await mcpHandler(request({ jsonrpc: "2.0", id: 4, method: "tools/call", params: { name: "search", arguments: { query: "merchant" } } }), searched);
assert.equal(searched.statusCode, 200);
assert.equal(searched.payload.result.structuredContent.count, 1);
assert.equal(searched.payload.result.structuredContent.results[0].id, "merchant:22222222-2222-4222-8222-222222222222");

const created = responseMock();
await mcpHandler(request({ jsonrpc: "2.0", id: 5, method: "tools/call", params: { name: "create_task", arguments: { title: "Follow up" } } }), created);
assert.equal(created.payload.result.structuredContent.title, "Follow up");
assert.equal(calls.filter((entry) => entry.url.endsWith("/rpc/record_offerpsp_mcp_action")).length, 2);

const source = await readFile(new URL("../api/_lib/offerpsp-mcp.mjs", import.meta.url), "utf8");
assert.equal(source.includes("SUPABASE_SERVICE_ROLE_KEY"), false);
assert.equal(source.includes("send-email"), false);
assert.equal(source.includes("send-telegram"), false);

const actionsSchema = offerPspActionsOpenApi();
assert.equal(actionsSchema.openapi, "3.1.0");
assert.equal(typeof actionsSchema.components.schemas, "object");
assert.ok(Object.keys(actionsSchema.components.schemas.ActionResponse.properties).length > 0);
for (const path of Object.values(actionsSchema.paths)) {
  const responseSchema = path.post.responses[200].content["application/json"].schema;
  assert.equal(responseSchema.$ref, "#/components/schemas/ActionResponse");
}
assert.equal(actionsSchema.paths["/actions/system_health"].post["x-openai-isConsequential"], false);
assert.equal(actionsSchema.paths["/actions/create_task"].post["x-openai-isConsequential"], true);
assert.ok(actionsSchema.paths["/actions/prepare_telegram_reply"]);
assert.ok(actionsSchema.paths["/actions/get_entity_workspace"].post.requestBody.content["application/json"].schema.properties.entity_type.enum.includes("deal"));

console.log("OfferPSP MCP gateway tests passed");
