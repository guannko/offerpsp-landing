# OfferPSP tasks and verified state

Updated: 2026-08-03

This file separates local implementation from local verification and production state.
Code or a passing local test is not evidence that production has been updated.

## Control Bridge V2 — local frontend migration 2026-08-03

Status: `VERIFIED` locally, on a protected Vercel preview and in production.

- [x] TailAdmin Free React/TypeScript/Tailwind converted into an OfferPSP staff shell.
- [x] Command center, attention queues, pipeline, merchants, PSP, offers, deals,
  subagents and analytics use actual bridge data instead of demo fixtures.
- [x] Merchant workspace connects route matching, manual selection of any eligible
  route, client-safe shortlist preview and controlled sharing.
- [x] Deal Desk connects the existing dossier, PSP review, Telegram, Zoom and
  won/lost RPC chain.
- [x] PSP workspace connects profile, contacts, freshness, versioned OfferPSP
  margin and normalized route editing/lifecycle RPCs.
- [x] Subagent workspace connects organization lifecycle, merchant assignment and
  versioned agent-margin RPCs.
- [x] Header search resolves real merchants, PSPs and routes to their workspaces.
- [x] Dead actions were removed from enabled modules; unfinished modules remain
  hidden through feature flags rather than pretending to work.
- [x] Merchant shortlist preview follows the Telegram-offer standard, keeps PayIn
  and PayOut as separate commercial sections and supports RU/EN staff preview.
- [x] Working registries hide closed merchant fixtures and archived PSP/agents by
  default while preserving searchable history; archived routes are read-only.
- [x] Authenticated production-data contract passed for separate staff/client users:
  roles, leads, management registry, supply registry and coverage RPC all returned 200.
- [x] Authenticated browser smoke passed for sign-in, all eight enabled modules,
  merchant workspace, RU/EN offer preview, global search, PSP/agent creation forms
  and provider workspace. Browser runtime logs contain no errors.
- [x] Reversible provider mutation passed through the V2 UI and the original value
  was restored; the temporary E2E staff account was deactivated again.
- [x] Standalone protected preview `dpl_Ce1G486tbqSkupcXvR9iFJoWLyWy` verified the
  V2 application independently before it was integrated into the public site artifact.
- [x] Production-safe combined preview `dpl_FzaqN2xkame6ZrVYpcbJkwEoFCmi` is `READY` at
  `https://offerpsp-landing-l9xs82u4z-annoris.vercel.app`: the existing landing,
  `/admin/` and `/portal/` remain intact while Control Bridge V2 is mounted at
  `/control/`; sign-in and nested SPA routes resolve to the V2 shell.
- [x] The combined preview bundle contains the production Supabase URL without
  fallback values and the assembled public artifact excludes private files,
  migrations and internal task documentation.
- [x] Production deployment `dpl_32wVgFtLmz2ig99sd7MzTsJtF3Q8` is `READY` and
  serves `https://offerpsp.com/control/` while preserving `/`, `/admin/` and
  `/portal/`. The production bundle contains the real Supabase URL without the
  fallback placeholders, the sign-in UI rendered in a browser and runtime logs
  contained no errors.
- [x] Previous deployment `dpl_pgpNwMjmZ9hkhpmsaQ5Fihxiurp9` remains the immediate
  rollback target. No database migration was required for this frontend rollout.

## Delivery layers — current source of truth

### 1. Available through the production interface

Status: `VERIFIED` for production deployment
`dpl_pgpNwMjmZ9hkhpmsaQ5Fihxiurp9` from clean application source commit
`836f7a7`.

- The client portal is a persistent RU/EN multi-request Payment Workspace with counters,
  request navigation, recurring `New payment request` action, anonymous safe route options,
  option feedback, introduction request and client-visible deal progress.
- Production migration `20260803072020 offerpsp_client_offer_display` and the matching frontend
  render one source offer as one concise Telegram-style message with separate PayIn and PayOut
  rates and limits. Anonymous access to the new client projection is denied.
- The portal language now controls the complete merchant-facing offer presentation: RU localizes
  labels, countries, common methods and commercial terms to Russian; EN renders their English
  equivalents without exposing the language of the source rate card.
