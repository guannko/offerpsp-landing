import { writeFile } from "node:fs/promises";
import { resolve } from "node:path";

export const seoPages = [
  {
    slug: "psp-for-igaming",
    title: "PSP Matching for iGaming Businesses | OfferPSP",
    description: "Private PSP matching for licensed iGaming operators: payment coverage, deposits, payouts, risk profile and qualified provider introductions.",
    kicker: "iGaming payment infrastructure",
    heading: "PSP matching for licensed iGaming businesses.",
    lead: "A provider that accepts gaming traffic is not automatically the right operating partner. OfferPSP qualifies the entity, licences, markets, payment flows and risk profile before arranging a relevant introduction.",
    boundary: "OfferPSP does not provide payment processing and cannot guarantee merchant approval. Each independent PSP makes its own underwriting, compliance and commercial decisions.",
    sectionTitle: "What an iGaming PSP needs to evaluate",
    sectionIntro: "A useful introduction starts with an underwriting-ready operating profile, not a request for a generic provider list.",
    points: [
      ["Entity, licence and product", "Legal entity, licensing jurisdiction, active product URL, target brands and the regulated status of every market in scope."],
      ["Deposit and payout flows", "Required currencies, deposit methods, withdrawal logic, payout timing, expected ratios and whether cards, bank rails or local methods are needed."],
      ["Traffic and risk profile", "Acquisition channels, target player GEOs, expected chargebacks, fraud controls, responsible-gaming controls and source-of-funds procedures."],
      ["Volume and integration", "Realistic monthly processing volume, average ticket, peak load, current stack, integration preference and launch timetable."]
    ],
    checklistTitle: "Prepare the matching brief",
    checklist: ["Company and product URLs", "Licensing evidence and jurisdictions", "Player and entity GEOs", "Deposits, payouts and currencies", "Expected volume and ticket size", "Current PSP constraints and launch date"],
    faqs: [
      ["Can OfferPSP guarantee that an iGaming merchant will be accepted?", "No. We reduce avoidable mismatches, but each provider independently reviews the merchant, licence, ownership, traffic, controls and operating model."],
      ["Do you work with unlicensed operators?", "A request may be reviewed, but provider availability depends on the lawful operating model and the requirements of each target jurisdiction. Missing or unclear licensing information is a material matching constraint."],
      ["Can one PSP cover every player GEO?", "Often not. Multi-GEO businesses may need a primary route, local alternatives and a resilient backup structure. The practical design depends on the entity, method and provider coverage."],
      ["Do you reveal your provider network publicly?", "No. Provider identities are shared only through a controlled introduction after the profile has been qualified and there is a plausible fit."]
    ],
    related: ["high-risk-payment-provider", "cross-border-payment-matching", "payment-methods-by-geo"]
  },
  {
    slug: "high-risk-payment-provider",
    title: "High-Risk Payment Provider Matching | OfferPSP",
    description: "Find relevant payment provider routes for regulated or higher-risk online business models through private qualification and provider matching.",
    kicker: "Complex and higher-risk profiles",
    heading: "Find a payment provider for a complex risk profile.",
    lead: "“High risk” is not a single provider category. Underwriting depends on the vertical, licence, entity, acquisition model, customer GEOs, transaction behaviour and operational controls. We map those facts before opening a provider conversation.",
    boundary: "OfferPSP is a matching and introduction service, not a high-risk payment processor. We do not bypass compliance, underwriting or provider restrictions.",
    sectionTitle: "Why risk-specific matching matters",
    sectionIntro: "A provider may accept one version of a vertical and reject another. The details determine whether a route is credible.",
    points: [
      ["Risk is profile-specific", "The same vertical can produce very different outcomes depending on licences, entity location, fulfilment, traffic acquisition and customer geography."],
      ["Commercial fit is more than an approval", "Reserves, settlement timing, dispute exposure, rolling limits, payout support and operational response all affect whether the route is usable."],
      ["Evidence shortens qualification", "Corporate documents, policies, processing history, chargeback data and a clear funds flow help providers assess a case without repeated clarification."],
      ["Resilience may require several routes", "A primary provider, local method specialists and a backup route can reduce dependency, provided the structure remains lawful and operationally manageable."]
    ],
    checklistTitle: "What to include in the profile",
    checklist: ["Entity, owners and website", "Licence or regulatory position", "Products, fulfilment and traffic", "Customer and operating GEOs", "Processing history and disputes", "Required methods, currencies and settlement"],
    faqs: [
      ["What does high-risk payment processing mean?", "It is a broad industry label for profiles that providers assess as having elevated regulatory, fraud, dispute, reputational or operational exposure. The classification and appetite vary by provider."],
      ["Can OfferPSP help avoid compliance checks?", "No. A credible route requires complete and accurate information. Our role is to prepare a relevant introduction, not to circumvent due diligence."],
      ["Will every matched provider offer the same terms?", "No. Pricing, reserves, limits, settlement, required documents and permitted markets are provider-specific and remain subject to final review."],
      ["Can a declined merchant try another route?", "Potentially, if another provider has a genuinely different appetite or coverage. A previous decline should be disclosed where relevant, and the underlying reason must be understood rather than hidden."]
    ],
    related: ["psp-for-igaming", "cross-border-payment-matching", "psp-matching-process"]
  },
  {
    slug: "cross-border-payment-matching",
    title: "Cross-Border Payment Provider Matching | OfferPSP",
    description: "Cross-border PSP matching for businesses that need card acquiring, local payment methods, payouts and settlement across multiple GEOs.",
    kicker: "Cross-border payments",
    heading: "Build payment coverage around the markets you actually serve.",
    lead: "International reach on a provider website does not prove operational fit. OfferPSP compares entity location, customer GEOs, currencies, local methods, settlement needs and vertical appetite before a qualified introduction.",
    boundary: "Coverage is profile-dependent and changes over time. A country name in a provider list is not a promise of onboarding, local acquiring or method availability.",
    sectionTitle: "The practical cross-border matching layer",
    sectionIntro: "Each payment route is a combination of GEO, currency, flow, method, vertical, limits, integration and settlement—not a logo on a global coverage map.",
    points: [
      ["Entity and customer geography", "The merchant entity, place of establishment, customer location and regulated market status can each affect available acquiring and payout routes."],
      ["Local methods and conversion", "Cards alone may underperform where bank transfer, open banking, wallets, vouchers or mobile methods are expected by local customers."],
      ["Currency and settlement", "Presentment currency, settlement currency, FX handling, payout timing, reserves and reconciliation need to fit the merchant’s treasury workflow."],
      ["Primary and backup coverage", "A resilient structure may combine broad regional coverage with local specialists and backup routes, without pretending that one integration solves every market."]
    ],
    checklistTitle: "Map the route before matching",
    checklist: ["Merchant entity and bank location", "Customer GEOs by priority", "Presentment and settlement currencies", "Required local payment methods", "Pay-in and payout requirements", "Volumes, average ticket and launch order"],
    faqs: [
      ["Is cross-border acquiring the same as local acquiring?", "No. Cross-border acquiring serves customers outside the acquirer’s local market, while local acquiring uses a domestic or regional setup. Acceptance, economics and availability can differ."],
      ["Should we use one PSP for every country?", "Not automatically. One integration can simplify operations, but local specialists may improve method coverage or performance. The right balance depends on volume and operational capacity."],
      ["Does OfferPSP handle foreign exchange or settlement funds?", "No. We help evaluate and introduce payment providers. Funds, FX and settlement are handled under the merchant’s direct agreement with the chosen provider."],
      ["Can you match payout routes as well as deposits?", "Where relevant coverage exists, the brief can include both pay-in and payout requirements. They are evaluated as separate operating flows rather than assumed to be identical."]
    ],
    related: ["payment-methods-by-geo", "psp-for-marketplaces", "psp-for-saas"]
  },
  {
    slug: "psp-for-saas",
    title: "PSP Matching for SaaS and Subscription Businesses | OfferPSP",
    description: "Payment provider matching for SaaS and subscription businesses: recurring billing, multi-currency payments, retries, settlement and global growth.",
    kicker: "SaaS and subscription payments",
    heading: "Match the payment stack to recurring revenue.",
    lead: "Subscription payments depend on more than checkout acceptance. Recurring mandates, retry logic, card lifecycle updates, multi-currency billing, dispute controls and data portability all affect long-term revenue operations.",
    boundary: "OfferPSP evaluates provider fit and arranges introductions. Billing logic, tax, merchant-of-record services and payment processing remain separate provider or platform responsibilities.",
    sectionTitle: "What matters for a SaaS payment route",
    sectionIntro: "The best route supports the revenue model after the first successful transaction, not only the initial checkout.",
    points: [
      ["Recurring payment support", "Clarify customer-initiated and merchant-initiated flows, mandate evidence, retry rules, network tokens and account updater availability."],
      ["International expansion", "Entity setup, customer GEOs, billing currencies, local methods and settlement currencies determine which providers can support the launch sequence."],
      ["Revenue recovery and disputes", "Smart retries, dunning, descriptor quality, cancellation flows and evidence management influence involuntary churn and chargebacks."],
      ["Integration and portability", "API quality, webhooks, reporting, reconciliation and the ability to manage tokens or migrate recurring customers affect operational dependency."]
    ],
    checklistTitle: "Prepare the SaaS brief",
    checklist: ["Subscription model and billing cadence", "Customer and entity GEOs", "Currencies and average revenue per account", "Recurring and one-off flows", "Current churn and dispute context", "Billing platform, API and reporting needs"],
    faqs: [
      ["Can the same PSP support one-off and recurring payments?", "Many can, but the recurring flow, mandate model and geography must be confirmed. Support for an initial card payment does not automatically prove support for later merchant-initiated charges."],
      ["Do we need local payment methods for SaaS?", "It depends on the target market and customer type. Cards may be sufficient for some B2B products, while bank debit, open banking, wallets or invoicing may materially improve conversion elsewhere."],
      ["Does OfferPSP provide merchant-of-record services?", "No. We can include merchant-of-record or payment-provider requirements in the research brief where relevant, but the service itself does not resell or process payments."],
      ["Can you help with a backup provider?", "Yes, the matching brief can focus on redundancy, provided token handling, billing orchestration and the operational failover plan are technically feasible."]
    ],
    related: ["cross-border-payment-matching", "payment-methods-by-geo", "psp-matching-process"]
  },
  {
    slug: "psp-for-marketplaces",
    title: "PSP Matching for Online Marketplaces | OfferPSP",
    description: "Payment provider matching for marketplaces: buyer payments, seller onboarding, split funds, payouts, reconciliation and multi-GEO operations.",
    kicker: "Marketplace payment infrastructure",
    heading: "Match the provider to the marketplace funds flow.",
    lead: "Marketplace payments depend on who sells, who collects, who holds funds and who pays each participant. OfferPSP maps the operating and regulatory model before identifying relevant provider routes.",
    boundary: "OfferPSP does not hold marketplace funds or determine the legal payment model. The marketplace and each provider must validate the structure with appropriate legal and compliance advice.",
    sectionTitle: "Marketplace requirements that change the match",
    sectionIntro: "A standard merchant account may not support submerchant onboarding, split settlement or platform payouts. The funds flow must be explicit.",
    points: [
      ["Seller and buyer structure", "Define whether the platform is agent, reseller, merchant of record or technical marketplace, and where buyers, sellers and the platform entity are located."],
      ["Onboarding and verification", "Seller KYB/KYC, beneficial ownership, sanctions screening, document collection and ongoing monitoring shape the provider requirements."],
      ["Collection, split and payout", "The brief should show who receives funds, when fees are deducted, whether balances are held and how sellers are paid."],
      ["Reconciliation and control", "Transaction-level reporting, refunds, disputes, reserves, payout status and ledger exports need to support the platform’s finance and support teams."]
    ],
    checklistTitle: "Document the marketplace flow",
    checklist: ["Platform entity and legal role", "Seller and buyer GEOs", "Seller onboarding requirements", "Collection and split logic", "Payout timing and currencies", "Refund, dispute and reconciliation workflow"],
    faqs: [
      ["Can a normal e-commerce PSP support a marketplace?", "Sometimes, but only if the provider supports the actual platform model. Submerchant onboarding, split funds or third-party payouts often require a specific marketplace product and contract."],
      ["Does OfferPSP decide whether our model is legally compliant?", "No. We collect the operating facts needed for provider matching. Legal classification and regulatory advice must come from qualified counsel and the provider’s compliance team."],
      ["Can sellers be paid in different currencies?", "Potentially, depending on provider coverage, seller location, settlement rules and the platform model. Currency availability should be confirmed for each payout route."],
      ["Can the matching cover both buyer acceptance and seller payouts?", "Yes. We treat collection and payout as distinct flows so that a provider is not assumed to support both merely because one side is available."]
    ],
    related: ["cross-border-payment-matching", "payment-methods-by-geo", "psp-for-saas"]
  },
  {
    slug: "payment-methods-by-geo",
    title: "Payment Methods by GEO: Provider Matching | OfferPSP",
    description: "Plan card, bank, wallet, voucher and payout coverage by GEO before choosing a payment provider or cross-border PSP route.",
    kicker: "Local payment method coverage",
    heading: "Choose payment methods by customer behaviour, not by logo count.",
    lead: "The relevant method mix changes by country, customer segment, device, transaction type and product. OfferPSP turns those requirements into a provider-matching brief instead of assuming that global card coverage is enough.",
    boundary: "Method availability, conversion and settlement depend on the merchant profile and the provider’s current contracts. This page is a planning framework, not a live guarantee of coverage.",
    sectionTitle: "Build a GEO-by-method requirement map",
    sectionIntro: "Start from the customer journey and operating constraints, then evaluate providers against the resulting route matrix.",
    points: [
      ["Cards and local acquiring", "Confirm card schemes, domestic versus cross-border acquiring, authentication, recurring support, descriptors and expected approval conditions."],
      ["Bank and open-banking methods", "Account-to-account payments, direct debit and instant bank methods vary by market, refund model, settlement timing and customer authorisation."],
      ["Wallets, vouchers and mobile", "Alternative methods can improve reach in specific segments, but integration, refunds, limits and reconciliation must fit the business workflow."],
      ["Payout and withdrawal routes", "Payout coverage should be mapped separately from collection, with beneficiary checks, currencies, timing, limits and failure handling made explicit."]
    ],
    checklistTitle: "Create the route matrix",
    checklist: ["Priority countries and customer segments", "Device and checkout journey", "Required cards, banks, wallets or vouchers", "Pay-in, refund and payout flows", "Currencies, ticket sizes and limits", "Settlement and reconciliation requirements"],
    faqs: [
      ["Which payment method is best for Europe?", "There is no single answer. Cards remain important, while bank, wallet and local methods differ significantly by country and customer segment. The correct mix depends on the product and flow."],
      ["Does more payment methods always mean better conversion?", "No. Irrelevant methods add integration and operational cost. Prioritise methods with credible demand, provider support and a clear refund and reconciliation process."],
      ["Can one integration provide every local method?", "Some providers aggregate broad coverage, but availability is still entity-, vertical- and market-specific. Local specialists may be useful where a broad provider has gaps."],
      ["How often should the GEO coverage map be reviewed?", "Whenever the business enters a new market, changes entity or vertical, sees material conversion issues, or a provider changes pricing, limits, underwriting appetite or method availability."]
    ],
    related: ["cross-border-payment-matching", "psp-for-marketplaces", "psp-matching-process"]
  },
  {
    slug: "psp-matching-process",
    title: "How PSP Matching Works | OfferPSP",
    description: "A practical four-step PSP matching process: prepare the merchant brief, screen provider fit, review a focused shortlist and arrange qualified introductions.",
    kicker: "PSP matching process",
    heading: "From payment brief to qualified introduction.",
    lead: "OfferPSP is a private matching desk, not a public provider directory. We use a structured merchant profile to reduce irrelevant conversations and preserve the operating context through the introduction.",
    boundary: "A match is a reason to start a provider conversation, not an approval. Final due diligence, onboarding, pricing and service terms remain with the independent provider.",
    sectionTitle: "The four-step matching process",
    sectionIntro: "Each step improves the signal before confidential provider identities and live commercial conversations are introduced.",
    howTo: true,
    points: [
      ["Prepare the merchant profile", "Provide the entity, website, vertical, licences, customer GEOs, payment methods, currencies, volume, ticket size and current constraints."],
      ["Screen practical provider fit", "We compare the brief with current coverage, method, risk, integration, limit and settlement constraints. Missing facts are clarified rather than invented."],
      ["Review a focused shortlist", "Relevant routes are explained without presenting a generic directory. Provider identity remains controlled until the case is ready for a qualified conversation."],
      ["Confirm interest and introduce", "A provider reviews the merchant dossier and can accept, decline or request more information. A controlled introduction follows only after explicit interest."]
    ],
    checklistTitle: "Information that improves the match",
    checklist: ["Legal entity and product URL", "Licence and operating status", "Target markets and currencies", "Methods, flows and settlement", "Volume, ticket and processing history", "Integration, timing and current blockers"],
    faqs: [
      ["How long does PSP matching take?", "It depends on the completeness and complexity of the profile and on current provider appetite. A complete brief can be assessed faster than an open-ended request, but no fixed onboarding time is promised."],
      ["Why do you not publish the full PSP list?", "A public list creates low-signal outreach and exposes commercial relationships without proving fit. We disclose a relevant provider through a controlled qualification and introduction process."],
      ["What happens if the first provider declines?", "We record the reason where available, protect the provider’s identity and assess whether another genuinely compatible route exists. A decline is not hidden or relabelled as an approval."],
      ["Does a shortlist contain final commercial terms?", "No. It can include current indicative route information, but final pricing, limits, reserves, settlement and contractual terms are confirmed directly by the provider after due diligence."]
    ],
    related: ["cross-border-payment-matching", "high-risk-payment-provider", "payment-methods-by-geo"]
  }
];

