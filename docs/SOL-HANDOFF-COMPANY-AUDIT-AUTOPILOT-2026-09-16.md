# Sol High handoff — company research and intake autopilot

Prepared: 2026-09-16. Owner: Borys Kononenko.
Status: diagnosis only for the research-registry gap; no implementation or production
mutation was performed in that diagnostic pass.

> Historical handoff. Do not restart this plan from the beginning. Use `TASKS.md` and the current
> production state as the source of truth; the commit and tool notes below describe the environment
> at the time of transfer only.

## Assignment and order

Borys approved continuing in this order:

1. Make company research/audit work from creation through persisted evidence and visible outcome.
2. Connect the result to the permitted next intake action: missing-data preparation or internal matching.
3. Verify the remaining Telegram actions end to end, including retries.
4. Add reliable due reminders and refresh the existing operator card.

Start with item 1 and reach a verified milestone before expanding into item 2. Do not ask Borys
to restate the assignment. Work in Sol High; prepare the risky database/queue/security changes
for an Astra High review before production. Do not claim that review happened unless it did.
This document does not authorize creating additional Codex tasks or spawning agents.

## Working context

- MacBook repository: `/Users/borisboris/diskD/N8N/AIBot/offerpsp-landing`.
- App: `platform-v2`; production staff URL: `https://ops-7q4m2x9k8v3n.vercel.app`.
- Production Supabase: `iceopurxqzqmwtcmwfzl` (`offerpsp-production`).
- Legacy BIX database `xcizofpejsomjiflesbx` is NOT the OfferPSP data plane.
- Read root/project `AGENTS.md`, applicable skills and current `TASKS.md` before implementation.
- Current HEAD when this note was prepared: `8b8d912`.
- Pre-existing dirty files: `TASKS.md`, untracked
  `docs/ASTRA-HANDOFF-ANTAREX-TELEGRAM-AUTOPILOT-2026-09-16.md` and
  `docs/email-signature/`. Preserve them; do not stage the entire worktree.
- Native Git previously failed on the Xcode licence. Working fallback:
  `/Users/borisboris/.cache/codex-runtimes/codex-primary-runtime/dependencies/bin/fallback/git`.
- Rediscover tools and runtime availability; these are pointers, not live health guarantees.

## Already finished — do not redo

- Event-driven intake screening, with a 12-hour recovery sweep rather than minute polling.
- One first-response task per intake and protected Telegram action callbacks.
- Telegram keyboard rendering repaired. Actual repeated clicks created one reply draft;
  the second execution returned the existing result. No customer email was sent.
- Assistant chat reopening scrolls to the latest message.
- Readable System Actions journal with chronological entries, large timestamps, collapsible
  evidence and clickable attention items. Borys has now accepted this display.
- Latest UI release: `a2dbd86`; deployment `dpl_AL8a3qypLGa3A5N1TsKuJDtv9MzU` was READY.
  This is prior release evidence, not a fresh health check.
- Synthetic intake `34568765-2c28-42ad-9e1a-ab294f5ff132` is closed/archived;
  its task and draft were cancelled. Do not reactivate it or use it as a real customer.

Recent authoritative release notes:
`docs/SCREENING-EVENT-RELEASE-2026-09-16.md`,
`docs/INTAKE-OPERATOR-RELEASE-2026-09-16.md`,
`docs/INTAKE-OBSERVABILITY-2026-09-16.md`.
TASKS contains historical sections and stale checkboxes; later verified evidence supersedes them.

## What the latest diagnosis actually established

VERIFIED by local source and read-only production SQL:

- `ResearchEntityEditor.tsx` saves a research casino/PSP using
  `save_offerpsp_research_entity`; its workspace displays fields, notes, tasks, mail and history.
- The live `save_offerpsp_research_entity(text,bigint,jsonb)` only writes the entity and
  `private.offerpsp_entity_audit`. Its definition does not enqueue company screening.
- Live `get_offerpsp_research_workspace(text,bigint)` returns entity/notes/tasks/mail/audit,
  not a company-screening result or job lifecycle.
- Production `public.casino_leads` and `public.psp_providers` have no non-internal triggers.
- The existing company-screening worker and queue are keyed to UUID merchant `lead_id`,
  not research casino/PSP integer IDs. Do not cast or substitute one identity for another.
- `buildCompanyScreening` collects limited website/RDAP/domain evidence; licence statements
  remain unverified and sanctions/adverse-media checks explicitly remain unknown.

