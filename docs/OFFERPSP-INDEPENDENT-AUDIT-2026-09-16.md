# OfferPSP Operator / Captain’s Bridge — independent audit

Date: 2026-09-16. Host: MacBook. Owner: Borys Kononenko.
Scope: production UI, staff MCP, relevant live n8n graphs/executions, Supabase metadata and aggregate data, local source and tests.
Mode: read-only audit; no production deployment, data migration, offer publication, message sending or bulk confirmation.

## Executive verdict

**PARTIAL — real operational product, not a decorative dashboard; not yet a safe autonomous operator.**

There is a substantial working foundation: protected staff access, merchant and PSP workspaces, a versioned offer registry, private document storage, matching/shortlist infrastructure, a mail center, calendar/tasks, SEO telemetry and active automation workers. Replacing it with a new system would discard useful work.

The main problem is fragmentation: different task stores, an incomplete communication history, legacy Telegram side-effect paths, a parser that passes tests but misreads the actual new rate card, and local code that differs from the deployed release. More autonomy now would amplify these defects.

Highest priorities:

1. Secure all Telegram/agent mutations with deterministic authorization and idempotency, not prompts alone.
2. Establish one OfferPSP task/execution queue; stop treating the shared BIX task runner as the OfferPSP runner.
3. Repair and verify the Antarex import and immutable replacement preview before changing offers or markup.
4. Reconcile the actual mailbox with the mail center and make delivery/import completeness observable.
5. Add a durable, bounded new-lead preparation pipeline with resumable steps, SLA and actionable Telegram cards.
6. Establish release provenance and role-based E2E tests before deploying the resulting changes.

No exploited breach is demonstrated. Identified security weaknesses still block unattended external actions. This audit is not a penetration-test certificate.

## 1. Evidence and release identity

### Repository

- Branch: `agent/offerpsp-platform`.
- HEAD: `4c6cd85cfb3608fbcd567a749be559fbe80b964a`, `2026-09-16T13:32:01+03:00`, `docs: record SEO production release`.
- Remote: `guannko/offerpsp-landing`.
- Pre-existing dirty files: modified `TASKS.md`; untracked Astra handoff and `docs/email-signature/`. Preserved.
- System Git is blocked by the Xcode licence; the existing fallback Git was used for read-only status/log checks.

### Production — VERIFIED

Vercel CLI inspected the alias `https://ops-7q4m2x9k8v3n.vercel.app`:

- Deployment: `dpl_6xQyt4s5DQFFDw5cDywwSHNQKZvP`.
- State: `READY`, target `production`.
- Created: **2026-09-07 17:38:06 UTC**.
- Twelve server functions, summed reported bundle size **119,485,399 bytes**.
- Largest: `platform-modules` 62,121,062; `poll-mailbox` 29,287,517; `extract-offer-pdf` 27,692,371 bytes.
- Live HTML uses `index-CiR5Hvi0.js` and `index-B-aXlA8I.css`, which differ from the fresh local build. Shared React and Supabase chunks were byte-identical.
- CLI inspect did not return a Git SHA. An exact deployed source revision is **not established**.

Therefore local tests and newer local function consolidation must not be described as already deployed. Different assets alone do not prove a bug; they prove that the two builds are not identical. This audit did not measure current accumulated Vercel storage or retention settings.

### Executed checks — VERIFIED

- `npm --prefix platform-v2 run lint` — exit 0.
- `npm --prefix platform-v2 run build` — exit 0 (TypeScript + Vite).
- All **15** `test:*` package scripts — exit 0: PDF, offer parser, provider source, mailbox poller, document processing, modules, control integrity, PWA, SiteOne, bridges, MCP/OAuth, BIX reserve, SEO live traffic, Search Console, audit sources.
- Root `npm run validate` — exit 0.
- Actual Antarex source fed to the parser — **19 routes instead of 22 source blocks**, detailed below. Existing green tests do not cover this commercial case.
- Six live unauthenticated requests were rejected with HTTP 401: AIBot command, email sender, Telegram sender, integration health, module health and MCP. Empty bodies and no credentials were used; no external action was requested.

