# OfferPSP tasks and verified state

Updated: 2026-08-01

This file separates local implementation from local verification and production state.
Code or a passing local test is not evidence that production has been updated.

## Implemented locally

Status: `PARTIAL` until the grant hotfix and real-account production E2E are complete.

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

### Production grant hotfix

- [x] Added `20260801_offerpsp_authenticated_lead_grants.sql` after production E2E
  proved that staff UPDATE/DELETE policies existed without table privileges.
- [x] The migration grants only UPDATE/DELETE to `authenticated`; existing RLS still
  limits those operations to active OfferPSP staff.

## Verified locally

Status: `VERIFIED` on 2026-08-01 in an ephemeral PostgreSQL-compatible PGlite database.

- [x] All six existing migrations, the three platform migrations and the grant hotfix
  apply in dependency order.
- [x] `authenticated` has lead UPDATE/DELETE privileges while `anon` does not.
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

Status: `BLOCKED` pending approval for one new production DDL migration.

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
- [ ] `20260801_offerpsp_authenticated_lead_grants.sql` is locally verified but not applied to production.
- [ ] Production E2E with separate staff/client users reached auth separation and a clean
  isolated route, then stopped at staff lead UPDATE with PostgreSQL `42501`.
- [x] The failed E2E fixture was made inert: provider archived, route archived, batch
  superseded, test lead closed and test staff deactivated.

Open production verification:

1. approve and apply `20260801_offerpsp_authenticated_lead_grants.sql`;
2. verify grants and confirm a non-staff client still cannot update leads;
3. reactivate the isolated E2E staff account;
4. rerun `route → matching → shortlist → client → dossier → PSP review → Telegram → Zoom → won`;
5. archive the E2E fixture again and keep BRPay/Antarex unpublished.

Security note: Supabase advisor reports `offerpsp_client_shortlist` as a
`SECURITY DEFINER` view. Anonymous access is revoked and the view filters on
`auth.uid()`, but separate-client isolation must be rechecked in the completed E2E.

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
