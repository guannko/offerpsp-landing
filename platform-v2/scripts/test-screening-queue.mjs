import assert from "node:assert/strict";
import { test } from "node:test";
import { readFile } from "node:fs/promises";
import { initializeScreeningFixture } from "./screening-test-fixture.mjs";
import { PGlite } from "@electric-sql/pglite";
import { buildCompanyScreening } from "../api/_lib/company-screening.mjs";
import { processClaimedCompany } from "../api/_lib/company-screening-runner.mjs";
import { createEvidenceFetcher } from "../api/_lib/safe-evidence-fetch.mjs";
import { createCompanyScreeningWorker } from "../api/_lib/company-screening-worker.mjs";

async function fixture() {
  const db = new PGlite();
  await initializeScreeningFixture(db);
  return db;
}
async function add(db, { status = "new", state = "active", caseStatus = "pending", stale = false } = {}) {
  const { rows: [lead] } = await db.query("insert into public.offerpsp_leads(lead_id,status,record_state,company,requested_currencies) values(gen_random_uuid(),$1,$2,'No action required',array['EUR']) returning lead_id", [status, state]);
  await db.query("insert into private.offerpsp_compliance_cases(lead_id,case_status,updated_at) values($1,$2,now() - $3::interval)", [lead.lead_id, caseStatus, stale ? "31 minutes" : "0 minutes"]);
  return lead.lead_id;
}
async function claim(db, limit = 10) {
  await db.exec("select set_config('request.jwt.claim.role','service_role',false)");
  const { rows: [result] } = await db.query("select public.claim_offerpsp_pre_compliance_jobs($1) jobs", [limit]);
  return result.jobs;
}
test("new intake is claimed once without waiting for option selection", async () => {
  const db = await fixture();
  try {
    const id = await add(db);
    const jobs = await claim(db);
    assert.equal(jobs.length, 1);
    assert.equal(jobs[0].lead_id, id);
    assert.deepEqual(jobs[0].requested_currencies, ["EUR"]);
    assert.deepEqual(await claim(db), []);
    assert.equal((await db.query("select status from public.offerpsp_leads")).rows[0].status, "new");
  } finally { await db.close(); }
});
test("archived, closed, spam, won/lost and staff-reviewed cases stay untouched", async () => {
  const db = await fixture();
  try {
    for (const status of ["closed", "spam", "won", "lost"]) await add(db, { status });
    await add(db, { state: "archived" });
    for (const caseStatus of ["manual_review", "hold", "needs_info", "cleared", "rejected", "spam"]) await add(db, { caseStatus });
    assert.deepEqual(await claim(db), []);
  } finally { await db.close(); }
});
test("stale claim retries; fresh in-progress job is not duplicated", async () => {
  const db = await fixture();
  try {
    const stale = await add(db, { caseStatus: "screening", stale: true });
    await add(db, { caseStatus: "screening" });
    assert.deepEqual((await claim(db)).map((job) => job.lead_id), [stale]);
    assert.deepEqual(await claim(db), []);
  } finally { await db.close(); }
});
test("module switch and batch limit are respected", async () => {
  const db = await fixture();
  try {
    await add(db); await add(db);
    await db.exec("select set_config('test.module_enabled','false',false)");
    assert.deepEqual(await claim(db), []);
    await db.exec("select set_config('test.module_enabled','true',false)");
    assert.equal((await claim(db, 1)).length, 1);
    assert.equal((await claim(db, 1)).length, 1);
  } finally { await db.close(); }
});
test("anonymous/authenticated cannot invoke privileged claim; missing JWT fails closed", async () => {
  const db = await fixture();
  try {
    await assert.rejects(db.query("select public.claim_offerpsp_pre_compliance_jobs(1)"), /service access required/);
    for (const role of ["anon", "authenticated"]) {
      const { rows: [row] } = await db.query("select has_function_privilege($1,'public.claim_offerpsp_pre_compliance_jobs(integer)','EXECUTE') allowed", [role]);
      assert.equal(row.allowed, false);
    }
  } finally { await db.close(); }
});