Some control-integrity tests assert source text/regex rather than real browser/backend behaviour. Their success is useful regression evidence, not proof of an end-to-end journey.

## 2. Module matrix

`VERIFIED` below means the stated read-only behaviour was observed, not that every write in that module was executed.

| Module | Observed behaviour | Assessment / remaining gap |
|---|---|---|
| MCP Operator | OAuth restored; authenticated staff search/fetch/health successful; provider workspace read | VERIFIED for connection and reads. Bulk import capability is narrower than the requested Antarex replacement |
| Command Center | Real counts: 4 active requests, 4 PSP, 77 non-archived offer routes; actionable links and freshness queue | VERIFIED data display. Static sidebar health text is not a health probe |
| Inbox | Filters, owner/status fields, 2 current requests requiring handling | VERIFIED read path; no automatic complete follow-through demonstrated |
| Pipeline | Cumulative/current work stages and navigation | Real view, not autonomous workflow execution; do not imply drag-and-drop or automatic completion |
| Merchant workspace | Company profile, request, contacts, documents, shortlist/deal/task/history sections | VERIFIED existing record loads. Examined request has unknown risk category and missing currencies/methods/volume, yet generic next step says to run matching |
| PSP workspace | Antarex supply, contacts, offers, margin, PSP access, documents/history | VERIFIED reads and editors. Antarex and BR-Pay freshness reminders lack contact information |
| Offers / intake | 77 current routes, 58 published and 19 draft; parser queue and worker exist | PARTIAL. Actual new rate-card parsing is materially wrong; publication must be reviewed |
| Compliance PRO | Current cases and completeness/risk/readiness scores; manual screening; active worker | Real heuristics/evidence workflow, not regulatory approval. New-case initialization does not mean screening executes immediately |
| Deals / introductions | Production displays no active deals; source has review, introduction pack, Telegram/Zoom/outcome forms | PARTIAL. No current live journey through PSP acceptance to processing verified. Telegram group and Zoom creation are manual inputs, not demonstrated provisioning APIs |
| Radio room | 11 active threads, 3 visible drafts, organizer, filters, summaries and Telegram history | Real UI, **incomplete/freshness-problematic data**. Latest inbound database timestamp is Aug 24 |
| Tasks/calendar | 3 open tasks, real calendar events, 13 AIBot records | Real staff task controls. AIBot records are read-only; all 13 are historical (11 skipped, 2 done). Runner uses a different database |
| Research / casinos | 257 records visible when “В обработке” is selected; default active filter gives zero | Real research registry, not 257 qualified merchants. Sample records lack contact channels/GEO; licence strings are not verified licences |
| Subagents | Attribution/margin/commission ledger UI and RPC implementation; zero active agents/commissions | PARTIAL, unused live business path. Zero records do not make the feature fake, but do not prove revenue accounting |
| Analytics | Actual funnel: 4 requests, 2 started matching, 2 shortlist, 0 PSP acceptance, 0 live | VERIFIED display; 100% shortlist metric is conditional on only two started cases, not end-to-end conversion |
| SEO/GEO | Live Vercel and GSC timestamped data; GSC 4 clicks/492 impressions over displayed 90-day period, 22/25 indexed | VERIFIED integrations/data reads. Audit recommendations still require evidence review; SEO crawler schema-type lists are not full structured-data audits |
| Integrations | Authenticated gateways respond; UI explicitly distinguishes gateway check from delivery | VERIFIED health reads. Stored last tests from Aug 26 are not recent delivery evidence |
| Meilisearch | Healthy module and implemented remote search with local fallback | Readiness verified; full indexed corpus freshness not independently reconciled |
| GoRules | Healthy **shadow** mode | Intentionally not authoritative enforcement; must not be represented as the active decision engine |
| Mem0 / Docling / PostHog | Intentionally off; Supabase memory/native parsers/Vercel substitutes documented | Not broken dependencies solely because disabled; no reason to enable them merely to make more badges green |
| Public concierge | Separate active 5-node answer workflow; no internal DB/matching tools attached | Scope separation is good. Answers/handoff links, not a complete appointment-booking or merchant-processing agent |
| Client / PSP portal | Client sign-in screen works in RU/EN; PSP membership-only login visible | Login boundary observed. Authenticated customer/PSP multi-role E2E not performed |