- The staff cabinet supports the lead desk, merchant edit/archive/purge controls, the private PSP
  workspace, generic PSP and manual-offer creation, relationship tiers, prepared draft upload,
  guarded publishing, versioned OfferPSP and agent margins, route matching, the Deal Desk,
  agent/merchant organizations and a cross-provider coverage matrix.
- Production role E2E verified a separate client workspace, client denial from the staff cabinet,
  staff registry loading and the PSP/offer/organization management tabs. The temporary staff
  fixture was deactivated again after the check.

### 2. Implemented in the production database/API

Status: `VERIFIED` for schema, RPC access boundaries and role-isolation behavior; this does not
mean every capability has a dedicated user interface.

- `20260801_offerpsp_client_workspace_agents.sql` adds merchant/agent organizations,
  memberships, explicit agent-to-merchant assignments, agent margin policies, commission
  ledger and client-safe workspace RPCs.
- `20260801_offerpsp_workspace_grants.sql` limits `authenticated` to DML on the three new
  organization tables and SELECT-only on the client-safe view. `anon` receives no access.
- Direct clients and assigned agents can use the same client-safe workspace RPCs. Staff/client/
  agent/unrelated-client isolation was verified with separate production accounts.
- Production migration `20260802205834 offerpsp_entity_lifecycle` adds generic entity lifecycle,
  revision, audit and management RPCs. Migration `20260802210227
  offerpsp_entity_lifecycle_grants` removes Supabase's automatic `anon` EXECUTE grants from all
  11 management RPCs. `authenticated` retains 11/11 RPC grants, `anon` retains 0/11.

### 3. Remaining agent/commission product work

Status: `PARTIAL` — the data model, access boundaries and first staff management UI exist in
production; the larger agent-facing workflows below are not implemented.

- Organization invitations and member/role management.
- Agent portfolio management optimized for larger portfolios, onboarding and co-branding.
- Commission review, approval, earned/paid processing, statements and reconciliation.

Agent organizations and agent margin are manageable by staff. Commission accounting remains an
API/data foundation rather than a finished operations UI.

## Implemented in source and verified locally

Status: `VERIFIED` as local code and database behavior only; this is not a production UI status.

### Private PSP supply and offers

- [x] Private provider register with automatic `PSP-xxxxxx` internal codes.
- [x] Provider contacts, relationship status and strategic priority.
- [x] Immutable rate-card source batches with versions and source hashes.
- [x] Normalized offer routes with automatic `OFF-xxxxxx` codes.
- [x] GEO, currency, flow, method, traffic, vertical, integration, volume and limit dimensions.
- [x] Separate PSP base fees, OfferPSP margin policies and calculated client fees.
- [x] Fee components, transaction limits, settlement terms, risk fields and parser anomalies.
- [x] Staff-only RPCs for provider upsert, private draft import, supply listing and guarded publication.
- [x] Client-safe immutable route snapshots without provider identity, base fees or margin rules.

### Source ingestion

- [x] Deterministic text parser for the supplied BRPay and Antarex sources.
- [x] One source can produce multiple normalized draft routes.
- [x] Raw source and SHA-256 metadata are preserved in the private payload.
- [x] Duplicate blocks, missing dimensions, malformed limits and ambiguous settlement rules are flagged.
- [x] Exact-source imports are idempotent per provider.
- [x] Prepared payloads are stored under gitignored `.private/` with mode `0600`.
- [x] Parser v2 keeps the immutable source but can create a new normalized version of the
  same message; the previous draft and its routes are superseded and archived automatically.
- [x] Exact duplicate source blocks are omitted from active routes and recorded in parser metadata.
- [x] Compound South Korea offers are split into Account Transfer, P2P Payout, Toss and Kakao routes.

### Matching v2

- [x] Route-level hard gates for GEO, blocked GEO, currency, flow, method, traffic,
  vertical, monthly volume and transaction limits.
- [x] Structured merchant request fields and `needs_clarification` handling.
- [x] Client-rate calculation through provider/route/merchant margin policies.
- [x] Staff matching action uses private route matches instead of the legacy provider card.
- [x] Draft shortlist creation uses client-safe snapshots and requires current published routes.

### Client cabinet

- [x] RU is the default language; RU/EN switch is available.
- [x] The selected portal language controls both the workspace UI and the full Telegram-format
  offer, including countries, common methods, traffic, card issue and standard risk terms.
