import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import {
  createOperationEnvelope,
  createSupabasePrimaryDataPlane,
  stableStringify,
} from "../api/_lib/data-plane.mjs";
import healthHandler from "../api/_lib/bix-gateway-health.mjs";

const rpcCalls = [];
const primary = createSupabasePrimaryDataPlane({
  executeRpc: async (name, body) => {
    rpcCalls.push({ name, body });
    return { ok: true };
  },
});

assert.deepEqual(await primary.rpc("get_snapshot", { limit: 10 }), { ok: true });
assert.deepEqual(rpcCalls, [{ name: "get_snapshot", body: { limit: 10 } }]);
assert.deepEqual({ id: primary.id, provider: primary.provider, role: primary.role }, {
  id: "primary",
  provider: "supabase",
  role: "writer",
});

const operationA = createOperationEnvelope({
  operationId: "11111111-1111-4111-8111-111111111111",
  idempotencyKey: "mcp:staff:42",
  actionType: "create_task",
  actorId: "staff",
  payload: { nested: { b: 2, a: 1 }, title: "Follow up" },
});
const operationB = createOperationEnvelope({
  operationId: "22222222-2222-4222-8222-222222222222",
  idempotencyKey: "mcp:staff:42",
  actionType: "create_task",
  actorId: "staff",
  payload: { title: "Follow up", nested: { a: 1, b: 2 } },
});

assert.notEqual(operationA.operation_id, operationB.operation_id);
assert.equal(operationA.fingerprint, operationB.fingerprint);
assert.equal(stableStringify({ z: 1, a: { y: 2, x: 3 } }), '{"a":{"x":3,"y":2},"z":1}');
assert.throws(() => createOperationEnvelope({ actionType: "create_task" }), /idempotencyKey is required/);

function responseMock() {
  return {
    statusCode: 200,
    headers: {},
    payload: null,
    setHeader(name, value) { this.headers[String(name).toLowerCase()] = value; },
    status(code) { this.statusCode = code; return this; },
    json(value) { this.payload = value; return this; },
    end() { this.payload = null; return this; },
  };
}

const originalSupabaseUrl = process.env.SUPABASE_URL;
delete process.env.SUPABASE_URL;

const health = responseMock();
await healthHandler({ method: "GET" }, health);
assert.equal(health.statusCode, 200);
assert.equal(health.payload.status, "live");
assert.equal(health.payload.dependency_checks_performed, false);
assert.equal(health.payload.data_planes.primary.mode, "delegated");
assert.equal(health.payload.data_planes.reserve.mode, "not_provisioned");
assert.equal(Number.isNaN(Date.parse(health.payload.checked_at)), false);

const head = responseMock();
await healthHandler({ method: "HEAD" }, head);
assert.equal(head.statusCode, 200);
assert.equal(head.payload, null);

const rejected = responseMock();
await healthHandler({ method: "POST" }, rejected);
assert.equal(rejected.statusCode, 405);
assert.equal(rejected.headers.allow, "GET, HEAD");

if (originalSupabaseUrl == null) delete process.env.SUPABASE_URL;
else process.env.SUPABASE_URL = originalSupabaseUrl;

const healthSource = await readFile(new URL("../api/_lib/bix-gateway-health.mjs", import.meta.url), "utf8");
assert.equal(healthSource.includes("SUPABASE_"), false);
assert.equal(healthSource.includes("SERVICE_ROLE"), false);

console.log("BIX Reserve foundation tests passed");
