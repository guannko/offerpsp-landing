# OfferPSP tasks and verified state

Updated: 2026-09-01

This file separates local implementation from local verification and production state.
Code or a passing local test is not evidence that production has been updated.

## Social launch package — 2026-08-31

Status: `VERIFIED` for local preparation and publication of package 1 on LinkedIn and Instagram.

- [x] Reworked `docs/OFFERPSP-SOCIAL-LAUNCH.md` around the current private-matching stage and the
  later transparent-marketplace direction without implying a public PSP catalogue, guaranteed
  approval, existing clients or unverified partner scale.
- [x] Defined LinkedIn founder profile as the initial B2B publishing surface, Instagram as the
  visual/carousel surface and the current `@offerpsp` Telegram account as a direct contact rather
  than a public content channel. X and Threads are reserved but remain excluded from the website
  until their publishing roles are approved.
- [x] Added verified 2026-08-31 social, Vercel and Search Console baseline values with source and
  period, plus tested LinkedIn/Instagram UTM conventions that resolve to social attribution.
- [x] Corrected the 1584×396 LinkedIn cover to the canonical `OfferPSP` / `offerpsp.com` branding
  and rendered a matching PNG outside the left profile-photo overlay zone.
- [x] Prepared final approval drafts for the first three LinkedIn/Instagram publications and a
  six-slide 1080×1350 PNG/SVG carousel for publication 1. XML, renderer syntax, image dimensions
  and social-attribution checks pass.
- [x] Boris approved the exact publication 1 copy, tagged URL and carousel preview on 2026-08-31.
- [x] Published and verified package 1 on 2026-08-31. LinkedIn post:
  `https://www.linkedin.com/feed/update/urn:li:share:7500225994885128192/`. Instagram six-slide
  carousel: `https://www.instagram.com/p/DctfVK8DGKt/`. The approved disclosure wording, LinkedIn
  UTM and Instagram hashtags are present on the live posts.
- [x] Updated the live Instagram business profile display name to `OfferPSP | PSP Matching`, replaced
  the bio with the concise merchant/PSP positioning, added `bizdev@offerpsp.com` as the business
  contact and hid the misleading `Financial Services` category label. The public profile and first
  carousel were rechecked after saving; account recommendations remain enabled and Account Status
  shows green checks for the visible content, reach and feature sections.
- [x] Created and verified the public Threads profile `https://www.threads.com/@offerpsp` with the
  Instagram profile image, display name `OfferPSP | PSP Matching`, canonical short bio and tagged
  website link using `utm_source=threads`. The profile remains empty and is not linked from the site;
  its badge is hidden from the public Instagram profile until Threads has an approved content role.
- [x] Corrected the live LinkedIn founder profile to the canonical `Founder of OfferPSP` headline,
  replaced the unverified-network claim with accurate build-and-verification wording and added the
  tagged founder-profile website URL. The saved edit forms were re-read after submission.
- [ ] Create the separate OfferPSP LinkedIn Company Page after the founder account has enough real
  professional contacts. LinkedIn currently blocks page creation with `insufficient connections`;
  do not bypass this by adding random contacts.
- [x] Created and verified the public X profile `https://x.com/offerpsp` after Boris completed the
  phone/SMS and password steps. Added the OfferPSP square logo, display name
  `OfferPSP | PSP Matching`, canonical short bio and tagged website link. The profile has no posts,
  followers or following and is not linked from the site. Email and phone discoverability are
  disabled. The exact current recovery email remains `PARTIAL`: `bizdev@offerpsp.com` was added and
  confirmed during setup, but a later independent read was blocked by X's password recheck.
- [x] Created, rendered and uploaded the 1500×500 OfferPSP X cover. XML, renderer syntax, image
  dimensions and `git diff --check` pass; the saved live profile was visually rechecked with the
  avatar overlay and the cover copy remains readable.
- [ ] Enable X two-factor authentication with Boris's authenticator app and retain the recovery
  codes. The live security settings show SMS, authenticator app and security key disabled.
- [x] Added and deployed the clean public bio URL `https://offerpsp.com/instagram`. Production
  deployment `dpl_8pBHefXcfhqe1je2YVT9WmYETdti` is `READY`; the short path redirects to the
  canonical Instagram UTM and resolves to the live landing page.
- [x] Replaced the Instagram bio URL with `https://offerpsp.com/instagram`. The authenticated live
  profile displays the clean path; the production redirect preserves canonical Instagram
  attribution.
- [ ] Enable Instagram two-factor authentication with Boris's authenticator app and retain the
  recovery codes. The authenticated security screen confirms that 2FA is not currently configured.
- [x] Prepared package 2 around a matchable merchant brief: final approval drafts for LinkedIn,
  Instagram, X and Threads plus a seven-slide 1080×1350 Instagram PNG/SVG carousel. XML, renderer
  syntax, image dimensions, platform text limits and `git diff --check` pass. Nothing was published.
- [ ] Obtain Boris's approval of the exact package 2 copy and carousel before publishing anywhere.

## Organic acquisition foundation — 2026-08-31

Status: `VERIFIED` for implementation, production delivery and live page checks. Search-position
movement remains an external outcome that must be measured over the following weeks.

- [x] Repositioned the home page around private merchant PSP matching and made iGaming, Forex,
  high-risk and the matching process first-class routes instead of secondary references.
- [x] Strengthened iGaming, Forex, high-risk, crypto and the five regional acquisition pages with
  concrete underwriting and route-decision checkpoints rather than generic SEO filler.
- [x] Added descriptive home-page links to the previously Google-unknown crypto, Latin America,
  Asia-Pacific, Middle East and Africa pages, plus direct regional navigation and accurate
  per-page `dateModified`/sitemap `lastmod` values.
- [x] Added regression checks for the strengthened pages, internal links, metadata and sitemap
  dates. Root validation/build, staff lint/build and desktop/390 px visual checks pass without
  horizontal overflow.
- [x] Published production deployment `dpl_CbDNcAcVz4bEEwwbtQr5JpLur4cc` (`READY`) and aliased it
  to `https://offerpsp.com`. Live HTML contains the new title/H1 and iGaming decision section;
  the five strengthened discovery URLs return HTTP 200 and the live sitemap carries 2026-08-31.
- [x] Completed post-release SEO/GEO audit run `a28aa715-76c7-429e-82d1-c22bf0417cd3` with technical
  audit `f365e8a5-0c43-41df-9af4-fcb80e6136e8`: 44/44 URLs succeeded, zero broken URLs and overall
  score 9.9. The only generated P2 suggestion about incomplete FAQ coverage is contradicted by the
  exact visible-FAQ/FAQPage equality regression and is not treated as an open defect.
- [ ] Measure Google impressions, CTR, positions and indexing after the normal search-engine delay;
  deployment itself is not evidence of traffic or ranking growth.

## Full system control audit — 2026-08-31

Status: `VERIFIED` for read-only production checks. Full evidence and remediation order:
`docs/OFFERPSP-CONTROL-AUDIT-2026-08-31.md`.

- [x] Checked public site, merchant/PSP cabinets, Captain's Bridge, gateway modules, dedicated
  Supabase health/advisors/logs, operational queues and all eleven active OfferPSP/PSP workflows.
- [x] Found no P0 defect. All eleven workflows validate with zero errors; recent scheduled
  OfferPSP executions succeed and no OfferPSP failure appears in the latest 100 n8n errors.
- [x] Replaced the Telegram/Captain's Bridge model with low-latency `deepseek-v4-pro` while
  preserving the BIXOFFPSP memory and tool contract. Executions `436095`, `436096`, `436098` and
  `436099` verified canonical PAYOK lookup, 66 linked offers, memory recall and Telegram-draft
  preparation without an external send. OpenAI comparison executions `436053` and `436060` both
  reached the same account rate limit and were rolled back before the verified DeepSeek cutover.
- [x] Attached `BIX — Global Error Alerts` to the eight previously uncovered active OfferPSP/PSP
  workflows and to the shared Telegram/Captain's Bridge AI core. All eleven profile workflows plus
  the AI core now have the shared error route and validate with zero errors.
- [x] Removed the embedded Groq Authorization header from inactive `PSP | Email Outreach`, attached
  the n8n-managed `Groq account` credential and verified that the hardcoded-secret scan no longer
  flags the workflow. Keep it inactive until the formerly exposed provider key is rotated.
- [x] Applied `20260831013000_offerpsp_experience_event_policy_initplan`; the production Supabase
  performance advisor now reports zero warnings.
- [x] Added canonical-provider action `aibot_n8n_operating_desk_v4` via migration
  `20260831010000_aibot_canonical_provider_search`. The active agent now separates OfferPSP supplier
  UUID/provider-code records from integer-ID AIBot research cards instead of conflating
  `status_scope` semantics.
- [ ] Remaining P1 before partner outreach: rotate the previously exposed Telegram credential and
  Groq provider key, then run one controlled post-cutover Telegram reply and email delivery smoke.
- [ ] Remaining P2: complete the isolated disaster-recovery rehearsal.

## PSP partner discovery — 2026-08-31

Status: `PARTIAL` research only. No candidate was contacted and no new provider record was created.
Initial evidence and ranking: `docs/PSP-PARTNER-PIPELINE-2026-08-31.md`.

- [x] Checked the first six candidates against canonical providers and research PSP cards. Payop
  already exists as `psp_research:19`; Rapyd, Sheepy, INXY, RocketFuel and Paysecure returned no
  OfferPSP match.
- [x] Verified current official partner-program pages and ranked Rapyd, Payop, Sheepy and INXY as
  the first due-diligence group. RocketFuel remains a crypto-specialist second-line candidate;
  Paysecure is an ecosystem/orchestration lead rather than a clean supplier match.
- [ ] Complete legal, licensing, vertical/GEO, settlement, lead-protection and commission due
  diligence before creating or updating partner cards.
- [ ] Do not send applications or outreach until the remaining credential rotation and delivery
  smoke gates in the control audit are closed.

## Technical stabilization and isolated production — 2026-08-27

Status: `VERIFIED` for the dedicated OfferPSP database, role/E2E boundaries, active automation
validation, live SEO/GEO collection and current production releases. Costed reserve provisioning and
two account-level security operations remain explicitly listed below.

- [x] Moved the production OfferPSP runtime to the dedicated Supabase project
  `offerpsp-production`; the public portal and Captain's Bridge read the isolated project. The legacy
  shared project remains available to iGaming/AIBot and was not deleted or rewritten as OfferPSP's
  current source of truth.
- [x] Completed rollback-safe production E2Es for an isolated PSP workspace and for the merchant
  request → matching → shortlist → dossier → PSP review → deal lifecycle. Test records were removed
  after verification; no real offer was published and no external message was sent.
- [x] Applied queue cleanup, authenticated staff-table grant tightening, cached `auth.uid()` RLS
  evaluation and command-specific RLS policies. The dedicated production database now reports zero
  Supabase performance warnings and exactly one authenticated permissive policy per operation on the
  nine previously overlapping OfferPSP tables.
- [x] Reviewed all 150 authenticated `SECURITY DEFINER` OfferPSP/AIBot RPCs in the isolated database.
  Every exposed function has a staff, client, provider, organization or authenticated-user guard;
  worker-only RPCs remain unavailable to ordinary authenticated users. Supabase's newer generic
  `0029` advisor still flags intentionally authenticated `SECURITY DEFINER` RPCs without evaluating
  their internal guards; blanket revocation would break the verified portal contracts.
- [x] Cleared the inactive ingestion queue item and verified no active OfferPSP ingestion, update or
  email-attachment jobs were left stuck. Review-only history remains auditable and is not presented
  as a current queue.
- [x] Validated all eleven active OfferPSP/PSP n8n workflows with zero validation errors. Ten have
  zero warnings; `PSP | Email Finder` has only three expected unreachable-node warnings from its
  deliberately disabled legacy Telegram trigger branch. Its five deprecated `continueOnFail`
  properties were migrated to equivalent modern error handling in the published graph.
- [x] Replaced `PSP | Contact Researcher`'s former public mutation webhook with a durable internal
  daily schedule at 05:20 `Europe/Nicosia`, removed its outbound Telegram node and activated the
  published seven-node workflow. Production now has a `searched_at` queue marker and partial pending
  research index; 77 existing providers are eligible for the first bounded ten-record pass.
- [x] Scheduled worker, freshness, pre-compliance and mailbox executions are succeeding. The affected
  iGaming Task Runner recovered after the legacy Supabase credential repair; its five latest checked
  executions succeeded.
- [x] Removed snapshots from current SEO/GEO traffic. Current visitor/pageview numbers come only from
  live Vercel Web Analytics; historical records are shown only as history and never substitute for
  unavailable current data.
- [x] Upgraded the SiteOne pipeline to preserve exact crawled-page and form-control evidence. The
  latest live crawl reached 9.6 overall, SEO 10, accessibility 10, 31/31 successful URLs, zero broken URLs and no
  unlabeled form control. Brand/UI assets are excluded from content-image recommendations, the
  private noindex portal is excluded from search-snippet advice and verified headers cannot become
  speculative security work.
- [x] Published Captain's Bridge production deployment `dpl_436G6vN7L3eo5A9JaGD6df5rMFfo`
  (`READY`) at `https://ops-7q4m2x9k8v3n.vercel.app`. Public `https://offerpsp.com`, merchant `/portal/`
  and PSP `/psp/` remain separate production surfaces.
- [x] Verified Supabase leaked-password protection is unavailable on the current Free plan. The
  invite-only merchant and PSP cabinets use passwordless magic links, so the unavailable password
  check is not a current authentication gap; revisit it only with a Pro upgrade or password login.
- [ ] Rotate the previously exposed Telegram bot token in a coordinated maintenance window and
  replace it atomically in every dependent workflow/environment. Boris explicitly deferred this
  maintenance on 2026-08-27.
- [ ] Provision the optional GCP reserve only after explicit cost approval (current estimate about
  EUR 205.65/month); the primary runtime and recovery code do not require this paid reserve today,
  and no billing account or reserve infrastructure was enabled.
- [x] Upgraded the shared Northflank n8n runtime from `2.35.7` to `2.36.7` through a controlled
  rollout. Added `/healthz` liveness and `/healthz/readiness` database-readiness probes; the new pod
  is `Running`, both probes pass, the authenticated API responds and the former repeating insights
  persistence error is absent from the new deployment logs.

## Canonical business model and development stages — decision 2026-08-26

Status: `VERIFIED` as a documented founder decision; product delivery remains `PARTIAL`.

- [x] Added `docs/OFFERPSP-BUSINESS-MODEL.md` as the canonical commercial direction and guardrail
  against unrelated feature drift.
- [x] Defined PSP as supplier, OfferPSP as managed catalogue/qualification/application operator and
  merchant as buyer.
- [x] Kept PSP identity confidential during the current supply-building and closed-matching stages.
- [x] Defined transparent named PSP comparison as a later stage after verified critical mass,
  freshness, successful connections and lead-attribution agreements.
