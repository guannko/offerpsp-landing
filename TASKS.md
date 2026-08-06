# OfferPSP tasks and verified state

Updated: 2026-08-06

This file separates local implementation from local verification and production state.
Code or a passing local test is not evidence that production has been updated.

## Navigation and functional semantics — 2026-08-06

Status: `PARTIAL`. Misleading production labels have been corrected locally; deployment and
authenticated visual verification are still required.

- [x] Rename `Задачи и календарь` to the actual `Задачи OfferPSP и AIBot`; the current module is a
  combined queue and does not contain a calendar.
- [x] Rename the integrations navigation to `Состояние интеграций`; the current screen monitors
  health and loaded data but does not configure external services.
- [x] Distinguish direct health checks from indirect data presence. An empty Telegram journal no
  longer claims that Telegram is broken, and n8n data presence is not presented as a live health
  check.
- [x] Correct the inbox, merchant, communications and agent-ledger copy so each screen describes
  only the data and actions it actually exposes.
- [ ] `P1` Turn the combined task queue into a task manager: create/edit/assign/complete, filters,
  entity links and due dates. Add calendar/Zoom/freshness views only when those views exist.
- [ ] `P1` Add outbound Telegram conversations and actions before describing the Telegram journal
  as a full communication channel.
- [ ] `P1` Add integration configuration and operational controls before renaming the monitoring
  screen back to a generic `Интеграции` module.

## Universal offer operations — 2026-08-06

Status: `VERIFIED`. The provider-independent database workflow and cockpit controls are deployed
and verified with an authenticated production smoke test.

- [x] Antarex and every other incomplete PSP are outside the critical path. Draft/review routes do
  not block publication, pause, revision or matching of unrelated offers.
- [x] The catalog has a provider-independent `+ Новый оффер` flow: select any active PSP, create a
  normalized draft and continue directly in the full rate/limit/settlement editor.
- [x] A single validated offer can be published without superseding or archiving unrelated live
  routes from the same PSP. Publishing a revision archives only its previous live version.
- [x] Every editable offer can be copied; published/paused offers produce a separate editable
  revision, preserving the live version until the replacement is published.
- [x] Existing controls remain generic: edit, pause, resume, archive, margin versions, source intake
  from Telegram/email/admin text/PDF/DOCX/XLSX/images and the review/error/duplicate queue.
- [x] Production migration `offerpsp_individual_offer_publication` is applied. Staff execution is
  allowed, anonymous execution is denied; the current 12 published and 24 unpublished routes were
  unchanged by the rollout.
- [x] All 46 migrations and the full regression suite pass in isolated PGlite, including explicit
  proof that individual publication and revision do not mutate neighbouring live routes.
- [x] Production deployment `dpl_4ky5LKB7bbNtQZLVzHg4pCzgih8n` is `READY` on the private cockpit
  domain. Authenticated desktop smoke confirmed the global create form, BR-Pay pause/revision
  controls and Antarex publish/copy/archive controls without creating a synthetic production offer.

## Production black-box audit — 2026-08-06

Status: `PARTIAL`. Full report: `docs/OFFERPSP-ADMIN-BLACKBOX-AUDIT-2026-08-06.md`.
The production P0 recheck below supersedes the initial findings recorded earlier on the same date.

- [x] `P0` Restore the Captain's Bridge outbound email environment and replace decorative
  integration statuses with authenticated configuration health. A production message sent from the
  communications UI completed through n8n execution `321084` and is stored as `sent`.
- [x] `P0` Repair research-casino creation. The UI and RPC now use the canonical 0–10 score, the
  sequence is synchronized and the generator retries collisions. Production UI created `CAS-0246`
  with score 7, then archived it successfully; the exact synthetic row was removed after verification.
- [x] `P0` Exclude archived shortlists from the merchant's current workspace and next action. MBA now
  shows South Korea, 0 current offers and `v0`; the archived empty legacy `v1` is not selected.
- [x] `P0` Replace raw offer-component enums/free-text fields with typed controls and pre-RPC
  validation for fee type, applies-on, flow, amounts and currencies. Production Antarex editor was
  checked without mutating a real offer.
