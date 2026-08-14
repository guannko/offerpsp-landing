import assert from "node:assert/strict";
import { collectGeoSignals, normalizeSiteOneAudit } from "../api/_lib/siteone-audit.mjs";
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
  metadata: { geo_signals: geo },
};
const sitemapXml = `<?xml version="1.0"?><urlset>
  <url><loc>https://offerpsp.com/</loc></url>
  <url><loc>https://offerpsp.com/privacy.html</loc></url>
  <url><loc>https://outside.test/ignored</loc></url>
</urlset>`;
const pageHtml = (title, h1) => `<!doctype html><html lang="en"><head>
  <title>${title}</title><meta name="description" content="Confidential payment matching">
  <link rel="canonical" href="https://offerpsp.com/"><script type="application/ld+json">{"@graph":[{"@type":"Organization"},{"@type":"Service"}]}</script>
  </head><body><h1>${h1}</h1><h2>How it works</h2><p>Qualified payment introductions for merchants and PSPs.</p></body></html>`;
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
  if (url === "https://offerpsp.com/") return new Response(pageHtml("OfferPSP", "The right PSP"), { status: 200, headers: securityHeaders });
  if (url === "https://offerpsp.com/privacy.html") return new Response(pageHtml("Privacy", "Privacy policy"), { status: 200, headers: securityHeaders });
  return new Response("not found", { status: 404 });
});
assert.equal(evidence.pages.length, 2);
assert.equal(evidence.pages[0].title, "OfferPSP");
assert.deepEqual(evidence.pages[0].h1, ["The right PSP"]);
assert.equal(evidence.pages[0].json_ld_blocks, 1);
assert.deepEqual(evidence.pages[0].json_ld_types, ["Organization", "Service"]);
assert.equal(evidence.pages[0].image_inventory.content_raster_images, 0);
assert.equal(evidence.pages[0].response_headers["content-security-policy"], "default-src 'self'");

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
assert.match(unsupportedSecurity.limitations[0], /already contain/i);

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
assert.equal(JSON.parse(agentRequest.init.body).evidence.pages.length, 2);
assert.equal(agentResult.agent, "OfferPSP SEO/GEO Agent");

console.log("SiteOne audit normalization tests passed");
