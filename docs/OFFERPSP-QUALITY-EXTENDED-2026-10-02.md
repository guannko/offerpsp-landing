# Captain's Bridge extended verification — 2 October 2026

Status: **PARTIAL**. This is evidence from bounded tests, not ISO certification,
an all-controls ASVS pass, or a completed WCAG conformance assessment.
Initial production inspected: release `1bdaa523b06e03630cd4efd1206aa0a97d9db974`.
Staff fixes are now deployed as `4ce6934e0ff7293bcbc65dd7706a6f36f686b175`;
the public portal remains on the initial release. Delivery receipts follow below.
Latest source checkpoint: 31 groups PASS / 0 FAIL / 0 BLOCKED at
19:25:48–19:26:59 UTC. Reflow and browser/DOCX hardening are now deployed;
the subsequent contrast fix awaits its own delivery receipt below.
Earlier checkpoints below remain historical evidence.

## Latest staff release verification

Code commit `4ce6934e0ff7293bcbc65dd7706a6f36f686b175` is deployed READY as
`dpl_DGDXdXWYQpKF78xoj5Gd7PWSwuMg`. The primary staff alias was assigned
explicitly after CLI updated only the secondary alias; its manifest matches.
Linux arm64/Node 24 build passes. All 11 function bundles import successfully
in a network-none container with only built output mounted and no credentials.
Function storage budget is 108.2 MiB, below the 120 MiB total limit.

Post-release HTTP checks pass 38 assertions: source identity, exact configured
CSP, all seven OCR executable hashes, 28 anonymous/invalid-token private API
denials with no-store and public home availability. The first receipt script
incorrectly expected a build-manifest on the public site and failed on 404 after
the staff assertions passed; that assumption was removed. Separate Vercel
inspection confirms the public deployment remains
`dpl_DsVRYnnAhDxpSaKaFDFBtdcWtQnM`, identical to its previous receipt.

Actual authenticated Brave reload preserves Boris staff access, 23 active mail
chains, three daily events, organizer/template library and the existing QA work
sheet. Its private synthetic PDF visibly renders in the embedded viewer; the
reader verifies the original SHA-256. No console error or warning was captured
during those journeys. No document save, task mutation or mail send was performed.
Protected module code and public portals were not changed. OCR execution remains
a local browser test with the same policy/assets, not a new production upload.

## Browser and DOCX hardening follow-up

The staff resource CSP now restricts scripts to the same origin, denies inline
handlers and JavaScript eval, and allowlists the canonical Supabase HTTPS/WSS
origin and two OCR language-data paths. OCR worker and WebAssembly core files
are prepared from the pinned installed version as local static assets. Document
bytes remain in the browser worker; language downloads do not transmit them.
Inline CSS and HTTPS images remain explicit compatibility allowances. This is
not a nonce/hash strict-CSP or complete ASVS conformance claim.

Actual Brave tests under the exact configured response header pass: injected
inline script, inline handler, external script and eval are denied; local-worker
English/Russian OCR returns the expected synthetic text; DOCX and PDF extraction
preserves the original hashes above; the blob PDF frame visibly renders its page.
The isolated fixture performs no authentication, database writes or mail sends.
Its first build inherited incompatible manual chunking and failed before OCR;
correcting only the private fixture build resolved it. This failure is not a
production defect or a completed production verification.

The original-document DOCX parser also rejects unsafe/ambiguous ZIP entry names,
duplicate entries, macros, executable/embedded content and mismatched local ZIP
names/flags. Regression tests fail before and pass after the changes. These
checks reduce the accepted document surface but do not detect every malicious
file and do not replace a private antivirus/quarantine service.

The 30-group baseline includes lint, build and Docker suites. The first run had
two failures (control-character lint rule and an obsolete limited-CSP assertion);
both are fixed and the full rerun passes. Receipt:
`tmp/quality-baseline/2026-10-02T16-30-39-205Z/report.json`.
Production rollout and bounded authenticated post-release checks pass as recorded
above. Full ASVS/WCAG assessment and antivirus infrastructure remain incomplete.

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

