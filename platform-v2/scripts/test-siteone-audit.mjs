import assert from "node:assert/strict";
import { collectGeoSignals, normalizeSiteOneAudit, publicPageChecksFromEvidence } from "../api/_lib/siteone-audit.mjs";
import { runSiteOneAudit } from "../api/_lib/siteone-runner.mjs";
import {
  collectSeoAgentEvidence,
  normalizeSeoAgentAnalysis,
  resolveSeoAgentWebhookUrl,
  runSeoGeoAgent,
} from "../api/_lib/seo-geo-agent.mjs";

const report = {
  crawler: { name: "SiteOne Crawler", version: "2.5.1.20260627", executedAt: "2026-08-14 11:47:50" },
  stats: {
    totalUrls: 10,
    totalSize: 200909,
    totalExecutionTime: 5.862,
    totalRequestsTimesAvg: 0.227,
    totalRequestsTimesMax: 0.268,
    countByStatus: { 200: 10 },
  },
  qualityScores: {
    overall: { score: 9.1 },
    categories: [
      { code: "seo", score: 9.8 },
      { code: "best-practices", score: 9.1 },
    ],
  },
  summary: { items: [
    { aplCode: "pages-with-multiple-h1", status: "CRITICAL", text: "1 page(s) with multiple <h1> headings." },
    { aplCode: "security", status: "CRITICAL", text: "Security - 4 page(s) with critical finding(s)." },
    { aplCode: "robots-txt-example", status: "NOTICE", text: "Loaded robots.txt: status code 200, size 277 B." },
    { aplCode: "dns-ipv6", status: "NOTICE", text: "DNS IPv6 unavailable (DNS server: 169.254.100.5)." },
    { aplCode: "static-assets-short-cache", status: "NOTICE", text: "5 static asset(s) use a short cache policy." },
  ] },
  results: [
    { url: "https://offerpsp.com/", status: "200", type: 1 },
    { url: "https://offerpsp.com/portal/", status: "200", type: 1 },
    { url: "https://outside.test/ignored", status: "200", type: 1 },
  ],
  analysis: {
    sections: {
      skipped: {
        aplCode: "skipped",
        rows: [
          { reason: "Not allowed host", sourceAttr: "<script src>", sourceUqId: "/portal/?private=1", url: "https://cdn.example.test/app.js?v=2" },
          { reason: "Robots.txt", sourceAttr: "<a href>", sourceUqId: "/", url: "/private/?token=redacted" },
        ],
      },
    },
  },
};

const audit = normalizeSiteOneAudit(report);
assert.equal(audit.overall_score, 9.1);
assert.equal(audit.category_scores.best_practices, 9.1);
assert.equal(audit.crawl_stats.successful_urls, 10);
assert.equal(audit.issues[0].count, 1);
assert.equal(audit.issues[1].count, 4);
assert.equal(audit.issues[2].count, 1);
assert.equal(audit.issues[3].count, 1);
assert.equal(audit.issues[4].count, 5);
assert.equal(audit.audited_at, "2026-08-14T11:47:50.000Z");
assert.deepEqual(audit.metadata.crawled_page_urls, ["https://offerpsp.com/", "https://offerpsp.com/portal/"]);
assert.deepEqual(audit.metadata.skipped_urls, [
  {
    reason: "Not allowed host",
    source: "<script src>",
    found_at_url: "https://offerpsp.com/portal/",
    url: "https://cdn.example.test/app.js",
    external: true,
  },
  {
    reason: "Robots.txt",
    source: "<a href>",
    found_at_url: "https://offerpsp.com/",
    url: "https://offerpsp.com/private/",
    external: false,
  },
]);
assert.throws(() => normalizeSiteOneAudit({ crawler_error: "crawl failed" }), /crawl failed/);

const responses = new Map([
  ["https://offerpsp.com/robots.txt", "User-agent: *\nAllow: /"],
  ["https://offerpsp.com/llms.txt", "# OfferPSP"],
  ["https://offerpsp.com/sitemap.xml", "<urlset></urlset>"],
  ["https://offerpsp.com/", '<script type="application/ld+json">{}</script>'],
]);
const geo = await collectGeoSignals(async (url) => new Response(responses.get(url), { status: 200 }));
assert.equal(geo.robots_txt.ai_crawlers_allowed, true);
assert.equal(geo.llms_txt.ok, true);
assert.equal(geo.structured_data.blocks, 1);

