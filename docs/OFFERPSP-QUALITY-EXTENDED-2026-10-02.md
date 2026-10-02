# Captain's Bridge extended verification — 2 October 2026

Status: **PARTIAL**. This is evidence from bounded tests, not ISO certification,
an all-controls ASVS pass, or a completed WCAG conformance assessment.
Initial production inspected: release `1bdaa523b06e03630cd4efd1206aa0a97d9db974`.
Staff fixes are now deployed as `93b68cd75e51efa866243fe8f35cfc1ca9156c42`;
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

Follow-up at approximately 14:12–14:18 Asia/Nicosia: Boris confirmed that the
enabled VoiceOver actually spoke. The task form retained accessible names and
keyboard focus. The automation could not capture a spoken phrase or caption;
this is a bounded human confirmation of activation, not a completed screen-reader
journey. VoiceOver was explicitly switched OFF after this attempt.

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

## Fresh production backup and isolated logical restore

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

That credential blocker is now resolved: Boris manually saved the current-project
database password and server key in the private capture helper at 11:54:05 UTC.
Neither value was printed, committed, or sent to another service.

`VERIFIED` at 12:11 UTC: `scripts/export-current-recovery-pack.mjs` exported the
current PostgreSQL 17.6 database via the dashboard-confirmed Session pooler with
`sslmode=verify-full` and Supabase's root certificate. The client TLS connection
is verified independently of `pg_stat_ssl`, which observes the pooler backend
leg. Logical dump size is 10,988,842 bytes. Roles are exported without passwords.
All 20 Storage objects from three private buckets were downloaded, totaling
6,357,644 bytes, with stable per-bucket before/after inventories and SHA-256.
This is not an atomic database-plus-Storage snapshot.

`VERIFIED` isolated restore: `scripts/verify-current-recovery-pack.mjs` restored
the dump with `--exit-on-error --single-transaction` into a fresh PostgreSQL 17.6
container. All 159 table definitions and seven extension versions match. Every
archived COPY row matches restored output: 156 tables, 11,829 rows, compared as
order-independent multisets with SHA-256. All 20 locally restored Storage files
also match. Docker networking is `none`, no ports are published, cron is disabled,
and the pg_net worker points at empty template1 rather than restored queues.
Temporary test containers and their volumes were removed; private backup files
remain on this Mac.

The ordinary extension-aware dump does not contain COPY data for transient
`net._http_response`, `net.http_request_queue`, and `realtime.messages`. These
are not claimed as restored historical queue contents. Early restore trials
failed on the local role's privilege and pg_net preload requirements; both were
resolved. A later byte comparison initially differed because regclass formatting
used a different search_path; matching pg_dump's text settings produces exact
row hashes. Failure receipts are retained, not relabelled as passes.

Private evidence: `.private/recovery-packs/current-20261002-kXVcKo/`, final
`restore-proof-ti2Cq9/report.json`. Directories are private and files mode 600;
no database contents, customer files, or credentials enter Git.

`PARTIAL` whole-service recovery: the logical database and local file integrity
pass does not verify a complete Supabase runtime, Storage API serving, Auth/JWT,
SMTP, Edge Functions, external n8n/Vercel configuration, Vault decryption, or a
measured production RTO/RPO. Those require a separate isolated service-stack drill.

### Password dependency review and credential handoff

Read all 18 relevant active OfferPSP/iGaming workflow graphs (SEO agent excluded):
no Postgres nodes, direct database URLs or database-password environment markers
were found. Staff/public Vercel production environment-name inventories contain
API keys/URLs, but no database-password or direct-connection variables. The
application source uses Supabase HTTP clients; the only matching local script
is the synthetic load/restore fixture. Current pg_stat_activity shows only
managed services and no external password-authenticated postgres client.

This does not prove that an infrequent external client never exists. Resetting
the database password still needs Boris to enter, confirm and submit it himself,
with a known reconnect risk. No password or API-key rotation was performed.

The existing current-project service_role key is readable through the authorized
Supabase dashboard. It was selected without logging its value, creating a key or
changing permissions. Passing it through hidden local Terminal input was blocked
because computer-use access to Terminal.app is disallowed. No broader secret
export or workaround was attempted; the unused in-memory value was cleared.

Prepared `scripts/capture-recovery-credentials.mjs` for Boris to run manually:
hidden TTY input accepts only the database password and existing Storage API key,
validates the legacy key's project/role, and creates a mode-600 JSON in an ignored
mode-700 local directory. It refuses overwrite and makes no network call.
Syntax checked. A hidden-input TTY test with synthetic credentials rejected a
wrong-project legacy key before file creation; the exact credential target remains
absent. No real credential file has been created by the agent. The blank database
password-reset dialog is open for Boris; entry and submission have not occurred.