const payload = buildCompanyScreening({ company: "Synthetic only" }, {}, {}, new Date("2026-09-16T12:00:00Z"));
async function complete(db, job, evidence = payload) {
  return (await db.query("select public.complete_offerpsp_pre_compliance_run($1,$2,$3) result", [job.lead_id, job.run_id, evidence])).rows[0].result;
}
async function expire(db, id) {
  await db.query("update private.offerpsp_compliance_cases set screening_lease_until = now() - interval '1 minute' where lead_id=$1", [id]);
}
test("completion writes real evidence once; replay cannot create a second activity or alter the receipt", async () => {
  const db = await fixture();
  try {
    await add(db);
    const [job] = await claim(db);
    assert.ok(job.run_id); assert.equal(job.attempt, 1);
    assert.equal((await complete(db, job)).outcome, "completed");
    assert.equal((await complete(db, job)).outcome, "already_completed");
    await assert.rejects(complete(db, job, { ...payload, summary: "changed replay" }), /payload mismatch/);
    const row = (await db.query("select * from private.offerpsp_compliance_cases")).rows[0];
    assert.equal(row.case_status, "manual_review");
    assert.equal(row.screening_completed_run_id, job.run_id);
    assert.equal(row.authenticity_score, null);
    assert.equal(row.screening_run_id, null);
    assert.equal((await db.query("select count(*)::int n from private.offerpsp_compliance_checks")).rows[0].n, 11);
    assert.equal((await db.query("select count(*)::int n from public.offerpsp_lead_activities")).rows[0].n, 1);
  } finally { await db.close(); }
});
test("operational activity timestamps do not cancel a claimed screening run", async () => {
  const db = await fixture();
  try {
    const id = await add(db);
    const [job] = await claim(db);
    await db.query("update public.offerpsp_leads set last_activity_at=now()+interval '1 second',updated_at=now()+interval '1 second' where lead_id=$1", [id]);
    const acquired = (await db.query("select public.begin_offerpsp_pre_compliance_run($1,$2) result", [id, job.run_id])).rows[0].result;
    assert.equal(acquired.outcome, "acquired");
    assert.equal(acquired.job.contact_name, acquired.job.name);
    await db.query("update public.offerpsp_leads set last_activity_at=now()+interval '2 seconds',updated_at=now()+interval '2 seconds' where lead_id=$1", [id]);
    assert.equal((await complete(db, job)).outcome, "completed");
  } finally { await db.close(); }
});
test("expired run is fenced before and after a new claim", async () => {
  const db = await fixture();
  try {
    const id = await add(db);
    const [old] = await claim(db);
    await expire(db, id);
    assert.equal((await complete(db, old)).outcome, "stale_or_cancelled");
    const [fresh] = await claim(db);
    assert.notEqual(fresh.run_id, old.run_id); assert.equal(fresh.attempt, 2);
    assert.equal((await complete(db, old)).outcome, "stale_or_cancelled");
    assert.equal((await complete(db, fresh)).outcome, "completed");
    assert.equal((await db.query("select count(*)::int n from public.offerpsp_lead_activities")).rows[0].n, 1);
  } finally { await db.close(); }
});
test("a human hold/clearance or archived/terminal lead is never overwritten by late completion", async () => {
  const db = await fixture();
  try {
    for (const state of ["hold", "cleared", "rejected", "spam", "needs_info", "manual_review", "archived", "closed", "won", "lost"]) {
      const id = await add(db);
      const [job] = await claim(db);
      if (state === "archived") await db.query("update public.offerpsp_leads set record_state='archived' where lead_id=$1", [id]);
      else if (["closed", "won", "lost"].includes(state)) await db.query("update public.offerpsp_leads set status=$2 where lead_id=$1", [id, state]);
      else await db.query("update private.offerpsp_compliance_cases set case_status=$2, summary='Human decision' where lead_id=$1", [id, state]);
      assert.equal((await complete(db, job)).outcome, "stale_or_cancelled", state);
    }
    assert.equal((await db.query("select count(*)::int n from public.offerpsp_lead_activities")).rows[0].n, 0);
  } finally { await db.close(); }
});
test("three crashed attempts stop in manual review with one failure activity, not infinite retries", async () => {
  const db = await fixture();
  try {
    const id = await add(db);
    for (let i = 1; i <= 3; i++) { assert.equal((await claim(db))[0].attempt, i); await expire(db, id); }
    assert.deepEqual(await claim(db), []); assert.deepEqual(await claim(db), []);
    const row = (await db.query("select case_status,summary from private.offerpsp_compliance_cases")).rows[0];
    assert.equal(row.case_status, "manual_review"); assert.match(row.summary, /трёх попыток/);
    assert.equal((await db.query("select count(*)::int n from public.offerpsp_lead_activities")).rows[0].n, 1);
  } finally { await db.close(); }
});
test("staff repeat-click queues once, does not reset a running lease, and cannot reopen a hold", async () => {
  const db = await fixture();
  try {
    const id = await add(db, { caseStatus: "manual_review" });
    const queue = async () => (await db.query("select public.queue_offerpsp_pre_compliance_screening($1) result", [id])).rows[0].result;
    await assert.rejects(queue(), /staff access required/);
    await db.exec("select set_config('test.staff','true',false)");
    assert.equal((await queue()).outcome, "queued");
    assert.equal((await queue()).outcome, "already_running");
    const [job] = await claim(db);
    assert.equal((await queue()).outcome, "already_running");
    assert.equal((await db.query("select screening_run_id from private.offerpsp_compliance_cases")).rows[0].screening_run_id, job.run_id);
    await db.query("update private.offerpsp_compliance_cases set case_status='hold' where lead_id=$1", [id]);
    await assert.rejects(queue(), /explicitly reopened/);
    assert.equal((await db.query("select count(*)::int n from public.offerpsp_lead_activities")).rows[0].n, 1);
  } finally { await db.close(); }
});
test("a completed screening cannot be started again during the five-minute cooldown", async () => {
  const db = await fixture();
  try {
    const id = await add(db, { caseStatus: "manual_review" });
    await db.exec("select set_config('test.staff','true',false)");
    const queue = async () => (await db.query("select public.queue_offerpsp_pre_compliance_screening($1) result", [id])).rows[0].result;
    assert.equal((await queue()).outcome, "queued");
    const [job] = await claim(db);
    assert.equal((await complete(db, job)).outcome, "completed");

    const cooldown = await queue();
    assert.equal(cooldown.outcome, "cooldown");
    assert.ok(cooldown.retry_after_seconds > 0 && cooldown.retry_after_seconds <= 300);
    assert.equal((await db.query("select count(*)::int n from public.offerpsp_lead_activities where activity_type='pre_compliance_requested'")).rows[0].n, 1);

    await db.query("update private.offerpsp_compliance_cases set last_screened_at=now()-interval '6 minutes' where lead_id=$1", [id]);
    assert.equal((await queue()).outcome, "queued");
    assert.equal((await db.query("select count(*)::int n from public.offerpsp_lead_activities where activity_type='pre_compliance_requested'")).rows[0].n, 2);
  } finally { await db.close(); }
});
test("old unfenced worker endpoint is revoked, new endpoint denies clients, modern JWT claims work", async () => {
  const db = await fixture();
  try {
    for (const role of ["anon", "authenticated", "service_role"]) assert.equal((await db.query("select has_function_privilege($1,'public.record_offerpsp_pre_compliance_screening(uuid,jsonb)','EXECUTE') allowed", [role])).rows[0].allowed, false);
    for (const role of ["anon", "authenticated"]) assert.equal((await db.query("select has_function_privilege($1,'public.complete_offerpsp_pre_compliance_run(uuid,uuid,jsonb)','EXECUTE') allowed", [role])).rows[0].allowed, false);
    await assert.rejects(db.query("select public.complete_offerpsp_pre_compliance_run(gen_random_uuid(),gen_random_uuid(),'{}')"), /service access required/);
    await add(db);
    await db.exec(`select set_config('request.jwt.claims','{"role":"service_role"}',false)`);
    assert.equal((await db.query("select public.claim_offerpsp_pre_compliance_jobs(1) jobs")).rows[0].jobs.length, 1);
  } finally { await db.close(); }
});
test("a persistence error rolls back all evidence and receipt; the same run can be retried", async () => {
  const db = await fixture();
  try {
    await add(db); const [job] = await claim(db);
    await assert.rejects(complete(db, job, { ...payload, checks: [...payload.checks, { check_key: "invalid", score: 200 }] }), /check constraint/);
    assert.equal((await db.query("select count(*)::int n from private.offerpsp_compliance_checks")).rows[0].n, 0);
    assert.equal((await db.query("select screening_completed_run_id from private.offerpsp_compliance_cases")).rows[0].screening_completed_run_id, null);
    assert.equal((await complete(db, job)).outcome, "completed");
  } finally { await db.close(); }
});
test("isolated pipeline: claim → public evidence boundary → eleven checks → one fenced completion", async () => {
  const db = await fixture();
  try {
    const id = await add(db);
    await db.query("update public.offerpsp_leads set company_url='https://screening-fixture.org' where lead_id=$1", [id]);
    const [job] = await claim(db);
    const calls = [];
    const fetchEvidence = createEvidenceFetcher({
      resolve: async () => [{ address: "93.184.216.34", family: 4 }],
      request: async (url) => {
        calls.push(url.href);
        return url.hostname === "rdap.org" ? { statusCode: 200, body: '{"events":[{"eventAction":"registration","eventDate":"2020-01-01"}]}' } :
          { statusCode: 200, body: "<title>Synthetic company</title><p>We build tools for merchants who want to improve payment processing and analyse their available payment channels.</p>" };
      },
    });
    const result = await processClaimedCompany(job, { fetchEvidence, complete: ({ payload }) => complete(db, job, payload) });
    assert.equal(result.outcome, "completed");
    assert.equal(calls.length, 2);
    const checks = (await db.query("select check_key,check_status from private.offerpsp_compliance_checks")).rows;
    assert.equal(checks.length, 11);
    assert.equal(checks.find((check) => check.check_key === "website").check_status, "passed");
    assert.equal(checks.find((check) => check.check_key === "sanctions_screen").check_status, "unknown");
    assert.equal((await db.query("select status from public.offerpsp_leads")).rows[0].status, "new");
  } finally { await db.close(); }
});
test("pipeline does not fetch or complete without a live run and never uses a mailbox as website", async () => {
  const db = await fixture();
  try {
    await add(db); const [job] = await claim(db);
    const options = { fetchEvidence: async () => { throw new Error("Unexpected outbound request"); }, complete: ({ payload }) => complete(db, job, payload) };
    await assert.rejects(processClaimedCompany({ ...job, run_id: null }, options), /claimed screening run/);
    await assert.rejects(processClaimedCompany({ ...job, lease_until: "2000-01-01" }, options), /lease expired/);
    assert.equal((await processClaimedCompany({ ...job, work_email: "user@gmail.com" }, options)).outcome, "completed");
  } finally { await db.close(); }
});
test("lead edits during collection fence the old snapshot; disabled module cannot accept a result", async () => {
  const db = await fixture();
  try {
    const id = await add(db); const [job] = await claim(db);
    await db.query("update public.offerpsp_leads set company_url='https://changed.org' where lead_id=$1", [id]);
    assert.equal((await complete(db, job)).outcome, "stale_or_cancelled");
    await expire(db, id); const [fresh] = await claim(db);
    await db.exec("select set_config('test.module_enabled','false',false)");
    assert.equal((await complete(db, fresh)).outcome, "module_disabled");
    assert.equal((await db.query("select count(*)::int n from public.offerpsp_lead_activities")).rows[0].n, 0);
  } finally { await db.close(); }
});
test("authenticated handler + actual SQL: one dispatch, busy receipt, completion and replay without re-fetch", async () => {
  const db = await fixture();
  try {
    await add(db);
    await db.exec("select set_config('request.jwt.claim.role','service_role',false)");
    const rpc = async (name, args) => {
      const signatures = {
        claim_offerpsp_pre_compliance_jobs: ["p_limit"],
        begin_offerpsp_pre_compliance_run: ["p_lead_id", "p_run_id"],
        complete_offerpsp_pre_compliance_run: ["p_lead_id", "p_run_id", "p_payload"],
      };
      const fields = signatures[name]; assert.ok(fields);
      return (await db.query(`select public.${name}(${fields.map((_, i) => `$${i + 1}`).join(",")}) result`, fields.map((key) => args[key]))).rows[0].result;
    };
    let started, release, processed = 0;
    const entered = new Promise((resolve) => { started = resolve; });
    const hold = new Promise((resolve) => { release = resolve; });
    const token = "test-only-worker-key-not-a-secret-123456";
    const worker = createCompanyScreeningWorker({ env: { OFFERPSP_SCREENING_WORKER_ENABLED: "true", OFFERPSP_SCREENING_WORKER_TOKEN: token }, rpc,
      processJob: async (job, options) => { processed++; started(); await hold; return processClaimedCompany(job, options); },
    });
    const request = async (body) => {
      const res = { setHeader() {}, status(code) { this.code = code; return this; }, json(value) { this.body = value; return this; } };
      await worker({ method: "POST", headers: { authorization: `Bearer ${token}` }, body }, res);
      return res;
    };
    const claimed = await request({ action: "claim" });
    assert.equal(claimed.code, 200);
    const body = { action: "process", ...claimed.body.jobs[0] };
    const pending = request(body); await entered;
    assert.equal((await request(body)).body.outcome, "in_progress");
    release(); assert.equal((await pending).body.outcome, "completed");
    assert.equal((await request(body)).body.outcome, "already_completed");
    assert.equal(processed, 1);
    assert.equal((await db.query("select count(*)::int n from public.offerpsp_lead_activities")).rows[0].n, 1);
    for (const role of ["anon", "authenticated"]) assert.equal((await db.query("select has_function_privilege($1,'public.begin_offerpsp_pre_compliance_run(uuid,uuid)','EXECUTE') allowed", [role])).rows[0].allowed, false);
  } finally { await db.close(); }
});
test("rollback refuses active runs, then restores original RPC privileges without deleting evidence", async () => {
  const db = await fixture();
  try {
    const rollback = await readFile(new URL("../../supabase/rollback/20260916_screening_worker_v2.sql", import.meta.url), "utf8");
    await add(db); const [job] = await claim(db);
    await assert.rejects(db.exec(rollback), /resolve active v2 runs/);
    await db.exec("rollback");
    await complete(db, job);
    await db.exec(rollback);
    assert.equal((await db.query("select has_function_privilege('service_role','public.record_offerpsp_pre_compliance_screening(uuid,jsonb)','EXECUTE') allowed")).rows[0].allowed, true);
    assert.equal((await db.query("select has_function_privilege('service_role','public.complete_offerpsp_pre_compliance_run(uuid,uuid,jsonb)','EXECUTE') allowed")).rows[0].allowed, false);
    assert.equal((await db.query("select count(*)::int n from private.offerpsp_compliance_checks")).rows[0].n, 11);
    assert.equal((await db.query("select count(*)::int n from public.offerpsp_lead_activities")).rows[0].n, 1);
    await add(db);
    assert.deepEqual(await claim(db), []); // Original post-selection/manual-only claim policy.
  } finally { await db.close(); }
});