- [x] `P0` Harden `messages_log`, `email_templates` and `casino_interactions`: RLS is enabled,
  `anon`/`authenticated` direct access is revoked and service-role access remains. The relevant
  Security Advisor errors disappeared; unrelated shared-database findings remain open.
- [ ] `P0/PARTIAL` The hardcoded external-secret node was removed from the active n8n Email Sender
  graph and the workflow now validates with 0 errors/warnings. Revoke the historical third-party token
  if it is still active; old n8n version history can still contain the previous value.
- [ ] `P0/PARTIAL` Heavy Captain modules and mail snapshots now load only on relevant routes. Add a
  bounded client cache if production timings continue to exceed the current roughly 3-second cold load.
- [ ] `P1` Implement the promised task manager/calendar instead of the current read-only task dump.
- [ ] `P1` Add Inbox filters, assignment and bulk actions; reconcile lead/deal/work counters across
  Command Center, Pipeline, Deals and Analytics.
- [ ] `P1` Localize raw enums/errors, remove or label E2E fixtures in operational selectors, and add
  missing contact lifecycle controls.
- [x] Repeat the P0 black-box scenarios in production: email, research create/archive, merchant state,
  typed offer editor, integration health and database access boundaries all passed on 2026-08-06.

## Pre-Compliance PRO module — 2026-08-06

Status: `VERIFIED` in production. The first real external request is screened and remains locked
until a staff decision.

- [x] A separately entitled `pre_compliance` PRO module has its own navigation, queue and merchant
  workspace rather than being embedded as an unlicensed feature flag.
- [x] Every new request receives a private case, normalized GEO/methods and a high-priority review
  task. The old automatic legacy shortlist trigger is removed.
- [x] Completed automated screening moves to the explicit `manual_review` queue. It cannot remain
  in an ambiguous running state or be reclaimed by the worker before a staff decision.
- [x] Four independent scores cover authenticity, compliance readiness, commercial value and form
  completeness; roles distinguish direct merchants, subagents, PSPs and consultants.
- [x] Database gates block automatic matching, manual shortlist creation and sharing until an
  active staff member records a `cleared` decision. Automated screening can never clear a lead.
- [x] Private evidence, submission signals and immutable decision history are reachable only via
  staff/service RPCs. Raw IP storage is not part of the contract.
- [x] n8n workflow `wiEFFDaHd3uaJoJi` (`OfferPSP | Pre-Compliance PRO`) is active and validates
  with 8 nodes, 7 connections, 0 errors and 0 warnings. Controlled production executions
  `320586` and `320600` completed successfully using the dedicated service-role credential.
- [x] All 45 migrations, security grants and the full offer → shortlist → PSP review → Telegram →
  Zoom → won regression pass in isolated PGlite. Cockpit build passes; lint has no errors.
- [x] Production migrations `offerpsp_pre_compliance_module`,
  `offerpsp_pre_compliance_indexes` and `offerpsp_manual_compliance_review` are applied. Private
  compliance tables deny direct `anon`/`authenticated` access; matching and shortlist creation are
  database-gated by staff clearance.
- [x] Cockpit production deployment `dpl_AtwBXKqAGXCGT1QTmdQWQRvi2tgP` is `READY` at
  `https://ops-7q4m2x9k8v3n.vercel.app`; authenticated queue and merchant-dossier smoke passed.
  Compliance uses a full table only on wide workstations and switches to contained lead cards on
  laptop, tablet and mobile widths; filters scroll independently and dossier actions do not clip.
- [x] The real MBA request is normalized to `KR`, classified as `subagent`, scored
  `100 / 54 / 100 / 64`, and remains in `manual_review` with no staff decision. Its false legacy
  shortlist was archived and matching remains locked.
- [ ] Staff decision for MBA: request represented merchant names/sites, licence per merchant,
  payment methods and PayIn/PayOut requirements before clearance.

## Agent operations — 2026-08-06

Status: `VERIFIED` in production; the first real invitation acceptance and visible co-brand smoke
await an actual subagent organization instead of synthetic production data.

- [x] Staff manages organization members and roles, sends protected email invitations and cannot
  remove the last active owner.
- [x] Agent portfolios support RU/EN merchant search and a bounded request switcher for larger
  managed portfolios.
