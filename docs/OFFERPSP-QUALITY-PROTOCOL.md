# OfferPSP quality verification protocol

This protocol makes Captain's Bridge readiness measurable. It combines local regressions,
live role-based journeys and evidence review. Passing a build, receiving HTTP 200 or seeing
one healthy dashboard does not establish operational correctness or standards conformance.
Owner: Boris. Engineering verification started on 2 October 2026.

## Reference frameworks

The following primary sources were checked on 2 October 2026. These are chosen verification
references, not a claim that OfferPSP is certified or already meets every requirement.

| Reference | Use in OfferPSP | Limits |
| --- | --- | --- |
| [ISO/IEC 25010:2023](https://www.iso.org/standard/78176.html) | Product quality objectives and measurable acceptance criteria | Public description consulted; complete normative text not purchased or reproduced |
| [ISO/IEC/IEEE 29119-1:2022](https://www.iso.org/standard/81291.html) | Shared testing concepts; project procedure below records cases, risks, results and evidence | Project procedure is not a formal claim of conformance to all parts of the series |
| [OWASP ASVS 5.0.0](https://github.com/OWASP/ASVS/tree/v5.0.0/5.0) | Target applicable Level 1 and Level 2 security requirements | Individual controls require documented applicability and evidence; chapter coverage alone is not a pass |
| [OWASP WSTG 4.2](https://wstg.owasp.org/v4.2/) | Reproducible manual security techniques | Active attacks and load tests only in an isolated environment |
| [WCAG 2.2](https://www.w3.org/TR/WCAG22/) | Target A/AA keyboard, focus, contrast, scaling and form accessibility | Automated checks alone cannot establish conformance |

ASVS official versioned JSON was inspected, version 5.0.0, SHA-256
`bcdbec214d70abcfad9284a31d4f9e5134305831d628aad3aa85d7e26626cb35`.
Requirements use version-qualified IDs in findings; preserve the referenced version.
The protocol does not reproduce the standard's requirement text.

## Scope and safety

Inspect staff, public intake, merchant portal, MCP, database boundaries, file handling,
mail and shared bot workflows. Preserve the separately-owned subagent, Telegram group
creation and Zoom modules; their implementation is not changed in this programme.
SEO/GEO is reviewed separately and is not silently changed by the operations package.

No paid providers, new subscriptions or unapproved security permissions. No tests that
send to real counterparties, publish commercial offers, change real deals or delete
production evidence. External test messages require a named synthetic recipient and
explicit approval. Fixtures stay labelled and outside working counters. Staff calendar
publication is not email delivery. Matching is not provider acceptance.

## Evidence and severity

Each finding records requirement or journey, release SHA, environment, role, input,
expected and observed result, log/screenshot/query reference, severity and retest.
Result states: VERIFIED, PARTIAL, BLOCKED, NOT TESTED, NOT APPLICABLE with justification.
A prior release's evidence is historical until the same scenario is freshly retested.

- P0: unauthorized sensitive access, irreversible data loss or unintended financial action.
- P1: broken core journey, duplicate external send or disclosure, lost work or impossible recovery.
- P2: misleading queue/status, poor accessibility or material daily-work friction.
- P3: minor visual or maintenance debt without core impact.

## Journey matrix

This is the application-specific inventory, not a substitute for all ASVS controls.
Every row needs positive, negative and interruption/retry evidence where applicable.

| ID | Scenario and acceptance | Automated evidence candidate | Fresh live evidence required |
| --- | --- | --- | --- |
| J01 | Anonymous intake cannot submit email-only; explicit unknown values allowed only where designed | public intake/brief tests | field labels, validation and preserved entered data |
| J02 | New company preserves brief, screens to review, creates one review task | intake and screening tests | labelled test submission and saved dossier |
| J03 | Repeat company submission does not duplicate company, task or notification | identity/concurrency tests | same-company repeat |
| J04 | New employee cannot gain company access without owner/staff approval | company-members and migration tests | two isolated users, approve/reject/expiry |
| J05 | Domain-only or shared staff mailbox does not silently merge unrelated companies | identity-boundary tests | inspect unrelated candidate behaviour |
| J06 | Invalid/recent/unknown website evidence is honestly classified; not automatic clearance | company-screening tests | recorded reasons and next step |
| J07 | Screening timeout/retry leaves durable review state, no false success | queue/recovery tests | isolated worker failure/recovery |
| J08 | Matching omits incomplete/unapproved requests and never implies acceptance | migration and matching tests | staff dossier and shortlist |
| J09 | Source offer preserved; unknown terms remain unknown; no automatic publication | parser/provider-source tests | original, draft, anomalies and review |
| J10 | Client-safe preview hides provider identity, buy rate and markup | portal/migration tests | staff/client projections compared |
| J11 | MerchantPayd quote is individual to merchant/volume; no universal public percentage | implementation pending | one controlled capability-to-quote journey |
| J12 | Received/sent mail appears once; thread history survives reload | mailbox/archive/recovery tests | Spark/Bridge Message-ID and history |
| J13 | Mail waiting/no-answer/future follow-up/closed are explicit and date-aware | next-step and presentation tests | synthetic thread transitions |
| J14 | Sending uses preflight and receipt; uncertain delivery is not blindly retried | delivery/MCP tests | specifically approved transport test |
| J15 | Calendar uses factual timestamps, explicit plans and local day rollover | calendar tests | past/current/future and source links |
| J16 | QA/service/auth/self mail stays outside business queue and counters | fixture/mail-index tests | queue/analytics consistency |
| J17 | AIBot current/history/test separation is read-only and shows understandable descriptions | operations-presentation tests | compact badges, disclosed details and counters |
| J18 | Task editing preserves entity linkage and cancellation is not completion | operational consistency tests | open/cancel editor without writes |
| J19 | Organizer course and next action correspond to actual linked records | organizer tests | homepage focus and context |
| J20 | Universal document save/reopen/version conflict preserves user text | work-document tests | templates, save, reopen, stale-tab conflict |
| J21 | DOCX/PDF originals private; type/size/archive bounds enforced; no overwrite | original/extractor tests | upload, download, reopen and access denial |
| J22 | Format support honestly distinguishes original, working copy and export | document UI/source review | no false Word round-trip/signature promise |
| J23 | MCP arrays/object schemas and one-time bulk previews behave consistently | MCP/OAuth tests | independent client read-only call |
| J24 | Interrupted load/export/upload visibly reports error and supports safe retry | recovery/file tests | isolated disconnect and recovery |

## Security matrix

Evaluate all applicable Level 1/2 controls. The sections below identify surfaces to begin
with; they do not mark an entire ASVS section compliant. Password-only controls may be
not applicable only after verifying that password login remains disabled.

| Surface | ASVS 5.0.0 sections | Required evidence |
| --- | --- | --- |
| Untrusted messages, URLs, HTML and parser input | V1.2, V1.3, V1.5, V2.2 | escaping/sanitization, allowed schemes, malformed input, SSRF boundaries |
| Duplicate sends, approvals, quotes and retries | V2.3 | server-enforced transitions, idempotency, concurrent calls, interrupted writes |
| Browser origin, headers and resource interpretation | V3.2, V3.4, V3.5 | deployed headers/MIME/CSP/CORS review, hostile origin rejection |
| API and MCP entry points | V4.1, V4.2 | auth before processing, content/size limits, safe errors |
| File uploads, private originals and downloads | V5.1–V5.4 | MIME/signature/type/size/decompression limits, storage access, signed-link scope |
| Magic links, staff login and sessions | V6.3, V6.4, V6.6, V6.8, V7.2–V7.5 | expiry, logout/revocation, replay and removed staff |
| Tenant/staff/client authorization and membership | V8.1–V8.4 | anonymous, non-staff, own client, other client, member/admin, removed member |
| Tokens and OAuth | V9.1–V9.2, V10.1–V10.7 | issuer/audience/signature/expiry, PKCE, redirect allowlist, single-use state |
| Secrets, deployments and retained private data | V11–V14 | no client credential leak, HTTPS, dependency/config review, data exposure |
| Logging, failures and recovery | V15–V16 | receipt/audit continuity, safe errors, no logged secrets, recoverable failure |

New SECURITY DEFINER functions require exact grants, empty/fixed search path and their
authorization behaviour tested. Advisor warnings are leads, not proof of vulnerability
or a reason to grant broad access. Do not repeat full historical RPC review merely to
recount unchanged warnings; assess new or changed functions plus risk-relevant paths.

## Accessibility and usability matrix

WCAG checks include 1.4.3 contrast (4.5:1 for ordinary text), 1.4.4 text resize,
1.4.10 reflow, 1.4.11 non-text contrast, 1.4.12 spacing, 2.1.1 keyboard, 2.4.3 focus
order, 2.4.7 visible focus, 2.4.11 unobscured focus, 2.5.8 target size with specified
exceptions, 3.3.1/3.3.2 errors/labels and 4.1.2 names/roles/values. These are initial
high-value checks; all applicable A/AA criteria remain in the full review.

Also measure Boris's actual work, which WCAG alone cannot answer: find who needs a reply,
identify a blocked client and next owner/action, locate agreed terms, compare solutions,
create a reusable note and pick up yesterday's context. Record completion, errors,
clicks and time; proposed target is each routine lookup within one minute without
guessing state. Boris's acceptance remains necessary; a synthetic fixture is not a
usability study. Test desktop, a narrow viewport, 200% zoom, keyboard and a screen reader.

## Running local verification

`npm --prefix platform-v2 run qa:local` runs named existing local suites, full migration
replay and build. It generates ignored per-suite logs and JSON under `tmp/quality-baseline`.
It has no live-send, live-SQL, workflow-update, paid-provider or crawl command.
Review all non-PASS groups; missing dependencies are BLOCKED, not an application pass.
Do not use test-group percentages as product-completeness or standards-compliance scores.

Migration replay needs the original ignored BR-Pay/Antarex fixtures. Copy exact originals
into the ignored `.private/imports` directory; never fabricate replacements or commit them.
PGlite checks are not a substitute for Docker/service concurrency or real Storage/RLS tests.

## Production acceptance and release procedure

1. Freeze scope, exact commit and expected migration/workflow changes. Preserve dirty work.
2. Reproduce and classify defects; patch them with regressions. Complete applicable local tests.
3. Review role boundaries and external effects. Use controlled fixtures and reversible actions.
4. Run protected preview only when necessary; group one production release. Never publish Mac
   native prebuilt output as Linux functions.
5. Verify READY, unique manifest and actual primary alias. Check HTML-to-asset consistency
   after alias propagation; a stale HTML asset can otherwise produce an empty page.
6. Smoke login, homepage, inbox, mail list/full history, PSP/offers, tasks/calendar and documents.
7. Re-test fixed scenarios and compare working counters. Record defects and limitations.
8. Release acceptance requires no open P0/P1 in the released scope, positive and negative
   critical journeys, recovery evidence and no unsupported claims. Broader readiness remains
   PARTIAL if security applicability, accessibility, performance or recovery testing is unfinished.

No final certification, performance guarantee, complete automation claim or "everything works"
verdict until its exact scope and evidence justify it.
