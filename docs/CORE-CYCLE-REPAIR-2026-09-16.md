# Core operating cycle repair — 2026-09-16

## Scope and current status

PARTIAL: local first-stage repair, not a production completion claim.
Borys prioritized the working company/merchant cycle and internal operator bot.
Automatic Telegram groups, Zoom and subagent commissions are deferred.
Antarex replacement remains behind the exact bulk preview/confirmation gate.

## Verified root causes

- Live `claim_offerpsp_pre_compliance_jobs` requires manual request or post-selection status.
  New intake alone does not start screening.
- Published workflow `wiEFFDaHd3uaJoJi` checks the queue every 15 minutes. It checks website HTTP,
  RDAP registration age and email-domain consistency. It does not query regulator, sanctions or
  adverse-media sources. Fixed confidence and calculated authenticity/commercial scores are not
  evidence of company verification.
- Merchant UI promised five minutes and checks beyond the worker's actual capabilities; it had
  no dedicated pending-job polling. Compliance list colored unknown risk green.
- `save_offerpsp_research_entity` saves fields and an entity audit-history event, not a company
  research job. Live `psp_providers` and `casino_leads` have no non-internal database triggers.
  Research-registry intake therefore needs its own explicit connection to an evidence job.

## Implemented locally

- `company-screening.mjs`: deterministic evidence preparation, eight explicit check categories,
  missing-data checklist, source links, website title/description and licence-claim excerpt.
  Script/style content is excluded. Failed requests remain unknown, not a fraud/high-risk decision.
  Unsupported authenticity, commercial value and confidence scores are null. Licence claims and
  legal identity remain unverified; no automated clearance or outbound communications.
- `company-screening-n8n.mjs`: emits the exact tested code for the existing n8n node, with batch
  alignment validation and item pairing. No credentials or workflow export are written to Git.
- Migration created using Supabase CLI 2.117.0: new active non-terminal leads become eligible for
  background claims; module switch, batch limits, stale recovery and SKIP LOCKED retained;
  structured currencies/flows/licence fields included; privilege checks fail closed.
- Merchant UI: pending/running polling every 15 seconds, cleanup on navigation, hidden-tab pause,
  no overlapping requests, recoverable refresh error; truthful 15-minute queue message.
- Unknown risk uses a neutral color. Existing staff decisions and merchant data are not modified.

## Verification

- 47 behavioral tests pass, including 17 against isolated PostgreSQL/PGlite 0.5.8.
- New lead claim, repeat claim, stale job, active job, archived/spam/terminal records, staff-reviewed
  cases, module disabled, batch limit and anonymous/authenticated function privileges tested.
- Current module tests include failed website, challenge page, invalid/future RDAP dates,
  unverified licence claims, missing fields, free mailbox, immutable input and two-item n8n batch.
- Lint, TypeScript/Vite build and existing control-integrity regression test pass.
- Read-only live website probe: `https://protocol-s.com/` returned HTTP 200 and title
  `Layer One (L1) — Payment Ecosystem`. No complete merchant data was sent, no DB records changed.
  This demonstrates fetched evidence, not identity verification or a completed production audit.
- UI visual verification and deployed n8n/API E2E are NOT complete. Three real PostgreSQL 15
  concurrency scenarios pass in an isolated container (third pass below).
- npm reported five high-severity production dependency entries (eight with dev dependencies);
  do not interpret the passing build as a clean dependency-security audit. No `audit fix` ran.
  Existing react-router 8.3.0 also requests Node >=22.22.0 while this local runtime is 22.17.0.

## Safe collection and fenced completion — second local pass

Still PARTIAL / NOT RELEASED. No production migrations, workflow changes or sends in this pass.

- `safe-evidence-fetch.mjs`: public-unicast address policy, rejects mixed public/private DNS
  answers, pins the verified address at socket lookup while retaining TLS hostname validation.
  Revalidates every redirect, rejects HTTPS downgrade and nonstandard ports. No cookies/auth
  headers, URL credentials or query tokens. Total 15-second deadline including DNS, at most three
  redirects, 512 KiB body / 16 KiB headers. Only document/RDAP content types; compressed responses
  deliberately remain unavailable rather than introducing unbounded decompression.
