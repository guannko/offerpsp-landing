# Release review packet — research company screening autopilot

Prepared: 2026-09-16. Cold review updated: 2026-09-17. Owner: Borys Kononenko.

## Production release result

The original implementation received a separate XHigh cold review for security, lifecycle
correctness and release ordering; the findings and fixes are recorded below.

Status: **VERIFIED RELEASE / PARTIAL EVIDENCE COVERAGE** — migrations, Vercel code, official-source
flags and the active n8n worker are released. Controlled production jobs completed once and the
synthetic source rows were archived. The audit remains preliminary because national registries,
broader sanctions/PEP and adverse-media sources are not yet connected.

## Scope and boundaries

This stage adds preliminary public-evidence screening for newly-created research casinos and
PSPs. It does not:

- backfill or mass-screen the existing registry;
- create or convert a research row into a merchant lead;
- create a merchant account, publish a shortlist or change a sales status;
- send email, Telegram messages or other customer communications;
- provide complete global identity, licence, sanctions/PEP, adverse-media, KYB or provider
  acceptance coverage; supported official sources are reported individually and never generalized;
- overwrite operator-entered facts or a previous completed result when a rerun fails.

The active identity is always `(entity_type, bigint entity_id)`. The UUID merchant `lead_id`
pipeline remains separate.

The no-send boundary above describes this research-screening release only. It is not the target
policy for merchant intake. The approved intake target is controlled automatic outbound: a new
application wakes the processor immediately, current facts are validated, and an allowlisted
low-risk acknowledgement or missing-information request is sent without waiting for manual review
when every gate passes. The 12-hour trigger is recovery only, never routine response latency.

Automatic outbound must use a durable outbox and fail-closed preflight: exact recipient binding,
latest source revision, evidence-backed dynamic claims, confidentiality/redaction, contact cooldown,
duplicate/idempotency protection and an independent content/fact validation. The same checks apply
to AI-generated and staff-authored messages. Unknown or conflicting evidence, ambiguous prior
delivery and high-risk commercial/provider/legal content route to staff review with a visible reason.

## Exact local change set

New files:

- `supabase/migrations/20260916203638_offerpsp_research_screening_jobs.sql`
- `supabase/migrations/20260916203639_offerpsp_research_screening_events.sql`
- `platform-v2/scripts/test-research-screening.mjs`
- `platform-v2/scripts/test-research-screening-postgres.mjs`

Modified files:

- `platform-v2/api/_lib/company-screening-runner.mjs`
- `platform-v2/api/_lib/company-screening-worker.mjs`
- `platform-v2/scripts/screening-workflow.mjs`
- `platform-v2/scripts/screening-test-fixture.mjs`
- `platform-v2/scripts/test-screening-worker.mjs`
- `platform-v2/scripts/test-screening-http.mjs`
- `platform-v2/src/components/control/ResearchEntityEditor.tsx`
- `platform-v2/package.json`

Pre-existing dirty `TASKS.md`, the earlier handoff documents and `docs/email-signature/` were
not modified as part of this implementation and must not be swept into a release commit.

## Ownership and lifecycle

1. An eligible insert into `public.casino_leads` or `public.psp_providers` creates one private
   `pending` job. The migration contains no backfill statement.
2. A partial unique index permits only one `pending` or `running` job for an entity.
3. The event trigger sends only `{"event":"research_screening_ready"}` over the existing signed
   wake-up channel. It sends no company, job or entity data. A 12-hour worker trigger remains the
   recovery path.
4. The worker claims with `FOR UPDATE SKIP LOCKED`, receives only `job_id` and `run_id`, and then
   obtains the server-side input through a fenced RPC.
5. A 30-minute lease, run UUID, input hash and maximum of three attempts protect processing. An
   expired owner cannot mutate the job; the next claim reuses the job with a new run UUID.
6. Completion rechecks entity existence, eligibility, material input hash, lease, run UUID and
   module state before persisting evidence.
7. A material change or terminal/archive state causes `skipped`; ordinary contact edits do not
   enqueue or invalidate a run.
8. A staff rerun locks the entity row, so concurrent clicks produce one job and one audit entry.
   A previous `completed` result remains available while the new run is pending, fails or is skipped.

States: `pending`, `running`, `completed`, `failed`, `skipped`.

## Authorization model

| Surface | Allowed | Notes |
|---|---|---|
| Private job and dispatch tables | Database owner only | `public`, `anon`, `authenticated`, and `service_role` have no direct table privileges. |
| Private input/hash/trigger helpers | Database owner only | All client and service roles are revoked. Security-definer RPCs invoke them. |
| Claim/begin/complete/fail RPCs | `service_role` | Each RPC also requires the service JWT role claim and uses `SECURITY DEFINER` with an empty search path. |
| Queue rerun RPC | authenticated OfferPSP staff | Explicit `is_offerpsp_staff()` check; service and anonymous execution revoked. |
| Read projection RPC | authenticated OfferPSP staff | Staff check; hashes, result hash, run ID, lease and processing internals are removed. |