## 3. Confirmed findings

### P1-01 — Legacy Telegram email path bypasses safe command handling

**Evidence: active published workflow**, not an unpublished draft:

`IRB53X5NAS4wTuyU`, active version `144132ee-ccff-4b68-839c-9fc74a66c914`. Draft and active node parameters match.

Path: `Telegram Trigger → IF Callback? → Answer Callback → IF Send Email? → Parse Draft ID → Get Draft → Send SMTP Email → Mark Sent`.

- Trigger subscribes to messages/callbacks without an allowed-user list in its parameters.
- No operator allowlist/identity check is present before this callback branch.
- Draft parsing strips a prefix; draft lookup is by ID, without a chat-owner filter or pending-state claim.
- SMTP send occurs **before** the `aibot_n8n_mark_email_sent` RPC checks the optional chat association.
- No single-use confirmation or atomic “pending → sending” claim appears before SMTP. A repeated callback can re-enter the send path.
- The marking RPC has no pending-status predicate; it can update an already-sent row again.

The two examined n8n RPCs are correctly service-role-only; anon/authenticated EXECUTE is false. This does not make the Telegram ingress safe. Exact external exploitability was not probed; no fabricated callback or email was sent.

**Acceptance:** unauthorized operator rejected before reads/writes; draft bound to actor/chat; confirmation bound to recipient/content/version; repeated clicks produce one logical send; uncertain delivery cannot be blindly retried; journal records actor/action/result.

### P1-02 — “Read-only AI” is a prompt, not an enforced capability boundary

`platform-v2/api/_lib/offerpsp-mcp.mjs:399` implements `ask_offerpsp_agent` by adding “MCP SAFE MODE” text and calling the general agent. Telegram draft preparation uses the same pattern.

The published general agent has write-capable tools (Operating Desk, tasks, bulk and email). `Prepare Web Query` carries message, session/user and screen context, but no separately enforced read-only capability scope. User identity is incorporated into the web session key, which is useful but is not a write prohibition.

**Risk:** accidental or injected instructions can reach write-capable paths despite a draft-only tool description. No induced write was attempted in this audit.

**Acceptance:** dedicated read-only toolset or server-enforced operation allowlist; mutations accept only typed authorized commands; free-form model text cannot elevate capabilities or manufacture confirmation.

### P1-03 — Task tools and visible OfferPSP queue are split across databases

**Live evidence:**

- Captain’s Bridge and Operating Desk use dedicated `iceopurxqzqmwtcmwfzl`.
- Main agent’s `Manage Tasks` calls Bot Tasks Tool `v7ftlw08IXsXNZoV`.
- That tool’s `Build Request` targets old BIX `xcizofpejsomjiflesbx`.
- Active Task Runner `s39doCFwQIKbN7sf` fetches/marks `bot_tasks` in that same old BIX project.
- Dedicated OfferPSP `bot_tasks` currently contains 11 skipped and 2 done records. Those are what the rubка shows, not proof that new tasks reach the runner.
- Runner execution `545348` completed successfully with **zero fetched tasks**.

This is a routing/integration boundary problem, not a reason to blindly move every BIX task. Other products may legitimately depend on the shared runner.

**Acceptance:** explicitly project-scoped queue; create/read/run/status all refer to the same OfferPSP job; atomic claim, lease, retry/dead-letter, unique idempotency key; shared BIX work remains untouched.

### P1-04 — Antarex source cannot safely pass the current parser

Read-only verified provider: Antarex `PSP-000002` / `c199749b-916d-4a8a-b3d3-8534d5130d75`.

