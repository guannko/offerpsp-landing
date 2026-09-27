# OfferPSP Captain's Bridge — independent imitation audit

Date: 2026-09-27  
Scope: staff Captain's Bridge at `https://ops-7q4m2x9k8v3n.vercel.app/`  
Mode: read-only production inspection, source review and local verification  
Source revision inspected: `717ffb41ab118544aef20723ea5c66311ec6abfe`

## Executive verdict

`PARTIAL`: Captain's Bridge is predominantly a real operational product, not a mock-up. The
staff UI reads live OfferPSP data, its principal registries and workspaces are backed by Supabase,
and the active OfferPSP n8n workers exist. The audit found no evidence that the whole cockpit, its
PSP catalogue, offers, lead registry, compliance queue or SEO/GEO workspace is simulated.

The product is **not yet imitation-free**. Four P1 classes remain:

1. the sidebar always claims that production is working, without consulting live health;
2. every sent email is automatically treated as an expected partner reply, even when the message
   is only a receipt or does not ask a question;
3. historical QA/E2E records are still visible on ordinary staff screens;
4. several real journeys have working parts but no fresh complete production E2E evidence, so
   their UI must not imply more certainty than the evidence supports.

No P0 data-loss, confidentiality leak or completely fake primary module was confirmed during this
audit. No production mutation was made.

## What counts as an imitation

For this audit, an imitation is any ordinary production UI that does one of the following:

- shows a hard-coded healthy/live state rather than observed system state;
- presents synthetic or QA data as normal operational data;
- assigns a business status that asserts an external fact without evidence;
- offers a visible control or module that promises an unavailable operation.

The following are **not** imitations when labelled honestly:

- an empty but connected module;
- a manual workflow;
- a shadow or optional integration;
- a disabled feature hidden from navigation and redirected away from a dead screen;
- a service with a working internal substitute clearly shown in the UI.

## Production evidence

### Deployment

- `VERIFIED`: Vercel deployment `dpl_8WuUdwzSHNECAzeJjmouhXhsKvUs` is `READY` and serves the
  production alias.
- `PARTIAL`: the deployment source is recorded as `cli` without Git source metadata. The exact
  deployed commit cannot be proven from Vercel. Local and live bundle hashes differ, but build-time
  environment values may legitimately change hashes, so this is not proof of code divergence.
- Runtime inspection found only the known dependency `url.parse()` deprecation warning on
  successful responses; no new production 5xx cluster was confirmed in the inspected window.

### Live data and services

- `VERIFIED`: the gateway reports Supabase as the primary active writer.
- `VERIFIED`: staff MCP OAuth is authenticated.
- `VERIFIED`: Supabase, email gateway, Telegram gateway and n8n are reachable and authenticated.
- `PARTIAL`: their health checks do not prove an actual message delivery; the reported
  `delivery_tested` state is false.
- `VERIFIED`: GoRules shadow evaluation and Meilisearch are healthy.
- `VERIFIED`: Vercel Web Analytics is live; the inspected workspace reported 99 visitors and 160
  pageviews.
- `VERIFIED`: Docling, Mem0 and PostHog are intentionally optional/off and the UI identifies the
  active native substitutes. They are not fake missing modules.
- `PARTIAL`: the reserve GCP data plane is not provisioned. The primary data plane is working, but
  a reserve path must not be described as available.

### Active OfferPSP automation

The active n8n inventory includes real workflows for inbound intake, operator intake cards,
screening event ingress, Safe Company Screening v2, offer intake, offer parsing, Titan mailbox
polling, portal message notification, public concierge, SEO/GEO and outbound Telegram.

- `VERIFIED`: recent Safe Company Screening, offer parser, SEO/GEO and Titan mailbox executions
  completed successfully.
- `VERIFIED`: the latest inbound-form error was an intentionally incomplete QA request rejected by
  strict validation. Earlier real submissions completed successfully.
- `PARTIAL`: portal notification, screening ingress, intake queue, Telegram sender and concierge
  had no recent executions in the inspected execution listing. They exist and validate, but this
  audit did not generate external events merely to prove them.

## Production module matrix

