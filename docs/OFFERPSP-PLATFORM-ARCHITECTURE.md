# OfferPSP platform architecture

Updated: 2026-07-30

## Product definition

OfferPSP is a confidential two-sided B2B payment-matching and introduction platform.

It connects:

- merchants searching for payment solutions;
- PSPs searching for qualified merchant demand.

OfferPSP is not a public PSP directory. The platform may publish availability, coverage,
methods, limits and client-facing rates, but it must not publish the provider supplying a
specific route.

The core promise is:

> A merchant submits one request, receives a relevant anonymous shortlist and gets a
> controlled introduction to an appropriate PSP.

## Strategic objective

OfferPSP must become a place merchants and PSPs actively search for, find and consider useful.

The growth loop is:

```text
More PSP partners
→ more current offer routes and GEO coverage
→ more useful search pages and matching
→ more merchant requests
→ more qualified introductions for PSPs
→ more PSP partners
```

## End-to-end business flow

```text
Merchant request
→ qualification
→ offer-route matching
→ anonymous shortlist
→ merchant selects an option
→ OfferPSP prepares and sends the merchant dossier
→ PSP reviews the merchant
→ PSP accepts, declines or requests more information
→ shared Telegram group is created
→ merchant and PSP meet
→ Zoom call
→ cooperation agreed or declined
```

OfferPSP's delivery is complete when the merchant and PSP have been introduced in a shared
working channel, completed the commercial discussion and agreed whether to cooperate.

Recommended operational stages:

1. `new`
2. `qualifying`
3. `matching`
4. `shortlist_ready`
5. `shared`
6. `option_selected`
7. `dossier_ready`
8. `provider_reviewing`
9. `provider_needs_info`, `provider_accepted` or `provider_declined`
10. `telegram_created`
11. `zoom_scheduled`
12. `won` or `lost`

## Runtime components

| Component | Responsibility |
|---|---|
| `offerpsp.com` | Search-facing content, merchant intake and PSP partner acquisition |
| `/admin/` | Staff-only lead desk, offer supply, matching, introductions and analytics |
| `/portal/` | Short merchant flow: understand options, select and request an introduction |
| Supabase Auth | Staff, merchant and later PSP identities |
| Supabase Postgres | Source of truth for demand, supply, matching and introductions |
| n8n / AIBot | Telegram/email notifications, parsing, reminders and operational jobs |
| Vercel | Frontend hosting |
| Telegram | Shared merchant–PSP–OfferPSP working channel |
| Zoom | Commercial/technical call arranged after introduction |

Supabase is the source of truth. AIBot is the automation layer, not the database.

## Demand-side data

Current tables:

- `offerpsp_leads`: merchant requests;
- `offerpsp_tasks`: staff and automated work;
- `offerpsp_lead_activities`: operational timeline;
- `offerpsp_conversations` and `offerpsp_messages`: portal communication;
- `offerpsp_notifications`: notification audit;
- `offerpsp_staff_members`: staff authorization.

Future demand model should separate:

- merchant organization;
- merchant contacts;
- individual requests;
- current and future payment needs;
- merchant due-diligence and qualification dossier;
- PSP review decisions and requested clarifications;
- selected anonymous options;
- introductions and results.

`casino_leads` remains the outbound prospecting database and is not automatically merged with
inbound OfferPSP requests.

### Merchant dossier

A route match is only an eligibility recommendation. The PSP makes the final decision whether
to accept the merchant.

Before an introduction, OfferPSP must prepare a structured dossier containing at least:

- legal/company name, brand and responsible contact;
- live product, merchant or online-casino URL;
- company registration GEO and target/traffic GEOs;
- vertical and business model;
- licence status: licensed, pending or unlicensed;
- licence jurisdiction, number and evidence URL when available;
- expected monthly processing turnover and currency;
- average transaction value when available;
- required currencies, methods and PayIn/PayOut flows;
- launch timeline, current processing setup and material risk notes;
- source and verification status for every important claim.

