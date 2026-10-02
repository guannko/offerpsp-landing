# Captain's Bridge extended verification — 2 October 2026

Status: **PARTIAL**. This is evidence from bounded tests, not ISO certification,
an all-controls ASVS pass, or a completed WCAG conformance assessment.
Initial production inspected: release `1bdaa523b06e03630cd4efd1206aa0a97d9db974`.
Staff fixes are now deployed as `d99dd3679ecfbcfeccce71360a41e3eca7f02766`;
the public portal remains on the initial release. Delivery receipts follow below.

## Closed checks

| Check | Actual evidence | Result |
| --- | --- | --- |
| Browser original DOCX download | Native save completed; 36,959 bytes; SHA-256 `77b2f3b4929aecc0541ca9c738d905e9ca7fcd81ea402b0910b1b0ed1034bcf2` matches uploaded synthetic original | VERIFIED |
| Browser original PDF download | Native save completed; 1,775 bytes; SHA-256 `308737580fadc6811fa583a0b955c378c8440927f413626041488e1d24eaf818` matches uploaded synthetic original | VERIFIED |
| Expired magic link without session | Unique public release origin, `otp_expired` callback: login remains closed and Russian status explains requesting a fresh link | VERIFIED |
| Existing regressions after repairs | Node 24.19.0; 27 groups PASS / 0 FAIL / 0 BLOCKED, 10:27:31–10:28:37 UTC; ignored `tmp/quality-baseline/2026-10-02T10-27-31-790Z/report.json` | VERIFIED for this checkpoint, not all future edits |
| Calendar keyboard | Actual component with an injected empty reader: ArrowRight, Home and End change selected layer, active focus and associated panel consistently; one tab has tabIndex 0 | VERIFIED isolated component |
| Modal keyboard | Actual shared hook: initial focus, Shift-Tab/Tab wrap, nested Escape return, parent Escape return to original launcher | VERIFIED isolated component |

The QA work document remains `c49a15bb-eeb3-405b-95ff-3058cb530e0d`.
These downloads concern only synthetic files, not customer documents.

Final source checkpoint: **28 groups PASS / 0 FAIL / 0 BLOCKED** at
10:41:40–10:42:58 UTC, including the added accessibility-boundary contracts;
`tmp/quality-baseline/2026-10-02T10-41-40-062Z/report.json`.

## Security inventory and negative probes

Live canonical project: `iceopurxqzqmwtcmwfzl`, PostgreSQL 17.6.
Private machine evidence records 414 function definitions, 351 SECURITY DEFINER
functions, 104 tables/views, 60 policies, grants and three private buckets.

- All inventoried SECURITY DEFINER functions have a configured search path.
- Public application tables have RLS enabled; the private schema denies ordinary
  role USAGE/CREATE. Private tables without RLS are not automatically classified
  as vulnerabilities when they have no ordinary schema/table access.
- Staff authorization checks trusted Google app metadata, a verified designated
  email and an active staff row. User-editable metadata is not the trust source.
- Read the 29 authenticated SECURITY DEFINER bodies without a direct staff guard,
  including provider/merchant/member boundaries and protected transitive calls.
- Inspected all three deployed Edge Functions: staff invite, custom-token email
  ingestion, and a retired 410-only temporary storage function.
- **370 read-only role/entity probes**: 80 staff reads, 16 compound reads, 28
  cross-entity reads and 246 guarded writer denials. **369 expected safe outcomes**;
  one owner-decision probe hit the transaction's read-only SELECT FOR UPDATE
  restriction before authorization, so it is **unproven**, not a security PASS.
- The two identified dynamic SQL helpers use quoted identifiers and bound values.
- Supabase advisor's 188 authenticated SECURITY DEFINER warnings and 40 private
  RLS/no-policy INFO items are inventory warnings, not 188 proven exploits.

### Confirmed response-field leak