| Module | Verdict | Evidence and limitation |
|---|---|---|
| Command centre | `VERIFIED` | Live lead, PSP, route and deal counters; QA filtering is present. |
| Inbox | `VERIFIED` | Two live incomplete leads with owner, state and compliance controls. |
| Pipeline | `VERIFIED` | Live funnel derived from the same lead state; currently two new leads and no later-stage deals. |
| Merchants | `VERIFIED` | 25 retained records, including active and hidden records; opens real 360 workspaces. |
| Casinos | `PARTIAL` | Real registry and filters, but 257 records remain in `processing` and zero are active; lifecycle quality is not established. |
| PSP | `VERIFIED` | 88 retained PSP records; four current working providers with real offer counts. |
| Offers | `PARTIAL` | 88 non-QA routes, 72 published, real editing and ingestion workers; no fresh source-to-publish E2E was created in this audit. |
| Compliance | `PARTIAL` | Real manual-review queue and dossiers; current leads have only 36% and 55% completeness and no fresh full screening journey was run. |
| Deals | `PARTIAL` | Real deal, outcome and follow-up persistence; there are no active deals and Telegram/Zoom coordination is currently recorded manually. |
| Radio Room | `PARTIAL` | Real mail ingestion, messages and sending controls; automatic thread status semantics can falsely assert that a partner reply is expected. |
| Tasks and calendar | `VERIFIED` | Real manual tasks, dates and AIBot mission list; no fake overdue queue was found. |
| Subagents | `PARTIAL` | Real create/edit model, attribution, margin and commission structures, but the production portfolio is empty and no complete partner journey is proven. |
| Analytics | `VERIFIED` | Main funnel and supply metrics use live data and filter registered QA fixtures. SEO attribution still leaks a QA row, noted below. |
| System actions | `PARTIAL` | Real event history exists, but the ordinary selector contains historical E2E/canary entities. |
| SEO/GEO | `PARTIAL` | Live GSC and crawl evidence is shown honestly; live traffic unavailability is disclosed. One QA attribution row is visible in normal analytics. |
| Integrations | `PARTIAL` | Current reachability/auth evidence is real, but saved checks are stale, delivery is untested, and golden QA scenarios remain visible in the ordinary page. |
| Global search | `VERIFIED` | Searches live local entities and falls back to unified/Meilisearch search; registered QA fixtures are filtered. |
| AIBot assistant | `PARTIAL` | Real API and n8n contract exist; no mutating live command was executed during this read-only audit. |

Disabled `Matching`, `Intelligence`, `Finance` and `Settings` entries are not shown in the sidebar.
Direct `/matching` and `/intelligence` navigation redirects to working modules. They therefore are
not visible production imitations.

## Confirmed imitations and misleading states

### P1 — hard-coded production health

The sidebar always renders a green dot and `Production работает`, followed by a claim that Control
Bridge is connected to working data. It does not consume health state:

- `platform-v2/src/layout/AppSidebar.tsx:61`

This is a visible placeholder. A server outage, stale authorization or failed gateway would still
display green.

Required change: bind this component to timestamped aggregate health and support at least
`healthy`, `degraded`, `unavailable` and `unknown`. If health cannot be loaded, show `unknown`, not
green.

### P1 — false `awaiting_reply` semantics

The UI labels `awaiting_reply` as `Ждём ответ партнёра` and explains it as `Последнее письмо
отправили мы`:

- `platform-v2/src/pages/CaptainPages.tsx:27`

The database trigger assigns that state to **every** sent draft and also creates a three-day
follow-up automatically:

- `supabase/migrations/20260901154500_offerpsp_existing_email_draft_send.sql:86-103`
- `supabase/migrations/20260901164843_offerpsp_mail_organizer.sql:379-401`

Those are different facts. Sending an acknowledgement does not mean a response was requested.
This is why the Railon receipt appeared as `Ждём ответ партнёра`, while payabl. required a real
follow-up because David's latest inbound question had not been answered.

Required change: add an explicit response intent such as `response_expected`, controlled by the
outbound draft/operator. Only that intent may create `awaiting_reply` and a follow-up. Receipts and
informational messages remain open/complete or enter a truthful operator-action state. Backfill
current threads from their last message and recorded intent, with ambiguous rows sent to manual
review rather than guessed.

### P1 — QA records visible in ordinary workspaces

The normal System Actions selector still exposes historical rows with names such as `AUTOPILOT
E2E`, `AUTOPILOT TEST`, `SCREENING CANARY`, `BIX Instant Intake E2E` and portal/workspace
regressions. They are retained evidence, but should not be selectable as ordinary operations.

The SEO/GEO attribution table also exposes `internal_e2e / paysiski_full_cycle_20260919 / qa`, even
though the main analytics screen says test records are excluded.

The Integrations page exposes PaySiski/WinPiski under golden/reference scenarios. The card is
correctly labelled synthetic and isolated, so it does not falsify data. It still violates the new
product requirement that ordinary Rubka screens contain no simulations.

Required change: keep immutable QA evidence and golden fixtures in the database, but move them to a
staff-only diagnostics route hidden by default. Apply one canonical QA predicate to System
Actions, SEO attribution, integrations, search and counters. The production QA contract must
remain testable without leaking into normal operator work.

### P1 — untraceable production revision

The current Vercel production deployment has no Git source metadata. This does not make the app
fake, but it makes the displayed production state unauditable: a reviewer cannot prove which commit
is live.