const pageBySlug = new Map(seoPages.map((page) => [page.slug, page]));

const escapeHtml = (value) => String(value)
  .replaceAll("&", "&amp;")
  .replaceAll("<", "&lt;")
  .replaceAll(">", "&gt;")
  .replaceAll('"', "&quot;");

const buildStructuredData = (page) => {
  const url = `https://offerpsp.com/${page.slug}.html`;
  const graph = [
    {
      "@type": "Organization",
      "@id": "https://offerpsp.com/#organization",
      name: "Brain Index",
      legalName: "BRAININDEX OÜ",
      url: "https://offerpsp.com/",
      email: "bizdev@offerpsp.com",
      brand: { "@type": "Brand", name: "OfferPSP" }
    },
    {
      "@type": "WebSite",
      "@id": "https://offerpsp.com/#website",
      url: "https://offerpsp.com/",
      name: "OfferPSP",
      publisher: { "@id": "https://offerpsp.com/#organization" },
      inLanguage: "en"
    },
    {
      "@type": "WebPage",
      "@id": `${url}#webpage`,
      url,
      name: page.title,
      description: page.description,
      isPartOf: { "@id": "https://offerpsp.com/#website" },
      about: { "@id": `${url}#service` },
      breadcrumb: { "@id": `${url}#breadcrumb` },
      inLanguage: "en"
    },
    {
      "@type": "Service",
      "@id": `${url}#service`,
      name: page.heading,
      serviceType: page.kicker,
      description: page.lead,
      url,
      provider: { "@id": "https://offerpsp.com/#organization" },
      areaServed: ["Europe", "CIS", "Middle East", "Latin America", "Asia-Pacific"],
      audience: { "@type": "BusinessAudience", audienceType: "B2B merchants and digital businesses" }
    },
    {
      "@type": "BreadcrumbList",
      "@id": `${url}#breadcrumb`,
      itemListElement: [
        { "@type": "ListItem", position: 1, name: "OfferPSP", item: "https://offerpsp.com/" },
        { "@type": "ListItem", position: 2, name: page.heading, item: url }
      ]
    },
    {
      "@type": "FAQPage",
      "@id": `${url}#faq`,
      mainEntity: page.faqs.map(([question, answer]) => ({
        "@type": "Question",
        name: question,
        acceptedAnswer: { "@type": "Answer", text: answer }
      }))
    }
  ];

  if (page.howTo) {
    graph.push({
      "@type": "HowTo",
      "@id": `${url}#howto`,
      name: "How to prepare and complete a PSP matching process",
      description: page.sectionIntro,
      step: page.points.map(([name, text], index) => ({
        "@type": "HowToStep",
        position: index + 1,
        name,
        text,
        url: `${url}#step-${index + 1}`
      }))
    });
  }

  return { "@context": "https://schema.org", "@graph": graph };
};