- [x] Defined six development stages: private PSP supply, closed matching, critical-mass build,
  transparent catalogue, scalable paid service and future payment operations/orchestration.
- [x] Made technical and logical integrity a mandatory zero gate before growth or PSP disclosure:
  complete role-based E2E, access isolation, honest live state, consistent lifecycles, observability,
  recovery and a stable production period without open P0/P1 defects.
- [x] Prioritized PSP and merchant journeys; subagent expansion remains a later layer.
- [x] Build the invite-only PSP cabinet and verify its text, spreadsheet and PDF offer lifecycle;
  real external PSP onboarding remains the next business rollout step before any catalogue opening.

### Invite-only PSP cabinet — production foundation 2026-08-26

Status: `VERIFIED` for the production foundation and authenticated Telegram-text, XLSX and PDF offer
lifecycles through automated parsing and staff review. Real external PSP onboarding remains the next
business rollout step.

- [x] Added a separate `/psp/` cabinet using invite-only email authentication; self-registration is
  disabled and the existing merchant `/portal/` remains a separate surface.
- [x] Added provider memberships with owner/admin/editor/viewer roles and RPC-only data access.
  PSP users cannot read private tables, foreign PSP workspaces, merchants or OfferPSP margin rules.
- [x] PSP can maintain its company profile, save offer drafts, submit an offer for staff review,
  confirm freshness and immediately pause a published route. PSP cannot publish an offer.
- [x] Replaced the primary manual-offer UX with a Telegram-style source composer. One message may
  contain multiple offers; PSP can also upload private PDF, XLS/XLSX, CSV, DOC/DOCX, text and image
  sources for extraction, queue parsing and staff review. The manual form remains a fallback.
- [x] Added provider-maintained future-catalogue data: detailed company profile, licences, GEOs,
  currencies, methods, integrations, verticals, onboarding/compliance, team contacts and a
  versioned news/update stream. Provider submissions remain private and cannot self-publish.
- [x] The representative mixed RU/EN Telegram source supplied by Boris is a parser fixture. It
  produces six distinct routes, decodes numeric HTML entities, preserves source blocks and never
  enables automatic publication.
- [x] Documented that the later expanded windows/cards belong to the main OfferPSP interface. The
  PSP cabinet is the compact input surface; the future main page must read a separately approved
  public projection rather than private provider tables.
- [x] Added a staff-side `Доступ PSP` tab and extended the staff invite function for provider users.
- [x] Replayed every project migration on a clean PGlite database. The role test verified foreign
  isolation, viewer read-only behaviour, mandatory active owner and `review`-only submission.
- [x] Root validation, staff lint/build, public build and desktop/390 px unauthenticated visual
  checks pass without console errors or horizontal mobile overflow.
- [x] Applied `offerpsp_provider_portal_foundation` and `offerpsp_provider_workspace_content` to the
  production Supabase project. Direct authenticated table access remains denied and provider RPCs
  never publish an offer.
- [x] Deployed `offerpsp-invite-member` version 3 (`ACTIVE`, JWT verification enabled).
- [x] Deployed the consolidated Captain's Bridge production release
  `ops-7q4m2x9k8v3n-3aygjr8ki-annoris.vercel.app` (`READY`) and verified the live provider-source API.
- [x] Deployed public production release `dpl_m1A3Ta4b9aCaCyXjdSTxkJE3H62c` (`READY`) and aliased it
  to `https://offerpsp.com`. Live `/psp/` returns HTTP 200, serves the new source queue client,
  declares `noindex, nofollow`, has no console errors and does not overflow at 390 px.
- [x] Completed an authenticated production E2E with the existing controlled account and a temporary
  isolated PSP. The account received owner-only workspace access, submitted one clearly marked KZT
  test offer through the live Telegram-style form, and the production worker reached `review` on its
  first attempt with one draft route and zero blocking anomalies. Parsed output preserved the raw
  block and produced KZ/KZT, P2P/KASPI, FTD/TRUSTED, IGAMING, API/H2H, PayIn 8.2%, PayOut 2.5%,
  separate PayIn/PayOut limits and USDT T+0 settlement. `publication_allowed=false` and the provider
  had zero published routes throughout the test.
- [x] Removed the exact E2E job, batch, route, membership and temporary provider in one guarded
  transaction after verification. Fresh database counts were zero for every test object, the
  controlled auth user remained intact, and the live cabinet returned to `Доступ не назначен` with
  no browser console errors.
- [x] Created the persistent isolated production workspace `PAYOK E2E TEST 20260826` (`PSP-000014`)
  without changing the real `PAYOK` (`PSP-000012`). Filled its private future-catalogue profile from
  PAYOK public pages, plus one clearly synthetic contact and one private coverage-update draft.
- [x] Completed production XLSX and PDF intake through `/psp/`. The server extracted a real workbook
  and PDF, the five-minute worker processed both on its first attempt, and the final private workspace
  contains three review-only routes: BD/BDT BKASH+NAGAD, ID/IDR QRIS and BR/BRL PIX. Every route keeps
  separate PayIn, PayOut and settlement fees; the workspace has zero published routes.
- [x] Fixed two production defects found by this E2E: `read-excel-file` v9 workbook objects were
  treated as row arrays, and an adjacent spreadsheet note containing `PayIn / PayOut` could relabel a
  leading `PayIn` row as payout. Added the real styled XLSX as a regression fixture and deployed
  Captain release `dpl_8G8VMN6CZa6yrZbhvQyY1cgNbZwS` (`READY`).
- [x] Fixed provider-portal import semantics so a later file/message updates only matching unpublished
  route families and does not archive unrelated PSP GEOs. Staff full-snapshot imports preserve their
  existing whole-card replacement behaviour. Migration `offerpsp_incremental_provider_imports` is
  applied in production, the complete PGlite migration suite passes, and the live PAYOK E2E account
  retains Bangladesh, Brazil and Indonesia simultaneously.

## Portal-native payment request creation — 2026-08-15

Status: `PARTIAL` in production. UI, responsive layout, build, contracts and live asset delivery
are `VERIFIED`; the portal-native intake has not created a synthetic production lead, so its first
full production E2E remains the next real client request or a separately authorized controlled test.

- [x] Replaced every client-portal redirect to the public landing form with one authenticated
  in-workspace request dialog: header action, empty state and request-list add button.
- [x] Reused the existing production n8n intake rather than creating a second lead pipeline. The
  signed-in email is taken from the Supabase session, not from editable browser input.
- [x] After confirmed intake, the portal re-runs the existing lead claim and reloads the workspace
  around the returned lead ID. Failed submission remains in the dialog and cannot masquerade as a
  created task.
- [x] Added RU/EN copy, required-field handling, a stable submission identifier, company/profile
  prefilling and a success toast without navigating away from `/portal/`.
- [x] Restored `iGaming` and `Forex` as explicit verticals in both portal-native and public intake
  forms. Product decision: `Crypto`, `Adult`, `Nutra` and `CBD` remain grouped under `Other` and
  are forbidden as standalone select options by regression guards.
- [x] Desktop and 390 px mobile dialog layouts were visually checked. The mobile dialog scrolls
  internally (`826px` viewport / `1148px` content) and introduces no horizontal page overflow.
- [x] Root production build, portal guards, notification contract and Captain's Bridge control
  regression all pass. Guards reject a future return of `href="/#request"` in the client portal.
- [x] Commit `4b6bbec` is pushed. Production deployment
  `dpl_2PkgVmXB23ShvBcKGAu2q74JYXpU` is `READY` and aliased to `https://offerpsp.com`.
  Live HTML/JS returned the internal dialog, session-bound email, post-intake claim/reload and no
  redirect link; `/portal/` returned HTTP 200 with `private, no-store`.
- [x] The product-corrected vertical list is published from commit `60735cb` in deployment
  `dpl_9gLCeGNyfunLhx7Kwxe76VZkHNXa` (`READY`). Live portal and public HTML expose `iGaming` and
  `Forex`, while `Crypto`, `Adult`, `Nutra` and `CBD` are absent as standalone options.

## Merchant portal workspace redesign — 2026-08-15

Status: `VERIFIED` for the production build, desktop/mobile layout and live release delivery.
Authenticated production visual acceptance remains manual because Codex did not have macOS
Computer Use permission for Boris's existing Brave session.

- [x] Removed the oversized marketing slogan and replaced it with a compact payment-workspace
  header, direct support and new-request actions.
- [x] Rebuilt the empty account as an operational onboarding dashboard: next action, process,
  preparation checklist and working Telegram/email support links.
- [x] Added compact status context and in-page navigation for company, dossier, options and
  messages without changing the existing client-safe data boundaries or request lifecycle.
- [x] Removed the year-long immutable cache policy from the authenticated portal shell; portal
  resources now use `private, no-store` so clients do not remain on a stale workspace release.
- [x] Visually checked the empty state and an active-request state at 1440 px and 390 px. The layout
  remains readable and has no horizontal overflow at the tested mobile width.
- [x] Full root production build and portal/control regression guards pass. Added guards against
  restoring the retired slogan or removing the new operational shell.
- [x] Commits `b1957bc` and `8caeebc` are pushed. Production deployment
  `dpl_EpMbnD8J9g7hYhbbiwgFp6UXLcHp` is `READY` and aliased to `https://offerpsp.com`.
  Live `/portal/` returned HTTP 200 with the new HTML/assets and `private, no-store`.

## OfferPSP Operator MCP and owned OAuth — 2026-08-15

Status: `VERIFIED` for production OAuth, staff authorization, read tools, SEO/GEO, the shared
AIBot safe-mode path and the operator-confirmed Telegram natural-language smoke.

- [x] Installed the personal Codex plugin `OfferPSP Operator`; it remains visible in Connections so
  future OfferPSP MCP connections can be added without involving Brain Index Admin.
- [x] Added OfferPSP-owned OAuth 2.1 with dynamic client registration, PKCE S256, resource/scopes,
  hashed opaque tokens, refresh rotation/replay revocation and an AES-GCM encrypted dedicated staff
  session. Codex never receives `service_role`.
- [x] Applied the production OAuth tables/indexes and the staff-checked search-snapshot wrapper.
  The wrapper is authenticated-only, security-definer with an empty search path and an explicit
  `is_offerpsp_staff()` guard; the underlying service-only function remains private.
- [x] Completed live Codex OAuth and verified MCP health, exact search/fetch, current SiteOne plus
  SEO/GEO agent analytics and shared `BIXOFFPSP` memory against production data.
- [x] Corrected the production AIBot webhook URL, isolated its credential as
  `AIBOT_COMMAND_WEBHOOK_SECRET`, rotated the single Captain Bridge credential and left existing
  Telegram/email gateway credentials unchanged.
- [x] Fixed the literal escaped newline in the live `Prepare Web Response` Code node, published the
  resulting workflow version and restored active state. MCP safe mode returned a full answer with
  `confirmation_required=false`; n8n execution `364125` finished `success`.
- [x] Local `test:mcp`, bridge contract tests, lint, TypeScript and Vite production build pass.
  Commits `3978e6c`, `d59b48c`, `db7c45d` and `a510c5c` are pushed. Production deployment
  `dpl_G5C91rzmjzdTtREuCi6Vr9gJWFEV` is `READY` and aliased to the Captain's Bridge URL.
- [x] Sent one controlled Telegram prompt asking for MCP health/modes without mutations. The first
  run exposed and led to the repair of the same escaped-newline defect in `Prepare Message`;
  retry execution `364179` finished `success`, `Send to Telegram` succeeded, Telegram accepted the
  reply and `Save to chat_logs` completed.

### ChatGPT custom GPT adapter — 2026-08-15

Status: `PARTIAL`. The confidential OAuth connection and live read-only action call are `VERIFIED`;
the `OfferPSP Operator` draft still needs to be created with private visibility and smoke-tested in
a fresh chat before the ChatGPT surface is complete.

- [x] Added the production GPT Actions adapter over the existing OfferPSP MCP tools: 17 OpenAPI
  actions for search, entity/history reads, matching, SEO/GEO, BIXOFFPSP/AIBot, tasks, notes,
  draft preparation, health and two-phase bulk operations. The adapter does not expose
  `service_role`; write scopes and existing server confirmation rules remain enforced.
- [x] Added confidential OAuth-client support for ChatGPT Actions while retaining public PKCE for
  Codex MCP. The ChatGPT action token is resource-bound to `/actions`, and its client secret is
  stored hashed in server metadata.
- [x] Corrected the OpenAPI response/component schemas for the strict GPT Builder validator.
  `test:mcp`, OAuth tests, lint and production build pass. Commits `874cd61` and `f109e41` are
  pushed; production deployment `dpl_8Sn8ZEHPJdGoUDcCZ6E58yvyjPVR` is `READY` and aliased to the
  Captain's Bridge URL.
- [x] Authorized the actual callback generated by GPT Builder and completed OAuth. A live
  `system_health` action at `2026-08-15 20:13:35 UTC` verified MCP Gateway, Supabase, both n8n
  gateways, BIXOFFPSP/AIBot infrastructure, email and Telegram diagnostics without a real send or
  mutation. GoRules and Meilisearch also reported healthy; optional disabled modules were not
  misreported as failures.
- [ ] Create the GPT with `Only me` visibility and repeat a read-only health/search smoke in a new
  ChatGPT conversation.

## Emergency recovery and sale-ready package — 2026-08-13

Status: `VERIFIED` for archive integrity, exact production workflow capture, sanitized distribution
content and clean source build. Full isolated disaster recovery remains `PARTIAL` until a separate
Supabase/n8n/Vercel environment is restored and exercised end to end.

- [x] Captured the complete Git history and refs, exact HEAD source archive and the preserved
  uncommitted worktree patch without changing the existing user edit.
- [x] Exported the exact active versions of 17 production n8n workflows plus 14 inactive legacy
  workflows for rollback/history. Added a credential-placement inventory without secret values.
- [x] Captured 90 Supabase migrations, live schema/security catalogs, two Edge Functions, relevant
  Auth identity mapping, 66 application tables with 2,278 rows and generated restore SQL.
- [x] Captured Vercel project, deployment, protection and local-link metadata for the public portal
  and Captain's Bridge; platform secret values remain in their native stores.
- [x] Built a separate sale-ready package with full application and workflow logic, no production
  data, personal identifiers, production IDs or credentials. All workflows start inactive.
- [x] Verified checksums, Git bundle integrity, 17/17 active workflow coverage and zero secret-scan
  violations in the sale package. A clean install, root validation and Captain's Bridge production
  build pass.
- [ ] Recover two original private Storage source objects that ordinary staff/client sessions could
  not download. Their metadata and all parsed database results are present.
- [ ] Perform one full isolated restore rehearsal and certify the lead intake, matching, merchant
  portal, Telegram agent, Titan email and Captain's Bridge paths before claiming byte-complete
  disaster recovery.

