# OfferPSP tasks and verified state

Updated: 2026-07-31

This file separates local implementation from local verification and production state.
Code or a passing local test is not evidence that production has been updated.

## Implemented locally

Status: `PARTIAL` until the production rollout and real-account checks are complete.

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

### Matching v2

- [x] Route-level hard gates for GEO, blocked GEO, currency, flow, method, traffic,
  vertical, monthly volume and transaction limits.
- [x] Structured merchant request fields and `needs_clarification` handling.
- [x] Client-rate calculation through provider/route/merchant margin policies.
- [x] Staff matching action uses private route matches instead of the legacy provider card.
- [x] Draft shortlist creation uses client-safe snapshots and requires current published routes.

### Client cabinet

- [x] RU is the default language; RU/EN switch is available.
- [x] Guided next action replaces the progress-heavy layout.
- [x] Anonymous route details, limits, settlement and final client fees are shown.
- [x] `Interested`, `Need details` and `Not suitable` responses.
- [x] Selected-option summary and primary `Request introduction` action.
- [x] Legacy shortlist items cannot request an introduction until reissued from the private route model.

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

## Verified locally

Status: `VERIFIED` on 2026-07-31 in an ephemeral PostgreSQL-compatible PGlite database.

- [x] All six existing migrations and the three new migrations apply in dependency order.
- [x] BRPay parses and imports as exactly 15 draft routes.
- [x] Antarex parses and imports as exactly 20 draft routes.
- [x] Open error anomalies prevent draft publication.
- [x] A non-staff authenticated user cannot call the private supply API.
- [x] Client shortlist output does not contain provider identity, internal route/provider IDs,
  PSP base rates or margin mode.
- [x] Rebuilding matching removes stale reviewed route matches without invalidating an existing client snapshot.
- [x] Full E2E passes:
  `route → matching → shortlist → client selection → dossier → PSP needs info → second review → PSP accepted → Telegram → Zoom → won`.
- [x] A repeated Telegram call cannot move an introduction backwards after Zoom is scheduled.
- [x] JavaScript syntax checks and `git diff --check` pass.
- [x] Client and staff screens were visually checked at desktop and mobile widths without horizontal overflow.

Local verification does not replace testing with real Supabase staff and client accounts.

## Implemented but not deployed

Status: `BLOCKED` pending Boris approval after read-only production preflight.

- [ ] `20260731_offerpsp_private_supply.sql` is not applied to production.
- [ ] `20260731_offerpsp_route_matching.sql` is not applied to production.
- [ ] `20260731_offerpsp_introduction_pipeline.sql` is not applied to production.
- [ ] BRPay and Antarex prepared payloads are not imported into production Supabase.
- [ ] No BRPay or Antarex rate card has been published.
- [ ] Antarex margin is intentionally unset pending a value from Boris.
- [ ] Updated client and staff frontends are not deployed to production.
- [ ] Production route matching still uses the previously deployed implementation until rollout.
- [ ] A true production E2E with separate staff and client accounts has not been run.

Production rollout order:

1. read-only schema, RLS, function, n8n dependency, auth and Vercel preflight;
2. explicit Boris approval;
3. apply the three migrations in filename order;
4. verify functions and privileges;
5. import BRPay and Antarex as drafts only;
6. deploy frontend;
7. run separate-account staff/client E2E;
8. keep every rate card with open error anomalies unpublished.

## Truly not implemented

Status: `PARTIAL` — these are the actual next P1/P2 tasks after rollout.

### P1 — PSP and route operations

- [ ] Full PSP/contact editor in the staff cabinet.
- [ ] Route, fee, limit, settlement and anomaly editor.
- [ ] Anomaly resolution/acceptance UI with audit notes.
- [ ] Pause, resume and archive controls for individual routes.
- [ ] Visual version history and comparison between rate-card batches.
- [ ] Freshness dashboard, last-confirmed controls and stale-offer alerts.
- [ ] Partner reminders through n8n.
- [ ] GEO/method/vertical coverage matrix.

### P1 — Deal Desk

- [ ] Staff UI for reviewing and editing the full merchant dossier.
- [ ] Missing-information workflow linked to client conversation.
- [ ] Staff controls for PSP submission and review decisions.
- [ ] Telegram group preparation and stored introduction template.
- [ ] Zoom scheduling UI and cooperation follow-up controls.
- [ ] Deal history and result-quality tracking.

The database functions for this pipeline exist locally; the complete operational UI does not.

### P1 — Telegram ingestion

- [ ] Receive a partner rate card directly from Telegram.
- [ ] Attach the source message/file reference and start parsing automatically.
- [ ] Send parser errors and duplicate warnings to a staff review queue.
- [ ] Link Telegram ingestion to partner freshness reminders.

The local parser accepts copied Telegram text, but no Telegram-triggered workflow exists.

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
- Do not configure or publish Antarex pricing without Boris providing the margin value.
- A real client test must use a different authenticated account/session from staff.
- The legacy public `psp_providers` table remains in place until n8n dependencies are
  verified and migrated safely.
