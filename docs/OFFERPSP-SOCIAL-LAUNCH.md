# OfferPSP — social launch pack

Updated: 2026-09-01

Status: packages 1 and 2 published and verified on the approved social surfaces

The public website integration is also live and verified as of 2026-09-01: all five approved
profile/contact links are present across public pages, the four brand accounts are declared in
Organization `sameAs`, the founder's LinkedIn is declared separately as a `Person`, and organic
traffic from LinkedIn, Instagram, X and Threads resolves to the `social` attribution category.

## Purpose

The first publications explain the current OfferPSP model without implying scale, existing clients,
named PSP partnerships or automated transaction orchestration that have not been verified.

Primary audiences:

- international merchants looking for a suitable payment setup;
- PSPs, acquirers, EMIs, A2A/Open Banking and payout providers;
- payment-industry partnership and business-development managers.

## Brand and channel roles

- **Public brand:** `OfferPSP` — always one word with this capitalization.
- **Legal operator:** `Offerspsp.com` (Individual Entrepreneur, Georgia). The public brand and
  canonical website remain `OfferPSP` and `offerpsp.com`.
- **LinkedIn:** Boris's founder profile is the primary B2B publishing surface for the launch. A
  separate OfferPSP Company Page is a later step and must not be implied to exist now. LinkedIn
  currently blocks its creation because the founder account has insufficient connections.
- **Instagram:** visual explanation and carousel surface. The launch uses concise educational
  slides, not generic stock imagery.
- **Telegram:** `@offerpsp` is currently a direct-contact account, not a public content channel.
  Keep it as a contact endpoint until Boris explicitly approves creating a separate public channel.
- **Threads:** the public `@offerpsp` profile is a secondary text surface. Package 2 established its
  first approved publication. It is linked from the public website and declared as an official
  OfferPSP profile in structured data; the separate Instagram badge may remain hidden.
- **X:** the public `@offerpsp` profile is a secondary short-form text surface. Package 2 established
  its first approved publication. It is linked from the public website, declared as an official
  OfferPSP profile in structured data and identified through `twitter:site` metadata.

## Canonical profile copy

**Instagram and Threads display name:** OfferPSP | PSP Matching

**Short bio:**

> Payment-provider matching for international merchants.
> Structured briefs • private introductions
> Merchant and PSP enquiries ↓

**LinkedIn founder headline:**

> Founder of OfferPSP | Private PSP matching for international merchants

**LinkedIn founder About opening:**

> I am the founder of OfferPSP, a B2B payment-provider matching and introduction service operated
> by Offerspsp.com. We help international merchants structure payment requirements, compare relevant
> routes and move qualified cases into provider review.

**Website:** https://offerpsp.com/

**Public contact:** bizdev@offerpsp.com

The live Instagram business profile uses the public email contact, hides the potentially misleading
`Financial Services` category label and keeps account recommendations enabled. Use the clean public
bio URL `https://offerpsp.com/instagram`; its production redirect adds the canonical Instagram UTM
without exposing the tracking query in the profile. Instagram restricts link editing to its mobile
app. Two-factor authentication is not configured; enabling it requires Boris to connect an
authenticator app and retain the recovery codes.

## Measurement baseline

Captured from live sources on 2026-08-31. These are starting values, not performance claims.

| Surface | Verified baseline | Source and period |
|---|---:|---|
| Instagram | 0 posts, 0 followers, 0 following | Authenticated profile read, 2026-08-31 |
| Threads | Public `@offerpsp` profile; 0 posts, 0 followers | Authenticated and public profile read, 2026-08-31 |
| X | Public `@offerpsp` profile; 0 posts, 0 followers, 0 following | Authenticated profile read, 2026-08-31 |
| LinkedIn founder profile | 0 followers, 0 posts; 0 profile views, post impressions and search appearances | Authenticated profile analytics, latest 7 days on 2026-08-31 |
| Telegram | Direct contact page; no public channel feed | Public `t.me/offerpsp` page, 2026-08-31 |
| Website | 64 visitors, 135 page views | Live Vercel Web Analytics, 2026-08-02 through 2026-08-31 |
| Google Search | 289 impressions, 2 clicks; 18 of 21 inspected URLs indexed | Google Search Console, data through 2026-08-28 |

The Google baseline predates the 2026-08-31 organic-acquisition release and must not be used to
judge that release before normal indexing and reporting delay.

## UTM convention

Use lowercase sources and stable content IDs. Do not create a new campaign name per platform.

| Placement | Tagged URL |
|---|---|
| LinkedIn founder profile | `https://offerpsp.com/?utm_source=linkedin&utm_medium=organic_social&utm_campaign=profile_2026&utm_content=founder_profile` |
| Instagram bio | `https://offerpsp.com/instagram` → canonical Instagram UTM redirect |
| Threads bio | `https://offerpsp.com/?utm_source=threads&utm_medium=organic_social&utm_campaign=profile_2026&utm_content=bio` |
| X bio | `https://offerpsp.com/?utm_source=x&utm_medium=organic_social&utm_campaign=profile_2026` |
| LinkedIn publication 1 | `https://offerpsp.com/?utm_source=linkedin&utm_medium=organic_social&utm_campaign=social_launch_2026&utm_content=post_01_what_offerpsp_is` |
| LinkedIn publication 2 | `https://offerpsp.com/psp-matching-process.html?utm_source=linkedin&utm_medium=organic_social&utm_campaign=social_launch_2026&utm_content=post_02_merchant_brief` |
| LinkedIn publication 3 | `https://offerpsp.com/?utm_source=linkedin&utm_medium=organic_social&utm_campaign=social_launch_2026&utm_content=post_03_psp_partners` |

