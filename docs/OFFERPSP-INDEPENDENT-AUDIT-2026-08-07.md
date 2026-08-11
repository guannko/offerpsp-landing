# OfferPSP Independent Audit

Date: 2026-08-07
Auditor: Claude Code (independent, read-only session)
Scope: production surfaces, code, Git, Supabase, n8n, Vercel

---

## Executive verdict

OfferPSP is a genuine, operational B2B payment-matching platform — not a prototype.
Its core journeys (lead intake → pre-compliance → staff matching → client workspace →
Deal Desk → Telegram introduction) are structurally complete and enforced at the database
layer. The Captain's Bridge, public landing and merchant portal load cleanly in production
with zero runtime errors in the last 7 days.

**What staff can do for real work today:**
- Receive, triage and qualify inbound merchant leads
- Run Pre-Compliance PRO screening (active n8n workflow)
- Build and publish PSP offer routes, manage ingestion queue, OCR sources
- Manually match routes to merchants and produce client-safe shortlists
- Manage the Deal Desk through PSP review, Telegram prep and result recording
- Operate a task/calendar workspace, send outbound email and Telegram
- Manage agent organizations, commissions and co-brand settings
- Review casino/PSP research base via AIBot intelligence tab

**What is not yet usable for real work:**
- Incoming `bizdev@offerpsp.com` email — IMAP credential blocked, workflow inactive
- Standalone `/matching` direct URL — descriptor screen only, no interactive UI
- Deep analytics (attribution, conversion rates, time-to-match, realized margin)
- P2 SEO/acquisition funnel

---

## 1. Production release evidence

| Layer | Verified result |
|---|---|
| Public landing | `https://offerpsp.com/` → HTTP 200, form renders, all sections visible |
| Merchant portal | `https://offerpsp.com/portal/` → HTTP 200, RU login form loads |
| Captain's Bridge | `https://ops-7q4m2x9k8v3n.vercel.app/` → HTTP 200 |
| `/admin/` on public site | HTTP 404 — correctly isolated |
| Vercel ops project | Current production: `dpl_Gnvz47wtTHrpvNdwpcHqViY7mg6h`, state READY |
| Vercel landing project | Current production: `dpl_3EEBskFqB7yH6nFKrDiQnFuAYVZi`, state READY |
| Local build | `npm --prefix platform-v2 run build` → success, 0 errors, 5 pre-existing warnings |
| ESLint | 0 errors, 5 pre-existing Fast Refresh warnings |
| Runtime errors (7 days) | 0 errors on ops project (Vercel) |
| Supabase migrations | 91 migrations applied, including 46 OfferPSP-specific; no gaps vs local tree |
| Git branch | `agent/offerpsp-platform`, HEAD `72ceb2b` |

### Git / deployment divergence — PARTIAL