- [x] Commission accounting supports the guarded lifecycle
  `projected → approved → earned → paid`, voiding of non-terminal entries, audit history and CSV
  statements.
- [x] Agent organizations have staff-managed co-brand settings: enable/disable, display name,
  RU/EN taglines, HTTPS logo, accent colour and support email. The authenticated agent portal uses
  only the client-safe projection and always retains `Powered by OfferPSP`.
- [x] Production migration `offerpsp_agent_cobrand_settings` is applied. The three co-brand RPCs
  deny anonymous access; staff/member/foreign-client isolation and all 42 migrations passed in the
  isolated regression suite.
- [x] Cockpit deployment `dpl_6NYjxkerwNgTNDQgSxUjgJy4ccYe` and public portal deployment
  `dpl_FGTaaGLRbyeK5e2VxboWnQSkGVDU` are `READY` in production.
- [ ] Accept the first invitation using a real subagent email and visually confirm that
  organization's branding in its authenticated portal. Custom white-label domains remain a later
  product decision and are not part of the current co-branded model.

## AIBot security and OfferPSP mail center — 2026-08-05

Status: `VERIFIED` in production except for inbound mailbox activation.

- [x] Legacy AIBot tables `casino_leads`, `psp_providers`, `bot_tasks`, `chat_logs` and
  `email_drafts` now have RLS enabled; direct `anon`/`authenticated` access is revoked.
- [x] Ten n8n workflows use the dedicated service-role credential and service-only RPCs. Active
  workflows were republished and the casino runtime smoke returned HTTP 200 with 50 rows.
- [x] Existing data remained intact after hardening: 222 casinos, 77 research PSPs and 13 bot tasks.
- [x] The production mail center provides inbox/thread search, unread and follow-up states,
  archive, conversation view, replies and manual links to merchants, casinos and PSPs.
- [x] Incoming messages are grouped into threads and automatically linked by sender email when a
  matching merchant, casino or research PSP exists.
- [x] Production migrations `aibot_n8n_service_rpc`, `aibot_legacy_table_rls` and
  `offerpsp_mail_center` are applied. New mail tables deny direct `anon`/`authenticated` access.
- [x] Production cockpit deployment `dpl_9QKSjs3RqxYLbHp383La1HQ92Qpc` is `READY` at
  `https://ops-7q4m2x9k8v3n.vercel.app`; authenticated desktop/mobile mail-center smoke passed.
- [x] Production mail E2E verified ingest, unread counter, opening, follow-up state and cleanup.
- [x] Outgoing mail through the active Brevo/n8n sender remains operational for
  `bizdev@offerpsp.com`.
- [ ] `BLOCKED`: activate n8n workflow `N0GEPhmvvRD4KRhw` for incoming mail after the current
  GoDaddy IMAP password for `bizdev@offerpsp.com` is installed. The archived Titan and GoDaddy
  credentials are rejected by the live mailbox; the prepared workflow remains inactive.

## Editable research base and scalable offer catalogue — 2026-08-04

Status: `VERIFIED` for database migration, access isolation, local build and regression suite.

- [x] `База AIBot` supports creating and editing all current casino and research-PSP fields,
  including contacts, GEO, licences, qualification, coverage, limits, commercial terms and notes.
- [x] Casino/PSP records have reversible archive/restore lifecycle and staff audit history; website
  opening is a separate action and no longer replaces editing.
- [x] Offer catalogue is grouped by PSP and filters by PSP, status, GEO, currency, payment method,
  PayIn/PayOut flow, validation health, freshness and free-text search.
- [x] Every offer row opens the existing full route editor; provider and route query parameters are
  preserved when moving between the catalogue and PSP workspace.
- [x] Production migration `offerpsp_research_crud` applied without changing the existing 222 casino
  and 77 research-PSP records. CRUD and lifecycle RPCs are denied to `anon` and check staff identity.
- [x] All 27 migrations and the full route → shortlist → client → PSP review → Telegram → Zoom → won
  regression pass in isolated PGlite, including research CRUD and non-staff denial.
- [x] Legacy AIBot tables and dependent n8n workflows were hardened together on 2026-08-05; direct
  browser access is closed and operational workflows use service-only RPCs.

## Captain's Bridge — isolated production cockpit 2026-08-03

