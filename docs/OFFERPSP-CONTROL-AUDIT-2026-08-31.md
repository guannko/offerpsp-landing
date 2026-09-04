# OfferPSP control audit — 2026-08-31

Status: `VERIFIED` for the checks and remediations listed below. No post-cutover external email or
Telegram message was sent during this audit, so current delivery remains `PARTIAL` rather than
inferred from connectivity.

## Executive verdict

- No open P0 defect was found.
- The public site, merchant cabinet, PSP cabinet, Captain's Bridge, dedicated Supabase project and
  the eleven active OfferPSP/PSP n8n workflows are reachable and structurally healthy.
- The Telegram/Captain's Bridge AI core now runs DeepSeek V4 Pro in low-latency mode. Canonical PSP
  lookup, offer lookup, shared memory and draft preparation passed deterministic safe-mode smokes.
- Partner outreach must not begin until the remaining credential rotation and delivery controls
  below are closed.

## Evidence

### Public site and SEO/GEO

- Production deployment `dpl_CbDNcAcVz4bEEwwbtQr5JpLur4cc` is `READY` and aliased to
  `https://offerpsp.com`.
- Post-release audit run `a28aa715-76c7-429e-82d1-c22bf0417cd3`, technical audit
  `f365e8a5-0c43-41df-9af4-fcb80e6136e8`: 44/44 successful URLs, zero broken URLs, score 9.9.
- Live home HTML contains the new merchant PSP-matching title and H1. The five strengthened
  discovery pages return HTTP 200. The live sitemap records the real 2026-08-31 update date.
- Exact regressions require every visible FAQ question and answer to equal its FAQPage JSON-LD.
  The audit agent's speculative P2 FAQ suggestion is therefore rejected as contradicted evidence.

### Public and private web surfaces

- `/portal/`: HTTP 200, `private, no-store`, `noindex, nofollow`, hardened CSP/security headers.
- `/psp/`: HTTP 200, `private, no-store`, `noindex, nofollow`, separate PSP entry and offer intake.
- Captain's Bridge: HTTP 200; OfferPSP Operator reports an authenticated staff session.
- Root validation/build, Captain's Bridge lint/build and desktop/390 px visual checks pass.

### OfferPSP gateway and modules

- Supabase, email, Telegram and both authenticated n8n gateways are configured, reachable and
  authenticated.
- GoRules shadow evaluation and Meilisearch are healthy.
- Vercel Web Analytics is live. Docling and Mem0 are intentionally off with healthy primary
  substitutes; PostHog is intentionally not used for staff tracking.
- GCP reserve is not provisioned. It remains optional and is not required for the primary runtime.

### Supabase production

- Project `offerpsp-production` (`iceopurxqzqmwtcmwfzl`) is `ACTIVE_HEALTHY`, PostgreSQL 17.
- The last 24-hour sample contained 100/100 successful API responses, 100 informational Auth events,
  normal PostgreSQL service logs and no Edge Function error event.
- Current operational state: 58 published routes, zero published expired routes and zero published
  routes stale by their configured freshness interval.
- Six ingestion jobs are terminal or staff-review state; none is processing or failed. The three
  `review` jobs were processed once with zero blocking anomalies and intentionally await staff review.
- The security advisor reports 151 authenticated `SECURITY DEFINER` warnings. Direct inspection
  found 123 staff-guarded functions, 24 `auth.uid()`-guarded functions, one access helper and three
  wrappers that delegate to guarded functions. This is an advisor limitation, not evidence of 151
  exposed operations. Reference: https://supabase.com/docs/guides/database/database-linter?lint=0029_authenticated_security_definer_function_executable
- RLS-without-policy notices are deny-by-default tables used through guarded RPC/service paths; no
  missing public access requirement was found. Reference:
  https://supabase.com/docs/guides/database/database-linter?lint=0008_rls_enabled_no_policy
- Migration `20260831013000_offerpsp_experience_event_policy_initplan` replaced the per-row
  `current_setting()` evaluation in the anonymous experience-event INSERT policy with an
  initplan-safe scalar subquery. The production performance advisor now reports zero warnings.
  Reference:
  https://supabase.com/docs/guides/database/database-linter?lint=0003_auth_rls_initplan

### n8n production

- API connected; the management client is current at 2.76.0. The built-in instance audit still
  reports the server's 2.36.7 runtime and a 2.36.8 patch. These are different version surfaces and
  must not be merged into one claim.
- All eleven active OfferPSP/PSP workflows validate with zero errors. Ten have zero warnings;
  `PSP | Email Finder` retains three expected warnings from its disabled legacy branch.
- The latest checked executions for Contact Researcher, SEO/GEO Agent, Offer Parser Worker, PSP
  Freshness Reminders, Titan Mailbox Poller and Pre-Compliance all succeeded. No OfferPSP error was
  present in the latest 100 failed executions returned by n8n.
- The public lead webhook immediately enters `Validate and Normalize Lead` and `Spam Check`; its
  unauthenticated trigger is intentional public intake, not an unvalidated administrative webhook.
- All eleven active OfferPSP/PSP workflows route failures to `BIX — Global Error Alerts`. The eight
  missing assignments were added and each updated workflow validates with zero errors.
- The shared active Telegram/Captain's Bridge AI core now uses the same global error workflow. Its
  published graph validates with zero errors and two non-blocking warnings.
- The active AIBot was upgraded from `deepseek-chat` to `deepseek-v4-pro` with thinking disabled for
  bounded latency. Executions `436095`, `436096`, `436098` and `436099` verified canonical PAYOK
  identity, 66 linked offers, `BIXOFFPSP` memory recall and Telegram-draft preparation without an
  outbound send. OpenAI `gpt-5.4-mini` and the previous `gpt-4o-mini` both reached the same account
  rate limit, so the OpenAI credential is not the active production path.
- Migration `20260831010000_aibot_canonical_provider_search` added a dedicated canonical-provider
  action. The agent now distinguishes UUID/provider-code OfferPSP suppliers from integer-ID AIBot
  research cards instead of overloading the ambiguous legacy `status_scope` filter.
- Inactive workflow `PSP | Email Outreach` remains unpublished. Its embedded Groq Authorization
  header was removed and replaced with the existing n8n-managed `Groq account` credential. A repeat
  hardcoded-secret scan no longer flags this workflow; it validates with zero errors.
- The general n8n audit covers 56 workflows from every BIX product. FitBot and unrelated iGaming
  findings are not counted as OfferPSP defects, but sharing one instance increases blast radius and
  makes credential hygiene across projects important.

## Required before PSP partner outreach

### P1

1. Rotate the previously exposed Telegram bot credential in a coordinated maintenance window and
   update all dependent workflow references atomically.
2. Rotate the previously exposed Groq value at the provider before activating `PSP | Email
   Outreach`; moving it into n8n credential storage prevents future embedding but does not revoke
   the already exposed value.
3. Run one controlled internal Telegram reply and one email delivery after the cutover. Gateway
   authentication alone is not delivery proof.

### P2

1. Complete an isolated recovery rehearsal and recover or formally retire the two missing original
   private Storage objects before claiming byte-complete disaster recovery.
2. Review execution-data retention for OfferPSP workflows after real partner volume exists; do not
   erase current audit evidence merely to silence a generic scanner.

## Explicit non-blockers

- The optional paid GCP reserve is not required for current operation.
- Portal and PSP-cabinet `noindex` are correct privacy boundaries.
- Lack of IPv6 is not an SEO or launch blocker on the current Vercel/CDN path.
- Google ranking and traffic changes require observation time; deployment is not proof of growth.