Private artifacts are intentionally stored under `.private/recovery-packs/` and must never be
committed. Reproducible tooling and runbooks live in `recovery/sale-pack/`.

## AIBot contact history and execution notebook — 2026-08-12

Status: `VERIFIED` at the production database, published n8n graph and migration-regression levels.

- [x] Added one canonical contact timeline for merchants, PSPs, casinos and subagents. Existing
  email, task, lead-activity, research and audit history was backfilled into 94 timestamped events;
  new events are captured automatically by database triggers.
- [x] Added an outbound-email preflight with a three-complete-business-day Monday-Friday cooldown.
  Monday to Wednesday remains a duplicate; Thursday is the first ordinary repeat date. Friday to
  Tuesday remains a duplicate; Wednesday is the first ordinary repeat date.
- [x] A duplicate, conflicting history or unresolved recipient blocks only the external send. The
  published agent must continue investigating the card, timeline, mail, tasks, journal and memory,
  explain the uncertainty and ask Boris one precise question only if the answer remains unknown.
- [x] Added the private `BIXOFFPSP` execution journal with `planned`, `in_progress`, `completed`,
  `failed` and `cancelled` states, scheduling, entity links, result/error fields and idempotency.
  A controlled production transaction passed `plan -> start -> complete` and was rolled back.
- [x] Both service RPCs are executable by `service_role` only; `anon` and `authenticated` have no
  execution access. Production contains no synthetic journal row after verification.
- [x] The active published AIBot graph contains connected `Contact Timeline` and
  `Execution Journal` tools. Runtime validation reports zero errors; the sole warning remains the
  pre-existing intentionally dynamic `Fetch URL` tool.
- [x] Full local migration replay passes the contact cooldown, journal lifecycle, idempotency and
  service-isolation checks together with all prior OfferPSP migration regressions.

## Durable AIBot memory — 2026-08-12

Status: `VERIFIED` at the production database, published n8n graph, migration-regression and live
surface levels. Natural-language recall passed through both real Telegram and Captain's Bridge on
2026-08-15.

- [x] The shared memory profile is `BIXOFFPSP`; it is used by Telegram and Captain's Bridge rather
  than being tied to a personal Boris profile.
- [x] Existing `chat_logs` were backfilled into `BIXOFFPSP` and now preserve channel and session
  identity. New Telegram and web conversations are saved through the service-role-only v2 RPC.
- [x] Added durable keyed memory for decisions, facts, preferences, corrections, commitments and
  verified actions. Stable keys update an earlier decision instead of creating contradictory copies.
- [x] Added cross-channel context loading plus a full conversation-archive search tool. The agent
  distinguishes remembered history from current facts and must still query the operating database.
- [x] `anon` and `authenticated` cannot execute any of the four memory/history RPCs; only
  `service_role` can use them. Production recall of `system.memory_profile` returned `BIXOFFPSP`.
- [x] The published AIBot workflow contains `Project Memory`, `Conversation Archive`, durable
  context loading and separate Telegram/web history writers. Runtime validation passes with zero
  errors; the only warning is the pre-existing intentionally dynamic `Fetch URL` tool.
- [x] All local migration regressions pass, including cross-channel history, remember/recall,
  archive search, replacement by stable key, cleanup and service-role isolation.
- [x] Production staff MCP memory search and the shared AIBot safe-mode path both recalled
  `BIXOFFPSP` on 2026-08-15. The returned context also contained preserved Telegram and web
  conversation history under the same profile.
- [x] The exact natural-language command (`Как называется общий профиль памяти? Ничего не изменяй.`)
  returned `BIXOFFPSP` in real Telegram and in a fresh Captain's Bridge chat on 2026-08-15. A
  subsequent staff MCP memory read found both exchanges in shared history with distinct
  `telegram` and `web` channel/session identifiers.

## Legacy automation cleanup — 2026-08-12

Status: `VERIFIED` against the published n8n graphs. Cleanup is reversible: obsolete workflows and
nodes were disabled rather than deleted.

- [x] Deactivated 11 superseded workflows: the duplicate IMAP mailbox ingest, two Notion flows,
  Follow-up Scheduler, Weekly Report, Email Open Tracker, Deduplication Check, the old
  Google-Sheets Website Scraper, Mention Monitor and the direct Casino/PSP DB tools.
- [x] Kept `tiEQBHg4iNHCHbQI` as the single active Titan mailbox poller. The duplicate IMAP flow
  `N0GEPhmvvRD4KRhw` is inactive.
- [x] Disabled six legacy tools inside the shared AIBot: `Casino DB`, `PSP DB Tool`,
  `Search Casino Leads`, `Save Email Draft`, `Notion Draft Tool` and `Pipeline Tool`.
- [x] Kept the canonical tools: web search/fetch, Operating Desk, two-phase Bulk Operations,
  offer intake, PSP email research, task management, Contact Hunter and explicit email sending.
- [x] Removed the Notion tracking branch from the active Email Sender. Its published graph is now
  webhook → request parser → Titan SMTP → result, and validates with 0 errors and 0 warnings.
- [x] Disabled the direct Telegram trigger in `PSP | Email Finder`; webhook tool invocation remains
  active, so the finder cannot compete with the main AIBot for Telegram updates.
- [x] Updated the live AIBot canvas instructions so a future operator does not reconnect obsolete
  Notion/direct-database tools. The published AIBot graph validates with 0 errors; its only warning
  is the intentionally dynamic URL accepted by `Fetch URL`.
- [ ] Rotate the Telegram credential that was embedded in the retired Mention Monitor during the
  next planned credential-maintenance window. The workflow is inactive, so this does not block
  current operations.

## Shared AIBot core in Captain's Bridge — 2026-08-12

Status: `VERIFIED` in production through the authenticated staff interface and a live read-only
agent command.

- [x] Captain's Bridge now has a floating AIBot window on every route. Telegram remains the mobile
  management interface; both surfaces call the same active AIBot workflow and the same tool set.
- [x] The web bridge is server-side and staff-protected. It validates the Supabase session and
  `is_offerpsp_staff()` before forwarding the command; the internal webhook secret is not shipped to
  the browser.
- [x] The active workflow `IRB53X5NAS4wTuyU` accepts Telegram and protected web input, passes the
  current page/entity context to the same agent and returns web responses without routing them into
  Telegram.
- [x] Duplicated legacy prompts and transliterated instruction fragments were removed. The workflow
  now has one maintained system prompt; the excessive agent iteration cap was reduced from 200 to
  60 without removing tools or database/history access.
- [x] Mass changes still use the existing server-issued, chat/session-bound two-phase confirmation
  protocol. The floating UI exposes confirmation only when the workflow returns a valid token.
- [x] Frontend lint has 0 errors (7 pre-existing fast-refresh warnings); production TypeScript/Vite
  build passes. Git commit `b08ee28` is pushed to `agent/offerpsp-platform`.
- [x] Production deployment `dpl_3ecHvNuiR2rXsBeYsKb2ctgTVNaa` is `READY` and aliased to
  `https://ops-7q4m2x9k8v3n.vercel.app`. Authenticated UI smoke opened the assistant and the command
  `Покажи первые 3 неархивированных PSP. Ничего не изменяй.` returned BR-Pay, Acquired.com and
  AntrPay from the working database without a mutation.
- [x] Separated canonical OfferPSP providers from legacy research PSP cards with
  `search_canonical_providers` in Operating Desk v4. Canonical UUID/provider-code lookups now use
  `record_state`; the legacy integer-ID research action retains its own `status_scope` semantics.

## Atomic offer replacement and Worldwide coverage — 2026-08-10

Status: `VERIFIED` in production. Migration `20260810001217
offerpsp_atomic_route_replacements` is applied; the matching frontend commit `24278e5` is an
ancestor of production SHA `868fddf41348e326fc05640a635af1b6d47088ba`.

- [x] Worldwide exclusion offers preserve blocked GEOs and split Visa/Mastercard when their limits
  or country rules differ.
- [x] Worldwide allowlist offers preserve separate Visa/Mastercard country lists; English
  `From 1 EUR to 1.700 EUR` normalizes to `1–1700 EUR`.
- [x] All commercial values remain versioned and mutable. The computed family key is only a
  similarity hint; permanent route lineage uses a staff-confirmed UUID.
- [x] New imports cannot silently link or replace a live route. Staff chooses an exact predecessor
  or marks the draft as independent before publication.
- [x] Publishing a confirmed India UPI revision archives only that UPI predecessor. Omitted sibling
  routes such as India P2P remain published.
- [x] A commercially identical partner reconfirmation is not reported as changed merely because its
  review metadata or family UUID differs.
- [x] Atomic replacement migration and matching Captain's Bridge frontend are deployed together;
  production preserves exact route lineage and does not replace omitted sibling routes.

## Persistent merchant company workspace — 2026-08-09

Status: `VERIFIED` in production at the database, authorization and authenticated API levels.
The client document lifecycle has been exercised with ordinary user sessions; the remaining
desktop/mobile visual pass is UX acceptance, not an untested permission or storage path.

- [x] Company identity is now persistent across payment requests: brand and legal names,
  registration, addresses, website, description, licence and staff-controlled verification.
- [x] Request-specific GEO, methods, flows, limits and volume remain in the payment request and are
  explicitly separated from the reusable company profile.
- [x] Staff can create the company workspace before the client's first login; the later email claim
  attaches the client to that same organization instead of creating a duplicate.
- [x] The client portal and staff merchant workspace use the same organization and expose separate
  `Компания` and `Платёжный запрос` sections.
- [x] Added a private 10 MB document vault for licences, corporate/KYB/compliance documents,
  ownership, financial files, processing statements and contracts. Staff can review documents;
  clients see the status and rejection reason but not internal identities or PSP commercial data.
- [x] Production permission checks confirm: `anon` cannot execute company RPCs, authenticated
  clients can access only their organization, staff can manage linked profiles, and the private
  helper is not callable by authenticated users.
- [x] All migration regression scenarios, portal validation, lint and both production builds pass.
  Production deployments: client portal `dpl_5gJo7Q6HJb6M1h42bGfBBkfg2XDc`; staff cockpit
  `dpl_H9iamHu3B853isrSaCEarCn4K6zg`.
- [x] A controlled production client uploaded a private PDF through Storage, registered it through
  the public RPC, staff reviewed it, the same client saw the verified status without internal user
  IDs and archived it. The exact test document remains private and archived for auditability.
- [x] Visually confirmed the document panels on 2026-08-15 at desktop (1440 px) and mobile
  (390 px). Captain's Bridge shows the empty state and document-link form without overflow; the
  client portal exposes the private-vault form and stacks it correctly on mobile. No files were
  uploaded and no records were changed during this read-only pass.

## AIBot Operating Desk pagination — 2026-08-09

Status: `VERIFIED` in production, including real Telegram conversations and card mutations.

- [x] Added service-role-only RPC `aibot_n8n_operating_desk_v2` with `limit`, `page` and `offset`,
  stable ordering, `total_count`, `has_more`, `next_offset` and `previous_offset`.
- [x] The active AIBot workflow `IRB53X5NAS4wTuyU` uses the v2 RPC and explicitly treats
  `следующая десятка` / `next page` as a fresh Operating Desk query with the next page.
- [x] Production SQL checks returned three distinct EU PSP pages of 10 records from 46 total;
  page 1 and page 2 have zero duplicate IDs. BR-Pay published India/UPI offers paginate correctly.
- [x] The new security-definer RPC is not executable by `anon` or `authenticated`; only
  `service_role` has execute permission. The active n8n graph validates with 0 errors.
- [x] Real Telegram pagination smoke returned the first 10 matching EU PSP records and offered the
  next page instead of dumping the complete catalogue.
- [x] Real Telegram card-management E2E found a temporary PSP, moved `contact_status` and
  `provider_status` to `partner`, set `record_state = active`, added a linked note and created a
  linked task for the requested Nicosia time. The authenticated Captain's Bridge read model returned
  the updated entity, note, task and three audit events; no global `bot_tasks` reminder was created.
- [x] The active agent instructions now route linked notes, statuses and tasks through Operating
  Desk, require a post-mutation read and map “переведи PSP в партнёры” to all three status fields.
  The temporary provider, note, task and audit rows were deleted after verification; zero test
  artifacts remain.
- [x] Bulk PSP/casino mutations now use a chat-bound two-phase protocol: a service-role-only RPC
  resolves an explicit filter, stores an immutable preview and issues a single-use UUID valid for
  ten minutes. Confirmation is restricted to the originating Telegram chat, is idempotent and
  cannot silently change the target set; cancellation is supported.
- [x] The active Telegram agent uses the one-call `Bulk Operations` tool instead of relying on a
  smaller model to perform separate search and prepare calls. A hard output guard blocks any
  confirmation request that lacks a server-issued UUID and the workflow validates with 0 errors.
- [x] Real Telegram bulk E2E found exactly two temporary PSP cards, showed their unchanged status
  in the server preview, executed only after Boris confirmed, updated both cards and wrote exactly
  one audit event per card. The confirmation, audit rows and both temporary providers were then
  deleted; production contains zero artifacts from this test.

## Navigation and functional semantics — 2026-08-06

Status: `VERIFIED`. The semantic corrections and the three previously missing operational modules
are deployed in production as `dpl_Gnvz47wtTHrpvNdwpcHqViY7mg6h` and were verified through the
authenticated interface.

- [x] The operational module is now a full `Задачи и календарь` workspace: staff can create, edit,
  assign, filter, schedule, complete and remove human tasks; due dates are shown in month/list
  calendar views; AIBot missions remain deliberately read-only.
- [x] The `Интеграции` workspace now contains safe operational settings and health checks for
  Supabase, n8n, Email Sender and Telegram. Credentials remain in server-side secret storage.
- [x] Distinguish direct health checks from indirect data presence. An empty Telegram journal no
  longer claims that Telegram is broken, and n8n data presence is not presented as a live health
  check.
- [x] Correct the inbox, merchant, communications and agent-ledger copy so each screen describes
  only the data and actions it actually exposes.
- [x] Authenticated production smoke covered Command Center, Inbox, Pipeline, Merchants, PSP,
  Offers, Lead Intelligence, Deals, AIBot research, Communications, Tasks, Subagents, Analytics
  and Integration Status. Their navigation labels now match the visible function.
- [x] Outbound Telegram is available from Communications: staff selects a merchant optionally,
  enters a chat ID and sends through a protected n8n gateway. Delivery status and external message
  ID are recorded in a private staff-only history.
- [x] Production UI smoke created, updated and removed a task, opened the calendar, saved Email
  settings, ran an integration health check and sent Telegram message `411` through the interface.
- [x] Production database keeps 4 OfferPSP tasks, 13 AIBot missions, 4 safe integration settings and
  1 Telegram delivery record after synthetic task cleanup. Anonymous RPC execution and direct
  authenticated access to private settings/history remain denied.

## Universal offer operations — 2026-08-06

