#!/usr/bin/env node

import assert from "node:assert/strict";
import { generateKeyPairSync } from "node:crypto";
import {
  getGoogleSearchConsoleOverview,
  resetGoogleSearchConsoleCache,
  summarizeInspection,
} from "../api/_lib/google-search-console.mjs";

const { privateKey } = generateKeyPairSync("rsa", { modulusLength: 2048 });
const credentials = JSON.stringify({
  client_email: "reader@example.iam.gserviceaccount.com",
  private_key: privateKey.export({ type: "pkcs8", format: "pem" }),
});
const now = new Date("2026-08-26T12:00:00.000Z");
const calls = [];
let transientAnalyticsFailures = 0;
let inspectionFailuresRemaining = 1;

const analyticsRow = (keys, clicks, impressions, position) => ({
  keys,
  clicks,
  impressions,
  ctr: impressions ? clicks / impressions : 0,
  position,
});

const fetchImpl = async (input, init = {}) => {
  const url = String(input);
  calls.push({ url, init });
  if (url === "https://oauth2.googleapis.com/token") {
    const assertion = String(init.body.get("assertion"));
    assert.equal(assertion.split(".").length, 3);
    return Response.json({ access_token: "google-token", expires_in: 3600 });
  }
  if (url === "https://offerpsp.com/sitemap.xml") {
    return new Response("<urlset><url><loc>https://offerpsp.com/</loc></url><url><loc>https://offerpsp.com/payment-provider-europe.html</loc></url></urlset>");
  }
  if (url.includes("urlInspection/index:inspect")) {
    const body = JSON.parse(init.body);
    if (body.inspectionUrl.includes("payment-provider-europe") && inspectionFailuresRemaining > 0) {
      inspectionFailuresRemaining -= 1;
      const error = new Error("The operation was aborted due to timeout");
      error.name = "TimeoutError";
      throw error;
    }
    const pass = body.inspectionUrl.endsWith("/");
    return Response.json({ inspectionResult: { indexStatusResult: {
      verdict: pass ? "PASS" : "NEUTRAL",
      coverageState: pass ? "Submitted and indexed" : "Crawled - currently not indexed",
      indexingState: "INDEXING_ALLOWED",
      pageFetchState: "SUCCESSFUL",
      robotsTxtState: "ALLOWED",
    } } });
  }
  if (url.endsWith("/sitemaps")) {
    return Response.json({ sitemap: [{ path: "https://offerpsp.com/sitemap.xml", errors: "0", warnings: "0", contents: [{ type: "web", submitted: "14", indexed: "10" }] }] });
  }
  if (url.includes("searchAnalytics/query")) {
    const body = JSON.parse(init.body);
    const dimension = body.dimensions[0];
    if (dimension === "query" && transientAnalyticsFailures++ === 0) {
      const error = new Error("The operation was aborted due to timeout");
      error.name = "TimeoutError";
      throw error;
    }
    if (dimension === "date") {
      return Response.json({ rows: [
        analyticsRow(["2026-08-22"], 1, 100, 40),
        analyticsRow(["2026-08-23"], 1, 130, 62.6461538462),
      ] });
    }
    const key = { query: "high risk psp", page: "https://offerpsp.com/", country: "vnm", device: "MOBILE" }[dimension];
    return Response.json({ rows: [analyticsRow(["lower demand"], 2, 20, 10), analyticsRow([key], 0, 230, 52.8)] });
  }
  return new Response("not found", { status: 404 });
};

resetGoogleSearchConsoleCache();
const overview = await getGoogleSearchConsoleOverview({
  env: { GOOGLE_SEARCH_CONSOLE_SERVICE_ACCOUNT_JSON: credentials },
  fetchImpl,
  now,
  force: true,
});

assert.equal(overview.source, "google_search_console");
assert.equal(overview.data_through, "2026-08-23");
assert.equal(overview.periods.days_90.clicks, 2);
assert.equal(overview.periods.days_90.impressions, 230);
assert.equal(Math.round(overview.periods.days_90.position * 10) / 10, 52.8);
assert.equal(overview.queries[0].key, "high risk psp");
assert.deepEqual(overview.inspection.summary, { total: 2, indexed: 1, not_indexed: 0, neutral: 1 });
assert.equal(overview.inspection.requested, 2);
assert.equal(overview.inspection.failed, 0);
assert.deepEqual(overview.warnings, []);
assert.equal(overview.sitemaps[0].contents[0].submitted, 14);
assert(calls.every((call) => !call.url.includes("aibot-492912")));
assert(calls.filter((call) => call.url.includes("searchAnalytics/query")).every((call) => call.init.headers.authorization === "Bearer google-token"));

resetGoogleSearchConsoleCache();
transientAnalyticsFailures = 1;
inspectionFailuresRemaining = 2;
const partialOverview = await getGoogleSearchConsoleOverview({
  env: { GOOGLE_SEARCH_CONSOLE_SERVICE_ACCOUNT_JSON: credentials },
  fetchImpl,
  now,
  force: true,
});
assert.deepEqual(partialOverview.inspection.summary, { total: 1, indexed: 1, not_indexed: 0, neutral: 0 });
assert.equal(partialOverview.inspection.requested, 2);
assert.equal(partialOverview.inspection.failed, 1);
assert.equal(partialOverview.warnings[0].code, "url_inspection_partial");

assert.deepEqual(summarizeInspection([
  { verdict: "PASS" },
  { verdict: "FAIL" },
  { verdict: "NEUTRAL" },
]), { total: 3, indexed: 1, not_indexed: 1, neutral: 1 });

await assert.rejects(
  () => getGoogleSearchConsoleOverview({ env: {}, fetchImpl, now, force: true }),
  (error) => error.status === 503 && /not configured/.test(error.message),
);

process.stdout.write("PASS Google Search Console auth, metrics and index inspection normalization\n");
