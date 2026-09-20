# Astra handoff: Antarex offer replacement and new-merchant Telegram autopilot

Date: 2026-09-16  
Owner: Borys Kononenko  
Required model/effort: Astra High  
Project: OfferPSP

> Historical handoff. Do not use this file as the current production checklist. The verified
> state and remaining work are maintained in `TASKS.md`; live code, database and deployments take
> precedence over the facts recorded below.

## Outcome

Complete two production tasks in this order:

1. Replace every old Antarex offer with the 22 new source blocks supplied by Borys and set the
   Antarex OfferPSP markup to `0%` because the new client rates already contain the `+0.4%` margin.
2. Turn the passive new-lead Telegram notification into an operator autopilot that performs safe
   standard preparation automatically and exposes deterministic, journalled actions as Telegram
   inline buttons.

Do not mix this work with the public website concierge. The public concierge is not the bot Borys
is referring to here.

## Mandatory startup

1. Read the workspace and project `AGENTS.md`, the project `TASKS.md`, and the
   `offerpsp-operator` skill.
2. Inspect actual live state before changing anything. Historical documents are context, not
   proof of production state.
3. Check the local repository for unrelated changes and preserve them.
4. Use `VERIFIED`, `PARTIAL`, `BLOCKED` and `ASSUMPTION` accurately.

## Current verified facts

- Dedicated production Supabase project: `offerpsp-production`
  (`iceopurxqzqmwtcmwfzl`).
- Supabase organization `guannko` is currently on the `pro` plan; verified through the live
  Supabase organization API on 2026-09-16.
- Production inbound workflow: `ealRZcZzCLKAv6S5`, `📥 OfferPSP | Inbound Lead Form`, active.
- Shared Telegram/Captain's Bridge AIBot workflow: `IRB53X5NAS4wTuyU`, active.
- Latest inspected inbound execution: `536822`, success, 2026-09-15. All 12 expected nodes ran.
- The current inbound flow already:
  - validates and saves the lead;
  - creates an instant private client workspace;
  - generates a login link;
  - emails workspace access to the merchant;
  - notifies Borys by email and Telegram.
- The current Telegram notification is plain text. It does not start screening, completeness
  analysis, operator tasks, reminders or callback actions.
- `TASKS.md` contains the approved planned scope under `New-merchant Telegram autopilot`.
- The OfferPSP Operator OAuth refresh was failing with `invalid_grant` in the prior session. Borys
  must reconnect the OfferPSP Operator in Codex Connections before its MCP tools can be used.
  Do not bypass its staff OAuth or silently substitute direct database access.

## Task A: replace Antarex offers

### Source

Read the full source file:

`/Users/borisboris/.codex/attachments/68ac694c-18bd-4585-bdcc-ccf662bbee04/pasted-text.txt`

It contains 22 commercial blocks:

1. EUR FTD Worldwide
2. EUR E-commerce Worldwide STD
3. Poland BLIK FTD + STD
4. Apple Pay / Google Pay EUR
5. AUD STD
6. EU OCT payouts
7. Argentina Mercado Pago FTD/STD
8. Russia C2C / SBP
9. Netherlands iDEAL STD
10. India P2P/P2C
11. Turkey bank issuance, 6.9% pay-in route
12. Turkey bank issuance, 6.4% pay-in route
13. Russia–Kyrgyzstan mobile-commerce cross-border route
14. RUB cross-border route
15. Uzbekistan UZS E-commerce Humo
16. Uzbekistan UZS P2P
17. Azerbaijan AZN Quasi E-commerce
18. Azerbaijan AZN P2P
19. Kyrgyzstan KGS P2P
20. Kazakhstan KZT P2P cross-border / Kaspi
21. South Korea Bank Transfer P2P
22. South Korea Account Transfer

### Commercial rules

- The `+0.4%` OfferPSP margin is already included in every supplied client rate.
- Set the Antarex provider/default OfferPSP markup to exactly `0%`.
- Do not add another `0.4%` at provider, batch, offer or presentation level.
- Preserve source terms and source rates immutably.
- Keep the two Turkey blocks as two separate routes; they have different pay-in rates and limits.
- Keep PayIn and PayOut terms explicitly labelled and separate within an offer. Never collapse
  their fees or limits into positional strings.
- Decode HTML entities and normalize decimal commas/spaces for structured numeric fields, while
  retaining the original supplied text/hash as the immutable source.
- Do not invent missing integration, settlement, licence, traffic or reserve terms. Store them as
  unspecified and flag them for staff review.
- One source block remains one offer route. Do not merge siblings merely because they share GEO or
  currency.

### Required operation sequence

1. Reconnect OfferPSP Operator if required.
2. Use OfferPSP Operator `search` and `fetch` to resolve the exact canonical Antarex provider and
   read all current Antarex offers and pricing defaults.
3. Confirm which records are old Antarex offers. Do not select by a guessed or similar provider
   name.
4. Build the normalized 22-route payload against the current production schema.
5. Call `prepare_bulk_operation` for one atomic plan containing:
   - archive/remove the exact current old Antarex offer records;
   - insert the 22 new routes;
   - set the Antarex markup to `0%`;
   - preserve the immutable source batch and provenance.
6. Show Borys the server-issued immutable preview: exact provider, old-offer count/IDs, new-offer
   count, markup before/after, warnings and confirmation token.
