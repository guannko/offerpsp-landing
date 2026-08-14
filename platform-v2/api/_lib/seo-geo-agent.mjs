const AGENT_NAME = "OfferPSP SEO/GEO Agent";
const AGENT_VERSION = "offerpsp-seo-geo-agent-v1";
const DEFAULT_WEBHOOK_PATH = "offerpsp-seo-geo-agent";
const MAX_PAGES = 12;
const MAX_TEXT_SAMPLE = 3_500;

const clampText = (value, maximum = 1_000) => String(value || "").replace(/\s+/g, " ").trim().slice(0, maximum);

function decodeHtml(value) {
  return String(value || "")
    .replace(/&nbsp;/gi, " ")
    .replace(/&amp;/gi, "&")
    .replace(/&quot;/gi, '"')
    .replace(/&#39;|&apos;/gi, "'")
    .replace(/&lt;/gi, "<")
    .replace(/&gt;/gi, ">");
}

function tagValues(html, tag, maximum = 10) {
  const pattern = new RegExp(`<${tag}\\b[^>]*>([\\s\\S]*?)<\\/${tag}>`, "gi");
  return [...String(html || "").matchAll(pattern)]
    .slice(0, maximum)
    .map((match) => clampText(decodeHtml(match[1].replace(/<[^>]+>/g, " ")), 300))
    .filter(Boolean);
}

function metaContent(html, name) {
  const tags = String(html || "").match(/<meta\b[^>]*>/gi) || [];
  for (const tag of tags) {
    const key = tag.match(/(?:name|property)=["']([^"']+)["']/i)?.[1];
    if (String(key || "").toLowerCase() !== name.toLowerCase()) continue;
    return clampText(decodeHtml(tag.match(/content=["']([^"']*)["']/i)?.[1]), 500);
  }
  return "";
}

function linkHref(html, rel) {
  const tags = String(html || "").match(/<link\b[^>]*>/gi) || [];
  for (const tag of tags) {
    const relation = tag.match(/rel=["']([^"']+)["']/i)?.[1];
    if (!String(relation || "").toLowerCase().split(/\s+/).includes(rel.toLowerCase())) continue;
    return clampText(decodeHtml(tag.match(/href=["']([^"']*)["']/i)?.[1]), 1_000);
  }
  return "";
}

function visibleText(html) {
  return clampText(decodeHtml(String(html || "")
    .replace(/<script\b[^>]*>[\s\S]*?<\/script>/gi, " ")
    .replace(/<style\b[^>]*>[\s\S]*?<\/style>/gi, " ")
    .replace(/<svg\b[^>]*>[\s\S]*?<\/svg>/gi, " ")
    .replace(/<!--([\s\S]*?)-->/g, " ")
    .replace(/<[^>]+>/g, " ")), MAX_TEXT_SAMPLE);
}

function sitemapUrls(xml, targetOrigin) {
  const urls = [...String(xml || "").matchAll(/<loc>\s*([^<]+?)\s*<\/loc>/gi)]
    .map((match) => decodeHtml(match[1]).trim())
    .filter((value) => {
      try {
        return new URL(value).origin === targetOrigin;
      } catch {
        return false;
      }
    });
  return [...new Set(urls)].slice(0, MAX_PAGES);
}

async function fetchText(url, fetchImpl) {
  const response = await fetchImpl(url, {
    headers: { "user-agent": "OfferPSP-SEO-GEO-Agent/1.0" },
    signal: AbortSignal.timeout(15_000),
  });
  const text = await response.text();
  return { ok: response.ok, status: response.status, text };
}

function pageBrief(url, result) {
  const html = result.text || "";
  const text = visibleText(html);
  return {
    url,
    status: result.status,
    title: tagValues(html, "title", 1)[0] || "",
    meta_description: metaContent(html, "description"),
    meta_robots: metaContent(html, "robots"),
    canonical: linkHref(html, "canonical"),
    h1: tagValues(html, "h1", 5),
    h2: tagValues(html, "h2", 10),
    lang: clampText(html.match(/<html\b[^>]*\blang=["']([^"']+)["']/i)?.[1], 20),
    json_ld_blocks: (html.match(/application\/ld\+json/gi) || []).length,
    word_count: text ? text.split(/\s+/).length : 0,
    text_sample: text,
  };
}

export async function collectSeoAgentEvidence(audit, fetchImpl = fetch) {
  const targetUrl = new URL(audit?.target_url || "https://offerpsp.com/");
  const sitemap = await fetchText(new URL("/sitemap.xml", targetUrl).toString(), fetchImpl);
  const urls = sitemapUrls(sitemap.text, targetUrl.origin);
  if (!urls.includes(targetUrl.toString())) urls.unshift(targetUrl.toString());

  const pages = await Promise.all(urls.slice(0, MAX_PAGES).map(async (url) => {
    try {
      return pageBrief(url, await fetchText(url, fetchImpl));
    } catch (error) {
      return { url, status: 0, error: clampText(error?.message || error, 300) };
    }
  }));

  return {
    target_url: targetUrl.toString(),
    collected_at: new Date().toISOString(),
    siteone: {
      tool: audit?.tool,
      tool_version: audit?.tool_version,
      audited_at: audit?.audited_at,
      overall_score: audit?.overall_score,
      category_scores: audit?.category_scores || {},
      crawl_stats: audit?.crawl_stats || {},
      issues: audit?.issues || [],
    },
    geo_signals: audit?.metadata?.geo_signals || {},
    pages,
  };
}

function normalizePriority(item) {
  const priority = ["P0", "P1", "P2"].includes(item?.priority) ? item.priority : "P2";
  const area = ["SEO", "GEO", "Content", "Technical"].includes(item?.area) ? item.area : "SEO";
  return {
    priority,
    area,
    title: clampText(item?.title, 180),
    evidence: clampText(item?.evidence, 600),
    recommendation: clampText(item?.recommendation, 800),
    affected_urls: Array.isArray(item?.affected_urls)
      ? item.affected_urls.slice(0, 12).map((url) => clampText(url, 1_000)).filter(Boolean)
      : [],
  };
}

function normalizeContentRecommendation(item) {
  return {
    url: clampText(item?.url, 1_000),
    suggested_title: clampText(item?.suggested_title, 180),
    suggested_meta_description: clampText(item?.suggested_meta_description, 260),
    rationale: clampText(item?.rationale, 500),
  };
}

export function normalizeSeoAgentAnalysis(value) {
  const source = value?.analysis && typeof value.analysis === "object" ? value.analysis : value;
  if (!source || typeof source !== "object") throw new Error("SEO/GEO agent returned no analysis");
  const executiveSummary = clampText(source.executive_summary, 1_200);
  if (!executiveSummary) throw new Error("SEO/GEO agent returned an empty summary");

  return {
    status: "completed",
    agent: AGENT_NAME,
    agent_version: AGENT_VERSION,
    model: clampText(value?.model || source.model || "deepseek-chat", 120),
    generated_at: new Date().toISOString(),
    executive_summary: executiveSummary,
    confidence: ["high", "medium", "low"].includes(source.confidence) ? source.confidence : "medium",
    priorities: Array.isArray(source.priorities) ? source.priorities.slice(0, 10).map(normalizePriority).filter((item) => item.title) : [],
    quick_wins: Array.isArray(source.quick_wins) ? source.quick_wins.slice(0, 8).map((item) => clampText(item, 500)).filter(Boolean) : [],
    content_recommendations: Array.isArray(source.content_recommendations)
      ? source.content_recommendations.slice(0, 8).map(normalizeContentRecommendation).filter((item) => item.url)
      : [],
    geo_recommendations: Array.isArray(source.geo_recommendations)
      ? source.geo_recommendations.slice(0, 8).map((item) => clampText(item, 600)).filter(Boolean)
      : [],
    limitations: Array.isArray(source.limitations) ? source.limitations.slice(0, 6).map((item) => clampText(item, 500)).filter(Boolean) : [],
  };
}

export function resolveSeoAgentWebhookUrl(env = process.env) {
  if (env.OFFERPSP_SEO_AGENT_WEBHOOK_URL) return String(env.OFFERPSP_SEO_AGENT_WEBHOOK_URL).trim();
  if (!env.AIBOT_WEBHOOK_URL) throw new Error("SEO/GEO agent webhook is not configured");
  const url = new URL(String(env.AIBOT_WEBHOOK_URL).trim());
  url.pathname = `${url.pathname.replace(/[^/]+\/?$/, "")}${DEFAULT_WEBHOOK_PATH}`;
  return url.toString();
}

export async function runSeoGeoAgent(audit, {
  fetchImpl = fetch,
  env = process.env,
  evidence,
} = {}) {
  const webhookSecret = String(env.AIBOT_WEBHOOK_SECRET || "").trim();
  if (!webhookSecret) throw new Error("SEO/GEO agent authorization is not configured");
  const payload = evidence || await collectSeoAgentEvidence(audit, fetchImpl);
  const response = await fetchImpl(resolveSeoAgentWebhookUrl(env), {
    method: "POST",
    headers: { "content-type": "application/json", "x-captain-secret": webhookSecret },
    body: JSON.stringify({ agent_version: AGENT_VERSION, evidence: payload }),
    signal: AbortSignal.timeout(70_000),
  });
  const result = await response.json().catch(() => null);
  if (!response.ok || result?.success === false) {
    throw new Error(clampText(result?.error || `SEO/GEO agent failed with HTTP ${response.status}`, 500));
  }
  return normalizeSeoAgentAnalysis(result);
}

export const seoAgentConstants = { AGENT_NAME, AGENT_VERSION, DEFAULT_WEBHOOK_PATH };
