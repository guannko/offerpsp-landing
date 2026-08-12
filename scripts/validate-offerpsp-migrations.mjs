#!/usr/bin/env node

import { readFile, readdir } from "node:fs/promises";
import { resolve } from "node:path";
import { pathToFileURL } from "node:url";
import { parseOfferSource } from "../platform-v2/api/_lib/offer-parser.mjs";

const pgliteRoot = process.argv[2];
if (!pgliteRoot) {
  throw new Error("Pass the temporary @electric-sql/pglite installation directory");
}

const moduleUrl = pathToFileURL(resolve(pgliteRoot, "node_modules/@electric-sql/pglite/dist/index.js"));
const { PGlite } = await import(moduleUrl.href);
const db = new PGlite();

const STAFF_ID = "11111111-1111-4111-8111-111111111111";
const CLIENT_ID = "22222222-2222-4222-8222-222222222222";
const OTHER_CLIENT_ID = "33333333-3333-4333-8333-333333333333";
const AGENT_ID = "44444444-4444-4444-8444-444444444444";

async function query(sql, params = []) {
  return db.query(sql, params);
}

async function expectQueryFailure(sql, params, expectedMessage) {
  try {
    await query(sql, params);
  } catch (error) {
    if (!String(error.message).includes(expectedMessage)) {
      throw new Error(`Expected failure containing "${expectedMessage}", received: ${error.message}`);
    }
    return;
  }
  throw new Error(`Expected query to fail with "${expectedMessage}"`);
}

async function setUser(userId) {
  await query("select set_config('request.jwt.claim.sub', $1, false)", [userId]);
}

async function setRole(role = "authenticated") {
  await query("select set_config('request.jwt.claim.role', $1, false)", [role]);
}

async function bootstrap() {
  await db.exec(`
    create role anon nologin;
    create role authenticated nologin;
    create role service_role nologin bypassrls;
    create schema auth;
    create schema storage;
    create table auth.users (
      id uuid primary key,
      email text
    );
    create or replace function auth.uid()
    returns uuid
    language sql
    stable
    as $$
      select nullif(current_setting('request.jwt.claim.sub', true), '')::uuid;
    $$;
    create or replace function auth.jwt()
    returns jsonb
    language sql
    stable
    as $$
      select jsonb_build_object(
        'role', current_setting('request.jwt.claim.role', true),
        'email', coalesce((select email from auth.users where id = auth.uid()), ''),
        'app_metadata', jsonb_build_object('provider', 'google')
      );
    $$;

    create table storage.buckets (
      id text primary key,
      name text not null,
      public boolean not null default false,
      file_size_limit bigint,
      allowed_mime_types text[]
    );
    create table storage.objects (
      id uuid primary key default gen_random_uuid(),
      bucket_id text not null references storage.buckets(id) on delete cascade,
      name text not null,
      owner_id text,
      created_at timestamptz not null default now()
    );
    alter table storage.objects enable row level security;

    create table public.offerpsp_leads (
      lead_id uuid primary key default gen_random_uuid(),
      name text not null,
      work_email text not null,
      telegram text,
      company text not null,
      company_url text,
      vertical text not null,
      monthly_volume text,
      geos text not null,
      methods text,
      details text,
      source text,
      utm_source text,
      utm_campaign text,
      status text not null default 'new',
      consent boolean not null default false,
      submitted_at timestamptz not null default now()
    );

    create table public.psp_providers (
      id serial primary key,
      name text not null,
      website text,
      geo text,
      cluster text,
      specialization text,
      methods text,
      notes text,
      contact_status text default 'not_contacted',
      commission_terms text,
      email text,
      contact_name text,
      phone text,
      telegram text,
      linkedin text,
      other_contacts text,
      supported_countries text[] not null default '{}',
      supported_currencies text[] not null default '{}',
      payment_methods text[] not null default '{}',
      supported_verticals text[] not null default '{}',
      restricted_countries text[] not null default '{}',
      integration_types text[] not null default '{}',
      min_monthly_volume numeric,
      max_monthly_volume numeric,
      risk_appetite text,
      provider_status text default 'research',
      capabilities_verified_at timestamptz,
      capabilities_source text,
      created_at timestamptz default now(),
      updated_at timestamptz default now()
    );

    create sequence public.casino_leads_internal_seq start 1;

    create table public.casino_leads (
      id serial primary key, internal_id text, name text not null, website text,
      description text, geo text, license text, software text, affiliate_program text,
      sphere text, email text, contact_name text,
      contact_title text, telegram text, phone text, linkedin text,
      contact_status text not null default 'new', score integer, source text,
      city text, emails_sent integer, last_contacted_at timestamptz,
      last_reply_at timestamptz, reply_status text, next_follow_up date,
      notes text, tags text[], enriched_emails jsonb not null default '[]'::jsonb,
      created_at timestamptz default now(), updated_at timestamptz default now(),
      unique (internal_id)
    );

    create table public.email_drafts (
      id bigserial primary key, chat_id text not null, lead_internal_id text,
      to_email text, subject text, body text, status text,
      created_at timestamptz default now()
    );

    create table public.chat_logs (
      id bigserial primary key, chat_id text not null, role text not null,
      message text not null, created_at timestamptz default now()
    );

    create table public.bot_tasks (
      id serial primary key, task_type text, payload jsonb, priority integer,
      scheduled_for timestamptz, status text, result text, error text,
      created_by text, created_at timestamptz default now(), started_at timestamptz,
      completed_at timestamptz, ref_type text, ref_id text
    );
  `);
}

async function applyMigrations() {
  const migrationsDirectory = resolve("supabase/migrations");
  const discoveredNames = new Set((await readdir(migrationsDirectory)).filter((name) => name.endsWith(".sql")));
  const migrationNames = [
    "20260730_offerpsp_platform_foundation.sql",
    "20260730_offerpsp_matching_engine.sql",
    "20260730_offerpsp_client_portal.sql",
    "20260730_offerpsp_status_pipeline.sql",
    "20260730_offerpsp_security_hardening.sql",
    "20260730_offerpsp_provider_confidentiality.sql",
    "20260731_offerpsp_private_supply.sql",
    "20260731_offerpsp_route_matching.sql",
    "20260731_offerpsp_introduction_pipeline.sql",
    "20260801_offerpsp_authenticated_lead_grants.sql",
    "20260801_offerpsp_active_lead_claims.sql",
    "20260801_offerpsp_client_workspace_agents.sql",
    "20260801_offerpsp_workspace_grants.sql",
    "20260801_offerpsp_operational_workspaces.sql",
    "20260801_offerpsp_supply_operations.sql",
    "20260802_offerpsp_rate_card_reparse.sql",
    "20260802_offerpsp_route_level_publication.sql",
    "20260802_offerpsp_supply_coverage_matrix.sql",
    "20260802_offerpsp_entity_lifecycle.sql",
    "20260802_offerpsp_entity_lifecycle_grants.sql",
    "20260803_offerpsp_manual_client_offers.sql",
    "20260803_offerpsp_client_offer_display.sql",
    "20260803192003_offerpsp_captains_bridge.sql",
    "20260803195211_offerpsp_single_google_owner.sql",
    "20260803201601_offerpsp_agent_database.sql",
    "20260803203528_offerpsp_360_workspaces.sql",
    "20260804161410_offerpsp_research_crud.sql",
    "20260805152500_aibot_n8n_service_rpc.sql",
    "20260805153500_aibot_legacy_table_rls.sql",
    "20260805161000_offerpsp_mail_center.sql",
    "20260805181309_remove_legacy_client_shortlist_view.sql",
    "20260805183500_offerpsp_offer_ingestion_queue.sql",
    "20260805193000_offerpsp_offer_ingestion_worker.sql",
    "20260805195500_offerpsp_ingestion_worker_response.sql",
    "20260805233000_offerpsp_private_source_storage.sql",
    "20260805235000_offerpsp_ingestion_purge.sql",
    "20260806002000_offerpsp_ocr_source_types.sql",
    "20260806015000_offerpsp_freshness_reminders.sql",
    "20260806030000_offerpsp_deal_outcomes.sql",
    "20260806043000_offerpsp_introduction_preparation.sql",
    "20260806062850_offerpsp_organization_member_management.sql",
    "20260806071110_offerpsp_agent_commission_workflow.sql",
    "20260806080000_offerpsp_agent_cobrand_settings.sql",
    "20260806123857_offerpsp_pre_compliance_module.sql",
    "20260806132300_offerpsp_pre_compliance_indexes.sql",
    "20260806164710_offerpsp_manual_compliance_review.sql",
    "20260806170000_offerpsp_admin_p0_hardening.sql",
    "20260806194000_offerpsp_individual_offer_publication.sql",
    "20260806211500_offerpsp_operations_integrations.sql",
    "20260806222500_offerpsp_operations_indexes.sql",
    "20260808000000_offerpsp_impact_control.sql",
    "20260808120000_offerpsp_impact_control_v2.sql",
    "20260808180000_offerpsp_impact_control_v3.sql",
    "20260808210000_offerpsp_impact_control_v4.sql",
    "20260808225621_offerpsp_v5_core.sql",
    "20260808225721_offerpsp_v5_import.sql",
    "20260808225821_offerpsp_v5_intake.sql",
    "20260808225921_offerpsp_v5_publish.sql",
    "20260808230021_offerpsp_v5_supply.sql",
    "20260808230121_offerpsp_v5_shortlist.sql",
    "20260808230221_offerpsp_v5_matching.sql",
    "20260809104206_offerpsp_merchant_profile_documents.sql",
    "20260809120000_offerpsp_counterparty_organizer.sql",
    "20260809143000_aibot_operating_desk_pagination.sql",
    "20260809170000_aibot_bulk_confirmations.sql",
    "20260809173000_aibot_prepare_bulk.sql",
    "20260809180000_aibot_bulk_by_search.sql",
    "20260810084954_offerpsp_geo_region_aliases.sql",
    "20260810090000_offerpsp_geo_region_normalization_v2.sql",
    "20260810093000_offerpsp_progressive_geo_matching.sql",
    "20260810120000_offerpsp_atomic_route_replacements.sql",
    "20260810122748_offerpsp_instant_workspace_and_telegram_bridge.sql",
    "20260810124600_offerpsp_instant_workspace_provider_state_fix.sql",
    "20260810133000_offerpsp_deferred_background_screening.sql",
    "20260810135000_offerpsp_portal_notification_contact.sql",
    "20260811110147_offerpsp_provider_default_markups.sql",
    "20260811114342_offerpsp_korea_geo_correction.sql",
    "20260811133000_offerpsp_risk_segments.sql",
    "20260811201417_offerpsp_lead_attribution.sql",
    "20260811233050_offerpsp_mail_ingest_idempotency.sql",
    "20260812110000_offerpsp_route_coverage_mode_default_fix.sql",
    "20260812111500_offerpsp_atomic_replacement_compatibility_contract.sql",
    "20260812142000_offerpsp_email_attachments.sql",
    "20260812170000_offerpsp_inbox_operations.sql",
    "20260812183000_aibot_durable_memory.sql",
    "20260812190000_aibot_history_search.sql",
    "20260812192420_offerpsp_contact_timeline.sql",
    "20260812200000_aibot_execution_journal.sql",
  ];
  for (const migrationName of migrationNames) discoveredNames.delete(migrationName);
  if (discoveredNames.size) {
    throw new Error(`Add new migrations to the explicit validation order: ${[...discoveredNames].join(", ")}`);
  }

  for (const migrationName of migrationNames) {
    const sql = await readFile(resolve(migrationsDirectory, migrationName), "utf8");
    try {
      await db.exec(sql);
      process.stdout.write(`PASS migration ${migrationName}\n`);
    } catch (error) {
      throw new Error(`Migration ${migrationName} failed: ${error.message}`);
    }
  }
}

async function verifyLeadGrants() {
  const result = await query(`select
    has_table_privilege('authenticated', 'public.offerpsp_leads', 'UPDATE') as authenticated_update,
    has_table_privilege('authenticated', 'public.offerpsp_leads', 'DELETE') as authenticated_delete,
    has_table_privilege('anon', 'public.offerpsp_leads', 'UPDATE') as anon_update,
    has_table_privilege('anon', 'public.offerpsp_leads', 'DELETE') as anon_delete`);
  const grants = result.rows[0];
  if (!grants.authenticated_update || !grants.authenticated_delete || grants.anon_update || grants.anon_delete) {
    throw new Error("OfferPSP lead table grants do not match the staff RLS model");
  }
  process.stdout.write("PASS authenticated lead UPDATE/DELETE grants with anon denied\n");
}

async function verifyWorkspaceGrants() {
  const result = await query(`select
    has_table_privilege('authenticated', 'public.offerpsp_organizations', 'SELECT') as organizations_select,
    has_table_privilege('authenticated', 'public.offerpsp_organizations', 'INSERT') as organizations_insert,
    has_table_privilege('authenticated', 'public.offerpsp_organizations', 'UPDATE') as organizations_update,
    has_table_privilege('authenticated', 'public.offerpsp_organizations', 'DELETE') as organizations_delete,
    has_table_privilege('authenticated', 'public.offerpsp_organizations', 'TRUNCATE') as organizations_truncate,
    has_table_privilege('authenticated', 'public.offerpsp_organizations', 'TRIGGER') as organizations_trigger,
    has_table_privilege('authenticated', 'public.offerpsp_organizations', 'REFERENCES') as organizations_references,
    to_regclass('public.offerpsp_client_shortlist') is null as legacy_client_view_removed
  `);
  const grants = result.rows[0];
  if (
    !grants.organizations_select || !grants.organizations_insert ||
    !grants.organizations_update || !grants.organizations_delete ||
    grants.organizations_truncate || grants.organizations_trigger ||
    grants.organizations_references || !grants.legacy_client_view_removed
  ) {
    throw new Error("Workspace table and view grants are broader than required");
  }
  process.stdout.write("PASS minimal workspace grants with legacy client view removed\n");
}

async function verifyClientPolicyBoundary() {
  const policy = await query(`
    select count(*)::integer as client_item_policies
    from pg_policies
    where schemaname = 'public'
      and tablename = 'offerpsp_shortlist_items'
      and policyname <> 'offerpsp_shortlist_items_staff_all'
  `);
  if (policy.rows[0].client_item_policies !== 0) {
    throw new Error("Client or agent has a direct shortlist-item RLS policy that can expose private IDs");
  }
  process.stdout.write("PASS shortlist items remain staff-only; clients and agents use the safe projection\n");
}

async function verifySupplyOperationGrants() {
  const result = await query(`select
    has_function_privilege('authenticated', 'public.get_offerpsp_supply_workspace(uuid)', 'EXECUTE') as authenticated_list,
    has_function_privilege('anon', 'public.get_offerpsp_supply_workspace(uuid)', 'EXECUTE') as anon_list,
    has_function_privilege('authenticated', 'public.save_offerpsp_route(uuid,jsonb)', 'EXECUTE') as authenticated_save,
    has_function_privilege('anon', 'public.save_offerpsp_route(uuid,jsonb)', 'EXECUTE') as anon_save,
    has_function_privilege('authenticated', 'public.resolve_offerpsp_route_anomaly(uuid,text,text)', 'EXECUTE') as authenticated_resolve,
    has_function_privilege('anon', 'public.resolve_offerpsp_route_anomaly(uuid,text,text)', 'EXECUTE') as anon_resolve,
    has_function_privilege('authenticated', 'public.get_offerpsp_supply_coverage()', 'EXECUTE') as authenticated_coverage,
    has_function_privilege('anon', 'public.get_offerpsp_supply_coverage()', 'EXECUTE') as anon_coverage,
    has_function_privilege('authenticated', 'public.create_offerpsp_manual_shortlist(uuid,uuid[],text,text,text)', 'EXECUTE') as authenticated_manual_shortlist,
    has_function_privilege('anon', 'public.create_offerpsp_manual_shortlist(uuid,uuid[],text,text,text)', 'EXECUTE') as anon_manual_shortlist,
    has_function_privilege('authenticated', 'public.list_offerpsp_client_offers(uuid)', 'EXECUTE') as authenticated_client_offers,
    has_function_privilege('anon', 'public.list_offerpsp_client_offers(uuid)', 'EXECUTE') as anon_client_offers
  `);
  const grants = result.rows[0];
  if (!grants.authenticated_list || !grants.authenticated_save || !grants.authenticated_resolve
      || !grants.authenticated_coverage || !grants.authenticated_manual_shortlist
      || !grants.authenticated_client_offers
      || grants.anon_list || grants.anon_save || grants.anon_resolve
      || grants.anon_coverage || grants.anon_manual_shortlist || grants.anon_client_offers) {
    throw new Error("Supply operation RPC grants do not match the staff-only API model");
  }
  process.stdout.write("PASS staff-only supply operation RPC grants with anon denied\n");
}

async function verifyManagementOperationGrants() {
  const result = await query(`select
    has_function_privilege('authenticated', 'public.get_offerpsp_management_registry()', 'EXECUTE') as authenticated_registry,
    has_function_privilege('anon', 'public.get_offerpsp_management_registry()', 'EXECUTE') as anon_registry,
    has_function_privilege('authenticated', 'public.purge_offerpsp_merchant(uuid,text)', 'EXECUTE') as authenticated_purge,
    has_function_privilege('anon', 'public.purge_offerpsp_merchant(uuid,text)', 'EXECUTE') as anon_purge,
    has_function_privilege('authenticated', 'public.create_offerpsp_manual_route(uuid,jsonb)', 'EXECUTE') as authenticated_offer,
    has_function_privilege('anon', 'public.create_offerpsp_manual_route(uuid,jsonb)', 'EXECUTE') as anon_offer,
    has_function_privilege('authenticated', 'public.set_offerpsp_agent_margin_policy(uuid,uuid,text,text,numeric,numeric,text,text)', 'EXECUTE') as authenticated_agent_margin,
    has_function_privilege('anon', 'public.set_offerpsp_agent_margin_policy(uuid,uuid,text,text,numeric,numeric,text,text)', 'EXECUTE') as anon_agent_margin
  `);
  const grants = result.rows[0];
  if (!grants.authenticated_registry || !grants.authenticated_purge || !grants.authenticated_offer
      || !grants.authenticated_agent_margin || grants.anon_registry || grants.anon_purge
      || grants.anon_offer || grants.anon_agent_margin) {
    throw new Error("Management RPC grants do not match the staff-only API model");
  }
  process.stdout.write("PASS staff-only management RPC grants with anon denied\n");
}

async function verifyPreComplianceGrants() {
  const result = await query(`select
    has_function_privilege('authenticated', 'public.get_offerpsp_module_entitlements()', 'EXECUTE') as staff_entitlements,
    has_function_privilege('authenticated', 'public.get_offerpsp_pre_compliance_registry()', 'EXECUTE') as staff_registry,
    has_function_privilege('authenticated', 'public.get_offerpsp_pre_compliance_case(uuid)', 'EXECUTE') as staff_case,
    has_function_privilege('authenticated', 'public.save_offerpsp_pre_compliance_decision(uuid,text,text,text,text[],text)', 'EXECUTE') as staff_decision,
    has_function_privilege('authenticated', 'public.record_offerpsp_pre_compliance_screening(uuid,jsonb)', 'EXECUTE') as staff_screen,
    has_function_privilege('service_role', 'public.record_offerpsp_pre_compliance_screening(uuid,jsonb)', 'EXECUTE') as service_screen,
    has_function_privilege('service_role', 'public.claim_offerpsp_pre_compliance_jobs(integer)', 'EXECUTE') as service_claim,
    has_function_privilege('authenticated', 'public.claim_offerpsp_pre_compliance_jobs(integer)', 'EXECUTE') as staff_claim,
    has_function_privilege('anon', 'public.get_offerpsp_pre_compliance_registry()', 'EXECUTE') as anon_registry,
    has_table_privilege('authenticated', 'private.offerpsp_compliance_cases', 'SELECT') as direct_cases,
    has_table_privilege('authenticated', 'private.offerpsp_submission_signals', 'SELECT') as direct_signals
  `);
  const grants = result.rows[0];
  if (!grants.staff_entitlements || !grants.staff_registry || !grants.staff_case || !grants.staff_decision
      || grants.staff_screen || grants.staff_claim || !grants.service_screen || !grants.service_claim || grants.anon_registry || grants.direct_cases || grants.direct_signals) {
    throw new Error("Pre-compliance grants do not match the paid staff/service RPC boundary");
  }
  process.stdout.write("PASS paid pre-compliance entitlement and staff/service isolation\n");
}

