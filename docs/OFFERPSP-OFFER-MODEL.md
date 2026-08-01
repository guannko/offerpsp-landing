# OfferPSP offer and route model

Updated: 2026-07-30

## Why this model exists

A real PSP message is usually a rate card containing many payment routes. It is not a single
offer and cannot be represented safely as one provider record.

The model must:

- preserve the exact source;
- normalize comparable fields;
- support irregular commercial terms;
- version every update;
- calculate OfferPSP's margin;
- keep provider identity confidential;
- power matching, admin operations and sanitized search content.

## Entity map

```text
Provider
├── Provider contacts
├── Margin policy
└── Rate-card batches
    └── Offer routes
        ├── traffic tiers
        ├── payment flows
        │   └── fee components
        ├── transaction limits
        ├── settlement rules
        ├── risk terms
        └── operational notes

Merchant request
└── Route matches
    └── Reviewed shortlist
        └── Anonymous client snapshots
            └── Introduction
```

## Provider

Suggested fields:

| Field | Meaning |
|---|---|
| `id` | UUID/internal primary key |
| `internal_code` | Human-safe internal code such as `PSP-000143` |
| `legal_name` | Real provider name |
| `brand_name` | Internal operational name |
| `website` | Internal-only website |
| `strategic_priority` | Commercial priority, never a hard eligibility override |
| `relationship_status` | prospect, active, paused, archived |
| `margin_included_default` | Whether source rates normally include OfferPSP commercial margin |
| `default_margin_policy_id` | Provider-wide fallback |
| `owner_user_id` | Internal relationship owner |
| `last_verified_at` | Relationship verification |

Provider contacts should be a separate one-to-many table with role, region, Telegram, email,
timezone and active status.

## Rate-card batch

One received message/file/version.

| Field | Meaning |
|---|---|
| `id` | Batch UUID |
| `provider_id` | Internal provider |
| `source_type` | Telegram, email, file, CSV, API, manual |
| `source_reference` | Internal message/file reference |
| `source_text` | Immutable raw source |
| `source_hash` | Duplicate detection |
| `source_effective_date` | Date written by the partner |
| `received_at` | Date received by OfferPSP |
| `status` | draft, review, published, superseded, rejected |
| `parser_version` | Parser/audit version |
| `published_by` | Staff reviewer |
| `published_at` | Publication timestamp |

Never overwrite a published batch.

## Offer route

One normalized payment niche.

Core identity:

- provider and batch;
- internal route code;
- client-safe title template;
- active/draft/paused/expired status;
- effective and expiry dates;
- freshness/review interval.

Coverage:

- country/GEO codes;
- blocked GEOs;
- transaction and settlement currencies;
- global/regional availability;
- card-issuance requirements.

Product:

- PayIn, PayOut or both;
- ecom, P2P, P2C, C2C, UPI, IMPS, SBP, QR, bank transfer, card acquiring;
- card brands, banks and wallets;
- FTD, Trusted/STD or both;
- supported verticals and prohibited verticals;
- integration: H2H, H2C, API, DeepLink, hosted or manual.

## Fee components

Do not store a whole commercial model in one text field.

Each component should include:

| Field | Example |
|---|---|
| `flow` | payin, payout, settlement, refund, chargeback |
| `traffic_tier` | FTD, Trusted |
| `method_scope` | Visa, Mastercard, UPI, all |
| `region_scope` | EEA, RoW, all |
| `fee_type` | percent, fixed, percent_plus_fixed |
| `base_percent` | `6.0` |
| `base_fixed` | `0.30` |
| `base_fixed_currency` | EUR |
| `applies_on` | success, decline, both |
| `minimum_fee` | optional |
| `maximum_fee` | optional |

Examples this must support:

- `6%`;
- `6% + €0.30`;
- Visa `2.2% + €0.50`, Mastercard `2.4% + €0.50`;
- FTD `9%`, Trusted `7.5%`;
- PayOut `4.5% + 6 INR`;
- a fee charged on both success and decline.

## OfferPSP margin policy

Store source economics and client economics separately.

Suggested policy fields:

| Field | Meaning |
|---|---|
| `scope` | provider, route, flow or merchant override |
| `mode` | included, percentage_points, relative_percent, fixed, hybrid |
| `flow` | payin, payout, settlement or all |
| `percent_value` | percentage points or relative percent |
| `fixed_value` | fixed markup |
| `fixed_currency` | markup currency |
| `rounding_rule` | client presentation |
| `effective_from/to` | version interval |

Calculation examples:

```text
Base 6% + 1 percentage point = client 7%
Base 6% + €0.30 + markup €0.20 = client 6% + €0.50
BR-Pay OfferPSP margin included = direct-client rate equals approved source/client rate
```

The generated client offer must retain a calculation audit:

- source component ID;
- margin policy ID;
- base values;
- calculated client values;
- calculation timestamp and version.

## Subagent resale layer

For an agent-managed merchant, calculate pricing in a fixed order:

```text
PSP source rate
+ OfferPSP margin policy
= OfferPSP direct-client rate
+ agent margin policy
= final merchant rate
```

Agent margin policies are separate private records and may be scoped to the agent,
merchant organization, lead, route and flow. A missing agent policy blocks snapshot creation;
it must never silently fall back to zero. The client snapshot strips the source fee ID,
OfferPSP margin mode and agent margin mode and contains only the final merchant rate.

Agent commission accounting is a separate ledger with projected, approved, earned, paid and
void states. It does not modify historical shortlist snapshots.

## Limits

Support separate limits by:

- flow;
- currency;
- method;
- traffic tier;
- transaction;
- card/account;
- day and month;
- amount and count.

Store both normalized values and original notes for unusual cases.

## Settlement

Settlement is not one percentage.

Fields may include:

- currency;
- fee percent and fixed fee;
- period: T+0, T+1, T+3, weekly;
- minimum amount;
- exchange source: Binance, Kraken, Rapira, XE, Google or custom;
- order-book side/position/averaging rule;
- available weekdays;
- netting percentage;
- liquidity requirements;
- operational notes.

## Risk terms

- rolling reserve percentage, days and cap;
- refund availability and fee;
- chargeback availability, fee and penalty;
- fines reimbursement;
- traffic-age or deposit-history requirements;
- frequency and attempt limits;
- licence/KYC requirements.

## Canonical niche keys

A canonical key helps search and compare routes.

Example:

`IN|INR|PAYIN|UPI|P2P|FTD|H2H`

Do not force every route into one flat string. Store normalized dimensions and generate the
key from them.

## Ingestion validation

The importer must flag:

- invalid or confused country/currency codes;
- malformed numbers;
- min greater than max;
- missing currency;
- duplicate blocks;
- conflicting rates for the same tier;
- percentage plus fixed fee lost during parsing;
- unclear settlement spread;
- unclear units;
- stale or undated sources.

The parser creates drafts only. A staff member publishes them.

## Real-source observations

### BR-Pay rate card dated 2026-07-23

Contains approximately 14 distinct routes across:

- Uzbekistan;
- Kyrgyzstan;
- India;
- worldwide trusted ecom;
- Azerbaijan;
- several Russian P2P, C2C, SBP, OZON and DeepLink products.

It demonstrates:

- FTD versus Trusted pricing;
- ecom and P2P variants;
- approval-rate fields;
- complex settlement sources;
- card/month limits;
- risk fees and blocked GEOs;
- ambiguous/malformed numeric values requiring review.

BR-Pay is the primary partner and rates normally include the existing OfferPSP percentage.

### Antarex offer

Contains many routes and sub-products across RUB, UZS, KGS, AZN, ARS, KRW, INR, EUR, TRY,
PLN and AUD.

It demonstrates:

- provider rates that require OfferPSP markup;
- percentage plus fixed fees;
- card-brand and region pricing tiers;
- FTD versus Trusted tiers;
- bank/method variants inside one GEO;
- scheduled settlement days;
- exchange-order-book rules;
- success and decline fees;
- duplicated source blocks that must be deduplicated.

## Client snapshot

A client snapshot is generated at shortlist share time and is immutable for that version.

It may contain:

- random option code;
- client-safe route title;
- GEO/currency/method/flow;
- traffic compatibility;
- client rates only;
- limits;
- settlement summary;
- sanitized requirements and risks;
- validity/freshness statement.

It must not contain:

- provider identity or website;
- internal provider/route IDs;
- base/source rates;
- margin values or rules;
- partner contacts;
- unique internal notes that reveal the provider.
