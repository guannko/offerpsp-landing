# OfferPSP UX, design and content baseline

- Date: 2026-08-28
- Scope: public merchant-acquisition experience only
- Surfaces: `https://offerpsp.com/` and representative vertical page
  `https://offerpsp.com/psp-for-igaming.html`

## Result status

> Human-participant testing is deferred. The current non-human replacement suite and updated
> priorities are documented in
> `docs/OFFERPSP-AUTOMATED-UX-LOGIC-PSYCHOLOGY-AUDIT-2026-08-28.md`.

- `VERIFIED`: live desktop and mobile rendering, navigation, CTA-to-dialog path, form structure,
  page structure, current Vercel traffic and the latest stored SiteOne crawl.
- `ASSUMPTION`: the attractiveness score is an expert heuristic baseline. It has not yet been
  validated by independent target users.
- `PARTIAL`: the five-second, first-click and moderated tests are fully specified below but no
  external participants have completed them yet.
- `BLOCKED`: Attention Insight's public embedded generator could not connect to its application;
  the direct service requires sign-in. No account was created and no paid service was enabled.

## Executive verdict

OfferPSP already looks like a serious, premium B2B payment product. The visual hierarchy is
strong, the primary CTA is obvious and the representative iGaming page explains its subject more
clearly than most generic PSP-directory pages.

The main weakness is not visual quality. It is **proof and sequencing**:

1. the site asks for commercially sensitive merchant information without showing enough verified
   operator, team, experience or outcome evidence;
2. the homepage places a large directory of payment briefs before the short explanation of the
   matching process;
3. current analytics counts visits but cannot explain attention, hesitation or form abandonment;
4. internal QA traffic is mixed into production traffic, so the small sample cannot support a
   conversion conclusion.

The current heuristic baseline is **76/100**. This means “strong enough to test with real target
users”, not “proven to convert”.

## Scorecard

| Area | Weight | Score | Evidence-backed assessment |
|---|---:|---:|---|
| Message comprehension | 25% | 82 | `Private PSP matching desk`, the H1, the supporting sentence and CTA explain the offer within the first screen. “Wrong introductions” is memorable but still abstract without the supporting copy. |
| Visual hierarchy | 15% | 90 | Logo, headline and pink primary CTA dominate both desktop and mobile. Secondary action remains visually subordinate. |
| Trust | 20% | 52 | Privacy and scope limitations are visible, but the acquisition surface lacks a concise operator identity, people, verified experience, anonymized outcomes or another strong proof mechanism. |
| Informativeness | 15% | 83 | The homepage covers problems, process, GEOs, methods, fit and FAQ. The iGaming page clearly states evaluation inputs and limitations. |
| Navigation and usability | 15% | 76 | Primary links, mobile menu, skip link, dialog focus and form labels work. The homepage information order and mobile length create avoidable effort. |
| Readiness to act | 10% | 80 | CTA is visible above the fold and opens a working six-field private-intake dialog. The mobile submit action sits below the first dialog viewport but the form remains understandable. |
| **Weighted baseline** | **100%** | **76** | **Expert baseline pending independent-user validation.** |

## Verified measurements

### Homepage

| Measurement | Desktop 1440×1000 | Mobile 390×844 |
|---|---:|---:|
| Total rendered height | 7,548 px | 12,908 px |
| Approximate visible words | 872 | 869 |
| H1 / H2 / H3 | 1 / 7 / 20 | 1 / 7 / 20 |
| Links / buttons / forms | 39 / 4 / 1 | 39 / 4 / 1 |
| `Solutions` begins | 981 px | 1,578 px |
| `Process` begins | 3,393 px | 6,224 px |
| Bottom request section begins | 6,716 px | 11,742 px |

The process explanation begins after roughly 3.4 desktop screens or 7.4 mobile screens. The hero
CTA opens the dialog immediately, so this does not block conversion, but it makes the service model
harder to learn for visitors who are not ready to submit on the first screen.

### Representative iGaming page

- desktop rendered height: 3,692 px;
- mobile rendered height: 5,567 px;
- approximate visible words: 359;
- H1 and primary CTA both appear in the first mobile viewport;
- scope and limitations are visible immediately after the main proposition;
- the page explains entity/licence, deposits/payouts, traffic/risk and volume/integration inputs.

### Readability heuristic

An approximate English Flesch calculation over each page's `main` content produced:

| Page | Reading ease | Approximate grade |
|---|---:|---:|
| Homepage | 37.2 | 11.8 |
| iGaming | 29.4 | 12.9 |

This is difficult general-public English but acceptable for a specialist B2B payments audience.
The opening paragraphs should still be tested for comprehension rather than simplified blindly.

### Technical and traffic context

Latest SiteOne audit `9656e27a-5b51-469f-ae97-e80b3c6e0ef7`:

- overall score 9.9;
- SEO, security, performance and accessibility: 10;
- 31/31 successful URLs;
- zero broken URLs.

Live Vercel data retrieved during this audit:

- 46 visitors;
- 81 pageviews;
- 44 homepage visitors;
- 43 visitors with unknown referrer;
- three stored business leads in the last 30 days, only one attributed.

The audit itself changed the live counts: homepage and iGaming pageviews increased while the pages
were inspected. This proves that current production analytics does not exclude staff/QA traffic.
No custom behavioural events are present in the public page code: the CTA opens the dialog and the
form submits the lead, but neither step records an anonymous funnel event.

## What works well

1. **Distinctive first screen.** The typography and colour system are recognisable and avoid the
   generic blue-fintech template.