The ops (Captain's Bridge) production deployment `dpl_Gnvz47wtTHrpvNdwpcHqViY7mg6h`
was built with **`gitDirty: "1"`** at commit SHA `3f16b63`. This means the deployed
code includes uncommitted changes that were not captured in git at deploy time. The
subsequent commits `3e9b90e` ("feat: add operations and integration controls") and
`72ceb2b` ("docs: record operations release audit") formalize those dirty changes.

The diff between SHA `3f16b63` and current HEAD includes 14 changed files and 1082
insertions — the full operations module (`OperationsWorkspace.tsx`, `TelegramWorkspace.tsx`,
`IntegrationsWorkspace.tsx`, `send-telegram.mjs`). These are believed to be in
production through the dirty build, but cannot be reproduced exactly from any committed
SHA.

**Impact:** the operations and integration controls deployed 2026-08-06 are in production
but not fully reproducible from git. Future rollbacks would need to rebuild from the
post-commit state.

The public landing/portal (`offerpsp-landing` project) is at `dpl_3EEBskFqB7yH6nFKrDiQnFuAYVZi`,
SHA `b9e61145` — clean (no dirty flag). The subsequent 4 commits contain only the operations
code that belongs to the Captain's Bridge project, so the portal deployment is not stale
for its own scope.

Local uncommitted state: `AGENTS.md` is modified (` M`), `CLAUDE.md` is untracked (`??`).
Neither is a blocking issue, but they should be committed to avoid another dirty deployment.

---

## 2. Module matrix

| Module | Status | Evidence |
|---|---|---|
| Command Center | `VERIFIED` | Routes, bridge data, attention queue |
| Inbox | `PARTIAL` | Loads, but lacks triage filters, bulk actions and inline assignment |
| Pipeline | `PARTIAL` | Verified read view; Kanban editing not present |
| Merchants | `VERIFIED` | Full CRUD, archive, purge, workspace |
| Merchant workspace | `VERIFIED` | Dossier, matching, Deal Desk, collaboration panels |
| PSP workspace | `VERIFIED` | Profile, contacts, routes, freshness, margin |
| Offers (catalogue) | `VERIFIED` | Filter, create, edit, pause, publish, copy, archive |
| Offer intake queue | `VERIFIED` | n8n `GOhHiyw8pNrBZeHy` active; OCR and file adapters working |
| Pre-Compliance PRO | `VERIFIED` | n8n `wiEFFDaHd3uaJoJi` active; queue, scoring, manual review |
| Matching (sidebar) | `PLACEHOLDER` | Hidden by `featureFlags.matching: false`; `/matching` URL renders descriptor screen only — no interactive matching UI |
| Deal Desk | `VERIFIED` | PSP review, Telegram prep, Zoom, won/lost, outcome tracking |
| База AIBot | `VERIFIED` | 222 casinos, 77 PSPs; CRUD editor functional |
| Communications — email | `VERIFIED` (outbound only) | Outbound ✅; inbound BLOCKED by IMAP credential |
| Communications — Telegram | `VERIFIED` | n8n `yCPozZQX7EoxQf6P` active; sends and logs |
| Tasks & calendar | `VERIFIED` | Create, edit, assign, filter, month/list views |
| Subagents | `VERIFIED` | Org lifecycle, invitations, member roles, commission ledger, co-brand |
| Analytics | `PARTIAL` | Funnel, 6-week trend, GEO, supply health present; attribution, rates, time-to-match, realized margin absent |
| Integrations | `VERIFIED` | Config storage, server-side health checks |
| Finance | `PLACEHOLDER` | `featureFlags.finance: false`; no route, no UI |
| Settings | `PLACEHOLDER` | `featureFlags.settings: false`; no route, no UI |

---

## 3. Visible decorative or dead controls

### Dead TailAdmin source directories

These directories exist in `platform-v2/src/pages/` but are **not routed** in `App.tsx`:

- `Charts/` (BarChart.tsx, LineChart.tsx)
- `Forms/` (FormElements.tsx)
- `Tables/` (BasicTables.tsx)
- `UiElements/` (Alerts.tsx, Avatars.tsx, Badges.tsx, Buttons.tsx, Images.tsx, Videos.tsx)

These are `DEAD CODE`. They cannot be reached from any production URL. They inflate the
repository but do not affect the product. `UserProfiles.tsx` also exists and is unused.
`Blank.tsx` and `Calendar.tsx` are unused page shells.

### `/matching` route — PLACEHOLDER

`/matching` is routed in `App.tsx` but renders `ModulePage module="matching"` which
displays a feature-description card ("Hard gates: GEO, currency, method, flow…")
with no interactive UI. The module is intentionally hidden from the sidebar by
`featureFlags.matching: false`. Staff who discover the direct URL see a dead end.

### Analytics gaps — PARTIAL, not decorative

The analytics module exists and shows a real commercial funnel. However the following
promised capabilities are absent: acquisition attribution, lead-quality breakdown by
source, conversion rates at each stage, PSP review acceptance/decline rates,
introduction → live cooperation conversion, time-to-match/launch, processing volume
and realized margin per route.

---

## 4. Missing end-to-end functions

### Inbound email → merchant history — BLOCKED

n8n workflow `N0GEPhmvvRD4KRhw` ("📥 OfferPSP | bizdev Inbox") has `active: false`
and `triggerCount: 0`. The IMAP credential for `bizdev@offerpsp.com` (GoDaddy) is not
installed. Incoming emails to this address are not ingested, not threaded and not
linked to merchant cards. The outbound path works; the inbound path is completely dark.

**Business impact:** any merchant, PSP or partner who replies to `bizdev@offerpsp.com`
generates a response that staff cannot see in the platform. They must check the
mailbox externally.

### First real subagent invitation — PARTIAL

The invitation flow, commission ledger and co-brand settings are production-ready.
The acceptance of a real invitation by an actual subagent and visual confirmation of
that organization's branding in the portal have not occurred. No synthetic user
was created to fake this check.

### Standalone matching UI — MISSING

The `/matching` route is a placeholder. Matching functionality exists inside the
merchant workspace (staff can manually select routes), but there is no dedicated
matching workbench for bulk or exploratory matching.

### Deep analytics — MISSING

All P2 analytics items (see module matrix above) remain unimplemented. Staff cannot
currently answer: how are leads acquired, which stage is the bottleneck, what is the
actual PSP review acceptance rate, how long does matching take, what realized margin
was generated.

---

## 5. Security and confidentiality findings

### Shared database security debt — ERROR level (not OfferPSP tables)

Supabase Security Advisor reports 16 ERROR-level findings on tables belonging to
other products sharing the same Supabase project:

- `public.payments` — RLS policy exists but RLS is not enabled. This table appears
  to belong to FatBotSlim or a legacy product. Direct anonymous access is possible.
- `public.bot_masters`, `bot_users`, `bot_master_schedules`, `bot_master_dayoffs`,
  `bot_master_custom_slots`, `bot_service_categories`, `bot_bookings`, `bot_services`,
  `bot_admins`, `bot_reviews`, `bot_gallery`, `bot_client_notes`, `bot_salon_settings`,
  `bot_audit_log` — RLS disabled in public schema (Studio ONE tables).

None of these errors are on OfferPSP tables. However, the shared database means
a compromised `authenticated` token from any product on this Supabase project could
potentially read these tables.

**Recommendation:** harden these tables in a separate non-OfferPSP rollout, or migrate
OfferPSP to a dedicated Supabase project.

### OfferPSP RLS posture — VERIFIED intentional

10 OfferPSP tables have `rls_enabled_no_policy` (INFO level). This is intentional:
RLS is enabled (block-by-default) and all access goes through `SECURITY DEFINER`
RPCs that call `is_offerpsp_staff()` or equivalent checks. This correctly enforces
the confidentiality model.

### Leaked password protection — WARN

Supabase project-level leaked password protection is not enabled (`auth_leaked_password_protection`).
This means staff accounts could set passwords that appear in known breach databases
without a warning.

### SECURITY DEFINER RPCs callable by `authenticated` — WARN (by design)

121 `authenticated_security_definer_function_executable` warnings from Supabase Advisor.
These are all OfferPSP RPCs designed to run with staff checks inside the function body.
This is the correct pattern. The Advisor flags it generically.

### `anon`-callable SECURITY DEFINER functions

Supabase Advisor flags `increment_messages_count`, `k_auto_confirm_email` and
`k_auto_join_workspace` as callable by `anon`. These belong to other products
(FatBotSlim, Kartoteka). They are not OfferPSP risks but are shared-project debt.

### Provider identity exposure — no finding

No evidence of provider names, internal IDs, source rates or margins being exposed
in client-facing pages or API responses. The `SECURITY DEFINER` / RLS separation
appears correctly implemented in both the portal and the client-facing RPCs.

### Historical n8n token revocation — PARTIAL

TASKS.md records this as `P0/PARTIAL`: the hardcoded external-secret node was removed
from the active Email Sender graph, but the historical n8n version may still contain
the previous credential value. This token has not been confirmed revoked.

---

## 6. Data and model inconsistencies

- **Antarex margin not set.** Antarex (`PSP-000002`) remains unpublished with intentionally
  unset OfferPSP margin. 24 draft routes exist with 45 open review warnings but zero
  published routes. This is a deliberate business decision, not a bug.

- **Field-by-field rate-card version diff absent.** The rate-card version register is
  visible; a visual diff between two versions is not implemented.

- **`offerpsp_email_threads` and `offerpsp_email_messages`** have `rls_enabled_no_policy`
  but are accessed only through `get_offerpsp_mail_center` RPC — intentional.

---

## 7. UX issues observed from outside

### Public landing

- A honeypot field labeled "Leave this field empty" is visible in source HTML. Legitimate
  anti-spam technique but visible to screen readers and plain HTML inspection.
- Copyright year "© 2026" is technically correct for a current year but unusual-looking.
- The "Open Telegram" CTA on landing has no label for where the Telegram link leads.
  No visible Telegram handle or group URL is shown.

### Merchant portal

- Portal loads in RU by default. No language toggle is shown on the login page; language
  selection appears post-login. English-speaking merchants face a Russian login screen.
- The portal correctly shows an empty workspace with a clear "New payment request" action
  when no requests exist.

### Captain's Bridge

- Cold load is slow. Three JS chunks exceed 500 KB after minification (pdf.worker 1.2 MB,
  react 249 KB, main index 569 KB). No lazy loading or code-splitting is applied to heavy
  Captain modules. TASKS.md records this as an open P1.
- Module label "Задачи и календарь" maps to path `/operations` — the URL and the label
  are mismatched (minor but confusing for bookmarks).
- Inbox has no filters, assignment UI or bulk actions. Staff see a flat list.
- Pipeline is a read-only projection with no drag-to-move Kanban editing.

---

## 8. Prioritized remediation plan

### P0

| # | Finding | Action |
|---|---|---|
| 1 | Historical n8n token not confirmed revoked | Confirm revocation of the external-secret credential that was in the Email Sender graph. Check n8n version history and revoke the token if still active. |
| 2 | `public.payments` RLS not enabled | Enable RLS on `payments` table or migrate FatBotSlim to its own Supabase project. Current state allows anonymous read. |

### P1

| # | Finding | Action |
|---|---|---|
| 3 | Dirty git deployment | Before next ops deployment: commit local `AGENTS.md` and `CLAUDE.md`, then deploy from clean working tree. |
| 4 | IMAP credential for bizdev@offerpsp.com | Install GoDaddy IMAP password in n8n credential store, activate workflow `N0GEPhmvvRD4KRhw`. |
| 5 | Inbox: no filters/assignment/bulk | Add status filter, assignee picker and bulk-mark-read/archive actions. |
| 6 | Pipeline: read-only projection | Add drag-and-drop Kanban or inline status selector. |
| 7 | Analytics: attribution and rates | Implement lead source attribution, stage conversion rates, PSP review rates, time-to-match. |
| 8 | Leaked password protection | Enable Supabase Auth leaked-password protection for the project. |
| 9 | First real subagent invitation | Accept a real invitation with an actual subagent email and confirm co-branded portal. |

### P2

| # | Finding | Action |
|---|---|---|
| 10 | Dead TailAdmin directories | Delete `Charts/`, `Forms/`, `Tables/`, `UiElements/`, `UserProfiles.tsx`, `Blank.tsx`, `Calendar.tsx` from `platform-v2/src/pages/`. |
| 11 | Rate-card version diff | Add field-by-field visual diff between two batch versions in the PSP workspace. |
| 12 | Studio ONE bot_* tables | Enable RLS on the 14 Studio ONE bot tables sharing this Supabase project. |
| 13 | Chunk size | Split the PDF worker and heavy Captain modules with dynamic imports; add a bounded client cache for the Captain's Bridge data loader. |
| 14 | Portal language on login | Show an EN/RU toggle on the portal login page, not only post-authentication. |
| 15 | Matching placeholder | Either implement the matching workbench or remove the `/matching` route to prevent staff confusion. |
| 16 | Telegram landing CTA | Add a visible Telegram handle or description to the "Open Telegram" button on the public landing. |
| 17 | Analytics — deep metrics | Realized margin per route, processing volume, acquisition/campaign attribution, PSP review acceptance rates. |

---

## 9. Evidence for material claims

| Claim | Evidence |
|---|---|
| `/admin/` returns 404 | `curl -s -o /dev/null -w "%{http_code}" https://offerpsp.com/admin/` → 404 |
| offerpsp.com returns 200 | curl → 200 |
| Portal returns 200 | curl → 200 |
| ops bridge returns 200 | curl → 200 |
| Build passes | `npm --prefix platform-v2 run build` exit 0, 2026-08-07 |
| ESLint: 0 errors | `npm --prefix platform-v2 run lint` → 5 warnings, 0 errors |
| 91 Supabase migrations | `list_migrations` tool, project `xcizofpejsomjiflesbx` |
| n8n bizdev Inbox inactive | `search_workflows` → `N0GEPhmvvRD4KRhw` `active: false`, `triggerCount: 0` |
| 6/7 other OfferPSP workflows active | `search_workflows` → all others `active: true` |
| ops deployment dirty | `list_deployments` → `dpl_Gnvz47wtTHrpvNdwpcHqViY7mg6h` `gitDirty: "1"` |
| TailAdmin dirs not routed | `cat platform-v2/src/App.tsx` — no route to Charts/, Forms/, Tables/, UiElements/ |
| matching hidden by feature flag | `platform-v2/src/config/modules.tsx:39` `matching: false` |
| /matching shows ModulePage only | `platform-v2/src/pages/Platform.tsx:447` `ModulePage` renders feature descriptor |
| 16 ERROR-level security findings | Supabase Advisor output — all on non-OfferPSP shared tables |
| payments table RLS disabled | Advisor: `policy_exists_rls_disabled` + `rls_disabled_in_public` on `public.payments` |
| OfferPSP RPCs: anon denied | Advisory shows 121 `authenticated_security_definer_function_executable` — no anon grants on OfferPSP RPCs |
| Chunks >500KB | Build output: pdf.worker.min 1262 KB, index-i-QlGAwm 569 KB, index-C19fuKXt 502 KB |
| AGENTS.md modified locally | `git status --short` → ` M AGENTS.md` |
| CLAUDE.md untracked | `git status --short` → `?? CLAUDE.md` |
| ops production SHA `3f16b63` | `list_deployments` → `dpl_Gnvz47wtTHrpvNdwpcHqViY7mg6h` SHA `3f16b63c...` |
| 4 commits behind public landing | `git diff b9e61145..HEAD --stat` → 14 files, 1085 insertions |
| Runtime errors: 0 | `get_runtime_errors` → "No runtime errors found" (7-day window) |