## Additional HTTP access and cache verification

At 14:20 Asia/Nicosia, 28 bounded anonymous/invalid-bearer requests to 14 protected
staff endpoints returned JSON 401/403 denials. Empty bodies, no real identifiers,
no valid session or communication content were used; no sends were invoked.
This does not cover every session, scope, authorization or penetration-test case.

These requests revealed four JSON response helpers without explicit no-store:
send-email, extract-document, parse-offer and extract-offer-pdf. Authentication
denial works; absence of the header is not evidence of an existing disclosure.
Each helper now sets Cache-Control: no-store for success and error responses.
A synthetic eight-response regression failed before the fix and passes after it,
with all network calls disabled. The full local baseline at 14:24–14:25
Asia/Nicosia passes **29 groups / 0 FAIL / 0 BLOCKED**.
The follow-up deployment and strict post-release receipt are recorded below.

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

### Cache follow-up release

- Full local checkpoint: 29 groups PASS / 0 FAIL / 0 BLOCKED,
  11:24:30–11:25:19 UTC. Evidence:
  `tmp/quality-baseline/2026-10-02T11-24-30-223Z/report.json`.
- Source `93b68cd75e51efa866243fe8f35cfc1ca9156c42` is pushed and deployed READY
  as `dpl_BwePHvy2mBcRUwUvr7HoUxwhVJif`. The primary staff alias was explicitly
  assigned; its manifest matches this exact source and deployment.
- Strict production HTTP check at 11:29:58–11:30:16 UTC: 28 requests PASS,
  0 FAIL; all 14 protected routes deny anonymous/invalid tokens with JSON 401/403
  and explicit `Cache-Control: no-store`. This does not test valid nonstaff
  sessions, all OAuth scopes or production capacity.
- Authenticated browser reloaded source 93b68cd7: three open/overdue tasks remain,
  calendar contains three events today and Radio Room loads 23 active chains.
  No task, membership or outbound message was changed. Public portal and SEO/GEO
  were not deployed by this follow-up. VoiceOver remains OFF.

## Company rejection check on the restored database

`VERIFIED` bounded backend check: the restored production database passes nine
company-join rejection cases using a fresh QA organization, lead and submission.
The fixture uses only the two previously authorized verified QA identities;
roles are exercised as authenticated users, not as the restore superuser.
Pending access and applicant self-approval are denied; owner rejection succeeds;
replay is idempotent; the opposite decision is denied. No applicant membership
or contact is created, exactly one decision event exists, and claiming again
does not grant access. The earlier approved QA request stays approved.
The entire fixture rolls back and its isolated container is removed.

Command: `node scripts/verify-current-recovery-pack.mjs <private-pack-path>
--check-company-rejection`. Optional fixture source is
`scripts/restored-company-rejection.sql`. This is **not** a browser E2E pass.
Read-only production checks still find only the original approved request and
the archived QA company; neither was changed for this test.

The first functional trial confirmed a missing recovery dependency: inserting a
new lead calls the screening dispatch trigger, which reads Vault and fails with
`no server secret key defined` on this local restore. This is a recovery-runtime
configuration limitation, not evidence of a production intake failure. Only the
local rolled-back rejection fixture neutralizes screening dispatch and its secret
reference; no authorization trigger is disabled. Vault recovery and real screening
dispatch remain explicitly unverified. A second fixture trial also found an SQL
variable-name ambiguity, corrected before the passing run.

## Still open

1. Live owner rejection using an isolated pending QA request; do not rewrite the
   previously approved membership/history as if it were a fresh E2E request.
   Nine restored-database backend rejection checks now pass, but do not replace
   the fresh live browser scenario.
2. Actual screen-reader journey and remaining accessibility states.
3. Full isolated service-stack recovery: fresh logical DB and local Storage bytes
   are now verified, but runtime configuration, Auth/Storage serving, Vault
   decryption, and end-to-end service restart remain unverified.
4. Individual ASVS applicability/evidence, remaining HTTP/API negative scenarios,
   and a managed Postgres security-upgrade plan.

Sources: [ASVS 5.0.0](https://github.com/OWASP/ASVS/releases/tag/v5.0.0),
[WCAG 2.2](https://www.w3.org/TR/WCAG22/),
[Supabase backups](https://supabase.com/docs/guides/platform/backups),
[logical backup export](https://supabase.com/docs/guides/troubleshooting/download-logical-backups),
[self-hosted restore](https://supabase.com/docs/guides/self-hosting/restore-from-platform),
[Postgres security upgrade](https://supabase.com/changelog/postgres-15-19-17-11-breaking-changes).
