# OfferPSP independent technical audit — SEO/GEO

Date: 2026-08-26
Scope: production `https://ops-7q4m2x9k8v3n.vercel.app/seo-geo`, public `https://offerpsp.com/`, current repository and live n8n state.
Mode: read-only. No audit run, deployment, database write, task creation or production change was made.

## Verdict

`PARTIAL` — the SEO/GEO **audit monitor is alive**, but the claimed growth/promotion contour is not implemented.

- `VERIFIED`: SiteOne executes a real crawl, stores a new technical snapshot and calls a real n8n AI workflow.
- `VERIFIED`: the n8n workflow `ERHcRNqYcuJHh7eL` is active, has six connected nodes and completed eight webhook executions without recorded errors; the latest verified execution was `417415` on 2026-08-25 23:42 UTC.
- `VERIFIED`: public SEO infrastructure is present: 14 sitemap URLs, indexable public pages, canonical URLs, descriptions, JSON-LD, `robots.txt`, `llms.txt`, Brotli and security headers.
- `PLACEHOLDER`: the dashboard does not promote the site. It has no Search Console/Bing Webmaster ingestion, keyword/rank/impression/click monitoring, indexing-status checks, backlink/outreach workflow, content publishing or promotion task execution.
- `VERIFIED`: the displayed Vercel traffic is stale. The only producer found is a one-time SQL seed for 2026-08-11 through 2026-08-14 with two visitors and two pageviews. No recurring Vercel analytics sync exists.
- `VERIFIED`: `Live · <current time>` reports only the current UI/RPC subscription time, not freshness of the traffic or audit data. This is materially misleading.
- `VERIFIED`: SiteOne findings have no lifecycle such as `open`, `resolved`, `regressed`, `intentional` or `false_positive`. The UI displays the latest raw summary without comparing it to prior audits.

The user suspicion is therefore correct in the important sense: **SEO auditing works, SEO promotion does not**. The page currently combines a real crawler with stale acquisition data and an optimistic UI, making the module look more capable and current than it is.

## Production evidence

### Live dashboard

Observed on 2026-08-26:

- UI showed `Live · 26 Aug 09:35`.
- Traffic remained `2 visitors / 2 pageviews` for `11 Aug — 14 Aug`.
- The detailed card disclosed that the traffic snapshot was captured on 2026-08-13 19:54.
- The latest technical audit was 2026-08-26 02:42 and reported 9.4/10.
- Lead attribution contained three business leads, of which one was attributed.

The page refreshes its RPC every 30 seconds and on realtime events, but `lastSyncedAt` is set to the browser's current time after any successful read. See `platform-v2/src/pages/SeoGeoPage.tsx:151-190` and `:251-264`. This verifies connectivity, not data freshness.

### Stale traffic source

`supabase/migrations/20260813113000_offerpsp_seo_geo_analytics.sql:51-79` inserts exactly one Vercel snapshot:

- period: 2026-08-11 to 2026-08-14;
- visitors: 2;
- pageviews: 2;
- country: Cyprus;
- referrer: direct;
- path: `/`.

Repository search found no API, cron or workflow that writes new rows to `offerpsp_growth_analytics_snapshots`. The only scheduled platform jobs are internal search-index sync daily and the SiteOne audit weekly (`platform-v2/vercel.json:18-26`).

`VERIFIED`: the traffic panel is a database-backed historical fixture, not a live Vercel analytics feed.

### Real crawler and AI agent

The production handler does real work:

1. creates an audit run;
2. executes packaged SiteOne;
3. probes `robots.txt`, `llms.txt`, sitemap and structured data;
4. calls the SEO/GEO n8n agent;
5. stores a technical audit and marks the run complete.

Evidence: `platform-v2/api/platform-modules.mjs:137-218`.

The scheduled crawl runs only at `06:00 UTC` on Mondays. It is not automatically tied to a public-site deployment, so a fix may remain represented by the prior audit until the next manual or weekly run.

### Public SEO baseline

`VERIFIED` by direct production reads:

- `robots.txt`: HTTP 200, public crawling allowed, `/admin/`, `/portal/` and `/api/` disallowed.
- `sitemap.xml`: HTTP 200, 14 canonical URLs.
- `llms.txt`: HTTP 200, 2615 bytes, public product and page map present.
- Public acquisition pages return indexable metadata, canonical URLs, descriptions and JSON-LD.
- Production responses include CSP, HSTS, `X-Frame-Options: DENY`, `X-Content-Type-Options: nosniff`, Referrer-Policy and Permissions-Policy.
- The same-run agent evidence recorded `content-encoding: br` for public HTML pages.

`PARTIAL`: public search queries on 2026-08-26 returned the OfferPSP homepage but did not return the tested iGaming, Europe, SaaS or Russian CIS landing pages. This is a real visibility warning, but not definitive Google indexation evidence. Search Console access is required to distinguish “not indexed” from “indexed but not surfaced by the queried engine”.

## Module matrix

| Capability | Status | Evidence | Verdict |
|---|---|---|---|
| SiteOne technical crawl | `VERIFIED` | Fresh production audit and packaged runner | Working |
| SEO/GEO AI interpretation | `VERIFIED` | Active n8n workflow, successful executions | Working, read-only |
| Public crawl readiness | `VERIFIED` | robots, sitemap, llms, canonical, JSON-LD | Working |
| Live acquisition analytics | `PLACEHOLDER` | One SQL-seeded Aug 11–14 snapshot; no updater | Not live |
| Search Console / indexing truth | `BLOCKED` | No connector or implementation in scope | Missing |
| Keyword/rank/impression/click tracking | `PLACEHOLDER` | No implementation found | Missing |
| Promotion executor | `PLACEHOLDER` | No content/outreach/backlink/index-submission workflow | Missing |
| Recommendation → task → fix → recheck | `PLACEHOLDER` | Agent output is rendered only | Missing |
| Issue lifecycle/history comparison | `PLACEHOLDER` | `audit_history` is returned but unused by UI | Missing |
| Freshness truth | `FAILED` | Current sync time presented beside stale data | Misleading |

## Why old system messages remain

There are four separate causes.

### 1. Raw SiteOne warnings are displayed without reconciliation

`platform-v2/api/_lib/siteone-audit.mjs:37-47` copies all SiteOne `CRITICAL`, `WARNING` and `NOTICE` summary rows into the database. The UI renders them directly. There is no check against direct response evidence before display.

In the same 2026-08-26 run:

- SiteOne said 15 pages lacked Brotli;
- direct evidence collected for the AI agent showed `content-encoding: br`;
- SiteOne emitted a 15-page security warning;
- direct evidence showed CSP, HSTS, X-Frame-Options, nosniff, Referrer-Policy and Permissions-Policy.

Those two messages are therefore `FALSE POSITIVE / UNRECONCILED`, not confirmed current defects.

### 2. Intentional states are shown as unresolved findings

The `noindex` notice is expected for the private portal; `portal/index.html:6` explicitly declares `noindex, nofollow`, and robots also disallows `/portal/`. External links and the absence of IPv6 are notices, not promotion blockers.

### 3. Some findings are real and still present

- `VERIFIED`: the homepage duplicates `id="top"` on `<body>` and the hero section (`index.html:1740` and `:1768`).
- `PARTIAL`: SiteOne reports one page without a form label. The public lead form itself is labelled; the exact affected URL is not preserved in the normalized dashboard result, so the page cannot identify the source.
- `VERIFIED`: public raster logos already have an AVIF `<source>`, but the agent inventory still counts PNG fallback images as content raster images. The WebP/AVIF recommendation is therefore at least partly overstated.

### 4. There is no resolved/regressed comparison

The payload includes `audit_history`, but `SeoGeoPage.tsx` never uses it. A new crawl simply replaces the visible “latest” snapshot. There is no module that says:

- passed since previous run;
- still failing;
- newly regressed;
- intentional exception;
- false positive;
- owner and due date.

## Decorative or misleading controls

