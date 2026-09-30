import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { spawn } from "node:child_process";
import { randomUUID } from "node:crypto";

function docker(args, stdin = "", timeout = 45000) {
  return new Promise((resolve, reject) => {
    const child = spawn("docker", args, { stdio: ["pipe", "pipe", "pipe"] });
    let stdout = "", stderr = "";
    const timer = setTimeout(() => child.kill("SIGTERM"), timeout);
    child.stdout.on("data", (chunk) => { stdout += chunk; });
    child.stderr.on("data", (chunk) => { stderr += chunk; });
    child.on("error", (error) => { clearTimeout(timer); reject(error); });
    child.on("close", (code) => { clearTimeout(timer); code === 0 ? resolve(stdout.trim()) : reject(new Error((stderr || stdout).slice(-2000))); });
    child.stdin.on("error", () => {}); child.stdin.end(stdin);
  });
}

const migration = await readFile(new URL("../../supabase/migrations/20260916203638_offerpsp_research_screening_jobs.sql", import.meta.url), "utf8");
const eventMigration = await readFile(new URL("../../supabase/migrations/20260916203639_offerpsp_research_screening_events.sql", import.meta.url), "utf8");
const container = await docker(["run", "--pull=never", "--rm", "-d", "--network", "none", "--tmpfs", "/var/lib/postgresql/data", "--env", "POSTGRES_HOST_AUTH_METHOD=trust", "--name", `offerpsp-research-pg-${randomUUID()}`, "postgres:15-alpine"]);
const psql = (sql) => docker(["exec", "-i", container, "psql", "-h", "127.0.0.1", "-U", "postgres", "-d", "postgres", "-qAt", "-v", "ON_ERROR_STOP=1"], sql);
const service = (sql) => psql(`set role service_role; set "request.jwt.claim.role"='service_role'; ${sql}`);
try {
  let ready = false;
  for (let i = 0; i < 40; i++) { try { await docker(["exec", container, "pg_isready", "-h", "127.0.0.1", "-U", "postgres"]); ready = true; break; } catch { await new Promise((resolve) => setTimeout(resolve, 200)); } }
  assert.ok(ready, "PostgreSQL not ready");
  await psql(`
    create role anon; create role authenticated; create role service_role;
    create schema private; create schema auth;
    create table auth.users(id uuid primary key);
    create function auth.uid() returns uuid language sql stable as 'select null::uuid';
    create function public.is_offerpsp_staff() returns boolean language sql as 'select coalesce(current_setting(''test.staff'',true),''false'')=''true''';
    create function private.offerpsp_module_enabled(text) returns boolean language sql as 'select coalesce(current_setting(''test.module_enabled'',true),''true'')<>''false''';
    create table private.offerpsp_entity_audit(id uuid primary key default gen_random_uuid(),entity_type text,entity_id text,action_type text,actor_user_id uuid,before_state jsonb,after_state jsonb,created_at timestamptz default now());
    create table public.casino_leads(id bigserial primary key,name text not null,website text,description text,geo text,license text,software text,affiliate_program text,sphere text,email text,contact_name text,telegram text,source text,contact_status text default 'not_contacted',record_state text not null default 'active');
    create table public.psp_providers(id bigserial primary key,name text not null,website text,geo text,specialization text,risk_appetite text,notes text,email text,contact_name text,telegram text,supported_countries text[] default '{}',payment_methods text[] default '{}',supported_currencies text[] default '{}',supported_verticals text[] default '{}',capabilities_source text,provider_status text default 'research',record_state text not null default 'active');
    insert into public.casino_leads(name,website) values('Historical casino','https://historical.invalid');
  `);
  await psql(migration);
  await assert.rejects(
    () => psql("set role service_role; select count(*) from private.offerpsp_research_screening_jobs"),
    /permission denied/,
    "service role must use fenced RPCs rather than direct table access",
  );
  await psql(`
    create schema vault; create schema extensions; create schema net;
    create table vault.decrypted_secrets(id uuid primary key,decrypted_secret text);
    create table private.offerpsp_screening_dispatch_config(singleton boolean primary key,enabled boolean not null,secret_id uuid,updated_at timestamptz default now());
    insert into private.offerpsp_screening_dispatch_config values(true,false,null,now());
    create table net.requests(id bigserial primary key,url text,body jsonb,headers jsonb);
    create function extensions.hmac(bytea,bytea,text) returns bytea language sql immutable as 'select decode(repeat(''00'',32),''hex'')';
    create function net.http_post(url text,body jsonb,headers jsonb,timeout_milliseconds integer) returns bigint language plpgsql as $$
    declare v_id bigint; begin insert into net.requests(url,body,headers) values(url,body,headers) returning id into v_id; return v_id; end $$;
  `);
  await psql(eventMigration);
  assert.equal(await psql("select count(*) from private.offerpsp_research_screening_jobs"), "0", "migration must not backfill historical rows");
  const casinoId = await psql("insert into public.casino_leads(name,website,email,sphere) values('New casino','https://example.com','ops@example.com','licensed gambling') returning id");
  const pspId = await psql("insert into public.psp_providers(name,website,supported_countries) values('New PSP','https://example.org',array['EU']) returning id");
  await psql("insert into public.psp_providers(name,website,provider_status) values('Rejected PSP','https://rejected.example','rejected')");
  await psql("insert into public.casino_leads(name,website,contact_status) values('Paused casino','https://paused.invalid','paused')");
  await psql("insert into public.psp_providers(name,website,provider_status) values('Inactive PSP','https://inactive.invalid','inactive')");
  assert.equal(await psql("select count(*) from private.offerpsp_research_screening_jobs"), "2");
  assert.equal(await psql("select count(*) from private.offerpsp_research_screening_dispatches where outcome='unconfigured'"), "2");
  await psql(`update public.casino_leads set email='new@example.com' where id=${casinoId}`);
  assert.equal(await psql(`select count(*) from private.offerpsp_research_screening_jobs where entity_type='casino' and entity_id=${casinoId}`), "1", "contact edits must not enqueue");

  const [claimA, claimB] = await Promise.all([
    service("select public.claim_offerpsp_research_screening_jobs(1)"),
    service("select public.claim_offerpsp_research_screening_jobs(1)"),
  ]);
  const claimed = [...JSON.parse(claimA), ...JSON.parse(claimB)];
  assert.equal(new Set(claimed.map((item) => item.job_id)).size, 2, "concurrent workers must not claim the same job");
  console.log("PASS isolated PostgreSQL concurrency: two jobs claimed exactly once");

  const casinoJobId = await psql(`select id from private.offerpsp_research_screening_jobs where entity_type='casino' and entity_id=${casinoId}`);
  let casinoJob = claimed.find((item) => item.job_id === casinoJobId);
  assert.ok(casinoJob);
  await psql(`update private.offerpsp_research_screening_jobs set lease_until=now()-interval '1 second' where id='${casinoJob.job_id}'`);
  let receipt = JSON.parse(await service(`select public.complete_offerpsp_research_screening_run('${casinoJob.job_id}','${casinoJob.run_id}','{"summary":"late owner"}'::jsonb)`));
  assert.equal(receipt.outcome, "stale_or_cancelled");
  receipt = JSON.parse(await service(`select public.fail_offerpsp_research_screening_run('${casinoJob.job_id}','${casinoJob.run_id}','collector_failed')`));
  assert.equal(receipt.outcome, "stale_or_cancelled");
  assert.equal(await psql(`select status||':'||run_id||':'||attempts from private.offerpsp_research_screening_jobs where id='${casinoJob.job_id}'`), `running:${casinoJob.run_id}:1`, "expired owner must not mutate its job");
  const reclaimed = JSON.parse(await service("select public.claim_offerpsp_research_screening_jobs(1)"));
  assert.equal(reclaimed.length, 1);
  assert.equal(reclaimed[0].job_id, casinoJob.job_id);
  assert.notEqual(reclaimed[0].run_id, casinoJob.run_id);
  casinoJob = reclaimed[0];
  assert.equal(await psql(`select attempts from private.offerpsp_research_screening_jobs where id='${casinoJob.job_id}'`), "2");
  console.log("PASS lease recovery: expired owner was fenced and the same job was reclaimed with a new run");

  receipt = JSON.parse(await service(`select public.begin_offerpsp_research_screening_run('${casinoJob.job_id}','${casinoJob.run_id}')`));
  assert.equal(receipt.outcome, "acquired");
  assert.equal(receipt.job.entity_type, "casino");
  await psql(`update public.casino_leads set website='https://changed.example' where id=${casinoId}`);
  receipt = JSON.parse(await service(`select public.complete_offerpsp_research_screening_run('${casinoJob.job_id}','${casinoJob.run_id}','{"summary":"must not persist"}'::jsonb)`));
  assert.equal(receipt.outcome, "stale_or_cancelled");
  assert.equal(await psql(`select status||':'||coalesce(last_error_code,'') from private.offerpsp_research_screening_jobs where id='${casinoJob.job_id}'`), "skipped:stale_or_cancelled");
  console.log("PASS material-change fence: stale evidence was skipped, not persisted");

  const pspJobId = await psql(`select id from private.offerpsp_research_screening_jobs where entity_type='psp' and entity_id=${pspId}`);
  const pspJob = claimed.find((item) => item.job_id === pspJobId);
  assert.ok(pspJob);
  receipt = JSON.parse(await service(`select public.begin_offerpsp_research_screening_run('${pspJob.job_id}','${pspJob.run_id}')`));
  assert.equal(receipt.outcome, "acquired");
  await psql(`update public.psp_providers set record_state='archived' where id=${pspId}`);
  receipt = JSON.parse(await service(`select public.complete_offerpsp_research_screening_run('${pspJob.job_id}','${pspJob.run_id}','{"summary":"must not persist after archive"}'::jsonb)`));
  assert.equal(receipt.outcome, "stale_or_cancelled");
  assert.equal(await psql(`select status||':'||coalesce(last_error_code,'') from private.offerpsp_research_screening_jobs where id='${pspJob.job_id}'`), "skipped:stale_or_cancelled");
  await psql(`update public.psp_providers set record_state='active' where id=${pspId}`);
  console.log("PASS archive fence: late research evidence was skipped, not persisted");

  const auditBefore = Number(await psql(`select count(*) from private.offerpsp_entity_audit where entity_type='research_casino' and entity_id='${casinoId}' and action_type='company_screening_requested'`));
  const reruns = await Promise.all([
    psql(`set "test.staff"='true'; select public.queue_offerpsp_research_screening('casino',${casinoId});`),
    psql(`set "test.staff"='true'; select public.queue_offerpsp_research_screening('casino',${casinoId});`),
  ]);
  assert.deepEqual(reruns.map((value) => JSON.parse(value).outcome).sort(), ["already_queued", "queued"]);
  assert.equal(await psql(`select count(*) from private.offerpsp_research_screening_jobs where entity_type='casino' and entity_id=${casinoId}`), "2");
  assert.equal(Number(await psql(`select count(*) from private.offerpsp_entity_audit where entity_type='research_casino' and entity_id='${casinoId}' and action_type='company_screening_requested'`)) - auditBefore, 1);
  console.log("PASS concurrent explicit rerun: one job and one audit entry; duplicate click reused active work");

  await psql(`insert into vault.decrypted_secrets values('00000000-0000-4000-8000-000000000099','${"a".repeat(64)}'); update private.offerpsp_screening_dispatch_config set enabled=true,secret_id='00000000-0000-4000-8000-000000000099';`);
  await psql(`set "test.staff"='true'; select public.queue_offerpsp_research_screening('psp',${pspId});`);
  assert.equal(await psql("select count(*) from net.requests where body='{" + "\"event\": \"research_screening_ready\"" + "}'::jsonb"), "1");
  assert.equal(await psql("select count(*) from private.offerpsp_research_screening_dispatches where outcome='queued'"), "1");
  const authorization = await psql("select headers->>'Authorization' from net.requests order by id desc limit 1");
  assert.match(authorization, /^Bearer [A-Za-z0-9_-]+\.[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+$/);
  assert.equal(authorization.includes("\n"), false);
  assert.equal(authorization.includes("\\n"), false);
  console.log("PASS event wake-up: fixed payload and newline-free ticket dispatched once; 12-hour queue remains fallback");

  await assert.rejects(() => psql(`select public.get_offerpsp_research_screening('casino',${casinoId})`), /OfferPSP staff access required/);
  const workspace = JSON.parse(await psql(`set "test.staff"='true'; select public.get_offerpsp_research_screening('casino',${casinoId})`));
  assert.equal(workspace.active_job.status, "pending");
  assert.equal(workspace.current_input_hash, undefined);
  assert.equal(workspace.active_job.input_hash, undefined);
  assert.equal(workspace.active_job.run_id, undefined);
  assert.equal(workspace.active_job.lease_until, undefined);
  console.log("PASS staff-only read projection; production untouched");
} finally {
  await docker(["stop", "--time", "2", container]);
  console.log("Isolated PostgreSQL removed");
}