const renderPage = (page) => {
  const canonical = `https://offerpsp.com/${page.slug}.html`;
  const structuredData = JSON.stringify(buildStructuredData(page), null, 2).replaceAll("</", "<\\/");
  const points = page.points.map(([title, text], index) => `
            <article class="point" id="step-${index + 1}">
              <div class="point-index">0${index + 1}</div>
              <div><h3>${escapeHtml(title)}</h3><p>${escapeHtml(text)}</p></div>
            </article>`).join("");
  const checklist = page.checklist.map((item) => `<div class="check"><strong>${escapeHtml(item)}</strong></div>`).join("\n");
  const faqs = page.faqs.map(([question, answer]) => `
            <details>
              <summary>${escapeHtml(question)}</summary>
              <p>${escapeHtml(answer)}</p>
            </details>`).join("");
  const related = page.related.map((slug) => {
    const linkedPage = pageBySlug.get(slug);
    return `<a class="related-card" href="/${linkedPage.slug}.html"><span>Explore</span><strong>${escapeHtml(linkedPage.heading)}</strong></a>`;
  }).join("\n");

  return `<!doctype html>
<html lang="en">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1">
  <title>${escapeHtml(page.title)}</title>
  <meta name="description" content="${escapeHtml(page.description)}">
  <meta name="robots" content="index, follow, max-image-preview:large">
  <meta name="theme-color" content="#080a13">
  <link rel="canonical" href="${canonical}">
  <link rel="icon" href="/favicon.svg?v=20260815-1" type="image/svg+xml">
  <link rel="stylesheet" href="/service-pages.css?v=20260815-1">
  <meta property="og:type" content="website">
  <meta property="og:url" content="${canonical}">
  <meta property="og:site_name" content="OfferPSP">
  <meta property="og:title" content="${escapeHtml(page.title)}">
  <meta property="og:description" content="${escapeHtml(page.description)}">
  <meta property="og:image" content="https://offerpsp.com/og-offerpsp.png">
  <meta name="twitter:card" content="summary_large_image">
  <script type="application/ld+json">
${structuredData}
  </script>
</head>
<body>
  <a class="skip-link" href="#main">Skip to content</a>
  <header class="site-header">
    <nav class="container nav" aria-label="Primary navigation">
      <a class="brand" href="/" aria-label="OfferPSP home"><span class="brand-mark" aria-hidden="true">OP</span><span>Offer<strong>PSP</strong></span></a>
      <div class="nav-links"><a href="/psp-matching-process.html">How it works</a><a href="/#request">Private request</a><a class="button" href="/#request">Request a match</a></div>
    </nav>
  </header>
  <main id="main">
    <div class="container breadcrumbs"><a href="/">OfferPSP</a> / ${escapeHtml(page.kicker)}</div>
    <section class="hero">
      <div class="container hero-grid">
        <div>
          <div class="kicker">${escapeHtml(page.kicker)}</div>
          <h1>${escapeHtml(page.heading)}</h1>
          <p class="hero-lead">${escapeHtml(page.lead)}</p>
          <a class="button" href="/#request">Send a private payment brief</a>
        </div>
        <aside class="boundary"><strong>Scope and limitations</strong><p>${escapeHtml(page.boundary)}</p></aside>
      </div>
    </section>
    <section class="content-section alt">
      <div class="container section-grid">
        <div><div class="kicker">What we evaluate</div><h2>${escapeHtml(page.sectionTitle)}</h2><p class="section-intro">${escapeHtml(page.sectionIntro)}</p></div>
        <div class="points">${points}
        </div>
      </div>
    </section>
    <section class="content-section">
      <div class="container section-grid">
        <div><div class="kicker">Matching inputs</div><h2>${escapeHtml(page.checklistTitle)}</h2><p class="section-intro">Specific, current information improves the quality of every provider conversation.</p></div>
        <div class="checklist">${checklist}</div>
      </div>
    </section>
    <section class="content-section alt" id="faq">
      <div class="container section-grid">
        <div><div class="kicker">Questions</div><h2>What businesses usually ask</h2></div>
        <div class="faq-list">${faqs}
        </div>
      </div>
    </section>
    <section class="content-section">
      <div class="container">
        <div class="kicker">Related payment briefs</div>
        <h2>Continue the research</h2>
        <div class="related-grid">${related}</div>
      </div>
    </section>
    <section class="container cta">
      <div><div class="kicker">Private qualification</div><h2>Describe the route that must work.</h2><p>Share the company, target GEOs, vertical, methods, volume and current constraint. We will assess the next useful step without publishing your provider search.</p></div>
      <a class="button" href="/#request">Request a private match</a>
    </section>
  </main>
  <footer class="site-footer">
    <div class="container footer-grid">
      <div>© 2026 OfferPSP · A Brain Index product</div>
      <nav class="footer-links" aria-label="Footer navigation"><a href="/">Home</a><a href="/privacy.html">Privacy</a><a href="/terms.html">Terms</a><a href="mailto:bizdev@offerpsp.com">Contact</a></nav>
    </div>
  </footer>
</body>
</html>
`;
};

export async function writeSeoPages(outputDirectory) {
  for (const page of seoPages) {
    await writeFile(resolve(outputDirectory, `${page.slug}.html`), renderPage(page), "utf8");
  }
}