The pinned ASVS 5.0.0 Level 1/2 ledger is
`docs/OFFERPSP-ASVS-5-LEDGER.json`: 253 unique requirements, currently 183
NOT_TESTED, 55 PARTIAL, 7 NOT_APPLICABLE with a scoped rationale, 1 GAP and
7 OUT_OF_SCOPE for the explicitly excluded Zoom/WebRTC surface. These are
evidence-inventory states, not 253 completed assessments. No whole-control PASS
is inferred from a chapter's tests. Password requirements remain reviewable,
not automatically N/A merely because the current UI is passwordless.

The resource/script CSP control (V3.4.3) is PARTIAL on the implementation,
production header and bounded browser evidence above; strict-policy and complete
control review remain open. The remaining confirmed implementation gap is no antivirus gate
for files from untrusted sources (V5.4.3).
Type/signature/size checks do not replace antivirus. No customer document was
submitted to a public scanner; remediation must retain private processing.

At approximately 14:13 UTC both `npm audit --omit=dev --json` and
`npm audit --json` returned zero advisories against the current lockfile.
This is not an assessment of every external runtime or a complete SBOM.

Read-only upgrade preflight confirms PostgreSQL 17.6 with seven extensions.
No affected ltree/float GiST indexes, custom selectivity-estimator operators or
public/private application references to the affected PGP functions were found
in the inspected categories from Supabase's September 25 upgrade guidance.
This does not establish every workload's compatibility or inspect encrypted
customer content. The isolated official Supabase 17.11 rehearsal now passes,
as recorded below. A managed upgrade still needs supported-target confirmation,
reconnection/downtime acceptance and an explicit production window; no managed engine
upgrade was attempted.
Execution and failure handling are documented in
`docs/OFFERPSP-POSTGRES-UPGRADE-PLAN-2026-10-02.md`; the plan is not a rehearsal
receipt or approval of downtime.

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

Later native inspection again confirms VoiceOver OFF. Accessible search focus
and names were observed, but the attempted speech/caption capture did not supply
a verifiable spoken journey. This remains open rather than being inferred from
the accessibility tree.

### Narrow viewport defects and local repairs

At 320 CSS pixels, the fully loaded production task page extended to 411 pixels
and Radio Room to 424 pixels. Initial inbox/compliance samples were still loading
and are not counted as loaded-state passes. A real-component synthetic fixture
also reproduced a drafts dropdown extending to 453 pixels.

Local repairs constrain implicit grid minimum widths, wrap long task identifiers
and mode controls, and right-align/bound the small-screen drafts dropdown. No
mail loading, mail state, send path or task mutation logic changed.
Actual component checks after repair: task list 320/320 pixels; Radio Room
320/320 with organizer open and separately with drafts dropdown open; both
desktop fixtures 1440/1440. Synthetic fixtures prohibit outgoing fetches and
use no customer data. Five source assertions supplement those browser checks.

The final baseline after these changes passes all 29 groups, including lint,
build and Docker concurrency suites, at 14:31:37–14:32:54 UTC:
`tmp/quality-baseline/2026-10-02T14-31-37-054Z/report.json`.
An earlier sandbox-only run had three Docker permission blocks, not three
application failures. The authorized rerun resolves all three. These layout
repairs were not deployed at that checkpoint. The later 4ce6934 staff release
delivered them and passed the bounded authenticated checks recorded above.
The private fixture's broad Vite dependency scan reported missing mock exports
for unrelated application entry points; the requested two real-component
fixtures rendered and were measured successfully, and the normal production
build passed independently. The fixture is not a replacement for running the
complete application. Its temporary server was stopped after verification.

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
`restore-proof-s2sWsN/report.json`. Directories are private and files mode 600;
no database contents, customer files, or credentials enter Git.

