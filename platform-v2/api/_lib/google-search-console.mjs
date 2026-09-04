import { createSign } from "node:crypto";
import { HttpError } from "./staff-auth.mjs";

const TOKEN_URL = "https://oauth2.googleapis.com/token";
const SEARCH_CONSOLE_API = "https://www.googleapis.com/webmasters/v3";
const URL_INSPECTION_API = "https://searchconsole.googleapis.com/v1/urlInspection/index:inspect";
const READ_ONLY_SCOPE = "https://www.googleapis.com/auth/webmasters.readonly";
const DEFAULT_SITE_URL = "sc-domain:offerpsp.com";
const DEFAULT_SITEMAP_URL = "https://offerpsp.com/sitemap.xml";
const OVERVIEW_CACHE_MS = 15 * 60 * 1000;
const GOOGLE_REQUEST_TIMEOUT_MS = 20_000;
const GOOGLE_REQUEST_ATTEMPTS = 2;

let cachedToken = null;
let cachedOverview = null;

const base64url = (value) => Buffer.from(value).toString("base64url");
const isoDate = (value) => value.toISOString().slice(0, 10);
const delay = (milliseconds) => new Promise((resolve) => setTimeout(resolve, milliseconds));

function requestFailureMessage(error) {
  if (error?.name === "AbortError" || error?.name === "TimeoutError") {
    return `request timed out after ${GOOGLE_REQUEST_TIMEOUT_MS / 1000} seconds`;
  }
  return error?.message || "request failed";
}

async function fetchWithRetry(url, options, fetchImpl, attempts = GOOGLE_REQUEST_ATTEMPTS) {
  let lastError;
  for (let attempt = 1; attempt <= attempts; attempt += 1) {
    try {
      const response = await fetchImpl(url, {
        ...options,
        signal: AbortSignal.timeout(GOOGLE_REQUEST_TIMEOUT_MS),
      });
      if (response.status !== 429 && response.status < 500) return response;
      lastError = new Error(`HTTP ${response.status}`);
    } catch (error) {
      lastError = error;
    }
    if (attempt < attempts) await delay(250 * attempt);
  }
  throw lastError;
}

function dateOffset(date, days) {
  const copy = new Date(date);
  copy.setUTCDate(copy.getUTCDate() + days);
  return copy;
}

function parseCredentials(env) {
  const raw = String(env.GOOGLE_SEARCH_CONSOLE_SERVICE_ACCOUNT_JSON || "").trim();
  if (!raw) throw new HttpError(503, "Google Search Console is not configured");
  let credentials;
  try {
    credentials = JSON.parse(raw);
  } catch {
    throw new HttpError(503, "Google Search Console credentials are invalid");
  }
  if (!credentials?.client_email || !credentials?.private_key) {
    throw new HttpError(503, "Google Search Console credentials are incomplete");
  }
  return credentials;
}

function createAssertion(credentials, now) {
  const issuedAt = Math.floor(now.getTime() / 1000);
  const header = base64url(JSON.stringify({ alg: "RS256", typ: "JWT" }));
  const claims = base64url(JSON.stringify({
    iss: credentials.client_email,
    scope: READ_ONLY_SCOPE,
    aud: TOKEN_URL,
    iat: issuedAt,
    exp: issuedAt + 3600,
  }));
  const unsigned = `${header}.${claims}`;
  const signature = createSign("RSA-SHA256").update(unsigned).end().sign(credentials.private_key, "base64url");
  return `${unsigned}.${signature}`;
}

async function accessToken(credentials, fetchImpl, now) {
  if (cachedToken?.email === credentials.client_email && cachedToken.expiresAt > now.getTime() + 60_000) {
    return cachedToken.value;
  }
  let response;
  try {
    response = await fetchWithRetry(TOKEN_URL, {
      method: "POST",
      headers: { "content-type": "application/x-www-form-urlencoded" },
      body: new URLSearchParams({
        grant_type: "urn:ietf:params:oauth:grant-type:jwt-bearer",
        assertion: createAssertion(credentials, now),
      }),
    }, fetchImpl);
  } catch (error) {
    throw new HttpError(502, `Google authorization is unavailable: ${requestFailureMessage(error)}`);
  }
  const payload = await response.json().catch(() => null);
  if (!response.ok || !payload?.access_token) {
    throw new HttpError(502, `Google authorization returned HTTP ${response.status}`);
  }
  cachedToken = {
    email: credentials.client_email,
    value: payload.access_token,
    expiresAt: now.getTime() + Number(payload.expires_in || 3600) * 1000,
  };
  return cachedToken.value;
}