async function verifyCaptainsBridgeGrants() {
  const result = await query(`select
    has_function_privilege('authenticated', 'public.get_offerpsp_captains_bridge()', 'EXECUTE') as authenticated_registry,
    has_function_privilege('anon', 'public.get_offerpsp_captains_bridge()', 'EXECUTE') as anon_registry,
    has_function_privilege('authenticated', 'public.create_offerpsp_email_draft(uuid,text,text,text)', 'EXECUTE') as authenticated_email,
    has_function_privilege('anon', 'public.create_offerpsp_email_draft(uuid,text,text,text)', 'EXECUTE') as anon_email
  `);
  const grants = result.rows[0];
  if (!grants.authenticated_registry || !grants.authenticated_email || grants.anon_registry || grants.anon_email) {
    throw new Error("Captain's Bridge RPC grants do not match the staff-only API model");
  }
  process.stdout.write("PASS staff-only Captain's Bridge and email RPC grants with anon denied\n");
}

async function verify360WorkspaceGrants() {
  const result = await query(`select
    has_function_privilege('authenticated', 'public.get_offerpsp_entity_workspace(text,uuid)', 'EXECUTE') as authenticated_workspace,
    has_function_privilege('anon', 'public.get_offerpsp_entity_workspace(text,uuid)', 'EXECUTE') as anon_workspace,
    has_function_privilege('authenticated', 'public.save_offerpsp_merchant_contact(uuid,uuid,jsonb)', 'EXECUTE') as authenticated_contact,
    has_function_privilege('anon', 'public.save_offerpsp_merchant_contact(uuid,uuid,jsonb)', 'EXECUTE') as anon_contact,
    has_function_privilege('authenticated', 'public.save_offerpsp_entity_document(text,uuid,uuid,jsonb)', 'EXECUTE') as authenticated_document,
    has_function_privilege('anon', 'public.save_offerpsp_entity_document(text,uuid,uuid,jsonb)', 'EXECUTE') as anon_document,
    has_function_privilege('authenticated', 'public.save_offerpsp_lead_task(uuid,uuid,jsonb)', 'EXECUTE') as authenticated_task,
    has_function_privilege('anon', 'public.save_offerpsp_lead_task(uuid,uuid,jsonb)', 'EXECUTE') as anon_task,
    has_table_privilege('authenticated', 'private.offerpsp_merchant_contacts', 'SELECT') as authenticated_contacts_table,
    has_table_privilege('authenticated', 'private.offerpsp_entity_documents', 'SELECT') as authenticated_documents_table,
    has_table_privilege('anon', 'private.offerpsp_merchant_contacts', 'SELECT') as anon_contacts_table,
    has_table_privilege('anon', 'private.offerpsp_entity_documents', 'SELECT') as anon_documents_table
  `);
  const grants = result.rows[0];
  if (!grants.authenticated_workspace || !grants.authenticated_contact || !grants.authenticated_document
      || !grants.authenticated_task || grants.anon_workspace || grants.anon_contact || grants.anon_document
      || grants.anon_task
      || grants.authenticated_contacts_table || grants.authenticated_documents_table
      || grants.anon_contacts_table || grants.anon_documents_table) {
    throw new Error("360 workspace grants expose private contacts or documents");
  }
  process.stdout.write("PASS staff-only 360 workspace RPC grants with private tables isolated\n");
}

async function verifyResearchCrudGrants() {
  const result = await query(`select
    has_function_privilege('authenticated', 'public.save_offerpsp_research_entity(text,bigint,jsonb)', 'EXECUTE') as authenticated_save,
    has_function_privilege('anon', 'public.save_offerpsp_research_entity(text,bigint,jsonb)', 'EXECUTE') as anon_save,
    has_function_privilege('authenticated', 'public.set_offerpsp_research_entity_state(text,bigint,text)', 'EXECUTE') as authenticated_state,
    has_function_privilege('anon', 'public.set_offerpsp_research_entity_state(text,bigint,text)', 'EXECUTE') as anon_state
  `);
  const grants = result.rows[0];
  if (!grants.authenticated_save || !grants.authenticated_state || grants.anon_save || grants.anon_state) {
    throw new Error("Research CRUD RPC grants do not match the staff-only API model");
  }
  process.stdout.write("PASS staff-only research CRUD grants with anon denied\n");
}

async function seedUsers() {
  await query(
    "insert into auth.users (id, email) values ($1, 'guannko@gmail.com'), ($2, 'client@example.com'), ($3, 'other@example.com'), ($4, 'agent@example.com')",
    [STAFF_ID, CLIENT_ID, OTHER_CLIENT_ID, AGENT_ID],
  );
  await setUser(STAFF_ID);
  await query(
    "insert into public.offerpsp_staff_members (user_id, role, display_name) values ($1, 'owner', 'Test Owner')",
    [STAFF_ID],
  );
  await query(`
    insert into public.psp_providers (
      name, website, geo, cluster, specialization, methods, notes,
      supported_countries, supported_currencies, payment_methods,
      supported_verticals, provider_status
    ) values (
      'Legacy Test PSP', 'https://legacy.invalid', 'India', 'Asia',
      'iGaming', 'UPI, P2P', 'Validation fixture',
      array['IN'], array['INR'], array['UPI', 'P2P'], array['IGAMING'], 'verified'
    )
  `);
}

async function verifyAtomicRouteReplacement() {
  await setUser(STAFF_ID);
  await setRole("authenticated");
  const providerResult = await query(`select public.upsert_offerpsp_provider(
    'Atomic Route Fixture', null, null, 'https://atomic.invalid', 'active', 50, true,
    'Atomic replacement validation'
  ) as value`);
  const providerCode = providerResult.rows[0].value.internal_code;
  const route = (title, geos, methods, percent, nicheKey, minimumAmount = 100, maximumAmount = 1000) => ({
    client_title: title,
    coverage_scope: "specific",
    coverage_mode: "specific",
    geos,
    blocked_geos: [],
    currencies: ["INR"],
    flow: "payin",
    methods,
    card_brands: [],
    traffic_types: ["TRUSTED"],
    verticals: ["IGAMING"],
    prohibited_verticals: [],
    integrations: ["H2H"],
    niche_key: nicheKey,
    fees: [{ flow: "payin", fee_type: "percent", base_percent: percent, applies_on: "success" }],
    limits: [{
      flow: "payin",
      scope: "transaction",
      currency: "INR",
      minimum_amount: minimumAmount,
      maximum_amount: maximumAmount,
    }],
    settlement: [],
    anomalies: [],
  });
  const initial = await query(`select public.import_offerpsp_rate_card(
    $1, 'manual', 'atomic-v1', 'atomic:v1', null, 'atomic-test-v1', '{}'::jsonb, $2::jsonb
  ) as value`, [providerCode, JSON.stringify([
    route("India UPI v1", ["IN"], ["UPI"], 7, "ATOMIC-INDIA-UPI"),
    route("India P2P sibling", ["IN"], ["P2P"], 8, "ATOMIC-INDIA-P2P"),
  ])]);
  const initialRoutes = await query(`select r.id, r.client_title
    from private.offerpsp_offer_routes r where r.batch_id = $1`, [initial.rows[0].value.batch_id]);
  const oldUpi = initialRoutes.rows.find((item) => item.client_title === "India UPI v1");
  const sibling = initialRoutes.rows.find((item) => item.client_title === "India P2P sibling");
  await query("select public.publish_offerpsp_route($1)", [oldUpi.id]);
  await query("select public.publish_offerpsp_route($1)", [sibling.id]);

  const identical = await query(`select public.import_offerpsp_rate_card(
    $1, 'manual', 'atomic-v1-confirmation', 'atomic:v1-confirmation', null,
    'atomic-test-v1-confirmation', '{}'::jsonb, $2::jsonb
  ) as value`, [providerCode, JSON.stringify([
    route("India UPI v1", ["IN"], ["UPI"], 7, "ATOMIC-INDIA-UPI"),
  ])]);
  const identicalReview = await query(`select public.get_offerpsp_route_replacement_review(r.id) as value
    from private.offerpsp_offer_routes r where r.batch_id = $1`, [identical.rows[0].value.batch_id]);
  const identicalCandidate = identicalReview.rows[0].value.candidates.find((item) => item.id === oldUpi.id);
  if (!identicalCandidate || identicalCandidate.commercial_changed !== false) {
    throw new Error("Route metadata made identical commercial terms look changed");
  }
  await query("select public.set_offerpsp_route_status(r.id, 'archived') from private.offerpsp_offer_routes r where r.batch_id = $1", [identical.rows[0].value.batch_id]);

  const changed = await query(`select public.import_offerpsp_rate_card(
    $1, 'manual', 'atomic-v2', 'atomic:v2', null, 'atomic-test-v2', '{}'::jsonb, $2::jsonb
  ) as value`, [providerCode, JSON.stringify([
    route("India plus Singapore UPI v2", ["IN", "SG"], ["UPI"], 9.5, "ATOMIC-INDIA-UPI", 150, 12000),
  ])]);
  const replacementState = await query(`select r.id, r.revision_of_route_id, r.route_family_id,
      review.status review_status, review.candidate_route_ids
    from private.offerpsp_offer_routes r
    join private.offerpsp_route_replacement_reviews review on review.new_route_id = r.id
    where r.batch_id = $1`, [changed.rows[0].value.batch_id]);
  const replacement = replacementState.rows[0];
  if (replacement.revision_of_route_id !== null
      || replacement.review_status !== "pending"
      || !replacement.candidate_route_ids.includes(oldUpi.id)) {
    throw new Error("Importer linked a replacement without staff confirmation or missed the UPI candidate");
  }
  await expectQueryFailure(
    "select public.publish_offerpsp_route($1)",
    [replacement.id],
    "Choose whether this route replaces a candidate",
  );
  await query(
    "select public.decide_offerpsp_route_replacement($1, 'replace', $2)",
    [replacement.id, oldUpi.id],
  );
  const lineage = await query(`select newer.route_family_id = older.route_family_id same_family
    from private.offerpsp_offer_routes newer
    join private.offerpsp_offer_routes older on older.id = $2
    where newer.id = $1`, [replacement.id, oldUpi.id]);
  if (!lineage.rows[0].same_family) {
    throw new Error("Confirmed replacement did not inherit the durable route family ID");
  }
  await query("select public.publish_offerpsp_route($1)", [replacement.id]);
  const published = await query(`select
    (select status from private.offerpsp_offer_routes where id = $1) old_status,
    (select status from private.offerpsp_offer_routes where id = $2) new_status,
    (select status from private.offerpsp_offer_routes where id = $3) sibling_status,
    (select minimum_amount::text from private.offerpsp_offer_limits where route_id = $2 limit 1) new_minimum,
    (select maximum_amount::text from private.offerpsp_offer_limits where route_id = $2 limit 1) new_maximum,
    (select maximum_amount::text from private.offerpsp_offer_limits where route_id = $3 limit 1) sibling_maximum`,
  [oldUpi.id, replacement.id, sibling.id]);
  if (published.rows[0].old_status !== "archived"
      || published.rows[0].new_status !== "published"
      || published.rows[0].sibling_status !== "published"
      || published.rows[0].new_minimum !== "150"
      || published.rows[0].new_maximum !== "12000"
      || published.rows[0].sibling_maximum !== "1000") {
    throw new Error(`Atomic publication changed the wrong sibling: ${JSON.stringify(published.rows[0])}`);
  }

  const independent = await query(`select public.import_offerpsp_rate_card(
    $1, 'manual', 'atomic-v3', 'atomic:v3', null, 'atomic-test-v3', '{}'::jsonb, $2::jsonb
  ) as value`, [providerCode, JSON.stringify([
    route("India PIX independent", ["IN"], ["PIX"], 6, "ATOMIC-INDIA-PIX"),
  ])]);
  const independentRoute = await query(`select r.id, review.status review_status
    from private.offerpsp_offer_routes r
    join private.offerpsp_route_replacement_reviews review on review.new_route_id = r.id
    where r.batch_id = $1`, [independent.rows[0].value.batch_id]);
  if (independentRoute.rows[0].review_status !== "independent") {
    throw new Error("Unrelated payment method was incorrectly classified as a replacement");
  }
  await query("select public.publish_offerpsp_route($1)", [independentRoute.rows[0].id]);
  process.stdout.write("PASS staff-confirmed atomic replacement preserves omitted sibling routes\n");
}

async function clearPreCompliance(leadId, classification = "merchant") {
  await setUser(STAFF_ID);
  await setRole("authenticated");
  return query(
    "select public.save_offerpsp_pre_compliance_decision($1, 'cleared', $2, 'Validation clearance', '{}'::text[], 'Validation fixture cleared') as value",
    [leadId, classification],
  );
}

async function verifyPreComplianceGate() {
  await setUser(STAFF_ID);
  const lead = await query(`
    insert into public.offerpsp_leads (
      name, work_email, company, company_url, vertical, geos, methods, source, status, consent
    ) values (
      'Compliance Fixture', 'compliance@example.com', 'Compliance Fixture Merchant',
      'https://compliance.invalid', 'iGaming', 'South Korea', 'UPI',
      'pre-compliance-regression', 'new', true
    ) returning lead_id
  `);
  const leadId = lead.rows[0].lead_id;
  const state = await query(
    `select l.status, l.target_geos, l.requested_methods, c.case_status, c.completeness_score,
      (select count(*)::integer from public.offerpsp_matches m where m.lead_id = l.lead_id) as legacy_matches,
      (select count(*)::integer from public.offerpsp_shortlists s where s.lead_id = l.lead_id) as shortlists,
      (select count(*)::integer from public.offerpsp_tasks t where t.lead_id = l.lead_id and t.metadata ->> 'module' = 'pre_compliance') as review_tasks
     from public.offerpsp_leads l
     join private.offerpsp_compliance_cases c on c.lead_id = l.lead_id
     where l.lead_id = $1`,
    [leadId],
  );
  const opened = state.rows[0];
  if (opened.case_status !== "pending" || opened.legacy_matches !== 0 || opened.shortlists !== 0
      || opened.review_tasks !== 0 || !opened.target_geos.includes("KR") || !opened.requested_methods.includes("UPI")) {
    throw new Error(`New lead did not enter the deferred normalized queue: ${JSON.stringify(opened)}`);
  }
  await query("select public.rebuild_offerpsp_route_matches($1)", [leadId]);
  await query(
    "insert into public.offerpsp_shortlists(lead_id, title, status) values ($1, 'Immediate shortlist', 'draft')",
    [leadId],
  );

  await setRole("service_role");
  const prematureClaim = await query("select public.claim_offerpsp_pre_compliance_jobs(10) as value");
  if (prematureClaim.rows[0].value.some((item) => item.lead_id === leadId)) {
    throw new Error(`Service worker screened the lead before option selection: ${JSON.stringify(prematureClaim.rows[0].value)}`);
  }

  await setRole("authenticated");
  await setUser(STAFF_ID);
  await query("update public.offerpsp_leads set status = 'option_selected' where lead_id = $1", [leadId]);
  await setRole("service_role");
  const claimed = await query("select public.claim_offerpsp_pre_compliance_jobs(10) as value");
  if (!claimed.rows[0].value.some((item) => item.lead_id === leadId && item.target_geos.includes("KR"))) {
    throw new Error(`Service worker did not claim the selected normalized lead: ${JSON.stringify(claimed.rows[0].value)}`);
  }
  const screening = await query(
    "select public.record_offerpsp_pre_compliance_screening($1, $2::jsonb) as value",
    [leadId, JSON.stringify({
      classification: "merchant",
      authenticity_score: 82,
      compliance_readiness_score: 45,
      commercial_value_score: 76,
      completeness_score: 60,
      risk_level: "medium",
      confidence: 0.81,
      summary: "Domain exists; licence evidence is missing.",
      missing_information: ["Licence evidence"],
      source_links: [{ url: "https://compliance.invalid", kind: "website" }],
      checks: [{ check_key: "domain", status: "passed", title: "Domain resolves", score: 90 }],
      screening_provider: "validation",
    })],
  );
  if (screening.rows[0].value.status !== "manual_review") {
    throw new Error(`Completed automated screening did not enter manual review: ${JSON.stringify(screening.rows[0].value)}`);
  }
  const reclaimed = await query("select public.claim_offerpsp_pre_compliance_jobs(10) as value");
  if (reclaimed.rows[0].value.some((item) => item.lead_id === leadId)) {
    throw new Error("Manual-review lead was incorrectly reclaimed by the automated worker");
  }
  await clearPreCompliance(leadId);
  const cleared = await query(
    "select l.status, c.case_status, c.classification, (select count(*) from private.offerpsp_compliance_decisions d where d.case_id = c.id) as decisions from public.offerpsp_leads l join private.offerpsp_compliance_cases c on c.lead_id = l.lead_id where l.lead_id = $1",
    [lead.rows[0].lead_id],
  );
  if (cleared.rows[0].status !== "option_selected" || cleared.rows[0].case_status !== "cleared"
      || cleared.rows[0].classification !== "merchant" || Number(cleared.rows[0].decisions) !== 1) {
    throw new Error(`Manual clearance changed the progressed deal incorrectly: ${JSON.stringify(cleared.rows[0])}`);
  }
  process.stdout.write("PASS immediate matching, deferred screening after selection and manual review\n");
}