- 24 currently published routes: `OFF-000076`–`OFF-000099`.
- 44 older archived routes; no new replacement batch uploaded during this audit.
- Current published batch: `0d23bd58-fb32-4e51-8d1b-85a36a8232d8`, version 3.
- Active provider PayIn margin policy adds **1 percentage point**. User requested **0% for the new replacement**, because the new source already includes remuneration.
- Provided source contains 22 blocks; actual CLI output contains 19 routes.

Observed parsing defects include:

- EUR FTD absorbs the adjacent E-com block, losing the independent offer and mixing limits.
- Apple/Google Pay becomes `EU · Payment · PayOut`, losing method and confusing settlement wording with payment flow.
- Argentine Mercado Pago absorbs Russian C2C/SBP conditions; output title becomes `AR · SBP / C2C / MERCADO_PAGO`.
- Exchange-rate uplift is treated as a fee component; conditional/tiered terms require explicit structured handling.

Private local repro: `.private/antarex-2026-09-16/parser-draft.json` (ignored by Git). Do not publish this output. Preserve original source bytes/hash separately from normalized parser text.

**Acceptance:** reviewed 22-block mapping; source-excerpt provenance for every monetary field; separate traffic/amount-tier/FX/settlement semantics; explicit unknowns; no invented rates; regression fixture reproducing this exact case.

### P1-05 — Bulk replacement API does not implement the required transaction

Existing `prepare_offerpsp_route_replacements` prepares pairs of existing routes. It is not an atomic “archive exact 24 old routes + create/publish 22 new routes + set provider markup 0 + handle affected shortlists” operation.

Operator prepare request returned BLOCKED without an executable preview/token. No bulk operation was confirmed.

**Acceptance:** immutable source hash + exact old IDs + full new payload + margin version + affected shortlist/deal policy + expiry + state/version checks. Preview must state what existing clients will see. Confirm atomically; archive rather than hard-delete; support rollback. Explicit Borys confirmation is mandatory.

### P1-06 — Mail center is not a complete current business record

Live database aggregate:

- Inbound: 13 messages; latest `2026-08-24 13:27:27 UTC`.
- Outbound: 9 messages; latest `2026-09-01 14:11:45 UTC`.
- Current active UI includes overdue test messages as “waiting for partner”.
- Titan poller execution `545241` returned success but `scanned=0`, `ingested=0`.

This does not include the recent PayLolly/payabl. exchanges provided by Borys. Cause is **not yet established**: live mailbox/folder configuration, ingest destination, processed flags and historical/backfill behaviour must be reconciled. Do not assume opening a message in Thunderbird is the cause: the inspected local poller uses a custom processed flag, not UNSEEN. Current production revision of that implementation still requires provenance verification.

Local `mailbox-poller.mjs` reads INBOX only; sent-folder reconciliation is not implemented there. Manual replies from a desktop client therefore cannot be assumed to appear in the rubка.

**Acceptance:** canonical mailbox/folders verified; one real thread reconciles incoming + sent + attachments + Message-ID/In-Reply-To; history backfill deduplicates; test traffic excluded from commercial follow-up; health shows last imported business message and backlog, not only HTTP success.

### P1-07 — New-lead notification is not a durable operator job

Active inbound workflow `ealRZcZzCLKAv6S5` saves a lead, returns success, notifies owner and separately builds an instant client workspace/login email. It does more than a single notification, but there is no complete durable operator preparation job with checkpointed steps and actionable callback card.

- Telegram notification is plain text, without the requested action keyboard.
- Owner email and Telegram nodes use `continueRegularOutput`; their failure need not fail the overall execution.
- Lead insertion initializes a compliance case via a DB trigger.
- The inspected claim policy processes manually requested cases or post-selection stages; initialized `pending` is not equivalent to “screening already ran”.
- An existing request visibly lacks category/method/currency/volume while next-step text generically suggests matching.