### Isolated Auth REST and Storage runtime

At 14:11:06–14:11:26 UTC, the same restored database passes nine bounded
service checks via `--check-services --check-company-rejection`.
`scripts/check-restored-services.mjs` starts already installed official
Auth 2.196.0, PostgREST 16.2, Storage 1.72.1 and Mailpit 1.30.2 images in the
network-none container's shared loopback namespace. No Mac ports are published,
no production signing key is reused and SMTP terminates in local Mailpit.

An existing approved QA owner's OTP creates a real local Auth session; it reads
the restored company-request RPC. Anonymous RPC access is denied. The actual
shared staff-auth helper denies that valid nonstaff session with 403; this is
not a valid-user test of every staff endpoint. Tampered signatures and expired
JWTs receive Auth 403 and REST 401.

All 20 restored files are downloaded through Storage API and match their exact
byte counts and SHA-256. Missing-bearer and valid-anon-role requests produce
40 denial responses (HTTP 400, not 500). After restarting Auth, REST and Storage,
the same session still works, all 20 file hashes match and the same 40 denials
hold. Root and all five sidecar containers are removed; the private backup stays.
Evidence: `restore-proof-s2sWsN/services-report.json` and `report.json`.

The first Storage trial failed with 500 because Docker Desktop host bind mounts
did not provide the Linux extended attributes the official file backend needs.
A disposable copy inside the Linux container fixed this fixture issue; original
private bytes remain intact. That failed trial is retained, not called PASS.

`PARTIAL` whole-service recovery: managed Vault decryption, real screening
dispatch, Google OAuth, external SMTP, Edge Functions, n8n/Vercel configuration,
hosted failover and measured production RTO/RPO remain unverified. A new local
root key cannot decrypt the managed Vault ciphertext. The successful bounded
Auth/REST/Storage drill does not remove those limits.

### Password dependency review and credential handoff

Read all 18 relevant active OfferPSP/iGaming workflow graphs (SEO agent excluded):
no Postgres nodes, direct database URLs or database-password environment markers
were found. Staff/public Vercel production environment-name inventories contain
API keys/URLs, but no database-password or direct-connection variables. The
application source uses Supabase HTTP clients; the only matching local script
is the synthetic load/restore fixture. Current pg_stat_activity shows only
managed services and no external password-authenticated postgres client.

This does not prove that an infrequent external client never exists. Boris
subsequently reset the database password himself and completed private credential
capture. The agent did not rotate credentials or create a new API key.

The existing current-project service_role key is readable through the authorized
Supabase dashboard. It was selected without logging its value, creating a key or
changing permissions. Passing it through hidden local Terminal input was blocked
because computer-use access to Terminal.app is disallowed. No broader secret
export or workaround was attempted; the unused in-memory value was cleared.

Prepared `scripts/capture-recovery-credentials.mjs` for Boris to run manually:
hidden TTY input accepts only the database password and existing Storage API key,
validates the legacy key's project/role, and creates a mode-600 JSON in an ignored
mode-700 local directory. It refuses overwrite and makes no network call.
Syntax checked. Synthetic hidden-input tests reject wrong-project/public keys,
retain no-overwrite and private permissions, and cover cancellation/UTF-8 editing.
The unnecessary minimum-length restriction was removed: this helper captures an
existing password rather than imposing a new password policy. Boris manually
completed the real capture at 11:54:05 UTC; the earlier absent-file/dialog blocker
is resolved. The helper and credential file remain ignored and private.

## Additional HTTP access and cache verification

At 14:20 Asia/Nicosia, 28 bounded anonymous/invalid-bearer requests to 14 protected
staff endpoints returned JSON 401/403 denials. Empty bodies, no real identifiers,
no valid session or communication content were used; no sends were invoked.
This does not cover every session, scope, authorization or penetration-test case.