`save_offerpsp_provider_portal_profile` returned the full private provider row to
an authorized PSP manager. That included staff-only relationship notes and other
internal commercial/ownership fields. The safe read workspace already used a
projection; the write response did not.

The synthetic sentinel regression failed before the fix. Migration
`20261002103000_offerpsp_provider_profile_response_boundary.sql` preserves mutation,
membership, grants and publication behavior, but returns an explicit provider
allowlist and omits `profile.updated_by`. Full local migration replay passes after
the fix. Immediately before rollout the live function definition was unchanged
from the audited version. Its original definition is retained privately for rollback.
Applied to production at 10:45:15 UTC as migration version `20261002104515`,
name `offerpsp_provider_profile_response_boundary`. Live definition confirms the
full-row response is absent, the explicit allowlist is present and the internal
profile actor is removed. Anonymous EXECUTE remains false; authenticated and
service grants are unchanged. This is a configuration receipt plus synthetic
functional regression, not a forced edit of a real provider profile.

### Transport hardening and known limits

The deployed staff configuration adds nosniff, SAMEORIGIN, no-referrer and a limited
CSP for base URI, objects and frame ancestry. This is **not** a complete script or
connection CSP, and it does not establish XSS protection. OAuth, file previews
and full OAuth/file-preview journeys remain separate from header verification.
The primary staff response at 11:03:14 UTC contains all four configured headers.

The current managed PostgreSQL 17.6 also requires a separately planned review
against Supabase's September security upgrade guidance. No production engine
upgrade or password reset was attempted.

ASVS applicability/evidence per individual control is **not complete**. Negative
SQL probes alone do not cover every API, session, upload, OAuth, dependency or
operational security requirement.

## Accessibility scope

At actual Brave 200% zoom, loaded home/document/tasks/mail/inbox/compliance/
merchant/PSP/offer/casino/pipeline/deal/analytics views fit the 720-CSS-pixel window
without document-level horizontal overflow in the inspected states. Internal
tables and kanban retain deliberate local scrolling. This is not a full 400%
reflow or all-state test.

Deployed changes add names to previously unnamed controls, visible skip navigation,
search combobox/list semantics, active navigation semantics, error alerts, modal
focus containment/return and keyboard calendar tabs. Existing wrapped labels are
preserved rather than overwritten by example placeholders. A source-contract
suite complements, but does not replace, browser tests.

**VoiceOver is not verified.** Native activation was attempted, but no actual
speech/caption output was captured. The final inspected VoiceOver switch was OFF,
matching the original state. Accessibility-tree inspection is not a substitute
for a screen-reader journey. Full focus/error/non-text-contrast coverage remains
open; protected subagent, Telegram-group, Zoom and SEO implementations are unchanged.

## Measured isolated load, crash and restore

`platform-v2/scripts/test-load-restore.mjs` uses only installed reviewed images,
`--network none`, no published ports, random synthetic credentials and no sends.
Each run processes 120 workflows with concurrency 12, then replays their original
action token to check exactly one task and draft per workflow.

Three independent PostgreSQL 17.6 fixture runs:

| Start UTC | Workflows/sec | p50 / p95 / max ms | Unclean restart ms | Dump/restore ms | Result |
| --- | ---: | --- | ---: | ---: | --- |
| 09:58:13 | 41.92 | 284 / 347 / 360 | 510 | 456 | PASS |
| 10:00:03 | 34.15 | 341 / 422 / 451 | 772 | 413 | PASS |
| 10:00:09 | 34.37 | 331 / 443 / 470 | 477 | 465 | PASS |

All three have zero workflow errors; exact content hashes of five fixture tables
match after forced postmaster termination and after pg_dump/pg_restore into a new
database. Original token replay after restore creates no second draft. Containers
are removed in finally blocks. Timings include three docker exec calls per workflow.

These are local ARM synthetic workflow results, **not** production API capacity,
a full Supabase-stack restore, or production RTO/RPO. Earlier development trials
included one restore-hash mismatch before the three passing PostgreSQL 17.6 runs;
it is not used as evidence of a pass.