The worker accepts only exact `claim_research` or `process_research` actions. A process request
contains only UUID identifiers. URL, dossier, batch limit and arbitrary action injection are
rejected. Collector failures are stored as bounded generic error codes.

## Evidence boundary

The implementation reuses the existing safe collector and preserves its SSRF protections:
public-IP-only resolution, redirect revalidation, TLS hostname validation, bounded response size,
bounded redirects and total timeout. It does not substitute an email-provider domain for a
company website. Licence text from the registry is marked as a claim, never verification.

The staff UI shows lifecycle status, a large timestamp, failure or retry reason, result age,
missing information, individual checks and source links. It states that this is not KYB,
sanctions screening or licence verification. Queueing is never rendered as success.

## XHigh cold-review findings resolved

The cold review found and fixed five material implementation defects before production:

1. **Lease ownership:** begin, completion and failure callbacks from an expired owner previously
   could mark a reclaimable job as skipped or requeue it. They now return a stale receipt without
   mutation; the next claim receives a fresh run UUID.
2. **Concurrent staff rerun:** two first-time rerun clicks could race before an active row existed.
   The RPC now locks the casino/PSP entity row and uses a conflict-safe insert.
3. **Material snapshot coverage:** casino software, affiliate programme and source plus PSP risk
   appetite, notes and capabilities source are now part of the stale-input hash.
4. **Signed wake-up ticket:** base64url translation now removes actual line feeds with `chr(10)`,
   matching the already-corrected intake ticket implementation; literal escaped newlines cannot
   enter the Authorization header.
5. **Receipt isolation:** research-only `retry_queued` and `failed` receipts are no longer accepted
   by the existing merchant-intake branch. Research identifiers must also be positive safe integers.

## Failure matrix

| Case | Expected result |
|---|---|
| Repeated insert delivery or repeated staff click | Existing active job returned; no duplicate job. |
| Concurrent workers | Each job claimed once through `SKIP LOCKED`. |
| Material fields change during collection | Old run becomes `skipped`; stale result is not written. |
| Contact/email/status edit | No new automatic job and no processing loop. |
| Entity archived, rejected or removed | Begin/completion fences the run as `skipped`. |
| Module disabled | No new automatic work; an in-flight run cannot complete. |
| Lease expires | A later worker may reclaim it with a new run UUID; the old run cannot complete. |
| Collector failure | Job returns to `pending` with a safe code until attempt three, then `failed`. |
| Dispatch unavailable | Job remains `pending`; dispatch evidence records `unconfigured` or `enqueue_failed`; 12-hour recovery remains. |
| Invalid, unreachable or private-network URL | Evidence remains unknown/failed safely; it does not become a risk or verification decision. |
| Rerun failure after a good result | Earlier completed evidence remains visible and unchanged. |
| Historical registry rows | No automatic job; staff must request an explicit rerun. |

## Verified local evidence

All commands ran from `platform-v2` unless noted.

- `npm run test:research-screening` — **VERIFIED**: 19/19 Node tests plus isolated PostgreSQL.
  It proved no backfill, casino+PSP insert jobs, service RPC-only access, concurrent distinct claims,
  expired-owner fencing and reclaim, stale-result fencing, concurrent rerun deduplication, one audit
  entry, newline-free signed event payload and staff-only projection.
- `npm run test:company-screening` — **VERIFIED**: 83/83; normal intake, receipt isolation,
  official GLEIF/UN/MGA/CGA/UKGC/Gibraltar/Isle of Man/Kahnawà:ke/Sweden/Ontario evidence and
  safe-fetch regressions pass. Gibraltar remains candidate-only because the public register does
  not bind domains; the current Kahnawà:ke list remains candidate-only because its stated update
  date is September 2023.
- `npm run test:screening-http` — **VERIFIED**: real HTTP → isolated PostgreSQL → public website →
  persisted evidence; research rows did not create merchant leads; replay did not recollect.
- `npm run test:screening-n8n` — **VERIFIED** with disposable n8n `1.117.2`: credential → claim →
  process → verified receipt; both queues drained and an empty queue stopped.
- `node scripts/test-screening-http.mjs --n8n --scheduled` — **VERIFIED**: the same exact generated
  graph runs through the 12-hour recovery trigger.
- `npm run test:intake-autopilot` — **VERIFIED**: 22/22; task creation, Telegram callbacks,
  draft idempotency, missing-data draft and sender/scope protections remain intact.
- `npm run test:control-integrity` — **VERIFIED**.
- `npm run lint` — **VERIFIED**.
- `npm run build` — **VERIFIED**; TypeScript and Vite production build passed.
- `npm run check:function-storage` — **VERIFIED**: 103.7 MiB across 11 functions; budget passed.
- repository `git diff --check` — **VERIFIED**.
- local authenticated UI acceptance — **PARTIAL**: the research card and readable status panel
  rendered correctly against the local app. Production now contains the RPC and real result data;
  a final authenticated visual check remains useful but is not evidence of the worker lifecycle.

No production customer, Telegram message, email, account, matching run or historical research
record was created or changed by these tests.

## Live production state rechecked 2026-09-17

- Supabase production includes research-screening migrations `20260917172639` and
  `20260917172647`; zero historical records were backfilled.
