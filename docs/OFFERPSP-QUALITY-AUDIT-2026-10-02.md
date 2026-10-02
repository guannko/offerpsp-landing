# Captain's Bridge quality baseline — 2 October 2026

Status: **PARTIAL for the complete verification programme**. The local regression
baseline passes; this is not certification, a complete penetration test or a
percentage of product readiness. See [verification protocol](OFFERPSP-QUALITY-PROTOCOL.md).

## Environment and reproducible evidence

- Production inspected before this package: `ccf2478b9fd06d3323fbe3a048f7675ae250c87f`.
- Local checkout: `/private/tmp/offerpsp-course-release.YFXeFK/repo`.
- Final local baseline including the portal CSS regression: 08:03:37–08:04:22 UTC.
  `npm run qa:local`: **27 suite groups PASS, 0 FAIL, 0 BLOCKED** using Node 24.19.0.
- Machine report and individual logs:
  `tmp/quality-baseline/2026-10-02T08-03-37-994Z/report.json` (ignored, not public).
- Docker 29.3.1 was available. Initial failures were sandbox socket permissions,
  not absence of Docker. The existing scoped tests ran in ephemeral containers
  with no network and exercised real Postgres concurrency.
- The first baseline found five migrations missing from the validator's explicit
  replay list. After registering them, the full replay with the existing private
  BR-Pay/Antarex source fixtures passes. Commercial fixture contents are not published.

## Findings repaired in this package

| Finding | Result and retest |
| --- | --- |
| P2: read-only AIBot missions show technical identifiers, raw payloads and overstretched status pills as a daily queue | Current/history/test views, human descriptions, collapsed bounded/redacted diagnostics, compact 30 px status pills; actual component tested at desktop and 320 px, keyboard selection works |
| P2: future mail follow-up says to remind now | Date-aware presentation distinguishes future, due and missing/invalid dates; current clock refreshes without additional mail writes or sending |
| P2: muted small text falls below 4.5:1 on paper surfaces | Warm palette retained; muted token changed to `#6c6459`. Calculated contrast is 4.56–5.69 across four scoped paper surfaces; regression checks the actual CSS tokens |
| P2: portal member-request panel inherits a dark background but light-workspace dark heading text | Reproduced on the live QA screenshot; scoped light panel/text/select overrides added locally with CSS regression. Public-site deployment and visual retest still pending |
| P2: migration replay does not cover the latest organizer/document/calendar migrations | Five existing files added to replay inventory; full migration validation passes; no schema migration changed |
| Dependency advisories in three transitive packages | Targeted lockfile updates: ip-address 10.7.3 and brace-expansion 1.1.21/5.0.12. Full npm audit reports zero known advisories at the check; this does not establish absence of all vulnerabilities |
| Fragmented local verification commands | One bounded `qa:local` runner produces per-suite logs and a machine-readable report; it does not call production transports |

The AIBot grouping is presentation-only. Done/skipped/cancelled records are not
deleted. Failed and unknown states remain actionable. A narrow `Тест:` reminder
marker is isolated, not every business description containing the word “test”.

## Fresh live checks