async function verifyPortalLeadClaims() {
  const fixtures = await query(`
    insert into public.offerpsp_leads (
      name, work_email, company, vertical, geos, source, status, consent
    ) values
      ('Active Client', 'client@example.com', 'Active Merchant', 'iGaming', 'India', 'portal-claim-regression', 'new', true),
      ('Closed Client', 'client@example.com', 'Closed E2E Merchant', 'iGaming', 'India', 'production-e2e-regression', 'closed', true),
      ('Spam Client', 'client@example.com', 'Spam Merchant', 'iGaming', 'India', 'portal-claim-regression', 'spam', true)
    returning lead_id, company, status
  `);
  const activeLeadId = fixtures.rows.find((row) => row.company === "Active Merchant").lead_id;
  const inactiveLeadIds = fixtures.rows
    .filter((row) => row.company !== "Active Merchant")
    .map((row) => row.lead_id);

  await setUser(STAFF_ID);
  const ensured = await query("select public.ensure_offerpsp_company_workspace($1) as organization_id", [activeLeadId]);
  const organizationId = ensured.rows[0].organization_id;
  if (!organizationId) throw new Error("Staff could not create a persistent company workspace before client login");

  await setUser(CLIENT_ID);
  const firstClaim = await query("select * from public.claim_offerpsp_leads()");
  if (firstClaim.rows.length !== 1 || firstClaim.rows[0].lead_id !== activeLeadId) {
    throw new Error("Lead claim did not isolate the active email-matched request");
  }

  const linked = await query(
    "select lead_id, status, client_user_id from public.offerpsp_leads where lead_id = any($1::uuid[]) order by status",
    [[activeLeadId, ...inactiveLeadIds]],
  );
  const activeLink = linked.rows.find((row) => row.lead_id === activeLeadId);
  const inactiveLinks = linked.rows.filter((row) => inactiveLeadIds.includes(row.lead_id));
  if (activeLink?.client_user_id !== CLIENT_ID || inactiveLinks.some((row) => row.client_user_id !== null)) {
    throw new Error(`Closed or spam lead was linked by the portal claim function: ${JSON.stringify(linked.rows)}`);
  }

  const organizationState = await query(`select
    l.merchant_organization_id,
    (select count(*)::integer from public.offerpsp_organizations o where o.name = 'Active Merchant') as organizations,
    (select count(*)::integer from public.offerpsp_organization_members om where om.organization_id = l.merchant_organization_id and om.user_id = $2 and om.active) as memberships
    from public.offerpsp_leads l where l.lead_id = $1`, [activeLeadId, CLIENT_ID]);
  if (organizationState.rows[0].merchant_organization_id !== organizationId
      || organizationState.rows[0].organizations !== 1 || organizationState.rows[0].memberships !== 1) {
    throw new Error(`Client claim duplicated or failed to join the persistent company: ${JSON.stringify(organizationState.rows[0])}`);
  }

  const savedProfile = await query(
    "select public.save_offerpsp_company_profile($1, $2::jsonb) as value",
    [organizationId, JSON.stringify({ legal_name: "Active Merchant OÜ", registration_number: "REG-001", registration_jurisdiction: "EE", website_url: "https://active.invalid", registered_address: "Tallinn", verification_status: "verified" })],
  );
  if (savedProfile.rows[0].value.organization.verification_status !== "unverified"
      || savedProfile.rows[0].value.profile_completion !== 100) {
    throw new Error(`Client changed staff verification state or company completion is wrong: ${JSON.stringify(savedProfile.rows[0].value)}`);
  }

  const documentIdResult = await query("select gen_random_uuid() as id");
  const documentId = documentIdResult.rows[0].id;
  const documentPath = `${organizationId}/${documentId}/licence.pdf`;
  await query("insert into storage.objects(bucket_id, name, owner_id) values ('offerpsp-merchant-documents', $1, $2)", [documentPath, CLIENT_ID]);
  const registered = await query(
    "select public.register_offerpsp_company_document($1, $2, $3::jsonb) as value",
    [organizationId, documentId, JSON.stringify({ document_type: "license", title: "Test licence", file_name: "licence.pdf", storage_path: documentPath, mime_type: "application/pdf", size_bytes: 1200 })],
  );
  if (registered.rows[0].value.status !== "pending") throw new Error("Client company document was not registered as pending");

  const repeatClaim = await query("select * from public.claim_offerpsp_leads()");
  if (repeatClaim.rows.length !== 1 || repeatClaim.rows[0].lead_id !== activeLeadId) {
    throw new Error("Repeated login changed inactive lead claim isolation");
  }

  await setUser(OTHER_CLIENT_ID);
  const foreignClaim = await query("select * from public.claim_offerpsp_leads()");
  if (foreignClaim.rows.length !== 0) {
    throw new Error("A different authenticated email claimed another client's request");
  }
  await expectQueryFailure("select public.get_offerpsp_company_workspace($1)", [activeLeadId], "Access denied");

  await setUser(STAFF_ID);
  await query("select public.review_offerpsp_company_document($1, 'rejected', 'Fresh copy required')", [documentId]);
  await setUser(CLIENT_ID);
  const clientWorkspace = await query("select public.get_offerpsp_company_workspace($1) as value", [activeLeadId]);
  if (clientWorkspace.rows[0].value.documents.length !== 1
      || clientWorkspace.rows[0].value.documents[0].review_note !== "Fresh copy required") {
    throw new Error(`Client did not receive the rejected document review reason: ${JSON.stringify(clientWorkspace.rows[0].value)}`);
  }
  await query("select public.archive_offerpsp_company_document($1)", [documentId]);
  const archived = await query("select status from private.offerpsp_organization_documents where id = $1", [documentId]);
  if (archived.rows[0].status !== "archived") throw new Error("Company document archive action failed");

  await setUser(STAFF_ID);
  process.stdout.write("PASS active email claim, persistent company profile, private document review and foreign isolation\n");
}

async function importPreparedDrafts() {
  for (const [providerKey, fileName, expected] of [
    ["brpay", ".private/imports/brpay-2026-07-23-v3.json", { routes: 14, errors: 4, duplicates: 0, publishError: "Resolve or exclude every error-level route before publication" }],
    ["antarex", ".private/imports/antarex-2026-07-30-v3.json", { routes: 24, errors: 0, duplicates: 2, publishError: "A provider margin policy is required before publication" }],
  ]) {
    const payload = JSON.parse(await readFile(resolve(fileName), "utf8"));
    if (
      payload.batch.parser_version !== "offerpsp-source-parser-v3"
      || payload.batch.routes.length !== expected.routes
      || payload.batch.parser_metadata.blocking_anomaly_count !== expected.errors
      || payload.batch.parser_metadata.duplicate_source_block_count !== expected.duplicates
    ) {
      throw new Error(`${providerKey} parser regression changed the normalized rate card`);
    }
    const providerResult = await query(
      `select public.upsert_offerpsp_provider(
        $1, null, null, $2, 'active', $3, $4, 'Prepared draft validation'
      ) as value`,
      [
        payload.provider.brand_name,
        payload.provider.website,
        payload.provider.strategic_priority,
        payload.provider.margin_included_default,
      ],
    );
    const providerCode = providerResult.rows[0].value.internal_code;
    const legacyPayload = JSON.parse(await readFile(resolve(`.private/imports/${providerKey === "brpay" ? "brpay-2026-07-23.json" : "antarex-2026-07-30.json"}`), "utf8"));
    await query(
      `select public.import_offerpsp_rate_card(
        $1, $2, $3, $4, $5::date, $6, $7::jsonb, $8::jsonb
      )`,
      [
        providerCode,
        legacyPayload.batch.source_type,
        legacyPayload.batch.source_text,
        legacyPayload.batch.source_reference,
        legacyPayload.batch.source_effective_date,
        legacyPayload.batch.parser_version,
        JSON.stringify(legacyPayload.batch.parser_metadata),
        JSON.stringify(legacyPayload.batch.routes),
      ],
    );
    const importResult = await query(
      `select public.import_offerpsp_rate_card(
        $1, $2, $3, $4, $5::date, $6, $7::jsonb, $8::jsonb
      ) as value`,
      [
        providerCode,
        payload.batch.source_type,
        payload.batch.source_text,
        payload.batch.source_reference,
        payload.batch.source_effective_date,
        payload.batch.parser_version,
        JSON.stringify(payload.batch.parser_metadata),
        JSON.stringify(payload.batch.routes),
      ],
    );
    const imported = importResult.rows[0].value;
    if (imported.route_count !== payload.batch.routes.length || imported.status !== "draft") {
      throw new Error(`${providerKey} draft import returned an unexpected result`);
    }
    const counts = await query(
      `select
        count(*) filter (where severity = 'error' and status = 'open')::integer as errors,
        count(*)::integer as anomalies
      from private.offerpsp_route_anomalies
      where batch_id = $1`,
      [imported.batch_id],
    );
    if (counts.rows[0].errors !== payload.batch.parser_metadata.blocking_anomaly_count) {
      throw new Error(`${providerKey} blocking anomaly count changed during import`);
    }
    const versionState = await query(
      `select
        count(distinct b.id) filter (where b.status = 'superseded')::integer as superseded_batches,
        count(*) filter (where r.status = 'archived')::integer as archived_routes,
        count(*) filter (where b.id = $2 and r.status in ('draft', 'review'))::integer as current_routes
      from private.offerpsp_rate_card_batches b
      join private.offerpsp_offer_routes r on r.batch_id = b.id
      where b.provider_id = (select id from private.offerpsp_providers where internal_code = $1)`,
      [providerCode, imported.batch_id],
    );
    if (
      versionState.rows[0].superseded_batches !== 1
      || versionState.rows[0].archived_routes !== legacyPayload.batch.routes.length
      || versionState.rows[0].current_routes !== expected.routes
    ) {
      throw new Error(`${providerKey} parser reparse did not supersede the previous draft cleanly: ${JSON.stringify(versionState.rows[0])}`);
    }
    const publishability = await query(
      `select r.client_title, r.coverage_scope, r.geos, r.currencies, r.methods
       from private.offerpsp_offer_routes r
       where r.batch_id = $1
         and r.status in ('draft', 'review')
         and (
           (r.coverage_scope = 'specific' and cardinality(r.geos) = 0)
           or cardinality(r.currencies) = 0
           or cardinality(r.methods) = 0
         )`,
      [imported.batch_id],
    );
    if (publishability.rows.length > 0 && expected.publishError === "A provider margin policy is required before publication") {
      throw new Error(`${providerKey} normalized routes lost required dimensions: ${JSON.stringify(publishability.rows)}`);
    }
    await expectQueryFailure(
      "select public.publish_offerpsp_rate_card($1)",
      [imported.batch_id],
      expected.publishError,
    );
    process.stdout.write(`PASS private draft ${providerKey}: ${imported.route_count} routes\n`);
  }
}

async function verifyOfferIngestionQueue() {
  await setUser(STAFF_ID);
  await setRole("authenticated");
  const unique = Date.now();
  const providerName = `Queue PSP ${unique}`;
  const sourceText = `Telegram fixture ${unique}\nGEO - India\nCurrency - INR\nMethod: UPI\nMDR PayIn - 7%`;
  const queued = await query(
    "select public.enqueue_offerpsp_source($1, 'telegram', $2, $3, '{}'::jsonb) as value",
    [providerName, sourceText, `tg:${unique}`],
  );
  if (queued.rows[0].value.status !== "queued" || queued.rows[0].value.duplicate) {
    throw new Error("Staff offer source did not enter the private ingestion queue");
  }

  const template = JSON.parse(await readFile(resolve(".private/imports/brpay-2026-07-23-v3.json"), "utf8"));
  const payload = {
    provider: {
      brand_name: providerName,
      website: null,
      strategic_priority: 50,
      margin_included_default: false,
    },
    batch: {
      source_reference: `tg:${unique}`,
      source_effective_date: null,
      parser_version: "offerpsp-source-parser-v3",
      parser_metadata: {
        ingestion_standard: "offerpsp-universal-source-v1",
        publication_allowed: false,
        blocking_anomaly_count: template.batch.routes[0].anomalies.filter((item) => item.severity === "error").length,
      },
      routes: [template.batch.routes[0]],
    },
  };

  await setRole("service_role");
  const claimed = await query("select public.claim_offerpsp_ingestion_jobs(5) as value");
  const claimedJob = claimed.rows[0].value.jobs.find((item) => item.id === queued.rows[0].value.job_id);
  if (!claimedJob || claimedJob.provider_name !== providerName) {
    throw new Error("Service worker did not atomically claim the queued offer source");
  }
  const completed = await query(
    "select public.complete_offerpsp_source($1, $2::jsonb) as value",
    [queued.rows[0].value.job_id, JSON.stringify(payload)],
  );
  if (completed.rows[0].value.status !== "review" || completed.rows[0].value.route_count !== 1) {
    throw new Error(`Service ingestion did not create a review draft: ${JSON.stringify(completed.rows[0].value)}`);
  }

  await setRole("authenticated");
  const transportRetry = await query(
    "select public.enqueue_offerpsp_source($1, 'telegram', $2, $3, '{}'::jsonb) as value",
    [providerName.toUpperCase(), sourceText, `tg:${unique}`],
  );
  const repeated = await query(
    "select public.enqueue_offerpsp_source($1, 'telegram', $2, $3, '{}'::jsonb) as value",
    [providerName.toUpperCase(), sourceText, `tg:${unique}:repeat`],
  );
  const list = await query("select public.list_offerpsp_ingestion_jobs(20) as value");
  const job = list.rows[0].value.find((item) => item.id === queued.rows[0].value.job_id);
  if (!transportRetry.rows[0].value.duplicate || repeated.rows[0].value.duplicate
      || repeated.rows[0].value.job_id === queued.rows[0].value.job_id
      || !job || job.status !== "review" || job.route_count !== 1) {
    throw new Error("Intake retry idempotency or versioned source acceptance failed");
  }

  const failureSource = `${sourceText}\nFailure fixture`;
  const failureQueued = await query(
    "select public.enqueue_offerpsp_source($1, 'telegram', $2, $3, '{}'::jsonb) as value",
    [providerName, failureSource, `tg:${unique}:failure`],
  );
  await setRole("service_role");
  await query("select public.claim_offerpsp_ingestion_jobs(5)");
  const failed = await query(
    "select public.fail_offerpsp_source($1, $2) as value",
    [failureQueued.rows[0].value.job_id, "Fixture parser failure"],
  );
  if (failed.rows[0].value.status !== "failed" || failed.rows[0].value.attempt_count !== 1) {
    throw new Error("Service worker failure did not preserve the queued source and error state");
  }
  await setRole("authenticated");

  const grants = await query(`select
    has_function_privilege('authenticated', 'public.enqueue_offerpsp_source(text,text,text,text,jsonb)', 'EXECUTE') as staff_enqueue,
    has_function_privilege('service_role', 'public.complete_offerpsp_source(uuid,jsonb)', 'EXECUTE') as service_complete,
    has_function_privilege('authenticated', 'public.complete_offerpsp_source(uuid,jsonb)', 'EXECUTE') as staff_complete,
    has_function_privilege('service_role', 'public.claim_offerpsp_ingestion_jobs(integer)', 'EXECUTE') as service_claim,
    has_function_privilege('authenticated', 'public.claim_offerpsp_ingestion_jobs(integer)', 'EXECUTE') as staff_claim,
    has_function_privilege('service_role', 'public.fail_offerpsp_source(uuid,text)', 'EXECUTE') as service_fail,
    has_function_privilege('authenticated', 'public.purge_offerpsp_ingestion_source(uuid)', 'EXECUTE') as staff_purge,
    has_function_privilege('anon', 'public.purge_offerpsp_ingestion_source(uuid)', 'EXECUTE') as anon_purge,
    has_function_privilege('anon', 'public.list_offerpsp_ingestion_jobs(integer)', 'EXECUTE') as anon_list,
    has_table_privilege('authenticated', 'private.offerpsp_ingestion_jobs', 'SELECT') as direct_table_read`);
  const boundary = grants.rows[0];
  if (!boundary.staff_enqueue || !boundary.service_complete || boundary.staff_complete
      || !boundary.service_claim || boundary.staff_claim || !boundary.service_fail
      || !boundary.staff_purge || boundary.anon_purge || boundary.anon_list || boundary.direct_table_read) {
    throw new Error("Offer ingestion queue grants are broader than the RPC-only contract");
  }

  const purgedFailure = await query("select public.purge_offerpsp_ingestion_source($1) as value", [failureQueued.rows[0].value.job_id]);
  await query("select public.set_offerpsp_ingestion_state($1, 'dismissed')", [repeated.rows[0].value.job_id]);
  const purgedRepeated = await query("select public.purge_offerpsp_ingestion_source($1) as value", [repeated.rows[0].value.job_id]);
  const purgedReview = await query("select public.purge_offerpsp_ingestion_source($1) as value", [queued.rows[0].value.job_id]);
  if (!purgedFailure.rows[0].value.success || !purgedRepeated.rows[0].value.success || !purgedReview.rows[0].value.success
      || !purgedReview.rows[0].value.provider_deleted) {
    throw new Error("Guarded ingestion source purge did not remove the draft fixture cleanly");
  }
  process.stdout.write("PASS Telegram/admin ingestion queue, draft import, deduplication and access boundary\n");
}

async function verifySupplyOperations() {
  await setUser(STAFF_ID);
  const providerResult = await query("select id from private.offerpsp_providers where replace(lower(brand_name), '-', '') like 'brpay%' limit 1");
  const providerId = providerResult.rows[0]?.id;
  if (!providerId) throw new Error("BRPay provider fixture is missing");

  const initial = await query("select public.get_offerpsp_supply_workspace($1) as value", [providerId]);
  const activeRoutes = initial.rows[0].value.routes.filter((route) => route.status !== "archived");
  if (activeRoutes.length !== 14 || initial.rows[0].value.batches.length !== 2) {
    throw new Error("Supply workspace does not expose the imported BRPay routes and version");
  }

  await query("select public.save_offerpsp_provider($1, $2::jsonb)", [providerId, JSON.stringify({ relationship_notes: "Validated through staff workspace", strategic_priority: 91 })]);
  const contact = await query("select public.save_offerpsp_provider_contact($1, null, $2::jsonb) as value", [providerId, JSON.stringify({ full_name: "Validation Contact", telegram: "@validation", preferred_channel: "telegram", active: true })]);
  await query("select public.save_offerpsp_provider_contact($1, $2, $3::jsonb)", [providerId, contact.rows[0].value.id, JSON.stringify({ full_name: "Validation Contact", role_title: "Account manager", telegram: "@validation", preferred_channel: "telegram", active: true })]);

  const route = activeRoutes[0];
  await query("select public.save_offerpsp_route($1, $2::jsonb)", [route.id, JSON.stringify({ operational_notes: "Route checked in supply workspace", freshness_days: 21 })]);
  await query("select public.set_offerpsp_margin_policy($1, $2, 'payin', 'percentage_points', 1.25, null, null, 'Validation route margin')", [providerId, route.id]);
  const anomaly = route.anomalies.find((item) => item.status === "open" && item.severity !== "error") || route.anomalies.find((item) => item.status === "open");
  if (anomaly) {
    await query("select public.resolve_offerpsp_route_anomaly($1, 'accepted', 'Confirmed against the original partner message')", [anomaly.id]);
  }
  await query("select public.confirm_offerpsp_provider_freshness($1)", [providerId]);

  const updated = await query("select public.get_offerpsp_supply_workspace($1) as value", [providerId]);
  const value = updated.rows[0].value;
  const savedRoute = value.routes.find((item) => item.id === route.id);
  if (value.provider.strategic_priority !== 91 || value.contacts.length !== 1 || savedRoute.freshness_days !== 21 || !value.margin_policies.some((item) => item.route_id === route.id && item.active) || value.activity.length < 5) {
    throw new Error("Supply workspace mutations or audit history were not persisted correctly");
  }

  const coverage = await query("select public.get_offerpsp_supply_coverage() as value");
  if (!Array.isArray(coverage.rows[0].value.routes) || coverage.rows[0].value.routes.length < 38 || !coverage.rows[0].value.routes.every((item) => item.provider_name && item.route_code && Array.isArray(item.currencies) && Array.isArray(item.methods))) {
    throw new Error("Supply coverage matrix does not expose the active normalized routes");
  }

  await setUser(OTHER_CLIENT_ID);
  await expectQueryFailure("select public.get_offerpsp_supply_workspace($1)", [providerId], "OfferPSP staff access required");
  await expectQueryFailure("select public.get_offerpsp_supply_coverage()", [], "OfferPSP staff access required");
  await setUser(STAFF_ID);
  process.stdout.write("PASS PSP profile, contact, route, anomaly, margin, freshness and audit operations\n");
}

async function verifyRouteLevelPublication() {
  await setUser(STAFF_ID);
  const provider = await query(
    "select public.upsert_offerpsp_provider('Route Publication Fixture', null, null, null, 'active', 1, true, 'Validation only') as value",
  );
  const providerCode = provider.rows[0].value.internal_code;
  const routes = [
    {
      client_title: "Valid route for partial publication",
      coverage_scope: "specific",
      geos: ["ZZ"],
      currencies: ["USD"],
      flow: "payin",
      methods: ["CARDS"],
      fees: [{ flow: "payin", fee_type: "percent", base_percent: 5, applies_on: "success" }],
      anomalies: [],
    },
    {
      client_title: "Excluded malformed route",
      coverage_scope: "specific",
      geos: ["ZZ"],
      currencies: ["USD"],
      flow: "payin",
      methods: [],
      fees: [{ flow: "payin", fee_type: "percent", base_percent: 5, applies_on: "success" }],
      anomalies: [{ code: "method_missing", severity: "error", field: "methods", message: "Validation error" }],
    },
  ];
  const imported = await query(
    "select public.import_offerpsp_rate_card($1, 'manual', 'route-level-publication-fixture', 'validation', current_date, 'fixture-v1', '{}'::jsonb, $2::jsonb) as value",
    [providerCode, JSON.stringify(routes)],
  );
  const batchId = imported.rows[0].value.batch_id;
  await expectQueryFailure(
    "select public.publish_offerpsp_rate_card($1)",
    [batchId],
    "Resolve or exclude every error-level route before publication",
  );
  const malformed = await query(
    "select id from private.offerpsp_offer_routes where batch_id = $1 and client_title = 'Excluded malformed route'",
    [batchId],
  );
  await query("select public.set_offerpsp_route_status($1, 'archived')", [malformed.rows[0].id]);
  const published = await query("select public.publish_offerpsp_rate_card($1) as value", [batchId]);
  const states = await query(
    "select status, count(*)::integer as count from private.offerpsp_offer_routes where batch_id = $1 group by status order by status",
    [batchId],
  );
  if (
    published.rows[0].value.route_count !== 1
    || states.rows.find((row) => row.status === "published")?.count !== 1
    || states.rows.find((row) => row.status === "archived")?.count !== 1
  ) {
    throw new Error(`Route-level publication changed excluded-route isolation: ${JSON.stringify(states.rows)}`);
  }
  process.stdout.write("PASS valid routes publish while malformed routes stay archived\n");
}

