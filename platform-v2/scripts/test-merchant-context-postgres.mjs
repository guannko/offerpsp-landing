import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { PGlite } from "@electric-sql/pglite";
const db = new PGlite();
const lead = "10000000-0000-4000-8000-000000000001";
const qaLead = "10000000-0000-4000-8000-000000000002";
const provider = "20000000-0000-4000-8000-000000000001";
const qaProvider = "20000000-0000-4000-8000-000000000002";
const migration = await readFile(new URL("../../supabase/migrations/20260930142224_offerpsp_merchant_operational_context.sql", import.meta.url), "utf8");
const qaMigration = await readFile(new URL("../../supabase/migrations/20260920220000_offerpsp_qa_golden_paths.sql", import.meta.url), "utf8");
const context = async () => (await db.query("select public.get_offerpsp_merchant_operational_context($1) result", [lead])).rows[0].result;
try {
  await db.exec(`
    create role anon; create role authenticated; create role service_role;
    create schema private; create schema auth; create table auth.users(id uuid primary key);
    create table public.offerpsp_leads(lead_id uuid,company text,assigned_to uuid,status text,geos text,target_geos text[]);
    create table private.offerpsp_compliance_cases(lead_id uuid,case_status text);
    create function public.is_offerpsp_staff() returns boolean language sql as $$ select current_setting('test.staff')='true' $$;
    create function private.offerpsp_module_enabled(t text) returns boolean language sql as $$ select current_setting('test.compliance')='true' $$;
    create function public.get_offerpsp_pre_compliance_case(id uuid) returns jsonb language sql as $$ select jsonb_build_object('case',to_jsonb(c)) from private.offerpsp_compliance_cases c where lead_id=id $$;
    create function public.get_offerpsp_company_workspace(id uuid) returns jsonb language sql stable as $$ select jsonb_build_object('organization',jsonb_build_object('legal_name','Saved legal name'),'documents','[]'::jsonb) $$;
    select set_config('test.staff','true',false); select set_config('test.compliance','true',false);
    insert into public.offerpsp_leads values('${lead}','Railon','${provider}','needs_clarification','Latam','{}');
    insert into private.offerpsp_compliance_cases values('${lead}','manual_review');
    create table public.offerpsp_shortlists(id uuid,lead_id uuid);
    create table private.offerpsp_offer_routes(id uuid,provider_id uuid);
    create table private.offerpsp_route_matches(lead_id uuid,provider_id uuid,route_id uuid,hard_gates jsonb);
    create table public.offerpsp_shortlist_items(shortlist_id uuid,offer_route_id uuid);
    create function private.offerpsp_qa_scenario_for_entity(p_entity_type text,p_entity_id uuid) returns text language sql as $$ select null::text $$;
  `);
  await db.exec(migration);
  let result = await context();
  assert.equal(result.lead.company, "Railon");
  assert.equal(result.lead.assigned_to, provider);
  assert.equal(result.lead.geos, "Latam");
  assert.equal(result.compliance.loaded, true);
  assert.equal(result.compliance.case.case_status, "manual_review");
  assert.equal(result.company_workspace.organization.legal_name, "Saved legal name");
  await db.exec("select set_config('test.compliance','false',false)");
  assert.deepEqual((await context()).compliance, { loaded: false, reason: "module_disabled" });
  await db.exec("select set_config('test.compliance','true',false); delete from private.offerpsp_compliance_cases");
  assert.equal((await context()).compliance.reason, "case_not_found");
  await db.exec("select set_config('test.staff','false',false)");
  await assert.rejects(() => context(), /staff access required/);
  assert.equal((await db.query("select has_function_privilege('anon','public.get_offerpsp_merchant_operational_context(uuid)','EXECUTE') allowed")).rows[0].allowed, false);
  assert.equal((await db.query("select has_function_privilege('authenticated','public.get_offerpsp_merchant_operational_context(uuid)','EXECUTE') allowed")).rows[0].allowed, true);

  // Exercise the existing real shortlist trigger, not just a frontend predicate.
  await db.exec(qaMigration.slice(0, qaMigration.indexOf("create or replace function public.save_offerpsp_qa_fixture")));
  // Reproduce the historical NULL bug, then apply the replacement over real triggers.
  await db.exec(`insert into private.offerpsp_qa_fixture_entities(scenario_key,entity_type,entity_id) values ('old_qa','merchant','${qaLead}')`);
  assert.equal((await db.query("select private.offerpsp_qa_pair_is_compatible($1,$2) compatible", [qaLead,provider])).rows[0].compatible, null);
  await db.exec("delete from private.offerpsp_qa_fixture_entities");
  await db.exec(migration);
  await db.exec(`insert into private.offerpsp_qa_fixture_entities(scenario_key,entity_type,entity_id) values
    ('golden_scenario','merchant','${qaLead}'),('golden_scenario','provider','${qaProvider}');
    insert into public.offerpsp_shortlists values('${lead}','${lead}'),('${qaLead}','${qaLead}');
    insert into private.offerpsp_offer_routes values('${provider}','${provider}'),('${qaProvider}','${qaProvider}');`);
  await assert.rejects(() => db.exec(`insert into public.offerpsp_shortlist_items values('${lead}','${qaProvider}')`), /QA fixture and production entities/);
  await assert.rejects(() => db.exec(`insert into public.offerpsp_shortlist_items values('${qaLead}','${provider}')`), /QA fixture and production entities/);
  await db.exec(`insert into public.offerpsp_shortlist_items values('${lead}','${provider}'),('${qaLead}','${qaProvider}')`);
  assert.equal((await db.query("select count(*) n from public.offerpsp_shortlist_items")).rows[0].n, 2);
  console.log("PASS staff merchant context, missing-vs-disabled checks, and real QA shortlist boundary");
} finally { await db.close(); }