Status: `VERIFIED` for migration, build, deployment and public-route isolation. Authenticated
visual smoke of the new internal pages remains to be repeated after staff sign-in on the new domain.

- [x] Staff cockpit moved out of `offerpsp.com` into the separate Vercel project
  `ops-7q4m2x9k8v3n` at `https://ops-7q4m2x9k8v3n.vercel.app`.
- [x] Public deployment no longer contains staff bundles or routes. `/admin/`,
  `/admin-legacy/` and `/control/` return 404 while `/` and `/portal/` remain available.
- [x] Production cockpit deployment `dpl_6UMnSYCnnc8aYGJs9PAQa7CtvdyP` is `READY` and aliased
  to the isolated project address.
- [x] Production migration `offerpsp_captains_bridge` adds staff-only RPCs for the unified
  AIBot/Telegram/email/task read model, email draft journal and complete merchant editing.
- [x] All 23 migrations pass in isolated PGlite, including staff/anon grants and the complete
  route → shortlist → client → PSP review → Telegram → Zoom → won E2E.
- [x] Merchant workspace now edits company, contacts, payment request, volume/limits, licence,
  qualification, status, quality and owner. Archive, restore and guarded owner-only purge are wired.
- [x] Archived merchants remain visible in CRM history instead of disappearing from the UI.
- [x] `База AIBot` reads all current `casino_leads` and legacy research `psp_providers` through
  the staff-only bridge RPC; the production response was verified with 222 casinos and 77 PSPs.
- [x] Communications reads Telegram logs and email history; Tasks combines OfferPSP and AIBot
  queues; Integrations reflects real data flow.
- [x] Email composition is proxied through a staff-authenticated server function to the existing
  active n8n Email Sender using `bizdev@offerpsp.com`. SMTP accepted the self-addressed verification
  message and the workflow now skips the optional Notion update when no draft ID is supplied.
- [x] The public sign-in page and frontend bundle no longer disclose the owner email or send it as
  a Google `login_hint`; the exact account restriction remains enforced by the database function.
- [x] Authenticated desktop and mobile cockpit smoke passed on the isolated Vercel domain.
- [x] Legacy AIBot security hardening completed together with dependent n8n workflow migration.

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
- [x] Production deployment `dpl_D8GkbbqJmduntGntZnpfcqXtLUAi` is `READY` and
  serves Control Bridge V2 at the canonical `https://offerpsp.com/admin/` route.
  The former staff cabinet remains available at `/admin-legacy/`, `/control/`
  redirects to `/admin/`, and the landing plus `/portal/` remain intact.
- [x] The production bundle contains the real Supabase URL without fallback
  placeholders; `/admin/`, nested SPA routes, `/admin-legacy/` and `/portal/`
  passed deployment smoke checks. The sign-in UI rendered in a browser and
  runtime logs contained no errors.
- [x] Daily-operations polish excludes archive/closed fixtures from active metrics,
  adds Command Center quick actions, mobile merchant cards, contained Kanban
  scrolling and responsive global search across merchants, PSPs and routes.
- [x] Analytics now includes the cumulative commercial funnel, six-week lead trend,
  GEO coverage, supply health, launch conversion and shortlist conversion instead
  of relying only on headline counters.
- [x] Polished production deployment `dpl_5FXvX5M5yj1LRmDAxzhPTzDpp15R` is `READY`.
  `/admin/`, `/admin/analytics`, `/admin/merchants`, `/portal/` and
  `/admin-legacy/` passed production smoke checks; the bundle contains the real
  Supabase URL without fallback placeholders.
- [x] Previous production `dpl_D8GkbbqJmduntGntZnpfcqXtLUAi` remains the immediate
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

### 3. Agent/commission product layer

Status: `VERIFIED` in production for member invitations and roles, scalable portfolio navigation,
commission operations and co-branded workspace settings.

The only remaining acceptance check requires a real subagent: accept an actual invitation and
visually verify that organization's branding in the authenticated portal. No fake production
organization or user is created for this check. Custom white-label domains remain a later product
decision.

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
- [x] Automated stale-offer alerts and partner reminders through n8n. A private provider-level
  queue uses the existing `last_verified_at`, source effective date, route expiry and
  `freshness_days`; it creates one deduplicated operational task, prepares RU/EN partner text,
  alerts Boris in Telegram at most once per seven days and resolves itself after confirmation or
  publication of a fresh rate card.
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