| Area | Evidence | Status |
| --- | --- | --- |
| Staff gateway and core dependencies | Staff-authorized health response; Supabase/mail/Telegram/n8n gateway reachable | VERIFIED liveness; previous transport receipt timestamps are historical |
| n8n connector | Health API succeeds; reported MCP version 2.91.0 | VERIFIED connector, actual n8n server version not reported |
| New organizer/document/calendar RPCs | Ten live public functions have empty search path, explicit staff guards, no anon EXECUTE | VERIFIED configuration; not a live hostile-client test of every function |
| Private organizer/document storage | Five private tables deny direct public-role reads; RLS enabled. Original-file bucket is private, 15 MiB, DOCX/PDF only | VERIFIED configuration plus local access regressions |
| Original-file upload | Browser uploaded synthetic DOCX and PDF to the existing QA document. Both rows are ready with Storage receipts; hashes match the synthetic input hashes | VERIFIED |
| Working document preservation | Original first block preserved; extraction appends four separate blocks; save v2, reload and reopen recover all five blocks. The user's other worksheet remains unchanged | VERIFIED |
| Original read / PDF preview | Staff original reads pass application SHA-256 validation. Native PDF preview renders the synthetic page | VERIFIED |
| Browser download completion | DOCX download event and PDF download helper time out; no matching file found in default Downloads | PARTIAL; do not claim a downloaded-file byte comparison |
| Second employee before approval | Verified `bizdev@offerpsp.com` results in `pending_owner`, no active target membership, one company card. Portal explicitly says no access yet | VERIFIED |
| Second employee owner decision | Fresh hello link delivered at 10:45 local; owner entered at 08:29 UTC. Boris approved viewer access at 08:30 UTC. SQL confirms active viewer membership attributed to the owner. Fresh bizdev login opens the same company and survives reload; Boris confirms entry | VERIFIED approval/login/reload; live rejection still untested |
| QA cleanup | Normal status and archive controls in a visible Brave tab restore the QA record to closed/archived. Read-only SQL confirms both values and exactly one company card; history retained | VERIFIED |
| Invalid sign-in link | User-visible callback contains otp_expired but the live portal shows a blank login form without explaining the refusal. Fresh hello and bizdev links work. Local callback presentation fix and startup regression pass; full npm validate exits 0 | VERIFIED cause and local fix; public deployment/visual retest pending |
| MerchantPayd canonical supplier | Exact staff search returns no provider/offer record; existing Merchant Bridge is a different counterparty | PARTIAL J11; no invented record or public buy rate |

QA document: `c49a15bb-eeb3-405b-95ff-3058cb530e0d`.
DOCX SHA-256: `77b2f3b4929aecc0541ca9c738d905e9ca7fcd81ea402b0910b1b0ed1034bcf2`.
PDF SHA-256: `308737580fadc6811fa583a0b955c378c8440927f413626041488e1d24eaf818`.
Only synthetic original files were uploaded. They are not customer-visible.
QA company: `b4b715fd-9f2f-4d88-93dd-3015b823d376`.
Join request: `cdc1c7ff-981e-4ed3-83a2-7237fad494e7`.

Screenshots are saved in the calling task's local visualization directory:
`bridge-docx-pdf-qa-20261002.png`, `bridge-qa-member-pending-20261002.png`,
`bridge-qa-member-approved-20261002.png`, `bridge-qa-archived-20261002.png`.
They contain only the internal synthetic scenario, not authentication links.

## Remaining work, not hidden behind a green build

1. Complete a live negative owner decision. Fresh owner approval, requester
   access/reload and closed/archived cleanup are verified. Local rejection/expiry
   regressions pass but do not replace the remaining live negative journey.
2. Complete download receipt/byte comparison in the real browser. Exact Word
   round-trip, tracked changes, signatures, scanned-PDF OCR and edited DOCX/PDF
   export are not implemented; the interface states these limits.
3. ASVS: record applicability and evidence per relevant L1/L2 control, not only per
   chapter. Live advisors report 188 authenticated SECURITY DEFINER notices and
   40 private/RLS-no-policy INFO items. These are not 188 proven vulnerabilities.
   The ten new functions were checked; the whole legacy set was not re-audited.
4. HTTP root at 07:25 UTC has HSTS but no observed nosniff, frame, referrer or CSP
   headers. Review a scoped transport-hardening package and verify OAuth,
   original-file previews and integrations before enforcing a restrictive CSP.
5. Full WCAG A/AA review: all relevant screens, 200% zoom, assistive technology,
   focus order, error announcements and non-text contrast. Current evidence is
   selected contrast, actual queue keyboard focus and 320 px reflow only.
6. Isolated performance, failure/recovery and backup-restoration drills with
   measured targets. No production load test or intentional outage performed.
7. MerchantPayd needs a canonical partner and a confirmed individual-quote flow.
   Organizer start plan is still unsaved/unlinked. Its case stages are goals, not
   evidence that every business action already executes automatically.

No paid services, SEO/GEO, subagent, Telegram-group or Zoom implementation changes.
No real counterparty emails, commercial publications or destructive cleanup.
Release verification is recorded separately after the exact committed package is
deployed and the primary URL is checked.
Staff Bridge and the public portal are separate deployment targets; a staff-only
deployment cannot be cited as delivery of the portal CSS fix.