Status: `VERIFIED`. The provider-independent database workflow and cockpit controls are deployed
and verified with an authenticated production smoke test.

- [x] Antarex and every other incomplete PSP are outside the critical path. Draft/review routes do
  not block publication, pause, revision or matching of unrelated offers.
- [x] The catalog has a provider-independent `+ Новый оффер` flow: select any active PSP, create a
  normalized draft and continue directly in the full rate/limit/settlement editor.
- [x] A single validated offer can be published without superseding or archiving unrelated live
  routes from the same PSP. Publishing a revision archives only its previous live version.
- [x] Every editable offer can be copied; published/paused offers produce a separate editable
  revision, preserving the live version until the replacement is published.
- [x] Existing controls remain generic: edit, pause, resume, archive, margin versions, source intake
  from Telegram/email/admin text/PDF/DOCX/XLSX/images and the review/error/duplicate queue.
- [x] Production migration `offerpsp_individual_offer_publication` is applied. Staff execution is
  allowed, anonymous execution is denied; the current 12 published and 24 unpublished routes were
  unchanged by the rollout.
- [x] All 46 migrations and the full regression suite pass in isolated PGlite, including explicit
  proof that individual publication and revision do not mutate neighbouring live routes.
- [x] Production deployment `dpl_4ky5LKB7bbNtQZLVzHg4pCzgih8n` is `READY` on the private cockpit
  domain. Authenticated desktop smoke confirmed the global create form, BR-Pay pause/revision
  controls and Antarex publish/copy/archive controls without creating a synthetic production offer.

## Production black-box audit — 2026-08-06

Status: `PARTIAL`. Full report: `docs/OFFERPSP-ADMIN-BLACKBOX-AUDIT-2026-08-06.md`.
The production P0 recheck below supersedes the initial findings recorded earlier on the same date.

- [x] `P0` Restore the Captain's Bridge outbound email environment and replace decorative
  integration statuses with authenticated configuration health. A production message sent from the
  communications UI completed through n8n execution `321084` and is stored as `sent`.
- [x] `P0` Repair research-casino creation. The UI and RPC now use the canonical 0–10 score, the
  sequence is synchronized and the generator retries collisions. Production UI created `CAS-0246`
  with score 7, then archived it successfully; the exact synthetic row was removed after verification.
- [x] `P0` Exclude archived shortlists from the merchant's current workspace and next action. MBA now
  shows South Korea, 0 current offers and `v0`; the archived empty legacy `v1` is not selected.
- [x] `P0` Replace raw offer-component enums/free-text fields with typed controls and pre-RPC
  validation for fee type, applies-on, flow, amounts and currencies. Production Antarex editor was
  checked without mutating a real offer.
- [x] `P0` Harden `messages_log`, `email_templates` and `casino_interactions`: RLS is enabled,
  `anon`/`authenticated` direct access is revoked and service-role access remains. The relevant
  Security Advisor errors disappeared; unrelated shared-database findings remain open.
- [x] `P0` The hardcoded external-secret node is absent from the active Email Sender graph and the
  source/Git tree. n8n reports no retained workflow versions and exposes no historical execution
  snapshot containing a revocable credential. The unknown former provider token cannot be identified
  or revoked from retained artifacts; this is recorded as unavailable historical evidence, not an
  active OfferPSP secret.
- [x] `P0` Heavy Captain modules and mail snapshots load only on relevant routes. The shared control
  data now has a bounded 30-second, three-user in-memory cache with explicit force-refresh and
  sign-out/staff-denial eviction; route chunks are lazy-loaded and the production build passes.
- [x] `P1` Replace the old read-only task dump with the production task manager/calendar. The later
  `Navigation and functional semantics` verification above supersedes this original audit item.
- [x] `P1` Inbox now has operational filters, assignment, selection and guarded bulk actions.
  Command Center, Pipeline, Deals and Analytics use the same explicit lifecycle stages instead of
  counting `lost` leads as if they had passed through every successful stage.
- [x] `P1` Raw operational enums and lifecycle values are localized without changing their stored
  machine values. Ten obvious E2E fixtures were archived and removed from active selectors; contact
  lifecycle controls are present in the entity workspaces.
- [x] `P1` Production cockpit deployment `dpl_GtjYM2fxE6kMoaVx9xL6t4heWEQt` is `READY` at
  `https://ops-7q4m2x9k8v3n.vercel.app` on commit `0afdb303e000cb2fbdcb05521be81c47a8e3ec30`.
  The canonical route and all main SPA entry points return HTTP 200 with the new asset; Vercel reports
  no runtime errors after rollout.
- [x] Repeat the P0 black-box scenarios in production: email, research create/archive, merchant state,
  typed offer editor, integration health and database access boundaries all passed on 2026-08-06.

## Pre-Compliance PRO module — 2026-08-06

Status: `VERIFIED` in production. The first real external request is screened and remains locked
until a staff decision.

- [x] A separately entitled `pre_compliance` PRO module has its own navigation, queue and merchant
  workspace rather than being embedded as an unlicensed feature flag.
- [x] Every new request receives a private case, normalized GEO/methods and a high-priority review
  task. The old automatic legacy shortlist trigger is removed.
- [x] Completed automated screening moves to the explicit `manual_review` queue. It cannot remain
  in an ambiguous running state or be reclaimed by the worker before a staff decision.
- [x] Four independent scores cover authenticity, compliance readiness, commercial value and form
  completeness; roles distinguish direct merchants, subagents, PSPs and consultants.
- [x] Database gates block automatic matching, manual shortlist creation and sharing until an
  active staff member records a `cleared` decision. Automated screening can never clear a lead.
- [x] Private evidence, submission signals and immutable decision history are reachable only via
  staff/service RPCs. Raw IP storage is not part of the contract.
- [x] n8n workflow `wiEFFDaHd3uaJoJi` (`OfferPSP | Pre-Compliance PRO`) is active and validates
  with 8 nodes, 7 connections, 0 errors and 0 warnings. Controlled production executions
  `320586` and `320600` completed successfully using the dedicated service-role credential.
- [x] All 45 migrations, security grants and the full offer → shortlist → PSP review → Telegram →
  Zoom → won regression pass in isolated PGlite. Cockpit build passes; lint has no errors.
- [x] Production migrations `offerpsp_pre_compliance_module`,
  `offerpsp_pre_compliance_indexes` and `offerpsp_manual_compliance_review` are applied. Private
  compliance tables deny direct `anon`/`authenticated` access; matching and shortlist creation are
  database-gated by staff clearance.
- [x] Cockpit production deployment `dpl_AtwBXKqAGXCGT1QTmdQWQRvi2tgP` is `READY` at
  `https://ops-7q4m2x9k8v3n.vercel.app`; authenticated queue and merchant-dossier smoke passed.
  Compliance uses a full table only on wide workstations and switches to contained lead cards on
  laptop, tablet and mobile widths; filters scroll independently and dossier actions do not clip.
- [x] The real MBA request is normalized to `KR`, classified as `subagent`, scored
  `100 / 54 / 100 / 64`, and remains in `manual_review` with no staff decision. Its false legacy
  shortlist was archived and matching remains locked.
- [ ] Staff decision for MBA: request represented merchant names/sites, licence per merchant,
  payment methods and PayIn/PayOut requirements before clearance.

### Manual screening and PSP identity consolidation — production delivery 2026-08-13

- [x] Staff can explicitly launch background screening from a merchant workspace. The action is
  labelled `Запустить автопроверку` in both the header and empty dossier and queues the selected lead
  through `queue_offerpsp_pre_compliance_screening` without clearing it automatically.
- [x] Controlled Oura Ring Store execution `349574` completed successfully, classified the applicant
  as `merchant` and saved a `manual_review` case. The n8n classifier now derives PSP identity from
  company/site signals rather than phrases such as “looking for a PSP” in a merchant request.
- [x] The canonical BR-Pay supply provider is linked to and merged with its AIBot research record.
  The production active registry shows one BR-Pay card plus Antarex; the duplicate research card is
  not rendered.
- [x] PSP registry buckets now reflect working lifecycle rather than source subsystem. PAYOK remains
  in `В обработке` as a potential partner until source review and explicit staff activation.
- [x] Migrations `offerpsp_provider_identity_and_manual_screening` and
  `expose_offerpsp_provider_identity_link` are applied. Production Captain's Bridge deployment
  `dpl_F1jmFvNywCDmMghc1EDGqepvLMPq` is `READY` at
  `https://ops-7q4m2x9k8v3n.vercel.app` from commit `23ece2e`.

## Agent operations — 2026-08-06

Status: `VERIFIED` in production at the technical journey level. A controlled authenticated member
was assigned to an agent organization, opened its client-safe co-brand projection and lost access
after membership deactivation and organization archival. Delivery to a future external partner's
mailbox remains a business onboarding event, not missing application logic.

- [x] Staff manages organization members and roles, sends protected email invitations and cannot
  remove the last active owner.
- [x] Agent portfolios support RU/EN merchant search and a bounded request switcher for larger
  managed portfolios.
- [x] Commission accounting supports the guarded lifecycle
  `projected → approved → earned → paid`, voiding of non-terminal entries, audit history and CSV
  statements.
- [x] Agent organizations have staff-managed co-brand settings: enable/disable, display name,
  RU/EN taglines, HTTPS logo, accent colour and support email. The authenticated agent portal uses
  only the client-safe projection and always retains `Powered by OfferPSP`.
- [x] Production migration `offerpsp_agent_cobrand_settings` is applied. The three co-brand RPCs
  deny anonymous access; staff/member/foreign-client isolation and all 42 migrations passed in the
  isolated regression suite.
- [x] Cockpit deployment `dpl_6NYjxkerwNgTNDQgSxUjgJy4ccYe` and public portal deployment
  `dpl_FGTaaGLRbyeK5e2VxboWnQSkGVDU` are `READY` in production.
- [x] Controlled production acceptance verified membership visibility and the enabled co-brand
  projection using an ordinary authenticated member session. The synthetic membership was then
  deactivated and its organization archived; the brand projection became unavailable as required.
- [ ] When the first external subagent agrees to onboard, verify real mailbox delivery and their
  visual branding as normal customer acceptance. Custom white-label domains remain a later product
  decision and are not part of the current co-branded model.

## AIBot security and OfferPSP mail center — 2026-08-05

Status: `VERIFIED` in production for incoming and outgoing mailbox messages. Binary attachment
ingestion from email into the offer parser remains `PARTIAL`.

- [x] Legacy AIBot tables `casino_leads`, `psp_providers`, `bot_tasks`, `chat_logs` and
  `email_drafts` now have RLS enabled; direct `anon`/`authenticated` access is revoked.
- [x] Ten n8n workflows use the dedicated service-role credential and service-only RPCs. Active
  workflows were republished and the casino runtime smoke returned HTTP 200 with 50 rows.
- [x] Existing data remained intact after hardening: 222 casinos, 77 research PSPs and 13 bot tasks.
- [x] The production mail center provides inbox/thread search, unread and follow-up states,
  archive, conversation view, replies and manual links to merchants, casinos and PSPs.
- [x] Incoming messages are grouped into threads and automatically linked by sender email when a
  matching merchant, casino or research PSP exists.
- [x] Production migrations `aibot_n8n_service_rpc`, `aibot_legacy_table_rls` and
  `offerpsp_mail_center` are applied. New mail tables deny direct `anon`/`authenticated` access.
- [x] Production cockpit deployment `dpl_9QKSjs3RqxYLbHp383La1HQ92Qpc` is `READY` at
  `https://ops-7q4m2x9k8v3n.vercel.app`; authenticated desktop/mobile mail-center smoke passed.
- [x] Production mail E2E verified ingest, unread counter, opening, follow-up state and cleanup.
- [x] Outgoing mail through the active Brevo/n8n sender remains operational for
  `bizdev@offerpsp.com`.
- [x] Incoming Titan mailbox ingestion is active through n8n workflow `tiEQBHg4iNHCHbQI`, which
  polls every minute and calls the protected Vercel mailbox endpoint. The endpoint reads Titan IMAP,
  forwards parsed MIME messages through the protected Supabase Edge gateway and stores them through
  the service-only idempotent RPC.
- [x] Production external-email verification passed for Test ID `20260811T232211Z`: the message was
  stored exactly once, remained unread in Mail Center and did not inflate thread counters. Already
  read mailbox messages are still ingested; the poller marks its own `$OfferPSPIngested` flag without
  changing the mailbox `\\Seen` state.
- [x] The mailbox poller is connected to `BIX — Global Error Alerts`; consecutive scheduled n8n
  executions completed successfully after activation.

## Editable research base and scalable offer catalogue — 2026-08-04

Status: `VERIFIED` for database migration, access isolation, local build and regression suite.

- [x] `База AIBot` supports creating and editing all current casino and research-PSP fields,
  including contacts, GEO, licences, qualification, coverage, limits, commercial terms and notes.
- [x] Casino/PSP records have reversible archive/restore lifecycle and staff audit history; website
  opening is a separate action and no longer replaces editing.
- [x] Offer catalogue is grouped by PSP and filters by PSP, status, GEO, currency, payment method,
  PayIn/PayOut flow, validation health, freshness and free-text search.
- [x] Every offer row opens the existing full route editor; provider and route query parameters are
  preserved when moving between the catalogue and PSP workspace.
- [x] Production migration `offerpsp_research_crud` applied without changing the existing 222 casino
  and 77 research-PSP records. CRUD and lifecycle RPCs are denied to `anon` and check staff identity.
- [x] All 27 migrations and the full route → shortlist → client → PSP review → Telegram → Zoom → won
  regression pass in isolated PGlite, including research CRUD and non-staff denial.
- [x] Legacy AIBot tables and dependent n8n workflows were hardened together on 2026-08-05; direct
  browser access is closed and operational workflows use service-only RPCs.

## Captain's Bridge — isolated production cockpit 2026-08-03

Status: `VERIFIED` for migration, build, deployment and public-route isolation. Authenticated
visual smoke of the new internal pages remains to be repeated after staff sign-in on the new domain.

- [x] Staff cockpit moved out of `offerpsp.com` into the separate Vercel project
  `ops-7q4m2x9k8v3n` at `https://ops-7q4m2x9k8v3n.vercel.app`.
- [x] Public deployment no longer contains staff bundles or routes. `/admin/`,
  `/admin-legacy/` and `/control/` return 404 while `/` and `/portal/` remain available.
- [x] Production cockpit deployment `dpl_6UMnSYCnnc8aYGJs9PAQa7CtvdyP` is `READY` and aliased
  to the isolated project address.
- [x] Production migration `offerpsp_captains_bridge` adds staff-only RPCs for the unified
  AIBot/Telegram/email/task read model, email draft journal and complete merchant editing.
- [x] All 23 migrations pass in isolated PGlite, including staff/anon grants and the complete
  route → shortlist → client → PSP review → Telegram → Zoom → won E2E.