The dossier shown to the PSP must distinguish verified facts, merchant-provided statements and
missing information. Missing mandatory fields produce `needs_clarification`.

After the merchant selects an anonymous option:

1. staff verifies the dossier and the current offer;
2. the corresponding PSP receives the dossier through the approved private channel;
3. the PSP returns `accept`, `decline` or `request_more_information`;
4. a decline remains internal and does not reveal the provider to the merchant;
5. only `accept` allows provider disclosure and creation of the shared working channel.

## Supply-side hierarchy

Do not model one PSP as one offer.

```text
Provider
└── Rate-card batch/version
    └── Offer route
        ├── pricing components
        ├── limits
        ├── settlement
        ├── risk terms
        └── operational requirements
```

Definitions:

- **Provider**: the real PSP, internal contacts and commercial relationship.
- **Rate-card batch**: a dated message or file received from a PSP.
- **Offer route**: one normalized payment niche.
- **Client offer snapshot**: a sanitized, marked-up, anonymous option shared with one merchant.

See `OFFERPSP-OFFER-MODEL.md` for the detailed structure.

## Payment niches

An offer route is indexed by:

```text
GEO
+ currency
+ PayIn/PayOut flow
+ payment rail/method
+ traffic type
+ vertical/risk appetite
+ integration
+ limits and operating conditions
```

Example canonical niche key:

`IN | INR | UPI | P2P | FTD | PAYIN`

Several PSPs may have routes in the same niche. Matching compares the competing routes, not
only provider-level records.

## BR-Pay and Antarex

BR-Pay is the primary strategic partner, but strategic priority must never override hard
eligibility.

- BR-Pay offer rates normally include the agent margin.
- Antarex source rates do not include OfferPSP's margin.
- Both providers publish multi-route rate cards containing different GEOs, methods, flows,
  traffic types, limits and settlement conditions.
- A route must be selected and scored independently from other routes in the same rate card.

## Rates and OfferPSP margin

Never modify or lose the partner's source rate.

Store:

```text
partner/base rate
+ OfferPSP markup
= client rate
```

Markup policies:

- `included`: partner confirms the agent margin is already included;
- `percentage_points`: add, for example, 1 percentage point;
- `relative_percent`: multiply the source fee;
- `fixed`: add a fixed amount and currency;
- `hybrid`: percentage plus fixed fee;
- `override`: negotiated rate for one route or merchant.

Allow separate rules for:

- PayIn;
- PayOut;
- settlement;
- fixed transaction fee;
- merchant-specific pricing.

The admin interface shows all three layers. The client sees only the final client rate.

## Offer ingestion and updating

Supported sources:

- pasted Telegram text;
- manual admin form;
- CSV or Google Sheets;
- structured API;
- n8n ingestion from partner channels.

Safe workflow:

```text
Raw partner message
→ immutable source snapshot
→ parser creates a draft batch
→ normalization into routes and fee components
→ anomaly and duplicate detection
→ staff reviews the diff
→ publish a new version
→ supersede, but never delete, the previous version
```

The parser must flag ambiguity rather than invent a value.

Known examples requiring review:

- malformed transaction maxima;
- currency codes used as GEO codes;
- settlement rates based on exchange order-book positions;
- payout limits described as several split checks;
- percentage plus fixed fees;
- duplicated blocks inside one source message.

## Confidentiality and identifier model

Three identity layers are required:

1. **Internal provider ID** — automatically assigned and staff-only.
2. **Internal route/offer ID** — automatically assigned and staff-only.
3. **Public option code** — random and generated per shortlist item.

Example:

```text
Internal provider: PSP-000143 → Antarex
Internal route: OFF-002981
Client option: OP-7F31A2C9
```

The public option code must not be deterministic or reusable as a provider alias.

Client-facing output must exclude:

- provider name and website;
- internal IDs;
- partner contact;
- source rate;
- margin configuration;
- matching internals that can fingerprint the provider.

