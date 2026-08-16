# OfferPSP — shared project context for Codex and Claude Code

Updated: 2026-08-15

Owner and operator: offerpsp.com (Individual Entrepreneur, Georgia), trading as OfferPSP

Scope: `/Users/borisboris/diskD/N8N/AIBot/offerpsp-landing`

This file is the shared source of project instructions for Codex, Claude Code and other
engineering agents. `CLAUDE.md` is only a loader for this file; do not maintain a second,
diverging copy of the product rules there.

## Working role

Work as a lead product engineer, not as a passive external auditor. Verify facts before making
claims, but continue through safe reversible steps without asking Boris to approve ordinary
technical decisions.

For an audit or diagnostic request, remain read-only unless Boris separately asks for fixes.
Do not create production leads, send messages, publish offers, change statuses, apply migrations
or deploy merely to prove that a control exists.

Use these result labels consistently:

- `VERIFIED` — supported by a live query, actual UI behaviour, log, diff or test.
- `PARTIAL` — implemented, but an important part is absent or not verified.
- `BLOCKED` — verification cannot continue; name the exact dependency.
- `ASSUMPTION` — plausible but unverified.
- `PLACEHOLDER` — visible product UI that promises a capability but has no working operation.
- `DEAD CODE` — unused template or legacy code that is not reachable from production UI.

Never report documentation, a checked task or a local test as proof of production state.

## Product and commercial goal

OfferPSP is a confidential B2B payment-matching, qualification and introduction platform
operated by offerpsp.com. Brain Index may provide IT development support but is not the
operator of the OfferPSP business.

Its end-to-end job is to:

1. attract merchants, PSPs and subagents;
2. collect, preserve and normalize current PSP offers from any practical source;
3. screen incoming leads and prepare complete merchant dossiers;
4. match a merchant request to concrete payment routes;
5. show anonymous client-safe offers without revealing the provider;
6. obtain the PSP's explicit acceptance of the merchant;
7. organize a shared Telegram introduction and Zoom call;
8. record launch, actual processing, commercial result and follow-up;
9. remain a reusable payment workspace rather than a one-time shortlist page.

OfferPSP is not a public PSP directory, an affiliate-link catalogue or a Telegram information
channel. The commercial result is a qualified introduction that reaches real cooperation.

## Non-negotiable confidentiality

- A client must never receive a PSP name, website, internal provider ID, contact, source rate or
  OfferPSP margin before a controlled introduction.
- Provider identity and offer-to-provider mapping are staff-only.
- A client sees a random per-shortlist option code such as `OP-7F31A2C9`.
- Public option codes must not encode or consistently correlate with the provider.
- Client projections expose sanitized snapshots, not joins to private provider tables.
- Hiding data in frontend HTML is insufficient. Enforce separation with grants, RLS, private
  schemas and staff-checking RPCs.
- Staff retains the real provider, contact, source rate, OfferPSP margin and client rate.
- Subagents see their merchants, resale economics and commission ledger, but not confidential
  supply outside their authorized work.

## Supply and pricing model

Do not treat a PSP as one offer.

`Provider -> Rate-card batch/version -> Offer route -> Fee/limit/settlement components`

An offer route describes one atomic commercial block such as:

`GEO + currency + flow + method + traffic + vertical + integration + limits`

Do not use the current values of that block as permanent identity. GEO coverage, rates, limits,
currencies, flow, traffic, card schemes, settlement and every other commercial term may change in
the next partner message. A computed niche/family key is only a similarity hint. A durable route
family is assigned or preserved only after staff confirms which existing atomic route the new
draft replaces. Omitted sibling routes remain untouched.

Several PSPs may compete in the same niche. Providers and offers can be created, edited, paused,
archived, restored and reprioritized without code changes.

- BR-Pay (`brpay.io`) is the primary strategic partner.
- BR-Pay rates normally include the agent margin unless a source explicitly says otherwise.
- Antarex source rates normally exclude the OfferPSP margin.
- Never overwrite the immutable source rate.
- Store separately: provider/base rate, OfferPSP markup, optional subagent markup and client rate.
- Markup supports percentage points, relative percentage, fixed fee and hybrid rules, with
  provider defaults and per-offer overrides.
- Antarex or any individual PSP must never block development of the universal offer tools.

## Offer ingestion and merchant presentation