7. Stop. Do not call `confirm_bulk_operation` until Borys explicitly confirms that exact preview.
8. After confirmation, execute once with the issued token.
9. Fresh-read Antarex and verify:
   - old offers are no longer active;
   - exactly 22 intended new source routes exist;
   - markup is `0%` and client rates are not double-marked up;
   - both Turkey routes and all PayIn/PayOut components survived;
   - the action journal contains the bulk operation.

If Operator authentication is unavailable or the bulk capability cannot express the required
atomic change, report `BLOCKED`. Do not work around it with raw service-role access.

## Task B: new-merchant Telegram autopilot

### Product rule

Telegram is the operator control surface, not merely a notification channel. The lead trigger must
perform safe standard preparation and then present Borys with an actionable lead card.

Do not implement literal browser clicking. Each Telegram button must call the same protected
server action/API/RPC used by Captain's Bridge. UI text changes must not break the automation.

### Automatic actions for every valid non-spam lead

Run these after the lead is saved and before the actionable Telegram card is sent:

1. Idempotent duplicate detection using company, domain, email and known identities.
2. Lightweight company/site check:
   - site availability and canonical domain;
   - stated company/product identity;
   - actual vertical and target market evidence;
   - visible licensing claims and source URLs;
   - obvious contradictions or missing critical information.
3. Dossier completeness calculation against the OfferPSP merchant qualification contract.
4. Evidence-backed enrichment of empty fields only. Never overwrite user input silently and never
   infer a licence, volume, risk decision or approval status.
5. Internal quality/risk summary, missing-information checklist and proposed next action.
6. Internal matching preview where enough verified input exists. Provider identity remains
   staff-only; no offer or PSP is sent to the merchant automatically.
7. Create/update one operator task with a response SLA and idempotent reminders. Do not create a
   new duplicate task on retries.

Use existing protected functions and tools where available, especially the current workspace,
matching, task and `queue_offerpsp_pre_compliance_screening(lead_id)` paths. Do not duplicate
business rules in n8n Code nodes if the canonical server action already exists.

### Telegram lead card

The card must contain at least:

- company, contact and canonical domain;
- vertical, GEO and volume if supplied or verified;
- duplicate result;
- completeness/quality result;
- concise risk/contradiction flags;
- missing-information checklist;
- workspace status and internal match count;
- lead ID and direct Captain's Bridge link;
- current task/SLA status.

Provide deterministic inline actions:

- `Open merchant`
- `Run deep screening`
- `Inspect internal matching`
- `Prepare missing-data request`
- `Prepare reply`
- `Set follow-up reminder`

Optional terminal actions such as reject/archive may be included only behind a second explicit
confirmation.

### Action safety

- Read-only inspections and internal preparation may run automatically.
- Any email, Telegram message to the merchant, provider disclosure, merchant rejection, archive
  or irreversible state transition requires Borys's explicit confirmation at action time.
- Drafting a response is not permission to send it.
- Callback payloads must use opaque server tokens or IDs, not raw instructions or untrusted text.
- Enforce staff authorization, lead ownership/scope and allowed state transitions server-side.
- Every callback must be idempotent and journalled with lead ID, operator identity, requested
  action, result and failure reason.
- Duplicate clicks/retries must return the existing result rather than repeat an external action.
- Never expose Supabase service-role credentials, provider identity, source pricing or OfferPSP
  margin to Telegram messages, browser clients or logs.

### Implementation approach

1. Read active published graphs, not only drafts, for both n8n workflows.
2. Inspect existing Captain's Bridge APIs/RPCs and Telegram callback routing before adding nodes.
3. Prefer extending one protected post-intake orchestration endpoint and the existing shared AIBot
   callback router over adding many privileged HTTP calls directly in n8n.
4. Keep public/client projections separate from staff-private provider and margin data.
5. If schema changes are required, create a reviewed migration, preserve RLS/private-schema
   boundaries and run Supabase advisors.
6. Update n8n as a draft first, validate the workflow, inspect the diff/version, and only publish
   the active version after the implementation is reviewed and tests pass.

### Required tests

- valid complete merchant;
- valid but incomplete merchant;
- duplicate merchant/retried webhook;
- spam lead;
- unavailable or contradictory website;
- screening downstream failure;
- internal matching with zero and multiple results;
- callback double-click/replay;
- unauthorized callback;
- failed Telegram notification;
- draft preparation without send;
- confirmed external action executes once only.

Use synthetic `No action required` data for controlled tests. Do not send a production email or
Telegram message to any real merchant as part of testing without explicit Borys approval.

## Verification and handoff

The task is not complete because code exists or n8n validates. Report completion only after:

1. code/migration diff reviewed;
2. relevant unit/integration tests pass;
3. Supabase RLS/advisors are clean for changed objects;
4. n8n draft validates with no new errors and active/draft differences are understood;
5. controlled callback replay proves idempotency;
6. a controlled end-to-end synthetic lead produces one enriched dossier, one task and one
   actionable Telegram card;
7. Borys confirms the Telegram card is useful;
8. production state is fresh-read and action journal entries are present.

Finish with a compact `VERIFIED`/`PARTIAL`/`BLOCKED` report and list any operator actions still
requiring Borys.