2. **Correct visual priority.** H1 and CTA are the strongest elements on desktop and mobile.
3. **Clear confidentiality message.** Private review is stated before the visitor is asked to act.
4. **Good target qualification.** GEO, vertical, methods, volume and risk are named explicitly.
5. **Strong representative vertical page.** iGaming content is specific, cautious and useful; it
   does not promise automatic approval or processing coverage.
6. **Accessible interaction basics.** Skip link, semantic headings, labelled controls, modal focus,
   Escape/close behaviour and mobile navigation are present.
7. **Compact intake.** Six visible business fields are a reasonable first qualification step and
   the form explains that an email workspace link follows.

## Priority recommendations

### P1 — Add evidence of trust before asking for the brief

Add one compact trust block after the hero using only facts that can be verified in production:

- exact OfferPSP operator identity and jurisdiction;
- who reviews the request and what role that person/team performs;
- what is kept confidential;
- what the merchant receives after review;
- realistic response expectation if the operation can consistently meet it;
- anonymized outcome/process evidence only after real cases exist.

Do not invent partner counts, approval rates, processed volume, testimonials or logos.

### P1 — Move the four-step process above the payment-brief directory

Recommended homepage order:

`Hero → trust/process proof → four-step matching process → selected payment briefs → coverage →
fit → FAQ → request`

Keep four to six representative briefs on the homepage and link to the remaining research pages.
This shortens the mobile narrative without removing SEO pages from the site.

### P1 — Instrument the anonymous acquisition funnel

Keep the existing decision not to introduce PostHog. Add privacy-safe, non-PII events through the
existing first-party/Vercel analytics path if the current plan supports them:

- `hero_cta_click`;
- `process_click`;
- `vertical_brief_click` with public page slug only;
- `lead_form_open`;
- `lead_form_start` after the first user-entered field, without field values;
- `lead_consent_checked`;
- `lead_submit_success`;
- `lead_submit_failure` with a safe error category only.

Never send names, emails, companies, URLs, GEO text or form contents to analytics. Establish a way
to exclude staff/QA traffic or tag it separately before using conversion rates.

### P2 — Reduce first-screen ambiguity without weakening the design

Retain the headline. Test a more explicit supporting line such as:

> Private PSP matching and qualified introductions for merchants with complex GEO, method and
> risk requirements.

The point is to test whether “PSP matching” and “for merchants” are recalled, not to replace the
current typography on opinion alone.

### P2 — Tighten only the longest specialist sentences

Do not rewrite the site into generic short marketing copy. Split the longest opening and limitation
sentences on vertical pages, then repeat the comprehension test. The audience is professional, so
specialist vocabulary is acceptable when it increases precision.

### P2 — Keep the current intake fields, measure abandonment first

The form is not obviously overlong. Measure `open → start → submit` before removing qualification
fields. If mobile abandonment is concentrated before `Vertical` or `Target GEOs`, test a two-step
layout while keeping the same data requirements.

## Five-second test specification

### Participants

- minimum diagnostic sample: 15 independent participants;
- preferred sample: 20–30;
- at least half should work with online merchants, payments, fintech, gaming, e-commerce or another
  relevant B2B digital business;
- exclude OfferPSP staff, developers and anyone who already knows the current homepage.

Test desktop and mobile hero screenshots separately. Randomize which device version each
participant sees first.

### Questions

1. What does this company do?
2. Who is the service for?
3. What would you expect to receive from it?
4. What action does the page want you to take?
5. Does the company itself process payments?
6. How trustworthy does it look from 1 to 5, and why?
7. What was the first thing you noticed?
8. What remains unclear?

### Pass thresholds

- at least 80% mention PSP/payment-provider matching or introductions;
- at least 70% identify businesses/merchants as the customer;
- at least 80% identify the request/match CTA;
- no more than 20% believe OfferPSP itself processes funds;
- at least 65% give trust 4 or 5;
- no single unintended element is recalled more often than the proposition or CTA.

## First-click test specification

| Task | Expected first action | Pass target |
|---|---|---:|
| “Your licensed iGaming business needs a new PSP. Start the process.” | `Request a private match` | ≥80%, median ≤5 sec |
| “Find out what happens after you send your profile.” | `See how matching works` or `Process` | ≥70%, median ≤7 sec |
| “Find payment requirements for a European merchant.” | Europe brief / Solutions path | ≥70%, median ≤8 sec |
| “You already have a workspace. Sign in.” | `Client login` | ≥85%, median ≤5 sec |

Record first target, time, confidence and the participant's explanation. Do not coach or explain
the meaning of PSP before the test.

## Moderated usability script

Use five target participants. Ask them to think aloud while they:

1. explain the service in their own words;
2. determine whether their business appears eligible;
3. find the process and confidentiality explanation;
4. open the request form and describe what information they would be comfortable providing;
5. stop before actual submission unless they independently consent to create a real request;
6. identify what proof they need before sharing company details.

The moderator must not defend the site. Capture exact phrases, hesitations, wrong assumptions and
requested proof.

## Decision rule after testing

- Fix immediately when the same comprehension or trust problem appears in at least three of five
  moderated sessions or at least 30% of the unmoderated sample.
- Treat preference comments as hypotheses unless they correlate with task success, recall or
  willingness to submit.
- Re-run the same five-second and first-click tasks after each material hero or navigation change.
- Do not run statistical A/B tests until independent traffic is large enough to separate real
  visitors from staff/QA sessions.

## External test references

- Maze five-second test: https://help.maze.co/articles/9494336326-present-an-image-with-a-5-second-test
- Lyssna usability methods: https://www.lyssna.com/videos/usability-testing-methods/
- Microsoft Clarity recordings and heatmaps: https://learn.microsoft.com/en-us/clarity/
- Attention Insight predictive attention features: https://attentioninsight.com/features/