- Fetch errors are fixed codes, not raw exception messages. Failed collection remains unknown,
  never a fraud/clearance verdict. No raw HTML is persisted.
- Read-only smoke using the actual new fetcher (not curl): protocol-s.com returned HTTP 200,
  83,404 bytes, title `Layer One (L1) — Payment Ecosystem`.
- Extended the unapplied queue migration: per-attempt UUID, 30-minute lease, input snapshot
  hash, maximum three crashed attempts. Exhaustion becomes manual review with one failure activity.
- New `complete_offerpsp_pre_compliance_run` locks and validates the active run, current lead
  snapshot and decision state. Late/expired/cross-run completions cannot overwrite current data.
  Evidence, activity and completion receipt are one transaction; duplicate completion returns a
  receipt without another activity. A different payload for a completed run is rejected.
- Staff queue requests reuse pending/running work instead of resetting it. Holds/clearances and
  rejected/spam cases require explicit reopening, not a casual retry click.
- Old unfenced `record_offerpsp_pre_compliance_screening` EXECUTE is revoked from service_role
  in the candidate migration; only the fenced owner-executed wrapper uses its existing persistence.
  Its search_path is hardened too. **The old worker will fail if this migration is applied alone.**
- `company-screening-runner.mjs`: collects website/RDAP and produces eight checks from a claimed
  job, then requires an acknowledged fenced completion. Rejects missing/expired run IDs. A mailbox
  domain is never substituted for a company website. No shortlist or external communications.
- Isolated integrated test covers claim → safe-fetch policy (mock network) → evidence → actual
  existing SQL persistence → manual review. Adversarial tests cover mixed DNS, rebinding, redirects,
  timeout, response bounds, replay, staff decisions, edits mid-run and transactional rollback.

### Integration boundary after the second pass

At that point the collector/runner was not exposed through an authenticated endpoint. The active
n8n HTTP nodes still use the old fetch path. The legacy `company-screening-n8n.mjs` emitter is NOT
a deployable replacement and must not be published alone.

Next: add a narrow authenticated worker handler inside the existing consolidated API, load the
claimed job from the database (do not trust a caller-supplied lead snapshot), return existing
completion receipts before re-fetching on request replay, and wire an inactive test workflow to
the new fenced RPC. Then test real simultaneous PostgreSQL workers and visual staff UI. Pause/drain
the old worker for a coordinated migration/API/workflow cutover, with a tested rollback artifact.
Do not expose a general-purpose public fetch endpoint or add more production function bundles.

## Authenticated worker integration — third local pass

PARTIAL for production; implementation and isolated verification complete for this slice.

- `company-screening-worker.mjs` is routed by the existing `platform-modules` function as
  `module=company-screening-worker`. No new Vercel function. Disabled by default unless both
  `OFFERPSP_SCREENING_WORKER_ENABLED=true` and a dedicated server token (minimum 32 characters)
  are configured. Token comparison is constant-time; missing/wrong credentials fail before DB use.
- The worker credential is NOT the Supabase service key and NOT a staff OAuth bypass. It permits
  only a one-job claim or processing an already-claimed lead/run ID pair. It has no email, Telegram,
  matching, clearance, arbitrary URL or general RPC capability. Do not reuse other gateway tokens.
- Requests cannot supply dossier data or increase the batch size. `begin_offerpsp_pre_compliance_run`
  loads a fresh DB snapshot under row locks, fences changed/expired/decided cases, and atomically
  grants collection to one dispatcher. Replays return in-progress or completed receipts without
  re-fetching. Responses contain IDs/outcome only, not HTML or private dossier fields.
- Interrupted dispatch retains its lease; recovery uses the existing 30-minute expiry and bounded
  three-attempt policy. A 502 means unconfirmed result, never completed work. Completed receipts
  survive lost HTTP responses and skip the collection step on replay.
- `screening-workflow.mjs` builds an inactive manual-validation graph requiring an explicit
  credential reference. It was schema-validated using an **offline fixture reference**, not a real
  installed credential. No new n8n workflow was created/published. Five nodes, zero validation
  errors, three advisory warnings: intentional Code-node throws and no blind claim retry.
  Do not adopt continue-on-error here; a claim retry could consume another job after a lost response.