Security note: the legacy `offerpsp_client_shortlist` view is no longer used by the portal.
Migration `remove_legacy_client_shortlist_view` removes this redundant exposed surface; the portal
and its isolation tests use the current `list_offerpsp_client_offers` RPC.

## Truly not implemented

Status: `PARTIAL` — these are the actual next P1/P2 tasks after rollout.

### P1 — PSP and route operations

- [x] Full PSP/contact editor in the production staff cabinet.
- [x] Route, fee, limit, settlement and anomaly editor in production.
- [x] Anomaly resolution/acceptance UI with audit notes in production.
- [x] Pause, resume and archive controls for individual routes in production.
- [x] Visual version history in production; field-by-field batch comparison remains open.
- [x] Freshness dashboard, last-confirmed controls and automated reminder queue are in production.
- [x] Partner reminders through n8n; the active six-hour workflow was validated with zero errors
  and completed a production sync without sending an early notification.
- [x] GEO/currency/method/vertical coverage matrix deployed in RU/EN.

### P1 — Deal Desk

- [x] Staff UI for reviewing and editing the merchant dossier in production.
- [x] Missing-information workflow linked to the client dossier in production.
- [x] Staff controls for PSP submission and review decisions in production.
- [x] Telegram group recording and transition in production.
- [x] Zoom scheduling and won/lost controls in production.
- [x] Stored RU/EN introduction templates and automated Telegram/Zoom preparation are in
  production: the Deal Desk generates a group title, introduction message, participant contacts,
  Zoom title/agenda and operational checklist, with copy actions and saved staff-only preparation
  history. Telegram group creation and the actual Zoom link remain deliberate human actions because
  the Telegram Bot API cannot create groups and no Zoom OAuth account is connected. Production
  migration `offerpsp_introduction_preparation` and deployment
  `dpl_FtB4QMyK4qTfRbeBEbDL1tQy5oBP` are verified.
- [x] Structured deal outcome and result-quality tracking in production: won/lost reason,
  integration stage, live date, actual monthly volume, quality score, follow-up date, full staff
  chronology and elapsed-time metrics from lead submission through PSP review, Telegram, Zoom and
  final result. Production migration `offerpsp_deal_outcomes` and cockpit deployment
  `dpl_AWgXCueSPCQARooqbyVvBFTR73j1` are verified; direct client/anonymous access is denied.

The first operational UI is deployed. Daily-use refinement remains.

### P1 — Agent operations

- [x] Staff editor for agent/merchant organizations, relationship tier/status, merchant assignments
  and versioned agent margin policies in production.
- [x] Organization-member and role management UI in production: staff can add an existing
  Supabase user to an agent organization, change `owner`/`admin`/`manager`/`viewer`, suspend and
  restore access, while the database prevents removal of the last active owner and records an
  audit entry. Anonymous and non-staff access is denied. Production migration
  `offerpsp_organization_member_management` and cockpit deployment
  `dpl_3jp9GVd1UwgWw48J7iXsogxSbXcY` are verified.
- [x] Agent onboarding/invitation flow and managed-client switcher are in production. Staff can
  invite a new member by email or attach an existing Supabase user without exposing the service
  role key; Edge Function `offerpsp-invite-member` v1 verifies JWT and active staff access before
  sending the invite and assigning the role. The merchant/agent portal now has RU/EN portfolio
  search, result count and a bounded scrollable request switcher for larger portfolios. Cockpit
  deployment `dpl_47Tagpcb2qd7fF31Hfw5nvYD38Ud` and portal deployment
  `dpl_DmxffiYbVYMMtafEmhhmQ1Hu9srz` are verified. The first real invite-email acceptance will be
  verified with an actual subagent instead of creating a fake production user.
- [x] Agent commission ledger in production: staff records projected commission amounts and basis,
  advances them only through `projected → approved → earned → paid`, can void a non-terminal entry,
  cannot edit paid history or skip stages, and downloads the full ledger as CSV. Private financial
  rows remain RPC-only and every change is audited. Production migration
  `offerpsp_agent_commission_workflow` and cockpit deployment
  `dpl_Cy9HrK4NJ19MrVMPAfBVX2WZoLVC` are verified.
