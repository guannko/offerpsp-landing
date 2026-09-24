import { HttpError } from "./staff-auth.mjs";

const API_BASE = "https://api.vercel.com/v1/query/web-analytics/visits";
const DEFAULT_PROJECT_ID = "prj_KL2ekMw8TA3r879DfhFPhAyZt1kD";
const DEFAULT_TEAM_ID = "team_VtdeZeaXc6p9yPmxR8NoBM8b";
const PRODUCTION_FILTER = "environment eq 'production'";

function requiredToken(env) {
  const token = String(env.VERCEL_ANALYTICS_TOKEN || env.VERCEL_TOKEN || "").trim();
  if (!token) throw new HttpError(503, "Live Vercel Web Analytics is not configured");
  return token;
}

export function getVercelWebAnalyticsConfig(env = process.env) {
  return {
    token: requiredToken(env),
    projectId: String(env.OFFERPSP_VERCEL_PROJECT_ID || DEFAULT_PROJECT_ID).trim(),
    teamId: String(env.OFFERPSP_VERCEL_TEAM_ID || DEFAULT_TEAM_ID).trim(),
  };
}

export function analyticsPeriod(now = new Date()) {
  const today = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate()));
  const since = new Date(today);
  since.setUTCDate(since.getUTCDate() - 29);
  const until = new Date(today);
  until.setUTCDate(until.getUTCDate() + 1);
  return {
    since: since.toISOString().slice(0, 10),
    until: until.toISOString().slice(0, 10),
    periodStart: since.toISOString(),
    periodEnd: now.toISOString(),
  };
}

async function queryVercel(path, params, config, fetchImpl) {
  const url = new URL(`${API_BASE}/${path}`);
  url.searchParams.set("teamId", config.teamId);
  url.searchParams.set("projectId", config.projectId);
  for (const [key, value] of Object.entries(params)) url.searchParams.set(key, String(value));

  let response;
  try {
    response = await fetchImpl(url, {
      method: "GET",
      headers: { authorization: `Bearer ${config.token}` },
      signal: AbortSignal.timeout(12_000),
    });
  } catch (error) {
    throw new HttpError(502, `Vercel Web Analytics is unavailable: ${error?.message || "request failed"}`);
  }

  if (!response.ok) {
    throw new HttpError(502, `Vercel Web Analytics returned HTTP ${response.status}`);
  }

  const payload = await response.json().catch(() => null);
  if (!payload || payload.version !== 1 || payload.data === undefined) {
    throw new HttpError(502, "Vercel Web Analytics returned an invalid response");
  }
  return payload.data;
}

function normalizeRows(rows, dimension) {
  if (!Array.isArray(rows)) return [];
  return rows.map((row) => ({
    key: String(row?.[dimension] || "unknown"),
    visitors: Number(row?.visitors || 0),
    pageviews: Number(row?.pageviews || 0),
  }));
}

export async function getLiveVercelTraffic({
  env = process.env,
  fetchImpl = fetch,
  now = new Date(),
} = {}) {
  const config = getVercelWebAnalyticsConfig(env);
  const period = analyticsPeriod(now);
  const common = {
    since: period.since,
    until: period.until,
    filter: PRODUCTION_FILTER,
  };

  const [count, countries, referrers, paths] = await Promise.all([
    queryVercel("count", common, config, fetchImpl),
    queryVercel("aggregate", { ...common, by: "country", limit: 100 }, config, fetchImpl),
    queryVercel("aggregate", { ...common, by: "referrerHostname", limit: 100 }, config, fetchImpl),
    queryVercel("aggregate", { ...common, by: "requestPath", limit: 100 }, config, fetchImpl),
  ]);

  return {
    source: "vercel_web_analytics_live",
    period_start: period.periodStart,
    period_end: period.periodEnd,
    fetched_at: now.toISOString(),
    visitors: Number(count?.visitors || 0),
    pageviews: Number(count?.pageviews || 0),
    countries: normalizeRows(countries, "country"),
    referrers: normalizeRows(referrers, "referrerHostname"),
    paths: normalizeRows(paths, "requestPath"),
  };
}