- [x] Persistent multi-request payment workspace replaces the one-request shortlist viewer.
- [x] Request rail, workspace counters, recurring `New payment request` action and clear guided next action.
- [x] Anonymous route details, limits, settlement and final client fees are shown.
- [x] Merchant offers use the canonical Telegram-message layout. One source offer remains one
  offer, with separate labelled PayIn and PayOut rates and limits inside it.
- [x] `Interested`, `Need details` and `Not suitable` responses.
- [x] Selected-option summary and primary `Request introduction` action.
- [x] Client-safe Telegram/Zoom/result projection keeps the deal usable after the shortlist stage.
- [x] Legacy or incomplete shortlist items are hidden from the client projection and cannot be shared.
- [x] Sharing a new normalized shortlist archives the previous shared version for that request.

### Organizations and subagents

- [x] Merchant and agent organizations, memberships and agent-to-merchant ownership.
- [x] Agent access is restricted to explicitly assigned active merchant relationships.
- [x] Separate pricing chain: PSP base → OfferPSP margin → agent margin → final merchant rate.
- [x] An agent-managed route cannot produce a client snapshot until its agent margin policy exists.
- [x] Private projected-to-paid agent commission ledger.
- [x] Agent members can view and act on assigned merchant workspaces without seeing provider identity,
  PSP base fees or either internal margin layer.

### Merchant dossier and introductions

- [x] Merchant dossier with qualification fields, verification state and missing-field list.
- [x] Client option selection and introduction request.
- [x] Staff dossier submission for private PSP review.
- [x] PSP decisions: `accepted`, `declined`, `needs_info`, including multiple review rounds.
- [x] Provider identity remains private until an accepted review and managed introduction.
- [x] Telegram group, Zoom meeting and final `won`/`lost` result records.
- [x] Pipeline statuses through dossier, PSP review, Telegram, Zoom and result.

### Current staff UI

- [x] Basic private supply register.
- [x] Upload of a prepared JSON rate card as a private draft.
- [x] Batch route/anomaly counts and guarded publish action.
- [x] Matching v2 and current pipeline statuses in the lead drawer.

### Entity lifecycle and operations control center — local delivery 2026-08-02

Status: `VERIFIED` locally. The migration and frontend are not deployed to production because the
Supabase OAuth connection is currently unavailable in Codex.

- [x] Generic PSP register: create, edit, rank as top/core/standard/watchlist, change relationship
  status and archive without losing offer or deal history.
- [x] Generic private offer creation for any PSP; draft/review offers remain directly editable.
- [x] Published or paused offers are changed through a new draft revision so the live route is not
  silently overwritten; routes can be paused or archived through the existing supply workspace.
- [x] Provider-wide and route-specific OfferPSP margin versions. Changing `0.5 → 0.3 → 1.1`
  closes the previous effective version and activates the new version without deleting history.
- [x] Merchant source records are editable. Merchants can be archived and restored; archived junk
  leads can be permanently deleted only by an owner after an exact confirmation phrase.
- [x] Permanent deletion is blocked for won merchants and merchants with non-void commission
  history. The deletion audit event remains after operational data is removed.
- [x] Agent and merchant organizations can be created, edited, ranked, paused or archived.
- [x] Merchant organizations can be assigned to agents and receive versioned resale-margin rules.
- [x] Private audit records cover provider, offer, merchant, organization, assignment and margin
  changes; management RPCs are staff-only and permanent merchant deletion is owner-only.
- [x] Desktop and 390px mobile visual verification completed without horizontal overflow.
- [x] All 19 migrations, access-boundary checks, legacy regressions and full business E2E fixtures pass.

### Operational workspace — local delivery 2026-08-01

Status: `PARTIAL` production verification. Migration
`20260801113127 offerpsp_operational_workspaces` and frontend are deployed in production through
deployment `dpl_6pAtfuaFqPJAiDpS5eoz9G7A7KTa`. Static production routes and the new client/staff
assets are verified; a separate real staff/client mutation E2E remains open.

- [x] Full-width staff request workspace with overview, dossier, matching, Deal Desk,
  tasks, messages and section navigation.
