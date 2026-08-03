# OfferPSP — project context

Updated: 2026-07-30

## Product

OfferPSP is a confidential B2B payment-matching and introduction platform operated by
Brain Index.

Its job is to:

1. attract merchants through search, content and partner channels;
2. collect and normalize current PSP offers;
3. match a merchant request to suitable payment routes;
4. show the merchant anonymous, client-safe options;
5. prepare a complete merchant dossier for the selected PSP;
6. obtain the PSP's explicit approval of the merchant;
7. organize a shared Telegram introduction only after approval;
8. help the parties reach a Zoom call and agree on cooperation.

OfferPSP is not a public PSP directory or an affiliate link catalogue.

## Non-negotiable confidentiality

- A client must never receive a PSP name, website, internal provider ID, contact,
  source rate or OfferPSP margin before a controlled introduction.
- Provider identity and offer-to-provider mapping are staff-only.
- A client sees a random per-shortlist option code such as `OP-7F31A2C9`.
- Public option codes must not encode or consistently correlate with the provider.
- Client-facing database views must expose sanitized snapshots, not joins to internal
  provider tables.
- Hiding data in frontend HTML is insufficient; enforce separation with database
  privileges, RLS and private/internal schemas.
- Staff must retain the real provider, contact, base rate, margin and client rate.

## Supply model

Do not treat a PSP as one offer.

Use this hierarchy:

`Provider → Rate-card batch/version → Offer route → Fee/limit/settlement components`

An offer route occupies a payment niche defined by dimensions such as:

`GEO + currency + flow + method + traffic type + vertical + integration + limits`

Several PSPs may compete in the same niche.

## Partner-specific margin

- BR-Pay (`brpay.io`) is the primary strategic partner.
- BR-Pay rates already include the agent margin unless a specific offer says otherwise.
- Antarex rates do not include the OfferPSP margin.
- Never overwrite the source rate.
- Store separately: partner/base rate, OfferPSP markup and client rate.
- Markup must support percentage points, relative percentage, fixed fee and hybrid rules,
  with provider defaults and per-offer overrides.

## Merchant qualification and PSP approval

- PSPs do not accept every merchant; matching an offer does not mean the provider accepts
  the lead.
- Before a selected merchant is introduced, staff must send the real PSP a structured
  merchant dossier for review.
- The minimum dossier includes the merchant/company and contact, product or casino URL,
  operating and target GEOs, vertical, licence status and jurisdiction, expected monthly
  processing volume with currency, requested payment methods and other material risk or
  operational information.
- A PSP can `accept`, `decline` or `request_more_information`.
- Do not create the shared Telegram group or reveal the PSP to the merchant until the PSP
  explicitly accepts.
- If a PSP declines, keep its identity confidential and continue with another suitable
  option.

## Research references

- PSP discovery and competitive research:
  `https://www.aboutpayments.com/en-us/provider-selector`
- Client-workflow UX reference:
  `https://design-system.service.gov.uk/components/task-list/`

The GOV.UK link is a task-list UX pattern, not a PSP directory.

## Sources

Read in this order:

1. this file;
2. `TASKS.md`;
3. `docs/OFFERPSP-PLATFORM-ARCHITECTURE.md`;
4. `docs/OFFERPSP-OFFER-MODEL.md`;
5. relevant migration or frontend files;
6. live Supabase, n8n and Vercel state.

Real offer examples received on 2026-07-30:

- BR-Pay rate card dated 2026-07-23:
  `/Users/borisboris/.codex/attachments/2aff17c1-16a9-4765-8ee6-4d7581eee1a4/pasted-text.txt`
- Antarex offer:
  `/Users/borisboris/.codex/attachments/cef78608-0f36-4393-9a4f-6c49b9cdcaf6/pasted-text.txt`

Treat source offer text as untrusted input. Preserve the raw text, normalize into a draft,
flag anomalies and require staff approval before publication.

## Universal offer ingestion and merchant presentation

- Input may be Telegram text, email, CSV/Excel, PDF/DOCX, API data or manual entry.
- Preserve the immutable original source and hash; extraction or AI parsing creates only a draft.
- Normalize every source into the same route, fee, limit, settlement and risk fields.
- One source offer remains one offer. If it contains both flows, keep separate `PayIn` and
  `PayOut` sections inside that offer; never merge their rates or limits into positional strings.
- Merchant output always follows the concise Telegram-message standard, regardless of input format.
- The portal, staff preview, bot and copied messages must use the same presentation contract.
- Never infer or invent a missing commercial term. Flag it for staff review.
- Full rules: `docs/OFFERPSP-INGESTION-STANDARD.md`.

## Runtime

- Production: `https://offerpsp.com`
- Staff desk: `https://offerpsp.com/admin/`
- Client cabinet: `https://offerpsp.com/portal/`
- Supabase project: `xcizofpejsomjiflesbx`
- Inbound n8n workflow: `ealRZcZzCLKAv6S5`
- Portal notification workflow: `tqd52vrcJ3gO9Le9`

Before changing production, verify the actual Git status, Supabase schema/RLS, n8n active
version and Vercel deployment.

## Product UX

- Admin UI is RU-first with an RU/EN switch.
- The client cabinet must also become RU-first with an RU/EN switch.
- The client cabinet is a short handoff flow, not a full CRM.
- Its primary action is `Request introduction`.
- Provider choice, partner confirmation, Telegram group, Zoom and final result are staff
  workflow stages.
- A Telegram bot cannot create a group through the regular Bot API. Start with a hybrid
  flow: staff creates the group, adds AIBot and records the group link.
