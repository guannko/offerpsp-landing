import assert from "node:assert/strict";
import { test } from "node:test";
import { createCompanyScreeningWorker } from "../api/_lib/company-screening-worker.mjs";
import platformModules from "../api/platform-modules.mjs";
import { buildScreeningWorkflow } from "./screening-workflow.mjs";

const token = "test-only-not-a-credential".repeat(2);
const env = { OFFERPSP_SCREENING_WORKER_ENABLED: "true", OFFERPSP_SCREENING_WORKER_TOKEN: token };
const lead_id = "00000000-0000-4000-8000-000000000001";
const run_id = "00000000-0000-4000-8000-000000000002";
export async function invoke(worker, body, overrides = {}) {
  const response = { headers: {}, setHeader(k, v) { this.headers[k] = v; }, status(s) { this.code = s; return this; }, json(b) { this.body = b; return this; } };
  await worker({ method: "POST", headers: { authorization: `Bearer ${token}` }, body, ...overrides }, response);
  return response;
}
test("disabled/unconfigured/unauthorized calls never reach the database or collector", async () => {
  const rpc = () => { throw new Error("Must not call DB"); };
  assert.equal((await invoke(createCompanyScreeningWorker({ env: {}, rpc }), { action: "claim" })).code, 503);
  const worker = createCompanyScreeningWorker({ env, rpc });
  assert.equal((await invoke(worker, { action: "claim" }, { headers: {} })).code, 401);
  assert.equal((await invoke(worker, { action: "claim" }, { headers: { authorization: `Bearer ${token.slice(1)}x` } })).code, 401);
  assert.equal((await invoke(worker, { action: "claim" }, { method: "GET" })).code, 405);
});
test("input accepts identifiers only, not URL, dossier, caller limit or arbitrary action", async () => {
  let calls = 0;
  const worker = createCompanyScreeningWorker({ env, rpc: async () => { calls++; } });
  for (const body of [null, [], "{}", { action: "claim", limit: 50 }, { action: "process", lead_id, run_id, company_url: "https://attacker.org" }, { action: "process", lead_id, run_id: "invalid" }, { action: "send" }]) {
    assert.equal((await invoke(worker, body)).code, 400);
  }
  assert.equal(calls, 0);
});
test("claim is limited to one and returns only IDs, never the dossier", async () => {
  const worker = createCompanyScreeningWorker({ env, rpc: async (name, args) => {
    assert.equal(name, "claim_offerpsp_pre_compliance_jobs"); assert.deepEqual(args, { p_limit: 1 });
    return [{ lead_id, run_id, company: "Private", work_email: "private@company.org" }];
  } });
  const result = await invoke(worker, { action: "claim" });
  assert.deepEqual(result.body, { jobs: [{ lead_id, run_id }] });
  assert.equal(result.headers["cache-control"], "no-store");
});
test("completed/replayed/in-progress jobs return receipts without collecting again", async () => {
  for (const outcome of ["already_completed", "in_progress", "stale_or_cancelled", "module_disabled"]) {
    const worker = createCompanyScreeningWorker({ env, rpc: async () => ({ outcome, summary: "Private" }), processJob: () => { throw new Error("Must not collect again"); } });
    const result = await invoke(worker, { action: "process", lead_id, run_id });
    assert.equal(result.code, outcome === "in_progress" ? 202 : 200);
    assert.deepEqual(result.body, { lead_id, run_id, outcome });
  }
});
test("only fresh server-loaded job reaches the collector and fenced completion RPC", async () => {
  const calls = [];
  const worker = createCompanyScreeningWorker({ env, rpc: async (name, args) => {
    calls.push(name);
    if (name.startsWith("begin_")) return { outcome: "acquired", job: { lead_id, run_id, company: "Loaded from DB" } };
    assert.equal(name, "complete_offerpsp_pre_compliance_run");
    assert.deepEqual(args, { p_lead_id: lead_id, p_run_id: run_id, p_payload: { summary: "Test" } });
    return { outcome: "completed" };
  }, processJob: async (job, { complete }) => {
    assert.equal(job.company, "Loaded from DB");
    return complete({ lead_id, run_id, payload: { summary: "Test" } });
  } });
  assert.equal((await invoke(worker, { action: "process", lead_id, run_id })).body.outcome, "completed");
  assert.equal(calls.length, 2);
});
test("unknown receipts, identity mismatches and RPC errors fail closed without disclosing details", async () => {
  for (const rpc of [async () => ({ outcome: "success" }), async () => ({ outcome: "acquired", job: { lead_id: run_id, run_id } }), async () => { throw new Error("secret/private details"); }]) {
    const result = await invoke(createCompanyScreeningWorker({ env, rpc }), { action: "process", lead_id, run_id });
    assert.equal(result.code, 502);
    assert.ok(!JSON.stringify(result.body).includes("secret"));
  }
});
test("real consolidated router reaches the disabled guard; no new public function or open auth path", async () => {
  const previous = process.env.OFFERPSP_SCREENING_WORKER_ENABLED;
  try {
    process.env.OFFERPSP_SCREENING_WORKER_ENABLED = "false";
    const response = await invoke(platformModules, { action: "claim" }, { query: { module: "company-screening-worker" } });
    assert.equal(response.code, 503);
  } finally {
    if (previous === undefined) delete process.env.OFFERPSP_SCREENING_WORKER_ENABLED;
    else process.env.OFFERPSP_SCREENING_WORKER_ENABLED = previous;
  }
});
test("inactive workflow contains no raw secrets/sends/website fetch; pending receipt is not success", () => {
  const endpoint = "https://staff.test/api/platform-modules?module=company-screening-worker";
  assert.throws(() => buildScreeningWorkflow({ endpoint }), /credential reference/);
  const workflow = buildScreeningWorkflow({ endpoint, credential: { id: "offline-fixture", name: "Offline schema validation only" } });
  assert.equal(workflow.active, false);
  assert.equal(workflow.nodes[0].type, "n8n-nodes-base.manualTrigger");
  for (const node of workflow.nodes.filter((node) => node.type.endsWith("httpRequest"))) {
    assert.equal(node.typeVersion, 4.3);
    assert.equal(node.parameters.url, endpoint);
    assert.equal(node.parameters.options.redirect.redirect.followRedirects, false);
    assert.equal(node.onError, "stopWorkflow");
    assert.equal(node.parameters.sendHeaders, undefined);
  }
  const expand = new Function("$input", workflow.nodes.find((node) => node.id === "expand").parameters.jsCode);
  assert.deepEqual(expand({ first: () => ({ json: { jobs: [] } }) }), []);
  const verify = new Function("$input", workflow.nodes.find((node) => node.id === "receipt").parameters.jsCode);
  assert.equal(verify({ first: () => ({ json: { outcome: "in_progress" } }) })[0].json.completed, false);
  assert.equal(verify({ first: () => ({ json: { outcome: "completed" } }) })[0].json.completed, true);
  assert.throws(() => verify({ first: () => ({ json: {} }) }), /Missing screening receipt/);
});

test("scheduled workflow is inactive until cutover, bounded to one per minute and routes failures", () => {
  const args = { endpoint: "https://staff.test/api/platform-modules?module=company-screening-worker", credential: { id: "offline-fixture", name: "Test" }, scheduled: true };
  assert.throws(() => buildScreeningWorkflow(args), /error workflow/);
  const workflow = buildScreeningWorkflow({ ...args, errorWorkflow: "verified-error-handler" });
  assert.equal(workflow.active, false);
  assert.equal(workflow.settings.errorWorkflow, "verified-error-handler");
  assert.equal(workflow.nodes.find((n) => n.id === "manual").disabled, true);
  assert.equal(workflow.nodes.find((n) => n.id === "schedule").parameters.rule.interval[0].minutesInterval, 1);
  const verify = new Function("$input", workflow.nodes.find((n) => n.id === "receipt").parameters.jsCode);
  for (const outcome of ["in_progress", "module_disabled"]) assert.throws(() => verify({ first: () => ({ json: { outcome } }) }), /not completed/);
  assert.equal(verify({ first: () => ({ json: { outcome: "completed" } }) })[0].json.completed, true);
});