At 14:31:41–14:31:43 UTC, four bounded requests to `/.git/HEAD`, `/.git/config`,
`/.env` and `/package.json` returned the same 1,443-byte HTML SPA fallback as the
root, not source-control, environment or package contents. HTTP TRACE on
`/api/integration-health` returned 405. This covers those paths on the staff
origin only, not every deployment file or every origin.

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
At that restored-database checkpoint, read-only production checks found only the
original approved request and archived QA company. A separate fresh live browser
case was subsequently created and completed, as recorded below; the original
approved history was not rewritten.

The first functional trial confirmed a missing recovery dependency: inserting a
new lead calls the screening dispatch trigger, which reads Vault and fails with
`no server secret key defined` on this local restore. This is a recovery-runtime
configuration limitation, not evidence of a production intake failure. Only the
local rolled-back rejection fixture neutralizes screening dispatch and its secret
reference; no authorization trigger is disabled. Vault recovery and real screening
dispatch remain explicitly unverified. A second fixture trial also found an SQL
variable-name ambiguity, corrected before the passing run.

## Fresh live owner rejection and QA cleanup

The separately authorized two-email browser test created only
`OfferPSP Rejection E2E 20261002 — NO ACTION REQUIRED`, with reserved `.invalid`
website and synthetic brief. Lead `c0f12f6d-c803-4f7c-aa9c-0f00eb556ef1`,
organization `df6ffb20-a7dc-4d94-9bcd-64d27d9400d8` and join request
`71c3e92c-39f7-430c-a6c3-c6cab1eef5fb` identify this case.

Hello claimed the new company with a real mail link; bizdev repeated the same
company submission and logged in as the proposed employee. The live portal showed
pending-owner status and no access. A newer owner login invalidated the earlier
link; the expired-link guidance remained closed and readable.

With a fresh owner session, keyboard submission of `Отказать` rejected the
request at 13:38:15.476769 UTC. A fresh applicant login displayed
`В добавлении отказано. Свяжитесь с владельцем или командой OfferPSP.` with no
active offers. Read-only database checks confirm exactly one rejection journal
event, the actual owner as deciding actor, and no applicant membership.

The native staff interface then closed and archived only this fresh QA card,
preserving history and excluding it from working queues. Its related tasks are
done/cancelled rather than open. The earlier approved company
`b4b715fd-9f2f-4d88-93dd-3015b823d376` and request
`cdc1c7ff-981e-4ed3-83a2-7237fad494e7` remain approved and archived, unchanged.
Private screenshots record both applicant denial and final QA archive. The stale
hidden-dialog tab was removed without accepting an invisible write; the real
native page was used for the status/archive actions. No user action remains
pending in a confirmation dialog.

## Still open

1. Individual ASVS applicability and missing evidence: the 253-row ledger is
   created, but 183 controls remain NOT_TESTED, 55 have bounded PARTIAL evidence
   and one implementation gap requires remediation. Remaining live valid-role API,
   removed-member, parser/SSRF, token, OAuth and WebSocket scenarios must be tested
   in scope rather than inferred from anonymous probes.
2. Actual screen-reader journey and remaining accessibility/error/contrast states.
   The 320-pixel task/mail repairs are delivered; full all-state accessibility
   still cannot be inferred from those bounded checks.
3. Whole-service recovery configuration: Vault decryption, real dispatch and
   external integrations/hosted failover/RTO/RPO. Auth/REST/Storage serving and
   restart checks now pass in the bounded network-isolated drill.
4. Managed PostgreSQL supported-target confirmation and an agreed production
   window. The isolated 17.11 rehearsal below passes; it is not a hosted upgrade.

## Final bounded verification block — 2 October evening UTC

Fresh authorized backup exported at 19:03:49 UTC into private
`current-20261002-Q1HHtd`: logical dump 11,118,605 bytes, all 20 Storage objects
6,357,644 bytes with stable inventories and hashes. The earlier verified pack
is retained. DB and Storage are not one atomic snapshot.