- [x] Request owner assignment, dossier completeness, next action, deadlines and pipeline counters.
- [x] Structured staff and client dossier editing through a field-limited RPC.
- [x] PSP `needs_info` requests become an explicit client task and can be resubmitted for review.
- [x] Matching no longer creates and sends a shortlist automatically; staff selects routes manually,
  creates a client-safe preview and reviews it before sharing.
- [x] Staff-only route/provider context remains separate from the anonymous client snapshot.
- [x] Operational Deal Desk controls cover PSP submission and decision, Telegram, Zoom and won/lost.
- [x] Client portal loads options through a dedicated safe RPC instead of querying the legacy
  `SECURITY DEFINER` shortlist view directly.
- [x] Local syntax, portal guards and all 18 migration/E2E fixtures pass.
- [x] Production migration grants `EXECUTE` only to `authenticated`; all four RPCs are denied to `anon`.
- [x] Deploy the operational frontend to `offerpsp.com`.
- [ ] Run separate real staff/client production mutation E2E.
- [ ] Revoke direct `authenticated` access to the legacy shortlist view after the new portal is verified.

### PSP supply workspace — local delivery 2026-08-01

Status: `PARTIAL` production verification. Migration `20260801125700 offerpsp_supply_operations`
and frontend commit `7fb08b7` are deployed. The production staff RPC returned the 15 BRPay routes;
a normal authenticated user was denied. Mutation E2E remains locally verified only.

- [x] Staff PSP profile and working-contact editor.
- [x] Normalized route editor for GEOs, currencies, methods, traffic, verticals, integrations,
  volume, fees, limits and settlement terms without changing the immutable source message.
- [x] Parser error/warning queue with required resolution notes and audit history.
- [x] Provider-wide or route-specific OfferPSP margin policies; PSP base rate remains private.
- [x] Guarded pause, resume and archive controls. Resume revalidates current PSP confirmation,
  blocking errors, pricing, dimensions, limits, expiry and margin.
- [x] Rate-card version register and operational change history.
- [x] Last-confirmed action, configurable freshness period and stale-route indicators.
- [x] Staff-only RPC grants; clients, agents and anonymous users cannot load or mutate supply data.
- [x] Desktop and 390px mobile visual verification without horizontal overflow.
- [x] All 18 migration/E2E fixtures and frontend regression guards pass.
- [x] Production deployment is `READY`; `/admin/`, `/portal/` and their new assets return 200.
- [x] Internal `TASKS.md` and `supabase/migrations/` are excluded from Vercel and return 404.
- [x] Archived routes from superseded parser versions remain in version history but are hidden from
  the active route list and anomaly counters.
- [ ] Visual field-by-field diff between two rate-card versions.
- [ ] Automated stale-offer alerts and partner reminders through n8n.
- [x] GEO/currency/method/vertical coverage matrix with readiness, search and status filters.

### Production grant hotfix

- [x] Added `20260801_offerpsp_authenticated_lead_grants.sql` after production E2E
  proved that staff UPDATE/DELETE policies existed without table privileges.
- [x] The migration grants only UPDATE/DELETE to `authenticated`; existing RLS still
  limits those operations to active OfferPSP staff.

### Client portal active-request isolation

- [x] `claim_offerpsp_leads()` ignores `closed` and `spam` leads.
- [x] The client portal loads only rows returned by the client-safe workspace RPC instead of
  relying on the broader staff RLS view.
- [x] The workspace access helper excludes `closed` and `spam` requests.
- [x] Empty `won` and `lost` requests show a completed state instead of a conflicting
  matching-in-progress state.

### Focused staff workspace and manual client offers — production delivery 2026-08-03

Status: `VERIFIED` in source, migration validation and production deployment. A final click-through
with an existing authenticated staff session remains a user-side acceptance check.

- [x] Lead drawer navigation switches real workspace panels instead of scrolling through one long
  page: overview, dossier, client offers, Deal Desk and collaboration.
- [x] Staff can open email or Telegram from the lead header and can jump directly to client offers.
- [x] Automatic matching remains an advisory tool; incomplete matching fields no longer block the
  manual commercial workflow.
- [x] Staff can search the full publishable route catalog, select any suitable routes independently
  of the merchant's original request and create a client-safe manual shortlist.
- [x] Manual offers support a custom title, introduction and client note while retaining private PSP
  identity, base pricing, internal IDs and OfferPSP margin.
