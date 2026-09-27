# OfferPSP post-release system audit

Date: 2026-09-27  
Scope: Captain's Bridge UI, entity relationships and reversible merge, operational data boundaries,
integrations, n8n recovery, Supabase security posture and production deployment.

> Superseded debt status, 2026-09-28: the six items originally listed in “Remaining non-blocking
> debt” were subsequently closed or classified with production evidence. Build traceability is
> exact, the alleged duplicate sidebar control is absent from the live DOM, all foreign keys are
> covered, the RLS and definer findings are intentional guarded boundaries, the local n8n MCP uses
> `@latest`, and the residual deprecation is inside Vercel's official Node helper. Production Auth
> now enforces secure password change, current-password verification, leaked-password rejection and
> an 8-character minimum; a fresh advisor run no longer reports that warning. GCP reserve is an
> optional paid resilience decision and was not provisioned without cost approval. The detailed
> evidence is recorded at the top of `TASKS.md`.

## Executive result

Status: `VERIFIED` for the released UI, operational relationship workspace, production deployment,
connected gateways and the tested application flows. `PARTIAL` applies only to the complete local
migration validator because the clean worktree intentionally does not contain the ignored private
BR-Pay import fixture.

The release removed the main visual overload without changing business logic, preserved the public
OfferPSP site, and removed QA/E2E/Canary entities from the operational relationship, duplicate and
merge selectors. No production entity merge was executed during this audit.

## Released changes

- PR #10: `https://github.com/guannko/offerpsp-landing/pull/10`
  - merge commit `fe60a1240945483ffb55205080b26422a8b9ef37`;
  - compact sidebar with explicit collapse control;
  - denser header, cards and page spacing;
  - no hover-driven sidebar expansion.
- PR #11: `https://github.com/guannko/offerpsp-landing/pull/11`
  - merge commit `f280cd111777b719c7727c1fb6e1e8900b16b8d3`;
  - QA/E2E/Canary fixtures are filtered from selectable relationship targets, existing relationship
    lists, duplicate candidates and merged-source displays;
  - regression assertions were added to the control-integrity suite.
- Captain's Bridge production deployment:
  - deployment `dpl_EaWNgh9sbXyYv6aknkNixrAXzjsQ`;
  - state `READY`, target `production`;
  - stable staff alias `https://ops-7q4m2x9k8v3n.vercel.app` was explicitly assigned to this
    deployment.

## Production browser verification

`VERIFIED` against the stable staff URL after alias cutover:

- Command centre, Radio Room, PSP registry, merchant workspace, Integrations and SEO/GEO render;
- the sidebar collapses to the compact rail and expands only from the explicit button;
- authenticated staff state survives reload and direct routes;
- Merchant Bridge relationship workspace loads the real entity graph;
- operational relationship targets contain real PSP and company records only;
- the previously visible `BIX Instant Intake E2E`, `OfferPSP E2E Merchant`, `SCREENING CANARY` and
  `PaySiski Test PSP` records are absent;
- Merchant Bridge Advisory and Merchantpayd remain separate records because no exact evidence links
  them;
- browser console inspection found no new application errors during the smoke pass.

`PARTIAL`: a responsive viewport was exercised, but this audit does not claim a complete physical
mobile-device visual certification.

The public `https://offerpsp.com` endpoint was also checked after release and still serves the public
matching landing page rather than Captain's Bridge.

## Application checks

The following checks passed before release:

- `npm run lint`;
- `npm run test:control-integrity`;
- `npm run build`;
- `git diff --check`;
- PDF extractor;
- offer parser: 8 routes, 0 blocking failures;
- provider-source authorization;
- document-processing router;
- mailbox poller;
- Sent archive;
- function storage budget;
- company screening: 89/89;
- intake autopilot: 30/30;
- intake display: 5/5;
- intake observability: 4/4;
- platform modules;
- PWA;
- BIX Reserve foundation;
- SEO audit source matrix.