let invokedBinary = "";
let invokedArgs = [];
let madeDirectory = "";
const runtimeReport = await runSiteOneAudit({
  executor: async (binary, args) => { invokedBinary = binary; invokedArgs = args; },
  directoryMaker: async (directory) => { madeDirectory = directory; },
  fileReader: async () => JSON.stringify(report),
  fileRemover: async () => undefined,
  runtimeArch: "x64",
});
assert.match(invokedBinary, /vendor\/siteone-crawler\/siteone-crawler-x64$/);
assert.ok(invokedArgs.includes("--http-cache-dir=off"));
assert.ok(invokedArgs.includes("--result-storage-dir=/tmp"));
assert.equal(invokedArgs.some((argument) => argument.startsWith("--ai-")), false);
assert.equal(madeDirectory, "/tmp/tmp/ai-cache");
assert.equal(runtimeReport.crawler.name, "SiteOne Crawler");

await runSiteOneAudit({
  executor: async (binary) => { invokedBinary = binary; },
  directoryMaker: async () => undefined,
  fileReader: async () => JSON.stringify(report),
  fileRemover: async () => undefined,
  runtimeArch: "arm64",
});
assert.match(invokedBinary, /vendor\/siteone-crawler\/siteone-crawler-arm64$/);
await assert.rejects(() => runSiteOneAudit({ runtimeArch: "ppc64" }), /does not support runtime architecture/);

const agentAudit = {
  ...audit,
  metadata: { ...audit.metadata, geo_signals: geo },
};
const sitemapXml = `<?xml version="1.0"?><urlset>
  <url><loc>https://offerpsp.com/</loc></url>
  <url><loc>https://offerpsp.com/privacy.html</loc></url>
  <url><loc>https://outside.test/ignored</loc></url>
</urlset>`;
const pageHtml = (title, h1) => `<!doctype html><html lang="en"><head>
  <title>${title}</title><meta name="description" content="Confidential payment matching">
  <link rel="canonical" href="https://offerpsp.com/"><link rel="alternate" hreflang="en" href="https://offerpsp.com/"><script type="application/ld+json">{"@graph":[{"@type":"Organization"},{"@type":"Service"}]}</script>
  </head><body><a class="brand"><img src="/brand/offerpsp-logo-horizontal-transparent.png" alt="OfferPSP"></a><h1>${h1}</h1><h2>How it works</h2><p>Qualified payment introductions for merchants and PSPs.</p><label for="company">Company</label><input id="company" type="text"></body></html>`;
