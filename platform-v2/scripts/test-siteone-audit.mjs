import assert from "node:assert/strict";
import { collectGeoSignals, normalizeSiteOneAudit } from "../api/_lib/siteone-audit.mjs";
import { runSiteOneAudit } from "../api/_lib/siteone-runner.mjs";

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

console.log("SiteOne audit normalization tests passed");
