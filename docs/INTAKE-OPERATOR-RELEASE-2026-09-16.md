# Intake operator task and Telegram card — 2026-09-16

Status: `PARTIAL` overall autopilot; task creation, delivery and replay protection below are verified.

## Released scope

- Additive database migrations `20260916185027_offerpsp_intake_operator_tasks` and
  `20260916185028_offerpsp_telegram_intake_actions` applied to `iceopurxqzqmwtcmwfzl`.
  Follow-up `20260916190145_offerpsp_intake_terminal_guards` also excludes won/lost intakes and
  cancels only their initial-response task, preserving ongoing account-management tasks.
  Local filenames match the server migration ledger.
- Every newly inserted active, non-spam/non-closed intake creates one existing-system
  `public.offerpsp_tasks` row, identified by `intake_response_v1`. No historical backfill.
  Internal response target: submitted time + 24 elapsed hours, editable in the existing UI.
  Active assigned staff is preserved; otherwise the sole active owner is used, or no assignee
  is invented. Reprocessing does not reset completed tasks, assignee or a human-edited due date.
- Existing merchant lifecycle cancels tasks when closed/archived. Task identity cannot be
  detached by editing its lead/reference. Contact timeline uses the existing task trigger.
- Private Telegram identity binding is bootstrapped from the existing private notification
  chat and sole active owner. Every Telegram message/callback now passes a service-only identity
  check and a private-chat/from-user check before the shared AIBot path.
- New `oi:<UUID>` callbacks are deterministic protected RPC calls, not model instructions.
  They check active staff, ownership/scope, expiry and current lead state, lock the lead/token,
  call canonical screening/draft functions and store attributed receipts. Successful repeated
  clicks return the saved result. No callback in this feature sends merchant email or exposes
  providers/prices/margin.
- Buttons: open merchant, queue existing background screening, inspect stored matching count,
  prepare missing-information draft, prepare acknowledgement draft, postpone the same task 24h.
  Screening is NOT a deep regulator/sanctions audit. Matching inspection is NOT recomputation.
  Postponing a due date is NOT a Telegram reminder-delivery implementation.
- The initial card is a timestamp-relative snapshot; it explicitly labels pending/missing data.
  It is not silently refreshed after screening/workspace creation. Current data is in the bridge.
- A separate asynchronous notification worker prevents a downstream Telegram failure from
  aborting the client-access/email branches. It reserves delivery before sending and records
  Telegram message ID. Repeated runs do not send duplicates. Ambiguous sends remain reserved
  for manual reconciliation rather than being falsely claimed as exactly-once delivery.
- Legacy `do_send_email_*` / generic `send_emails` callback buttons have no immutable one-time
  approval and are blocked. Web staff sending remains unchanged. Existing server-token bulk
  confirmation/cancellation remains on its prior protected server path. This does not constitute
  a complete independent audit of every legacy AIBot entry/tool.

## Published workflows

| Workflow | ID | Published version |
|---|---|---|
| Shared AIBot | `IRB53X5NAS4wTuyU` | `5740c9a1-4c04-4bed-ab34-b38ac5b0e301` |
| Inbound lead form | `ealRZcZzCLKAv6S5` | `1d61af97-9f06-4458-ab47-24347cdb0cf9` |
| Operator intake card | `lpKqreuYkSkkyZgQ` | `59b0307e-4a0b-4ac4-879c-91f20d166c52` |

New card worker shares the existing dedicated OfferPSP database credential and Telegram bot
credential; no new secret was exposed or embedded. No Vercel deployment was created.
The old UI text about minute polling remains pending the next grouped app release.

## Evidence

- 20 new local SQL/renderer/guard tests pass. Combined run with screening worker/event regressions:
  34 tests pass. Fixtures use actual migration functions and canonical queue/draft function code.
- Isolated real PostgreSQL 15 concurrent sessions: simultaneous card preparation creates one task
  and one token set; simultaneous clicks create one draft and one attributed action; simultaneous
  notification claims allow one sender. No network or production data in the container; removed.
- Production transaction assertions passed and were rolled back in full: actual existing triggers,
  task creation, draft replay, unauthorized identity and lifecycle cancellation. No committed
  pg_net dispatch, email or real-client mutation from that test. Existing task count remained 8.
  A separate rolled-back production assertion also verified terminal won-state exclusion.
- Active graph validation: no errors. Warnings include existing legacy-node notices and deliberate
  fail-closed HTTP/error behavior. New private tables have RLS and no client grants/policies:
  intentionally deny-all. Advisors: 24 INFO RLS/no-policy (including 3 new private tables),
  153 pre-existing authenticated-definer warnings and the existing leaked-password-protection
  warning. No claim of a project-wide clean security audit.
- Controlled committed synthetic lead: `34568765-2c28-42ad-9e1a-ab294f5ff132`,
  `AUTOPILOT TEST — NO ACTION REQUIRED`, `internal_release_canary`, invalid-domain email.
  Task `94dae773-5536-4ec1-8087-ebf5cc932b14`. No client workspace/login/email flow invoked.
- Actual n8n card worker execution `547732`, integrated, success, 18:55:31–32 UTC.
  Telegram accepted message `971`; the database receipt is `sent`.
- Actual repeat execution `547752`, success, 18:57 UTC: `already_reserved` → zero renderer
  output items. No second Telegram send. This also verifies the parent's defineBelow input mapping.
- Temporary authenticated smoke workflow `iUpWMUvxgq7n77Ci` was deactivated and deleted after
  the two checks. It had a fixed synthetic ID and no arbitrary caller-supplied action/data.
- ESLint passed. Production web UI/build was not changed in this release.

## Still pending / limits

- Borys's actual Telegram double-click and visual usefulness confirmation were requested; not
  yet observed at report time. Leave the clearly labelled synthetic lead/task temporarily active
  for that check, then close/archive it and any synthetic drafts. Never count it as a customer.
- Idempotency here is per stored lead ID, not across two independent duplicate public submissions.
  The card reports possible equal email/URL records, not a complete canonical identity/dedup engine.
- Card dispatch currently belongs to the public intake workflow; other lead sources get the task
  trigger but do not automatically dispatch this card. Screening completion does not edit it yet.
- Timed reminder delivery, card refresh, deep independent company investigation, evidence-only
  empty-field enrichment and fully automatic qualified matching remain future stages.
- Missing-data drafts are review templates and may contain field labels in the screening language;
  human review remains mandatory. No external action confirmation/sending was added here.
- A failure/expired/not-ready callback receipt is retained; use the bridge to resolve/retry instead
  of repeatedly pressing the same consumed token. Tokens currently expire after seven days.

## Rollback

Keep evidence. Do not delete tasks, drafts, actions or deliveries.

1. Restore only affected existing workflow connections/nodes from
   `supabase/rollback/20260916_intake_workflows_before.json`, removing its listed new node IDs.
   Re-enable the original intake Telegram notification when restoring its graph. Inspect published
   versions; updating an active workflow publishes immediately. Avoid restoring unsafe legacy
   send buttons except as a documented emergency decision.
2. Deactivate card worker `lpKqreuYkSkkyZgQ` after removing its caller.
3. Run `supabase/rollback/20260916_intake_operator_autopilot.sql` to disable the task trigger,
   Telegram bindings and transport RPC grants, leaving evidence intact.