- [x] Merchant workspace now edits company, contacts, payment request, volume/limits, licence,
  qualification, status, quality and owner. Archive, restore and guarded owner-only purge are wired.
- [x] Archived merchants remain visible in CRM history instead of disappearing from the UI.
- [x] `База AIBot` reads all current `casino_leads` and legacy research `psp_providers` through
  the staff-only bridge RPC; the production response was verified with 222 casinos and 77 PSPs.
- [x] Communications reads Telegram logs and email history; Tasks combines OfferPSP and AIBot
  queues; Integrations reflects real data flow.
- [x] Email composition is proxied through a staff-authenticated server function to the existing
  active n8n Email Sender using `bizdev@offerpsp.com`. SMTP accepted the self-addressed verification
  message and the workflow now skips the optional Notion update when no draft ID is supplied.
- [x] The public sign-in page and frontend bundle no longer disclose the owner email or send it as
  a Google `login_hint`; the exact account restriction remains enforced by the database function.
- [x] Authenticated desktop and mobile cockpit smoke passed on the isolated Vercel domain.
- [x] Legacy AIBot security hardening completed together with dependent n8n workflow migration.

## Control Bridge V2 — local frontend migration 2026-08-03

Status: `VERIFIED` locally, on a protected Vercel preview and in production.

- [x] TailAdmin Free React/TypeScript/Tailwind converted into an OfferPSP staff shell.
- [x] Command center, attention queues, pipeline, merchants, PSP, offers, deals,
  subagents and analytics use actual bridge data instead of demo fixtures.
- [x] Merchant workspace connects route matching, manual selection of any eligible
  route, client-safe shortlist preview and controlled sharing.
- [x] Deal Desk connects the existing dossier, PSP review, Telegram, Zoom and
  won/lost RPC chain.
- [x] PSP workspace connects profile, contacts, freshness, versioned OfferPSP
  margin and normalized route editing/lifecycle RPCs.
- [x] Subagent workspace connects organization lifecycle, merchant assignment and
  versioned agent-margin RPCs.
- [x] Header search resolves real merchants, PSPs and routes to their workspaces.
- [x] Dead actions were removed from enabled modules; unfinished modules remain
  hidden through feature flags rather than pretending to work.
- [x] Merchant shortlist preview follows the Telegram-offer standard, keeps PayIn
  and PayOut as separate commercial sections and supports RU/EN staff preview.
- [x] Working registries hide closed merchant fixtures and archived PSP/agents by
  default while preserving searchable history; archived routes are read-only.
- [x] Authenticated production-data contract passed for separate staff/client users:
  roles, leads, management registry, supply registry and coverage RPC all returned 200.
- [x] Authenticated browser smoke passed for sign-in, all eight enabled modules,
  merchant workspace, RU/EN offer preview, global search, PSP/agent creation forms
  and provider workspace. Browser runtime logs contain no errors.
- [x] Reversible provider mutation passed through the V2 UI and the original value
  was restored; the temporary E2E staff account was deactivated again.
- [x] Standalone protected preview `dpl_Ce1G486tbqSkupcXvR9iFJoWLyWy` verified the
  V2 application independently before it was integrated into the public site artifact.
- [x] Production-safe combined preview `dpl_FzaqN2xkame6ZrVYpcbJkwEoFCmi` is `READY` at
  `https://offerpsp-landing-l9xs82u4z-annoris.vercel.app`: the existing landing,
  `/admin/` and `/portal/` remain intact while Control Bridge V2 is mounted at
  `/control/`; sign-in and nested SPA routes resolve to the V2 shell.
- [x] The combined preview bundle contains the production Supabase URL without
  fallback values and the assembled public artifact excludes private files,
  migrations and internal task documentation.
- [x] Production deployment `dpl_D8GkbbqJmduntGntZnpfcqXtLUAi` is `READY` and
  serves Control Bridge V2 at the canonical `https://offerpsp.com/admin/` route.
  The former staff cabinet remains available at `/admin-legacy/`, `/control/`
  redirects to `/admin/`, and the landing plus `/portal/` remain intact.
- [x] The production bundle contains the real Supabase URL without fallback
  placeholders; `/admin/`, nested SPA routes, `/admin-legacy/` and `/portal/`
  passed deployment smoke checks. The sign-in UI rendered in a browser and
  runtime logs contained no errors.
- [x] Daily-operations polish excludes archive/closed fixtures from active metrics,
  adds Command Center quick actions, mobile merchant cards, contained Kanban
  scrolling and responsive global search across merchants, PSPs and routes.
- [x] Analytics now includes the cumulative commercial funnel, six-week lead trend,
  GEO coverage, supply health, launch conversion and shortlist conversion instead
  of relying only on headline counters.
- [x] Polished production deployment `dpl_5FXvX5M5yj1LRmDAxzhPTzDpp15R` is `READY`.
  `/admin/`, `/admin/analytics`, `/admin/merchants`, `/portal/` and
  `/admin-legacy/` passed production smoke checks; the bundle contains the real
  Supabase URL without fallback placeholders.
- [x] Previous production `dpl_D8GkbbqJmduntGntZnpfcqXtLUAi` remains the immediate
  rollback target. No database migration was required for this frontend rollout.

## Delivery layers — current source of truth

### 1. Available through the production interface

Status: `VERIFIED` for production deployment
`dpl_pgpNwMjmZ9hkhpmsaQ5Fihxiurp9` from clean application source commit
`836f7a7`.

- The client portal is a persistent RU/EN multi-request Payment Workspace with counters,
  request navigation, recurring `New payment request` action, anonymous safe route options,
  option feedback, introduction request and client-visible deal progress.
- Production migration `20260803072020 offerpsp_client_offer_display` and the matching frontend
  render one source offer as one concise Telegram-style message with separate PayIn and PayOut
  rates and limits. Anonymous access to the new client projection is denied.
- The portal language now controls the complete merchant-facing offer presentation: RU localizes
  labels, countries, common methods and commercial terms to Russian; EN renders their English
  equivalents without exposing the language of the source rate card.
- The staff cabinet supports the lead desk, merchant edit/archive/purge controls, the private PSP
  workspace, generic PSP and manual-offer creation, relationship tiers, prepared draft upload,
  guarded publishing, versioned OfferPSP and agent margins, route matching, the Deal Desk,
  agent/merchant organizations and a cross-provider coverage matrix.
- Production role E2E verified a separate client workspace, client denial from the staff cabinet,
  staff registry loading and the PSP/offer/organization management tabs. The temporary staff
  fixture was deactivated again after the check.

### 2. Implemented in the production database/API

Status: `VERIFIED` for schema, RPC access boundaries and role-isolation behavior; this does not
mean every capability has a dedicated user interface.

- `20260801_offerpsp_client_workspace_agents.sql` adds merchant/agent organizations,
  memberships, explicit agent-to-merchant assignments, agent margin policies, commission
  ledger and client-safe workspace RPCs.
- `20260801_offerpsp_workspace_grants.sql` limits `authenticated` to DML on the three new
  organization tables and SELECT-only on the client-safe view. `anon` receives no access.
- Direct clients and assigned agents can use the same client-safe workspace RPCs. Staff/client/
  agent/unrelated-client isolation was verified with separate production accounts.
- Production migration `20260802205834 offerpsp_entity_lifecycle` adds generic entity lifecycle,
  revision, audit and management RPCs. Migration `20260802210227
  offerpsp_entity_lifecycle_grants` removes Supabase's automatic `anon` EXECUTE grants from all
  11 management RPCs. `authenticated` retains 11/11 RPC grants, `anon` retains 0/11.

### 3. Agent/commission product layer

Status: `VERIFIED` in production for member invitations and roles, scalable portfolio navigation,
commission operations and co-branded workspace settings.

The protected membership and co-brand journey is production-verified with a controlled user and an
archived test organization. The first external subagent's mailbox delivery and visual approval will
be normal customer acceptance; it no longer blocks the technical product layer. Custom white-label
domains remain a later product decision.

## Implemented in source and verified locally

Status: `VERIFIED` as local code and database behavior only; this is not a production UI status.

### Private PSP supply and offers

- [x] Private provider register with automatic `PSP-xxxxxx` internal codes.
- [x] Provider contacts, relationship status and strategic priority.
- [x] Immutable rate-card source batches with versions and source hashes.
- [x] Normalized offer routes with automatic `OFF-xxxxxx` codes.
- [x] GEO, currency, flow, method, traffic, vertical, integration, volume and limit dimensions.
- [x] Separate PSP base fees, OfferPSP margin policies and calculated client fees.
- [x] Fee components, transaction limits, settlement terms, risk fields and parser anomalies.
- [x] Staff-only RPCs for provider upsert, private draft import, supply listing and guarded publication.
- [x] Client-safe immutable route snapshots without provider identity, base fees or margin rules.

### Source ingestion

- [x] Deterministic text parser for the supplied BRPay and Antarex sources.
- [x] One source can produce multiple normalized draft routes.
- [x] Raw source and SHA-256 metadata are preserved in the private payload.
- [x] Duplicate blocks, missing dimensions, malformed limits and ambiguous settlement rules are flagged.
- [x] Exact-source imports are idempotent per provider.
- [x] Prepared payloads are stored under gitignored `.private/` with mode `0600`.
- [x] Parser v2 keeps the immutable source but can create a new normalized version of the
  same message; the previous draft and its routes are superseded and archived automatically.
- [x] Exact duplicate source blocks are omitted from active routes and recorded in parser metadata.
- [x] Compound South Korea offers are split into Account Transfer, P2P Payout, Toss and Kakao routes.

### Matching v2

- [x] Route-level hard gates for GEO, blocked GEO, currency, flow, method, traffic,
  vertical, monthly volume and transaction limits.
- [x] Structured merchant request fields and `needs_clarification` handling.
- [x] Client-rate calculation through provider/route/merchant margin policies.
- [x] Staff matching action uses private route matches instead of the legacy provider card.
- [x] Draft shortlist creation uses client-safe snapshots and requires current published routes.

### Client cabinet

- [x] RU is the default language; RU/EN switch is available.
- [x] The selected portal language controls both the workspace UI and the full Telegram-format
  offer, including countries, common methods, traffic, card issue and standard risk terms.
- [x] Persistent multi-request payment workspace replaces the one-request shortlist viewer.
- [x] Request rail, workspace counters, recurring `New payment request` action and clear guided next action.
- [x] Anonymous route details, limits, settlement and final client fees are shown.
- [x] Merchant offers use the canonical Telegram-message layout. One source offer remains one
  offer, with separate labelled PayIn and PayOut rates and limits inside it.
- [x] `Interested`, `Need details` and `Not suitable` responses.
- [x] Selected-option summary and primary `Request introduction` action.
- [x] Client-safe Telegram/Zoom/result projection keeps the deal usable after the shortlist stage.
- [x] Legacy or incomplete shortlist items are hidden from the client projection and cannot be shared.
- [x] Sharing a new normalized shortlist archives the previous shared version for that request.

### Organizations and subagents

- [x] Merchant and agent organizations, memberships and agent-to-merchant ownership.
- [x] Agent access is restricted to explicitly assigned active merchant relationships.
- [x] Separate pricing chain: PSP base → OfferPSP margin → agent margin → final merchant rate.
- [x] An agent-managed route cannot produce a client snapshot until its agent margin policy exists.
- [x] Private projected-to-paid agent commission ledger.
- [x] Agent members can view and act on assigned merchant workspaces without seeing provider identity,
  PSP base fees or either internal margin layer.

### Merchant dossier and introductions

- [x] Merchant dossier with qualification fields, verification state and missing-field list.
- [x] Client option selection and introduction request.
- [x] Staff dossier submission for private PSP review.
- [x] PSP decisions: `accepted`, `declined`, `needs_info`, including multiple review rounds.
- [x] Provider identity remains private until an accepted review and managed introduction.
- [x] Telegram group, Zoom meeting and final `won`/`lost` result records.
- [x] Pipeline statuses through dossier, PSP review, Telegram, Zoom and result.

### Current staff UI

- [x] Basic private supply register.
- [x] Upload of a prepared JSON rate card as a private draft.
- [x] Batch route/anomaly counts and guarded publish action.
- [x] Matching v2 and current pipeline statuses in the lead drawer.

### Entity lifecycle and operations control center — local delivery 2026-08-02

Status: `VERIFIED` locally. The migration and frontend are not deployed to production because the
Supabase OAuth connection is currently unavailable in Codex.

- [x] Generic PSP register: create, edit, rank as top/core/standard/watchlist, change relationship
  status and archive without losing offer or deal history.
- [x] Generic private offer creation for any PSP; draft/review offers remain directly editable.
- [x] Published or paused offers are changed through a new draft revision so the live route is not
  silently overwritten; routes can be paused or archived through the existing supply workspace.
- [x] Provider-wide and route-specific OfferPSP margin versions. Changing `0.5 → 0.3 → 1.1`
  closes the previous effective version and activates the new version without deleting history.
- [x] Merchant source records are editable. Merchants can be archived and restored; archived junk
  leads can be permanently deleted only by an owner after an exact confirmation phrase.
- [x] Permanent deletion is blocked for won merchants and merchants with non-void commission
  history. The deletion audit event remains after operational data is removed.
- [x] Agent and merchant organizations can be created, edited, ranked, paused or archived.
- [x] Merchant organizations can be assigned to agents and receive versioned resale-margin rules.
- [x] Private audit records cover provider, offer, merchant, organization, assignment and margin
  changes; management RPCs are staff-only and permanent merchant deletion is owner-only.
- [x] Desktop and 390px mobile visual verification completed without horizontal overflow.
- [x] All 19 migrations, access-boundary checks, legacy regressions and full business E2E fixtures pass.

### Operational workspace — local delivery 2026-08-01

Status: `PARTIAL` production verification. Migration
`20260801113127 offerpsp_operational_workspaces` and frontend are deployed in production through
deployment `dpl_6pAtfuaFqPJAiDpS5eoz9G7A7KTa`. Static production routes and the new client/staff
assets are verified; a separate real staff/client mutation E2E remains open.

- [x] Full-width staff request workspace with overview, dossier, matching, Deal Desk,
  tasks, messages and section navigation.
- [x] Request owner assignment, dossier completeness, next action, deadlines and pipeline counters.
- [x] Structured staff and client dossier editing through a field-limited RPC.
- [x] PSP `needs_info` requests become an explicit client task and can be resubmitted for review.
- [x] Matching no longer creates and sends a shortlist automatically; staff selects routes manually,
  creates a client-safe preview and reviews it before sharing.
- [x] Staff-only route/provider context remains separate from the anonymous client snapshot.
- [x] Operational Deal Desk controls cover PSP submission and decision, Telegram, Zoom and won/lost.
- [x] Client portal loads options through a dedicated safe RPC instead of querying the legacy
  `SECURITY DEFINER` shortlist view directly.
