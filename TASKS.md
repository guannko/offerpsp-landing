# OfferPSP tasks and verified state

Updated: 2026-07-30

## Current verified production

- `https://offerpsp.com` is deployed on Vercel.
- `/admin/` supports staff authentication with Google.
- Admin UI is RU-first with an RU/EN switch.
- Merchant form saves leads and sends Telegram/email notifications through AIBot.
- Lead quality scoring and deterministic provider-level matching run in Supabase.
- Admin lead inbox, filters, lead drawer, notes, tasks, shortlist and messages load.
- `/portal/` supports Google authentication and lead claiming by matching email.
- Shortlist sharing updates the lead/shortlist state.
- Provider-confidentiality hotfix is applied:
  - client shortlist no longer exposes provider name, website or internal IDs;
  - random client option codes are generated;
  - non-owner authenticated users receive zero client shortlist rows;
  - clients cannot read internal match or shortlist-item rows.

## Important current limitations

- Matching still uses legacy provider-level records, not normalized offer routes.
- The client portal UX is not intuitive and remains EN-only.
- The portal does not yet support interested/not-suitable/need-details actions.
- There is no `Request introduction` workflow yet.
- Introduction/Telegram/Zoom stages are not yet in the database pipeline.
- PSP offer ingestion, versioning, markup and admin management are not implemented.
- `psp_providers` is a legacy public table used by existing anonymous n8n REST workflows.
  Provider supply must move to a private/staff-only model after n8n receives a service
  credential.
- A real client-login test must use a separate/private browser session; an admin Supabase
  session on the same origin is not a client test.
- This document describes the current platform checkpoint; verify the active GitHub branch and deployment before continuing.

## Next architecture implementation

### 1. Private supply model

- [ ] Create internal provider table and automatic internal codes.
- [ ] Create provider contacts and relationship status.
- [ ] Create rate-card batches with immutable raw source/versioning.
- [ ] Create normalized offer routes and canonical niche dimensions.
- [ ] Create fee components, limits, settlement and risk terms.
- [ ] Create provider/route margin policies.
- [ ] Create client offer snapshots without provider identity.
- [ ] Migrate legacy providers safely.

### 2. Offer ingestion

- [ ] Paste/import raw Telegram offer.
- [ ] Parse one source into multiple route drafts.
- [ ] Detect duplicate blocks and previous-version changes.
- [ ] Flag malformed or ambiguous fields.
- [ ] Provide staff review and publish workflow.
- [ ] Add CSV/Google Sheets import after the text workflow works.
- [ ] Add n8n partner-update reminders and stale-offer alerts.

### 3. Seed/reference partners

- [ ] Import BR-Pay rate card dated 2026-07-23 as a draft batch.
- [ ] Set BR-Pay as strategic priority with margin normally included.
- [ ] Import Antarex source as a draft batch.
- [ ] Configure Antarex margin as not included.
- [ ] Ask Boris for the default Antarex PayIn/PayOut markup before publication.
- [ ] Ingest additional provider examples before finalizing parser edge cases.

### 4. Matching v2

- [ ] Match merchant request to active route niches.
- [ ] Use hard GEO/currency/flow/method/traffic/limit gates.
- [ ] Return `needs_clarification` when request data is insufficient.
- [ ] Calculate final client rates through margin policies.
- [ ] Rank by fit, freshness, economics, operations and strategic priority.
- [ ] Require staff confirmation before sharing.

### 5. Admin supply desk

- [ ] Add PSP partners section.
- [ ] Add rate-card inbox and parsing review.
- [ ] Add GEO/niche coverage matrix.
- [ ] Show base rate, margin and client rate separately.
- [ ] Add publish/pause/archive and history.
- [ ] Add offer freshness and last-verified indicators.

### 6. Client portal redesign

- [ ] Make RU default and add RU/EN.
- [ ] Replace the current progress-heavy layout with a guided next action.
- [ ] Show anonymous useful route details and client rates.
- [ ] Add `Interested`, `Need details`, `Not suitable`.
- [ ] Add selected-options summary.
- [ ] Add primary `Request introduction` CTA.
- [ ] Keep conversation compact and secondary.

### 7. Introductions

- [ ] Add `option_selected`, `provider_confirmed`, `telegram_created`,
  `zoom_scheduled`, `won`, `lost`.
- [ ] Store selected option, internal provider and responsible manager.
- [ ] Generate Telegram group name and introduction message.
- [ ] Store Telegram group link/date.
- [ ] Store Zoom link/date.
- [ ] Add AIBot reminders and follow-up.
- [ ] Track final cooperation result.

### 8. Search and PSP acquisition

- [ ] Add `Become an OfferPSP partner` funnel.
- [ ] Build sanitized SEO pages by GEO/method/vertical.
- [ ] Generate public content from active routes without provider identity.
- [ ] Add sitemap/schema/canonical strategy.
- [ ] Measure search → request → shortlist → introduction → cooperation.