The controlled reveal happens only when OfferPSP organizes the shared introduction.

## Database isolation

Client confidentiality must be enforced in Postgres:

- provider and offer mapping moves to an internal/private or staff-only schema;
- clients cannot select `offerpsp_matches` or internal shortlist items;
- a client-safe projection returns only rows owned by `auth.uid()`;
- the projection contains sanitized option snapshots;
- staff retain full mapping and commercial data;
- n8n uses a service credential before legacy public supply tables are locked down.

The migration `20260730_offerpsp_provider_confidentiality.sql` is an immediate hotfix:

- removes provider identity from the client shortlist view;
- removes client RLS policies on internal matches/items;
- adds random option codes;
- filters the client view by the authenticated lead owner.

The legacy `psp_providers` table remains a migration concern because existing workflows use
anonymous REST access.

## Matching engine

Matching should use four stages:

1. **Hard eligibility**  
   Active route, GEO, currency, flow, method, traffic, vertical, integration and limits.
2. **Commercial calculation**  
   Apply the correct provider/route/merchant margin policy.
3. **Ranking**  
   Fit, rate, settlement, freshness, operational quality and strategic priority.
4. **Staff review**  
   Confirm offer freshness and publish a sanitized shortlist.

AI may explain and help rank structured eligible routes. It must never invent a provider,
capability or rate.

If required information is missing, the result should be `needs_clarification`, not a set of
generic identical candidates.

## Client cabinet

The client cabinet is a short guided workflow, not a full CRM.

Required structure:

1. clear current state and next action;
2. anonymous client-safe options;
3. useful comparison of GEO, methods, limits, settlement and final rate;
4. actions: `Interested`, `Need details`, `Not suitable`;
5. selected-option summary;
6. primary CTA: `Request introduction`;
7. compact conversation/help channel.

RU is the default; EN is optional.

After introduction:

> The introduction has been organized. Further discussion continues in the shared Telegram
> channel.

## Introduction workflow

When a merchant requests an introduction:

1. notify staff through AIBot;
2. reveal the internal provider and contact to staff only;
3. validate the mandatory merchant dossier;
4. confirm the offer is current;
5. send the dossier to the PSP for private review;
6. record `accept`, `decline` or `request_more_information`;
7. generate a Telegram group title and introduction message only after acceptance;
8. staff creates the group and adds merchant, PSP and AIBot;
9. store group link and creation date;
10. record Zoom date/link;
11. follow up until `won` or `lost`.

The standard Telegram Bot API does not create groups. Start with the hybrid workflow above.

Commercial lead registration and partner agreements protect OfferPSP's commission after the
provider identity is intentionally disclosed.

## Search and acquisition

The private offer database should generate sanitized search pages by:

- GEO;
- currency;
- payment method;
- flow;
- traffic type;
- vertical;
- settlement type.

Example public topic:

`India · INR · UPI P2P for iGaming`

Publish useful availability, requirements, ranges and explanations without provider identity
or source pricing.

Primary acquisition paths:

- merchant search pages;
- PSP partner onboarding;
- Telegram content;
- email/CRM follow-up;
- referrals and direct outreach.

Research references:

- `https://www.aboutpayments.com/en-us/provider-selector` — PSP discovery, market coverage
  and competitor-flow research;
- `https://paymentproviders.io/` — additional PSP discovery and offer taxonomy research;
- `https://design-system.service.gov.uk/components/task-list/` — task-based client cabinet
  UX; this is not a PSP directory.

## Success metrics

- organic visitors by GEO/method page;
- merchant request conversion;
- qualified request rate;
- time to relevant shortlist;
- merchant option-selection rate;
- introduction requests;
- complete merchant dossier rate;
- PSP review acceptance and clarification rates;
- time from dossier submission to PSP decision;
- PSP confirmations;
- Telegram groups created;
- Zoom calls scheduled;
- cooperation agreements;
- offer freshness and coverage gaps;
- active PSP partners and active routes.