const portalHtml = `<!doctype html><html lang="ru"><head><title>Portal</title><meta name="robots" content="noindex, nofollow"></head><body><main><h1>Portal</h1>
  <input id="trap" type="text" aria-hidden="true">
</main></body></html>`;
const securityHeaders = {
  "content-security-policy": "default-src 'self'",
  "x-frame-options": "DENY",
  "x-content-type-options": "nosniff",
  "referrer-policy": "strict-origin-when-cross-origin",
  "permissions-policy": "camera=()",
  "content-encoding": "br",
};
const evidence = await collectSeoAgentEvidence(agentAudit, async (url) => {
  if (url === "https://offerpsp.com/sitemap.xml") return new Response(sitemapXml, { status: 200, headers: securityHeaders });
  if (url === "https://offerpsp.com/llms.txt") return new Response(`# OfferPSP\n- Home: https://offerpsp.com/\n- Privacy: https://offerpsp.com/privacy.html`, { status: 200, headers: securityHeaders });
  if (url === "https://offerpsp.com/") return new Response(pageHtml("OfferPSP", "The right PSP"), { status: 200, headers: securityHeaders });
  if (url === "https://offerpsp.com/privacy.html") return new Response(pageHtml("Privacy", "Privacy policy"), { status: 200, headers: securityHeaders });
  if (url === "https://offerpsp.com/portal/") return new Response(portalHtml, { status: 200, headers: securityHeaders });
  return new Response("not found", { status: 404 });
});
assert.equal(evidence.pages.length, 3);
assert.equal(evidence.pages[0].title, "OfferPSP");
assert.deepEqual(evidence.pages[0].h1, ["The right PSP"]);
assert.equal(evidence.pages[0].json_ld_blocks, 1);
assert.deepEqual(evidence.pages[0].json_ld_types, ["Organization", "Service"]);
assert.equal(evidence.pages[0].form_controls.unlabeled, 0);
assert.equal(evidence.pages[1].url, "https://offerpsp.com/portal/");
assert.deepEqual(evidence.pages[1].form_controls.unlabeled_controls, [{ tag: "input", id: "trap", name: "", type: "text" }]);
assert.equal(evidence.pages[0].image_inventory.content_raster_images, 0);
assert.equal(evidence.pages[0].image_inventory.image_tags, 1);
assert.equal(evidence.pages[0].image_inventory.brand_or_ui_images, 1);
const publicPageChecks = publicPageChecksFromEvidence(evidence);
assert.equal(publicPageChecks.pages.length, 3);
assert.equal(publicPageChecks.pages[0].url, "https://offerpsp.com/");
assert.equal(publicPageChecks.pages[0].status, 200);
assert.equal(publicPageChecks.pages[0].canonical, "https://offerpsp.com/");
assert.equal(publicPageChecks.pages[0].indexable, true);
assert.equal(publicPageChecks.pages.find((page) => page.url.endsWith("/portal/"))?.indexable, false);
assert.equal(evidence.pages[0].image_inventory.content_images, 0);
assert.deepEqual(evidence.pages[0].hreflang_alternates, [{ hreflang: "en", href: "https://offerpsp.com/" }]);
assert.equal(evidence.pages[0].response_headers["content-security-policy"], "default-src 'self'");
assert.equal(evidence.llms_txt.ok, true);
assert.deepEqual(evidence.siteone.skipped_urls, audit.metadata.skipped_urls);
assert.equal(evidence.siteone.crawled_page_count, 2);
assert.deepEqual(evidence.llms_txt.same_origin_urls, ["https://offerpsp.com/", "https://offerpsp.com/privacy.html"]);

assert.equal(resolveSeoAgentWebhookUrl({
  AIBOT_WEBHOOK_URL: "https://n8n.test/webhook/captains-bridge-aibot",
}), "https://n8n.test/webhook/offerpsp-seo-geo-agent");

const rawAgentAnalysis = {
  executive_summary: "Technical health is strong; improve differentiated public copy.",
  confidence: "high",
  priorities: [{
    priority: "P1",
    area: "Content",
    title: "Strengthen public proof",
    evidence: "The homepage explains the service but includes little evidence.",
    recommendation: "Add anonymized outcomes without naming confidential PSPs.",
    affected_urls: ["https://offerpsp.com/"],
  }],
  quick_wins: ["Improve the homepage proof block"],
  content_recommendations: [],
  geo_recommendations: ["Keep llms.txt aligned with public sitemap pages"],
  limitations: ["No Search Console query data was included"],
};
const normalizedAgent = normalizeSeoAgentAnalysis({ analysis: rawAgentAnalysis, model: "deepseek-chat" });
assert.equal(normalizedAgent.status, "completed");
assert.equal(normalizedAgent.priorities[0].priority, "P1");
assert.throws(() => normalizeSeoAgentAnalysis({ analysis: {} }), /empty summary/);

const unsupportedSecurity = normalizeSeoAgentAnalysis({ analysis: {
  ...rawAgentAnalysis,
  confidence: "high",
  priorities: [{
    priority: "P0",
    area: "Technical",
    title: "Add missing CSP and X-Frame-Options",
    evidence: "The aggregate crawler security warning reports missing headers.",
    recommendation: "Add CSP, X-Frame-Options and Permissions-Policy.",
    affected_urls: ["https://offerpsp.com/"],
  }],
} }, evidence);
assert.equal(unsupportedSecurity.priorities.length, 0);
assert.equal(unsupportedSecurity.confidence, "medium");
assert.match(unsupportedSecurity.limitations.join(" "), /already contain/i);

