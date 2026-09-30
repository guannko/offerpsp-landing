#!/usr/bin/env node

import assert from "node:assert/strict";
import {
  buildSeoAuditSourceMatrix,
  collectLiveSeoAuditSources,
  seoAgentExternalEvidence,
} from "../api/_lib/seo-audit-sources.mjs";

const checkedAt = "2026-08-30T20:00:00.000Z";
const liveSources = await collectLiveSeoAuditSources({
  googleLoader: async () => ({
    fetched_at: checkedAt,
    data_through: "2026-08-27",
    periods: { days_90: { clicks: 3, impressions: 400 } },
    inspection: { summary: { total: 22, indexed: 18 }, failed: 1 },
  }),
  vercelLoader: async () => ({
    fetched_at: checkedAt,
    period_start: "2026-08-01T00:00:00.000Z",
    period_end: checkedAt,
    visitors: 55,
    pageviews: 121,
  }),
});

const matrix = buildSeoAuditSourceMatrix({
  checkedAt,
  liveSources,
  audit: {
    audited_at: checkedAt,
    overall_score: 9.9,
    crawl_stats: { urls: 44, successful_urls: 44, broken_urls: 0 },
    agent_analysis: {
      status: "completed",
      generated_at: checkedAt,
      model: "deepseek-chat",
      priorities: [{ priority: "P1" }],
    },
  },
});

assert.equal(matrix.version, "offerpsp-seo-audit-sources-v1");
assert.deepEqual(matrix.summary, { executed: 4, completed: 4, failed: 0, independent: 2, local_only: 1 });
assert.equal(matrix.sources.find((source) => source.id === "google_search_console").metrics.indexed_urls, 18);
assert.equal(matrix.sources.find((source) => source.id === "vercel_web_analytics").metrics.pageviews, 121);
assert.equal(matrix.sources.find((source) => source.id === "ahrefs").status, "not_triggered");
assert.equal(matrix.sources.find((source) => source.id === "screaming_frog").mode, "local_only");
const agentEvidence = seoAgentExternalEvidence(liveSources);
assert.equal(agentEvidence.google_search_console.days_90.impressions, 400);
assert.equal(agentEvidence.vercel_web_analytics.visitors, 55);

const failedSources = await collectLiveSeoAuditSources({
  googleLoader: async () => { throw new Error("Google timeout"); },
  vercelLoader: async () => { throw new Error("Vercel HTTP 403"); },
});
const partialMatrix = buildSeoAuditSourceMatrix({
  checkedAt,
  liveSources: failedSources,
  audit: { audited_at: checkedAt, agent_analysis: { status: "failed", error_message: "Agent unavailable" } },
});
assert.equal(partialMatrix.summary.failed, 3);
assert.match(partialMatrix.sources.find((source) => source.id === "google_search_console").message, /Google timeout/);
assert.match(partialMatrix.sources.find((source) => source.id === "vercel_web_analytics").message, /Vercel HTTP 403/);
assert.equal(partialMatrix.sources.find((source) => source.id === "bing_webmaster_tools").status, "not_triggered");
assert.match(seoAgentExternalEvidence(failedSources).google_search_console.error_message, /Google timeout/);

process.stdout.write("PASS unified SEO audit source matrix and fail-open source isolation\n");