**Acceptance:** recorded job → dedup/normalize → missing-fields list → preliminary research → internal draft dossier/match candidates where appropriate → assigned SLA task → operator Telegram card → resumable outcome. Unknown risk must not be guessed. The public bot must stay outside matching and offer selection.

### P1-08 — Release/test evidence does not yet cover the complete role journey

Local and production builds differ; no deployed Git SHA was available. All local tests pass despite the reproduced financial-data parser errors. No actual accepted PSP review, commissioned subagent transaction or live-processing outcome exists in the examined active funnel.

**Acceptance:** release manifest containing source SHA/build ID/migration version; staging fixtures for merchant A/B, PSP A/B, staff and subagent; automated allow/deny assertions; delivery-failure/replay tests; smoke checks against the deployed release. Do not manufacture production “live” outcomes for testing.

## 4. Lower-priority findings and non-findings

### P2 — Misleading health/operational signals

- Sidebar `Production работает` is static JSX (`AppSidebar.tsx:52`), not observed health. Replace with timestamped actual readiness or neutral environment label.
- Integration page correctly says gateway check is not delivery; preserve that honesty.
- Task/calendar entries are stale relative to known completed outreach; no automatic reconciliation demonstrated.
- “257 casinos” is research inventory, not sales-ready contacts. Surface qualified/contactable counts separately.
- GoRules shadow mode is deliberate. Promote only after comparing decisions and testing exclusions.
- General agent has legacy callback prompts for disabled tools. Remove or explicitly disable unreachable commands after mapping replacements.
- Header/profile and public-concierge prompt still use `Boris`; user requires **Borys** everywhere. Do not rewrite historical source correspondence silently.

### P2 — Security/performance hygiene, not automatic emergency findings

Supabase advisors returned 153 authenticated SECURITY DEFINER execution warnings, 19 RLS-without-policy information notices and leaked-password protection disabled. These are not 153 confirmed leaks:

- Examined staff workspace RPCs reject non-staff.
- PSP workspace RPC checks provider membership.
- Client offer RPC filters `shared` shortlists by client lead access and exposes a selected projection.
- Examined private tables have no anon/authenticated SELECT grant.
- Public business tables examined have authenticated-role policies, not anonymous allow-all policies.
- Both source and merchant-document Storage buckets are private, with MIME/size constraints.

Enable leaked-password protection if applicable; maintain a reviewed RPC allowlist; run systematic negative role tests. Audit Storage object policies and signed URL expiry with test identities before declaring full isolation verified.

Performance advisor: 75 unindexed-FK notices and 80 unused-index notices, plus absolute Auth connection setting. Use workload/query plans before adding or removing indexes; unused statistics are not deletion authorization.

Current 119.5 MB function bundles warrant reducing duplicated document dependencies and release retention review. No current latency/load benchmark or accumulated storage measurement was performed.

### UI check

- Authenticated desktop navigation inspected across visible business modules.
- Merchant card at 390×844 after clean load has 390px document width, no global horizontal overflow; screenshot readable. Temporary resize before reload briefly produced a wider layout, so orientation/resize regression testing remains useful; no persistent mobile defect is claimed from that transient result.
- Client login RU/EN and PSP access screen inspected without requesting magic links or changing memberships.
- No “dead button” conclusion from a single unsuccessful automated click: the merchant card loaded by its actual observed URL.

### Not decorative, but not autonomous

Calendar, filters, editors and registries have real state and RPC wiring. Telegram/Zoom introduction screens prepare text and record links; they are **manual-assisted workflow**, not proven automatic group/meeting creation. Hidden finance/settings feature flags are not exposed working modules. A public AI answer box is not a scheduling integration.

## 5. Eight critical journeys

