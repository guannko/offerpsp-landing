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

## Remaining verification at time of writing

- Web production release and authenticated visual check.
- Actual Telegram callback -> result message, then repeat -> same draft/receipt.
- Keep synthetic intake `34568765-2c28-42ad-9e1a-ab294f5ff132` clearly labelled;
  archive it and cancel any test draft after verification. Never send it externally.
- Supabase advisor flags the intentional authenticated SECURITY DEFINER surface;
  the new function additionally checks canonical staff identity and active membership.
  Separate existing notice: leaked-password protection is disabled (not changed here).