The official Supabase PostgreSQL 17.11.0.002 rehearsal passes at
19:04:41–19:05:01 UTC: engine version asserted, restore with exit-on-error and
one transaction, 159 table definitions, 62 policies, 265 public functions,
seven extension versions, 156 COPY tables / 12,204 rows and all 20 files match.
Nine rolled-back join-rejection cases and nine bounded Auth/REST/Storage checks
also pass, including service restart. No networking, published ports, real SMTP
or production signing key; all temporary containers removed. Details and limits
are in the updated upgrade plan and private `restore-proof-1JB3BZ/report.json`.

Private retrospective antivirus check passes at 19:12:16–19:12:46 UTC. Official
ClamAV 1.4.6 / database 28141 uses updated signatures dated 2 October 06:26 UTC.
The harmless EICAR positive control is detected and all 20 archived files are
scanned with no detections. Document bytes enter only a network-none scanner;
the network-enabled signature updater mounts only signatures, not documents or
credentials. Limits/encrypted-file alerts fail closed. Evidence:
`antivirus-proof-TPIWoF/report.json`. Initial capability/log-path fixture failures
were corrected and retained as failures. This is NOT a production upload gate,
continuous scanning or proof that every file is safe. V5.4.3 remains GAP until
a private server-side quarantine/scanner path exists.

Actual 13 staff API entrypoints pass 65 synthetic-auth scenarios: valid nonstaff
(including spoofed user-editable owner metadata), revoked session, unavailable
Auth, unavailable staff RPC and malformed staff result. Denials fail closed with
no-store, error JSON and no downstream operations. No network fallback, real
credentials, recipients or entity writes are allowed. These mocked-Auth handler
regressions complement the actual local Auth/JWT drill; they are not live
penetration testing of every role/API/OAuth scope.

Actual live Brave search keyboard check passes: Meta-K opens the named dialog,
Tab/Shift-Tab remain contained, Escape closes and returns focus to the launcher.
Mail still contains 23 active chains. Another native VoiceOver attempt did not
capture an actual spoken/captioned journey; switch was restored OFF. No new
screen-reader conformance claim is made.

Confirmed small contrast defects: favorite stars were 2.29:1 on paper / 1.98:1
on the active background; small flagged-count text was 3.40:1. Targeted staff
styling darkens only favorite icons and that count, preserving the paper palette
and all mail logic. The new source/color regression fails before and passes
after; production delivery will be recorded separately. Excluded module code,
public portal, real partner correspondence and business data are unchanged.

Final baseline after the contrast fix: 31 groups PASS / 0 FAIL / 0 BLOCKED,
19:25:48–19:26:59 UTC; receipt
`tmp/quality-baseline/2026-10-02T19-25-48-285Z/report.json`. The initial sandbox
run had three Docker permission blocks, not application failures; the rerun
with authorized local container access passes all three. This is a source
checkpoint, not yet a production receipt for the new contrast classes.

Before new organizer features, prioritize script/resource CSP, private file
quarantine/scanning and the remaining high-risk authorization/parser checks.
No paid scanning provider or external customer-file disclosure is authorized by
this report. User-owned browser content is retained and VoiceOver remains OFF.

Sources: [ASVS 5.0.0](https://github.com/OWASP/ASVS/releases/tag/v5.0.0),
[WCAG 2.2](https://www.w3.org/TR/WCAG22/),
[Supabase backups](https://supabase.com/docs/guides/platform/backups),
[logical backup export](https://supabase.com/docs/guides/troubleshooting/download-logical-backups),
[self-hosted restore](https://supabase.com/docs/guides/self-hosting/restore-from-platform),
[Postgres security upgrade](https://supabase.com/changelog/postgres-15-19-17-11-breaking-changes).