Instagram captions use “Link in bio”; the bio URL carries Instagram attribution. A Telegram UTM
is added only if a real public channel is created and verified.

## Publication 1 — What OfferPSP is

### LinkedIn — final draft

> Finding a payment provider is not a directory search.
>
> A route that works for one merchant may be a dead end for another. GEO, legal entity, licence,
> vertical, currencies, methods, processing volume, settlement, traffic and risk profile all change
> the answer.
>
> OfferPSP is a B2B payment-provider matching and introduction service for international merchants.
> We turn a raw “we need a PSP” request into a structured merchant brief, compare relevant payment
> routes and coordinate provider review and a controlled introduction.
>
> OfferPSP matches the brief against routes available in its current supply base. When a qualified
> match exists, indicative route information is shared privately. Provider identity is disclosed
> only after the provider accepts the merchant and OfferPSP coordinates a controlled introduction.
> Final availability and commercial terms are confirmed by the provider. OfferPSP is not a public
> PSP catalogue yet, and no provider approval can be guaranteed.
>
> We are developing the partner side with PSPs, acquirers, EMIs, A2A/Open Banking and payout
> providers.
>
> Merchant requests: [LINKEDIN_PUBLICATION_1_URL]
> Partnerships: bizdev@offerpsp.com
>
> #Payments #Fintech #MerchantAcquiring

Replace `[LINKEDIN_PUBLICATION_1_URL]` with the exact tagged URL from the UTM table immediately
before publication.

### Instagram carousel

1. **Finding a PSP is not a directory search.**
2. **The same route does not fit every merchant.** GEO, licence, vertical and risk change the answer.
3. **OfferPSP structures the merchant brief.** Entity, methods, currencies, volume and settlement.
4. **We compare relevant payment routes.** Fit comes before introductions.
5. **The provider makes the final decision.** No responsible intermediary can guarantee approval.
6. **Private matching now. Broader transparency as verified supply grows.** Built around available route information and qualified introductions.

### Instagram caption — final draft

> Finding a PSP is not a directory search.
>
> GEO, legal entity, licence, vertical, currencies, methods, volume, settlement and risk profile can
> change which payment route is actually relevant.
>
> OfferPSP structures the merchant brief and compares it with available payment routes. When a
> qualified match exists, indicative route information is shared privately. Provider identity is
> disclosed only after the provider accepts the merchant and OfferPSP coordinates a controlled
> introduction. Final availability and commercial terms are confirmed by the provider.
>
> Merchant requests and partnerships: link in bio.
>
> #Payments #Fintech #PSP #MerchantAcquiring #PaymentProcessing

## Publication 2 — What makes a merchant request matchable

### LinkedIn — final draft

> “We need a PSP” is a starting point, not a payment brief.
>
> A provider cannot assess fit from a vertical and GEO alone. A useful merchant brief should
> include:
>
> • company, website, business model and vertical;
> • legal entity, jurisdiction and licence status;
> • operating and target GEOs;
> • currencies, PayIn/PayOut flows and payment methods;
> • expected monthly volume and average ticket;
> • settlement requirements and practical limits;
> • traffic source, current setup and material restrictions;
> • integration format and target launch window.
>
> Good data does not guarantee approval or final commercial terms. It removes avoidable
> back-and-forth and gives a provider enough context to decide whether to review the merchant.
>
> OfferPSP turns the input into a structured dossier and compares it with available route
> information. When a qualified match exists, indicative route information may be shared privately.
> Provider identity remains confidential until the provider accepts the merchant and OfferPSP
> coordinates a controlled introduction.
>
> Prepare your payment brief:
> https://offerpsp.com/psp-matching-process.html?utm_source=linkedin&utm_medium=organic_social&utm_campaign=social_launch_2026&utm_content=post_02_merchant_brief
>
> #Payments #Fintech #MerchantOnboarding

### Instagram carousel

1. **“We need a PSP” is only the starting point.** A provider needs operating context before review.
2. **Business model, legal entity and licence.** Company, website, jurisdiction and vertical.
3. **Operating and target GEOs.** Where are the company, customers and payment flows?
4. **Currencies, methods and flows.** PayIn, PayOut, cards, banks and local methods.
5. **Volume, average ticket and settlement.** What must the route support in practice?
6. **Traffic, risk and integration.** What will affect underwriting and delivery?
7. **Better input speeds provider review.** It improves relevance; it never guarantees approval.

### Instagram caption — final draft