- Handler tests exercise auth/schema rejection, guarded real consolidated routing, minimal
  responses, identity checks and replay. Integrated handler + PGlite + original persistence test
  confirms one dispatch, busy receipt, completed receipt and subsequent replay without re-fetch.
- `test:screening-concurrency` passed three scenarios against real PostgreSQL 15 using an existing
  local image, no host ports/mounts, network disabled, and tmpfs data. Simultaneous claims select
  different rows without waiting; simultaneous dispatch starts one collector; simultaneous
  completion writes one activity and eight checks. Container automatically stopped/removed.
  First attempt detected a test-harness readiness race with the image's temporary initdb server;
  TCP readiness fixed it, and the repeat passed. This is not a PostgreSQL 17/full-production-schema test.
- Rollback `supabase/rollback/20260916_screening_worker_v2.sql` contains freshly read production
  definitions and grants for the three existing RPCs. It refuses unresolved v2 runs, restores the
  old APIs/grants and disables the new ones without deleting evidence/receipt columns. The guard,
  restored old claim behavior and retained evidence were tested locally.
- 47 automated tests, lint, build, control-integrity and platform-module regression tests pass.
  Existing dependency audit findings from the first pass remain open.
- Fresh live read: original n8n active version remains `06ba8709-bb04-4352-8fc4-f5ee3221d370`.
  Operator health verifies staff authentication/gateway connectivity, not delivery or this new cycle.

### Real HTTP and n8n execution — 2026-09-16

- `npm run test:screening-http` starts a loopback HTTP adapter for the actual protected handler,
  an ephemeral PostgreSQL 15 container with the shared relevant-schema fixture and candidate SQL,
  and collects actual public evidence from `https://protocol-s.com/` for a synthetic applicant.
  The evidence is not treated as the synthetic applicant's verified identity.
- Unauthorized requests and caller-supplied extra fields return 401/400 without claiming work.
  Claim → begin → website/RDAP collection → complete persists eight checks and one activity.
  Website HTTP 200/content availability is asserted from stored evidence. RDAP success is not
  required or claimed. Replay returns `already_completed` without another collection/activity.
- `npm run test:screening-n8n` additionally imports the generated inactive graph and an ephemeral
  encrypted Header Auth credential into an isolated n8n 1.117.2 container, then executes the graph
  via its CLI. A second synthetic lead completes via actual n8n HTTP calls; DB totals are exactly
  16 checks and two screening activities. No production credential or merchant data is used.
- Execution caught a compatibility gap that schema validation missed: local n8n 1.117.2 supports
  HTTP Request through 4.3, not 4.5. The builder now pins 4.3, which supports all required options;
  the same graph then executed successfully. No live workflow was edited.
- Initial test assertion incorrectly queried checks by lead_id; corrected to join through case_id.
  This was a harness error, not a failed production write. All test containers and their ephemeral
  databases/credentials were removed in finally blocks.
- Limits: test-only HTTP transport instead of deployed HTTPS; a psql RPC adapter instead of
  PostgREST; fixture schema rather than a full production clone; manual CLI execution instead of
  production scheduling. Vercel/PostgREST auth, deployed UI, scheduler and Telegram callbacks still
  need their own release verification. This is not a claim that the whole autopilot is live.

### Coordinated release still required

#### Release preflight — 2026-09-16

- Fresh read-only production checks: staff OAuth and n8n/email/Telegram gateways responded;
  message delivery was not exercised. Published screening workflow remains
  `06ba8709-bb04-4352-8fc4-f5ee3221d370`, active, unchanged.
- Vercel production alias points to READY deployment `dpl_6xQyt4s5DQFFDw5cDywwSHNQKZvP`,
  URL `ops-7q4m2x9k8v3n-umjvl6yjg-annoris.vercel.app`, using Node 24.x. No deployment created.
- Live DB still exposes only the three old screening RPCs. The rollback file contains their
  current exact definitions (SQL terminator normalization only) and matching grants. Definition
  fingerprints: claim `aaf59dbc1444b3c3fcd02e313f463612`, queue
  `68c54a79aa3d99bb7e84fd94fe50f839`, record `6f8396b0209b8fe9db120f9d8f8b44e0`.
  Recheck immediately before any cutover; these are not permanent guarantees.