Required change: deploy from an attached Git revision or inject and display a read-only build
manifest containing commit SHA, build time and deployment ID. The manifest must come from the
build pipeline, not a manually typed UI constant.

## Real but not yet fully proven journeys

These are not placeholders. They have database models, UI and/or workers, but this audit did not
perform a fresh complete external run:

1. lead submission → company resolution → screening → matching;
2. source/rate card → immutable source → parsed draft → review → publication;
3. staff selection → client-safe shortlist → client decision;
4. dossier → PSP review → accept/decline/more information;
5. PSP acceptance → Telegram introduction → Zoom → recorded commercial result;
6. returning merchant → additional request;
7. subagent attribution → margin policy → commission ledger;
8. outbound mail/Telegram → confirmed delivery → history → truthful follow-up.

Until each journey has a controlled production E2E receipt, the UI should describe manual and
unverified stages explicitly. An empty connected module is acceptable; invented success is not.

## Dead and legacy code

These items are not reachable in the current production navigation, so they are `DEAD CODE`, not
visible imitations:

- `IntelligencePage` hard-codes an active AI agent, model stack and six nodes while admitting that
  found leads are not persisted (`platform-v2/src/pages/Platform.tsx:1089-1090`).
- `ModulePage` is a generic descriptor that claims operations are connected to existing RPCs
  (`platform-v2/src/pages/Platform.tsx:1132-1145`).
- the exported `OfferUpdateQueuePanel` is an older duplicate; the actual offer UI renders
  `OfferUpdateQueuePanelV4` (`platform-v2/src/pages/Platform.tsx:675`, `929`).

Required change: delete these unreachable prototypes after confirming no external import, or move
their product text to documentation. They must not be casually re-enabled.

## Controls and confidentiality

- `VERIFIED`: the enabled production routes are explicitly wired through the staff gate.
- `VERIFIED`: hidden feature-flag modules are not rendered in navigation.
- `VERIFIED`: source inspection found handlers or links for the visible buttons reviewed; no
  confirmed handlerless ordinary production button was found. Mutating controls were not clicked
  during this audit.
- `VERIFIED`: the integrations UI displays redacted configuration rather than credential values.
- `PARTIAL`: the architecture and existing tests implement client-safe provider hiding, but this
  audit did not create a fresh live client-role shortlist and therefore does not re-certify the
  complete role boundary.

## Build or install an external module?

The confirmed defects should be fixed inside OfferPSP. They are not missing third-party product
categories:

- production-health truth needs a small internal aggregator;
- email follow-up needs a correct business-state contract;
- QA leakage needs canonical filtering and a diagnostics boundary;
- revision provenance belongs in the deployment pipeline.

Installing a CRM, another database, a second automation platform or an external mail centre would
duplicate the existing source of truth and would not fix these defects.

External tools are optional only for clearly bounded capabilities:

- Sentry or Better Stack may improve runtime error and uptime visibility, but cannot be the source
  of business-status truth;
- Zoom and Calendar APIs may automate meeting creation if manual link recording becomes a real
  bottleneck;
- no external matching or PSP catalogue should be installed before proving that the existing
  OfferPSP matching contract is insufficient.

## Prioritized remediation

### P0

No P0 was confirmed.

### P1 — required before claiming an imitation-free Rubka

1. Replace the hard-coded green production footer with observed, timestamped health.
2. Separate `sent` from `response expected`; correct current thread states and add regression tests.
3. Remove QA/canary/golden entities from ordinary System Actions, SEO/GEO and Integrations views;
   keep them in hidden staff diagnostics.
4. Add immutable build/deployment provenance.
5. Run controlled E2E delivery checks for email and Telegram and surface their receipts separately
   from reachability/authentication checks.

### P2

1. Remove unreachable prototype and duplicate UI code.
2. Label Telegram/Zoom steps as manual until provisioning is automated.
3. Run the first controlled end-to-end subagent journey before presenting it as operational.
4. Resolve the `processing` lifecycle of the casino registry.
5. Add explicit `last checked` and stale-state handling anywhere saved health evidence appears.

## Verification performed

- authenticated live navigation across every enabled sidebar module;
- live OfferPSP gateway/system-health read;
- live Vercel deployment inspection;
- live n8n active-workflow and recent-execution inspection;
- static route, feature-flag, button/handler, QA-filter and status-machine review;
- `npm --prefix platform-v2 run lint` — pass;
- `npm --prefix platform-v2 run test:control-integrity` — pass;
- `npm --prefix platform-v2 run build` — pass (698 modules);
- clean worktree revision matched `origin/agent/offerpsp-platform` at audit start (`0/0`).

No lead, email, Telegram message, task, PSP, offer, status, migration or deployment was created or
changed for this audit.
