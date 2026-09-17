import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { test } from "node:test";
import { collectClaimedResearchEvidence } from "../api/_lib/company-screening-runner.mjs";

const job = {
  job_id: "00000000-0000-4000-8000-000000000010",
  run_id: "00000000-0000-4000-8000-000000000011",
  entity_type: "psp", entity_id: 42, lease_until: "2099-01-01T00:00:00Z",
  company: "Synthetic PSP", company_url: "https://example.com", work_email: "ops@example.com",
};

test("research collector preserves research identity and reuses bounded evidence preparation", async () => {
  const urls = [];
  const result = await collectClaimedResearchEvidence(job, { fetchEvidence: async (url, options) => {
    urls.push({ url, options });
    return options?.kind === "rdap" ? { statusCode: 404, body: {}, error: "not_found" } : { statusCode: 200, body: "<title>Synthetic PSP</title><p>We provide payment orchestration services for merchants worldwide.</p>" };
  }, now: () => new Date("2026-09-16T20:00:00Z") });
  assert.equal(result.job_id, job.job_id);
  assert.equal(result.run_id, job.run_id);
  assert.equal(result.payload.risk_level, "unknown");
  assert.match(result.payload.summary, /не KYB/i);
  assert.equal(urls.length, 2);
});

test("research collector rejects zero and negative entity identifiers", async () => {
  for (const entity_id of [0, -1]) {
    await assert.rejects(() => collectClaimedResearchEvidence({ ...job, entity_id }), /claimed research screening run/i);
  }
});

test("research jobs are insert-only automatic, staff-only readable and never backfilled", async () => {
  const core = await readFile(new URL("../../supabase/migrations/20260916203638_offerpsp_research_screening_jobs.sql", import.meta.url), "utf8");
  assert.match(core, /after insert on public\.casino_leads/);
  assert.match(core, /after insert on public\.psp_providers/);
  assert.doesNotMatch(core, /insert into private\.offerpsp_research_screening_jobs[\s\S]{0,200}\bselect\b/i);
  assert.match(core, /revoke all on function public\.get_offerpsp_research_screening\(text,bigint\) from public,anon,service_role/);
  assert.match(core, /grant execute on function public\.get_offerpsp_research_screening\(text,bigint\) to authenticated/);
});

test("event wake-up carries no entity, job or company data", async () => {
  const events = await readFile(new URL("../../supabase/migrations/20260916203639_offerpsp_research_screening_events.sql", import.meta.url), "utf8");
  assert.match(events, /body := '\{"event":"research_screening_ready"\}'::jsonb/);
  assert.match(events, /'Authorization','Bearer '\|\|v_ticket/);
  assert.match(events, /'\+\/' \|\| chr\(10\)/);
  assert.doesNotMatch(events, /E'\+\/\\\\n'/);
  assert.doesNotMatch(events, /body := jsonb_build_object/i);
  assert.match(events, /interval|12-hour|12-hour worker sweep/i);
});