async function verifyIndividualOfferPublication() {
  await setUser(STAFF_ID);
  await setRole("authenticated");
  const provider = await query(
    "select public.upsert_offerpsp_provider('Individual Offer Fixture', null, null, null, 'active', 1, true, 'Validation only') as value",
  );
  const providerId = (await query(
    "select id from private.offerpsp_providers where internal_code = $1",
    [provider.rows[0].value.internal_code],
  )).rows[0].id;
  await query("select public.confirm_offerpsp_provider_freshness($1)", [providerId]);

  const payload = (title, geo, currency, method) => JSON.stringify({
    client_title: title,
    coverage_scope: "specific",
    geos: [geo],
    currencies: [currency],
    flow: "payin",
    methods: [method],
    freshness_days: 30,
    fees: [{ flow: "payin", fee_type: "percent", base_percent: 5, applies_on: "success" }],
    limits: [{ flow: "payin", currency, minimum_amount: 100, maximum_amount: 10000 }],
    settlements: [{ currency: "USDT", period: "T+1" }],
  });

  const first = await query(
    "select public.create_offerpsp_manual_route($1, $2::jsonb) as value",
    [providerId, payload("Independent route one", "IN", "INR", "UPI")],
  );
  const second = await query(
    "select public.create_offerpsp_manual_route($1, $2::jsonb) as value",
    [providerId, payload("Independent route two", "BR", "BRL", "PIX")],
  );
  await query("select public.publish_offerpsp_route($1)", [first.rows[0].value.route_id]);
  await query("select public.publish_offerpsp_route($1)", [second.rows[0].value.route_id]);

  const initialStates = await query(
    "select id, status from private.offerpsp_offer_routes where id = any($1::uuid[]) order by id",
    [[first.rows[0].value.route_id, second.rows[0].value.route_id]],
  );
  if (initialStates.rows.some((route) => route.status !== "published")) {
    throw new Error(`Publishing one offer changed an unrelated live offer: ${JSON.stringify(initialStates.rows)}`);
  }

  const revision = await query(
    "select public.revise_offerpsp_route($1) as value",
    [first.rows[0].value.route_id],
  );
  await query("select public.publish_offerpsp_route($1)", [revision.rows[0].value.route_id]);
  const finalStates = await query(
    "select id, status from private.offerpsp_offer_routes where id = any($1::uuid[])",
    [[first.rows[0].value.route_id, second.rows[0].value.route_id, revision.rows[0].value.route_id]],
  );
  const state = Object.fromEntries(finalStates.rows.map((route) => [route.id, route.status]));
  if (state[first.rows[0].value.route_id] !== "archived"
      || state[second.rows[0].value.route_id] !== "published"
      || state[revision.rows[0].value.route_id] !== "published") {
    throw new Error(`Offer revision did not isolate unrelated routes: ${JSON.stringify(finalStates.rows)}`);
  }

  const grants = await query(`select
    has_function_privilege('authenticated', 'public.publish_offerpsp_route(uuid)', 'EXECUTE') as staff_publish,
    has_function_privilege('anon', 'public.publish_offerpsp_route(uuid)', 'EXECUTE') as anon_publish`);
  if (!grants.rows[0].staff_publish || grants.rows[0].anon_publish) {
    throw new Error("Individual offer publication grants are broader than the staff-only contract");
  }
  await setUser(OTHER_CLIENT_ID);
  await expectQueryFailure(
    "select public.publish_offerpsp_route($1)",
    [revision.rows[0].value.route_id],
    "OfferPSP staff access required",
  );
  await setUser(STAFF_ID);
  process.stdout.write("PASS individual offer publication, revision isolation and staff-only boundary\n");
}

async function verifyImpactControlV4() {
  await setUser(STAFF_ID);
  await setRole("authenticated");

  const createProviderRoutes = async (name) => {
    const provider = await query(
      "select public.upsert_offerpsp_provider($1, null, null, null, 'active', 1, true, 'Impact Control fixture') as value",
      [name],
    );
    const providerId = (await query(
      "select id from private.offerpsp_providers where internal_code = $1",
      [provider.rows[0].value.internal_code],
    )).rows[0].id;
    await query("select public.confirm_offerpsp_provider_freshness($1)", [providerId]);
    const routePayload = (title) => JSON.stringify({
      client_title: title,
      coverage_scope: "specific",
      geos: ["IN"],
      currencies: ["INR"],
      flow: "payin",
      methods: ["UPI"],
      traffic_types: ["FTD"],
      verticals: ["IGAMING"],
      freshness_days: 30,
      fees: [{ flow: "payin", fee_type: "percent", base_percent: 6, applies_on: "success" }],
      limits: [{ flow: "payin", currency: "INR", minimum_amount: 100, maximum_amount: 10000 }],
      settlements: [{ currency: "USDT", period: "T+1" }],
    });
    const oldRoute = await query(
      "select public.create_offerpsp_manual_route($1, $2::jsonb) as value",
      [providerId, routePayload(`${name} old`)],
    );
    await query("select public.publish_offerpsp_route($1)", [oldRoute.rows[0].value.route_id]);
    const newRoute = await query(
      "select public.create_offerpsp_manual_route($1, $2::jsonb) as value",
      [providerId, routePayload(`${name} replacement`)],
    );
    await query(
      "select public.decide_offerpsp_route_replacement($1, 'replace', $2)",
      [newRoute.rows[0].value.route_id, oldRoute.rows[0].value.route_id],
    );
    return {
      providerId,
      oldRouteId: oldRoute.rows[0].value.route_id,
      newRouteId: newRoute.rows[0].value.route_id,
    };
  };

  const providerA = await createProviderRoutes("Impact Fixture A");
  const providerB = await createProviderRoutes("Impact Fixture B");
  const lead = await query(
    `insert into public.offerpsp_leads (
      name, work_email, company, company_url, vertical, monthly_volume, geos, methods,
      details, source, status, consent, target_geos, requested_currencies,
      requested_flows, requested_methods, traffic_types, expected_monthly_volume,
      volume_currency, min_transaction_amount, max_transaction_amount,
      transaction_currency, registration_geo, business_model, license_status,
      license_jurisdiction, launch_timeline, current_processing_setup, client_user_id
    ) values (
      'Impact Client', 'impact@example.com', 'Impact Merchant', 'https://impact.invalid',
      'iGaming', '500000 EUR', 'India', 'UPI', 'Impact Control validation', 'validation',
      'new', true, array['IN'], array['INR'], array['PAYIN'], array['UPI'], array['FTD'],
      500000, 'EUR', 100, 10000, 'INR', 'CY', 'Online casino', 'licensed', 'CY',
      'Immediate', 'Existing processing', $1
    ) returning lead_id`,
    [CLIENT_ID],
  );
  const leadId = lead.rows[0].lead_id;
  await clearPreCompliance(leadId);
  const shortlist = await query(
    "select public.create_offerpsp_manual_shortlist($1, $2::uuid[], 'Impact shortlist', 'Two route fixture', 'Validation') as value",
    [leadId, [providerA.oldRouteId, providerB.oldRouteId]],
  );
  const shortlistId = shortlist.rows[0].value.shortlist_id;
  await query("select public.share_offerpsp_shortlist($1)", [shortlistId]);

  await query("select public.set_offerpsp_route_status($1, 'paused')", [providerA.oldRouteId]);
  await query("select public.set_offerpsp_route_status($1, 'paused')", [providerB.oldRouteId]);
  const queue = await query(
    "select id, old_route_id from private.offerpsp_offer_update_queue where shortlist_id = $1 and status in ('pending','in_progress') order by old_route_id",
    [shortlistId],
  );
  if (queue.rows.length !== 2) {
    throw new Error(`Impact Control did not create two grouped update tasks: ${JSON.stringify(queue.rows)}`);
  }

  await query("select public.publish_offerpsp_route($1)", [providerA.newRouteId]);
  await query("select public.publish_offerpsp_route($1)", [providerB.newRouteId]);

  await setUser(CLIENT_ID);
  const staleOption = await query(
    "select public_code from public.offerpsp_shortlist_items where shortlist_id = $1 order by rank limit 1",
    [shortlistId],
  );
  await expectQueryFailure(
    "select public.respond_offerpsp_option($1, 'interested')",
    [staleOption.rows[0].public_code],
    "no longer available",
  );
  await setUser(STAFF_ID);

  const replacementByOldRoute = new Map([
    [providerA.oldRouteId, providerA.newRouteId],
    [providerB.oldRouteId, providerB.newRouteId],
  ]);
  const replacements = Object.fromEntries(queue.rows.map((item) => [item.id, replacementByOldRoute.get(item.old_route_id)]));
  await expectQueryFailure(
    "select public.create_offerpsp_shortlist_v_next_bulk($1, $2::jsonb, null, null, null)",
    [shortlistId, JSON.stringify({ [queue.rows[0].id]: replacements[queue.rows[0].id] })],
    "Every stale option must be replaced together",
  );

  const prepared = await query(
    "select public.create_offerpsp_shortlist_v_next_bulk($1, $2::jsonb, null, null, null) as value",
    [shortlistId, JSON.stringify(replacements)],
  );
  const preparedId = prepared.rows[0].value.new_shortlist_id;
  const preparedItems = await query(
    "select offer_route_id, route_staleness_status from public.offerpsp_shortlist_items where shortlist_id = $1 order by rank",
    [preparedId],
  );
  if (preparedItems.rows.length !== 2
      || preparedItems.rows.some((item) => item.route_staleness_status !== null)
      || new Set(preparedItems.rows.map((item) => item.offer_route_id)).size !== 2) {
    throw new Error(`Grouped vNext did not replace every stale option once: ${JSON.stringify(preparedItems.rows)}`);
  }

  const idempotent = await query(
    "select public.create_offerpsp_shortlist_v_next_bulk($1, $2::jsonb, null, null, null) as value",
    [shortlistId, JSON.stringify(replacements)],
  );
  if (!idempotent.rows[0].value.idempotent || idempotent.rows[0].value.new_shortlist_id !== preparedId) {
    throw new Error("Grouped vNext retry was not idempotent");
  }

  await query("select public.set_offerpsp_route_status($1, 'paused')", [providerA.newRouteId]);
  await expectQueryFailure(
    "select public.share_offerpsp_shortlist($1)",
    [preparedId],
    "unavailable route",
  );
  await query("select public.confirm_offerpsp_provider_freshness($1)", [providerA.providerId]);
  await query("select public.set_offerpsp_route_status($1, 'published')", [providerA.newRouteId]);
  await query("select public.share_offerpsp_shortlist($1)", [preparedId]);
  await query("select public.confirm_offerpsp_offer_updates_sent($1, 'Impact Control validation')", [shortlistId]);

  const finalQueue = await query(
    "select status, client_notified_at from private.offerpsp_offer_update_queue where shortlist_id = $1 order by id",
    [shortlistId],
  );
  const shortlistStates = await query(
    "select id, status from public.offerpsp_shortlists where id = any($1::uuid[]) order by version",
    [[shortlistId, preparedId]],
  );
  if (finalQueue.rows.some((item) => item.status !== "sent" || !item.client_notified_at)
      || shortlistStates.rows[0].status !== "archived"
      || shortlistStates.rows[1].status !== "shared") {
    throw new Error(`Impact Control did not finish atomically: ${JSON.stringify({ finalQueue: finalQueue.rows, shortlistStates: shortlistStates.rows })}`);
  }
  process.stdout.write("PASS Impact Control grouped replacement, stale-action block, share-time race guard and atomic completion\n");
}