- [x] Local syntax, portal guards and all 18 migration/E2E fixtures pass.
- [x] Production migration grants `EXECUTE` only to `authenticated`; all four RPCs are denied to `anon`.
- [x] Deploy the operational frontend to `offerpsp.com`.
- [ ] Run separate real staff/client production mutation E2E.
- [x] Revoke direct `authenticated` access to the legacy shortlist view. Production migration
  `20260805181820 remove_legacy_client_shortlist_view` removed the view entirely.

### PSP supply workspace — local delivery 2026-08-01

Status: `PARTIAL` production verification. Migration `20260801125700 offerpsp_supply_operations`
and frontend commit `7fb08b7` are deployed. The production staff RPC returned the 15 BRPay routes;
a normal authenticated user was denied. Mutation E2E remains locally verified only.

- [x] Staff PSP profile and working-contact editor.
- [x] Normalized route editor for GEOs, currencies, methods, traffic, verticals, integrations,
  volume, fees, limits and settlement terms without changing the immutable source message.
- [x] Parser error/warning queue with required resolution notes and audit history.
- [x] Provider-wide or route-specific OfferPSP margin policies; PSP base rate remains private.
- [x] Guarded pause, resume and archive controls. Resume revalidates blocking errors, pricing,
  dimensions, limits and margin. Dates and reminder cadence never deactivate an offer.
- [x] Rate-card version register and operational change history.
- [x] Last-confirmed action and configurable partner follow-up cadence. These are advisory tools;
  an ordinary published offer remains available until staff pauses, archives or replaces it.
- [x] Staff-only RPC grants; clients, agents and anonymous users cannot load or mutate supply data.
- [x] Desktop and 390px mobile visual verification without horizontal overflow.
- [x] All 18 migration/E2E fixtures and frontend regression guards pass.
- [x] Production deployment is `READY`; `/admin/`, `/portal/` and their new assets return 200.
- [x] Internal `TASKS.md` and `supabase/migrations/` are excluded from Vercel and return 404.
- [x] Archived routes from superseded parser versions remain in version history but are hidden from
  the active route list and anomaly counters.
- [x] The PSP rate-card editor shows a responsive field-by-field `Было / Стало` comparison against
  the confirmed predecessor revision, including coverage, commercial rates, limits, settlement,
  risk, traffic, integrations and operational notes. Unchanged fields are omitted.
- [x] Advisory partner reminders use `last_verified_at` and `freshness_days`; they create one
  deduplicated operational task and prepare RU/EN partner text. They never pause, archive or mark
  an offer unavailable.
- [x] GEO/currency/method/vertical coverage matrix with readiness, search and status filters.

### Production grant hotfix

- [x] Added `20260801_offerpsp_authenticated_lead_grants.sql` after production E2E
  proved that staff UPDATE/DELETE policies existed without table privileges.
- [x] The migration grants only UPDATE/DELETE to `authenticated`; existing RLS still
  limits those operations to active OfferPSP staff.

### Client portal active-request isolation

- [x] `claim_offerpsp_leads()` ignores `closed` and `spam` leads.
- [x] The client portal loads only rows returned by the client-safe workspace RPC instead of
  relying on the broader staff RLS view.
- [x] The workspace access helper excludes `closed` and `spam` requests.
- [x] Empty `won` and `lost` requests show a completed state instead of a conflicting
  matching-in-progress state.

### Focused staff workspace and manual client offers — production delivery 2026-08-03

Status: `VERIFIED` in source, migration validation and production deployment. A final click-through
with an existing authenticated staff session remains a user-side acceptance check.

- [x] Lead drawer navigation switches real workspace panels instead of scrolling through one long
  page: overview, dossier, client offers, Deal Desk and collaboration.
- [x] Staff can open email or Telegram from the lead header and can jump directly to client offers.
- [x] Automatic matching remains an advisory tool; incomplete matching fields no longer block the
  manual commercial workflow.
- [x] Staff can search the full publishable route catalog, select any suitable routes independently
  of the merchant's original request and create a client-safe manual shortlist.
- [x] Manual offers support a custom title, introduction and client note while retaining private PSP
  identity, base pricing, internal IDs and OfferPSP margin.
- [x] Migration `offerpsp_manual_client_offers` is applied in production. The RPC is executable by
  `authenticated` and `service_role`, denied to `anon` and `PUBLIC`, and repeats its own staff check.
- [x] Local E2E deliberately sends a published `ZZ / USD / cards` route to an
  `India / INR / UPI` request and verifies that the client snapshot contains no private supply data.
- [x] Commercial analytics now explains its purpose and shows the main funnel bottleneck, stage
  distribution, source volume and won results instead of counters alone.
- [x] Vercel production deployment `dpl_E3n2ErgzifvwuCXKz9oxGQoRJtLd` is `READY`, aliased to
  `offerpsp.com`, and production assets contain the focused panels, manual-offer controls and charts.
- [x] Follow-up deployment `dpl_4XA7qk1xXSBY2t3Su7kTG4m6uBNC` replaces the remaining long-page
  navigation with four independent staff screens. PSP supply is further split into provider register,
  offer catalog, rate-card import and version history; no sidebar action uses scroll navigation.

## Verified locally

Status: `VERIFIED` on 2026-08-02 in an ephemeral PostgreSQL-compatible PGlite database.

- [x] All 20 migrations, including rate-card reprocessing, route-level publication, the coverage matrix, operational workspaces, entity lifecycle and manual client offers,
  apply in dependency order.
- [x] `authenticated` has lead UPDATE/DELETE privileges while `anon` does not.
- [x] BRPay parser v3 imports 14 real draft routes; only four blocking checks remain in the two
  Uzbekistan ecom routes because the partner source contains malformed and conflicting limits.
- [x] Antarex parser v3 imports 24 real draft routes with zero parser errors and complete fee coverage
  for every route flow; 45 explicit warnings remain for staff confirmation of inferred flow/method
  and unconfirmed traffic/vertical scope.
- [x] Reprocessing the same immutable source with a newer parser creates a new batch version;
  repeating the same parser version remains idempotent.
- [x] Open error anomalies prevent draft publication.
- [x] A non-staff authenticated user cannot call the private supply API.
- [x] Client shortlist output does not contain provider identity, internal route/provider IDs,
  PSP base rates or margin mode.
- [x] Rebuilding matching removes stale reviewed route matches without invalidating an existing client snapshot.
- [x] Full E2E passes:
  `route → matching → shortlist → client selection → dossier → PSP needs info → second review → PSP accepted → Telegram → Zoom → won`.
- [x] Legacy/incomplete shortlist publication fails without changing shortlist or lead state.
- [x] Client-safe deal output contains Telegram/Zoom/result data and excludes provider/route/internal notes.
- [x] Agent regression covers missing-margin rejection, final resale calculation, authorized action
  and isolation from an unrelated authenticated user.
- [x] A repeated Telegram call cannot move an introduction backwards after Zoom is scheduled.
- [x] JavaScript syntax checks and `git diff --check` pass.
- [x] New payment workspace was visually checked locally at desktop and 390px mobile width without horizontal overflow.
- [x] Portal regression checks cover active email claiming, repeated login with detached
  closed/spam fixtures, safe workspace RPC selection and consistent terminal copy.

Local verification does not replace testing with real Supabase staff and client accounts.

## Deployed and verified in production

Status: `VERIFIED` on 2026-08-02.

- [x] Applied `offerpsp_rate_card_reparse`; version uniqueness now uses provider, source hash and
  parser version without changing the immutable partner message.
- [x] Applied `offerpsp_route_level_publication`; valid routes can be published independently while
  malformed routes remain private archived history.
- [x] BRPay v1 is superseded. BRPay v2 is published with 12 active routes; the two malformed
  Uzbekistan ecom routes are archived with their four source errors. Active routes have zero
  blocking errors, complete flow pricing and 16 open review warnings.
- [x] Antarex v2 is superseded. Antarex v3 is draft with 24 active routes, zero parser errors,
  complete flow pricing and 45 explicit review warnings.
- [x] Antarex remains unpublished because its OfferPSP margin policy is intentionally unset.
- [x] Applied `offerpsp_supply_coverage_matrix`; staff receives 36 active normalized routes,
  while `anon` has no execute grant and a non-staff authenticated user is denied.
- [x] Production deployment `dpl_EeuotqpGK4qWuf2w94NDLHfK3msS` is `READY`, aliased to
  `offerpsp.com`, and serves the RU/EN coverage matrix from exact SHA
  `c750c8c7f382318c22992c8ecf40bf44b0453aa8`.

- [x] Closed snapshot and rollback script are readable under gitignored `.private/`; the snapshot
  includes the previous shortlist view definition, constraints, policies and grants.
- [x] Applied `offerpsp_client_workspace_agents` as migration `20260801064235`.
- [x] Applied minimal grant hotfix `offerpsp_workspace_grants` as migration `20260801065351`.
- [x] `authenticated` has only SELECT/INSERT/UPDATE/DELETE on the three new tables and only
  SELECT on the client view; `anon` has no access and `service_role` remains unchanged.
- [x] Production regression passed with separate staff, direct-client, agent and unrelated-client accounts.
- [x] Full production business E2E passed through `won`; all technical fixtures were archived,
  superseded, closed/unlinked or deactivated afterward.
- [x] Production portal was visually checked in RU and EN with a separate client account; the
  persistent empty workspace has a clear next action and no closed technical merchant.
- [x] Vercel production deployment `dpl_B1LUdb36EoWqFKhkTLHD5DZQ5Ky3` is `READY` at exact SHA
  `02aee090f50b0ed037615099bcaf6d5bc0c3b02f`; no runtime errors were reported in the post-rollout window.

At the end of this earlier workspace rollout, BRPay and Antarex were still draft-only. The current
production supply status is recorded above.

## Earlier production baseline

Status: `VERIFIED` — factual baseline retained for rollout history.

- [x] Applied `20260801_offerpsp_active_lead_claims.sql` as production migration
  `20260731233207 offerpsp_active_lead_claims`; function definition, ACL and RLS were
  rechecked.
- [x] Production auth regression with two separate non-staff users verified active
  email claiming, repeated login isolation and foreign-client denial.
- [x] All production E2E and regression leads are closed and unlinked after cleanup.
- [x] Deployed commit `1c8eaf16db6a640af3c3fa07946967274a2e5b27` as Vercel production
  deployment `dpl_Dab1JS9MwYr3jVpPoebUCc9mjFWH` (`READY`).
- [x] `/portal/` was visually verified under `guannko@gmail.com`, the separate E2E
  client and a temporary `lost` fixture; closed fixtures are absent and terminal copy
  does not conflict with matching-in-progress copy.

- [x] Production preflight and private DDL/data snapshot completed and verified.
- [x] Production migration `offerpsp_private_supply` applied as version `20260731223317`.
- [x] Production migration `offerpsp_route_matching` applied as version `20260731223422`.
- [x] Production migration `offerpsp_introduction_pipeline` applied as version `20260731223603`.
- [x] All three migration records, tables, RPCs, RLS boundaries and grants were checked.
- [x] Legacy production data remained unchanged after the three platform migrations.
- [x] BRPay imported as `PSP-000001`: 15 draft routes, 12 open errors, 18 warnings.
- [x] Antarex imported as `PSP-000002`: 20 draft routes, 26 open errors, 29 warnings.
- [x] BRPay and Antarex have zero published batches and routes.
- [x] Antarex margin remains unset; margin policy count is zero.
- [x] Frontend SHA `319160c4585f4f9783e2be778fe1cdadb0090b1c` promoted to production Vercel.
- [x] Production landing, RU/EN client login and RU/EN staff login screens were visually checked.
- [x] n8n inbound workflow remains active and validates with zero errors/warnings.
- [x] Production migration `offerpsp_authenticated_lead_grants` applied as version `20260731230340`.
- [x] `authenticated` has lead UPDATE/DELETE privileges; `anon` does not.
- [x] Separate authenticated client UPDATE and DELETE attempts affected zero rows.
- [x] Separate active staff UPDATE affected exactly one lead.
- [x] Production E2E completed:
  `route → matching → shortlist → client → dossier → PSP needs info → accepted → Telegram → Zoom → won`.
- [x] The E2E fixture is inert again: provider and route archived, batch superseded,
  test leads closed and unlinked, test shortlists archived and test staff deactivated.

This earlier rollout baseline completed before route-level publication. Current supply status is
recorded in the 2026-08-02 production section above.

Security note: the legacy `offerpsp_client_shortlist` view is no longer used by the portal.
Migration `remove_legacy_client_shortlist_view` removes this redundant exposed surface; the portal
and its isolation tests use the current `list_offerpsp_client_offers` RPC.

## Truly not implemented

Status: `PARTIAL` — these are the actual next P1/P2 tasks after rollout.

### P1 — PSP and route operations

- [x] Full PSP/contact editor in the production staff cabinet.
- [x] Route, fee, limit, settlement and anomaly editor in production.
- [x] Anomaly resolution/acceptance UI with audit notes in production.
- [x] Pause, resume and archive controls for individual routes in production.
- [x] Visual version history in production; field-by-field batch comparison remains open.
- [x] Freshness dashboard, last-confirmed controls and automated reminder queue are in production.
- [x] Partner reminders through n8n; the active six-hour workflow was validated with zero errors
  and completed a production sync without sending an early notification.
- [x] GEO/currency/method/vertical coverage matrix deployed in RU/EN.

### P1 — Deal Desk

- [x] Staff UI for reviewing and editing the merchant dossier in production.
- [x] Missing-information workflow linked to the client dossier in production.
- [x] Staff controls for PSP submission and review decisions in production.
- [x] Telegram group recording and transition in production.
- [x] Zoom scheduling and won/lost controls in production.
- [x] Stored RU/EN introduction templates and automated Telegram/Zoom preparation are in
  production: the Deal Desk generates a group title, introduction message, participant contacts,
  Zoom title/agenda and operational checklist, with copy actions and saved staff-only preparation
  history. Telegram group creation and the actual Zoom link remain deliberate human actions because
  the Telegram Bot API cannot create groups and no Zoom OAuth account is connected. Production
  migration `offerpsp_introduction_preparation` and deployment
  `dpl_FtB4QMyK4qTfRbeBEbDL1tQy5oBP` are verified.
- [x] Structured deal outcome and result-quality tracking in production: won/lost reason,
  integration stage, live date, actual monthly volume, quality score, follow-up date, full staff
  chronology and elapsed-time metrics from lead submission through PSP review, Telegram, Zoom and
  final result. Production migration `offerpsp_deal_outcomes` and cockpit deployment
  `dpl_AWgXCueSPCQARooqbyVvBFTR73j1` are verified; direct client/anonymous access is denied.

The first operational UI is deployed. Daily-use refinement remains.

### P1 — Agent operations

- [x] Staff editor for agent/merchant organizations, relationship tier/status, merchant assignments
  and versioned agent margin policies in production.
