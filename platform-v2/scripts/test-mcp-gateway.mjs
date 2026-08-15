import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { offerPspMcpHandler as mcpHandler, resourceMetadata } from "../api/_lib/offerpsp-mcp-http.mjs";
import { offerPspTools } from "../api/_lib/offerpsp-mcp.mjs";

process.env.SUPABASE_URL = "https://supabase.test";
process.env.SUPABASE_PUBLISHABLE_KEY = "publishable-test-key";
process.env.OFFERPSP_MCP_ORIGIN = "https://ops.test";

const calls = [];
global.fetch = async (url, init = {}) => {
  calls.push({ url: String(url), init });
  if (String(url).endsWith("/auth/v1/user")) return Response.json({ id: "11111111-1111-4111-8111-111111111111", email: "staff@example.test" });
  if (String(url).endsWith("/rpc/is_offerpsp_staff")) return Response.json(true);
  if (String(url).endsWith("/rpc/get_offerpsp_search_index_snapshot")) return Response.json({
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
assert.deepEqual(metadata.authorization_servers, ["https://supabase.test/auth/v1"]);

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

console.log("OfferPSP MCP gateway tests passed");