async function runEndToEndFixture() {
  const providerResult = await query(
    `select public.upsert_offerpsp_provider(
      'Validation PSP', null, null, 'https://validation.invalid', 'active', 80, true, 'Local migration fixture'
    ) as value`,
  );
  const providerCode = providerResult.rows[0].value.internal_code;
  const sourceText = "Validation rate card v1: India INR UPI PayIn 6%, limit 100-100000 INR, T+1.";
  const routes = [{
    client_title: "India · INR · UPI PayIn",
    coverage_scope: "specific",
    geos: ["IN"],
    blocked_geos: [],
    currencies: ["INR"],
    flow: "payin",
    methods: ["UPI"],
    card_brands: ["VISA", "MASTERCARD"],
    traffic_types: ["FTD"],
    verticals: ["IGAMING"],
    prohibited_verticals: [],
    integrations: ["H2H"],
    niche_key: "IN|INR|PAYIN|UPI|FTD|IGAMING|H2H",
    effective_from: "2026-07-31",
    freshness_days: 30,
    risk_terms: { chargeback: "Chargeback penalty: NO", refund: "Refund fee: NO" },
    raw_block: "Card brands: Visa / MasterCard\nCard issue: India\nChargeback penalty: NO\nRefund fee: NO\nRR: 10% / 180d",
    fees: [{
      flow: "payin",
      traffic_tier: "FTD",
      method_scope: ["UPI"],
      region_scope: ["IN"],
      fee_type: "percent",
      base_percent: 6,
      applies_on: "success",
      source_text: "PayIn 6%",
    }],
    limits: [{
      flow: "payin",
      scope: "transaction",
      method_scope: ["UPI"],
      traffic_tier: "FTD",
      currency: "INR",
      minimum_amount: 100,
      maximum_amount: 100000,
      original_note: "100-100000 INR",
    }],
    settlement: [{
      currency: "USDT",
      fee_percent: 1,
      period: "T+1",
      weekdays: [],
      original_note: "USDT +1%, T+1",
    }],
    anomalies: [],
  }];
  const importResult = await query(
    `select public.import_offerpsp_rate_card(
      $1, 'manual', $2, 'migration-validation', '2026-07-31'::date,
      'validation-v1', '{}'::jsonb, $3::jsonb
    ) as value`,
    [providerCode, sourceText, JSON.stringify(routes)],
  );
  const batchId = importResult.rows[0].value.batch_id;
  const publishResult = await query(
    "select public.publish_offerpsp_rate_card($1) as value",
    [batchId],
  );
  if (publishResult.rows[0].value.status !== "published") {
    throw new Error("Validation rate card was not published");
  }
  const publishedRoute = await query("select id, provider_id from private.offerpsp_offer_routes where batch_id = $1", [batchId]);
  await query("select public.set_offerpsp_route_status($1, 'paused')", [publishedRoute.rows[0].id]);
  await query("update private.offerpsp_providers set last_verified_at = now() - interval '100 days' where id = $1", [publishedRoute.rows[0].provider_id]);
  await query("select public.set_offerpsp_route_status($1, 'published')", [publishedRoute.rows[0].id]);
  await query("select public.confirm_offerpsp_provider_freshness($1)", [publishedRoute.rows[0].provider_id]);

  const leadResult = await query(
    `insert into public.offerpsp_leads (
      name, work_email, telegram, company, company_url, vertical, monthly_volume,
      geos, methods, details, source, status, consent,
      target_geos, requested_currencies, requested_flows, requested_methods,
      traffic_types, expected_monthly_volume, volume_currency,
      min_transaction_amount, max_transaction_amount, transaction_currency,
      registration_geo, business_model, license_status, license_jurisdiction,
      launch_timeline, current_processing_setup
    ) values (
      'Client User', 'client@example.com', '@client', 'Merchant Ltd',
      'https://merchant.invalid', 'iGaming', '500000 USD', 'India', 'UPI',
      'Licensed iGaming merchant seeking India UPI PayIn.', 'validation', 'new', true,
      array['IN'], array['INR'], array['PAYIN'], array['UPI'], array['FTD'],
      500000, 'USD', 500, 50000, 'INR', 'CY', 'Online casino',
      'licensed', 'CY', 'Immediate', 'Existing card processing'
    ) returning lead_id`,
  );
  const leadId = leadResult.rows[0].lead_id;
  await clearPreCompliance(leadId);
  await query("update public.offerpsp_leads set client_user_id = $1 where lead_id = $2", [CLIENT_ID, leadId]);

  const unrelatedRoute = await query(`
    select r.id
    from private.offerpsp_offer_routes r
    join private.offerpsp_providers p on p.id = r.provider_id
    where p.brand_name = 'Route Publication Fixture'
      and r.client_title = 'Valid route for partial publication'
      and r.status = 'published'
    limit 1
  `);
  const manualShortlist = await query(
    "select public.create_offerpsp_manual_shortlist($1, array[$2::uuid], 'Manual offer', 'A custom proposal.', 'Sent outside automatic matching.') as value",
    [leadId, unrelatedRoute.rows[0].id],
  );
  if (manualShortlist.rows[0].value.selection_mode !== "manual") {
    throw new Error("Manual shortlist did not report its selection mode");
  }
  await query("select public.share_offerpsp_shortlist($1)", [manualShortlist.rows[0].value.shortlist_id]);
  await setUser(CLIENT_ID);
  const manualOptions = await query("select * from public.list_offerpsp_client_options($1)", [leadId]);
  if (manualOptions.rows.length !== 1 || manualOptions.rows[0].route_title !== "Valid route for partial publication") {
    throw new Error(`Manual route outside matching was not visible to the client: ${JSON.stringify(manualOptions.rows)}`);
  }
  if (/Route Publication Fixture|provider_id|offer_route_id|base_percent|margin_mode/i.test(JSON.stringify(manualOptions.rows[0]))) {
    throw new Error("Manual client offer leaked private provider or pricing data");
  }
  await setUser(STAFF_ID);

  const matchResult = await query(
    "select public.rebuild_offerpsp_route_matches($1) as value",
    [leadId],
  );
  if (matchResult.rows[0].value.match_count !== 1) {
    throw new Error(`Expected one eligible route, received ${matchResult.rows[0].value.match_count}`);
  }
  const matches = await query("select public.list_offerpsp_route_matches($1) as value", [leadId]);
  const matchId = matches.rows[0].value[0].match_id;
  const shortlistResult = await query(
    "select public.create_offerpsp_route_shortlist($1, array[$2::uuid]) as value",
    [leadId, matchId],
  );
  const shortlistId = shortlistResult.rows[0].value.shortlist_id;
  await query("select public.rebuild_offerpsp_route_matches($1)", [leadId]);
  const refreshedMatches = await query("select public.list_offerpsp_route_matches($1) as value", [leadId]);
  if (refreshedMatches.rows[0].value.length !== 1) {
    throw new Error("Route matching retained stale reviewed matches after rebuild");
  }
  await query("select public.share_offerpsp_shortlist($1)", [shortlistId]);
  const replacementShortlist = await query(
    "select public.create_offerpsp_route_shortlist($1, array[$2::uuid]) as value",
    [leadId, refreshedMatches.rows[0].value[0].match_id],
  );
  await query("select public.share_offerpsp_shortlist($1)", [replacementShortlist.rows[0].value.shortlist_id]);
  const shortlistVersions = await query(
    "select id, status from public.offerpsp_shortlists where id = any($1::uuid[]) order by version",
    [[shortlistId, replacementShortlist.rows[0].value.shortlist_id]],
  );
  if (shortlistVersions.rows[0].status !== "archived" || shortlistVersions.rows[1].status !== "shared") {
    throw new Error(`Sharing a replacement did not archive the previous shortlist: ${JSON.stringify(shortlistVersions.rows)}`);
  }

  await setUser(CLIENT_ID);
  await expectQueryFailure(
    "select public.list_offerpsp_supply()",
    [],
    "OfferPSP staff access required",
  );
  const clientOptions = await query("select * from public.list_offerpsp_client_options($1)", [leadId]);
  if (clientOptions.rows.length !== 1) throw new Error("Client shortlist did not return one option");
  const clientPayload = JSON.stringify(clientOptions.rows[0]);
  if (/Validation PSP|validation\.invalid|provider_id|offer_route_id|base_percent|margin_mode/i.test(clientPayload)) {
    throw new Error("Client shortlist leaked internal provider or pricing data");
  }
  const clientOffers = await query("select * from public.list_offerpsp_client_offers($1)", [leadId]);
  if (
    clientOffers.rows.length !== 1
    || clientOffers.rows[0].coverage_scope !== "specific"
    || JSON.stringify(clientOffers.rows[0].card_brands) !== JSON.stringify(["VISA", "MASTERCARD"])
    || clientOffers.rows[0].card_issue !== "India"
    || clientOffers.rows[0].risk_terms.chargeback !== "Chargeback penalty: NO"
    || clientOffers.rows[0].risk_terms.rolling_reserve !== "RR: 10% / 180d"
  ) {
    throw new Error(`Client offer display fields are incomplete: ${JSON.stringify(clientOffers.rows)}`);
  }
  if (/fee_percent|fixed_fee|Validation PSP|provider_id|offer_route_id|base_percent|margin_mode/i.test(JSON.stringify(clientOffers.rows[0].settlement))) {
    throw new Error("Client offer display leaked private source settlement or provider pricing data");
  }
  const dossierUpdate = await query(
    "select public.update_offerpsp_client_dossier($1, $2::jsonb) as value",
    [leadId, JSON.stringify({
      launch_timeline: "Within two weeks",
      requested_methods: ["UPI"],
      requested_flows: ["PAYIN"],
    })],
  );
  if (!dossierUpdate.rows[0].value.complete) {
    throw new Error(`Client dossier update unexpectedly became incomplete: ${JSON.stringify(dossierUpdate.rows[0].value)}`);
  }
  const clientProfile = await query(
    "select public.get_offerpsp_client_request_profile($1) as value",
    [leadId],
  );
  if (!clientProfile.rows[0].value.complete || clientProfile.rows[0].value.launch_timeline !== "Within two weeks") {
    throw new Error(`Client-safe profile projection is incomplete: ${JSON.stringify(clientProfile.rows[0].value)}`);
  }
  await setUser(OTHER_CLIENT_ID);
  const foreignOptions = await query("select * from public.list_offerpsp_client_options($1)", [leadId]);
  if (foreignOptions.rows.length !== 0) throw new Error("Foreign client can read another merchant's shortlist");
  await expectQueryFailure(
    "select public.update_offerpsp_client_dossier($1, '{}'::jsonb)",
    [leadId],
    "OfferPSP request not found",
  );
  await expectQueryFailure(
    "select public.get_offerpsp_client_request_profile($1)",
    [leadId],
    "OfferPSP request not found",
  );
  await setUser(CLIENT_ID);
  const optionCode = clientOptions.rows[0].option_code;
  await query("select public.respond_offerpsp_option($1, 'interested')", [optionCode]);
  const requestResult = await query(
    "select public.request_offerpsp_introduction($1) as value",
    [optionCode],
  );
  if (requestResult.rows[0].value.status !== "ready") {
    throw new Error("Complete merchant dossier was not marked ready");
  }

  await setUser(STAFF_ID);
  const staffWorkspace = await query(
    "select public.get_offerpsp_staff_request_workspace($1) as value",
    [leadId],
  );
  if (staffWorkspace.rows[0].value.shortlist_items.length < 2
      || !staffWorkspace.rows[0].value.shortlist_items.some((item) => item.provider_name === "Validation PSP")) {
    throw new Error(`Staff request workspace is incomplete: ${JSON.stringify(staffWorkspace.rows[0].value)}`);
  }
  const item = await query(
    "select id from public.offerpsp_shortlist_items where public_code = $1",
    [optionCode],
  );
  const reviewResult = await query(
    "select public.submit_offerpsp_dossier_for_review($1, 'telegram', 'validation') as value",
    [item.rows[0].id],
  );
  const firstReviewId = reviewResult.rows[0].value.review_id;
  await query(
    "select public.record_offerpsp_provider_review($1, 'needs_info', 'Clarification requested', 'Confirm processing history')",
    [firstReviewId],
  );
  await setUser(CLIENT_ID);
  const clarificationProfile = await query(
    "select public.get_offerpsp_client_request_profile($1) as value",
    [leadId],
  );
  if (clarificationProfile.rows[0].value.psp_requested_information !== "Confirm processing history") {
    throw new Error("PSP information request did not reach the client task projection");
  }
  await setUser(STAFF_ID);
  const secondReviewResult = await query(
    "select public.submit_offerpsp_dossier_for_review($1, 'telegram', 'validation-round-2') as value",
    [item.rows[0].id],
  );
  if (secondReviewResult.rows[0].value.review_round !== 2) {
    throw new Error("PSP clarification flow did not create review round 2");
  }
  const reviewId = secondReviewResult.rows[0].value.review_id;
  await query("select public.record_offerpsp_provider_review($1, 'accepted', 'Approved', null)", [reviewId]);
  const introductionPack = await query(
    "select public.prepare_offerpsp_introduction($1, 'ru') as value",
    [reviewId],
  );
  if (!introductionPack.rows[0].value.telegram.group_title.includes("Merchant Ltd")
      || !introductionPack.rows[0].value.telegram.message.includes("PSP")
      || !introductionPack.rows[0].value.zoom.agenda.includes("Повестка")
      || introductionPack.rows[0].value.checklist.length !== 5) {
    throw new Error(`Introduction preparation pack is incomplete: ${JSON.stringify(introductionPack.rows[0].value)}`);
  }
  const englishPack = await query(
    "select public.prepare_offerpsp_introduction($1, 'en') as value",
    [reviewId],
  );
  if (!englishPack.rows[0].value.telegram.message.includes("introducing")
      || !englishPack.rows[0].value.zoom.agenda.includes("30-minute agenda")) {
    throw new Error("English introduction templates were not rendered");
  }
  const introResult = await query(
    "select public.record_offerpsp_telegram_introduction($1, 'Validation group', 'https://t.me/validation') as value",
    [reviewId],
  );
  const introductionId = introResult.rows[0].value.introduction_id;
  await query(
    "select public.record_offerpsp_zoom($1, 'https://zoom.invalid/meeting', '2026-08-01T12:00:00Z'::timestamptz)",
    [introductionId],
  );
  await expectQueryFailure(
    "select public.record_offerpsp_telegram_introduction($1, 'Late group update', 'https://t.me/late')",
    [reviewId],
    "already advanced beyond Telegram setup",
  );
  const outcomeResult = await query(
    `select public.record_offerpsp_deal_outcome($1, $2::jsonb) as value`,
    [introductionId, JSON.stringify({
      result: "won",
      reason_code: "launched",
      integration_status: "live",
      live_at: "2026-08-02T12:00:00Z",
      actual_monthly_volume: 125000,
      volume_currency: "eur",
      quality_score: 5,
      notes: "Validation complete",
    })],
  );
  if (outcomeResult.rows[0].value.provider_id || outcomeResult.rows[0].value.route_id) {
    throw new Error("Deal outcome response exposes private provider identifiers");
  }
  const finalLead = await query("select status from public.offerpsp_leads where lead_id = $1", [leadId]);
  if (finalLead.rows[0].status !== "won") throw new Error("Introduction pipeline did not finish as won");

  const dealHistory = await query("select public.get_offerpsp_deal_history($1) as value", [leadId]);
  const historyValue = dealHistory.rows[0].value;
  if (historyValue.outcomes.length !== 1
      || historyValue.outcomes[0].reason_code !== "launched"
      || historyValue.outcomes[0].actual_monthly_volume !== 125000
      || historyValue.outcomes[0].volume_currency !== "EUR"
      || historyValue.metrics.hours_to_telegram == null
      || !historyValue.history.some((entry) => entry.activity_type === "deal_outcome_recorded")) {
    throw new Error(`Structured deal history is incomplete: ${JSON.stringify(historyValue)}`);
  }

  await query(
    `select public.record_offerpsp_deal_outcome($1, $2::jsonb)`,
    [introductionId, JSON.stringify({
      result: "won",
      reason_code: "launched",
      integration_status: "live",
      actual_monthly_volume: 150000,
      volume_currency: "EUR",
      quality_score: 4,
      notes: "Updated after first processing month",
    })],
  );
  const outcomeCount = await query(
    "select count(*)::int as count, max(actual_monthly_volume)::numeric as volume from private.offerpsp_deal_outcomes where introduction_id = $1",
    [introductionId],
  );
  if (outcomeCount.rows[0].count !== 1 || Number(outcomeCount.rows[0].volume) !== 150000) {
    throw new Error("Deal outcome update created a duplicate or did not persist the new volume");
  }

  await setUser(CLIENT_ID);
  const deals = await query("select * from public.list_offerpsp_client_deals($1)", [leadId]);
  if (deals.rows.length !== 1 || deals.rows[0].status !== "won"
      || deals.rows[0].telegram_group_url !== "https://t.me/validation"
      || deals.rows[0].zoom_url !== "https://zoom.invalid/meeting") {
    throw new Error(`Client-safe deal projection is incomplete: ${JSON.stringify(deals.rows)}`);
  }
  if (/provider_id|route_id|result_notes|internal_notes/i.test(JSON.stringify(deals.fields))) {
    throw new Error("Client-safe deal projection exposes private field names");
  }
  await setUser(OTHER_CLIENT_ID);
  const foreignDeals = await query("select * from public.list_offerpsp_client_deals($1)", [leadId]);
  if (foreignDeals.rows.length !== 0) throw new Error("Foreign client can read another merchant's deal");
  await expectQueryFailure(
    "select public.get_offerpsp_staff_request_workspace($1)",
    [leadId],
    "OfferPSP staff access required",
  );
  await expectQueryFailure(
    "select public.get_offerpsp_deal_history($1)",
    [leadId],
    "OfferPSP staff access required",
  );
  await expectQueryFailure(
    "select public.prepare_offerpsp_introduction($1, 'ru')",
    [reviewId],
    "OfferPSP staff access required",
  );
  const outcomeGrants = await query(`select
    has_function_privilege('authenticated', 'public.record_offerpsp_deal_outcome(uuid,jsonb)', 'EXECUTE') as staff_record,
    has_function_privilege('authenticated', 'public.get_offerpsp_deal_history(uuid)', 'EXECUTE') as staff_history,
    has_function_privilege('anon', 'public.record_offerpsp_deal_outcome(uuid,jsonb)', 'EXECUTE') as anon_record,
    has_function_privilege('anon', 'public.get_offerpsp_deal_history(uuid)', 'EXECUTE') as anon_history,
    has_table_privilege('authenticated', 'private.offerpsp_deal_outcomes', 'SELECT') as staff_table,
    has_table_privilege('anon', 'private.offerpsp_deal_outcomes', 'SELECT') as anon_table
  `);
  if (!outcomeGrants.rows[0].staff_record || !outcomeGrants.rows[0].staff_history
      || outcomeGrants.rows[0].anon_record || outcomeGrants.rows[0].anon_history
      || outcomeGrants.rows[0].staff_table || outcomeGrants.rows[0].anon_table) {
    throw new Error("Deal outcome API grants expose the private outcome table or anonymous RPC access");
  }
  const preparationGrants = await query(`select
    has_function_privilege('authenticated', 'public.prepare_offerpsp_introduction(uuid,text)', 'EXECUTE') as staff_prepare,
    has_function_privilege('anon', 'public.prepare_offerpsp_introduction(uuid,text)', 'EXECUTE') as anon_prepare,
    has_table_privilege('authenticated', 'private.offerpsp_introduction_templates', 'SELECT') as staff_templates,
    has_table_privilege('authenticated', 'private.offerpsp_introduction_preparations', 'SELECT') as staff_preparations
  `);
  if (!preparationGrants.rows[0].staff_prepare || preparationGrants.rows[0].anon_prepare
      || preparationGrants.rows[0].staff_templates || preparationGrants.rows[0].staff_preparations) {
    throw new Error("Introduction preparation grants expose templates or generated packs");
  }

  process.stdout.write("PASS end-to-end private offer → dossier → PSP review → Telegram → Zoom → structured won outcome\n");
}

async function verifyAgentWorkspaceAndPricing() {
  await setUser(STAFF_ID);
  const organizations = await query(`
    insert into public.offerpsp_organizations (organization_type, name, status, created_by)
    values
      ('agent', 'Validation Agent', 'active', $1),
      ('merchant', 'Agent Merchant Org', 'active', $1)
    returning id, organization_type
  `, [STAFF_ID]);
  const agentOrgId = organizations.rows.find((row) => row.organization_type === "agent").id;
  const merchantOrgId = organizations.rows.find((row) => row.organization_type === "merchant").id;
  const primaryMember = await query(
    "select public.save_offerpsp_organization_member($1, null, 'agent@example.com', 'owner', true) as value",
    [agentOrgId],
  );
  await expectQueryFailure(
    "select public.save_offerpsp_organization_member($1, $2, 'agent@example.com', 'manager', true)",
    [agentOrgId, primaryMember.rows[0].value.id],
    "Organization must keep at least one active owner",
  );
  await query(
    "select public.save_offerpsp_organization_member($1, null, 'client@example.com', 'owner', true)",
    [agentOrgId],
  );
  await query(
    "select public.save_offerpsp_organization_member($1, $2, 'agent@example.com', 'manager', true)",
    [agentOrgId, primaryMember.rows[0].value.id],
  );
  const memberRegistry = await query(
    "select public.get_offerpsp_organization_members($1) as value",
    [agentOrgId],
  );
  if (memberRegistry.rows[0].value.length !== 2
      || !memberRegistry.rows[0].value.some((member) => member.email === "agent@example.com" && member.role === "manager")) {
    throw new Error(`Organization member registry is incomplete: ${JSON.stringify(memberRegistry.rows[0].value)}`);
  }
  await query(`
    insert into public.offerpsp_agent_clients (
      agent_organization_id, merchant_organization_id, status, created_by
    ) values ($1, $2, 'active', $3)
  `, [agentOrgId, merchantOrgId, STAFF_ID]);

  const lead = await query(`
    insert into public.offerpsp_leads (
      name, work_email, telegram, company, company_url, vertical, monthly_volume,
      geos, methods, details, source, status, consent,
      target_geos, requested_currencies, requested_flows, requested_methods,
      traffic_types, expected_monthly_volume, volume_currency,
      min_transaction_amount, max_transaction_amount, transaction_currency,
      registration_geo, business_model, license_status, license_jurisdiction,
      launch_timeline, current_processing_setup,
      merchant_organization_id, agent_organization_id
    ) values (
      'Agent Merchant', 'managed@example.com', '@managed', 'Managed Merchant Ltd',
      'https://managed.invalid', 'iGaming', '400000 USD', 'India', 'UPI',
      'Agent-managed validation lead', 'agent-validation', 'new', true,
      array['IN'], array['INR'], array['PAYIN'], array['UPI'], array['FTD'],
      400000, 'USD', 500, 50000, 'INR', 'CY', 'Online casino',
      'licensed', 'CY', 'Immediate', 'Existing processing', $1, $2
    ) returning lead_id
  `, [merchantOrgId, agentOrgId]);
  const leadId = lead.rows[0].lead_id;
  await clearPreCompliance(leadId, "subagent");
  await query("select public.rebuild_offerpsp_route_matches($1)", [leadId]);
  const matches = await query("select public.list_offerpsp_route_matches($1) as value", [leadId]);
  const matchId = matches.rows[0].value[0].match_id;
  await expectQueryFailure(
    "select public.create_offerpsp_route_shortlist($1, array[$2::uuid])",
    [leadId, matchId],
    "OfferPSP or agent margin is missing",
  );

  const route = await query(`
    select r.id
    from private.offerpsp_offer_routes r
    where r.client_title = 'India · INR · UPI PayIn'
      and r.status = 'published'
    order by r.created_at desc
    limit 1
  `);
  await query(`
    insert into private.offerpsp_agent_margin_policies (
      agent_organization_id, merchant_organization_id, route_id, flow,
      mode, percent_value, notes, created_by
    ) values ($1, $2, $3, 'payin', 'percentage_points', 1, 'Validation agent markup', $4)
  `, [agentOrgId, merchantOrgId, route.rows[0].id, STAFF_ID]);
  const shortlist = await query(
    "select public.create_offerpsp_route_shortlist($1, array[$2::uuid]) as value",
    [leadId, matchId],
  );
  await query("select public.share_offerpsp_shortlist($1)", [shortlist.rows[0].value.shortlist_id]);

  const commission = await query(
    "select public.save_offerpsp_agent_commission($1, null, $2::jsonb) as value",
    [agentOrgId, JSON.stringify({
      merchant_organization_id: merchantOrgId,
      lead_id: leadId,
      basis: "revenue_share",
      basis_amount: 10000,
      commission_percent: 5,
      amount: 500,
      currency: "EUR",
      period_start: "2026-08-01",
      period_end: "2026-08-31",
      notes: "Validation commission",
    })],
  );
  const commissionId = commission.rows[0].value.id;
  await expectQueryFailure(
    "select public.set_offerpsp_agent_commission_status($1, 'paid')",
    [commissionId],
    "Invalid commission status transition",
  );
  await query("select public.set_offerpsp_agent_commission_status($1, 'approved')", [commissionId]);
  await query("select public.set_offerpsp_agent_commission_status($1, 'earned')", [commissionId]);
  await query("select public.set_offerpsp_agent_commission_status($1, 'paid')", [commissionId]);
  await expectQueryFailure(
    "select public.save_offerpsp_agent_commission($1, $2, $3::jsonb)",
    [agentOrgId, commissionId, JSON.stringify({ amount: 900, currency: "EUR" })],
    "Only projected commissions can be edited",
  );
  const ledger = await query("select public.list_offerpsp_agent_commissions($1) as value", [agentOrgId]);
  if (ledger.rows[0].value.length !== 1
      || ledger.rows[0].value[0].status !== "paid"
      || !ledger.rows[0].value[0].paid_at
      || ledger.rows[0].value[0].merchant_name !== "Agent Merchant Org") {
    throw new Error(`Agent commission workflow is incomplete: ${JSON.stringify(ledger.rows[0].value)}`);
  }
  const commissionGrants = await query(`select
    has_function_privilege('authenticated', 'public.list_offerpsp_agent_commissions(uuid)', 'EXECUTE') as staff_list,
    has_function_privilege('authenticated', 'public.save_offerpsp_agent_commission(uuid,uuid,jsonb)', 'EXECUTE') as staff_save,
    has_function_privilege('authenticated', 'public.set_offerpsp_agent_commission_status(uuid,text,text)', 'EXECUTE') as staff_status,
    has_function_privilege('anon', 'public.list_offerpsp_agent_commissions(uuid)', 'EXECUTE') as anon_list,
    has_table_privilege('authenticated', 'private.offerpsp_agent_commissions', 'SELECT') as direct_read
  `);
  if (!commissionGrants.rows[0].staff_list || !commissionGrants.rows[0].staff_save
      || !commissionGrants.rows[0].staff_status || commissionGrants.rows[0].anon_list
      || commissionGrants.rows[0].direct_read) {
    throw new Error("Agent commission grants are unsafe");
  }

  const savedBrand = await query(
    "select public.save_offerpsp_agent_brand_settings($1, $2::jsonb) as value",
    [agentOrgId, JSON.stringify({
      co_brand_enabled: true,
      brand_display_name: "Validation Pay",
      brand_tagline_ru: "Платёжный партнёр",
      brand_tagline_en: "Payment partner",
      brand_logo_url: "https://example.com/logo.png",
      brand_accent_color: "#2457FF",
      brand_support_email: "support@example.com",
    })],
  );
  if (!savedBrand.rows[0].value.co_brand_enabled
      || savedBrand.rows[0].value.brand_display_name !== "Validation Pay"
      || savedBrand.rows[0].value.brand_accent_color !== "#2457FF") {
    throw new Error(`Agent co-brand settings were not saved: ${JSON.stringify(savedBrand.rows[0].value)}`);
  }
  await expectQueryFailure(
    "select public.save_offerpsp_agent_brand_settings($1, $2::jsonb)",
    [agentOrgId, JSON.stringify({ co_brand_enabled: true, brand_display_name: "Unsafe", brand_logo_url: "javascript:alert(1)" })],
    "Brand logo URL must use HTTPS",
  );
  const brandGrants = await query(`select
    has_function_privilege('authenticated', 'public.get_offerpsp_agent_brand_settings(uuid)', 'EXECUTE') as staff_get,
    has_function_privilege('authenticated', 'public.save_offerpsp_agent_brand_settings(uuid,jsonb)', 'EXECUTE') as staff_save,
    has_function_privilege('authenticated', 'public.get_offerpsp_my_agent_brand(uuid)', 'EXECUTE') as member_get,
    has_function_privilege('anon', 'public.get_offerpsp_agent_brand_settings(uuid)', 'EXECUTE') as anon_staff_get,
    has_function_privilege('anon', 'public.save_offerpsp_agent_brand_settings(uuid,jsonb)', 'EXECUTE') as anon_staff_save,
    has_function_privilege('anon', 'public.get_offerpsp_my_agent_brand(uuid)', 'EXECUTE') as anon_member_get
  `);
  if (!brandGrants.rows[0].staff_get || !brandGrants.rows[0].staff_save || !brandGrants.rows[0].member_get
      || brandGrants.rows[0].anon_staff_get || brandGrants.rows[0].anon_staff_save || brandGrants.rows[0].anon_member_get) {
    throw new Error("Agent co-brand RPC grants are unsafe");
  }

  await setUser(AGENT_ID);
  const memberBrand = await query("select public.get_offerpsp_my_agent_brand($1) as value", [agentOrgId]);
  if (memberBrand.rows[0].value.brand_display_name !== "Validation Pay"
      || memberBrand.rows[0].value.brand_support_email !== "support@example.com") {
    throw new Error(`Agent member cannot load safe co-brand settings: ${JSON.stringify(memberBrand.rows[0].value)}`);
  }
  const workspace = await query("select * from public.list_offerpsp_workspace_requests()");
  if (!workspace.rows.some((row) => row.lead_id === leadId && row.access_mode === "agent")) {
    throw new Error("Active agent cannot see the assigned merchant workspace");
  }
  const options = await query("select * from public.list_offerpsp_client_offers($1)", [leadId]);
  if (options.rows.length !== 1 || Number(options.rows[0].client_fees[0].client_percent) !== 7) {
    throw new Error(`Agent final merchant rate is incorrect: ${JSON.stringify(options.rows)}`);
  }
  if (/agent_margin|margin_mode|base_percent|provider_id|offer_route_id/i.test(JSON.stringify(options.rows[0]))) {
    throw new Error("Agent/client shortlist leaks private pricing or provider fields");
  }
  await query("select public.respond_offerpsp_option($1, 'interested')", [options.rows[0].option_code]);
  const agentLead = await query("select status from public.offerpsp_leads where lead_id = $1", [leadId]);
  if (agentLead.rows[0].status !== "option_selected") {
    throw new Error("Authorized agent cannot act on behalf of the assigned merchant");
  }

  await setUser(OTHER_CLIENT_ID);
  const foreignBrand = await query("select public.get_offerpsp_my_agent_brand($1) as value", [agentOrgId]);
  if (foreignBrand.rows[0].value !== null) {
    throw new Error("Foreign client can read agent co-brand settings");
  }
  const foreignWorkspace = await query("select * from public.list_offerpsp_workspace_requests()");
  const foreignOptions = await query("select * from public.list_offerpsp_client_offers($1)", [leadId]);
  if (foreignWorkspace.rows.some((row) => row.lead_id === leadId) || foreignOptions.rows.length) {
    throw new Error("Foreign client can access an agent-managed merchant");
  }
  await expectQueryFailure(
    "select public.get_offerpsp_organization_members($1)",
    [agentOrgId],
    "OfferPSP staff access required",
  );
  await expectQueryFailure(
    "select public.save_offerpsp_organization_member($1, null, 'other@example.com', 'viewer', true)",
    [agentOrgId],
    "OfferPSP staff access required",
  );
  const memberGrants = await query(`select
    has_function_privilege('authenticated', 'public.get_offerpsp_organization_members(uuid)', 'EXECUTE') as staff_list,
    has_function_privilege('authenticated', 'public.save_offerpsp_organization_member(uuid,uuid,text,text,boolean)', 'EXECUTE') as staff_save,
    has_function_privilege('anon', 'public.get_offerpsp_organization_members(uuid)', 'EXECUTE') as anon_list,
    has_function_privilege('anon', 'public.save_offerpsp_organization_member(uuid,uuid,text,text,boolean)', 'EXECUTE') as anon_save
  `);
  if (!memberGrants.rows[0].staff_list || !memberGrants.rows[0].staff_save
      || memberGrants.rows[0].anon_list || memberGrants.rows[0].anon_save) {
    throw new Error("Organization member management RPC grants are unsafe");
  }
  process.stdout.write("PASS agent ownership, resale rate, commission workflow and foreign isolation\n");
}