const unsupportedAggregates = normalizeSeoAgentAnalysis({ analysis: {
  ...rawAgentAnalysis,
  executive_summary: "The site is healthy. Missing WebP/AVIF images and Brotli support are the main technical problems.",
  confidence: "high",
  priorities: [
    {
      priority: "P1",
      area: "Technical",
      title: "Add WebP/AVIF images",
      evidence: "SiteOne found no WebP or AVIF image.",
      recommendation: "Convert raster images to WebP.",
      affected_urls: ["https://offerpsp.com/"],
    },
    {
      priority: "P2",
      area: "Technical",
      title: "Enable Brotli support",
      evidence: "Aggregate crawler warning.",
      recommendation: "Enable Brotli on the CDN.",
      affected_urls: ["https://offerpsp.com/"],
    },
  ],
  quick_wins: ["Add WebP images", "Enable Brotli"],
} }, evidence);
assert.equal(unsupportedAggregates.priorities.length, 0);
assert.equal(unsupportedAggregates.quick_wins.length, 0);
assert.equal(unsupportedAggregates.confidence, "medium");
assert.doesNotMatch(unsupportedAggregates.executive_summary, /(WebP|AVIF|Brotli)/i);
assert.match(unsupportedAggregates.limitations.join(" "), /no content raster images/i);
assert.match(unsupportedAggregates.limitations.join(" "), /use Brotli/i);

const unsupportedSummaryOnly = normalizeSeoAgentAnalysis({ analysis: {
  ...rawAgentAnalysis,
  executive_summary: "Site health is strong. The main problem is absence of WebP/AVIF, although indexed pages have no content raster images.",
  priorities: rawAgentAnalysis.priorities,
} }, evidence);
assert.doesNotMatch(unsupportedSummaryOnly.executive_summary, /(WebP|AVIF)/i);
assert.match(unsupportedSummaryOnly.limitations.join(" "), /no content raster images/i);

const unsupportedStructuredData = normalizeSeoAgentAnalysis({ analysis: {
  ...rawAgentAnalysis,
  confidence: "high",
  priorities: [{
    priority: "P1",
    area: "GEO",
    title: "Improve structured data",
    evidence: "The JSON-LD type is not specified in the supplied data.",
    recommendation: "Add a Schema.org Service type.",
    affected_urls: ["https://offerpsp.com/"],
  }],
} }, evidence);
assert.equal(unsupportedStructuredData.priorities.length, 0);
assert.equal(unsupportedStructuredData.confidence, "medium");
assert.match(unsupportedStructuredData.limitations.join(" "), /already declares Schema\.org types/i);

const unsupportedNoindexMetadata = normalizeSeoAgentAnalysis({ analysis: {
  ...rawAgentAnalysis,
  executive_summary: "The site is healthy. Improve meta-descriptions for stronger search visibility.",
  priorities: [{
    priority: "P1",
    area: "SEO",
    title: "Add a meta-description to the portal",
    evidence: "The portal has no meta-description, reducing CTR in search results.",
    recommendation: "Add a search description.",
    affected_urls: ["https://offerpsp.com/portal/"],
  }],
  quick_wins: ["Add a meta-description to the portal"],
  content_recommendations: [{
    url: "https://offerpsp.com/portal/",
    suggested_title: "Private portal",
    suggested_meta_description: "Private workspace",
    rationale: "Improve search visibility and CTR.",
  }],
} }, evidence);
assert.equal(unsupportedNoindexMetadata.priorities.length, 0);
assert.equal(unsupportedNoindexMetadata.quick_wins.length, 0);
assert.equal(unsupportedNoindexMetadata.content_recommendations.length, 0);
assert.doesNotMatch(unsupportedNoindexMetadata.executive_summary, /meta[- ]?description/i);
assert.match(unsupportedNoindexMetadata.limitations.join(" "), /intentionally noindex/i);

const unsupportedMixedNonAcquisitionMetadata = normalizeSeoAgentAnalysis({ analysis: {
  ...rawAgentAnalysis,
  priorities: [{
    priority: "P1",
    area: "Content",
    title: "Improve meta descriptions",
    evidence: "The portal has an empty meta_description and the legal descriptions lack payment keywords.",
    recommendation: "Add acquisition keywords to all three pages.",
    affected_urls: [
      "https://offerpsp.com/portal/",
      "https://offerpsp.com/privacy.html",
      "https://offerpsp.com/terms.html",
    ],
  }],
  quick_wins: [
    "Add meta_description for /portal/.",
    "Update meta_description for /privacy.html and /terms.html.",
  ],
} }, evidence);
assert.equal(unsupportedMixedNonAcquisitionMetadata.priorities.length, 0);
assert.equal(unsupportedMixedNonAcquisitionMetadata.quick_wins.length, 0);
assert.match(unsupportedMixedNonAcquisitionMetadata.limitations.join(" "), /legal pages are not acquisition/i);

