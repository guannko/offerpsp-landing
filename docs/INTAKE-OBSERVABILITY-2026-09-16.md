# Intake observability and Telegram keyboard repair

## Verified before web release

- Existing notification message 971 had no `reply_markup`; the n8n Telegram
  fixedCollection was a root expression string. Changed it to a literal six-row
  collection with expressions on individual fields in active workflow
  `lpKqreuYkSkkyZgQ`, version `94f04f73-b529-4e24-b9a7-b5052e7507a3`.
- Edited that same synthetic message (no duplicate delivery). Telegram returned
  `ok: true`, `message_id: 971`, and six keyboard rows; native UI and Borys confirmed
  the buttons are visible. Temporary JWT-authenticated repair workflow was removed.
- Main Telegram workflow was reactivated earlier during diagnosis; this is not
  evidence that a callback or ordinary message was processed successfully.
- Migration `20260916194807_offerpsp_intake_observability.sql` applied to
  `iceopurxqzqmwtcmwfzl`. Staff read succeeds; authenticated outsider receives 42501.
  No callback tokens, chat IDs, private pricing, or arbitrary metadata are exposed.
- 26 local intake/keyboard/observability tests pass; build and lint pass.

## Web changes

- `/system-actions`: explicit snapshot per lead, event history, individual checks,
  task deadline, delivery receipt and callback outcomes. Manual refresh, no polling.
- Unknown is not success. No match rows does not mean matching was executed;
  a Telegram receipt does not prove a working keyboard; draft is not sent email.
- Assistant scrolls its transcript after reopening, not the underlying page.
- Removed obsolete once-per-minute worker help text; event-driven execution has
  a 12-hour recovery sweep.

## Production acceptance — 2026-09-16, 19:55 UTC

- Web release commit `b0176ae`, deployment `dpl_7HMxiZ2LN63JxrtzC11XD8yaHTFe`
  is READY, aliased to `https://ops-7q4m2x9k8v3n.vercel.app`. Built on Vercel Linux
  from a clean detached worktree; no macOS prebuilt native dependencies uploaded.
- Authenticated UI shows nine evidence cards, the actual draft receipt, all eight
  screening checks, and the eight-event test history. No stale data shown on load.
- Reopened assistant shows the end of the existing long history; manually scrolling
  up, closing and reopening returns to the end again (visually checked in Brave).
- Telegram executions `548374` and `548375`: first click creates draft 14, second
  returns `replayed: true` and the same ID. Telegram confirmed result messages 972
  and 973; Borys reported seeing the replay response. DB: one consumed action,
  one action event, draft status `draft`, no external send.
- Test cleanup: synthetic intake `34568765-2c28-42ad-9e1a-ab294f5ff132` archived,
  its initial-response task and draft 14 cancelled through existing staff RPCs.
  Final states verified. History retained; no destructive deletion of the lead.

## Scope and remaining audit work

### Readability revision

- Release `a2dbd86`, deployment `dpl_AL8a3qypLGa3A5N1TsKuJDtv9MzU` READY on the
  existing production alias. Presentation only; no schema or workflow changes.
- Single chronological journal; 18px body, 24px primary time, 16px date/labels.
  Current state and expandable attention list precede history. Detailed checks,
  button receipts and raw technical evidence are retained under disclosures.
- Attention links target the same merchant's implemented compliance/tasks/matching/
  communications/preview tabs. Telegram diagnostics open and focus local evidence.
- 31 tests and build/lint passed. Browser visual acceptance for this revision is
  not claimed; user can review the updated existing page.

- This verifies the reply-draft callback and replay, not every other bot command.
- The display is a per-intake read-only evidence snapshot, not global infrastructure
  logs or an automatic repair controller. Missing evidence remains explicit.
- Supabase advisor flags the intentional authenticated SECURITY DEFINER surface;
  the new function additionally checks canonical staff identity and active membership.
  Separate existing notice: leaked-password protection is disabled (not changed here).