- Input may be Telegram text, email, pasted text, CSV/Excel, PDF/DOCX, image/OCR, API data or
  manual entry.
- Preserve the immutable original source, metadata and hash.
- Extraction or AI parsing creates only a draft/review item; it never publishes automatically.
- Normalize every source into the same route, fee, limit, settlement and risk fields.
- One source offer remains one offer. If it contains both flows, keep separate labelled `PayIn`
  and `PayOut` sections; never combine their rates or limits into positional strings.
- Merchant output always follows the concise Telegram-message standard, regardless of input.
- Portal, staff preview, bot and copied messages use the same presentation contract.
- RU portal mode produces a Russian offer; EN mode produces an English offer.
- Never infer a missing commercial term. Preserve it as “not specified” and flag it for staff review; parser notes never block an explicit staff publication decision.

Full rules: `docs/OFFERPSP-INGESTION-STANDARD.md`.

## Merchant qualification and PSP approval

Matching an offer does not mean that a PSP accepts the merchant.

Before introduction, the real PSP must receive a structured dossier containing at least:

- company, product/casino URL and contact;
- operating and target GEOs;
- vertical and traffic type;
- licence status, jurisdiction and evidence;
- expected monthly processing volume and currency;
- PayIn/PayOut requirements and methods;
- material risk, settlement and operational information.

A PSP can `accept`, `decline` or `request_more_information`. Do not reveal the PSP or create the
shared Telegram introduction until the PSP explicitly accepts. If it declines, keep its identity
confidential and continue with another suitable route.

## Current product surfaces

These addresses are routing information, not proof that the latest deployment is healthy:

- Public landing: `https://offerpsp.com/`
- Merchant Payment Workspace: `https://offerpsp.com/portal/`
- Staff Captain's Bridge: `https://ops-7q4m2x9k8v3n.vercel.app/`
- Legacy rollback UI: `https://offerpsp.com/admin/`
- Supabase project: `xcizofpejsomjiflesbx`

## Verified handoff — 2026-08-15