const evidenceWithVerticals = {
  ...evidence,
  pages: [
    ...evidence.pages,
    { url: "https://offerpsp.com/psp-for-igaming.html", status: 200 },
    { url: "https://offerpsp.com/psp-for-forex.html", status: 200 },
    { url: "https://offerpsp.com/psp-for-saas.html", status: 200 },
    { url: "https://offerpsp.com/psp-for-crypto-businesses.html", status: 200 },
    { url: "https://offerpsp.com/payment-provider-africa.html", status: 200 },
    { url: "https://offerpsp.com/payment-provider-asia-pacific.html", status: 200 },
  ],
};
const unsupportedExistingPageCreation = normalizeSeoAgentAnalysis({ analysis: {
  ...rawAgentAnalysis,
  priorities: [{
    priority: "P2",
    area: "Content",
    title: "Create iGaming and Forex pages",
    evidence: "The verticals are mentioned but have no pages.",
    recommendation: "Develop /psp-for-igaming.html and /psp-for-forex.html.",
    affected_urls: ["https://offerpsp.com/"],
  }, {
    priority: "P2",
    area: "Technical",
    title: "Check the noindex portal",
    evidence: "The portal is noindex.",
    recommendation: "Verify that noindex is intentional.",
    affected_urls: ["https://offerpsp.com/portal/"],
  }, {
    priority: "P2",
    area: "Technical",
    title: "Check skipped and external URLs",
    evidence: "The aggregate lists 3 skipped URLs and 3 external URLs without their addresses.",
    recommendation: "Check the full report.",
    affected_urls: [],
  }],
} }, evidenceWithVerticals);
assert.equal(unsupportedExistingPageCreation.priorities.length, 0);
assert.match(unsupportedExistingPageCreation.limitations.join(" "), /successfully loaded/i);
assert.match(unsupportedExistingPageCreation.limitations.join(" "), /noindex directive is intentional/i);

const unsupportedExistingTopicCreation = normalizeSeoAgentAnalysis({ analysis: {
  ...rawAgentAnalysis,
  priorities: [{
    priority: "P1",
    area: "Content",
    title: "Добавить страницы для ключевых вертикалей и регионов",
    evidence: "В крауле якобы отсутствуют отдельные страницы для iGaming, Forex, SaaS и crypto, а также Африки и Азии.",
    recommendation: "Создать страницы для iGaming, Forex, SaaS, crypto, Африки и Юго-Восточной Азии.",
    affected_urls: ["https://offerpsp.com/"],
  }],
} }, evidenceWithVerticals);
assert.equal(unsupportedExistingTopicCreation.priorities.length, 0);
assert.match(unsupportedExistingTopicCreation.limitations.join(" "), /successfully loaded/i);

const completeEvidenceLimitation = normalizeSeoAgentAnalysis({ analysis: {
  ...rawAgentAnalysis,
  limitations: ["Недоступен полный список URL, поэтому невозможно оценить все страницы сайта."],
} }, {
  ...evidence,
  siteone: { ...evidence.siteone, crawled_page_count: evidence.pages.length },
});
assert.doesNotMatch(completeEvidenceLimitation.limitations.join(" "), /полный список URL/i);

const unsupportedAggregateNoindexReview = normalizeSeoAgentAnalysis({ analysis: {
  ...rawAgentAnalysis,
  executive_summary: "The site is healthy, but one unknown noindex page requires review.",
  priorities: [{
    priority: "P2",
    area: "Technical",
    title: "Исправить страницу с noindex",
    evidence: "SiteOne reports one unknown noindex page.",
    recommendation: "Проверить полный отчёт и убедиться, что noindex установлен намеренно.",
    affected_urls: [],
  }],
} }, evidence);
assert.equal(unsupportedAggregateNoindexReview.priorities.length, 0);
assert.match(unsupportedAggregateNoindexReview.limitations.join(" "), /noindex directive is intentional/i);
assert.doesNotMatch(unsupportedAggregateNoindexReview.executive_summary, /noindex/i);