> A clear merchant brief saves time for both the merchant and the payment provider.
>
> The minimum useful context is the company, website, entity, licence, vertical, GEOs, currencies,
> methods, expected volume, average ticket, PayIn/PayOut requirements, settlement, traffic and
> integration timing.
>
> Better input does not guarantee approval or final commercial terms. It helps a relevant provider
> decide whether to review the case without preventable rounds of clarification.
>
> Start with a structured payment request: link in bio.
>
> #Payments #Fintech #MerchantOnboarding #PSP #PaymentProcessing

### X — final draft

> “We need a PSP” is only a starting point.
>
> A matchable brief covers the entity, licence, GEOs, vertical, currencies, methods, volume, ticket
> size, PayIn/PayOut, settlement, traffic and integration.
>
> Better input speeds provider review. It never guarantees approval.

### Threads — final draft

> “We need a PSP” is a starting point, not a payment brief.
>
> A useful request covers the company, website, legal entity, licence status, GEOs, vertical,
> currencies, methods, expected volume, average ticket, PayIn/PayOut, settlement, traffic and
> integration timing.
>
> Better input removes avoidable back-and-forth and helps a relevant provider decide whether to
> review the merchant. It does not guarantee approval or final commercial terms.

## Publication 3 — Why PSPs should talk to OfferPSP

### LinkedIn — final draft

> Payment providers do not need more unqualified introductions.
>
> OfferPSP is developing a managed partner channel built around structured merchant dossiers and
> controlled introductions.
>
> Before a provider is introduced, we aim to capture the information required for a real review:
> company and product, GEOs, vertical, licence status, expected volume, currencies, PayIn/PayOut
> requirements, settlement needs and material risk information.
>
> The provider keeps the decision. It can accept, decline or request more information. OfferPSP
> coordinates the next step and preserves the commercial attribution of the introduction.
>
> We welcome conversations with PSPs, acquirers, EMIs, Open Banking/A2A and payout providers that
> want to evaluate qualified international merchant opportunities.
>
> Partnership contact: bizdev@offerpsp.com
> About OfferPSP: [LINKEDIN_PUBLICATION_3_URL]
>
> #Payments #Fintech #PaymentPartners

### Instagram carousel

1. **PSPs do not need more unqualified introductions.**
2. **OfferPSP prepares a structured merchant dossier.**
3. **Provider identity stays private before a controlled introduction.**
4. **The PSP can accept, decline or request more information.**
5. **OfferPSP coordinates the next step and preserves attribution.**
6. **PSP, acquiring, EMI, A2A and payout partnerships:** bizdev@offerpsp.com

### Instagram caption — final draft

> A useful partner channel should improve the quality of the conversation before the introduction.
>
> OfferPSP structures merchant requirements, coordinates provider review and preserves the
> attribution of qualified introductions. The provider keeps full control of underwriting, approval
> and final commercial terms.
>
> Partnership conversations: bizdev@offerpsp.com
>
> #Payments #Fintech #PSP #Acquiring #PaymentPartners

## Publishing order and approval gate

1. Publication 1 copy and carousel visuals were approved and published on 2026-08-31:
   - LinkedIn: `https://www.linkedin.com/feed/update/urn:li:share:7500225994885128192/`
   - Instagram: `https://www.instagram.com/p/DctfVK8DGKt/`
2. Publication 2 was approved and published on 2026-09-01:
   - LinkedIn: `https://www.linkedin.com/feed/update/urn:li:share:7500314105417998337/`
   - Instagram: `https://www.instagram.com/p/DcuIyvjDB4E/`
   - X: `https://x.com/offerpsp/status/2094550165633782092`
   - Threads: `https://www.threads.com/@offerpsp/post/DcuJKC9igER`
3. Capture the first 48–72 hours of impressions, profile visits, followers, link clicks and
   attributed requests for each package and surface.
4. Publish the PSP-partner proposition after another two or three days.

Publications 1 and 2 are complete. Future packages still require approval of their exact final text,
tagged URL and visuals before external publication.

## Asset inventory

- LinkedIn cover SVG: `assets/linkedin/offerpsp-linkedin-cover.svg`
- LinkedIn cover PNG: `assets/linkedin/offerpsp-linkedin-cover.png`
- X cover SVG: `assets/x/offerpsp-x-cover.svg`
- X cover PNG: `assets/x/offerpsp-x-cover.png`
- Publication 1 Instagram carousel: `assets/instagram/post-01/`
- Publication 2 Instagram carousel: `assets/instagram/post-02/`

The LinkedIn cover is 1584×396 px and the X cover is 1500×500 px. Their primary copy sits outside
the left profile-photo overlay zone, and all visible branding uses `OfferPSP` and `offerpsp.com`
consistently.

## Claims guardrail

Do not claim or imply:

- a large or verified provider network unless the current production registry supports it;
- existing partnerships with companies merely followed or researched on LinkedIn;
- guaranteed approval, pricing or launch timing;
- automated transaction routing, cascading or processing;
- named client results or processing volume without explicit evidence and permission;
- complete verification or current availability of every field on every stored route;
- that indicative or previously stored rates are final PSP commercial terms;
- that the current private-matching stage is the permanent final product model.
