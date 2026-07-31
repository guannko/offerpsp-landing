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

async function seedUsers() {
  await query(
    "insert into auth.users (id, email) values ($1, 'staff@example.com'), ($2, 'client@example.com'), ($3, 'other@example.com')",
    [STAFF_ID, CLIENT_ID, OTHER_CLIENT_ID],
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
  for (const [providerKey, fileName] of [
    ["brpay", ".private/imports/brpay-2026-07-23.json"],
    ["antarex", ".private/imports/antarex-2026-07-30.json"],
  ]) {
    const payload = JSON.parse(await readFile(resolve(fileName), "utf8"));
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
    await expectQueryFailure(
      "select public.publish_offerpsp_rate_card($1)",
      [imported.batch_id],
      "Resolve all error-level anomalies before publication",
    );
    process.stdout.write(`PASS private draft ${providerKey}: ${imported.route_count} routes\n`);
  }
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

  await setUser(CLIENT_ID);
  await expectQueryFailure(
    "select public.list_offerpsp_supply()",
    [],
    "OfferPSP staff access required",
  );
  const clientOptions = await query("select * from public.offerpsp_client_shortlist where lead_id = $1", [leadId]);
  if (clientOptions.rows.length !== 1) throw new Error("Client shortlist did not return one option");
  const clientPayload = JSON.stringify(clientOptions.rows[0]);
  if (/Validation PSP|validation\.invalid|provider_id|offer_route_id|base_percent|margin_mode/i.test(clientPayload)) {
    throw new Error("Client shortlist leaked internal provider or pricing data");
  }
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

  process.stdout.write("PASS end-to-end private offer → match → shortlist → dossier → PSP review → Telegram → Zoom → won\n");
}

try {
  await bootstrap();
  await applyMigrations();
  await verifyLeadGrants();
  await seedUsers();
  await verifyPortalLeadClaims();
  await importPreparedDrafts();
  await runEndToEndFixture();
  process.stdout.write("PASS all OfferPSP migration checks\n");
} catch (error) {
  process.stderr.write(`FAIL ${error.message}\n`);
  process.exitCode = 1;
} finally {
  await db.close();
}