Scope of proof: this confirms the missing enqueue/result path in the research-card save flow.
It is NOT a complete fresh audit of every n8n research workflow. Check for an existing reusable
research job path before introducing a new one. Do not describe all company research as absent.

Tool limitation: OfferPSP Operator tools were not exposed in the last session, although its skill
was installed. Supabase MCP read-only inspection worked. Rediscover Operator first; report its
absence explicitly, never bypass staff OAuth or silently replace commercial operations with SQL.
Infrastructure diagnosis/implementation through the appropriate authorized engineering tools is
separate from impersonating a staff action.

## Item 1 — implementation plan

1. Verify current branch/diff and actual DB functions, grants, tables, migrations and active
   workflow versions. Identify all relevant research write paths, not just the React form.
2. Explain the minimal proposed job ownership/linkage in a short progress update. Reuse the
   existing safe evidence collector and lifecycle patterns, but do not invent merchant leads,
   create customer accounts, send access emails or trigger sales notifications for research rows.
3. Prepare a durable staff-only research job/result path with an explicit entity type + ID,
   queued/running/completed/failed or skipped states, timestamps, run identity and readable reason.
   Preserve previous evidence/history when a new run starts or fails.
4. New eligible research records should enqueue once; existing records get an explicit rerun.
   Do not backfill the old registry or re-audit every historical company. Ordinary contact/status
   edits must not create loops. Material input changes must invalidate stale in-flight results.
5. Use event-driven dispatch and the agreed 12-hour recovery principle. No frequent empty polling.
   Add retry ceilings, leases, duplicate-dispatch protection, concurrency fences and a visible
   failure outcome. Archival/terminal state and disabling the module must stop further work.
6. Persist evidence with source and check time. Keep operator-entered data and verified manual
   decisions intact. Suggested facts must not silently become verified company identity/licence,
   partner status, contact readiness or PSP approval.
7. Add an understandable research-card result view and explicit rerun action. Reuse the readable
   journal style. Show when a check was not performed and why; link to the relevant evidence or
   corrective screen. Do not show a success state merely because a job was queued.
8. Document what this stage does NOT check. Connecting website/RDAP checks is preliminary
   research, not complete KYB, regulator-register verification or sanctions clearance. Do not add
   paid research services or promise those capabilities without a separate verified integration.

### Relevant code and SQL

- `platform-v2/src/components/control/ResearchEntityEditor.tsx`
- `platform-v2/src/pages/CaptainPages.tsx`, `platform-v2/src/pages/Platform.tsx`
- `platform-v2/api/_lib/company-screening.mjs`
- `platform-v2/api/_lib/company-screening-runner.mjs`
- `platform-v2/api/_lib/company-screening-worker.mjs`
- `platform-v2/api/_lib/safe-evidence-fetch.mjs`
- `platform-v2/api/platform-modules.mjs` (existing consolidated handler routing)
- `supabase/migrations/20260804161410_offerpsp_research_crud.sql`
- `supabase/migrations/20260809120000_offerpsp_counterparty_organizer.sql`
- `supabase/migrations/20260916141150_offerpsp_intake_screening_queue.sql`
- `supabase/migrations/20260916181143_offerpsp_screening_events.sql`
- `supabase/migrations/20260916181803_offerpsp_screening_event_tickets.sql`
- `platform-v2/scripts/screening-workflow.mjs`, `screening-test-fixture.mjs`

Migration warning: intake queue source `20260916141150` was recorded in production as
`20260916164115`. Reconcile actual history before any CLI push; never apply it twice because
the filename differs. Old comments saying “not applied” are not authoritative.

Existing workflows to read before changing anything:
- screening worker: `MzGIqCRwEUEp2K8C`;
- event ingress: `mrTCGINWgtcZXZW0`;
- operator card: `lpKqreuYkSkkyZgQ`;
- shared Telegram/web AIBot: `IRB53X5NAS4wTuyU`.

Updating an active n8n workflow previously republished immediately. Do not treat an edit as a
safe draft. Test isolated/inactive graphs first and retain a verified rollback definition.

## Required checks before production

- New casino and research PSP each receive exactly one appropriate job.
- Duplicate clicks/delivery and concurrent workers do not duplicate work or results.
- Changed input, archive during execution, expired lease, retries exhausted, module disabled,
  collector timeout and unreachable site all leave accurate outcomes without overwriting good data.
- Missing/invalid/private-network URLs remain unknown; preserve DNS/redirect/size/time bounds
  in `safe-evidence-fetch`. Never use the email provider domain as the company website.
- Staff can read/request the relevant job; anon, merchant and inactive/non-staff sessions cannot.
  Workers receive narrowly scoped authorization; private results never leak into public projections.
