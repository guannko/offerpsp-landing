import assert from "node:assert/strict";
import { test } from "node:test";
import { createCompanyScreeningWorker } from "../api/_lib/company-screening-worker.mjs";
import platformModules from "../api/platform-modules.mjs";
import { buildScreeningWorkflow, buildScreeningEventIngress } from "./screening-workflow.mjs";

const token = "test-only-not-a-credential".repeat(2);
const env = { OFFERPSP_SCREENING_WORKER_ENABLED: "true", OFFERPSP_SCREENING_WORKER_TOKEN: token };
const lead_id = "00000000-0000-4000-8000-000000000001";
const run_id = "00000000-0000-4000-8000-000000000002";
const job_id = "00000000-0000-4000-8000-000000000003";
const noAutoReply = async () => ({ outcome: "review_required", reason_code: "test_fixture" });
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
  for (const body of [null, [], "{}", { action: "claim", limit: 50 }, { action: "process", lead_id, run_id, company_url: "https://attacker.org" }, { action: "process", lead_id, run_id: "invalid" }, { action: "process_research", job_id, run_id, entity_id: 7 }, { action: "send" }]) {
    assert.equal((await invoke(worker, body)).code, 400);
  }
  assert.equal(calls, 0);
});
test("research claim returns only opaque job/run IDs", async () => {
  const worker = createCompanyScreeningWorker({ env, rpc: async (name, args) => {
    assert.equal(name, "claim_offerpsp_research_screening_jobs"); assert.deepEqual(args, { p_limit: 1 });
    return [{ job_id, run_id, entity_type: "psp", entity_id: 42, company: "Private" }];
  } });
  const result = await invoke(worker, { action: "claim_research" });
  assert.deepEqual(result.body, { jobs: [{ job_id, run_id }] });
});
test("research processing loads server data and completes through the fenced RPC", async () => {
  const calls = [];
  const worker = createCompanyScreeningWorker({ env, rpc: async (name, args) => {
    calls.push(name);
    if (name === "begin_offerpsp_research_screening_run") return { outcome: "acquired", job: { job_id, run_id, entity_type: "psp", entity_id: 42, lease_until: "2099-01-01T00:00:00Z" } };
    assert.equal(name, "complete_offerpsp_research_screening_run");
    assert.deepEqual(args, { p_job_id: job_id, p_run_id: run_id, p_payload: { summary: "Test" } });
    return { outcome: "completed" };
  }, processResearchJob: async (job, { complete }) => {
    assert.equal(job.entity_id, 42);
    return complete({ job_id, run_id, payload: { summary: "Test" } });
  } });
  assert.equal((await invoke(worker, { action: "process_research", job_id, run_id })).body.outcome, "completed");
  assert.deepEqual(calls, ["begin_offerpsp_research_screening_run", "complete_offerpsp_research_screening_run"]);
});
test("research collector failure is persisted as a bounded retry receipt", async () => {
  const calls = [];
  const worker = createCompanyScreeningWorker({ env, rpc: async (name, args) => {
    calls.push({ name, args });
    if (name === "begin_offerpsp_research_screening_run") return { outcome: "acquired", job: { job_id, run_id } };
    if (name === "fail_offerpsp_research_screening_run") return { outcome: "retry_queued" };
    throw new Error("unexpected");
  }, processResearchJob: async () => { throw new Error("private network detail"); } });
  const result = await invoke(worker, { action: "process_research", job_id, run_id });
  assert.deepEqual(result.body, { job_id, run_id, outcome: "retry_queued" });
  assert.deepEqual(calls.at(-1), { name: "fail_offerpsp_research_screening_run", args: { p_job_id: job_id, p_run_id: run_id, p_error_code: "collector_failed" } });
});
test("research-only retry receipts cannot be accepted by the merchant intake path", async () => {
  const worker = createCompanyScreeningWorker({ env, rpc: async () => ({ outcome: "retry_queued" }) });
  const result = await invoke(worker, { action: "process", lead_id, run_id });
  assert.equal(result.code, 502);
  assert.deepEqual(result.body, { error: "Screening worker failed; result not confirmed" });
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
    const worker = createCompanyScreeningWorker({ env, rpc: async () => ({ outcome, summary: "Private" }), processJob: () => { throw new Error("Must not collect again"); }, processAutoReply: noAutoReply });
    const result = await invoke(worker, { action: "process", lead_id, run_id });
    assert.equal(result.code, outcome === "in_progress" ? 202 : 200);
    assert.deepEqual(result.body, { lead_id, run_id, outcome, auto_reply: outcome === "already_completed" ? { outcome: "review_required", reason_code: "test_fixture" } : null });
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
  }, processAutoReply: noAutoReply });
  const body = (await invoke(worker, { action: "process", lead_id, run_id })).body;
  assert.equal(body.outcome, "completed");
  assert.equal(body.auto_reply.outcome, "review_required");
  assert.equal(calls.length, 2);
});
test("recovery processes one durable queued reply and an empty queue is a no-op", async () => {
  let pending = true;
  const worker = createCompanyScreeningWorker({
    env,
    rpc: async (name) => {
      assert.equal(name, "claim_offerpsp_pending_intake_auto_reply");
      if (pending) { pending = false; return { outcome: "claimed", lead_id }; }
      return { outcome: "empty" };
    },
    processAutoReply: async (id) => ({ outcome: "sent", lead_id: id }),
  });
  assert.deepEqual((await invoke(worker, { action: "recover_auto_reply" })).body, { lead_id, outcome: "sent" });
  assert.deepEqual((await invoke(worker, { action: "recover_auto_reply" })).body, { outcome: "empty" });
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
  const expandResearch = new Function("$input", workflow.nodes.find((node) => node.id === "expand-research").parameters.jsCode);
  assert.deepEqual(expandResearch({ first: () => ({ json: { jobs: [{ job_id, run_id }] } }) }), [{ json: { job_id, run_id } }]);
  const verifyResearch = new Function("$input", workflow.nodes.find((node) => node.id === "receipt-research").parameters.jsCode);
  assert.equal(verifyResearch({ first: () => ({ json: { outcome: "failed" } }) })[0].json.completed, false);
});

