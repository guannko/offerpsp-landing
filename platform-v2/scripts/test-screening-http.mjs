import assert from "node:assert/strict";
import { spawn } from "node:child_process";
import { randomBytes, randomUUID } from "node:crypto";
import { createServer } from "node:http";
import { initializeScreeningFixture } from "./screening-test-fixture.mjs";
import { buildScreeningWorkflow } from "./screening-workflow.mjs";
import { createCompanyScreeningWorker } from "../api/_lib/company-screening-worker.mjs";
import { processClaimedCompany } from "../api/_lib/company-screening-runner.mjs";

// Real HTTP + PostgreSQL + public evidence collection. No production secrets or writes.
// Optional local n8n executes the same generated graph with test-only loopback transport.
const withN8n = process.argv.includes("--n8n");
const secretRedactions = [];
const redact = (text) => secretRedactions.reduce((result, secret) => result.replaceAll(secret, "[redacted]"), text).replace(/Bearer\s+[^"\s]+/g, "Bearer [redacted]");
function docker(args, stdin = "", timeout = 45000) {
  return new Promise((resolve, reject) => {
    const child = spawn("docker", args, { stdio: ["pipe", "pipe", "pipe"] });
    let stdout = "", stderr = "";
    const timer = setTimeout(() => child.kill("SIGTERM"), timeout);
    child.stdout.on("data", (chunk) => { stdout += chunk; });
    child.stderr.on("data", (chunk) => { stderr += chunk; });
    child.on("error", (error) => { clearTimeout(timer); reject(error); });
    child.on("close", (code) => {
      clearTimeout(timer);
      // Redact the synthetic secret even if n8n includes request options in an error.
      code === 0 ? resolve(stdout.trim()) : reject(new Error(`Isolated Docker command failed (${code}): ${redact(stderr || stdout).slice(-1800)}`));
    });
    child.stdin.on("error", () => {});
    child.stdin.end(stdin);
  });
}
const containers = [];
let server;
try {
  const pg = await docker(["run", "--pull=never", "--rm", "-d", "--network", "none", "--tmpfs", "/var/lib/postgresql/data", "--env", "POSTGRES_HOST_AUTH_METHOD=trust", "--name", `offerpsp-http-pg-${randomUUID()}`, "postgres:15-alpine"]);
  assert.match(pg, /^[0-9a-f]{64}$/); containers.push(pg);
  const psql = (sql) => docker(["exec", "-i", pg, "psql", "-h", "127.0.0.1", "-U", "postgres", "-d", "postgres", "-qAt", "-v", "ON_ERROR_STOP=1"], sql);
  let ready = false;
  for (let i = 0; i < 40; i++) {
    try { await docker(["exec", pg, "pg_isready", "-h", "127.0.0.1", "-U", "postgres"]); ready = true; break; }
    catch { await new Promise((resolve) => setTimeout(resolve, 200)); }
  }
  assert.ok(ready, "PostgreSQL not ready");
  await initializeScreeningFixture({ exec: psql });
  const seed = (id) => psql(`insert into public.offerpsp_leads(lead_id,company,company_url) values ('${id}','Synthetic HTTP Test','https://protocol-s.com/'); insert into private.offerpsp_compliance_cases(lead_id) values ('${id}');`);
  const lead = "00000000-0000-4000-8000-000000000011";
  await seed(lead);
  const quote = (value) => `'${String(value).replaceAll("'", "''")}'`;
  const rpcNames = new Set(["claim_offerpsp_pre_compliance_jobs", "begin_offerpsp_pre_compliance_run", "complete_offerpsp_pre_compliance_run"]);
  const rpc = async (name, args) => {
    assert.ok(rpcNames.has(name));
    const values = name.startsWith("claim_") ? "1" : `${quote(args.p_lead_id)}::uuid,${quote(args.p_run_id)}::uuid${name.startsWith("complete_") ? `,${quote(JSON.stringify(args.p_payload))}::jsonb` : ""}`;
    // Fresh connection for each RPC, with the same server-role claim used by PostgREST.
    return JSON.parse(await psql(`set "request.jwt.claim.role"='service_role'; select public.${name}(${values});`));
  };
  const token = randomBytes(32).toString("hex");
  secretRedactions.push(token);
  let collections = 0;
  const events = [];
  const handler = createCompanyScreeningWorker({
    env: { OFFERPSP_SCREENING_WORKER_ENABLED: "true", OFFERPSP_SCREENING_WORKER_TOKEN: token }, rpc,
    processJob: (job, options) => { collections++; return processClaimedCompany(job, options); },
  });
  server = createServer(async (request, response) => {
    response.status = (code) => { response.statusCode = code; return response; };
    response.json = (body) => { events.push({ status: response.statusCode, outcome: body.outcome, jobs: body.jobs }); response.end(JSON.stringify(body)); };
    try {
      let body = "";
      for await (const chunk of request) { body += chunk; if (body.length > 4096) throw new Error("Too large"); }
      request.body = JSON.parse(body || "{}");
      await handler(request, response);
    } catch { response.statusCode = 400; response.end('{"error":"Invalid request"}'); }
  });
  await new Promise((resolve) => server.listen(0, "127.0.0.1", resolve));
  const port = server.address().port;
  const endpoint = `http://127.0.0.1:${port}/api/platform-modules?module=company-screening-worker`;
  const post = async (body, authorized = true) => {
    const response = await fetch(endpoint, { method: "POST", headers: { "content-type": "application/json", ...(authorized ? { authorization: `Bearer ${token}` } : {}) }, body: JSON.stringify(body), signal: AbortSignal.timeout(45000) });
    return { status: response.status, body: await response.json() };
  };
  assert.equal((await post({ action: "claim" }, false)).status, 401);
  assert.equal((await post({ action: "claim", company_url: "https://example.com/" })).status, 400);
  assert.equal(await psql("select sum(screening_attempts) from private.offerpsp_compliance_cases"), "0");
  console.log("PASS real HTTP: unauthorized and injected-input requests cannot claim jobs");
  const claimed = await post({ action: "claim" });
  assert.equal(claimed.status, 200);
  const job = claimed.body.jobs[0];
  assert.equal(job.lead_id, lead);
  assert.deepEqual(Object.keys(job).sort(), ["lead_id", "run_id"]);
  const completed = await post({ action: "process", ...job });
  assert.equal(completed.status, 200);
  assert.equal(completed.body.outcome, "completed");
  const evidence = JSON.parse(await psql(`select k.evidence from private.offerpsp_compliance_checks k join private.offerpsp_compliance_cases c on c.id=k.case_id where c.lead_id='${lead}' and k.check_key='website'`));
  assert.equal(evidence.http_status, 200, `Public evidence fetch failed: ${evidence.fetch_error}`);
  assert.equal(evidence.content_available, true);
  console.log(`PASS real HTTP → PostgreSQL → public website → saved evidence (HTTP ${evidence.http_status})`);
  const replay = await post({ action: "process", ...job });
  assert.equal(replay.body.outcome, "already_completed");
  assert.equal(collections, 1);
  assert.equal(await psql("select count(*) from public.offerpsp_lead_activities where activity_type='pre_compliance_screened'"), "1");
  assert.equal(await psql("select count(*) from private.offerpsp_compliance_checks"), "8");
  console.log("PASS HTTP replay: no second collection, activity or check set");
  if (withN8n) {
    const n8n = await docker(["run", "--pull=never", "--rm", "-d", "--tmpfs", "/home/node/.n8n:uid=1000,gid=1000,mode=0700", "--env", "N8N_DIAGNOSTICS_ENABLED=false", "--env", "N8N_VERSION_NOTIFICATIONS_ENABLED=false", "--env", "N8N_ENFORCE_SETTINGS_FILE_PERMISSIONS=true", "--env", "N8N_RUNNERS_ENABLED=false", "--entrypoint", "node", "--name", `offerpsp-http-n8n-${randomUUID()}`, "n8nio/n8n:latest", "-e", "setInterval(()=>{},10000)"]);
    assert.match(n8n, /^[0-9a-f]{64}$/); containers.push(n8n);
    const version = await docker(["exec", n8n, "n8n", "--version"]);
    console.log(`Isolated n8n version: ${version}`);
    const credential = { id: "testScreeningOnly", name: "Ephemeral screening test", type: "httpHeaderAuth", data: { name: "Authorization", value: `Bearer ${token}` } };
    const workflow = buildScreeningWorkflow({ endpoint: "https://isolated.invalid/api/platform-modules?module=company-screening-worker", credential });
    workflow.id = "screeningHttpE2E";
    // Docker Desktop's host gateway reaches the loopback listener. Production graph stays HTTPS.
    for (const node of workflow.nodes) if (node.type.endsWith(".httpRequest")) node.parameters.url = endpoint.replace("127.0.0.1", "host.docker.internal");
    const put = (path, data) => docker(["exec", "-i", n8n, "node", "-e", "let data='';process.stdin.on('data',c=>data+=c);process.stdin.on('end',()=>require('fs').writeFileSync(process.argv[1],data,{mode:0o600}));", path], JSON.stringify(data));
    await put("/tmp/test-credential.json", [credential]);
    await put("/tmp/test-workflow.json", [workflow]);
    console.log("Importing ephemeral n8n credential and inactive test graph");
    await docker(["exec", n8n, "n8n", "import:credentials", "--input=/tmp/test-credential.json"], "", 60000);
    await docker(["exec", n8n, "n8n", "import:workflow", "--input=/tmp/test-workflow.json"], "", 60000);
    await seed("00000000-0000-4000-8000-000000000012");
    const before = events.length;
    const result = await docker(["exec", n8n, "n8n", "execute", "--id=screeningHttpE2E", "--rawOutput"], "", 90000);
    assert.ok(result.includes('"completed"'), "n8n execution did not return completed receipt");
    assert.ok(events.slice(before).some((event) => event.outcome === "completed"), "n8n never completed the HTTP run");
    assert.equal(collections, 2);
    assert.equal(await psql("select count(*) from public.offerpsp_lead_activities where activity_type='pre_compliance_screened'"), "2");
    assert.equal(await psql("select count(*) from private.offerpsp_compliance_checks"), "16");
    console.log("PASS actual n8n graph: credential → claim → process → verified receipt; second synthetic job saved");
  }
  console.log("VERIFIED isolated transport test; production untouched. PostgREST/Vercel and live n8n remain separate release checks.");
} finally {
  if (server) { server.closeAllConnections(); await new Promise((resolve) => server.close(resolve)); }
  for (const id of containers.reverse()) await docker(["stop", "--time", "2", id]);
  console.log("Isolated containers removed; temporary test databases and credentials discarded");
}
