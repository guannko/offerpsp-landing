# OfferPSP Google Ads and affiliate acquisition

Updated: 2026-08-27

## Objective

Acquire qualified merchant requests for OfferPSP's managed PSP matching and introduction service.
OfferPSP is the intermediary and process operator, not the payment provider shown in the ad.

## Truth chain

`click -> lead_submitted -> qualified_lead -> provider_accepted -> introduction_created -> deal_won -> processing_live`

- The landing captures UTM, Google Ads click IDs, other paid-channel click IDs and affiliate IDs.
- The active inbound n8n workflow sanitizes them and stores them with the lead.
- Private database events record real lifecycle milestones.
- The staff dashboard shows source and campaign results without substituting historical snapshots.
- Spend, CPC, CPA and ROAS remain absent until live Google Ads cost data is connected.
- No event is exported to Google while `ad_user_data_consent` is `unknown` or `denied`.

## Channel order

### 1. Google Ads Search

Start with high-intent provider-neutral B2B demand:

- payment provider matching;
- cross-border payment provider;
- payment gateway alternatives;
- PSP for SaaS;
- PSP for marketplaces;
- payment provider for regulated or higher-risk businesses, only where policy-safe.

Use tightly grouped exact and phrase match campaigns. Send each query cluster to the closest factual
OfferPSP page. Initially exclude employment, consumer-payment, free-software, casino-player and
unrelated support/login queries. Do not claim that OfferPSP processes payments, guarantees approval
or represents every PSP.

`lead_submitted` starts as a secondary diagnostic conversion. Optimize bidding to
`qualified_lead` only after enough verified events exist; later import provider acceptance, won and
live outcomes for value-based optimization.

### 2. Affiliate and referral partners

Give each partner a durable URL contract:

`https://offerpsp.com/?utm_source={partner}&utm_medium=affiliate&utm_campaign={agreement}&affiliate_id={partner_id}&click_id={unique_click}`

Preserve `sub1`-`sub5` in the attribution JSON for partner-side segmentation. Commission decisions
must use the registered lead timestamp, commercial agreement and protected period, not URL data
alone.

### 3. Demand Gen and display

Use only after Search produces a reliable qualified-lead signal. Remarketing requires an approved
consent/CMP implementation before advertising storage or Google user-data processing is enabled.
Display reach without downstream qualification is not a success metric.

### 4. App campaigns

Not applicable until OfferPSP has a real merchant or PSP application with measurable activation.
Do not create an app campaign merely to use another Google channel.

## Naming contract

- `utm_source`: `google`, partner slug or channel platform.
- `utm_medium`: `cpc`, `display`, `affiliate`, `email`, `telegram` or `referral`.
- `utm_campaign`: stable lowercase business intent and market, for example
  `search_cross_border_eu_en`.
- `utm_content`: ad or creative variant.
- `utm_term`: keyword when supplied by the channel.

Google auto-tagging identifiers remain case-sensitive and must not be transformed.

## Launch gates

Before any spend:

1. Confirm the exact Georgian individual-entrepreneur payments profile.
2. Approve billing country, currency and account time zone; currency and time zone are effectively
   permanent account choices.
3. Approve a daily test budget and geographic scope.
4. Complete ad-policy review of copy and landing pages.
5. Add a compliant consent layer before Google tags, remarketing or enhanced-conversion user data.
6. Create the Google conversion actions and connect consented offline conversion export through the
   current Google Data Manager/API path, not a legacy upload integration.

## Official policy references

- Google Ads financial products and services policy:
  https://support.google.com/adspolicy/answer/2464998
- Google Ads misrepresentation policy:
  https://support.google.com/adspolicy/answer/15938071
- Google Ads gambling and games policy:
  https://support.google.com/adspolicy/answer/15132179
- EEA consent requirements:
  https://support.google.com/google-ads/answer/14625550
- Offline conversions using click identifiers:
  https://support.google.com/google-ads/answer/7012522
- Data Manager/API migration for offline conversion imports:
  https://support.google.com/google-ads/answer/16884284