async function verifyEntityLifecycle() {
  await setUser(STAFF_ID);
  const provider = await query(
    "select public.save_offerpsp_managed_provider(null, $1::jsonb) as value",
    [JSON.stringify({
      brand_name: "Future PSP",
      relationship_status: "active",
      relationship_tier: "top",
      strategic_priority: 90,
      margin_included_default: false,
      relationship_notes: "Generic lifecycle validation",
    })],
  );
  const providerId = provider.rows[0].value.id;
  if (provider.rows[0].value.relationship_tier !== "top") {
    throw new Error("Managed provider tier was not saved");
  }

  const manualOffer = await query(
    "select public.create_offerpsp_manual_route($1, $2::jsonb) as value",
    [providerId, JSON.stringify({
      client_title: "India · INR · UPI Pay-in",
      flow: "payin",
      coverage_scope: "specific",
      geos: ["IN"],
      currencies: ["INR"],
      methods: ["UPI"],
      traffic_types: ["FTD"],
      verticals: ["IGAMING"],
      integrations: ["API"],
      fees: [{ flow: "payin", fee_type: "percent", base_percent: 5, applies_on: "success" }],
      limits: [{ flow: "payin", currency: "INR", minimum_amount: 500, maximum_amount: 100000 }],
      settlements: [{ currency: "USDT", fee_percent: 1, period: "T+1" }],
      source_reference: "Manual validation offer",
    })],
  );
  const routeId = manualOffer.rows[0].value.route_id;
  const route = await query("select status, geos, currencies from private.offerpsp_offer_routes where id = $1", [routeId]);
  if (route.rows[0].status !== "review" || route.rows[0].geos[0] !== "IN" || route.rows[0].currencies[0] !== "INR") {
    throw new Error("Manual offer did not create an editable normalized route");
  }
  const revision = await query("select public.revise_offerpsp_route($1) as value", [routeId]);
  const revisionRow = await query(
    "select revision_of_route_id, status from private.offerpsp_offer_routes where id = $1",
    [revision.rows[0].value.route_id],
  );
  if (revisionRow.rows[0].revision_of_route_id !== routeId || revisionRow.rows[0].status !== "review") {
    throw new Error("Offer revision did not preserve its source route");
  }

  await query(
    "select public.set_offerpsp_margin_policy($1, null, 'all', 'percentage_points', 0.5, null, null, 'Initial')",
    [providerId],
  );
  await query(
    "select public.set_offerpsp_margin_policy($1, null, 'all', 'percentage_points', 0.3, null, null, 'Changed')",
    [providerId],
  );
  const providerMargins = await query(`
    select active, percent_value, effective_to
    from private.offerpsp_margin_policies
    where provider_id = $1 and route_id is null and flow = 'all'
    order by created_at
  `, [providerId]);
  if (providerMargins.rows.length !== 2 || providerMargins.rows[0].active
      || providerMargins.rows[0].effective_to === null || !providerMargins.rows[1].active
      || Number(providerMargins.rows[1].percent_value) !== 0.3) {
    throw new Error("Provider margin versions did not close the old rate and activate the new rate");
  }

  const organizations = [];
  for (const [type, name] of [["agent", "Lifecycle Agent"], ["merchant", "Lifecycle Merchant Org"]]) {
    const saved = await query(
      "select public.save_offerpsp_organization(null, $1, $2::jsonb) as value",
      [type, JSON.stringify({ name, status: "active", relationship_tier: "core" })],
    );
    organizations.push(saved.rows[0].value);
  }
  const agentOrg = organizations.find((item) => item.organization_type === "agent");
  const merchantOrg = organizations.find((item) => item.organization_type === "merchant");
  await query("select public.set_offerpsp_agent_assignment($1, $2, 'active')", [agentOrg.id, merchantOrg.id]);
  await query(
    "select public.set_offerpsp_agent_margin_policy($1, $2, 'all', 'percentage_points', 1.1, null, null, 'Resale margin')",
    [agentOrg.id, merchantOrg.id],
  );

  const junk = await query(`
    insert into public.offerpsp_leads (
      name, work_email, company, vertical, geos, source, status, consent
    ) values ('Junk', 'junk@example.com', 'Unrelated Junk Merchant', 'Other', 'Unknown', 'lifecycle-test', 'new', true)
    returning lead_id
  `);
  const junkId = junk.rows[0].lead_id;
  const junkInitial = await query("select status from public.offerpsp_leads where lead_id = $1", [junkId]);
  await expectQueryFailure(
    "select public.purge_offerpsp_merchant($1, 'DELETE Unrelated Junk Merchant')",
    [junkId],
    "Archive the merchant before permanent deletion",
  );
  await query("select public.set_offerpsp_merchant_record_state($1, 'archived', 'Unrelated test request')", [junkId]);
  await query("select public.set_offerpsp_merchant_record_state($1, 'active', null)", [junkId]);
  const restored = await query("select record_state, status from public.offerpsp_leads where lead_id = $1", [junkId]);
  if (restored.rows[0].record_state !== "active" || restored.rows[0].status !== junkInitial.rows[0].status) {
    throw new Error("Archived merchant did not restore its previous status");
  }
  await query("select public.set_offerpsp_merchant_record_state($1, 'archived', 'Permanent test cleanup')", [junkId]);
  await query("select public.purge_offerpsp_merchant($1, 'DELETE Unrelated Junk Merchant')", [junkId]);
  const purged = await query("select count(*)::integer as count from public.offerpsp_leads where lead_id = $1", [junkId]);
  const audit = await query("select count(*)::integer as count from private.offerpsp_entity_audit where entity_type = 'merchant' and entity_id = $1 and action_type = 'purged'", [junkId]);
  if (purged.rows[0].count !== 0 || audit.rows[0].count !== 1) {
    throw new Error("Permanent merchant deletion did not remove the record while preserving the audit event");
  }

  const registry = await query("select public.get_offerpsp_management_registry() as value");
  if (!registry.rows[0].value.providers.some((item) => item.id === providerId)
      || !registry.rows[0].value.organizations.some((item) => item.id === agentOrg.id)
      || !registry.rows[0].value.assignments.some((item) => item.agent_organization_id === agentOrg.id)) {
    throw new Error("Management registry is missing managed entities");
  }
  process.stdout.write("PASS generic PSP, offer revision, margin history, organization, assignment and merchant lifecycle\n");
}

async function verify360Workspaces() {
  await setUser(STAFF_ID);
  const lead = await query(`
    insert into public.offerpsp_leads (
      name, work_email, company, vertical, geos, source, status, consent
    ) values (
      'Workspace Owner', 'workspace@example.com', 'Workspace Merchant',
      'iGaming', 'EU', 'workspace-360-test', 'new', true
    ) returning lead_id
  `);
  const leadId = lead.rows[0].lead_id;
  const contact = await query(
    "select public.save_offerpsp_merchant_contact($1, null, $2::jsonb) as value",
    [leadId, JSON.stringify({
      full_name: "Finance Contact",
      role_title: "CFO",
      email: "finance@example.com",
      preferred_channel: "email",
      is_primary: true,
    })],
  );
  const merchantDocument = await query(
    "select public.save_offerpsp_entity_document('merchant', $1, null, $2::jsonb) as value",
    [leadId, JSON.stringify({
      category: "license",
      title: "Merchant licence",
      document_url: "https://example.com/licence",
    })],
  );
  await query(
    "select public.save_offerpsp_lead_task($1, null, $2::jsonb)",
    [leadId, JSON.stringify({
      title: "Request KYB package",
      details: "Collect company and licence documents",
      priority: "high",
      status: "pending",
    })],
  );
  const merchantWorkspace = await query(
    "select public.get_offerpsp_entity_workspace('merchant', $1) as value",
    [leadId],
  );
  if (merchantWorkspace.rows[0].value.contacts.length !== 1
      || merchantWorkspace.rows[0].value.documents.length !== 1
      || !merchantWorkspace.rows[0].value.tasks.some((item) => item.title === "Request KYB package")
      || !merchantWorkspace.rows[0].value.activities.some((item) => item.activity_type === "document_added")) {
    throw new Error("Merchant 360 workspace is missing contacts, documents or timeline events");
  }

  const provider = await query(
    "select public.save_offerpsp_managed_provider(null, $1::jsonb) as value",
    [JSON.stringify({ brand_name: "Workspace PSP", relationship_status: "prospect" })],
  );
  const providerId = provider.rows[0].value.id;
  await query(
    "select public.save_offerpsp_entity_document('provider', $1, null, $2::jsonb)",
    [providerId, JSON.stringify({
      category: "rate_card",
      title: "Current rate card",
      document_url: "https://example.com/rate-card",
    })],
  );
  const providerWorkspace = await query(
    "select public.get_offerpsp_entity_workspace('provider', $1) as value",
    [providerId],
  );
  if (providerWorkspace.rows[0].value.documents.length !== 1
      || !providerWorkspace.rows[0].value.activities.some((item) => item.action_type === "document_added")) {
    throw new Error("Provider 360 workspace is missing documents or timeline events");
  }

  await setUser(OTHER_CLIENT_ID);
  await expectQueryFailure(
    "select public.get_offerpsp_entity_workspace('merchant', $1)",
    [leadId],
    "OfferPSP staff access required",
  );
  await setUser(STAFF_ID);
  await query("select public.archive_offerpsp_merchant_contact($1)", [contact.rows[0].value.id]);
  await query("select public.archive_offerpsp_entity_document($1)", [merchantDocument.rows[0].value.id]);
  const archived = await query(
    "select public.get_offerpsp_entity_workspace('merchant', $1) as value",
    [leadId],
  );
  if (archived.rows[0].value.contacts[0].active || archived.rows[0].value.documents[0].status !== "archived") {
    throw new Error("360 workspace contact or document archive failed");
  }
  process.stdout.write("PASS merchant/provider 360 workspaces, timeline and staff isolation\n");
}

async function verifyResearchCrud() {
  await setUser(STAFF_ID);
  const casino = await query(
    "select public.save_offerpsp_research_entity('casino', null, $1::jsonb) as value",
    [JSON.stringify({
      name: "Research Casino",
      website: "https://casino.example",
      geo: "EU",
      license: "MGA",
      email: "BIZDEV@CASINO.EXAMPLE",
      contact_status: "researching",
      score: 72,
      tags: ["igaming", "priority"],
    })],
  );
  const casinoId = casino.rows[0].value.id;
  await query(
    "select public.save_offerpsp_research_entity('casino', $1, $2::jsonb)",
    [casinoId, JSON.stringify({ score: 88, contact_name: "Product Owner", notes: "Qualified manually" })],
  );
  await query("select public.set_offerpsp_research_entity_state('casino', $1, 'archived')", [casinoId]);
  await query("select public.set_offerpsp_research_entity_state('casino', $1, 'active')", [casinoId]);
  const savedCasino = await query("select score, contact_name, record_state, email, tags from public.casino_leads where id = $1", [casinoId]);
  if (savedCasino.rows[0].score !== 88 || savedCasino.rows[0].contact_name !== "Product Owner"
      || savedCasino.rows[0].record_state !== "active" || savedCasino.rows[0].email !== "bizdev@casino.example"
      || savedCasino.rows[0].tags.length !== 2) {
    throw new Error("Casino research create/update/archive workflow did not persist correctly");
  }

  const psp = await query(
    "select public.save_offerpsp_research_entity('psp', null, $1::jsonb) as value",
    [JSON.stringify({
      name: "Research PSP",
      website: "https://psp.example",
      contact_status: "contacted",
      provider_status: "qualified",
      supported_countries: ["IN", "BR"],
      supported_currencies: ["INR", "BRL"],
      payment_methods: ["UPI", "PIX"],
      supported_verticals: ["IGAMING"],
      min_monthly_volume: 100000,
      max_monthly_volume: 5000000,
      capabilities_verified: true,
    })],
  );
  const pspId = psp.rows[0].value.id;
  await query(
    "select public.save_offerpsp_research_entity('psp', $1, $2::jsonb)",
    [pspId, JSON.stringify({ commission_terms: "Negotiated", payment_methods: ["UPI", "PIX", "P2P"] })],
  );
  const savedPsp = await query("select commission_terms, payment_methods, capabilities_verified_at from public.psp_providers where id = $1", [pspId]);
  if (savedPsp.rows[0].commission_terms !== "Negotiated" || savedPsp.rows[0].payment_methods.length !== 3
      || !savedPsp.rows[0].capabilities_verified_at) {
    throw new Error("PSP research create/update workflow did not persist correctly");
  }
  const bridge = await query("select public.get_offerpsp_captains_bridge() as value");
  if (!bridge.rows[0].value.casino_leads.some((item) => item.id === casinoId)
      || !bridge.rows[0].value.psp_providers.some((item) => item.id === pspId)) {
    throw new Error("Captain's Bridge is missing editable research records");
  }

  await setUser(OTHER_CLIENT_ID);
  await expectQueryFailure(
    "select public.save_offerpsp_research_entity('casino', $1, $2::jsonb)",
    [casinoId, JSON.stringify({ score: 1 })],
    "OfferPSP staff access required",
  );
  await expectQueryFailure(
    "select public.set_offerpsp_research_entity_state('psp', $1, 'archived')",
    [pspId],
    "OfferPSP staff access required",
  );
  await setUser(STAFF_ID);
  process.stdout.write("PASS editable casino/PSP research records, lifecycle, bridge and staff isolation\n");
}

async function verifyAibotServiceBoundary() {
  const functionGrants = await query(`select
    has_function_privilege('service_role', 'public.aibot_n8n_get_chat_history(text, integer)', 'EXECUTE') as service_history,
    has_function_privilege('service_role', 'public.aibot_n8n_ingest_casino_batch(jsonb)', 'EXECUTE') as service_ingest,
    has_function_privilege('anon', 'public.aibot_n8n_get_chat_history(text, integer)', 'EXECUTE') as anon_history,
    has_function_privilege('authenticated', 'public.aibot_n8n_ingest_casino_batch(jsonb)', 'EXECUTE') as authenticated_ingest`);
  const grants = functionGrants.rows[0];
  if (!grants.service_history || !grants.service_ingest || grants.anon_history || grants.authenticated_ingest) {
    throw new Error("AIBot n8n RPC grants are not service-role-only");
  }

  const tableBoundary = await query(`select
    c.relname as table_name,
    c.relrowsecurity as rls_enabled,
    has_table_privilege('anon', format('public.%I', c.relname), 'SELECT') as anon_select,
    has_table_privilege('authenticated', format('public.%I', c.relname), 'UPDATE') as authenticated_update,
    has_table_privilege('service_role', format('public.%I', c.relname), 'SELECT,INSERT,UPDATE,DELETE') as service_dml
    from pg_class c
    join pg_namespace n on n.oid = c.relnamespace
    where n.nspname = 'public'
      and c.relname in ('casino_leads', 'psp_providers', 'bot_tasks', 'chat_logs', 'email_drafts')
    order by c.relname`);
  if (tableBoundary.rows.length !== 5 || tableBoundary.rows.some((row) =>
      !row.rls_enabled || row.anon_select || row.authenticated_update || !row.service_dml)) {
    throw new Error("Legacy AIBot table grants or RLS boundary are incorrect");
  }

  const chatId = `migration-test-${Date.now()}`;
  const savedHistory = await query(
    "select public.aibot_n8n_save_chat_history($1, $2, $3) as value",
    [chatId, "Find a PSP", "Working on it"],
  );
  const history = await query(
    "select * from public.aibot_n8n_get_chat_history($1, 30)",
    [chatId],
  );
  if (savedHistory.rows[0].value.count !== 2 || history.rows.length !== 2
      || history.rows[0].role !== "user" || history.rows[1].role !== "assistant") {
    throw new Error("AIBot chat history service RPC workflow failed");
  }

  const website = `migration-${Date.now()}.example`;
  const ingested = await query(
    "select public.aibot_n8n_ingest_casino_batch($1::jsonb) as value",
    [JSON.stringify([{ name: "Migration Casino", website, email: "bizdev@example.com", score: 8 }])],
  );
  const lead = ingested.rows[0].value[0];
  if (lead.status !== "inserted" || !lead.internal_id) {
    throw new Error("AIBot casino ingest service RPC failed");
  }

  const enriched = await query(
    "select public.aibot_n8n_update_casino_enrichment($1::jsonb) as value",
    [JSON.stringify([{ internal_id: lead.internal_id, website, enriched_emails: [{ email: "partners@example.com" }], scraped_emails: 1, total_emails: 1 }])],
  );
  const researched = await query(
    "select public.aibot_n8n_update_casino_research($1::jsonb) as value",
    [JSON.stringify([{ internal_id: lead.internal_id, notes: "Verified research" }])],
  );
  if (!enriched.rows[0].value[0].enriched || researched.rows[0].value[0].status !== "researched") {
    throw new Error("AIBot enrichment or research service RPC failed");
  }

  const draft = await query(
    `insert into public.email_drafts(chat_id, lead_internal_id, to_email, subject, body, status)
     values ($1, $2, 'merchant@example.com', 'Test', 'Body', 'draft') returning id`,
    [chatId, lead.internal_id],
  );
  const marked = await query(
    "select public.aibot_n8n_mark_email_sent($1, $2) as value",
    [draft.rows[0].id, chatId],
  );
  const persisted = await query(
    `select d.status, l.contact_status, l.emails_sent, l.notes, jsonb_array_length(l.enriched_emails) as email_count
     from public.email_drafts d
     join public.casino_leads l on l.internal_id = d.lead_internal_id
     where d.id = $1`,
    [draft.rows[0].id],
  );
  if (!marked.rows[0].value.success || persisted.rows[0].status !== "sent"
      || persisted.rows[0].contact_status !== "in_progress" || persisted.rows[0].emails_sent !== 1
      || persisted.rows[0].notes !== "Verified research" || persisted.rows[0].email_count !== 1) {
    throw new Error("AIBot email sent service RPC failed");
  }

  await query("delete from public.email_drafts where chat_id = $1", [chatId]);
  await query("delete from public.chat_logs where chat_id = $1", [chatId]);
  await query("delete from public.casino_leads where internal_id = $1", [lead.internal_id]);
  process.stdout.write("PASS AIBot service RPCs, RLS and direct-access boundary\n");
}