const benignExternalSkippedReview = normalizeSeoAgentAnalysis({ analysis: {
  ...rawAgentAnalysis,
  priorities: [{
    priority: "P2",
    area: "Technical",
    title: "Проверить пропущенные URL и noindex страницы",
    evidence: "SiteOne сообщает о 3 пропущенных URL и 1 странице с noindex.",
    recommendation: "Проверить полный отчет и убедиться, что страницы не блокируются.",
    affected_urls: ["https://offerpsp.com/"],
  }],
} }, {
  ...evidence,
  siteone: {
    ...evidence.siteone,
    skipped_urls: [
      { reason: "Not allowed host", url: "https://cdn.example.test/app.js", external: true },
      { reason: "Not allowed host", url: "https://api.example.test/", external: true },
    ],
  },
});
assert.equal(benignExternalSkippedReview.priorities.length, 0);
assert.match(benignExternalSkippedReview.limitations.join(" "), /no internal public page/i);

const filteredContentRecommendations = normalizeSeoAgentAnalysis({ analysis: {
  ...rawAgentAnalysis,
  content_recommendations: [{
    url: "https://offerpsp.com/",
    suggested_title: "",
    suggested_meta_description: "",
    rationale: "Improve the homepage metadata.",
  }, {
    url: "https://offerpsp.com/",
    suggested_title: "OfferPSP",
    suggested_meta_description: "Confidential payment matching",
    rationale: "Use the current metadata.",
  }, {
    url: "https://offerpsp.com/",
    suggested_title: "OfferPSP — Private PSP matching",
    suggested_meta_description: "Confidential payment matching",
    rationale: "Make the title more specific.",
  }],
} }, evidence);
assert.equal(filteredContentRecommendations.content_recommendations.length, 1);
assert.equal(filteredContentRecommendations.content_recommendations[0].suggested_title, "OfferPSP — Private PSP matching");

const unsupportedHreflangExpansion = normalizeSeoAgentAnalysis({ analysis: {
  ...rawAgentAnalysis,
  priorities: [{
    priority: "P1",
    area: "SEO",
    title: "Add hreflang to every main page",
    evidence: "The English pages do not have Russian alternates.",
    recommendation: "Add hreflang for future translations.",
    affected_urls: ["https://offerpsp.com/"],
  }],
  quick_wins: ["Add hreflang to all main pages", "Add hreflang to psp-for-marketplaces.html and psp-for-saas.html", "Check skipped URLs in SiteOne"],
  geo_recommendations: ["Check canonical and hreflang for multilingual versions"],
  limitations: ["Full details for skipped URLs are unavailable.", "Information about external links is unavailable."],
} }, evidence);
assert.equal(unsupportedHreflangExpansion.priorities.length, 0);
assert.equal(unsupportedHreflangExpansion.quick_wins.length, 0);
assert.equal(unsupportedHreflangExpansion.geo_recommendations.length, 0);
assert.doesNotMatch(unsupportedHreflangExpansion.limitations.join(" "), /skipped URLs|external links/i);
assert.match(unsupportedHreflangExpansion.limitations.join(" "), /without a discovered live translation/i);