- [x] Migration `offerpsp_manual_client_offers` is applied in production. The RPC is executable by
  `authenticated` and `service_role`, denied to `anon` and `PUBLIC`, and repeats its own staff check.
- [x] Local E2E deliberately sends a published `ZZ / USD / cards` route to an
  `India / INR / UPI` request and verifies that the client snapshot contains no private supply data.
- [x] Commercial analytics now explains its purpose and shows the main funnel bottleneck, stage
  distribution, source volume and won results instead of counters alone.
- [x] Vercel production deployment `dpl_E3n2ErgzifvwuCXKz9oxGQoRJtLd` is `READY`, aliased to
  `offerpsp.com`, and production assets contain the focused panels, manual-offer controls and charts.
- [x] Follow-up deployment `dpl_4XA7qk1xXSBY2t3Su7kTG4m6uBNC` replaces the remaining long-page
  navigation with four independent staff screens. PSP supply is further split into provider register,
  offer catalog, rate-card import and version history; no sidebar action uses scroll navigation.

## Verified locally

Status: `VERIFIED` on 2026-08-02 in an ephemeral PostgreSQL-compatible PGlite database.

- [x] All 20 migrations, including rate-card reprocessing, route-level publication, the coverage matrix, operational workspaces, entity lifecycle and manual client offers,
  apply in dependency order.
- [x] `authenticated` has lead UPDATE/DELETE privileges while `anon` does not.
- [x] BRPay parser v3 imports 14 real draft routes; only four blocking checks remain in the two
  Uzbekistan ecom routes because the partner source contains malformed and conflicting limits.
- [x] Antarex parser v3 imports 24 real draft routes with zero parser errors and complete fee coverage
  for every route flow; 45 explicit warnings remain for staff confirmation of inferred flow/method
  and unconfirmed traffic/vertical scope.
- [x] Reprocessing the same immutable source with a newer parser creates a new batch version;
  repeating the same parser version remains idempotent.
- [x] Open error anomalies prevent draft publication.
- [x] A non-staff authenticated user cannot call the private supply API.
- [x] Client shortlist output does not contain provider identity, internal route/provider IDs,
  PSP base rates or margin mode.
- [x] Rebuilding matching removes stale reviewed route matches without invalidating an existing client snapshot.
- [x] Full E2E passes:
  `route → matching → shortlist → client selection → dossier → PSP needs info → second review → PSP accepted → Telegram → Zoom → won`.
- [x] Legacy/incomplete shortlist publication fails without changing shortlist or lead state.
- [x] Client-safe deal output contains Telegram/Zoom/result data and excludes provider/route/internal notes.
- [x] Agent regression covers missing-margin rejection, final resale calculation, authorized action
  and isolation from an unrelated authenticated user.
- [x] A repeated Telegram call cannot move an introduction backwards after Zoom is scheduled.
- [x] JavaScript syntax checks and `git diff --check` pass.
- [x] New payment workspace was visually checked locally at desktop and 390px mobile width without horizontal overflow.
- [x] Portal regression checks cover active email claiming, repeated login with detached
  closed/spam fixtures, safe workspace RPC selection and consistent terminal copy.

Local verification does not replace testing with real Supabase staff and client accounts.

## Deployed and verified in production

Status: `VERIFIED` on 2026-08-02.

- [x] Applied `offerpsp_rate_card_reparse`; version uniqueness now uses provider, source hash and
  parser version without changing the immutable partner message.
- [x] Applied `offerpsp_route_level_publication`; valid routes can be published independently while
  malformed routes remain private archived history.
- [x] BRPay v1 is superseded. BRPay v2 is published with 12 active routes; the two malformed
  Uzbekistan ecom routes are archived with their four source errors. Active routes have zero
  blocking errors, complete flow pricing and 16 open review warnings.
- [x] Antarex v2 is superseded. Antarex v3 is draft with 24 active routes, zero parser errors,
  complete flow pricing and 45 explicit review warnings.
- [x] Antarex remains unpublished because its OfferPSP margin policy is intentionally unset.
- [x] Applied `offerpsp_supply_coverage_matrix`; staff receives 36 active normalized routes,
  while `anon` has no execute grant and a non-staff authenticated user is denied.