- [x] Organization-member and role management UI in production: staff can add an existing
  Supabase user to an agent organization, change `owner`/`admin`/`manager`/`viewer`, suspend and
  restore access, while the database prevents removal of the last active owner and records an
  audit entry. Anonymous and non-staff access is denied. Production migration
  `offerpsp_organization_member_management` and cockpit deployment
  `dpl_3jp9GVd1UwgWw48J7iXsogxSbXcY` are verified.
- [x] Agent onboarding/invitation flow and managed-client switcher are in production. Staff can
  invite a new member by email or attach an existing Supabase user without exposing the service
  role key; Edge Function `offerpsp-invite-member` v1 verifies JWT and active staff access before
  sending the invite and assigning the role. The merchant/agent portal now has RU/EN portfolio
  search, result count and a bounded scrollable request switcher for larger portfolios. Cockpit
  deployment `dpl_47Tagpcb2qd7fF31Hfw5nvYD38Ud` and portal deployment
  `dpl_DmxffiYbVYMMtafEmhhmQ1Hu9srz` are verified. The first real invite-email acceptance will be
  verified with an actual subagent instead of creating a fake production user.
- [x] Agent commission ledger in production: staff records projected commission amounts and basis,
  advances them only through `projected → approved → earned → paid`, can void a non-terminal entry,
  cannot edit paid history or skip stages, and downloads the full ledger as CSV. Private financial
  rows remain RPC-only and every change is audited. Production migration
  `offerpsp_agent_commission_workflow` and cockpit deployment
  `dpl_Cy9HrK4NJ19MrVMPAfBVX2WZoLVC` are verified.
- [x] Co-branded agent workspace settings are in production: staff controls enablement, display
  name, RU/EN taglines, HTTPS logo, accent colour and support email; the agent portal renders the
  safe organization branding while retaining `Powered by OfferPSP`. Production migration
  `offerpsp_agent_cobrand_settings`, cockpit deployment
  `dpl_6NYjxkerwNgTNDQgSxUjgJy4ccYe` and public portal deployment
  `dpl_FGTaaGLRbyeK5e2VxboWnQSkGVDU` are verified. The first real-agent visual acceptance remains;
  white-label domains are intentionally deferred.

### P1 — Telegram ingestion

- [x] Receive a partner rate card from the existing AIBot when Boris forwards or pastes the source
  and explicitly asks the agent to save it. The agent preserves the original text and only enqueues
  it for review; it does not claim that the source is parsed or published.
- [x] Route Telegram attachments from the active AIBot into the protected OfferPSP intake without
  exposing the bot token. A document with an explicit `PSP: Provider name` caption is downloaded by
  the credential-backed Telegram node, limited to 20 MB, extracted and sent to the existing
  draft/review queue. Supported direct Telegram sources are PDF, DOCX, XLS/XLSX and text formats
  including TXT, Markdown, CSV/TSV, JSON, HTML and XML. Unsupported images receive an explicit
  instruction to use the cockpit upload while direct Telegram OCR remains pending.
- [x] Remove hard-coded Telegram API tokens from the active AIBot message, callback, keyboard and
  email-confirmation nodes. All Telegram operations now use the existing n8n Telegram credential;
  the active graph contains no Telegram token URLs and validates with zero errors.
- [x] Complete a real Telegram attachment E2E. A TXT rate card with the explicit provider caption
  was received from Telegram, downloaded through the credential-backed node, extracted, accepted by
  the protected intake and processed by the production worker into one review-only India/INR/UPI
  draft route with zero blocking anomalies and no publication. The bot returned the acceptance
  message; the exact test job, batch, route and queue-created provider were then purged.
- [x] Define the universal ingestion contract: any source becomes a reviewed normalized draft and
  every merchant output uses the Telegram-offer presentation standard.
- [x] Add local source adapters for TXT/Markdown, CSV/TSV, XLSX, text PDF and DOCX with immutable
  original-file hashes and review-required metadata.
- [x] Allow the deterministic normalizer to accept new PSPs without adding a hard-coded provider preset.
- [x] Deploy the private production ingestion queue for Telegram, email, admin text/file and API
  sources, including source hashes, deduplication, processing state, errors and immutable references.
- [x] Deploy the cockpit intake screen for pasted sources and text-based files, with queue history,
  retry and dismissal controls.
- [x] Protect the AIBot → OfferPSP intake webhook with a dedicated internal credential. Production
  transport E2E returned a queued job in Supabase; the test job and temporary workflows were removed.
- [x] Run queued text sources through the deterministic parser automatically. The production n8n
  worker claims jobs every minute, calls the protected parser API, imports only draft/review data
  and records failures without publishing routes. A real production E2E reached `review`, created
  one draft route and no published routes; the exact test job, batch, route and provider were removed.
- [x] Connect binary admin files to the source adapters before the existing queue/parser worker.
  The cockpit accepts TXT/CSV/JSON/HTML, PDF, DOCX and XLSX, extracts normalized text in the
  authenticated browser and sends the result through the same draft/review pipeline.
- [x] Store original binary files in the private `offerpsp-private-sources` bucket and attach the
  storage reference, SHA-256, MIME type, size and extractor metadata to the ingestion job/batch.
  Production upload E2E verified the physical object, automatic worker pickup and review state.
- [x] Add guarded staff purge for rejected/test sources. It refuses queued/processing/published
  data and removes the job, non-published draft batch, queue-created provider and private Storage
  object. Production E2E cleanup left the 12 published routes unchanged.
- [x] Persist incoming mailbox attachments and connect them to the private review-only offer intake.
  TXT/MD/CSV/TSV/JSON/HTML/XML, PDF, DOCX and XLSX files are parsed server-side, stored in the private
  `offerpsp-private-sources` bucket and shown in Mail Center with extraction status, signed download,
  PSP assignment and a guarded `В очередь офферов` action. Production E2E on 2026-08-12 verified
  private storage, staff UI, a `review` ingestion job and zero published routes; synthetic database
  rows were removed after the test.
- [x] Add browser-side English/Russian OCR for scanned PDF pages and PNG/JPEG/WebP sources.
  Domain labels are normalized before parsing, and the canonical `GEO - Country` header is accepted.
  Production E2E converted a generated PNG rate card into one complete India/INR/UPI draft route
  with zero blocking anomalies; the exact job, batch, route, provider and Storage object were purged.
- [x] Surface new draft parses, parser failures, blocking anomalies and duplicates in the staff
  review queue. The Command Center shows the attention count; the intake screen refreshes every
  15 seconds and supports direct review, retry and dismissal.
- [x] Link Telegram ingestion to partner freshness reminders. Published reviewed rate cards update
  the existing provider confirmation timestamp, close the reminder and complete its task; incoming
  drafts remain review-only and never falsely confirm partner terms.

The production queue, AIBot text and attachment transport, automatic text parser, private admin-file
ingestion and incoming mailbox attachments are connected to the same review-only intake. Mail
ingestion is active and idempotent; files remain private and cannot publish routes without the
existing staff review/publish flow. Partner follow-up reminders are advisory and do not control offer
availability.

### File classification and cockpit upload — production delivery 2026-08-12

- [x] Incoming Mail Center attachments require an explicit `Оффер` or `Договор` classification
  before saving. A known reply thread inherits its linked PSP or merchant; an unknown sender requires
  a manual company choice.
- [x] An offer keeps its original file in private Storage and enters the existing parser/manual-review
  queue with `publication_allowed=false`. It cannot publish a route automatically.
- [x] A contract is saved as a document of the selected company and does not enter offer parsing.
- [x] The floating Captain's Bridge AIBot has a visible `+` action for PDF, DOCX, XLSX, image and text
  offer sources. Staff selects the PSP and may add an intake note before the private upload.
- [x] Production migration `offerpsp_file_classification` is applied; staff/service-role grants and
  anonymous denial were verified. Transactional database E2E passed for both offer and contract paths.
- [x] Production UI at `https://ops-7q4m2x9k8v3n.vercel.app` was verified with an authenticated staff
  session: AIBot upload controls are present, and a controlled incoming attachment displayed the
  inherited BR-Pay link plus the required file-type selector. All synthetic rows were removed.
- [x] Exact frontend commit `217610908a113da3e5124930fe2bb4fae0af6fbf` is deployed as Vercel
  production deployment `dpl_EQrwbCGVXsi4AfXCRkwcxk4bqt74` (`READY`).

### Impact Control — production delivery 2026-08-08

Status: `VERIFIED` for database lifecycle and local frontend. The former daily expiry workflow was
deactivated on 2026-08-08 because offer availability is version-driven, not date-driven.

- [x] Client actions and introduction requests fail closed when a previously shared route is
  explicitly paused, archived, replaced or otherwise unavailable. Dates alone never block it.
- [x] Every stale item from the same source shortlist is resolved as one atomic group. Staff cannot
  create a partial vNext that silently leaves another unavailable offer in the client workspace.
- [x] Replacement routes are selected from the live published catalog rather than entered as raw
  UUIDs. Flow and currency must remain compatible; a GEO or method override requires an explicit
  reason.
- [x] Prepared vNext state is persisted in Supabase and survives refresh. Staff can review, share,
  abandon and rebuild the draft without losing the workflow state.
- [x] Sharing re-checks the current replacement route state to close the pause/archive race
  between draft creation and client delivery.
- [x] A shared replacement completes all related update-queue items atomically and archives the old
  shortlist. Queue items with an existing client selection cannot be dismissed.
- [x] Full clean-replay validation passes through migration
  `20260808210000_offerpsp_impact_control_v4.sql`, including grouped replacement, idempotent retry,
  stale-action denial, share-time race denial and atomic completion.
- [x] Production Impact Control migrations v4 and v5 are applied. The former expiry processor now
  returns `disabled: true` and cannot change offers or create tasks.
- [x] n8n workflow `V4eM2iAHvhxO5J2J` is deactivated. It is retained only as historical
  configuration and must not be reactivated as an expiry processor.
- [x] Captain's Bridge production deployment `dpl_BhHpAk6E2y6RdH54idYcDZR1sY5A` is `READY`, built
  from commit `4a71063694389b5b9d6f4c1bb88cfff2673c40a6` and aliased to
  `https://ops-7q4m2x9k8v3n.vercel.app`.
- [x] A later partner message creates a new batch/version even when its terms are identical. Only an
  immediate retry with the same source reference is deduplicated.
- [x] Publishing a successor replaces the previous route. Identical terms silently rebind existing
  shortlist items; commercial changes enter Impact Control for merchant review.

### Modular platform nodes — local first package 2026-08-13

Status: `PARTIAL`. Meilisearch is now connected to production and the remaining optional modules
stay isolated behind feature modes until their own verification is complete.

- [x] Add Docling adapter and protected universal document-extraction endpoint. Existing PDF intake
  can use Docling as an active extractor or as a rescue path when native extraction fails; parsing,
  anomaly review and publication controls remain unchanged.
- [x] Add GoRules Zen policy and staff-only shadow endpoint for deterministic merchant/route risk
  compatibility. It is explicitly non-authoritative until parity tests cover real route snapshots.
- [x] Add privacy-restricted PostHog client with only explicit page/search events. Autocapture,
  session recording, page text and element attributes are disabled.
- [x] Add Mem0 adapter under profile `BIXOFFPSP` and a hybrid search endpoint that returns semantic
  recall beside the existing Supabase operational memory. Supabase remains authoritative; shadow
  mode does not write to Mem0.
- [x] Add Meilisearch adapter, unified staff search and Supabase-derived index builder with provider
  deduplication and atomic staging-index replacement. The cockpit keeps its current local fallback
  whenever Meilisearch is off or unavailable.
- [x] Add localhost-only Docker Compose definitions for private Docling and Meilisearch services,
  environment template, architecture document and module contract tests.
- [x] Verify the exact Vercel preview build locally. All serverless functions package successfully
  and the GoRules policy file is explicitly included in both rule-evaluation and health functions.
- [x] Add the protected production module-health panel to Captain's Bridge and verify deployment
  `dpl_7mvyrS3JEnN1i9LAnmMkyP7ErDWs`: GoRules is healthy in shadow mode; Docling,
  Meilisearch, Mem0 and PostHog are explicitly shown as unconfigured rather than implied active.
- [x] Replace the obsolete Northflank `btc-predictor` service with private Meilisearch `v1.22`,
  protect it with a master key and verify authenticated health and index access. The search index is
  disposable; Supabase remains the only source of truth.
- [x] Add a service-role-only Supabase snapshot RPC, protected staff/cron sync endpoint, atomic index
  replacement, daily Vercel refresh and a manual `Обновить индекс` control in Integrations.
- [x] Run the first production sync: 516 deduplicated documents from 17 merchants, 81 PSP records,
  251 casinos, 4 agents and 163 routes. Anonymous index access is denied; ordinary cockpit search
  excludes archived records while preserving them in Supabase.
- [x] Verify multilingual GEO search in production: country codes expand to English and Russian
  names, EU resolves as Europe/Европа, and the CIS member codes resolve through both CIS and СНГ.
  Production deployment `dpl_8gtEJ1vomiN35z74pXsG9UtnhieZ` is READY and the protected index still
  returns `401` without its server-side key.
- [x] Pin the private CPU Docling runtime to `docling-serve-cpu:v1.28.0`, authorize Captain's Bridge
  staff uploads without exposing the service key, support Office/email/scanned-image inputs and
  preserve the existing local extraction fallback.
- [x] Re-run the real PAYOK PDF fixture through native extraction: one page, 2,078 extracted
  characters, table content present; normalized parser output remains 8 routes with 0 blockers.
- [ ] Do not provision permanent Docling capacity blindly: the practical 4 GB Northflank service
  costs about $36/month and field reports show memory can exceed that. When real volume requires
  Docling, use an asynchronous on-demand job with Storage/queue, then compare PDF, spreadsheet and
  scanned-image fixtures before choosing `active` mode.
- [x] Product decision 2026-08-14: do not configure or enable PostHog. OfferPSP keeps its existing
  first-party acquisition/SEO telemetry and does not receive or proxy merchant payment traffic.
  Post-introduction progress may later be read from a PSP cabinet/API where the partner supports it.
- [ ] Keep Mem0 in shadow, compare it with Supabase Memory/Journal/Timeline and connect semantic
  recall to AIBot only after a privacy and contradiction test.
- [ ] Keep Chatwoot for the second packet after email, Telegram and portal conversations share one
  canonical conversation model.

### P2 — Analytics

- [x] Added the production acquisition-attribution foundation on 2026-08-27: Google Ads and other
  click IDs, UTM and affiliate identifiers survive the current OfferPSP visit as first/last touch,
  pass through the active inbound n8n workflow and are stored on the lead. Private lifecycle events
  cover submitted, qualified, PSP accepted, introduction, won and processing-live milestones. The
  staff SEO/GEO screen reads the source/campaign funnel without inventing spend or ROAS. Google
  export remains consent-gated and no advertising tag, campaign or spend was enabled. Production
  Supabase contains 17 historical `lead_submitted` events and zero export-eligible events; the
  staff-only funnel returns 3 active business leads, 2 qualified, 0 paid, 0 won and 0 live. Active
  n8n workflow `ealRZcZzCLKAv6S5` validates with 13 enabled nodes, 12 valid connections and no
  errors/warnings. Public deployment `dpl_8PKVG7Uc8TZppjm9U3zZ9Ktq1rrQ` and Ops deployment
  `dpl_BLTw8yaxEH6NvrURev94noVd1Jj2` are `READY`; their production assets were read back from the
  canonical domains.
