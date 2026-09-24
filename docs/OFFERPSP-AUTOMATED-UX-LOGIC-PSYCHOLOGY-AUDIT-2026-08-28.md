# OfferPSP automated UX, logic and psychology audit

- Date: 2026-08-28
- Scope: public merchant-acquisition surface
- Primary URL: `https://offerpsp.com/`
- Human participants: none

## Status

- `VERIFIED`: live desktop/mobile rendering, layout geometry, contrast of key elements, interactive
  targets, mobile menu, lead-dialog focus and scrolling, form semantics, console state, source
  structure, latest SiteOne crawl and current Vercel traffic.
- `ASSUMPTION`: attention, trust, motivation and comprehension findings are model-based heuristic
  predictions. They are useful for prioritization but are not evidence of actual human emotion or
  conversion.
- `PARTIAL`: a complete native keyboard traversal could not be reproduced through the browser
  automation layer. The skip link, semantic controls, focus styles and actual dialog focus were
  inspected directly.
- At the time of the baseline audit, no production code, database record, deployment or live
  configuration had been changed. The remediation deployment is recorded below.

## Remediation status

`VERIFIED` in production on 2026-08-28:

- reordered the journey to `promise → verified trust → process → selected solutions → coverage → FAQ → request`;
- added a factual operator/scope/limitations block using the current Privacy and Terms disclosures;
- reduced equal-weight solution cards from 11 to 6 and kept secondary research as compact links;
- added privacy-safe first-party CTA/form events with an explicit QA marker and no form values;
- corrected the mobile navigation overlay so page content cannot show through or collide with links;
- deterministic audit now passes 22/22 checks: technical 5/5, logic 6/6, form 5/5,
  ethics 4/4 and measurement 2/2;
- full local build and portal/control regression suite pass.

The Supabase migration and Vercel deployment are active. A production QA visit recorded
`hero_cta_click` and `lead_form_open` with `is_qa = true`; no merchant form was submitted. The live
desktop hero, mobile navigation overlay and lead dialog were visually rechecked after deployment.

## Executive verdict

The site is technically strong and visually legible. Its first screen communicates private PSP
matching, a focused shortlist and a clear action. The likely conversion weakness is not the visual
design. It is the order in which the site asks the visitor to think and trust.

Current journey:

`promise → 11 solution choices → problem explanation → process → coverage → fit → FAQ → request`

Lower-friction journey:

`promise → verified trust → four-step process → selected solutions → coverage → fit → FAQ → request`

The machine-based attractiveness forecast is **78/100**. The number means “strong visual and
content foundation with a material trust/sequencing gap.” It does not prove that 78% of people will
like or understand the site.

## Test matrix

| Test family | Method | Status | Main result |
|---|---|---|---|
| Technical health | Latest SiteOne crawl + live browser + console | `VERIFIED` | 31/31 successful URLs, no broken URLs, 9.9 overall; no browser warnings/errors during this run. |
| Responsive layout | 1440×1000 and 390×844 geometry | `VERIFIED` | No horizontal overflow on either viewport. |
| Visual legibility | Computed colour/size measurements | `VERIFIED` | Key text and CTA contrasts exceed WCAG AA minimums. |
| Interaction ergonomics | Hit-box and dialog geometry | `VERIFIED` | Main CTAs and mobile menu are comfortable; small text links rely on spacing rather than large hit boxes. |
| Information architecture | Section order and distance-to-content | `VERIFIED` | Process and request are too deep on mobile. |
| Cognitive load | Choice count, page length, reading level, form complexity | `VERIFIED` + `ASSUMPTION` | Specialist copy is defensible, but 11 choices before the process add avoidable decision load. |
| Psychological trust | Evidence/risk-reversal heuristic | `ASSUMPTION` | Confidentiality is strong; operator/outcome proof is weak. |
| Persuasion | Motivation–ability–prompt and information-scent heuristics | `ASSUMPTION` | Prompt and relevance are strong; trust and process clarity are the limiting steps. |
| Ethical UX | Dark-pattern and claim scan | `VERIFIED` | No false scarcity, countdown, guaranteed approval or prechecked consent. |
| Measurement validity | Source inspection + live Vercel data | `VERIFIED` | Pageviews exist, but no anonymous CTA/form funnel and QA visits contaminate the small sample. |

## Deterministic measurements

### Live page geometry

| Measurement | Desktop 1440×1000 | Mobile 390×844 |
|---|---:|---:|
| Rendered page height | 7,548 px | 12,908 px |
| Horizontal overflow | none | none |
| `Solutions` starts | 981 px | 1,578 px |
| `Process` starts | 3,393 px | 6,224 px |
| Request section starts | 6,716 px | 11,742 px |
| Primary hero CTA | 254×48 px | 362×48 px |
| Secondary hero CTA | 237×48 px | 362×48 px |