- [x] Production deployment `dpl_EeuotqpGK4qWuf2w94NDLHfK3msS` is `READY`, aliased to
  `offerpsp.com`, and serves the RU/EN coverage matrix from exact SHA
  `c750c8c7f382318c22992c8ecf40bf44b0453aa8`.

- [x] Closed snapshot and rollback script are readable under gitignored `.private/`; the snapshot
  includes the previous shortlist view definition, constraints, policies and grants.
- [x] Applied `offerpsp_client_workspace_agents` as migration `20260801064235`.
- [x] Applied minimal grant hotfix `offerpsp_workspace_grants` as migration `20260801065351`.
- [x] `authenticated` has only SELECT/INSERT/UPDATE/DELETE on the three new tables and only
  SELECT on the client view; `anon` has no access and `service_role` remains unchanged.
- [x] Production regression passed with separate staff, direct-client, agent and unrelated-client accounts.
- [x] Full production business E2E passed through `won`; all technical fixtures were archived,
  superseded, closed/unlinked or deactivated afterward.
- [x] Production portal was visually checked in RU and EN with a separate client account; the
  persistent empty workspace has a clear next action and no closed technical merchant.
- [x] Vercel production deployment `dpl_B1LUdb36EoWqFKhkTLHD5DZQ5Ky3` is `READY` at exact SHA
  `02aee090f50b0ed037615099bcaf6d5bc0c3b02f`; no runtime errors were reported in the post-rollout window.

At the end of this earlier workspace rollout, BRPay and Antarex were still draft-only. The current
production supply status is recorded above.

## Earlier production baseline

Status: `VERIFIED` — factual baseline retained for rollout history.

- [x] Applied `20260801_offerpsp_active_lead_claims.sql` as production migration
  `20260731233207 offerpsp_active_lead_claims`; function definition, ACL and RLS were
  rechecked.
- [x] Production auth regression with two separate non-staff users verified active
  email claiming, repeated login isolation and foreign-client denial.
- [x] All production E2E and regression leads are closed and unlinked after cleanup.
- [x] Deployed commit `1c8eaf16db6a640af3c3fa07946967274a2e5b27` as Vercel production
  deployment `dpl_Dab1JS9MwYr3jVpPoebUCc9mjFWH` (`READY`).
- [x] `/portal/` was visually verified under `guannko@gmail.com`, the separate E2E
  client and a temporary `lost` fixture; closed fixtures are absent and terminal copy
  does not conflict with matching-in-progress copy.

- [x] Production preflight and private DDL/data snapshot completed and verified.
- [x] Production migration `offerpsp_private_supply` applied as version `20260731223317`.
- [x] Production migration `offerpsp_route_matching` applied as version `20260731223422`.
- [x] Production migration `offerpsp_introduction_pipeline` applied as version `20260731223603`.
- [x] All three migration records, tables, RPCs, RLS boundaries and grants were checked.
- [x] Legacy production data remained unchanged after the three platform migrations.
- [x] BRPay imported as `PSP-000001`: 15 draft routes, 12 open errors, 18 warnings.
- [x] Antarex imported as `PSP-000002`: 20 draft routes, 26 open errors, 29 warnings.
- [x] BRPay and Antarex have zero published batches and routes.
- [x] Antarex margin remains unset; margin policy count is zero.
- [x] Frontend SHA `319160c4585f4f9783e2be778fe1cdadb0090b1c` promoted to production Vercel.
- [x] Production landing, RU/EN client login and RU/EN staff login screens were visually checked.
- [x] n8n inbound workflow remains active and validates with zero errors/warnings.
- [x] Production migration `offerpsp_authenticated_lead_grants` applied as version `20260731230340`.
- [x] `authenticated` has lead UPDATE/DELETE privileges; `anon` does not.
- [x] Separate authenticated client UPDATE and DELETE attempts affected zero rows.
- [x] Separate active staff UPDATE affected exactly one lead.
- [x] Production E2E completed:
  `route → matching → shortlist → client → dossier → PSP needs info → accepted → Telegram → Zoom → won`.
- [x] The E2E fixture is inert again: provider and route archived, batch superseded,
  test leads closed and unlinked, test shortlists archived and test staff deactivated.

