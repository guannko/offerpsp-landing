import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";

const migration = await readFile(new URL("../../supabase/migrations/20260916141150_offerpsp_intake_screening_queue.sql", import.meta.url), "utf8");
const base = await readFile(new URL("../../supabase/migrations/20260806123857_offerpsp_pre_compliance_module.sql", import.meta.url), "utf8");
const helpers = await readFile(new URL("../../supabase/migrations/20260731_offerpsp_private_supply.sql", import.meta.url), "utf8");
const review = await readFile(new URL("../../supabase/migrations/20260806164710_offerpsp_manual_compliance_review.sql", import.meta.url), "utf8");
const foundation = await readFile(new URL("../../supabase/migrations/20260730_offerpsp_platform_foundation.sql", import.meta.url), "utf8");
function definition(sql, start, end) {
  const from = sql.indexOf(start);
  assert.notEqual(from, -1, start);
  const to = sql.indexOf(end, from);
  assert.notEqual(to, -1, end);
  return sql.slice(from, to + end.length);
}
const schema = `
create role anon; create role authenticated; create role service_role;
create schema private;
create schema auth; create table auth.users(id uuid primary key);
create function public.is_offerpsp_staff() returns boolean language sql as 'select coalesce(current_setting(''test.staff'', true), ''false'') = ''true''';
create function private.offerpsp_module_enabled(text) returns boolean language sql as 'select coalesce(current_setting(''test.module_enabled'', true), ''true'') <> ''false''';
create table public.offerpsp_leads (
 lead_id uuid primary key, record_state text default 'active', status text default 'new',
 company text, name text, work_email text, telegram text, company_url text, vertical text,
 monthly_volume text, expected_monthly_volume numeric, geos text, target_geos text[],
 methods text, requested_methods text[], requested_currencies text[], requested_flows text[],
 license_status text, license_jurisdiction text, license_number text, license_evidence_url text,
 qualification_notes text, details text, source text, submitted_at timestamptz default now()
);`;
export async function initializeScreeningFixture(db) {
  await db.exec(schema);
  for (const name of ["offerpsp_compliance_cases", "offerpsp_compliance_checks"]) await db.exec(definition(base, `create table if not exists private.${name}`, "\n);") );
  await db.exec(definition(foundation, "create table if not exists public.offerpsp_lead_activities", "\n);"));
  await db.exec("alter table private.offerpsp_compliance_cases add column manual_requested_at timestamptz");
  for (const name of ["offerpsp_jsonb_text_array", "offerpsp_jsonb_numeric"]) await db.exec(definition(helpers, `create or replace function private.${name}`, "\n$$;"));
  await db.exec(definition(base, "create or replace function public.record_offerpsp_pre_compliance_screening", "\n$$;"));
  await db.exec(review.slice(0, review.indexOf("-- Cases already screened")));
  await db.exec(migration);
}