On mobile, a visitor who does not immediately click the hero CTA must travel about 7.4 screen
heights to reach the process and 13.9 screen heights to reach the final request section. This is a
real sequencing cost, even though the hero CTA makes submission technically available at once.

### Contrast and salience proxy

| Element | Computed contrast | Size | Assessment |
|---|---:|---:|---|
| Hero H1 | 17.82:1 | 92 px desktop | Very strong visual priority. |
| Hero paragraph | 11.58:1 | 20 px | Highly legible. |
| Hero eyebrow | 15.40:1 | 12 px bold | Legible despite small size. |
| Primary CTA | 6.20:1 | 48 px high | Passes AA and remains visually distinct. |
| Desktop navigation text | 8.90:1 | 14 px | Text contrast is strong. |

This is not eye tracking. It is a deterministic proxy based on size, contrast and placement. It
supports the prediction that the H1 and pink CTA dominate attention correctly.

### Mobile interaction

- no horizontal overflow at 390 px;
- menu button: 44×44 px;
- opened mobile-menu links: approximately 342×58 px each;
- lead dialog: 352×828 px, internal scroll height 1,019 px;
- opening the dialog moves focus to `#name`;
- submit button is below the first dialog viewport, so completion requires one deliberate scroll;
- status feedback uses `role="status"` and `aria-live="polite"`;
- no console warnings or errors appeared during the inspected flow.

Desktop header links are only about 16.5 px high and mobile footer links about 20.8 px high. Their
spacing likely qualifies for the WCAG 2.2 spacing/inline exceptions, so this is not recorded as a
confirmed compliance failure. Increasing vertical padding would still improve touch comfort.

### Form and ethical checks

The intake contains six visible business inputs plus consent:

1. name;
2. work email;
3. company;
4. optional website;
5. vertical;
6. target GEOs;
7. required consent.

All controls have labels. Name, email, company and URL expose useful autocomplete tokens. Consent
is required but not prechecked. The honeypot is excluded from keyboard order and autocomplete.
No false urgency, artificial scarcity or approval guarantee was found. Privacy, terms and approval
limitations are present.

## Automated source test

The repeatable audit is implemented in `scripts/audit-public-experience.mjs` and does not require a
third-party account. Current result:

| Category | Passed |
|---|---:|
| Technical structure | 5/5 |
| Proposition and journey logic | 4/6 |
| Form design | 5/5 |
| Ethical UX | 4/4 |
| Measurement readiness | 1/2 |

Three failed checks are intentional signals, not script errors:

- the process appears after the solution directory;
- 11 solution cards appear before the process;
- anonymous CTA/open/start/success/failure funnel events are absent.

Run it with:

```bash
node scripts/audit-public-experience.mjs
```

## Logical journey test

### Visitor question sequence

| Visitor question | Where the answer appears | Result |
|---|---|---|
| What is this? | Hero: private PSP matching desk | pass |
| What do I receive? | Hero: focused shortlist and introductions | pass |
| Is it relevant to my operating profile? | Hero and solution cards | pass |
| What happens to my sensitive information? | Hero note and privacy notice | pass |
| How exactly does the service work? | Process, 6,224 px down on mobile | friction |
| Why should I trust this operator? | Partial privacy/legal evidence; little operator/outcome evidence | weak |
| What do I do next? | Hero CTA and request form | pass |

The problem is therefore not missing information. It is that process and trust answers arrive after
a large block of choices.

### Consistency test

The acquisition surfaces use related but not identical action labels:

- `Request a match`;
- `Request a private match`;
- `Send a private payment brief`.

They describe the same action and do not contradict one another. Standardizing the main verb would
reduce translation and recall cost, but this is P2, not a blocker.

## Cognitive-load test

### Processing fluency

- Strength: the headline is short, distinctive and visually dominant.
- Strength: supporting copy immediately explains shortlist, GEO, vertical, methods, volume and risk.
- Cost: approximate Flesch reading ease is 37.2 on the homepage and 29.4 on the iGaming page.
- Interpretation: difficult for a broad audience, acceptable for specialist payments buyers.
- Recommendation: simplify only the opening and longest limitation sentences; retain necessary
  payments vocabulary.

### Choice architecture

Eleven solution cards are presented before the visitor learns the four-step process. Under a Hick's
Law-style heuristic, this increases comparison effort for an undecided visitor. The cards are useful
for SEO and self-identification, but all eleven do not need equal homepage priority.

Recommended homepage exposure: four to six representative cards plus a route to the full set. The
SEO pages remain live and indexable.

### Memory and primacy

The first-screen message is likely to be remembered because of the large H1 and contrast. The
specific process is unlikely to be remembered by a mobile visitor who does not scroll seven screens.
Moving trust/process directly after the hero improves the chance that the service model, not the
directory, becomes the second remembered idea.

