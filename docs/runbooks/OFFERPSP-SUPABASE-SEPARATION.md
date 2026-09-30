# OfferPSP Supabase separation runbook

Status: `PARTIAL` — production is cut over to the dedicated target and staff Google Auth is verified; OfferPSP Operator reauthorization plus the remaining PSP/merchant acceptance checks are pending.

## Goal

Move OfferPSP from the shared Supabase project into an independent production project without copying unrelated BIX applications and without exposing private provider, merchant, margin or source data.

The source remains available as the rollback data plane until the new project passes authenticated production smoke tests and a stable observation window.

## Verified source inventory — 2026-08-26

- Supabase organization: `guannko`, Free plan.
- Source region: `eu-west-1`, PostgreSQL 17.
- OfferPSP application footprint: 72 relevant tables, approximately 2,349 rows and 8.4 MB including indexes.
- Reproducible schema: all 114 local migrations replay successfully in a clean PGlite database.
- Auth identities referenced by OfferPSP: 9 users in total; 3 staff, 1 provider member and 3 merchant users, with role overlap possible.
- OfferPSP Storage: 2 private buckets, 7 objects and approximately 23 KB.
- OfferPSP Edge Functions: `offerpsp-invite-member` and `offerpsp-ingest-email`.
- Unrelated shared-project assets must not move: the public `fitbot-images` bucket and six non-OfferPSP Edge Functions.

## Verified staged target — 2026-08-26

- Project: `offerpsp-production` (`iceopurxqzqmwtcmwfzl`), `eu-west-1`, Free plan.
- Schema: 117 recorded migrations including the isolated legacy baseline, explicit `offerpsp_leads` RLS and the rate-card history constraint fix.
- Data: 69 selected application tables, 2,561 rows, with source/target counts and per-row content hashes matching.
- Auth: exactly 9 referenced users and 9 identities were copied; no old sessions or unrelated BIX users were copied. New target sessions are created only by fresh post-cutover sign-ins.
- Integrity: zero foreign-key orphans; five serial sequences reset to their migrated maxima.
- Storage: 2 private OfferPSP buckets, 7 objects and 23,191 bytes; every object verified by SHA-256 after target download.
- Edge Functions: `offerpsp-invite-member` and `offerpsp-ingest-email` are active with byte-identical source code and their original JWT boundaries.
- Exclusions: old MCP OAuth tokens, one-time bulk confirmations and all resilience outbox/lease/delivery state start empty.
- Advisors: zero security `ERROR` findings. Remaining security warnings are the established guarded `SECURITY DEFINER` RPC model plus leaked-password protection being disabled.
- Production Vercel clients and active OfferPSP n8n workflows now point to the target. The source remains unchanged as the rollback data plane.

## Target boundary

The dedicated project owns only:

- OfferPSP public and private database objects;
- OfferPSP Auth users and memberships;
- `offerpsp-merchant-documents` and `offerpsp-private-sources` Storage buckets;
- the two OfferPSP Edge Functions;
- OfferPSP Realtime publications, Auth settings and redirect URLs;
- OfferPSP Vercel, n8n and MCP credentials.

No FitBot, Card Index, Studio ONE or other BIX tables, buckets, functions, users or secrets are copied.

## Migration sequence

### 1. Reduce source load

- Replace 30-second full Control Bridge refreshes with five-minute cached refreshes.
- Refresh only leads on lead Realtime events.
- Poll SEO/GEO analytics every five minutes, with a 15-second fallback only while an audit is active.
- Poll ingestion every 15 seconds only while work is queued or processing; use two minutes while idle.
- Deploy and observe the source before beginning the data move.

### 2. Provision the target

- Create `offerpsp-production` in the `guannko` organization and `eu-west-1` region after explicit cost confirmation.
- Record the project reference only in deployment configuration and the project routing documentation.
- Do not switch any production client or worker at this stage.

### 3. Build and verify the empty target — complete