This earlier rollout baseline completed before route-level publication. Current supply status is
recorded in the 2026-08-02 production section above.

Security note: Supabase advisor reports `offerpsp_client_shortlist` as a
`SECURITY DEFINER` view. Anonymous access is revoked, the view filters on
`auth.uid()`, and direct-client/agent/unrelated-client isolation passed production E2E.

## Truly not implemented

Status: `PARTIAL` — these are the actual next P1/P2 tasks after rollout.

### P1 — PSP and route operations

- [x] Full PSP/contact editor in the production staff cabinet.
- [x] Route, fee, limit, settlement and anomaly editor in production.
- [x] Anomaly resolution/acceptance UI with audit notes in production.
- [x] Pause, resume and archive controls for individual routes in production.
- [x] Visual version history in production; field-by-field batch comparison remains open.
- [x] Freshness dashboard and last-confirmed controls in production; automated alerts remain open.
- [ ] Partner reminders through n8n.
- [x] GEO/currency/method/vertical coverage matrix deployed in RU/EN.

### P1 — Deal Desk

- [x] Staff UI for reviewing and editing the merchant dossier in production.
- [x] Missing-information workflow linked to the client dossier in production.
- [x] Staff controls for PSP submission and review decisions in production.
- [x] Telegram group recording and transition in production.
- [x] Zoom scheduling and won/lost controls in production.
- [ ] Stored introduction templates and automated Telegram/Zoom preparation.
- [ ] Deal history and result-quality tracking.

The first operational UI is deployed. Daily-use refinement remains.

### P1 — Agent operations

- [x] Staff editor for agent/merchant organizations, relationship tier/status, merchant assignments
  and versioned agent margin policies in production.
- [ ] Organization-member and role management UI.
- [ ] Agent onboarding/invitation flow and managed-client switcher optimized for larger portfolios.
- [ ] Agent commission approval, earned/paid workflow and downloadable statements.
- [ ] Co-branded agent workspace settings; white-label domains remain a later product decision.

### P1 — Telegram ingestion

- [ ] Receive a partner rate card directly from Telegram.
- [x] Define the universal ingestion contract: any source becomes a reviewed normalized draft and
  every merchant output uses the Telegram-offer presentation standard.
- [x] Add local source adapters for TXT/Markdown, CSV/TSV, XLSX, text PDF and DOCX with immutable
  original-file hashes and review-required metadata.
- [x] Allow the deterministic normalizer to accept new PSPs without adding a hard-coded provider preset.
- [ ] Connect Telegram, email and admin uploads to the universal source adapters automatically.
- [ ] Store original binary files privately and attach their source reference to the batch.
- [ ] Add OCR for scanned PDF/image sources.
- [ ] Send parser errors and duplicate warnings to a staff review queue.
- [ ] Link Telegram ingestion to partner freshness reminders.

The local adapter/parser path supports common source files. The production n8n/admin trigger and
private binary storage are not connected yet.

### P2 — Analytics

- [ ] Acquisition and campaign attribution.
- [ ] Lead quality by source, GEO and vertical.
- [ ] Lead → shortlist → option selected → introduction conversion.
- [ ] PSP review acceptance, decline and clarification rates.
- [ ] Introduction → Telegram → Zoom → live cooperation conversion.
- [ ] Time-to-match, time-to-PSP-decision and time-to-launch.
- [ ] Processing volume and realized OfferPSP margin by PSP and route.

### P2 — Search and PSP acquisition

- [ ] `Become an OfferPSP partner` funnel.
- [ ] Reviewed PSP-research source list, starting with AboutPayments and PaymentProviders.io.
- [ ] Sanitized SEO pages by GEO, method and vertical.
- [ ] Public content generated from active routes without provider identity.
- [ ] Sitemap, schema and canonical strategy.

## Production safety rules

- Never treat local tests or documentation as proof of production state.
- Do not apply production migrations from an uncommitted working tree.
- Import source offers as drafts only.
- Do not publish a batch with open `error` anomalies.
- Do not hard-code Antarex or any other PSP margin in source code. Configure margin through the
  versioned staff policy and verify the effective client rate before publication.
- A real client test must use a different authenticated account/session from staff.
- The legacy public `psp_providers` table remains in place until n8n dependencies are
  verified and migrated safely.