- Local Vercel production build passes on Node 24.19.0. The new worker is included in the
  existing platform-modules bundle; PGlite and test scripts are not in the server output.
  Function budget after parser updates: 11 functions, 103.7 MiB total (limit 120 MiB), largest
  68.2 MiB (limit 80 MiB). This is local bundle size, not account-wide deployment storage usage.
- Initial npm audit found five high production dependency warnings and three dev warnings.
  Scoped local updates: mailparser 3.9.15 → 3.9.28 (with its required parser dependencies),
  xmldom 0.8.13 → 0.8.15, js-yaml 4.3.1 → 4.3.2, postcss within 8.5 and the existing nanoid
  override 3.3.17 → 3.3.18. No force/audit-fix used. Final install audit reports 0 known
  vulnerabilities across 582 packages. This does not imply the whole application is vulnerability-free.
- Mailbox, document router, private source extraction, PDF, offer parser, control integrity,
  platform modules, 47 screening tests and lint pass on Node 24. PDF smoke retains its existing
  standardFontDataUrl warning but extracts the expected fixture text.
- Still not released: no migration applied, no token provisioned, no n8n graph published.
  Production scheduler/capacity and error-workflow binding, deployed PostgREST/HTTPS tests and
  authenticated UI smoke remain explicit cutover gates. Preserve unrelated dirty files.

1. Review the scoped diff, verify production schema/function snapshots have not drifted, commit the
   exact release in a clean checkout. Do not include unrelated signature/user work accidentally.
2. Build the Vercel server functions and pass function-storage budget before any deployment. One
   protected preview at most; do not point a test graph at production writes to prove connectivity.
3. Provision a dedicated encrypted n8n Header Auth credential and matching server-only Vercel env.
   Keep the flag false while wiring. The builder's offline validation reference must never ship.
4. Create the inactive manual test graph and bind it to a properly isolated target. Deployed E2E
   and UI smoke are still pending; local tests are not substitutes for those checks.
5. For production cutover, pause/drain the old worker, apply the candidate migration, publish the
   exact API release, switch the worker and enable its flag, then verify a controlled synthetic run.
   Select production scheduling/batch capacity explicitly; the template has no schedule and cannot
   yet replace the active 15-minute worker unattended. Connect the existing error-handling path.
6. If rollback is needed, stop/disable both new entry points, resolve in-flight runs, apply the
   tested rollback SQL, then restore/verify the captured old graph. Do not run old and new workers
   together across the privilege cutover. Never bulk-change real merchants or Antarex as a test.

## n8n staging incident and recovery

Attempting to save only the tested evidence node with `n8n_update_partial_workflow` immediately
changed the active version to `80262ec5-6e8d-4137-8185-221596f1b75e`; no explicit activation
operation was sent. The tool's draft assumption is unsafe for this active workflow.

Restored the original code immediately. Fresh active read confirms every node and connection
matches the original published graph exactly; new rollback version:
`06ba8709-bb04-4352-8fc4-f5ee3221d370`. The latest retained execution `545574` claimed zero jobs.
The new code is local only, not left in a server draft or active graph.

## Release gates and next implementation

1. Harden arbitrary website fetching (public-address validation, DNS/redirect handling, response
   size and timeout bounds) before expanding unattended intake. Do not apply the queue migration
   alone while the old fetch path remains unchanged.
2. Add durable run identity/fencing and idempotent completion before bot-driven replay/retry;
   preserve staff decisions and expose genuine processing failures rather than a green success.
3. Link research-registry companies separately from merchant briefs; share evidence collection,
   but do not demand merchant PayIn/volume fields from a PSP research card.
4. Bind one operator task and SLA to each intake, plus safe Telegram actions; fix staff callback
   authorization and legacy send replay before giving the bot more write capability.
5. Keep jobs and results in dedicated OfferPSP, not the old shared BIX task store. Reconcile mailbox
   account/folders with contact history so follow-ups use fresh replies.
6. Controlled synthetic E2E: intake → evidence → gaps → internal matching → one task → operator
   card → safe repeated callback → persisted result. No real merchant sends or provider disclosure.
7. One clean, reviewed release. Supabase migration, n8n publication and Vercel rollout must be
   explicitly tracked; never use an active workflow update as draft staging again.

## Production cutover completed — 2026-09-16, 16:48 UTC