- Normal intake screening still works; research records create no merchant account, email,
  shortlist publication, clearance, sales status change or unexpected Telegram notification.
- Isolated PostgreSQL concurrency + HTTP/worker integration + actual UI acceptance are required.
  Passing a mocked unit test is not proof of the production flow.

Useful existing commands from repo root (check current package scripts first):

```sh
npm --prefix platform-v2 run test:company-screening
npm --prefix platform-v2 run test:screening-concurrency
npm --prefix platform-v2 run test:screening-http
npm --prefix platform-v2 run test:screening-n8n
npm --prefix platform-v2 run test:intake-autopilot
npm --prefix platform-v2 run lint
npm --prefix platform-v2 run build
```

Add research-specific regression tests. Concurrency/HTTP scripts use temporary Docker fixtures;
inspect prerequisites and cleanup paths before running. Do not point them at production.

Prepare an Astra review packet: exact diff, ownership model, grants, tests/results, failure cases,
migration ordering and rollback. Stop before production cutover for this review; do not stop
ordinary local implementation after every reversible step. After review, follow project clean-commit,
Linux native-runtime and function-storage checks, then one grouped release rather than repeated
production deployments. Keep accurate VERIFIED/PARTIAL/BLOCKED evidence in release notes.

## Following stages — only after item 1 is verified

**Item 2:** inspect actual intake qualification gates. For each new application, prepare an
evidence-backed acknowledgement or missing-information message immediately from the intake event,
validate it against the latest canonical application/contact state and, when all allowlisted
low-risk outbound gates pass, send it to the customer automatically. The 12-hour sweep is recovery
only for missed or interrupted events; it must never be the normal response delay. If any gate is
unknown or fails, retain the message for staff review with a clickable reason. Run internal matching
only with the existing required staff clearance. Matching is not provider acceptance. Research
inventory is not automatically a qualified merchant application.

Mail-client boundary for item 2: Borys now works with the OfferPSP mailbox in Mozilla Thunderbird.
Thunderbird is a desktop client, not the bot's delivery service, so production automation must not
drive its UI or depend on a Mac being awake. On 2026-09-17 the local Thunderbird profile showed
`bizdev@offerpsp.com` using `imap.secureserver.net:993`, `smtpout.secureserver.net:465` and the IMAP
`Sent` folder. Reconcile those settings with the live server credentials before release; do not rely
on the old “Titan” label. Whatever server-side sender is retained, persist the exact Message-ID,
In-Reply-To/References and delivery receipt, append/synchronize the sent copy into the mailbox's
IMAP `Sent` thread and Captain's Bridge, and never create parallel Thunderbird-only history.

Read-only production reconciliation on 2026-09-17 established:

- public MX points to `smtp.secureserver.net` and `mailstore1.secureserver.net`;
- SPF authorizes both `secureserver.net` and Brevo; Brevo DKIM selectors resolve; DMARC is currently
  monitoring-only (`p=none`);
- active n8n sender `3NWUlQpDHlVMJcb9` sends as `bizdev@offerpsp.com` through credential
  `bizdev@offerpsp.com (Titan 587)`, but the graph neither captures a useful delivery Message-ID nor
  appends the exact sent message to IMAP `Sent`;
- active poller `tiEQBHg4iNHCHbQI` calls the protected Vercel mailbox endpoint every minute and its
  latest executions succeed; the current implementation reads `INBOX` only;
- the production Vercel project contains encrypted `OFFERPSP_IMAP_*` variables, but their values are
  intentionally not readable through the available CLI/API. Do not claim the deployed override
  values are verified merely because code defaults and Thunderbird currently agree.

Conclusion: do not automate the Thunderbird UI and do not rename a credential as a migration.
Build the controlled outbound lane server-side, then verify one consented synthetic/self-addressed
message appears once in delivery history, Captain's Bridge and Thunderbird `Sent` before enabling
automatic customer replies.

Controlled self-addressed E2E on 2026-09-17 (`OFFERPSP-MAIL-SYNC-20260917T093350Z`) is `PARTIAL`:

- n8n sender execution `554658` completed successfully and the remote SMTP service accepted the
  message as `<9ede3b76-fd34-f46b-d936-d40be35f3975@offerpsp.com>`;
- Captain's Bridge persisted one outbound row with `delivery_status=sent`, but its
  `external_message_id` is `NULL`, while `provider=brevo`; the stale n8n credential label must not
  be treated as evidence that Titan is still the actual transport;