| Journey | Evidence achieved | Completion status |
|---|---|---|
| New lead → dossier → internal matching | Published inbound graph, DB triggers, existing request and historical successful intake execution | PARTIAL; no fresh synthetic production lead created; durable operator pipeline missing |
| Provider source → parsed review → publication | Live registry/worker plus exact local Antarex repro | BLOCKED for Antarex replacement; bad parse and missing batch transaction |
| Client shortlist → decision | Existing shared shortlists and role-scoped RPC | PARTIAL; no customer decision submitted |
| PSP review → acceptance | Membership guard and review implementation | PARTIAL; no live acceptance executed |
| Acceptance → Telegram/Zoom → live | Deal forms/introduction-pack source, empty active deal list | PARTIAL; manual handoff, no external provisioning or live launch verified |
| Returning merchant → reusable company/request | Persistent company profile, request/profile RPC and portal code | PARTIAL; authenticated client reuse not exercised |
| Subagent → attribution → economics | Implemented workspace/ledger, zero active business records | PARTIAL; no commission reconciliation fixture executed |
| Communications → follow-up → closure | Real mail/task UI, active poller/runner graph | PARTIAL; stale mail history and split task stores prevent trustworthy loop |

## 6. Recommended build order — “operator, not another chatbot”

### Stage A: secure and make state coherent

1. Gate every TG update by approved operator identity/chat before business tools.
2. Replace legacy send callback with typed server action and single-use confirmation.
3. Enforce read-only vs prepare vs execute capabilities server-side.
4. Isolate OfferPSP queue/worker/memory, with explicit shared-BIX boundaries.
5. Record deployment identity, job IDs and last successful business action in UI.

### Stage B: data quality and communication truth

1. Fix Antarex parser with exact fixture and human-reviewed mapping.
2. Generate replacement preview, including zero markup and old shortlist consequences.
3. Only after explicit approval, perform atomic replacement and verify rollback data.
4. Reconcile inbox/sent history, attachments and delivery state; eliminate misleading test follow-ups.

### Stage C: new-lead operator autopilot

One durable lead job with steps and checkpoints; each side effect has an idempotency key, actor, source record/version, attempts, timeout and terminal state. Retries must resume work, not repeat already-completed external actions.

Automatically allowed preparation: normalize, deduplicate, extract missing fields, research public website, prepare dossier, run permitted internal checks/matching, create/update one SLA task, generate a draft reply and owner card.

Owner card: what arrived, confidence/evidence, missing information, work completed, current blocker, next step; buttons for open workspace, run/resume safe preparation, review draft, assign/defer. Buttons must not be free-text prompts to a privileged agent.

Requires explicit approval: external messages, offer publication/replacement, commercial changes, irreversible actions and provider disclosure. Hard limits and a kill switch are server-enforced; scheduled model calls need task/cost/time budgets.

### Stage D: resilience and measurable outcome

- Durable outbox, retry/backoff, lease expiry, dead-letter and replay test.
- Separate `queued / running / prepared / awaiting_approval / sending / sent / delivered / failed / uncertain` where applicable. HTTP 200 or a generated answer is not delivery/completion.
- Alert on old unresolved jobs, import lag, stale offer data and missing owner, not merely workflow exceptions.
- Track time to first useful response, preparation completion, unresolved exceptions, duplicate sends, freshness coverage, introductions accepted and actual processing — not just AI message volume.
- Verify backup restoration and credential recovery in an isolated environment. A backup/outbox existing in code is not a completed recovery drill.

## 7. Audit limitations and preserved state

No test identities were created, no production customer/PSP state changed, no callback exploit attempted, no real message sent, and no synthetic deal was marked live. Multi-role signed-in E2E, all RPC bodies, every Storage policy, external delivery and disaster recovery remain unverified.

Health can generate operational probe/audit logs; opening application views may exercise normal application read-side bookkeeping. “Read-only” here excludes deliberate business mutations, not a promise that services write no access logs.

Only the restored OAuth connection, ignored local parser repro and this audit artifact were prepared. Existing Antarex routes and margin remain unchanged. No replacement confirmation token was issued. No production deploy or database migration occurred.

Next implementation should close P1-01/02/03 first, then deliver a trustworthy Antarex preview and the operator preparation loop. Do not add more models or optional services before these boundaries are correct.