This section supersedes earlier local-only statements; it does not mark the full autopilot done.

- Application commit: `08e5b18f240d9da19d0bf534805b48ecb72c8f5a`. Production deployment:
  `dpl_GYiAfo5DB9piRxRDECmH48RuFgDh`, URL
  `https://ops-7q4m2x9k8v3n-cq5qlo471-annoris.vercel.app`, promoted to
  `https://ops-7q4m2x9k8v3n.vercel.app`.
- Migration applied through Supabase MCP to dedicated OfferPSP: ledger version `20260916164115`,
  name `offerpsp_intake_screening_queue`, content from local `20260916141150` candidate. Keep the
  source/ledger mapping explicit; a future CLI migration push must reconcile it, not apply twice.
- Paused the old worker after its last run finished and DB showed zero running cases. Preserved
  its graph for rollback. New active worker `MzGIqCRwEUEp2K8C`, published version
  `023c667a-eb06-4172-831e-fb6a2e102535`, disabled manual trigger, one-minute schedule,
  one job per request, 120-second execution timeout. Existing error handler is bound; live failure
  delivery was not deliberately triggered. Credential `8RpsZmF0Ud6EE3iK` contains a dedicated
  header token restricted to the staff domain. No secret is recorded here.
- On deployed HTTPS: GET 405, missing authorization 401, unsupported action 400. Valid worker
  token with an unknown run returns `stale_or_cancelled`; claim excludes archived pending intake.
  New RPCs deny anon/authenticated; service role alone can run them. Old unfenced record RPC is
  revoked for every external role.
- Real production scheduled E2E (not an isolated database): execution `546622`, lead
  `aef2b8a5-b0c8-4688-a5f8-126ec0f25e50`, run `2d495307-914f-49ae-96a5-8fbb2cd23a51`.
  The explicitly synthetic record used an `.invalid` mailbox, no ad consent/click identifiers,
  no intake webhook or recipient. It fetched the public OfferPSP website (200) and RDAP (466 days),
  persisted eight checks and one activity, and returned `completed` / manual review. Replayed
  through the production endpoint: `already_completed`, still eight checks/one activity/one attempt.
  Closed and archived the canary after visual verification; retained evidence, sent no messages.
- Authenticated Brave UI: compliance queue → synthetic dossier shows actual source links, missing
  fields, unknown risk, null authenticity/commercial value, and human decision controls. The
  compliance view is reached from the dedicated queue; it is not a visible merchant tab.
- Subsequent scheduled runs `546630`, `546642` succeeded without claiming another job.
  OfferPSP Operator health at 16:48 UTC confirmed staff OAuth, gateways, GoRules and search.
  Email/Telegram gateway availability is not proof of delivery.

### Packaging failure caught before promotion

The first protected candidate `dpl_5u68cBDtexmEWTfMLZok9wfYtJtv` passed macOS build/tests but
failed Linux cold start: missing `@gorules/zen-engine-linux-arm64-gnu`. Isolated Linux artifact
testing also reproduced missing canvas binding. The production alias remained on its old release.

Rebuilt with official Node 24 Debian Linux image (digest
`sha256:2fe369e969550cde8e867afc3fe370b260140cab4a23d467074295b42163d553`). The initial Linux
output included both glibc and musl natives, exceeding the budget at 142.9 MiB. Added specific
`excludeFiles` rules for unused musl packages; no budget increase, no application dependency
removal. Final 11 functions: 106.2 MiB total, platform-modules 69.6 MiB, document-processing
35.5 MiB. All isolated Linux function imports, GoRules tests and PDF extraction passed.

The failed candidate was deleted after successful promotion. The previous working release remains
available. No third deployment was made. The new bundle-startup guard must accompany future
prebuilt releases. Local unit/queue/handler suite: 48 passed; lint passed.

### Remaining limitations

This is evidence preparation for new merchant intake, not verified KYB/licensing/sanctions checks.
Generic licence-related wording on a site can still appear as an explicitly unverified quotation;
improve relevance before presenting it as a substantive licence claim. Historical staff-reviewed
cases were deliberately not overwritten or re-scored. Research-registry jobs, operator task/SLA,
Telegram callback authorization/replay and mailbox freshness remain separate unfinished work.