async function verifyAibotDurableMemory() {
  const grantsResult = await query(`select
    has_table_privilege('service_role', 'public.aibot_memories', 'SELECT,INSERT,UPDATE,DELETE') as service_dml,
    has_table_privilege('anon', 'public.aibot_memories', 'SELECT') as anon_select,
    has_table_privilege('authenticated', 'public.aibot_memories', 'SELECT') as authenticated_select,
    has_function_privilege('service_role', 'public.aibot_n8n_memory_v1(jsonb)', 'EXECUTE') as service_memory,
    has_function_privilege('anon', 'public.aibot_n8n_memory_v1(jsonb)', 'EXECUTE') as anon_memory,
    has_function_privilege('authenticated', 'public.aibot_n8n_get_agent_context_v1(text, text, text, integer, integer)', 'EXECUTE') as authenticated_context,
    has_function_privilege('service_role', 'public.aibot_n8n_search_chat_history_v1(jsonb)', 'EXECUTE') as service_history,
    has_function_privilege('anon', 'public.aibot_n8n_search_chat_history_v1(jsonb)', 'EXECUTE') as anon_history`);
  const grants = grantsResult.rows[0];
  if (!grants.service_dml || grants.anon_select || grants.authenticated_select
      || !grants.service_memory || grants.anon_memory || grants.authenticated_context
      || !grants.service_history || grants.anon_history) {
    throw new Error("AIBot durable memory is not service-role-only");
  }

  const profileKey = `BIXOFFPSP-TEST-${Date.now()}`;
  const telegramChatId = `telegram-memory-${Date.now()}`;
  const webChatId = `web-memory-${Date.now()}`;
  const memoryKey = "decision.test_shared_memory";

  const remembered = await query(
    "select public.aibot_n8n_memory_v1($1::jsonb) as value",
    [JSON.stringify({
      action: "remember",
      profile_key: profileKey,
      scope: "offerpsp",
      memory_key: memoryKey,
      memory_type: "decision",
      content: "Telegram and Captain's Bridge share one project memory.",
      importance: 90,
      source_channel: "telegram",
      source_chat_id: telegramChatId,
    })],
  );
  if (remembered.rows[0].value.status !== "remembered") {
    throw new Error("AIBot durable memory did not save a decision");
  }

  await query(
    "select public.aibot_n8n_save_chat_history_v2($1, $2, $3, $4, $5, $6)",
    [telegramChatId, profileKey, "telegram", telegramChatId, "Remember this decision", "Saved"],
  );
  await query(
    "select public.aibot_n8n_save_chat_history_v2($1, $2, $3, $4, $5, $6)",
    [webChatId, profileKey, "web", "session-1", "What did we decide?", "Checking"],
  );

  const contextResult = await query(
    "select public.aibot_n8n_get_agent_context_v1($1, $2, $3, 30, 12) as value",
    [webChatId, profileKey, "project memory"],
  );
  const context = contextResult.rows[0].value;
  if (context.profile_key !== profileKey
      || context.local_history.length !== 2
      || context.shared_history.length !== 2
      || context.memories.length !== 1
      || context.memories[0].memory_key !== memoryKey) {
    throw new Error(`AIBot cross-channel memory context is incomplete: ${JSON.stringify(context)}`);
  }

  const recalled = await query(
    "select public.aibot_n8n_memory_v1($1::jsonb) as value",
    [JSON.stringify({ action: "recall", profile_key: profileKey, scope: "offerpsp", query: "project memory" })],
  );
  if (recalled.rows[0].value.count !== 1) {
    throw new Error("AIBot durable memory recall did not find the saved decision");
  }

  const archivedConversation = await query(
    "select public.aibot_n8n_search_chat_history_v1($1::jsonb) as value",
    [JSON.stringify({ profile_key: profileKey, query: "Remember this decision", limit: 10 })],
  );
  if (archivedConversation.rows[0].value.count !== 1
      || archivedConversation.rows[0].value.items[0].channel !== "telegram") {
    throw new Error("AIBot conversation archive search did not find the Telegram message");
  }

  const forgotten = await query(
    "select public.aibot_n8n_memory_v1($1::jsonb) as value",
    [JSON.stringify({ action: "forget", profile_key: profileKey, scope: "offerpsp", memory_key: memoryKey })],
  );
  if (forgotten.rows[0].value.status !== "forgotten") {
    throw new Error("AIBot durable memory forget action failed");
  }

  await query("delete from public.aibot_memories where profile_key = $1", [profileKey]);
  await query("delete from public.chat_logs where profile_key = $1", [profileKey]);
  process.stdout.write("PASS BIXOFFPSP durable memory, cross-channel history and service isolation\n");
}

async function verifyMailCenter() {
  const grants = await query(`select
    has_function_privilege('service_role', 'public.aibot_n8n_ingest_email(jsonb)', 'EXECUTE') as service_ingest,
    has_function_privilege('anon', 'public.aibot_n8n_ingest_email(jsonb)', 'EXECUTE') as anon_ingest,
    has_function_privilege('authenticated', 'public.get_offerpsp_mail_center(integer)', 'EXECUTE') as authenticated_read,
    has_table_privilege('authenticated', 'public.offerpsp_email_threads', 'SELECT') as authenticated_table_read,
    has_table_privilege('service_role', 'public.offerpsp_email_messages', 'SELECT,INSERT,UPDATE,DELETE') as service_messages`);
  const boundary = grants.rows[0];
  if (!boundary.service_ingest || boundary.anon_ingest || !boundary.authenticated_read
      || boundary.authenticated_table_read || !boundary.service_messages) {
    throw new Error("OfferPSP mail center grants do not match the RPC-only access model");
  }

  const unique = Date.now();
  const recipient = `mail-center-${unique}@example.com`;
  const created = await query(
    "select public.create_offerpsp_email_draft(null, $1, $2, $3) as value",
    [recipient, "Partnership request", "Outbound introduction"],
  );
  const draftId = Number(created.rows[0].value.id);
  await query("select public.set_offerpsp_email_draft_status($1, 'sent')", [draftId]);

  const outbound = await query(`select t.id as thread_id, t.status, m.delivery_status
    from public.offerpsp_email_threads t
    join public.offerpsp_email_messages m on m.thread_id = t.id
    where m.source_draft_id = $1`, [draftId]);
  if (outbound.rows.length !== 1 || outbound.rows[0].status !== "awaiting_reply"
      || outbound.rows[0].delivery_status !== "sent") {
    throw new Error("Outgoing email was not synchronized into the threaded mailbox");
  }

  const threadId = outbound.rows[0].thread_id;
  const inbound = await query("select public.aibot_n8n_ingest_email($1::jsonb) as value", [JSON.stringify({
    from_email: `Partner <${recipient}>`,
    to: ["bizdev@offerpsp.com"],
    subject: "Re: Partnership request",
    text: "Interested. Please send the details.",
    message_id: `<mail-center-${unique}@example.com>`,
    received_at: new Date().toISOString(),
  })]);
  if (inbound.rows[0].value.thread_id !== threadId) {
    throw new Error("Inbound reply did not join the existing email thread");
  }

  const mailbox = await query("select public.get_offerpsp_mail_center(200) as value");
  const thread = mailbox.rows[0].value.threads.find((item) => item.id === threadId);
  const messages = mailbox.rows[0].value.messages.filter((item) => item.thread_id === threadId);
  if (!thread || thread.unread_count !== 1 || thread.status !== "open" || messages.length !== 2
      || messages[0].direction !== "outbound" || messages[1].direction !== "inbound") {
    throw new Error("Threaded inbox does not expose the expected outbound/inbound conversation");
  }

  await query("select public.set_offerpsp_email_thread_state($1, 'follow_up', true)", [threadId]);
  const updated = await query("select status, unread_count from public.offerpsp_email_threads where id = $1", [threadId]);
  if (updated.rows[0].status !== "follow_up" || updated.rows[0].unread_count !== 0) {
    throw new Error("Email thread read/follow-up state did not persist");
  }

  await setUser(OTHER_CLIENT_ID);
  await expectQueryFailure("select public.get_offerpsp_mail_center(20)", [], "OfferPSP staff access required");
  await setUser(STAFF_ID);
  await query("delete from public.email_drafts where id = $1", [draftId]);
  await query("delete from public.offerpsp_email_threads where id = $1", [threadId]);
  process.stdout.write("PASS threaded email inbox, reply grouping, state controls and staff isolation\n");
}

async function verifyPrivateSourceStorage() {
  const bucket = await query(`select public, file_size_limit, allowed_mime_types
    from storage.buckets where id = 'offerpsp-private-sources'`);
  if (bucket.rows.length !== 1 || bucket.rows[0].public
      || Number(bucket.rows[0].file_size_limit) !== 15 * 1024 * 1024
      || !bucket.rows[0].allowed_mime_types.includes("application/pdf")
      || !bucket.rows[0].allowed_mime_types.includes("image/png")
      || !bucket.rows[0].allowed_mime_types.includes("image/jpeg")
      || !bucket.rows[0].allowed_mime_types.includes("image/webp")) {
    throw new Error("OfferPSP source bucket is missing or not private");
  }

  const policies = await query(`select policyname, cmd, roles, qual, with_check
    from pg_policies
    where schemaname = 'storage' and tablename = 'objects'
      and policyname like 'offerpsp_staff_%_private_sources'
    order by policyname`);
  const commands = new Set(policies.rows.map((policy) => policy.cmd));
  if (policies.rows.length !== 4
      || !["SELECT", "INSERT", "UPDATE", "DELETE"].every((command) => commands.has(command))
      || policies.rows.some((policy) => !policy.roles.includes("authenticated"))) {
    throw new Error("OfferPSP private source storage policies are incomplete");
  }
  process.stdout.write("PASS private source bucket, size boundary and staff-only storage policies\n");
}

async function verifyFreshnessReminders() {
  await setUser(STAFF_ID);
  await setRole("authenticated");
  const provider = await query(
    "select public.upsert_offerpsp_provider('Freshness Reminder Fixture', null, null, null, 'active', 1, true, 'Validation only') as value",
  );
  const providerCode = provider.rows[0].value.internal_code;
  const providerId = (await query(
    "select id from private.offerpsp_providers where internal_code = $1",
    [providerCode],
  )).rows[0].id;
  await query(
    "select public.save_offerpsp_provider_contact($1, null, $2::jsonb)",
    [providerId, JSON.stringify({ full_name: "Freshness Contact", telegram: "@freshness", preferred_channel: "telegram", active: true })],
  );
  const imported = await query(
    `select public.import_offerpsp_rate_card(
      $1, 'manual', 'freshness reminder fixture', 'validation', current_date - 45,
      'freshness-fixture-v1', '{}'::jsonb, $2::jsonb
    ) as value`,
    [providerCode, JSON.stringify([{
      client_title: "Freshness route",
      coverage_scope: "specific",
      geos: ["IN"],
      currencies: ["INR"],
      flow: "payin",
      methods: ["UPI"],
      freshness_days: 30,
      fees: [{ flow: "payin", fee_type: "percent", base_percent: 5, applies_on: "success" }],
      limits: [{ flow: "payin", currency: "INR", minimum_amount: 100, maximum_amount: 10000 }],
      anomalies: [],
    }])],
  );
  await query("select public.publish_offerpsp_rate_card($1)", [imported.rows[0].value.batch_id]);
  await query("update private.offerpsp_providers set last_verified_at = now() - interval '45 days' where id = $1", [providerId]);

  const synced = await query("select public.sync_offerpsp_freshness_reminders(7, 7) as value");
  const reminder = synced.rows[0].value.queue.find((item) => item.provider_id === providerId);
  const notification = synced.rows[0].value.notifications.find((item) => item.provider_id === providerId);
  if (!reminder || !notification || reminder.contact_value !== "@freshness" || !reminder.message_ru.includes("Freshness Reminder Fixture")) {
    throw new Error(`Freshness sync did not prepare the PSP reminder: ${JSON.stringify(synced.rows[0].value)}`);
  }

  const openTasks = await query(
    `select count(*)::integer as count from public.offerpsp_tasks
     where metadata ->> 'automation' = 'provider_freshness'
       and metadata ->> 'provider_id' = $1 and status in ('pending', 'in_progress')`,
    [providerId],
  );
  if (openTasks.rows[0].count !== 1) throw new Error("Freshness sync did not create exactly one operational task");

  await query(
    "select public.mark_offerpsp_freshness_notified($1, 'telegram', 'owner', $2)",
    [providerId, reminder.message_ru],
  );
  const repeated = await query("select public.sync_offerpsp_freshness_reminders(7, 7) as value");
  if (repeated.rows[0].value.notifications.some((item) => item.provider_id === providerId)) {
    throw new Error("Freshness sync repeated a notification inside the cooldown window");
  }

  await query("select public.confirm_offerpsp_provider_freshness($1)", [providerId]);
  const resolved = await query(
    "select status from private.offerpsp_freshness_reminders where provider_id = $1",
    [providerId],
  );
  const resolvedTask = await query(
    `select status from public.offerpsp_tasks
     where metadata ->> 'automation' = 'provider_freshness'
       and metadata ->> 'provider_id' = $1 order by created_at desc limit 1`,
    [providerId],
  );
  if (resolved.rows[0].status !== "resolved" || resolvedTask.rows[0].status !== "done") {
    throw new Error("Freshness confirmation did not resolve the reminder and task");
  }

  const grants = await query(`select
    has_function_privilege('authenticated', 'public.list_offerpsp_freshness_reminders()', 'EXECUTE') as staff_list,
    has_function_privilege('service_role', 'public.sync_offerpsp_freshness_reminders(integer,integer)', 'EXECUTE') as service_sync,
    has_function_privilege('anon', 'public.list_offerpsp_freshness_reminders()', 'EXECUTE') as anon_list,
    has_table_privilege('authenticated', 'private.offerpsp_freshness_reminders', 'SELECT') as direct_read`);
  if (!grants.rows[0].staff_list || !grants.rows[0].service_sync || grants.rows[0].anon_list || grants.rows[0].direct_read) {
    throw new Error("Freshness reminder grants are broader than the RPC-only contract");
  }
  process.stdout.write("PASS n8n freshness queue, notification cooldown, task deduplication and confirmation cleanup\n");
}

async function verifyOperationsAndIntegrations() {
  await setUser(STAFF_ID);
  await setRole("authenticated");

  const created = await query(
    "select public.save_offerpsp_task(null, $1::jsonb) as value",
    [JSON.stringify({
      title: "Operations validation task",
      details: "Created by the isolated regression suite",
      status: "pending",
      priority: "high",
      due_at: "2030-01-15T10:00:00Z",
      assigned_to: STAFF_ID,
    })],
  );
  const taskId = created.rows[0].value.id;
  const workspace = await query("select public.get_offerpsp_operations_workspace() as value");
  const task = workspace.rows[0].value.tasks.find((item) => item.id === taskId);
  if (!task || task.priority !== "high" || !task.assignee_name) {
    throw new Error("Operations workspace did not return the created task and assignee");
  }

  await query(
    "select public.save_offerpsp_task($1, $2::jsonb)",
    [taskId, JSON.stringify({
      title: "Operations validation task updated",
      details: "Completed",
      status: "done",
      priority: "normal",
      due_at: "2030-01-15T10:00:00Z",
      assigned_to: STAFF_ID,
    })],
  );
  const completed = await query("select status, completed_at from public.offerpsp_tasks where id = $1", [taskId]);
  if (completed.rows[0].status !== "done" || !completed.rows[0].completed_at) {
    throw new Error("Task completion state was not persisted");
  }
  await query("select public.delete_offerpsp_task($1)", [taskId]);
  const deleted = await query("select count(*)::integer as count from public.offerpsp_tasks where id = $1", [taskId]);
  if (deleted.rows[0].count !== 0) throw new Error("Staff-created task was not deleted");

  await query(
    "select public.save_offerpsp_integration_settings('telegram', true, $1::jsonb)",
    [JSON.stringify({ default_chat_id: "1124622535", lead_notifications: true, error_notifications: false })],
  );
  const settings = await query("select public.get_offerpsp_integration_settings() as value");
  const telegram = settings.rows[0].value.find((item) => item.key === "telegram");
  if (!telegram || telegram.configuration.default_chat_id !== "1124622535"
      || telegram.configuration.error_notifications !== false) {
    throw new Error("Safe integration settings were not persisted");
  }
  await query(
    "select public.record_offerpsp_telegram_message($1, $2, 'sent', 'validation-1', null, null)",
    ["1124622535", "OfferPSP Telegram validation"],
  );
  const messages = await query("select public.list_offerpsp_telegram_messages(10) as value");
  if (!messages.rows[0].value.some((item) => item.external_message_id === "validation-1")) {
    throw new Error("Telegram delivery log was not returned");
  }

  const grants = await query(`select
    has_function_privilege('authenticated', 'public.get_offerpsp_operations_workspace()', 'EXECUTE') as staff_tasks,
    has_function_privilege('authenticated', 'public.get_offerpsp_integration_settings()', 'EXECUTE') as staff_integrations,
    has_function_privilege('anon', 'public.get_offerpsp_operations_workspace()', 'EXECUTE') as anon_tasks,
    has_function_privilege('anon', 'public.get_offerpsp_integration_settings()', 'EXECUTE') as anon_integrations,
    has_table_privilege('authenticated', 'private.offerpsp_integration_settings', 'SELECT') as direct_settings,
    has_table_privilege('authenticated', 'private.offerpsp_telegram_messages', 'SELECT') as direct_messages`);
  const boundary = grants.rows[0];
  if (!boundary.staff_tasks || !boundary.staff_integrations || boundary.anon_tasks
      || boundary.anon_integrations || boundary.direct_settings || boundary.direct_messages) {
    throw new Error("Operations and integration grants exceed the staff RPC-only boundary");
  }

  await setUser(CLIENT_ID);
  await expectQueryFailure(
    "select public.get_offerpsp_operations_workspace()",
    [],
    "OfferPSP staff access required",
  );
  await expectQueryFailure(
    "select public.get_offerpsp_integration_settings()",
    [],
    "OfferPSP staff access required",
  );
  process.stdout.write("PASS task CRUD, calendar data, safe integration settings, Telegram log and staff-only grants\n");
}

