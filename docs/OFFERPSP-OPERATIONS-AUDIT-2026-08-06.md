# OfferPSP operations, communications and integrations audit

Date: 2026-08-06  
Scope: task manager, calendar, outbound Telegram, integration settings and their production boundaries.

## Executive result

Status: `VERIFIED` for the requested release.

The three previously missing operational capabilities are live in Captain's Bridge. The release did
not alter PSP routes, Antarex margins, merchant shortlists or deal states. Synthetic task data was
removed after the smoke test; the one Telegram delivery record is retained as operational evidence.

## Production evidence

| Layer | Verified result |
|---|---|
| Vercel | Production deployment `dpl_Gnvz47wtTHrpvNdwpcHqViY7mg6h` is `Ready` and aliased to `https://ops-7q4m2x9k8v3n.vercel.app`. |
| Supabase | Migrations `20260806184059 offerpsp_operations_integrations` and `20260806190946 offerpsp_operations_indexes` are applied. |
| Regression | All 49 OfferPSP migrations and the complete route → shortlist → PSP review → Telegram → Zoom → won regression pass in isolated PGlite. |
| Frontend | TypeScript/Vite production build passes. ESLint has 0 errors and 5 existing Fast Refresh warnings. |
| Tasks | Production UI created, updated and deleted one synthetic staff task. Database returned to 4 OfferPSP tasks and 13 read-only AIBot missions. |
| Calendar | Authenticated production UI opened the month calendar; task creation from a date and task editing from an event are wired to the same audited RPC. |
| Settings | Email settings were saved from production UI and its server-side connector check passed. Supabase, n8n, Email and Telegram settings load from the staff-only workspace. |
| Telegram | n8n workflow `yCPozZQX7EoxQf6P` is active and validates with 0 errors/warnings. Production UI delivered Telegram message `411` and recorded it in the private outbound history. |
| Git | Commit `3e9b90e21ee4066ac665e9ae5ffa48d7cc239e70` is pushed to `origin/agent/offerpsp-platform`. |

## Functional audit

### Task manager and calendar

`VERIFIED`

- Staff can create, edit, assign, prioritize, schedule, complete, cancel and remove human tasks.
- Filters cover status, priority and text across task, merchant and assignee.
- Month and list calendar views use task due dates; clicking a day creates a task and clicking an
  event opens the editor.
- Tasks can be linked to an active merchant.
- AIBot missions are visible in their own queue but intentionally read-only. Automated tasks cannot
  be deleted through the staff RPC.
- Every human task mutation is written to the private entity audit log.

### Telegram

`VERIFIED`

- Only an active OfferPSP staff session can call the outbound API.
- The bot token and n8n webhook URL remain server-side; neither is returned to the browser or stored
  in Git.
- Staff can optionally link a message to a merchant, choose a numeric Telegram chat ID and send up
  to 4096 characters.
- Sent and failed attempts are written to private history with external message ID and error text.
- The channel-level and global n8n operational switches are enforced by the sending API.

### Integration controls

`VERIFIED`

- The interface stores only safe operational configuration: channel switches, sender identity,
  reply-to address, default chat ID and notification preferences.
- Supabase, n8n, Email Sender and Telegram expose authenticated server-side availability checks.
- Direct access to private integration settings and Telegram history is denied to `authenticated`,
  `anon` and `public`; access is only through staff-checking RPCs.
- Anonymous RPC execution is revoked. The intentional `SECURITY DEFINER` functions validate
  `is_offerpsp_staff()` before reading or mutating private data and set an explicit search path.
- Foreign-key indexes required by the new private tables are present; the post-migration advisor no
  longer reports unindexed foreign keys for them.

## Remaining limitations

These do not block the requested release, but they are the next sensible improvements.

1. `P1` Calendar events do not yet support recurrence, reminders, drag-to-reschedule, Google
   Calendar synchronization or automatic Zoom creation.
2. `P1` Telegram is outbound from Captain's Bridge. Incoming customer replies are not yet joined
   into merchant conversation threads; the separate AIBot technical log depends on its workflow
   writing `chat_logs`.
3. `P1` Failed Telegram deliveries are logged but there is no retry/outbox queue or idempotency key.
4. `P1` Integration checks prove server configuration availability; they are not scheduled uptime
   monitors with alert history.
5. `P2` The frontend still has five pre-existing Fast Refresh warnings and two application chunks
   above 500 KB. This affects maintainability/cold loading, not correctness of this release.
6. `OUT OF SCOPE` Supabase Security Advisor reports 16 project-wide errors on legacy shared tables
   such as `payments` and Studio ONE `bot_*` tables with RLS disabled. None belongs to the new
   OfferPSP operations tables, but they need a separate cross-project security rollout because the
   database is shared by several products.

## Release decision

`VERIFIED`: the requested task manager/calendar, Telegram sending and safe integration settings are
ready for normal OfferPSP staff use. Antarex draft offers remain independent and are not a release
gate for these tools.