- [ ] Connect live Google Ads cost data and consented offline-conversion export after the immutable
  billing country, currency and time zone are approved and the first search campaign is funded.
- [ ] Lead quality by source, GEO and vertical.
- [ ] Lead → shortlist → option selected → introduction conversion.
- [ ] PSP review acceptance, decline and clarification rates.
- [ ] Introduction → Telegram → Zoom → live cooperation conversion.
- [ ] Time-to-match, time-to-PSP-decision and time-to-launch.
- [ ] Partner-reported or PSP-API processing volume and realized OfferPSP margin by PSP and route;
  OfferPSP must not proxy merchant payment traffic merely to collect analytics.

### Client portal support dialog — verified 2026-08-15

- [x] Restore `Связаться с командой` as an authenticated in-portal dialog instead of redirecting to
  the user's mail client.
- [x] Add one general support conversation per portal account, independent of payment requests, with
  owner-scoped RLS and the existing verified Telegram notification/reply bridge.
- [x] Verify the empty-account production state with `yandoodle2@gmail.com`: the dialog opens, loads
  its history and exposes the message composer. Cross-account RLS returned zero visible messages.
- [x] Deploy production release `dpl_AsyvopJuuMcQZrFfNTxfSVipH7y1` and retain email/Telegram only as
  fallback channels inside the dialog.

### P2 — Search and PSP acquisition

- [ ] `Become an OfferPSP partner` funnel.
- [ ] Reviewed PSP-research source list, starting with AboutPayments and PaymentProviders.io.
- [x] Sanitized SEO pages by GEO, method and vertical. Production serves 13 generated acquisition
  pages, including iGaming, Forex, high-risk PSP, e-commerce, video games, cross-border, SaaS,
  marketplace, payment-method-by-GEO and regional matching. The homepage now links the iGaming and
  Forex briefs instead of rendering non-clickable placeholder cards. Production deployment
  `dpl_AkYkZaTa57g9yVMJtBaEZXpThL3k` is `READY` and aliased to `https://offerpsp.com`. `VERIFIED`
  2026-08-27: the new e-commerce and video-game pages, updated high-risk page, sitemap and `llms.txt`
  all return HTTP 200; a fresh SiteOne run completed at 9.6 with 31/31 successful URLs and zero broken
  URLs. No Google Ads campaign, billing method or advertising spend was enabled.
- [x] Connect the staff SEO/GEO screen directly to Google Search Console with read-only service
  account access. Production now shows 7/28/90-day clicks, impressions, CTR, position, top queries,
  pages, countries and URL Inspection status without substituting internal snapshots. `VERIFIED`
  2026-08-26: API data through 2026-08-23 reports 2 clicks, 230 impressions, 0.9% CTR and average
  position 52.8; all 14 sitemap URLs pass URL Inspection after the improved Forex page was submitted
  to Google's priority crawl queue. Staff deployment `dpl_ECX4eZD8MKjPuoYXTuERQuRjbPMT` and public
  deployment `dpl_B3QUZZW4frZqDDRsep6yf2iAWpCx` are `READY`.
  `VERIFIED` 2026-08-28: transient Google timeouts are retried and an unavailable individual URL
  Inspection no longer suppresses current Search Analytics. Production deployment
  `dpl_ATPj4xZhu3keL6zvxwUGBz6BJ1xU` is `READY`; the authenticated staff UI loaded direct Google
  data through 2026-08-25 with 2 clicks, 239 impressions, 0.8% CTR, average position 53.8 and 15/16
  current sitemap URLs indexed. Partial failures remain explicitly empty and never use archive data.
- [ ] Public content generated from active routes without provider identity.
- [x] Sitemap, schema and canonical strategy. Every generated acquisition page is validated against
  `sitemap.xml` and `llms.txt` during the production build; generated HTML is verified to contain its
  self-canonical, JSON-LD and private-request CTA before release.
- [x] Added the live public-page registry to the staff SEO/GEO screen on 2026-08-27. Each current
  indexable URL now shows its latest HTTP response, JSON-LD count, canonical, Google URL Inspection
  verdict, last Google crawl, 90-day impressions, clicks and position. Production deployment
  `dpl_BTTPrkwzsMKLVup7zGgMDS2S8A7B` is `READY`. Fresh audit
  `5e27d123-ef77-45e2-b05a-bee796508261` recorded 17 checked pages, 16 indexable pages, 17 HTTP 200
  responses and 16 self-canonicals; the private noindex portal is excluded from the public registry.
  Live UI verification showed 16 public pages, 16/16 HTTP OK, 16/16 self-canonical, 14/16 indexed by
  Google and 12/16 with search impressions. Missing Google data remains visibly empty and is not
  replaced by history.
- [x] Fixed the SiteOne short-cache finding on 2026-08-27. The shared
  `acquisition-attribution.js` URL is now versioned and served with
  `Cache-Control: public, max-age=31536000, immutable`; HTML and authenticated portals retain their
  non-immutable policies. Public deployment `dpl_7j9igpWnJCmJXePtUfodrrih9yps` is `READY` and
  aliased to `https://offerpsp.com`. Fresh audit `2907a774-a0a4-4948-b169-23a38798d4e8`
  completed with 31/31 successful URLs, zero broken URLs and no
  `static-assets-short-cache` issue.
- [x] Hardened the production CSP on 2026-08-27 by replacing arbitrary `'unsafe-inline'` script
  and style execution with exact SHA-256 allow-list hashes and automatic build validation. All 17
  crawled HTML pages retain HSTS, CSP, X-Frame-Options, X-Content-Type-Options, Referrer-Policy and
  Permissions-Policy; the public lead dialog was exercised in a real browser without CSP errors.
  The English and Russian CIS/Central Asia pages were also verified to declare reciprocal `en`,
  `ru` and `x-default` hreflang links; no fictitious Russian alternatives are emitted for English
  pages without translations. Public deployment `dpl_Dw7iN7LVwUKMD1HZDe6H4U9TvYGy` and staff
  deployment `dpl_5MvLp2dVNPa4WbwKFTSxsNDycQoX` are `READY`. Fresh audit
  `23422911-c7d2-40eb-a7c4-e9be6adce847` scored 9.9 with 31/31 successful URLs, zero broken URLs,
  no security warnings or critical findings and no agent priorities. Remaining SiteOne security
  entries are notices for optional or compatibility-oriented headers, not a P1 defect.
- [x] Reworked qualified-lead meta descriptions on 2026-08-28 for Europe, high-risk, Forex,
  iGaming and video-game acquisition pages. Each live description now leads with private PSP
  matching, offers qualified introductions and states that OfferPSP does not publish a provider
  list. Public deployment `dpl_AG9eARoXvp8Ss4mW3emBRpv7fJRH` and final staff audit deployment
  `dpl_FprccBWQcPJBoaAj4QwAiCJuTkZU` are `READY`. Audit
  `9656e27a-5b51-469f-ae97-e80b3c6e0ef7` scored 9.9 with 31/31 successful URLs, zero broken URLs
  and no duplicate or empty content recommendations. The normalizer also discards the verified
  private portal's intentional noindex notice and summary claims contradicted by live `llms.txt`.
- [x] Add verified FAQPage and HowTo JSON-LD to the six vertical pages identified by audit
  `9656e27a-5b51-469f-ae97-e80b3c6e0ef7`, using only questions and steps already visible on each
  page; build regressions compare visible FAQ content with FAQPage JSON-LD exactly, and live audit
  `f365e8a5-0c43-41df-9af4-fcb80e6136e8` completed after the production rollout.

### Captain's Bridge restart remediation — verified 2026-08-20

- [x] Deploy commit `f531e27` as production deployment
  `dpl_EsdFfJb28sPgGmuMcMmgvSNxnPbP` and verify the production alias.
- [x] Restore live data freshness with Supabase lead events, focus/visibility refresh and a
  30-second safety refresh.
- [x] Make SEO/GEO audits asynchronous; verify a new SiteOne crawl reaches a stored terminal result
  from the live UI without blocking the request.
- [x] Remove the cleared Oura Ring Store request from Inbox while preserving its record and history.
- [x] Close the completed PAYOK import review job. Preserve its 22 published routes and 22 archived
  routes because catalogue publication is separate from review-queue state.
- [x] Add select/clear all for matching candidates and select/clear all visible for filtered routes;
  verify the eight live candidates can be selected and cleared without creating a shortlist.
- [x] Increase AIBot context windows from 16/8 to 30/12 and validate the active n8n workflow with
  zero errors.
- [x] Replaced `deepseek-chat` with `deepseek-v4-pro` in low-latency mode after both
  `gpt-5.4-mini` and `gpt-4o-mini` hit the same OpenAI account rate limit. The verified production
  model keeps BIXOFFPSP memory and the existing tool contract; OpenAI remains an optional future
  comparison after account quota is restored, not a launch dependency.
- [x] Observe scheduled mailbox polling after the 10-message batch and 45-second work-budget fix;
  the five latest checked minute runs on 2026-08-30 completed successfully without a timeout.
- [ ] Run a separate shared-Supabase security review for RLS-disabled tables and authenticated
  security-definer RPCs before making any broad policy change.

### Project boundary and domain policy — decision 2026-08-21

- [x] Reserve this Codex task/chat for OfferPSP work and durable `BIXOFFPSP` context only.
- [x] Move Studio ONE, FitBot/FatBotSlim and other products to separate tasks/chats, including their
  Stripe products, n8n billing flows and product-specific implementation.
- [x] Record that BRAININDEX OÜ is the Estonian IT development company and may receive revenue for
  its own products to its own operating account; this does not make it the OfferPSP operator or
  default OfferPSP payee.
- [x] Keep `offerpsp.com` canonical. Allow only `offerspsp.com` to act as an OfferPSP mirror/clone,
  with canonicalization or redirects that preserve one search identity.
- [x] Keep all other owned domains independent; do not apply blanket OfferPSP cloning, redirects or
  shared SEO/GEO merely because the domains have the same owner.
- [ ] Continue Studio ONE/FitBot Stripe and n8n payment setup only in their dedicated tasks. No
  production billing change was authorized or completed in this OfferPSP task.
- [ ] Plan and verify any future cross-domain SEO/traffic work separately for each real product.

### Independent GCP reserve — project gate verified 2026-08-22

- [x] Create the separate Google Cloud project `OfferPSP Reserve Production` with project ID
  `offerpsp-reserve-prod` and project number `821675076620` under `No organization`.
- [x] Verify the project dashboard and verify that the project is not linked to a billing account.
- [x] Prepare ignored Terraform variables for `europe-west1`, PostgreSQL 17 regional HA and a
  scale-to-zero Cloud Run standby worker.
- [ ] Link a billing account only after explicit Boris confirmation of the estimated baseline cost:
  approximately EUR 205.65/month before VAT, exchange-rate changes and extra usage.
- [ ] After billing approval, run a reviewed Terraform plan, apply the reserve infrastructure,
  load secrets through Secret Manager, deploy an immutable worker image and verify reconciliation
  before declaring the reserve operational.

### Shared n8n recovery and route isolation — 2026-08-22

- [x] Re-enable `FitBot Reminders` (`qP2YR0aOJDsDfMir`) on its direct FitBot route, change its
  poll interval from 5 to 15 minutes and cap Supabase requests at two 30-second attempts.
- [x] Re-enable `⚙️ iGaming | Task Runner` (`s39doCFwQIKbN7sf`) on a 15-minute interval and route
  it to the new active `⚙️ iGaming | Dedicated Scheduled Agent` (`X0x0Y9XaO1FvUIFQ`) instead of
  the shared AIBot webhook. The exact authenticated Runner-to-dedicated route returned HTTP 200;
  dedicated execution `405443` finished successfully.
- [x] Disable only the legacy `Scheduler Trigger` in the shared AIBot
  (`IRB53X5NAS4wTuyU`). Its Telegram and Captain's Bridge triggers remain active.
- [x] Stop the actual execution storm: `Offer Parser Worker` (`MLDnePB4WW3jzX4S`) previously
  started every minute while each failed run lasted more than six minutes. It now runs every five
  minutes and fails within about 65 seconds when Supabase is unavailable. `Pre-Compliance PRO`
  (`wiEFFDaHd3uaJoJi`) now runs every 15 minutes with bounded retries.
- [ ] Keep the outage incident `PARTIAL` until Supabase is stable and the next normal FitBot and
  iGaming scheduled executions succeed. The n8n routes validate with zero errors, but Supabase SQL
  still intermittently terminates with a connection timeout and Auth refreshes still return 504.
  First bounded production runs `405456` (FitBot) and `405463` (iGaming) both stopped after about
  65 seconds at their initial Supabase reads instead of accumulating overlapping executions.
- [ ] Incident update 2026-08-23: exact executions `409263`, `409298`, `409305`, `409340` and
  `409346` again stopped at their first Supabase request after about 65 seconds, before either
  scheduled route reached AIBot or the dedicated iGaming agent. Independent Supabase Auth and
  heartbeat traffic returned 503/504, and a direct SQL health query terminated on connection
  timeout. To remove background pressure and alert churn, temporarily deactivated `FitBot
  Reminders`, `iGaming | Task Runner`, `Offer Parser Worker`, `Pre-Compliance PRO`, `FitBot —
  Cleanup Pending Food Logs` and `PSP Freshness Reminders`. Interactive Telegram/webhook workflows
  remain active. Do not reactivate the six pollers until SQL and REST health checks pass.
- [x] Recovery update 2026-08-24: restarted Supabase from the project dashboard after explicit
  Boris confirmation. Project returned to `ACTIVE_HEALTHY`; direct SQL succeeded with 15 total
  connections, 3 active and no idle-in-transaction sessions, and the newest API health requests
  returned HTTP 200. Reactivated all six temporary-disabled pollers. First post-restart iGaming
  Task Runner execution `409454` completed successfully in 0.39 seconds. FitBot's next scheduled
  production run remains the final route-specific confirmation.

## Production safety rules

- Never treat local tests or documentation as proof of production state.
- Do not apply production migrations from an uncommitted working tree.
- Import source offers as drafts only.
- Do not publish a batch with open `error` anomalies.
- Do not hard-code Antarex or any other PSP margin in source code. Configure margin through the
  versioned staff policy and verify the effective client rate before publication.
- A real client test must use a different authenticated account/session from staff.
- The legacy `psp_providers` table remains the AIBot research source, but it is no longer public:
  n8n uses service-only access and the cockpit reads it through staff-checked RPCs.
