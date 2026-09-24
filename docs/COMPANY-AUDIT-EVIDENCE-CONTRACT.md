# OfferPSP company audit evidence contract

Updated: 2026-09-17. Owner: Borys Kononenko.

## Product rule

The company audit is an evidence report, not an AI opinion and not a substitute for KYB, legal
advice, a regulator decision or provider approval. Every displayed conclusion must identify what
was checked, which source was used, when it was checked and whether the source independently
confirms the fact.

The system must never convert absence of evidence into a negative finding. An unreachable site,
missing search result or unavailable registry is `unknown` or `not_checked`, not a red flag by
itself.

## Evidence levels

| Level | Meaning | May confirm a company fact? |
|---|---|---|
| `observed` | The collector directly observed a technical fact, such as an HTTP response or RDAP date. | Only that narrow technical fact. |
| `claimed` | The company or applicant states the fact on its own site or in its submission. | No. |
| `inferred` | The system derives a possible classification or relationship from text. | No. |
| `computed` | The system compares or counts already-stored values. | No. |
| `unavailable` | The intended source could not be read safely or reliably. | No. |
| `not_checked` | No appropriate source adapter ran. | No. |
| `verified` | A dedicated adapter matched the exact entity/identifier against an authoritative independent source. | Yes, for the matched field only. |
| `contradicted` | An authoritative independent source conflicts with the submitted/current fact. | It creates a manual-review issue; it is not an automatic rejection. |

No language model may assign `verified` or `contradicted`. Those states require a deterministic
source adapter and exact persisted evidence.

## Source classes

- `official_company_registry`: government or statutory company register.
- `gleif_lei_registry`: GLEIF Global LEI Index. It may verify a legal-name/registration-number
  pair when the record is active, issued and fully corroborated, but absence of an LEI does not
  mean that the legal entity does not exist.
- `official_regulator_registry`: regulator-maintained licence register.
- `official_sanctions_lists`: primary sanctions list or a separately approved provider with list
  provenance and update time.
- `rdap_registry`: domain-registration infrastructure; it does not identify the legal operator.
- `company_website`: company-controlled source; statements are claims.
- `independent_media`: third-party publication; it is a signal requiring review.
- `submitted_data`: applicant/operator supplied data.
- `system_comparison`: a deterministic comparison of stored values.
- `none`: no source was used.

Search-engine results are discovery pointers only. A search snippet is never evidence. The
underlying page must be fetched, classified and retained as a bounded evidence record.

## Connected adapters

The local `public-evidence-v5` candidate has deterministic, server-only adapters for legal-entity, gambling-licence and sanctions evidence:

- GLEIF API (`api.gleif.org`): exact legal-name and registration-number comparison. A name-only
  or name/country candidate remains `observed`, never `verified`.
- Malta Gaming Authority Dynamic Seal (`authorisation.mga.org.mt`): a licence is verified only
  when the official record is licensed and the submitted legal name, licence number and website
  domain all match. A seal for another domain or a suspended/expired record is not verified.
- Curaçao Gaming Authority Certificate of Operation (`cert.cga.cw`): checks the current B2C
  certificate against the operator, licence number and exact player-facing domain. A B2B corporate
  seal does not authorise a casino domain, and the retired orange transitional seal is invalid.
- UK Gambling Commission public register (`gamblingcommission.gov.uk`): joins the regulator's
  official business, domain and licence datasets by account number, then requires an active remote
  licence plus exact legal-name, licence-number and domain matches.
- Gibraltar Gambling Division licence-holder register (`gamblingdivision.gov.gi`): requires an
  exact current legal-name match. The public register's main page does not bind the holder to a
  player-facing domain or publish a licence number, so this adapter produces a review candidate,
  not an independently verified licence.
- Isle of Man Gambling Supervision Commission online register (`isleofmangsc.com`): verifies only
  an exact legal-name and player-facing domain match on a currently active, in-date OGRA record.
  The public record does not expose a licence number, and the evidence states that limitation.
- Kahnawà:ke Gaming Commission permit-holder list (`gamingcommission.ca`): matches the exact
  operator and player-facing domain, but may verify them only when the official page has a recent
  publication date. The currently published September 2023 list therefore remains a review
  candidate rather than current permit confirmation.
- Swedish Gambling Authority directory (`spelinspektionen.se`): joins the official holder and
  licence records, then requires an exact holder name, an active in-date licence and an exact
  licensed-domain match. It preserves the official holder/licence IDs without presenting them as
  a public licence number.
- iGaming Ontario operator directory (`igamingontario.ca`): requires an exact operator and gaming-
  site domain match in a recently dated official directory. A positive result is described as the
  combined AGCO registration and iGaming Ontario operating agreement, not as a licence number.
- United Nations Security Council Consolidated List: exact normalized matching against primary
  names and aliases for the submitted company and named representative. A match creates a manual
  identity-resolution issue; no exact match is explicitly not sanctions clearance.

The adapters use immutable host allow-lists, bounded responses, timeouts and no caller-selected
host. MGA and CGA accept only their strict official certificate URL formats. Stale or identifier-
incomplete regulator sources remain visible as candidates and cannot produce `verified`. All
connectors are disabled unless their server-side feature flag is enabled. Current sanctions
coverage is `partial`: EU, UK, OFAC, PEP and other applicable lists are not yet connected.

## Required audit domains

A report is not `complete` until every applicable domain has a terminal outcome with a source and
timestamp, or an explicit `not_applicable` reason:

1. submitted identity and contact completeness;
2. official legal-entity registration and status;
3. company website and domain history;
4. website-to-entity consistency;
5. representative identity and authority;
6. licence/regulatory basis and authorised activity, when applicable;
7. sanctions and PEP screening for the applicable entity/person scope;
8. adverse media, enforcement and material litigation signals;
9. product, vertical and operating-GEO consistency;
10. payment requirements, processing history and risk-control evidence;
11. internal duplicate, contact-history and prior-decision reconciliation;
12. unresolved contradictions, missing evidence and required next actions.

`Complete` describes coverage, not approval. A completely checked report may still contain unknown,
contradicted or adverse findings and must remain subject to staff review.

## Stored evidence record

Each check must preserve at least:

- stable check key and audit version;
- entity type and entity ID;
- source class, canonical source URL and adapter name/version;
- retrieval time and source publication/update time when available;
- exact identifiers queried and identifiers matched;
- bounded excerpt or structured fields, never unrestricted raw pages or secrets;
- evidence level and narrow finding;
- technical outcome (`completed`, `unavailable`, `timeout`, `unsupported`, `not_applicable`);
- input hash/run ID so stale results cannot overwrite current data.

Previous completed evidence remains visible when a rerun fails. Material entity changes mark the
old result stale rather than silently reusing it.

## Decision boundary

Automatic research may prepare facts, contradictions, missing-information requests and internal
matching candidates. It cannot by itself:

- declare a merchant or PSP approved, legitimate, licensed or low risk;
- publish a provider identity, rate or shortlist;
- assert sanctions clearance from an incomplete scope;
- make a legal conclusion;
- reject a company solely because a source was unavailable;
- overwrite operator-confirmed facts without a visible conflict and review.

The production UI must show coverage and limitations before the detailed findings. Terms such as
`verified`, `complete`, `clear` and `approved` are reserved for their exact meanings above.