async function googleJson(url, options, token, fetchImpl) {
  let response;
  try {
    response = await fetchWithRetry(url, {
      ...options,
      headers: {
        ...(options?.headers || {}),
        authorization: `Bearer ${token}`,
      },
    }, fetchImpl);
  } catch (error) {
    throw new HttpError(502, `Google Search Console is unavailable: ${requestFailureMessage(error)}`);
  }
  const payload = await response.json().catch(() => null);
  if (!response.ok) throw new HttpError(502, `Google Search Console returned HTTP ${response.status}`);
  if (!payload || typeof payload !== "object") throw new HttpError(502, "Google Search Console returned an invalid response");
  return payload;
}

async function searchAnalytics(siteUrl, body, token, fetchImpl) {
  const endpoint = `${SEARCH_CONSOLE_API}/sites/${encodeURIComponent(siteUrl)}/searchAnalytics/query`;
  return googleJson(endpoint, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ searchType: "web", dataState: "final", rowLimit: 100, ...body }),
  }, token, fetchImpl);
}

function normalizeMetricRow(row) {
  return {
    clicks: Number(row?.clicks || 0),
    impressions: Number(row?.impressions || 0),
    ctr: Number(row?.ctr || 0),
    position: Number(row?.position || 0),
  };
}

function aggregateDays(rows, startDate, endDate) {
  const selected = rows.filter((row) => row.date >= startDate && row.date <= endDate);
  const clicks = selected.reduce((sum, row) => sum + row.clicks, 0);
  const impressions = selected.reduce((sum, row) => sum + row.impressions, 0);
  const weightedPosition = selected.reduce((sum, row) => sum + row.position * row.impressions, 0);
  return {
    start_date: startDate,
    end_date: endDate,
    clicks,
    impressions,
    ctr: impressions ? clicks / impressions : 0,
    position: impressions ? weightedPosition / impressions : 0,
  };
}

function dimensionRows(payload, dimension) {
  return (payload?.rows || []).map((row) => ({
    key: String(row?.keys?.[0] || "unknown"),
    dimension,
    ...normalizeMetricRow(row),
  })).sort((left, right) => right.impressions - left.impressions || right.clicks - left.clicks);
}

async function sitemapSummary(siteUrl, token, fetchImpl) {
  const endpoint = `${SEARCH_CONSOLE_API}/sites/${encodeURIComponent(siteUrl)}/sitemaps`;
  const payload = await googleJson(endpoint, { method: "GET" }, token, fetchImpl);
  return (payload.sitemap || []).map((item) => ({
    path: item.path,
    last_submitted: item.lastSubmitted || null,
    last_downloaded: item.lastDownloaded || null,
    errors: Number(item.errors || 0),
    warnings: Number(item.warnings || 0),
    pending: Boolean(item.isPending),
    contents: (item.contents || []).map((content) => ({
      type: content.type || null,
      submitted: Number(content.submitted || 0),
      indexed: Number(content.indexed || 0),
    })),
  }));
}

async function sitemapUrls(sitemapUrl, fetchImpl) {
  let response;
  try {
    response = await fetchWithRetry(sitemapUrl, { method: "GET" }, fetchImpl);
  } catch (error) {
    throw new HttpError(502, `OfferPSP sitemap is unavailable: ${requestFailureMessage(error)}`);
  }
  if (!response.ok) throw new HttpError(502, `OfferPSP sitemap returned HTTP ${response.status}`);
  const xml = await response.text();
  return [...xml.matchAll(/<loc>\s*([^<]+?)\s*<\/loc>/gi)].map((match) => match[1]).slice(0, 50);
}

async function inspectUrl(url, siteUrl, token, fetchImpl) {
  const payload = await googleJson(URL_INSPECTION_API, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ inspectionUrl: url, siteUrl, languageCode: "ru-RU" }),
  }, token, fetchImpl);
  const status = payload?.inspectionResult?.indexStatusResult || {};
  return {
    url,
    verdict: status.verdict || "VERDICT_UNSPECIFIED",
    coverage_state: status.coverageState || null,
    indexing_state: status.indexingState || null,
    page_fetch_state: status.pageFetchState || null,
    robots_txt_state: status.robotsTxtState || null,
    last_crawl_time: status.lastCrawlTime || null,
    user_canonical: status.userCanonical || null,
    google_canonical: status.googleCanonical || null,
  };
}

export function summarizeInspection(rows) {
  return rows.reduce((summary, row) => {
    summary.total += 1;
    if (row.verdict === "PASS") summary.indexed += 1;
    else if (row.verdict === "NEUTRAL") summary.neutral += 1;
    else summary.not_indexed += 1;
    return summary;
  }, { total: 0, indexed: 0, not_indexed: 0, neutral: 0 });
}