- Thunderbird received exactly the expected message in `INBOX` through the configured
  `imap.secureserver.net` account;
- poller execution `554665`, started immediately after delivery, reported
  `scanned=1, ingested=1, duplicates=0, failed=0`. The inbound row was durably created with the
  accepted Message-ID, but in the legacy shared BIX Supabase project `xcizofpejsomjiflesbx`
  (`guannko's Project`), while Captain's Bridge wrote the outbound row to the canonical dedicated
  OfferPSP project `iceopurxqzqmwtcmwfzl` (`offerpsp-production`). This is a verified production
  split-brain configuration, not a false poller counter;
- Thunderbird `Sent` contained no copy of the test message. Direct server-side delivery currently
  creates parallel history instead of synchronizing the sent MIME into IMAP `Sent`.

Do not enable unattended customer replies yet. The next implementation must preserve the accepted
Message-ID in Captain's Bridge, point mailbox ingestion only at `offerpsp-production`, append the
exact sent MIME to IMAP `Sent`, return and journal the durable message-row identity, and then repeat
this same E2E until all four surfaces agree exactly once. Do not copy the legacy inbound row into
production by hand; repair the route first and let a new synthetic message prove the corrected
boundary.

Local remediation package prepared on 2026-09-17:

- the mailbox poller now compares `OFFERPSP_MAIL_INGEST_URL` with the canonical `SUPABASE_URL` and
  fails closed before reading/flagging INBOX when the projects differ;
- `sent-mail-archive.mjs` builds a standards-compliant multipart Sent copy with the accepted
  Message-ID, finds the server's `\\Sent` mailbox, deduplicates by Message-ID and appends with
  `\\Seen`;
- migration `20260917101500_offerpsp_email_delivery_receipt.sql` finalizes an already-sent draft
  without authorizing a resend and preserves provider, Message-ID and Sent archive outcome;
- `/api/send-email` now requires the durable draft ID, treats an already-sent message as sent even
  when journaling/archive recovery is needed, and returns a warning instead of inviting an unsafe
  duplicate resend;
- Captain's Bridge and merchant workspace call the consolidated delivery contract instead of
  independently marking the draft `sent`;
- active n8n email sender `3NWUlQpDHlVMJcb9` was updated compatibly to return its accepted
  Message-ID, provider, send time and rendered HTML; runtime validation passes with zero errors and
  zero warnings. No additional email was sent during this update.

Local evidence: mailbox-poller tests, Sent-archive tests, integration-bridge tests and production
build pass. The migration sequence accepts the new migration in PGlite; the full legacy validator
continues beyond it and later stops on a pre-existing pre-compliance grant assertion unrelated to
email delivery. Production code, migration and Vercel ingest URL are not yet released.

**Item 3:** test queue-screening, matching inspection, missing-data automatic outbound and
deadline-postpone callbacks, not just reply-draft. Verify allowed sender, recipient binding, current
source version, confidentiality, cooldown, idempotency, replay, failures, delivery receipts and the
persisted journal. The same outbound preflight must validate both AI-generated and staff-authored
messages; a human edit does not silently bypass it. Ask Borys for a click only if automation cannot
reproduce the actual client action. Use explicitly marked synthetic fixtures and clean up their
active tasks.

**Item 4:** a due date is not a reminder. Add bounded, deduplicated operator reminders and edit
the existing card with current evidence. Respect done/cancelled/archived states; recovery must not
blind-resend uncertain deliveries. Retain event-driven operation and a 12-hour safety sweep.

## Non-negotiable boundaries

- No Antarex bulk replacement without the exact preview and Borys's confirmation.
- Do not focus on automatic Telegram groups, Zoom meetings or commission/subagent economy.
- No **unvalidated** customer messages. Allowlisted low-risk messages may be sent automatically and
  immediately after the deterministic policy gates and an independent content/fact validation both
  pass. Fail closed to staff review when facts are stale, contradictory or unknown, delivery state
  is ambiguous, or the message exceeds its allowed class.
- Until a separate verified policy explicitly expands the allowlist, PSP identity disclosure,
  source rates/margins, contract or legal language, provider acceptance, merchant approval/rejection
  and bespoke commercial commitments require staff approval. An explicit staff override must show
  the failed warning, require a reason and be journalled; it must never be silent.
- Do not promote a research result to licence verification or low risk without evidence.
- Do not weaken staff OAuth/RLS, leak credentials, expose PSP identities or source economics.
- Do not silently change the approved System Actions design or start unrelated SEO work.
- Keep Borys informed in short Russian progress updates; preserve the spelling Borys.
