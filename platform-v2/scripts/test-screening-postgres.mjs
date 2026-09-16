import assert from "node:assert/strict";
import { spawn } from "node:child_process";
import { randomUUID } from "node:crypto";
import { initializeScreeningFixture } from "./screening-test-fixture.mjs";
import { buildCompanyScreening } from "../api/_lib/company-screening.mjs";

// Uses an existing local image; no ports, host mounts, production URLs or persisted volumes.
function docker(args, stdin = "", onOutput = () => {}) {
  return new Promise((resolve, reject) => {
    const child = spawn("docker", args, { stdio: ["pipe", "pipe", "pipe"] });
    let stdout = "", stderr = "";
    const timer = setTimeout(() => child.kill("SIGTERM"), 30000);
    child.stdout.on("data", (data) => { stdout += data; onOutput(stdout); });
    child.stderr.on("data", (data) => { stderr += data; });
    child.on("error", (error) => { clearTimeout(timer); reject(error); });
    child.on("close", (code) => { clearTimeout(timer); code === 0 ? resolve(stdout.trim()) : reject(new Error(`Docker test command failed (${code}): ${stderr.slice(-1500)}`)); });
    child.stdin.on("error", () => {});
    child.stdin.end(stdin);
  });
}
const name = `offerpsp-screening-test-${randomUUID()}`;
let container;
try {
  container = await docker(["run", "--pull=never", "--rm", "-d", "--network", "none", "--tmpfs", "/var/lib/postgresql/data", "--env", "POSTGRES_HOST_AUTH_METHOD=trust", "--name", name, "postgres:15-alpine"]);
  assert.match(container, /^[0-9a-f]{64}$/);
  const psql = (sql, onOutput) => docker(["exec", "-i", container, "psql", "-h", "127.0.0.1", "-U", "postgres", "-d", "postgres", "-qAt", "-v", "ON_ERROR_STOP=1"], sql, onOutput);
  let ready = false;
  for (let i = 0; i < 30; i++) {
    // TCP excludes the socket-only temporary server used by the image during initdb.
    try { await docker(["exec", container, "pg_isready", "-h", "127.0.0.1", "-U", "postgres"]); ready = true; break; }
    catch { await new Promise((resolve) => setTimeout(resolve, 200)); }
  }
  assert.ok(ready, "Isolated PostgreSQL did not become ready");
  await initializeScreeningFixture({ exec: psql });
  await psql(`insert into public.offerpsp_leads(lead_id,company) values
    ('00000000-0000-4000-8000-000000000001','Synthetic A'),('00000000-0000-4000-8000-000000000002','Synthetic B');
    insert into private.offerpsp_compliance_cases(lead_id) select lead_id from public.offerpsp_leads;`);
  const service = `set "request.jwt.claim.role" = 'service_role';`;
  let signalLocked, firstDone = false;
  const locked = new Promise((resolve) => { signalLocked = resolve; });
  const first = psql(`begin; ${service} select public.claim_offerpsp_pre_compliance_jobs(1); select pg_sleep(3); commit;`, (output) => {
    if (output.includes('"run_id"')) signalLocked();
  }).finally(() => { firstDone = true; });
  await Promise.race([locked, first.then(() => { throw new Error("Worker ended before lock signal"); })]);
  const second = await psql(`${service} select public.claim_offerpsp_pre_compliance_jobs(1);`);
  assert.equal(firstDone, false, "Second worker waited for locked job rather than skipping it");
  const firstOutput = await first;
  const [jobA] = JSON.parse(firstOutput.split("\n").find((line) => line.startsWith("[")));
  const [jobB] = JSON.parse(second);
  assert.notEqual(jobA.lead_id, jobB.lead_id);
  console.log("PASS concurrent claims: distinct jobs; SKIP LOCKED does not wait");
  const begin = `${service} select public.begin_offerpsp_pre_compliance_run('${jobA.lead_id}','${jobA.run_id}');`;
  const starts = await Promise.all([psql(begin), psql(begin)]);
  assert.deepEqual(starts.map((s) => JSON.parse(s).outcome).sort(), ["acquired", "in_progress"]);
  console.log("PASS concurrent dispatch: one collector owns the run");
  const payload = JSON.stringify(buildCompanyScreening({ company: "Synthetic A" }, {}, {}, new Date("2026-09-16T12:00:00Z"))).replaceAll("'", "''");
  const complete = `${service} select public.complete_offerpsp_pre_compliance_run('${jobA.lead_id}','${jobA.run_id}','${payload}'::jsonb);`;
  const receipts = await Promise.all([psql(complete), psql(complete)]);
  assert.deepEqual(receipts.map((s) => JSON.parse(s).outcome).sort(), ["already_completed", "completed"]);
  assert.equal(await psql("select count(*) from public.offerpsp_lead_activities where activity_type='pre_compliance_screened'"), "1");
  assert.equal(await psql("select count(*) from private.offerpsp_compliance_checks"), "8");
  console.log("PASS concurrent completion: one receipt/activity and eight checks");
  console.log("VERIFIED isolated PostgreSQL 15 concurrency; production untouched");
} finally {
  if (container && /^[0-9a-f]{64}$/.test(container)) {
    await docker(["stop", "--time", "2", container]);
    console.log("Isolated test container stopped; ephemeral test data discarded");
  }
}