- Apply the 114 ordered migrations to the new database.
- Run database advisors and the full migration/security regression suite.
- Verify that anon and authenticated roles have only the intended Data API grants and every exposed table has RLS.
- Configure the private Storage buckets and policies.
- Deploy only the two OfferPSP Edge Functions with their current JWT boundaries.

### 4. Migrate application data — staged copy complete

- Export only the 72 OfferPSP/AIBot tables required by the product.
- Preserve application UUIDs, immutable source hashes, audit records, route versions and private schema separation.
- Exclude transient OAuth access/refresh/code records; users must authorize the MCP connection again against the new project.
- Copy only the seven OfferPSP Storage objects and verify object hashes/counts.

### 5. Re-establish Auth cleanly — complete

Do not copy the complete shared `auth` schema because it contains identities belonging to other BIX products.

- Preserve the nine referenced OfferPSP user IDs and identities so existing staff, merchant, provider-membership and audit foreign keys remain valid.
- Do not copy Auth sessions, refresh tokens, MFA state or unrelated users; every user must sign in again after cutover.
- Copy the Google provider credential and only the OfferPSP site/redirect URLs into the target before switching clients.
- Keep the source project online until every required staff/provider/merchant account can authenticate and access only its own workspace.

Verified after cutover:

- Google OAuth callback is registered for the target and returns to the public `/signin` route.
- The production frontend uses the active target publishable key.
- A fresh Google sign-in creates a target session, clears the callback fragment and opens Control Bridge as the active `owner` staff member.

### 6. Connect integrations — production connections complete, Operator reauthorization pending

- Add target Supabase URL and keys to staged Vercel environments.
- Create target-specific n8n credentials and test the offer parser, pre-compliance and freshness workers against staged data.
- Configure OfferPSP MCP OAuth and reauthorize the Operator.
- Verify live email ingestion, private Storage, Realtime and invite redirects without sending external business messages.

Current state:

- Both Vercel production projects use the target URL and active target keys.
- The dedicated n8n credential passes its connection test; all six active workflows with hardcoded Supabase URLs now reference the target.
- The Operator gateway is reachable but its old OAuth refresh token is intentionally invalid because OAuth clients were not migrated. A fresh Codex authorization is required.

### 7. Final cutover — partial

- Take a final source backup and record source/target row and Storage counts.
- Enter a short controlled write pause for the final data delta.
- Switch OfferPSP Vercel, n8n and MCP configuration to the target.
- Run authenticated staff, PSP and merchant smoke tests plus one review-only synthetic offer.
- Resume writes only after the checks pass.

Verified:

- Exact common-column row content matches across all 69 copied application tables.
- All seven Storage object hashes match.
- Production deployments are `READY` and public/static clients contain only the target project reference and active target publishable key.
- Staff Google Auth and the Control Bridge working-data load pass in production.

Pending:

- Reauthorize OfferPSP Operator and rerun `system_health`.
- Run read-only PAYOK lookup through Operator.
- Complete explicit merchant and PSP portal isolation smoke tests before declaring the observation gate closed.

### 8. Rollback and retirement

- Rollback is an environment-variable switch to the unchanged source project.
- Do not delete source OfferPSP data during the initial migration or observation window.
- After a stable period, revoke old OfferPSP credentials and archive the old tables separately; deletion requires a new explicit decision.

## Acceptance gates

- No unrelated BIX table, user, bucket or Edge Function exists in the target.
- `PARTIAL`: staff authentication and protected Control Bridge load pass; merchant and PSP portal isolation smoke tests remain.
- `PENDING`: PAYOK test intake reaches review with zero automatic publication.
- `VERIFIED`: the dedicated n8n credential connects and active OfferPSP workflows reference the target; post-cutover scheduled execution observation remains.
- `PENDING`: Operator health and a read-only PAYOK lookup succeed through the new project after OAuth reauthorization.
- `VERIFIED`: source and target row content, route data and Storage object hashes reconcile at the cutover checkpoint.
- Rollback to the source is tested before production writes resume.