test("event worker drains available work, recovers every 12 hours and routes failures", () => {
  const args = { endpoint: "https://staff.test/api/platform-modules?module=company-screening-worker", credential: { id: "offline-fixture", name: "Test" }, scheduled: true };
  assert.throws(() => buildScreeningWorkflow(args), /error workflow/);
  const workflow = buildScreeningWorkflow({ ...args, errorWorkflow: "verified-error-handler" });
  assert.equal(workflow.active, false);
  assert.equal(workflow.settings.errorWorkflow, "verified-error-handler");
  assert.equal(workflow.nodes.find((n) => n.id === "manual").disabled, true);
  assert.deepEqual(workflow.nodes.find((n) => n.id === "schedule").parameters.rule.interval[0], { field: "hours", hoursInterval: 12 });
  assert.equal(workflow.nodes.find((n) => n.id === "event").type, "n8n-nodes-base.executeWorkflowTrigger");
  assert.equal(workflow.connections["Verify result receipt"].main[0][0].node, "Claim one run");
  assert.equal(workflow.connections["Verify research result receipt"].main[0][0].node, "Claim one research run");
  assert.equal(workflow.settings.executionTimeout, 900);
  const verify = new Function("$input", workflow.nodes.find((n) => n.id === "receipt").parameters.jsCode);
  for (const outcome of ["in_progress", "module_disabled"]) assert.throws(() => verify({ first: () => ({ json: { outcome } }) }), /not completed/);
  assert.equal(verify({ first: () => ({ json: { outcome: "completed" } }) })[0].json.completed, true);
});

test("event ingress authenticates, never persists headers and passes only a fixed wake-up", () => {
  const workflow = buildScreeningEventIngress({ credential: { id: "test", name: "Test" }, workerId: "worker", errorWorkflow: "errors" });
  assert.equal(workflow.active, false);
  assert.equal(workflow.nodes[0].parameters.authentication, "jwtAuth");
  assert.equal(workflow.settings.saveDataSuccessExecution, "none");
  assert.equal(workflow.settings.saveDataErrorExecution, "none");
  assert.equal(workflow.settings.saveManualExecutions, false);
  assert.equal(workflow.settings.saveExecutionProgress, false);
  const sanitize = new Function(workflow.nodes[1].parameters.jsCode);
  assert.deepEqual(sanitize(), [{ json: { source: "database_event" } }]);
  assert.equal(workflow.nodes[2].parameters.options.waitForSubWorkflow, false);
});