## Fresh production backup — BLOCKED

Boris explicitly authorized a private local copy of the current database and
Storage and a network-isolated restoration, without production replacement,
external sends or paid projects.

The live dashboard shows PRO daily physical backups; latest inspected backup is
2 October 01:15:22 UTC. Supabase documents that these do not include Storage object
bytes and physical backups are not a downloadable logical pg_dump replacement.
The August recovery package belongs to the old project and is **not substituted**.

The current database password was not found by scoped local file search, accessible
GitHub code search or Apple Notes search for the project identifier. GitHub CLI
secret-name listing is unavailable because that CLI has no login. A local Vercel
env snapshot names the server key but its value is empty. The single-variable
Vercel API returns metadata only, not the key. Loading all production secrets via
`vercel env run` was rejected by the approval reviewer as excessive credential
access. That refusal is respected; no workaround or password reset was attempted.

The scoped Storage exporter is prepared but **has not downloaded a production
snapshot**. A credential-only handoff or an approved dedicated backup connection
is required. No whole-production restoration pass is claimed.

## Production delivery and smoke receipts

- Source package `d3b3c69251713e9143777f186d7c97251ac34000` passed the 28-group
  baseline above and was deployed READY as `dpl_6rEYBCYPiVExmtHtnQMExwuMfaYr`.
- A subsequent browser check found the task dialog's close control was unnamed.
  The two-file follow-up `d99dd3679ecfbcfeccce71360a41e3eca7f02766` adds its
  accessible name and a source regression. Accessibility contracts, lint, build
  and diff check passed after that change; the full 28 groups were not rerun for
  this label-only follow-up.
- Final Linux production deployment `dpl_35SkewRqp8Lpeui4UY7vp3uWNeTo` is READY.
  The primary alias `https://ops-7q4m2x9k8v3n.vercel.app` was assigned explicitly;
  its manifest at 11:03:14 UTC matches the exact final commit and deployment ID.
- Authenticated live staff search holds keyboard focus, closes with Escape and
  returns focus to its launcher. Final task dialog focuses `Закрыть форму задачи`;
  cancelling returns focus to `+ Новая задача`. No task was saved.
- Radio Room loads 23 active chains without an alert. Calendar loads three real
  events for today; keyboard layer changes and associated panels work. Existing
  three open/overdue manual tasks remain unchanged.
- Actual `/api/integration-health` anonymous request returns 401 and no-store.
  A guessed `/api/health` SPA fallback is not used as an API-authentication test.
- Browser zoom was restored from 200% to 100% (1440 CSS pixels); VoiceOver is OFF
  as originally inspected. Notes search was cleared and the original partner-
  commission note remains selected. The temporary Vite server was stopped.
- Private durable evidence is in the ignored mode-700 directory
  `.private/quality-audit-20261002.a9nFLw`; it contains tests, bounded probe evidence,
  synthetic downloaded originals and rollback SQL, not a production DB snapshot.

## Still open

1. Live owner rejection using an isolated pending QA request; do not rewrite the
   previously approved membership/history as if it were a fresh E2E request.
2. Actual screen-reader journey and remaining accessibility states.
3. Fresh database + Storage export and full isolated restore once credentials exist.
4. Individual ASVS applicability/evidence, remaining HTTP/API negative scenarios,
   and a managed Postgres security-upgrade plan.

Sources: [ASVS 5.0.0](https://github.com/OWASP/ASVS/releases/tag/v5.0.0),
[WCAG 2.2](https://www.w3.org/TR/WCAG22/),
[Supabase backups](https://supabase.com/docs/guides/platform/backups),
[logical backup export](https://supabase.com/docs/guides/troubleshooting/download-logical-backups),
[self-hosted restore](https://supabase.com/docs/guides/self-hosting/restore-from-platform),
[Postgres security upgrade](https://supabase.com/changelog/postgres-15-19-17-11-breaking-changes).