## Psychological test

### Motivation–ability–prompt

| Component | Forecast | Evidence |
|---|---|---|
| Motivation | strong for an already frustrated merchant | “wrong introductions”, focused shortlist, multi-GEO/risk specificity |
| Ability | medium-high | clear CTA and six-field intake; one mobile dialog scroll required |
| Prompt | strong | primary CTA is above the fold, 48 px high and high contrast |
| Trust required to act | medium-low | privacy is explicit, but verified operator/outcome evidence is thin |

The most likely failure is not “I cannot find the button.” It is “I am not yet sure enough to share
my company profile.”

### Risk and psychological safety

Positive signals:

- private review;
- specialist assessment;
- no public provider list claim;
- no approval guarantee;
- explicit privacy and terms;
- consent not preselected.

Missing or weak signals:

- concise legal/operator identity next to the acquisition promise;
- named responsibility for review;
- realistic response expectation;
- verified, anonymized process/outcome evidence when real cases exist;
- a clear statement of exactly what the merchant receives before any introduction.

Do not fill this gap with invented logos, provider counts, approval rates or testimonials.

### Dark-pattern test

Result: pass.

The current page does not use countdowns, fake scarcity, coercive consent, disguised navigation,
guaranteed approval or a forced account creation before explaining the service. This should remain
a product constraint, not merely a temporary design choice.

## Synthetic task simulations

These are deterministic/modelled walkthroughs, not claims about real users.

| Scenario | Expected result | Forecast |
|---|---|---|
| Licensed iGaming operator urgently needs another PSP | Understand fit and open brief | high |
| Merchant researching how matching works before sharing data | Find process and trust proof | medium because process is deep |
| Privacy-sensitive founder | Decide whether to disclose company details | medium-low because confidentiality is clear but operator proof is weak |
| Returning client | Find login | high; `Client login` is in navigation/menu |
| General visitor who does not know `PSP` | Understand category | low-medium; specialist shorthand is not expanded in the hero |
| PSP representative wanting to supply offers | Find a supplier path | low; current public surface is intentionally merchant-oriented |

The last scenario is not automatically a homepage defect. It becomes one only if the same public
site is expected to acquire PSP partners now.

## Measurement test

Latest read-only OfferPSP Operator data during this audit:

- 46 visitors and 82 pageviews;
- 44 homepage visitors and 78 homepage pageviews;
- 43 visitors have an unknown referrer;
- three stored business leads in the last 30 days, only one attributed.

The browser audit itself increased production pageviews. Therefore these counts cannot distinguish
prospects from staff/QA and cannot yet validate attractiveness or conversion.

The public code loads Vercel Web Analytics but does not record anonymous funnel steps such as CTA
click, form open, first interaction, successful submission or safe failure category. Until that is
added, the system can say that a page was opened but not why the visitor stopped.

## Priorities produced by the tests

### P1 — Put verified trust and the four-step process directly after the hero

Use only production-verifiable facts: operator identity, confidentiality boundary, what the review
produces, who reviews it and a response expectation only if it can be met consistently.

### P1 — Reduce the homepage choice block to four–six representative briefs

Keep all SEO landing pages, but stop making an undecided visitor compare eleven equally weighted
cards before learning the operating model.

### P1 — Add privacy-safe acquisition events and separate QA traffic

Record only event names and public page slugs. Never send form values or personally identifiable
information to analytics. Preserve the existing decision not to add PostHog.

### P2 — Enlarge header/footer text-link hit areas

Add padding without changing the visual font size. This improves touch and keyboard comfort even
where WCAG's spacing exception applies.

### P2 — Standardize the primary action vocabulary

Choose one main action family, preferably `Request a private match`, while retaining page-specific
supporting copy.

### P2 — Keep the intake fields until funnel data proves a problem

The form is not intrinsically excessive for qualified B2B matching. Measure open → start → submit
before removing qualification data. If mobile drop-off clusters after the first fields, test the same
inputs in two steps.

## What this audit can and cannot establish

It can establish geometry, contrast, semantics, broken paths, form structure, choice count,
information order, claim consistency and the presence or absence of deceptive patterns.

It cannot establish actual emotion, credibility, recall or purchase intent. Those remain forecasts
until independent traffic or consenting participants exist. The practical substitute now is to make
the strongest deterministic fixes, instrument the funnel and treat future organic behaviour as the
validation layer.

## Standards used

- WCAG 2.2 contrast minimum: https://www.w3.org/WAI/WCAG22/Understanding/contrast-minimum
- WCAG 2.2 target size minimum and exceptions:
  https://www.w3.org/WAI/WCAG22/Understanding/target-size-minimum.html
- WCAG 2.2 focus appearance guidance:
  https://www.w3.org/WAI/WCAG22/Understanding/focus-appearance.html
