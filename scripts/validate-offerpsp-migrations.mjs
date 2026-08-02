#!/usr/bin/env node

import { readFile, readdir } from "node:fs/promises";
import { resolve } from "node:path";
import { pathToFileURL } from "node:url";

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

async function bootstrap() {
  await db.exec(`
    create role anon nologin;
    create role authenticated nologin;
    create role service_role nologin;
    create schema auth;
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
      notes text
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
    has_table_privilege('authenticated', 'public.offerpsp_client_shortlist', 'SELECT') as client_view_select,
    has_table_privilege('authenticated', 'public.offerpsp_client_shortlist', 'INSERT') as client_view_insert,
    has_table_privilege('authenticated', 'public.offerpsp_client_shortlist', 'UPDATE') as client_view_update,
    has_table_privilege('authenticated', 'public.offerpsp_client_shortlist', 'DELETE') as client_view_delete,
    has_table_privilege('authenticated', 'public.offerpsp_client_shortlist', 'TRUNCATE') as client_view_truncate
  `);
  const grants = result.rows[0];
  if (
    !grants.organizations_select || !grants.organizations_insert ||
    !grants.organizations_update || !grants.organizations_delete ||
    grants.organizations_truncate || grants.organizations_trigger ||
    grants.organizations_references || !grants.client_view_select ||
    grants.client_view_insert || grants.client_view_update ||
    grants.client_view_delete || grants.client_view_truncate
  ) {
    throw new Error("Workspace table and view grants are broader than required");
  }
  process.stdout.write("PASS minimal workspace table and client-view grants\n");
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
    has_function_privilege('anon', 'public.resolve_offerpsp_route_anomaly(uuid,text,text)', 'EXECUTE') as anon_resolve
  `);
  const grants = result.rows[0];
  if (!grants.authenticated_list || !grants.authenticated_save || !grants.authenticated_resolve || grants.anon_list || grants.anon_save || grants.anon_resolve) {
    throw new Error("Supply operation RPC grants do not match the staff-only API model");
  }
  process.stdout.write("PASS staff-only supply operation RPC grants with anon denied\n");
}

async function seedUsers() {
  await query(
    "insert into auth.users (id, email) values ($1, 'staff@example.com'), ($2, 'client@example.com'), ($3, 'other@example.com'), ($4, 'agent@example.com')",
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

async function verifyLegacyShortlistBlocked() {
  await setUser(STAFF_ID);
  const lead = await query(`
    insert into public.offerpsp_leads (
      name, work_email, company, vertical, geos, source, status, consent
    ) values (
      'Legacy Fixture', 'legacy@example.com', 'Legacy Fixture Merchant',
      'iGaming', 'India', 'legacy-shortlist-regression', 'new', true
    ) returning lead_id
  `);
  const shortlist = await query(
    "select id from public.offerpsp_shortlists where lead_id = $1 and status = 'draft' order by version desc limit 1",
    [lead.rows[0].lead_id],
  );
  if (!shortlist.rows.length) throw new Error("Legacy matching fixture did not create its draft shortlist");
  await expectQueryFailure(
    "select public.share_offerpsp_shortlist($1)",
    [shortlist.rows[0].id],
    "Shortlist contains legacy or incomplete options",
  );
  const status = await query("select status, shared_at from public.offerpsp_shortlists where id = $1", [shortlist.rows[0].id]);
  if (status.rows[0].status !== "draft" || status.rows[0].shared_at !== null) {
    throw new Error("Blocked legacy shortlist was mutated while sharing failed");
  }
  process.stdout.write("PASS legacy/incomplete shortlist blocked without mutation\n");
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

  const repeatClaim = await query("select * from public.claim_offerpsp_leads()");
  if (repeatClaim.rows.length !== 1 || repeatClaim.rows[0].lead_id !== activeLeadId) {
    throw new Error("Repeated login changed inactive lead claim isolation");
  }

  await setUser(OTHER_CLIENT_ID);
  const foreignClaim = await query("select * from public.claim_offerpsp_leads()");
  if (foreignClaim.rows.length !== 0) {
    throw new Error("A different authenticated email claimed another client's request");
  }

  await setUser(STAFF_ID);
  process.stdout.write("PASS active email claim with closed/spam fixtures remaining detached\n");
}

async function importPreparedDrafts() {
  for (const [providerKey, fileName, expected] of [
    ["brpay", ".private/imports/brpay-2026-07-23-v2.json", { routes: 14, errors: 4, duplicates: 0, publishError: "Resolve all error-level anomalies before publication" }],
    ["antarex", ".private/imports/antarex-2026-07-30-v2.json", { routes: 24, errors: 0, duplicates: 2, publishError: "A provider margin policy is required before publication" }],
  ]) {
    const payload = JSON.parse(await readFile(resolve(fileName), "utf8"));
    if (
      payload.batch.parser_version !== "offerpsp-source-parser-v2"
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
    await expectQueryFailure(
      "select public.publish_offerpsp_rate_card($1)",
      [imported.batch_id],
      expected.publishError,
    );
    process.stdout.write(`PASS private draft ${providerKey}: ${imported.route_count} routes\n`);
  }
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

  await setUser(OTHER_CLIENT_ID);
  await expectQueryFailure("select public.get_offerpsp_supply_workspace($1)", [providerId], "OfferPSP staff access required");
  await setUser(STAFF_ID);
  process.stdout.write("PASS PSP profile, contact, route, anomaly, margin, freshness and audit operations\n");
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
    card_brands: [],
    traffic_types: ["FTD"],
    verticals: ["IGAMING"],
    prohibited_verticals: [],
    integrations: ["H2H"],
    niche_key: "IN|INR|PAYIN|UPI|FTD|IGAMING|H2H",
    effective_from: "2026-07-31",
    freshness_days: 30,
    risk_terms: {},
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
  await expectQueryFailure(
    "select public.set_offerpsp_route_status($1, 'published')",
    [publishedRoute.rows[0].id],
    "Confirm current PSP terms before resuming",
  );
  await query("select public.confirm_offerpsp_provider_freshness($1)", [publishedRoute.rows[0].provider_id]);
  await query("select public.set_offerpsp_route_status($1, 'published')", [publishedRoute.rows[0].id]);

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
  await query("update public.offerpsp_leads set client_user_id = $1 where lead_id = $2", [CLIENT_ID, leadId]);

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
  await query("select public.close_offerpsp_introduction($1, 'won', 'Validation complete')", [introductionId]);
  const finalLead = await query("select status from public.offerpsp_leads where lead_id = $1", [leadId]);
  if (finalLead.rows[0].status !== "won") throw new Error("Introduction pipeline did not finish as won");

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

  process.stdout.write("PASS end-to-end private offer → manual shortlist → client dossier → PSP review → Telegram → Zoom → won\n");
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
  await query(`
    insert into public.offerpsp_organization_members (organization_id, user_id, role, active, created_by)
    values ($1, $2, 'owner', true, $3)
  `, [agentOrgId, AGENT_ID, STAFF_ID]);
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

  await setUser(AGENT_ID);
  const workspace = await query("select * from public.list_offerpsp_workspace_requests()");
  if (!workspace.rows.some((row) => row.lead_id === leadId && row.access_mode === "agent")) {
    throw new Error("Active agent cannot see the assigned merchant workspace");
  }
  const options = await query("select * from public.offerpsp_client_shortlist where lead_id = $1", [leadId]);
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
  const foreignWorkspace = await query("select * from public.list_offerpsp_workspace_requests()");
  const foreignOptions = await query("select * from public.offerpsp_client_shortlist where lead_id = $1", [leadId]);
  if (foreignWorkspace.rows.some((row) => row.lead_id === leadId) || foreignOptions.rows.length) {
    throw new Error("Foreign client can access an agent-managed merchant");
  }
  process.stdout.write("PASS agent ownership, missing-margin gate, final resale rate and foreign isolation\n");
}

try {
  await bootstrap();
  await applyMigrations();
  await verifyLeadGrants();
  await verifyWorkspaceGrants();
  await verifyClientPolicyBoundary();
  await verifySupplyOperationGrants();
  await seedUsers();
  await verifyPortalLeadClaims();
  await verifyLegacyShortlistBlocked();
  await importPreparedDrafts();
  await verifySupplyOperations();
  await runEndToEndFixture();
  await verifyAgentWorkspaceAndPricing();
  process.stdout.write("PASS all OfferPSP migration checks\n");
} catch (error) {
  process.stderr.write(`FAIL ${error.message}\n`);
  process.exitCode = 1;
} finally {
  await db.close();
}