- Captain's Bridge is installable from Brave and Chrome as `OfferPSP Captain's Bridge`. The
  production manifest and 192/512/maskable icons return HTTP 200, and Boris visually confirmed the
  browser install control on 2026-08-15. The implementation is commit `d2e27e5`; production
  deployment `dpl_4AKT15LpAzP3sspzR1oGtbyMCMoh` was `READY` and aliased to the staff URL above.
- The installed cockpit remains the live web application, not a separate packaged fork. It has no
  service worker and deliberately does not cache authenticated pages, API responses, Supabase data
  or other private operational content for offline use.
- The protected SEO/GEO workspace runs the packaged SiteOne crawler on demand and reports the
  actual run source and time. A failed or unavailable crawl must be shown as a limitation; never
  replace it silently with an old snapshot or animate a spinner that implies a crawl occurred.
- Public SEO/GEO acquisition pages for iGaming, high-risk payments, cross-border matching, SaaS,
  marketplaces, payment methods by GEO and the PSP-matching process are live from commit `07e3658`.
  The public sitemap, internal links, JSON-LD and `llms.txt` include these routes. Search Console
  submission and current ranking remain external state to verify live rather than infer from code.
- Controlled production E2E on 2026-08-14 confirmed the Titan email delivery path and the Telegram
  gateway. Synthetic verification messages marked `No action required` are transport tests, not
  merchant leads or operator tasks.
- Product decision: do not configure or enable PostHog. Keep first-party acquisition/SEO telemetry;
  do not proxy merchant payment traffic merely to collect analytics. Processing volume and realized
  margin may be obtained from partner reports or PSP APIs when supported.
- The personal Codex plugin `OfferPSP Operator` and the production OfferPSP MCP Gateway are live.
  Codex authenticates through OfferPSP-owned OAuth 2.1 with PKCE and a dedicated encrypted staff
  session; `service_role` remains server-only. The operator is visible in Codex Connections and
  uses the existing protected RPCs, n8n workflow `IRB53X5NAS4wTuyU`, action journal and shared
  `BIXOFFPSP` memory instead of a second AIBot or source of truth.
- MCP reads are immediately staff-authorized. Agent investigation is safe/read-only, external
  messages are draft-only, and bulk changes still require an immutable preview plus a server-issued
  one-time confirmation token. Do not weaken these boundaries when adding future MCP connections.
- Production MCP OAuth, search/fetch, SEO/GEO analytics, memory and AIBot delegation were verified
  on 2026-08-15. Commit `a510c5c` isolates the interactive AIBot credential from email/Telegram;
  deployment `dpl_G5C91rzmjzdTtREuCi6Vr9gJWFEV` is `READY` and aliased to the staff URL. n8n
  execution `364125` completed successfully through the MCP safe-mode path. The operator-confirmed
  Telegram smoke also passed after repairing the same escaped-newline defect in `Prepare Message`:
  retry execution `364179` completed successfully, Telegram accepted the reply and history was saved.

Important n8n workflows to verify by live ID and active version:

- inbound lead form: `ealRZcZzCLKAv6S5`;
- portal message notification: `tqd52vrcJ3gO9Le9`;
- pre-compliance: `wiEFFDaHd3uaJoJi`;
- offer intake queue: `GOhHiyw8pNrBZeHy`;
- offer parser worker: `MLDnePB4WW3jzX4S`;
- outbound Telegram: `yCPozZQX7EoxQf6P`;
- active Titan mailbox poller: `tiEQBHg4iNHCHbQI`;
- legacy IMAP-trigger experiment: `N0GEPhmvvRD4KRhw` — deactivated 2026-08-12; the Titan poller
  above is the only active mailbox-ingest path.
- shared AIBot operating core: `IRB53X5NAS4wTuyU`. It serves both Telegram as the mobile
  management surface and the protected floating assistant in Captain's Bridge. Do not fork its
  business rules into separate Telegram and web prompts; both entries must use the same tools,
  confirmation-token protocol and system instructions.

The staff merchant workspace can explicitly queue a background pre-compliance run with
`queue_offerpsp_pre_compliance_screening(lead_id)`. The UI action is named
`Запустить автопроверку`; it is not the staff clearance decision. Automated screening always
returns the case to manual review. Applicant classification must be based on the applicant's
company/site identity: wording inside a payment request such as “looking for a PSP” describes the
requested service and must never classify the applicant itself as a PSP.

The canonical private PSP provider may be linked to its AIBot research record through
`private.offerpsp_providers.legacy_psp_id`. Captain's Bridge must merge that linked research record
into the canonical provider card instead of displaying two PSP cards. Registry sections are based
on the working lifecycle (`active`, processing/research, inactive, hidden), not on which subsystem
originally created the record. PAYOK remains processing/research until its source and terms are
reviewed and staff explicitly activates it.

The durable project-memory profile for that shared core is `BIXOFFPSP`, not a personal Boris
profile. Telegram and Captain's Bridge write conversation history into the same profile while
preserving their channel/session identifiers. `Project Memory` stores durable decisions, rules,
corrections, preferences and verified actions under stable keys; `Conversation Archive` searches
the stored cross-channel dialogue. Never store credentials, passwords, tokens, full source
offers, temporary test data or unverified assumptions in long-term memory. Memory is context from
the past, not proof of the current database, deployment or workflow state.

Captain's Bridge reaches the shared AIBot only through the staff-protected server function
`platform-v2/api/aibot-command.mjs`. The browser must never receive the internal webhook secret.
The function verifies the Supabase user and active OfferPSP staff role before forwarding a command
with the current page/entity context. Mass mutations remain two-phase and require a server-issued
single-use confirmation token in both interfaces.

### Canonical AIBot tool surface

Verified against the live published n8n graph on 2026-08-12.

Keep these tools in the shared AIBot core: `Search Web`, `Fetch URL`, `Operating Desk`,
`Bulk Operations`, `Save PSP Offer`, `PSP Email Tool`, `Manage Tasks`, `Run Contact Hunter` and
`Send Email Tool`. `Contact Timeline` is the canonical contact-history and outbound-email
preflight tool. `Execution Journal` is the durable `BIXOFFPSP` action notebook for planned,
scheduled, started, completed, failed and cancelled work. `Operating Desk` remains the canonical
interface for cards, statuses, notes, tasks and email drafts. Mass changes must continue to use
`Bulk Operations` preview plus confirmation.

Before preparing, sending or repeating an email, query `Contact Timeline`. Three complete business
days (Monday-Friday) must pass before an ordinary follow-up. A recent send, existing draft, reply,
ambiguous recipient or conflicting history blocks only the external action, not the investigation.
The agent must then inspect the card, timeline, email drafts/history, tasks, execution journal,
project memory and conversation archive; report what it found and why the action is uncertain;
recommend the safest next step; and ask Boris one precise question only when the answer still
cannot be established. An explicit Boris decision may override the cooldown and must be recorded.

Every action the agent promises, schedules or executes must enter `Execution Journal` before work
starts and move through the real lifecycle. Never report an action as completed without verifying
the result and recording the outcome. This journal is the operational notebook; durable memory is
for stable facts and decisions, while contact events remain in `Contact Timeline`.

The following legacy tool nodes remain on the AIBot canvas only for rollback and are disabled:
`Casino DB`, `PSP DB Tool`, `Search Casino Leads`, `Save Email Draft`, `Notion Draft Tool` and
`Pipeline Tool`. Do not reconnect or enable them without a verified migration reason. The active
Email Sender has no Notion dependency.

The following obsolete workflows were deactivated on 2026-08-12 and retained only for rollback:
the old IMAP inbox, Notion Draft Creator, Notion Status Updater, Follow-up Scheduler, Weekly
Report, Email Open Tracker, Deduplication Check, the Google-Sheets Website Scraper, Mention
Monitor and the old direct Casino/PSP DB tools. Do not count their existence as an active product
capability. The old Mention Monitor also contains a legacy credential embedded in node
configuration; keep it disabled and rotate that credential during the next Telegram credential
maintenance.

`PSP | Email Finder` is invoked through its webhook tool path. Its direct Telegram trigger is
disabled so it cannot compete with the shared AIBot for the same Telegram updates. Its Telegram
result nodes remain enabled because webhook-initiated searches still report results to Boris.

Do not assume that a workflow is active merely because it exists.

## Technical map

- Captain's Bridge React/TypeScript frontend: `platform-v2/`
- Merchant portal: `portal/`
- Legacy admin: `admin/`
- Vercel server functions: `api/`
- Supabase migrations and RPC contracts: `supabase/migrations/`
- Portal and regression guards: `scripts/`
- Project status journal: `TASKS.md`
- Architecture: `docs/OFFERPSP-PLATFORM-ARCHITECTURE.md`
- Offer model: `docs/OFFERPSP-OFFER-MODEL.md`
- Ingestion standard: `docs/OFFERPSP-INGESTION-STANDARD.md`
- Previous audits: `docs/*AUDIT*.md`

## Source-of-truth order

Read only what is relevant, in this order:

1. Boris's current request.
2. This file and `/Users/borisboris/diskD/AGENTS.md`.
3. `/Users/borisboris/diskD/BIX-brain/CODEX-PERSONALITY-MAP.md` for the expected working style.
4. Current Git tree, code and configuration.
5. Live production UI, Supabase, n8n active versions and Vercel deployment.
6. Relevant migrations, tests and architecture documents.
7. `TASKS.md` and old audits as leads to verify, not as current truth.

`TASKS.md` contains chronological sections and some stale unchecked items. A later verified result
may supersede an earlier checkbox. Resolve contradictions against code and live state.

## Independent audit protocol

When Boris asks for an independent audit, do not begin by fixing the product. Produce an
evidence-backed outside-and-inside assessment.

### 1. Establish the actual release

- Read Git status, branch, HEAD, remotes and uncommitted changes.
- Identify the production Vercel project, deployment SHA and aliases.
- Confirm that local code, GitHub and production correspond; report divergence.
- Run the relevant build, lint and regression guards without rewriting user files.

### 2. Audit from the outside

Use an authenticated staff session only for read-only navigation unless Boris authorizes mutation.
Inspect every visible Captain's Bridge module:

- Command Center;
- Inbox;
- Pipeline;
- Merchants and the complete merchant workspace;
- PSP workspace;
- Offers, filters, intake and review queue;
- Pre-Compliance PRO;
- Deal Desk;
- AIBot research base;
- Communications;
- Tasks and calendar;
- Subagents;
- Analytics;
- Integrations.

Also inspect the public landing and merchant portal in RU and EN. Check desktop and mobile widths.

For every visible button or action determine one of:

- performs the promised operation;
- navigates to a working next step;
- is intentionally read-only and clearly labelled;
- is disabled for a valid visible reason;
- is a `PLACEHOLDER` or misleading control.

Empty data is not proof of a placeholder. Distinguish an empty but connected module from a module
with no underlying operation.

### 3. Audit from the inside

- Trace each enabled page to its component, RPC/API call and data source.
- Find visible buttons without handlers, hard-coded counters, demo fixtures and generic template
  pages reachable in production.
- Separate reachable product code from unused TailAdmin/legacy `DEAD CODE`.
- Inspect feature flags and direct URLs for hidden modules that remain reachable.
- Verify CRUD/lifecycle coverage for merchants, PSPs, offers, contacts, dossiers, tasks and agents.
- Verify that client-safe projections cannot expose provider identity, source rates or margins.
- Check RLS, grants, `SECURITY DEFINER` functions, storage buckets and anonymous/authenticated
  boundaries relevant to OfferPSP.
- Inspect live n8n published graphs, recent executions, failures, retries and credential use.
- Do not expose credential values in the report or command output.

### 4. Audit complete business journeys

Assess whether the system supports these journeys, not merely their screens:

1. external lead -> compliance -> qualification -> matching;
2. source rate card -> immutable source -> normalized draft -> review -> publish;
3. staff selection -> client-safe shortlist -> client decision;
4. merchant dossier -> PSP review -> more information/accept/decline;
5. accepted review -> Telegram -> Zoom -> live/lost result;
6. returning merchant -> new payment request;
7. subagent -> merchant attribution -> resale rate -> commission ledger;
8. inbound/outbound email and Telegram -> merchant history -> follow-up task.

### 5. Required audit output

Create `docs/OFFERPSP-INDEPENDENT-AUDIT-YYYY-MM-DD.md` containing:

- executive verdict: what can be used for real work today;
- production release evidence;
- module matrix: `VERIFIED / PARTIAL / PLACEHOLDER / BLOCKED`;
- exact list of visible decorative or dead controls;
- missing end-to-end functions and business impact;
- security and confidentiality findings;
- data/model inconsistencies and stale fixtures;
- UX issues observed from outside;
- prioritized `P0 / P1 / P2` remediation plan;
- evidence for every material claim.

Do not update `TASKS.md`, production, migrations or deployments during an independent audit unless
Boris separately asks to implement the findings.

## Known boundaries that must be re-verified

These are audit leads, not guaranteed current facts:

- incoming mailbox messages are polled every minute through n8n → protected Vercel API → Titan IMAP
  → protected Supabase Edge Function → service-only RPC. Supported binary attachments are stored in
  private Storage and require explicit staff assignment before entering the review-only offer parser;
- outbound Telegram has historically lacked unified inbound replies and retry/outbox handling;
- Inbox has historically lacked triage filters, bulk actions and inline assignment;
- Pipeline has historically been a read-only projection rather than an editable Kanban;
- standalone `/matching` has been hidden by a feature flag while matching lives in merchant flow;
- analytics has historically lacked attribution, stage timing, realized volume and margin;
- the controlled authenticated subagent membership/co-brand journey is verified; external mailbox
  delivery and visual approval will be checked with the first consenting real partner;
- rate-card history has lacked a field-by-field visual version diff;
- calendar has lacked recurrence, reminders, external sync and automatic Zoom creation;
- old TailAdmin/demo components and legacy screens may remain as unreachable dead code;
- the retired third-party token is absent from active n8n/source/Git state, and n8n retains no old
  workflow version or execution artifact from which a provider credential can be identified.

Verify every item independently and report when it has already been resolved.

## Verification commands

Use the actual package manager and existing scripts. Current useful checks include:

```bash
npm --prefix platform-v2 run lint
npm --prefix platform-v2 run build
npm run validate
```

Before any future production change, also verify Git status, exact migration state, Supabase access
boundaries, n8n published versions and the Vercel deployment. Treat parser anomalies and missing
extracted fields as non-blocking staff review notes. Publication remains an explicit staff decision
based on the source document; never mutate production only to make an audit report look complete.

## Research references

- PSP discovery: `https://www.aboutpayments.com/en-us/provider-selector`
- Client workflow/task-list UX: `https://design-system.service.gov.uk/components/task-list/`

The GOV.UK page is a workflow reference, not a PSP directory.