async function verifyInboxOperations() {
  await setUser(STAFF_ID);
  await setRole("authenticated");

  const inserted = await query(`
    insert into public.offerpsp_leads (
      name, work_email, company, vertical, geos, consent, source, status
    ) values
      ('Inbox E2E A', 'inbox-e2e-a@example.invalid', 'Inbox E2E A', 'Marketplace', 'EU', true, 'regression', 'new'),
      ('Inbox E2E B', 'inbox-e2e-b@example.invalid', 'Inbox E2E B', 'Marketplace', 'EU', true, 'regression', 'new')
    returning lead_id
  `);
  const leadIds = inserted.rows.map((item) => item.lead_id);

  await query(
    "select public.bulk_manage_offerpsp_leads($1::uuid[], 'assign', $2)",
    [leadIds, STAFF_ID],
  );
  await query(
    "select public.bulk_manage_offerpsp_leads($1::uuid[], 'status', 'qualifying')",
    [leadIds],
  );
  await query(
    "select public.bulk_manage_offerpsp_leads($1::uuid[], 'archive', null)",
    [leadIds],
  );

  const finalState = await query(`
    select
      count(*) filter (
        where assigned_to = $2::uuid
          and status = 'qualifying'
          and record_state = 'archived'
      )::integer as final_rows,
      (
        select count(*)::integer
        from public.offerpsp_lead_activities
        where lead_id = any($1::uuid[])
          and activity_type = 'merchant_bulk_updated'
      ) as audit_rows
    from public.offerpsp_leads
    where lead_id = any($1::uuid[])
  `, [leadIds, STAFF_ID]);
  if (finalState.rows[0].final_rows !== 2 || finalState.rows[0].audit_rows !== 6) {
    throw new Error(`Inbox bulk operation was not atomic or auditable: ${JSON.stringify(finalState.rows[0])}`);
  }

  const grants = await query(`select
    has_function_privilege('authenticated', 'public.bulk_manage_offerpsp_leads(uuid[],text,text)', 'EXECUTE') as staff_execute,
    has_function_privilege('anon', 'public.bulk_manage_offerpsp_leads(uuid[],text,text)', 'EXECUTE') as anon_execute
  `);
  if (!grants.rows[0].staff_execute || grants.rows[0].anon_execute) {
    throw new Error("Inbox bulk operation grants exceed the staff-only boundary");
  }

  await setUser(CLIENT_ID);
  await expectQueryFailure(
    "select public.bulk_manage_offerpsp_leads($1::uuid[], 'archive', null)",
    [leadIds],
    "OfferPSP staff access required",
  );
  process.stdout.write("PASS atomic Inbox assignment, status, archive, audit log and staff-only boundary\n");
}

async function verifyCounterpartyOrganizer() {
  const casino = await query(`insert into public.casino_leads
    (name, website, geo, email, contact_status, score, source, record_state)
    values ('Organizer Casino Fixture', 'https://organizer-casino.test', 'Cyprus, EU',
      'casino@organizer.test', 'not_contacted', 75, 'regression', 'active') returning id`);
  const psp = await query(`insert into public.psp_providers
    (name, website, geo, email, contact_status, provider_status, supported_countries,
      supported_currencies, payment_methods, record_state)
    values ('Organizer PSP Fixture', 'https://organizer-psp.test', 'Europe',
      'psp@organizer.test', 'not_contacted', 'research', array['CY','EU'], array['EUR'],
      array['CARDS'], 'active') returning id`);
  const pspSecond = await query(`insert into public.psp_providers
    (name, website, geo, email, contact_status, provider_status, supported_countries,
      supported_currencies, payment_methods, record_state)
    values ('Bulk Companion Fixture', 'https://bulk-companion.test', 'TEST',
      'psp-two@organizer.test', 'not_contacted', 'research', array['TEST'], array['EUR'],
      array['CARDS'], 'active') returning id`);
  const casinoId = casino.rows[0].id;
  const pspId = psp.rows[0].id;
  const secondPspId = pspSecond.rows[0].id;

  await setUser(STAFF_ID);
  await setRole('authenticated');
  await query("select public.save_offerpsp_research_note('casino', $1, 'Call notes')", [casinoId]);
  await query("select public.save_offerpsp_task(null, $1::jsonb)", [JSON.stringify({
    title: 'Request fresh conditions', status: 'pending', priority: 'high',
    entity_type: 'research_psp', entity_id: String(pspId),
  })]);
  await query("select public.create_offerpsp_research_email_draft('psp', $1, 'psp@organizer.test', 'Terms', 'Please send fresh terms')", [pspId]);
  const workspace = await query("select public.get_offerpsp_research_workspace('psp', $1) as value", [pspId]);
  if (workspace.rows[0].value.tasks.length !== 1 || workspace.rows[0].value.email_drafts.length !== 1) {
    throw new Error('Counterparty organizer did not return linked task and email draft');
  }

  await setRole('service_role');
  const companySearch = await query("select public.aibot_n8n_operating_desk_v3($1::jsonb) as value", [JSON.stringify({
    action: 'search_companies', entity_type: 'psp', query: 'Organizer PSP', geo: 'EU', status_scope: 'pipeline',
  })]);
  if (companySearch.rows[0].value.count !== 1 || companySearch.rows[0].value.items[0].id !== pspId) {
    throw new Error('AIBot company search did not filter by company, GEO and pipeline state');
  }
  const confirmation = await query("select public.aibot_n8n_operating_desk_v3($1::jsonb) as value", [JSON.stringify({
    action: 'add_note', entity_type: 'psp', ids: [pspId, secondPspId], body: 'Bulk note',
    chat_id: 'regression-chat',
  })]);
  if (!confirmation.rows[0].value.confirmation_required || confirmation.rows[0].value.count !== 2) {
    throw new Error('AIBot bulk mutation did not require explicit confirmation');
  }
  await query("select public.aibot_n8n_operating_desk_v3($1::jsonb)", [JSON.stringify({
    action: 'create_task', entity_type: 'casino', id: casinoId, title: 'Call casino', priority: 'normal',
  })]);
  await query("select public.aibot_n8n_operating_desk_v3($1::jsonb)", [JSON.stringify({
    action: 'create_email_draft', entity_type: 'casino', id: casinoId, subject: 'Hello', body: 'Draft body',
  })]);
  const linked = await query(`select
    (select count(*)::integer from private.offerpsp_research_notes where entity_type='research_casino' and entity_id=$1::text) as notes,
    (select count(*)::integer from public.offerpsp_tasks where entity_type='research_casino' and entity_id=$1::text) as tasks,
    (select count(*)::integer from public.email_drafts where lead_internal_id='casino:'||$1::text) as drafts`, [casinoId]);
  if (linked.rows[0].notes !== 1 || linked.rows[0].tasks !== 1 || linked.rows[0].drafts !== 1) {
    throw new Error('AIBot organizer mutations were not linked to the selected company');
  }

  const grants = await query(`select
    has_function_privilege('service_role', 'public.aibot_n8n_operating_desk_v3(jsonb)', 'EXECUTE') as service_tool,
    has_function_privilege('authenticated', 'public.aibot_n8n_operating_desk_v3(jsonb)', 'EXECUTE') as browser_tool,
    has_function_privilege('anon', 'public.get_offerpsp_research_workspace(text,bigint)', 'EXECUTE') as anon_workspace,
    has_table_privilege('authenticated', 'private.offerpsp_research_notes', 'SELECT') as direct_notes`);
  if (!grants.rows[0].service_tool || grants.rows[0].browser_tool || grants.rows[0].anon_workspace || grants.rows[0].direct_notes) {
    throw new Error('Counterparty organizer grants exceed the RPC-only boundary');
  }
  process.stdout.write('PASS counterparty organizer, AIBot company search, safe mutations, tasks and mail drafts\n');
}

async function verifyOperatingDeskOfferSearch() {
  const fixture = await query(`select r.id, p.brand_name, r.geos[1] geo, r.methods[1] method,
      r.currencies[1] currency, r.flow, r.status
    from private.offerpsp_offer_routes r
    join private.offerpsp_providers p on p.id = r.provider_id
    where cardinality(r.geos) > 0 and cardinality(r.methods) > 0 and cardinality(r.currencies) > 0
    order by r.created_at limit 1`);
  if (!fixture.rows.length) throw new Error('No normalized route is available for AIBot offer search regression');
  const route = fixture.rows[0];
  await setRole('service_role');
  const result = await query("select public.aibot_n8n_operating_desk_v3($1::jsonb) as value", [JSON.stringify({
    action: 'search_offers', provider: route.brand_name, geo: route.geo, method: route.method,
    currency: route.currency, flow: route.flow, status: route.status,
  })]);
  if (!result.rows[0].value.items.some((item) => item.id === route.id)) {
    throw new Error('AIBot offer search did not filter by PSP, GEO, method, currency and flow');
  }
  process.stdout.write('PASS AIBot offer search by PSP, GEO, method, currency, flow and status\n');
}

function verifyCanonicalGeoHeaderParsing() {
  const payload = parseOfferSource({
    providerName: "OCR Header Fixture",
    sourceType: "admin_file",
    sourceReference: "ocr-fixture.png",
    sourceText: `GEO - India (UPI)
Currency - INR
Type of traffic - Both (FTD and Trusted)
Method: UPI

PayIn
Min/Max per transaction PayIn 500-50000 INR
MDR PayIn - 7.5%

PayOut
Min/Max per transaction PayOut 2000-50000 INR
MDR PayOut - 3.0%

Settlement period: T+1`,
  });
  const route = payload.batch.routes[0];
  if (payload.batch.routes.length !== 1
      || !route.geos.includes("IN")
      || !route.currencies.includes("INR")
      || route.flow !== "both"
      || route.fees.length !== 2) {
    throw new Error("Canonical GEO header did not produce one complete normalized route");
  }
  process.stdout.write("PASS canonical GEO header and OCR-style offer parsing\n");
}

function verifyWorldwideCoverageParsing() {
  const excluded = parseOfferSource({
    providerName: "WW Exclusion Fixture",
    sourceText: `🌎 Trusted – World Wide (ecom)
Type of traffic – Trusted
Card brands: Visa/ MasterCard
Min/Max per transaction MC 2–2 000$
Min/Max per transaction Visa 2–850$
MDR PayIn – 8,5%
Blocked GEO's
Democratic People’s Republic of Korea (DPRK)
Iran
Myanmar`,
  }).batch.routes;
  if (excluded.length !== 2
      || excluded.some((route) => route.coverage_mode !== "global_except")
      || excluded.some((route) => !["KP", "IR", "MM"].every((geo) => route.blocked_geos.includes(geo)))
      || new Set(excluded.map((route) => route.route_family_key)).size !== 2
      || excluded.some((route) => route.anomalies.some((item) => item.severity === "error"))) {
    throw new Error("Worldwide exclusion offer did not split into safe Visa/Mastercard atomic routes");
  }
  const visaExcluded = excluded.find((route) => route.card_brands.includes("VISA"));
  const mastercardExcluded = excluded.find((route) => route.card_brands.includes("MASTERCARD"));
  if (visaExcluded?.limits[0]?.maximum_amount !== 850
      || mastercardExcluded?.limits[0]?.maximum_amount !== 2000) {
    throw new Error("Scheme-specific Worldwide limits were mixed together");
  }

  const allowlist = parseOfferSource({
    providerName: "WW Allowlist Fixture",
    sourceText: `🌎 World Wide – payouts
Visa/MasterCard
Rate 3.5%+1.5 EUR
PayOut limit per trx – From 1 EUR to 1.700 EUR per transaction
VISA – Open Geo's
Albania, South Korea, Türkiye, Viet Nam
MASTER CARD – Open Geo's
Albania, United States of America, Uganda`,
  }).batch.routes;
  const visaAllowlist = allowlist.find((route) => route.card_brands.includes("VISA"));
  const mastercardAllowlist = allowlist.find((route) => route.card_brands.includes("MASTERCARD"));
  if (allowlist.length !== 2
      || allowlist.some((route) => route.coverage_mode !== "allowlist")
      || !["KR", "TR", "VN"].every((geo) => visaAllowlist?.geos.includes(geo))
      || visaAllowlist?.geos.includes("US")
      || !["US", "UG"].every((geo) => mastercardAllowlist?.geos.includes(geo))
      || allowlist.some((route) => route.limits[0]?.minimum_amount !== 1 || route.limits[0]?.maximum_amount !== 1700)
      || new Set(allowlist.map((route) => route.route_family_key)).size !== 2) {
    throw new Error("Worldwide allowlists or English From/To limits were normalized incorrectly");
  }
  process.stdout.write("PASS Worldwide allowlist, exclusion list and scheme-specific route parsing\n");
}

async function verifyGeoRegionAliases() {
  const expected = ["AM", "AZ", "BY", "KG", "KZ", "MD", "RU", "TJ", "TM", "UZ"];
  const extracted = await query("select private.offerpsp_extract_geo_codes('CIS') as geos");
  const expanded = await query("select private.offerpsp_expand_geo_regions(array['СНГ']) as geos");
  const transferMethods = await query("select private.offerpsp_expand_requested_methods(array['BANK_TRANSFER']) as methods");
  if (JSON.stringify(extracted.rows[0].geos) !== JSON.stringify(expected)
      || JSON.stringify(expanded.rows[0].geos) !== JSON.stringify(expected)
      || JSON.stringify(transferMethods.rows[0].methods) !== JSON.stringify(["BANK_TRANSFER", "C2C", "P2P", "SBP"])) {
    throw new Error(`Regional GEO or transfer method aliases were not expanded consistently: ${JSON.stringify({ extracted: extracted.rows[0], expanded: expanded.rows[0], transferMethods: transferMethods.rows[0] })}`);
  }

  await query("begin");
  try {
    const lead = await query(`
      insert into public.offerpsp_leads (
        name, work_email, company, vertical, geos, methods, consent
      ) values (
        'CIS Fixture', 'cis-fixture@example.invalid', 'CIS Fixture', 'iGaming', 'CIS', 'Cards', true
      )
      returning geos, target_geos
    `);
    if (lead.rows[0].geos !== "CIS"
        || JSON.stringify(lead.rows[0].target_geos) !== JSON.stringify(expected)) {
      throw new Error(`Lead GEO trigger did not preserve raw CIS and expand target_geos: ${JSON.stringify(lead.rows[0])}`);
    }

    const edited = await query(`
      update public.offerpsp_leads
      set geos = 'India'
      where work_email = 'cis-fixture@example.invalid'
      returning geos, target_geos
    `);
    if (edited.rows[0].geos !== "India"
        || JSON.stringify(edited.rows[0].target_geos) !== JSON.stringify(["IN"])) {
      throw new Error(`Edited raw GEO retained stale regional target_geos: ${JSON.stringify(edited.rows[0])}`);
    }
  } finally {
    await query("rollback");
  }
  process.stdout.write("PASS CIS/СНГ lead normalization, GEO edit synchronization and matching expansion\n");
}

async function verifyContactTimelineCooldown() {
  const result = await query(`
    select
      private.offerpsp_business_days_after('2026-08-10 09:00:00+00'::timestamptz, '2026-08-12'::date) as monday_to_wednesday,
      private.offerpsp_next_follow_up_date('2026-08-10 09:00:00+00'::timestamptz) as monday_next_allowed,
      private.offerpsp_business_days_after('2026-08-07 09:00:00+00'::timestamptz, '2026-08-11'::date) as friday_to_tuesday,
      private.offerpsp_next_follow_up_date('2026-08-07 09:00:00+00'::timestamptz) as friday_next_allowed,
      has_function_privilege('anon', 'public.get_offerpsp_contact_timeline(text,text,integer)', 'execute') as anon_can_read,
      has_function_privilege('authenticated', 'public.get_offerpsp_contact_timeline(text,text,integer)', 'execute') as staff_rpc_available,
      has_function_privilege('authenticated', 'public.aibot_n8n_contact_timeline_v1(jsonb)', 'execute') as authenticated_can_use_service_rpc,
      has_function_privilege('service_role', 'public.aibot_n8n_contact_timeline_v1(jsonb)', 'execute') as service_can_use_service_rpc
  `);
  const row = result.rows[0];
  if (row.monday_to_wednesday !== 2
      || new Date(row.monday_next_allowed).toISOString().slice(0, 10) !== "2026-08-13"
      || row.friday_to_tuesday !== 2
      || new Date(row.friday_next_allowed).toISOString().slice(0, 10) !== "2026-08-12"
      || row.anon_can_read
      || !row.staff_rpc_available
      || row.authenticated_can_use_service_rpc
      || !row.service_can_use_service_rpc) {
    throw new Error(`Contact timeline cooldown or RPC boundary is incorrect: ${JSON.stringify(row)}`);
  }
  process.stdout.write("PASS contact timeline and three-business-day duplicate cooldown\n");
}

async function verifyAibotExecutionJournal() {
  await setRole("service_role");
  const planned = await query(`select public.aibot_n8n_execution_journal_v1(jsonb_build_object(
    'action','plan','action_type','email_follow_up','description','Follow up fixture',
    'scheduled_for','2026-08-13T09:00:00Z','idempotency_key','fixture-follow-up'
  )) as value`);
  const id = planned.rows[0].value.item.id;
  const completed = await query(`select public.aibot_n8n_execution_journal_v1(jsonb_build_object(
    'action','complete','id',$1::text,'result_summary','Fixture completed'
  )) as value`, [id]);
  const permissions = await query(`select
    has_function_privilege('anon', 'public.aibot_n8n_execution_journal_v1(jsonb)', 'execute') as anon_execute,
    has_function_privilege('authenticated', 'public.aibot_n8n_execution_journal_v1(jsonb)', 'execute') as authenticated_execute,
    has_function_privilege('service_role', 'public.aibot_n8n_execution_journal_v1(jsonb)', 'execute') as service_execute`);
  if (completed.rows[0].value.item.status !== "completed"
      || completed.rows[0].value.item.result_summary !== "Fixture completed"
      || permissions.rows[0].anon_execute
      || permissions.rows[0].authenticated_execute
      || !permissions.rows[0].service_execute) {
    throw new Error(`AIBot execution journal lifecycle or boundary failed: ${JSON.stringify({ completed: completed.rows[0], permissions: permissions.rows[0] })}`);
  }
  await setRole("authenticated");
  process.stdout.write("PASS AIBot execution journal lifecycle and service isolation\n");
}

try {
  verifyCanonicalGeoHeaderParsing();
  verifyWorldwideCoverageParsing();
  await bootstrap();
  await applyMigrations();
  await verifyLeadGrants();
  await verifyWorkspaceGrants();
  await verifyClientPolicyBoundary();
  await verifySupplyOperationGrants();
  await verifyManagementOperationGrants();
  await verifyPreComplianceGrants();
  await verifyCaptainsBridgeGrants();
  await verify360WorkspaceGrants();
  await verifyResearchCrudGrants();
  await seedUsers();
  await verifyGeoRegionAliases();
  await verifyContactTimelineCooldown();
  await verifyAibotExecutionJournal();
  await verifyAtomicRouteReplacement();
  await verifyCounterpartyOrganizer();
  await verifyOperationsAndIntegrations();
  await verifyInboxOperations();
  await verifyPortalLeadClaims();
  await verifyPreComplianceGate();
  await importPreparedDrafts();
  await verifyOperatingDeskOfferSearch();
  await verifyOfferIngestionQueue();
  await verifySupplyOperations();
  await verifyRouteLevelPublication();
  await verifyIndividualOfferPublication();
  await verifyImpactControlV4();
  await runEndToEndFixture();
  await verifyAgentWorkspaceAndPricing();
  await verifyEntityLifecycle();
  await verify360Workspaces();
  await verifyResearchCrud();
  await verifyAibotServiceBoundary();
  await verifyAibotDurableMemory();
  await verifyMailCenter();
  await verifyPrivateSourceStorage();
  await verifyFreshnessReminders();
  process.stdout.write("PASS all OfferPSP migration checks\n");
} catch (error) {
  process.stderr.write(`FAIL ${error.message}\n`);
  process.exitCode = 1;
} finally {
  await db.close();
}