1. `Live` badge — technically connected, semantically misleading because it does not represent data freshness.
2. `Growth intelligence` — an audit/telemetry page, not a growth or promotion engine.
3. `Read-only · ready` SEO/GEO agent — correct as a read-only analyzer, but it creates no actionable task and performs no promotion.
4. 9.4/10 headline — real SiteOne score, but it visually overwhelms unresolved and false-positive findings and says nothing about indexation or organic discovery.
5. `Visitors / views from Vercel` — database-backed, but not continuously synchronized with Vercel.

## Missing end-to-end proof

No verified E2E exists for:

`deploy public page → submit sitemap/index request → crawler/indexing confirmation → impression/rank → organic visit → attributed lead → closed recommendation`.

Only this shorter chain is verified:

`run SiteOne → store audit → invoke DeepSeek through n8n → render recommendations`.

## Security

`VERIFIED`: the public production headers are substantially stronger than the raw SiteOne “15 security warnings” message implies. No new P0 security defect was confirmed in this focused audit.

`BLOCKED`: direct Supabase advisors/RLS inspection and Vercel deployment metadata were unavailable in the current task because the corresponding MCP tools were not exposed. Staff RPC access and public HTTP behavior were verified instead.

## Priority plan

### P0 — restore truth

1. Implement a real recurring traffic/indexing data pipeline or remove the word `Live` from stale metrics.
2. Separate `data_synced_at`, `traffic_captured_at`, `audit_completed_at` and `agent_generated_at`; show a red stale state after an explicit threshold.
3. Rename the module to “SEO/GEO audit” until actual promotion exists, or implement the missing promotion contour.
4. Add Search Console (and optionally Bing Webmaster) ingestion for index coverage, impressions, clicks, queries and pages. Without it the dashboard cannot answer whether promotion is working.

### P1 — make findings actionable

1. Reconcile SiteOne aggregates against direct probes before showing them as open defects.
2. Store affected URLs and exact check evidence, not only aggregate titles.
3. Add issue lifecycle: `new`, `still_open`, `resolved`, `regressed`, `intentional`, `false_positive`.
4. Use `audit_history` to display diffs and automatically close findings that disappear.
5. Trigger a post-deploy crawl or mark the previous audit stale after a public-site deployment.
6. Convert accepted recommendations into owned tasks and recheck them after completion.

### P2 — improve technical hygiene

1. Remove the duplicate `id="top"`.
2. Identify the exact form-label URL before changing markup.
3. Classify intentional `noindex`, external links and IPv6 absence as informational exceptions.
4. Track sitemap URL indexation separately from SiteOne crawl success.

## Verification performed

- Production desktop UI inspection of the SEO/GEO workspace.
- Direct HTTP reads of the public homepage, robots, sitemap, llms and acquisition pages.
- Public search queries for domain and exact landing-page titles.
- Live n8n workflow structure and execution history inspection.
- Repository tracing from UI to RPC, audit handler, crawler, agent and cron.
- `npm run test:siteone-audit` — passed.
- `npm run lint` — passed.
- `npm run build` — passed.
- Git status checked before and after; existing unrelated changes were preserved and no tracked audit change was introduced beyond this report.

## Implementation follow-up — 2026-08-26

After the read-only audit, Boris authorized the P0 live-data correction.

- `VERIFIED`: current traffic now comes directly from the authenticated Vercel Web Analytics API on every staff-page refresh; the Supabase snapshot is never used as a current-data fallback.
- `VERIFIED`: when Vercel is unavailable or unconfigured, current visitors, views, countries, referrers and paths are cleared and the UI shows an explicit error.
- `VERIFIED`: old traffic snapshots were moved into a collapsed `История SEO/GEO` archive for analytics only.
- `VERIFIED`: Vercel Web Analytics was added to all 14 sitemap pages plus privacy and terms pages. Previously only the homepage was tracked.
- `VERIFIED`: isolated production deployments completed for both `offerpsp.com` and `ops-7q4m2x9k8v3n.vercel.app`; unrelated working-tree changes were excluded.
- `VERIFIED`: the live API returned 39 visitors, 65 pageviews, 11 country rows, 4 referrer rows and 1 path row for the current 30-day period at final verification.
- `VERIFIED`: local unit test, staff lint/build, root validation/build and post-deploy HTTP checks passed.
