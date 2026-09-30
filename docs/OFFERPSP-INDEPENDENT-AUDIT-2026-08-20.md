# OfferPSP — production audit and remediation

Date: 2026-08-20  
Scope: Captain's Bridge, Supabase lifecycle, SEO/GEO, mailbox polling, matching UX, AIBot memory/model, Vercel runtime

## Executive result

The reported problems were not one restart failure. They were separate defects in state refresh,
queue lifecycle, request duration and list UX. The infrastructure health check was green, while the
application still exposed stale state and one long-running synchronous operation.

## Verified findings and remediation

| Area | Before | Remediation | Status |
|---|---|---|---|
| Captain's Bridge freshness | Core data was cached in memory and normally refreshed only after an explicit action or page reload. | Added Supabase lead events, a 30-second safety refresh and refresh on focus/visibility. | VERIFIED in production |
| SEO/GEO audit | The request waited for the complete SiteOne crawl and AI analysis. A Vercel request could appear frozen or time out. | Audit now creates a run, returns `202 queued` immediately and continues via Vercel `waitUntil`; the UI polls the stored run. | VERIFIED in production: new crawl completed 2026-08-20 |
| Old inbox lead | A lead in `qualifying` remained in Inbox even when its compliance case was already `cleared`. | Cleared qualifying leads are excluded; active review cases remain visible. | VERIFIED in production: Inbox shows 0 pending items |
| PAYOK review queue | PAYOK routes were reviewed, but the parent import job stayed in `review`. | Database trigger closes the import job when no child routes remain in `draft` or `review`; existing completed jobs were backfilled. | VERIFIED in production DB |
| PAYOK published offers | PAYOK still has 22 published and 22 archived routes. This is catalogue state, not an unreviewed queue item. | Published routes were preserved; only the completed review job was closed. | VERIFIED in production DB |
| Multi-selection | Auto-matches and manually filtered routes required clicking every item. | Added select/clear all for matches and select/clear all visible for filtered routes; mobile Inbox received the same visible-selection control. | VERIFIED in production: 8 auto-matches selected and cleared without persistence |
| AIBot context | The workflow retained only 16 local and 8 shared messages. | Increased windows to 30 local and 12 shared messages; the active n8n graph validates with zero errors. | VERIFIED in active n8n workflow |
| Mailbox poller | Vercel logs showed 13 command failures and 5 request timeouts in seven days. A batch could attempt 25 messages serially inside a 60-second function. | Default batch reduced to 10, a 45-second work budget added, and unprocessed messages are deferred to the next run instead of forcing a runtime timeout. | VERIFIED locally; production observation pending |

## AIBot model decision

The current model remains `deepseek-chat`. It was not replaced without a working OpenAI API
credential because that would break Telegram/AIBot production. The recommended target is
`GPT-5.4 mini`: stronger instruction following and long-context behaviour at a still moderate API
price. Conversation continuity must continue to use the shared `BIXOFFPSP` memory and explicit
history windows; changing the model alone does not repair memory.

Status: `PARTIAL` — memory remediation is live; model migration is blocked only by the absent
OpenAI API credential in the available n8n credential store.

## Remaining risks outside this patch

- Supabase advisors report shared-project security debt, including public tables with RLS disabled
  and authenticated access to several security-definer RPCs. These require a separate schema-owner
  review because the project contains non-OfferPSP data and broad automatic changes could break
  other BIX systems.
- Supabase performance advisors report many unindexed foreign keys. Indexes should be prioritized
  using production query evidence rather than applied as a blind bulk change.
- Vercel continues to record a Node `url.parse()` deprecation warning from a dependency. It is noisy
  but was not the cause of the reported UI failures.
- The mailbox fix must be observed over subsequent scheduled runs. No external email or Telegram
  message was sent during this audit.

## Verification gate

Before declaring the production repair complete:

1. lint and production build must pass without warnings;
2. module, integrity, PWA, SiteOne and mailbox tests must pass;
3. the deployment must become `READY`;
4. the live staff UI must show select-all controls and no stale cleared Inbox item;
5. a new SEO/GEO run must be accepted immediately and later reach a terminal stored status;
6. runtime errors must be rechecked after deployment.

## Production verification

- Commit: `f531e27` (`Fix control bridge refresh and review lifecycle`).
- Deployment: `dpl_EsdFfJb28sPgGmuMcMmgvSNxnPbP`, target `production`, state `READY`.
- Alias: `https://ops-7q4m2x9k8v3n.vercel.app`.
- Live Inbox: 0 pending items; the cleared Oura Ring Store record is absent.
- PAYOK intake queue: 0 items requiring a decision and 1 completed import. The published catalogue
  routes remain intentionally available.
- Live matching: both `Select all (8)` and `Select all visible (58)` are rendered. The eight
  auto-matches were selected and cleared; no shortlist was created.
- Live SEO/GEO: a new full audit was accepted immediately, entered the running state and returned to
  ready after a new SiteOne result was stored. Result scores: SEO 10.0, protection 8.5, performance
  10.0, accessibility 9.2, practices 9.5.
- Vercel runtime error clusters after the production verification: none in the selected 30-minute
  window.
