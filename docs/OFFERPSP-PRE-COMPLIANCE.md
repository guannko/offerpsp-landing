# OfferPSP Pre-Compliance — PRO module

Updated: 2026-08-06

## Product contract

Pre-Compliance is a separately licensed Control Bridge module. It protects the operational team from spam, fake companies, incomplete merchant requests and premature matching.

The module does not replace legal KYB/KYC or a PSP compliance decision. It is an evidence-based intake gate:

`new request → automated evidence collection → staff decision → matching → shortlist`

Automation can enrich and score a case, but it can never mark a lead as `cleared`. Only an active OfferPSP staff account can unlock matching.

## Paid entitlement

- Module key: `pre_compliance`
- Minimum plan: `pro`
- Navigation and the workspace are shown only when the entitlement is active.
- Entitlements are stored separately from feature flags, so the same platform can be sold with or without the module.

## Four scores

The scores are intentionally separate. One impressive domain must not hide an unusable dossier.

1. `authenticity_score` — domain, website, email, company identity and consistency of public traces.
2. `compliance_readiness_score` — licence, operators, ownership, traffic, payment flows and documents required for PSP review.
3. `commercial_value_score` — volume, target market, urgency, reachable contact and fit with current supply.
4. `completeness_score` — how much of the intake form is actually usable.

Each score is `0–100`; an absent score means “not checked”, not zero.

## Classification

- `merchant` — direct operator or business requesting payment processing;
- `subagent` — represents one or more merchants and expects a referral/revenue share;
- `psp` — payment provider offering supply;
- `consultant` — advisory role without confirmed merchant ownership;
- `other` / `unknown`.

Classification controls routing but does not expose private PSP identities to the applicant.

## Automated worker contract

The n8n worker uses two service-only RPCs.

Production workflow: `wiEFFDaHd3uaJoJi` (`OfferPSP | Pre-Compliance PRO`). It is active and its
controlled production executions `320586` and `320600` completed successfully using the dedicated
OfferPSP service-role credential.

1. `claim_offerpsp_pre_compliance_jobs(limit)` atomically claims pending or stale jobs. A job stuck in `screening` for 30 minutes becomes available again.
2. `record_offerpsp_pre_compliance_screening(lead_id, payload)` saves evidence and scores. It always leaves the case awaiting a staff decision.

Recommended checks:

- domain resolution, registration age and registrar evidence;
- website availability, title, description and business consistency;
- email domain match and disposable/free mailbox warning;
- submitted network country versus claimed operating context;
- public licence reference and regulator source;
- sanctions/adverse-media signal as a warning requiring human review;
- duplicate email, Telegram, domain and IP hash;
- applicant role: direct merchant, subagent, PSP or consultant;
- missing PSP-review data: merchant URLs, legal entity, licence, GEO, monthly volume, PayIn/PayOut, methods, settlement and contact.

The worker stores source URLs and short evidence, not copied full web pages. Raw IP addresses are not retained; only a one-way hash may be stored.

## Screening payload

```json
{
  "classification": "subagent",
  "authenticity_score": 82,
  "compliance_readiness_score": 45,
  "commercial_value_score": 85,
  "completeness_score": 60,
  "risk_level": "medium",
  "confidence": 0.81,
  "summary": "Domain and company positioning are consistent; represented operators are not identified.",
  "missing_information": [
    "Operator names and websites",
    "Licence for every represented merchant",
    "PayIn and PayOut requirements",
    "Monthly volume per merchant"
  ],
  "red_flags": [],
  "yellow_flags": [
    { "key": "young_domain", "title": "Recently registered domain" }
  ],
  "source_links": [
    { "kind": "website", "url": "https://example.com" },
    { "kind": "registry", "url": "https://example-registry.test/domain/EXAMPLE.COM" }
  ],
  "signals": {
    "ip_hash": "sha256:...",
    "country_code": "EE",
    "network_name": "Example Network",
    "user_agent": "Browser user agent",
    "request_id": "edge-request-id"
  },
  "checks": [
    {
      "check_key": "domain",
      "status": "passed",
      "title": "Domain resolves",
      "detail": "HTTPS website is reachable.",
      "score": 90,
      "source_url": "https://example.com",
      "provider": "n8n"
    }
  ],
  "screening_provider": "n8n-pre-compliance-v1"
}
```

## Staff decisions

- `cleared` — unlock matching and set the lead to qualification;
- `needs_info` — request missing data and keep matching locked;
- `hold` — retain evidence but pause the case;
- `rejected` — close the request;
- `spam` — mark the request as spam.

Every decision is immutable history. A later decision creates a new record rather than overwriting the previous one.

## Security boundary

- Compliance tables are in the private schema.
- `authenticated` and `anon` have no direct table access.
- Staff use read/decision RPCs guarded by `is_offerpsp_staff()`.
- n8n receives only service worker RPCs and cannot clear a lead.
- Shortlist creation and sharing are blocked in the database until clearance, including manual shortcuts.

## Production verification — 2026-08-06

- Supabase migrations `offerpsp_pre_compliance_module` and
  `offerpsp_pre_compliance_indexes` are applied.
- The production matching RPC checks `private.offerpsp_compliance_ready(lead_id)` before rebuilding
  matches. A separate `offerpsp_shortlist_compliance_gate` trigger blocks both draft creation and
  sharing before clearance.
- Cockpit deployment `dpl_DJSBz96i3yeYNKnizTaWaSKso1Dm` is `READY` at
  `https://ops-7q4m2x9k8v3n.vercel.app`.
- The external MBA request is normalized from `South Korea` to `KR`, classified as `subagent`, and
  scored: authenticity `100`, compliance readiness `54`, commercial value `100`, completeness
  `64`, low risk, confidence `0.72`.
- MBA remains in `screening` with no staff decision. Matching is locked until a staff member records
  `cleared`; the recommended current action is `needs_info` for represented merchant names and
  sites, licence per merchant, payment methods, and PayIn/PayOut requirements.