- The active worker `MzGIqCRwEUEp2K8C` is version
  `947f3ca3-caad-4df2-a3c2-11a4dbd825cb` and contains both the existing merchant-intake branch and
  the separate research branch. The published graph was checked directly.
- The active signed ingress `mrTCGINWgtcZXZW0` is version
  `07b35513-a387-4a2c-bf46-c7daef32347c`; it discards request data and asynchronously wakes the
  worker. Its published graph was reused without exposing request data.
- Release commit `c5b3994` is deployed as Vercel production
  `dpl_J5MMU2eY9Tc5jiCJjLENM5UmhQAt` and serves the canonical staff alias. The prebuilt Linux
  artifact passed the 109.8 MiB function-storage budget and all 11 Node 24 bundle-start checks.
- Five post-release regulator controls completed exactly once. Isle of Man GSC, Swedish Gambling
  Authority and iGaming Ontario produced narrow verified legal-name/domain results. Gibraltar
  remained an exact-name candidate because the main register has no domain/number binding;
  Kahnawà:ke remained an exact-name/domain candidate because the official page is dated 2023.
  All five source rows are archived and no control job remains pending or running.

## Executed grouped release record

1. Production migrations were recorded as `20260917172639` and `20260917172647`. Zero historical
   rows were queued; service/staff RPC grants were verified read-only.
2. Vercel deployment `dpl_J5MMU2eY9Tc5jiCJjLENM5UmhQAt` from release commit `c5b3994` is READY
   and serves the production alias.
   Unauthenticated worker access returns HTTP 401.
3. Active n8n worker `MzGIqCRwEUEp2K8C` now runs version
   `947f3ca3-caad-4df2-a3c2-11a4dbd825cb` with 12 nodes. It validates with zero errors; the single
   warning is the intentional bounded drain loop, which stops when a claim returns no items.
4. Two simultaneous generic canaries and two official-registry controls completed exactly once;
   zero jobs failed or remain pending/running. A current CGA certificate verified the exact legal
   name, licence number and domain; a stale certificate produced `not_found` rather than a false
   verification.
5. Every synthetic casino/PSP source row was archived after the test. Evidence receipts remain for
   release diagnosis. No email, Telegram message, merchant account or provider match was created.
6. Five additional regulator controls were archived after verifying Gibraltar, Isle of Man,
   Kahnawà:ke, Sweden and Ontario handling. Each completed once; none created outreach.

## Rollback without destroying evidence

1. Disable research wake-up by dropping/disabling only the research event trigger or turning off
   the shared module if both intake and research must stop. Do not delete pending/completed data.
2. Restore the exported active n8n workflow definition.
3. Roll Vercel back to the preceding deployment.
4. Revoke execution of the new public RPCs if a security issue is suspected.
5. Preserve the private tables and completed evidence for diagnosis. Drop them only after a separate
   export and explicit destructive approval.

The database objects are additive, so UI/worker rollback does not require immediate destructive SQL.

## Grouped-release verification checklist

- Confirm direct service-role table access is intentionally absent and RPC ownership is correct.
- Confirm `current_setting` JWT checks match production PostgREST behavior.
- Confirm terminal-state predicates match actual live enum/text values for casinos and PSPs.
- Confirm sharing the existing event secret and ingress is acceptable.
- Confirm the generated n8n fan-out cannot make one branch suppress or duplicate the other.
- Confirm the release order avoids deploying the UI before its RPC exists and avoids calling new
  worker actions before the Vercel handler exists.
- Confirm the rollback preserves evidence and does not interrupt the already-working intake path.

## Remaining coverage work

- `PARTIAL`: add national company registries beyond GLEIF, broader sanctions/PEP sources and
  adverse-media/court adapters. Their absence must stay visible as `not_checked`, never as clean.
- `PARTIAL`: authenticated visual acceptance of the completed result card remains a separate UI
  check; the production RPC, stored result contract and production build are verified.

## Addendum — outbound mail autopilot review gate (2026-09-17)

Before approving unattended low-risk customer replies, review the mail remediation recorded in
`SOL-HANDOFF-COMPANY-AUDIT-AUTOPILOT-2026-09-16.md` and these files:

- `platform-v2/api/_lib/mailbox-poller.mjs` — canonical Supabase-project guard;
- `platform-v2/api/_lib/sent-mail-archive.mjs` — idempotent IMAP Sent append by Message-ID;
- `platform-v2/api/send-email.mjs` — consolidated send/archive/journal contract;
- `supabase/migrations/20260917101500_offerpsp_email_delivery_receipt.sql` — truthful delivery
  finalization without retrying an already-sent message;
- `platform-v2/src/pages/CaptainPages.tsx` and `MerchantWorkspace.tsx` — callers no longer mark
  delivery independently;
- n8n sender `3NWUlQpDHlVMJcb9` — accepted Message-ID and rendered HTML are now returned.

Resolved separately on 2026-09-17: the production mailbox destination and Sent-copy contract were
corrected and proved by the self-addressed E2E recorded in `TASKS.md`. Research-company screening
still has a strict no-send boundary and does not reuse the customer-outbound path.