export async function getGoogleSearchConsoleOverview({
  env = process.env,
  fetchImpl = fetch,
  now = new Date(),
  force = false,
} = {}) {
  const credentials = parseCredentials(env);
  const siteUrl = String(env.OFFERPSP_SEARCH_CONSOLE_SITE_URL || DEFAULT_SITE_URL).trim();
  const sitemapUrl = String(env.OFFERPSP_SITEMAP_URL || DEFAULT_SITEMAP_URL).trim();
  const cacheKey = `${credentials.client_email}:${siteUrl}`;
  if (!force && cachedOverview?.key === cacheKey && cachedOverview.expiresAt > now.getTime()) {
    return cachedOverview.value;
  }

  const token = await accessToken(credentials, fetchImpl, now);
  const provisionalEnd = isoDate(dateOffset(now, -1));
  const provisionalStart = isoDate(dateOffset(now, -120));
  const dailyPayload = await searchAnalytics(siteUrl, {
    startDate: provisionalStart,
    endDate: provisionalEnd,
    dimensions: ["date"],
    rowLimit: 250,
  }, token, fetchImpl);
  const daily = (dailyPayload.rows || []).map((row) => ({ date: String(row.keys?.[0] || ""), ...normalizeMetricRow(row) }));
  const dataThrough = daily.at(-1)?.date || provisionalEnd;
  const periodStart = isoDate(dateOffset(new Date(`${dataThrough}T00:00:00Z`), -89));

  const [queries, pages, countries, devices] = await Promise.all([
    searchAnalytics(siteUrl, { startDate: periodStart, endDate: dataThrough, dimensions: ["query"], rowLimit: 1000 }, token, fetchImpl),
    searchAnalytics(siteUrl, { startDate: periodStart, endDate: dataThrough, dimensions: ["page"], rowLimit: 1000 }, token, fetchImpl),
    searchAnalytics(siteUrl, { startDate: periodStart, endDate: dataThrough, dimensions: ["country"], rowLimit: 1000 }, token, fetchImpl),
    searchAnalytics(siteUrl, { startDate: periodStart, endDate: dataThrough, dimensions: ["device"], rowLimit: 1000 }, token, fetchImpl),
  ]);

  const warnings = [];
  const [sitemapsResult, urlsResult] = await Promise.allSettled([
    sitemapSummary(siteUrl, token, fetchImpl),
    sitemapUrls(sitemapUrl, fetchImpl),
  ]);
  const sitemaps = sitemapsResult.status === "fulfilled" ? sitemapsResult.value : [];
  const urls = urlsResult.status === "fulfilled" ? urlsResult.value : [];
  if (sitemapsResult.status === "rejected") {
    warnings.push({ code: "sitemaps_unavailable", message: sitemapsResult.reason?.message || "Google sitemap status is unavailable" });
  }
  if (urlsResult.status === "rejected") {
    warnings.push({ code: "sitemap_urls_unavailable", message: urlsResult.reason?.message || "OfferPSP sitemap URLs are unavailable" });
  }

  const inspectionResults = await Promise.allSettled(urls.map((url) => inspectUrl(url, siteUrl, token, fetchImpl)));
  const inspection = inspectionResults
    .filter((result) => result.status === "fulfilled")
    .map((result) => result.value);
  const failedInspections = inspectionResults.length - inspection.length;
  if (failedInspections) {
    warnings.push({
      code: "url_inspection_partial",
      message: `${failedInspections} of ${urls.length} URL inspections were unavailable during this request`,
    });
  }
  const end = new Date(`${dataThrough}T00:00:00Z`);
  const value = {
    source: "google_search_console",
    site_url: siteUrl,
    fetched_at: now.toISOString(),
    data_through: dataThrough,
    periods: {
      days_7: aggregateDays(daily, isoDate(dateOffset(end, -6)), dataThrough),
      days_28: aggregateDays(daily, isoDate(dateOffset(end, -27)), dataThrough),
      days_90: aggregateDays(daily, periodStart, dataThrough),
    },
    daily: daily.filter((row) => row.date >= periodStart),
    queries: dimensionRows(queries, "query"),
    pages: dimensionRows(pages, "page"),
    countries: dimensionRows(countries, "country"),
    devices: dimensionRows(devices, "device"),
    sitemaps,
    inspection: {
      summary: summarizeInspection(inspection),
      urls: inspection,
      requested: urls.length,
      failed: failedInspections,
    },
    warnings,
  };
  cachedOverview = { key: cacheKey, expiresAt: now.getTime() + OVERVIEW_CACHE_MS, value };
  return value;
}

export function resetGoogleSearchConsoleCache() {
  cachedToken = null;
  cachedOverview = null;
}
