#!/usr/bin/env node

import assert from "node:assert/strict";
import { analyticsPeriod, getLiveVercelTraffic } from "../api/_lib/vercel-web-analytics.mjs";

const now = new Date("2026-08-26T12:34:56.000Z");
assert.deepEqual(analyticsPeriod(now), {
  since: "2026-07-28",
  until: "2026-08-27",
  periodStart: "2026-07-28T00:00:00.000Z",
  periodEnd: "2026-08-26T12:34:56.000Z",
});

const requests = [];
const fetchImpl = async (input, init) => {
  const url = new URL(input);
  requests.push({ url, init });
  if (url.pathname.endsWith("/count")) {
    return Response.json({ version: 1, data: { visitors: 39, pageviews: 65 } });
  }
  const dimension = url.searchParams.get("by");
  const key = { country: "CY", referrerHostname: "direct", requestPath: "/" }[dimension];
  return Response.json({ version: 1, data: [{ [dimension]: key, visitors: 15, pageviews: 39 }] });
};

const traffic = await getLiveVercelTraffic({
  env: {
    VERCEL_ANALYTICS_TOKEN: "test-token",
    OFFERPSP_VERCEL_PROJECT_ID: "public-project",
    OFFERPSP_VERCEL_TEAM_ID: "team",
  },
  fetchImpl,
  now,
});

assert.equal(traffic.source, "vercel_web_analytics_live");
assert.equal(traffic.visitors, 39);
assert.equal(traffic.pageviews, 65);
assert.deepEqual(traffic.countries, [{ key: "CY", visitors: 15, pageviews: 39 }]);
assert.deepEqual(traffic.referrers, [{ key: "direct", visitors: 15, pageviews: 39 }]);
assert.deepEqual(traffic.paths, [{ key: "/", visitors: 15, pageviews: 39 }]);
assert.equal(requests.length, 4);
for (const request of requests) {
  assert.equal(request.url.searchParams.get("since"), "2026-07-28");
  assert.equal(request.url.searchParams.get("until"), "2026-08-27");
  assert.equal(request.url.searchParams.get("filter"), "environment eq 'production'");
  assert.equal(request.init.headers.authorization, "Bearer test-token");
}

await assert.rejects(
  () => getLiveVercelTraffic({ env: {}, fetchImpl, now }),
  (error) => error.status === 503 && /not configured/.test(error.message),
);

await assert.rejects(
  () => getLiveVercelTraffic({
    env: { VERCEL_ANALYTICS_TOKEN: "test-token" },
    fetchImpl: async () => new Response("denied", { status: 403 }),
    now,
  }),
  (error) => error.status === 502 && /HTTP 403/.test(error.message),
);

process.stdout.write("PASS live Vercel Web Analytics normalization and fail-closed behaviour\n");