const reciprocalHreflangEvidence = {
  ...evidence,
  pages: [
    {
      url: "https://offerpsp.com/payment-provider-cis-central-asia.html",
      status: 200,
      lang: "en",
      hreflang_alternates: [
        { hreflang: "en", href: "https://offerpsp.com/payment-provider-cis-central-asia.html" },
        { hreflang: "ru", href: "https://offerpsp.com/payment-provider-cis-central-asia-ru.html" },
        { hreflang: "x-default", href: "https://offerpsp.com/payment-provider-cis-central-asia.html" },
      ],
    },
    {
      url: "https://offerpsp.com/payment-provider-cis-central-asia-ru.html",
      status: 200,
      lang: "ru",
      hreflang_alternates: [
        { hreflang: "en", href: "https://offerpsp.com/payment-provider-cis-central-asia.html" },
        { hreflang: "ru", href: "https://offerpsp.com/payment-provider-cis-central-asia-ru.html" },
        { hreflang: "x-default", href: "https://offerpsp.com/payment-provider-cis-central-asia.html" },
      ],
    },
  ],
};
const unsupportedImplementedHreflang = normalizeSeoAgentAnalysis({ analysis: {
  ...rawAgentAnalysis,
  priorities: [{
    priority: "P2",
    area: "SEO",
    title: "Add hreflang for the English page",
    evidence: "Only the Russian page has alternates.",
    recommendation: "Add hreflang to the English CIS page.",
    affected_urls: ["https://offerpsp.com/payment-provider-cis-central-asia.html"],
  }],
} }, reciprocalHreflangEvidence);
assert.equal(unsupportedImplementedHreflang.priorities.length, 0);
assert.match(unsupportedImplementedHreflang.limitations.join(" "), /already declare reciprocal hreflang/i);

const unsupportedSecurityReview = normalizeSeoAgentAnalysis({ analysis: {
  ...rawAgentAnalysis,
  quick_wins: ["Verify security headers on every page", "Check https://offerpsp.com/portal/ canonical for SEO", "Check robots.txt content"],
  limitations: ["Security warnings require additional verification", "Brotli results contradict live headers and require checking"],
  geo_recommendations: ["Check robots.txt and add GPTBot access"],
  priorities: [{
    priority: "P1",
    area: "Technical",
    title: "Review SiteOne security warnings",
    evidence: "The aggregate says security warnings exist, although live headers are present.",
    recommendation: "Verify CSP and other security headers on every page.",
    affected_urls: ["https://offerpsp.com/"],
  }],
} }, evidence);
assert.equal(unsupportedSecurityReview.priorities.length, 0);
assert.equal(unsupportedSecurityReview.quick_wins.length, 0);
assert.equal(unsupportedSecurityReview.geo_recommendations.length, 0);
assert.doesNotMatch(unsupportedSecurityReview.limitations.join(" "), /require additional|require checking/i);
assert.match(unsupportedSecurityReview.limitations.join(" "), /already contain/i);

const unsupportedLlmsReview = normalizeSeoAgentAnalysis({ analysis: {
  ...rawAgentAnalysis,
  executive_summary: "Technical health is strong, but llms.txt is missing and requires review.",
  priorities: [{
    priority: "P2",
    area: "GEO",
    title: "Expand llms.txt",
    evidence: "The content was not supplied.",
    recommendation: "Check llms.txt and include all key pages.",
    affected_urls: ["https://offerpsp.com/llms.txt"],
  }],
  quick_wins: ["Check and update llms.txt"],
  geo_recommendations: ["Ensure llms.txt links every key page"],
  limitations: ["No data about llms.txt content was provided."],
} }, evidence);
assert.equal(unsupportedLlmsReview.priorities.length, 0);
assert.equal(unsupportedLlmsReview.quick_wins.length, 0);
assert.equal(unsupportedLlmsReview.geo_recommendations.length, 0);
assert.doesNotMatch(unsupportedLlmsReview.limitations.join(" "), /No data about llms/i);
assert.match(unsupportedLlmsReview.limitations.join(" "), /links every crawled indexable page/i);
assert.doesNotMatch(unsupportedLlmsReview.executive_summary, /llms\.txt/i);

let agentRequest = null;
const agentResult = await runSeoGeoAgent(agentAudit, {
  evidence,
  env: {
    AIBOT_WEBHOOK_URL: "https://n8n.test/webhook/captains-bridge-aibot",
    AIBOT_WEBHOOK_SECRET: "test-secret",
  },
  fetchImpl: async (url, init) => {
    agentRequest = { url, init };
    return Response.json({ success: true, model: "deepseek-chat", analysis: rawAgentAnalysis });
  },
});
assert.equal(agentRequest.url, "https://n8n.test/webhook/offerpsp-seo-geo-agent");
assert.equal(agentRequest.init.headers["x-captain-secret"], "test-secret");
assert.equal(JSON.parse(agentRequest.init.body).evidence.pages.length, 3);
assert.equal(agentResult.agent, "OfferPSP SEO/GEO Agent");

console.log("SiteOne audit normalization tests passed");