- [x] Co-branded agent workspace settings are in production: staff controls enablement, display
  name, RU/EN taglines, HTTPS logo, accent colour and support email; the agent portal renders the
  safe organization branding while retaining `Powered by OfferPSP`. Production migration
  `offerpsp_agent_cobrand_settings`, cockpit deployment
  `dpl_6NYjxkerwNgTNDQgSxUjgJy4ccYe` and public portal deployment
  `dpl_FGTaaGLRbyeK5e2VxboWnQSkGVDU` are verified. The first real-agent visual acceptance remains;
  white-label domains are intentionally deferred.

### P1 — Telegram ingestion

- [x] Receive a partner rate card from the existing AIBot when Boris forwards or pastes the source
  and explicitly asks the agent to save it. The agent preserves the original text and only enqueues
  it for review; it does not claim that the source is parsed or published.
- [x] Define the universal ingestion contract: any source becomes a reviewed normalized draft and
  every merchant output uses the Telegram-offer presentation standard.
- [x] Add local source adapters for TXT/Markdown, CSV/TSV, XLSX, text PDF and DOCX with immutable
  original-file hashes and review-required metadata.
- [x] Allow the deterministic normalizer to accept new PSPs without adding a hard-coded provider preset.
- [x] Deploy the private production ingestion queue for Telegram, email, admin text/file and API
  sources, including source hashes, deduplication, processing state, errors and immutable references.
- [x] Deploy the cockpit intake screen for pasted sources and text-based files, with queue history,
  retry and dismissal controls.
- [x] Protect the AIBot → OfferPSP intake webhook with a dedicated internal credential. Production
  transport E2E returned a queued job in Supabase; the test job and temporary workflows were removed.
- [x] Run queued text sources through the deterministic parser automatically. The production n8n
  worker claims jobs every minute, calls the protected parser API, imports only draft/review data
  and records failures without publishing routes. A real production E2E reached `review`, created
  one draft route and no published routes; the exact test job, batch, route and provider were removed.
- [x] Connect binary admin files to the source adapters before the existing queue/parser worker.
  The cockpit accepts TXT/CSV/JSON/HTML, PDF, DOCX and XLSX, extracts normalized text in the
  authenticated browser and sends the result through the same draft/review pipeline.
- [x] Store original binary files in the private `offerpsp-private-sources` bucket and attach the
  storage reference, SHA-256, MIME type, size and extractor metadata to the ingestion job/batch.
  Production upload E2E verified the physical object, automatic worker pickup and review state.
- [x] Add guarded staff purge for rejected/test sources. It refuses queued/processing/published
  data and removes the job, non-published draft batch, queue-created provider and private Storage
  object. Production E2E cleanup left the 12 published routes unchanged.
- [ ] Connect incoming mailbox messages and attachments to the source adapters before the existing
  queue/parser worker. Activation remains blocked by the invalid GoDaddy IMAP credential above.
- [x] Add browser-side English/Russian OCR for scanned PDF pages and PNG/JPEG/WebP sources.
  Domain labels are normalized before parsing, and the canonical `GEO - Country` header is accepted.
  Production E2E converted a generated PNG rate card into one complete India/INR/UPI draft route
  with zero blocking anomalies; the exact job, batch, route, provider and Storage object were purged.
- [x] Surface new draft parses, parser failures, blocking anomalies and duplicates in the staff
  review queue. The Command Center shows the attention count; the intake screen refreshes every
  15 seconds and supports direct review, retry and dismissal.
- [x] Link Telegram ingestion to partner freshness reminders. Published reviewed rate cards update
  the existing provider confirmation timestamp, close the reminder and complete its task; incoming
  drafts remain review-only and never falsely confirm partner terms.

The production queue, AIBot transport, automatic text parser and private admin-file ingestion are
connected. Incoming mailbox activation remains the next external-channel step; partner freshness
automation is live in Supabase, the cockpit and n8n.

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
- The legacy `psp_providers` table remains the AIBot research source, but it is no longer public:
  n8n uses service-only access and the cockpit reads it through staff-checked RPCs.