The complete migration validator passed schema, relationship, reversible-merge and actor-index
checks, then stopped at the missing private file
`.private/imports/brpay-2026-07-23-v3.json`. This is a fixture-availability boundary in the clean
worktree, not a database-schema failure.

## Integration health

Fresh `system_health` at `2026-09-27T20:47:48Z` returned:

- gateway live; Supabase is the active primary writer;
- Supabase reachable, authenticated and delivery-tested;
- email reachable and authenticated with a persisted external delivery receipt;
- Telegram reachable and authenticated with a persisted external delivery receipt;
- both authenticated n8n gateways responded and delivery evidence exists;
- GoRules healthy in shadow mode;
- Meilisearch healthy in active mode;
- Vercel Web Analytics healthy: 102 visitors and 163 pageviews at audit time;
- Docling and Mem0 intentionally disabled with healthy native substitutes;
- PostHog intentionally not used; operational and acquisition analytics are covered by Supabase and
  Vercel;
- MCP staff authorization verified with memory profile `BIXOFFPSP`;
- reserve GCP data plane remains not provisioned.

Fresh runtime logs for `dpl_EaWNgh9sbXyYv6aknkNixrAXzjsQ` contained no 5xx responses. The only
error-level entries were the known Node `url.parse()` deprecation warning on successful HTTP 200
requests.

## n8n and mailbox recovery

- n8n API health responded in the checked range;
- Titan Mailbox Poller had two transient HTTP 500 failures at executions `641820` and `641823`;
- the ten consecutive checked executions `641897` through `641916` completed successfully;
- incomplete intake execution `640726` was intentionally rejected by the strict required-field
  validation and is not a workflow outage;
- FitBot Reminders belongs to the FitBot project and is outside this OfferPSP release.

## Supabase relationship and merge audit

Production state at audit time:

- relationships: 0;
- executed merges: 0;
- prepared merges: 0;
- merged organizations: 0;
- merged providers: 0;
- merge RPCs: 5.

The new merge RPCs are `SECURITY DEFINER`, use a fixed empty `search_path`, deny anonymous execution,
allow authenticated invocation and enforce `public.is_offerpsp_staff()` internally. Private merge
and relationship tables use RLS without browser policies and remain service/RPC controlled.

No merge was executed for testing. The audit verified the contract, guards, preview/token workflow,
restore window and UI behavior without mutating real entities.

## Remaining non-blocking debt

1. The build manifest reports `Версия сборки не подтверждена` for CLI source deployments because the
   Vercel build container does not receive Git metadata. The label is honest, but release
   traceability should later inject the commit SHA explicitly or use the linked Git deployment path.
2. Two sidebar/header controls currently share the same accessible name for expanding or collapsing
   the sidebar. Functionality is correct; unique labels would improve automated and assistive UI
   navigation.
3. Supabase advisors still report legacy debt: 169 authenticated `SECURITY DEFINER` warnings, 79
   unindexed foreign-key notices and 33 RLS-without-policy notices. The new merge RPCs are staff
   guarded and new actor indexes are present; the remaining legacy items require a separate
   classified security/performance audit.
4. The reserve GCP data plane is not provisioned.
5. The local n8n MCP package reports version 2.89.0 with 2.90.0 available. This is tooling maintenance,
   not evidence of a production n8n failure.
6. Replace the remaining dependency-owned `url.parse()` usage when its upstream package supports the
   WHATWG URL API.

## Conclusion

`VERIFIED`: the new relationship and reversible-merge foundation is present, protected and exposed
through a real staff workflow; the compact Captain's Bridge release is live; QA fixtures no longer
pollute operational relationship work; core integrations are reachable and authenticated; and the
latest production runtime has no 5xx cluster.

The remaining items are traceability, accessibility polish and planned legacy hardening. None of
them blocks current OfferPSP operations.
