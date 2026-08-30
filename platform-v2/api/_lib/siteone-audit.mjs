const ISSUE_ACTIONS = {
  "pages-with-multiple-h1": "Оставить один H1 на страницу; скрытые состояния оформить через H2/H3.",
  security: "Проверить точный SiteOne-check и живые заголовки на каждом затронутом URL; общий агрегат не доказывает отсутствие security headers.",
  "brotli-support": "Проверить Brotli-сжатие текстовых ответов на production CDN.",
  "webp-support": "Для новых растровых изображений отдавать WebP или AVIF.",
  "avif-support": "Для новых растровых изображений добавить AVIF/WebP fallback.",
  "pages-without-form-labels": "Добавить label или aria-label каждому полю формы.",
  "seo-meta-description-length": "Держать meta description в рекомендуемом диапазоне 50–160 символов.",
  "static-assets-short-cache": "Увеличить cache lifetime для версионированных статических файлов.",
  "dns-ipv6": "IPv6 не обязателен для SEO; включать только вместе с проверенной сетевой конфигурацией.",
};

const severity = (status) => ({ CRITICAL: "critical", WARNING: "warning", NOTICE: "notice" }[status] || null);
const issueCount = (text) => Number(String(text || "").match(/(?:^|-\s)(\d+)\s+(?:(?:skipped|external|static)\s+)?(?:pages?|page\(s\)|urls?|url\(s\)|assets?|asset\(s\))/i)?.[1] || 1);

function auditTimestamp(value) {
  if (!value) return new Date().toISOString();
  const normalized = /(?:Z|[+-]\d\d:?\d\d)$/.test(value) ? value : `${value.replace(" ", "T")}Z`;
  const parsed = new Date(normalized);
  if (Number.isNaN(parsed.getTime())) throw new Error("SiteOne report has an invalid execution timestamp");
  return parsed.toISOString();
}

function normalizeSkippedUrls(report, targetUrl) {
  const queue = [report.analysis, report.analyses].filter(Boolean);
  const visited = new WeakSet();
  let rows = [];
  let visitedNodes = 0;

  while (queue.length > 0 && rows.length === 0 && visitedNodes < 20_000) {
    const current = queue.shift();
    if (!current || typeof current !== "object" || visited.has(current)) continue;
    visited.add(current);
    visitedNodes += 1;
    if (current.aplCode === "skipped" && Array.isArray(current.rows)) {
      rows = current.rows;
      break;
    }
    for (const value of Object.values(current)) {
      if (value && typeof value === "object") queue.push(value);
    }
  }
  const targetOrigin = new URL(targetUrl).origin;

  return rows.slice(0, 50).map((row) => {
    const rawUrl = String(row?.url || "").trim();
    const rawSource = String(row?.sourceUqId || "").trim();
    let url = rawUrl;
    let foundAtUrl = rawSource;
    let external = false;

    try {
      const parsed = new URL(rawUrl, targetOrigin);
      parsed.search = "";
      parsed.hash = "";
      url = parsed.toString();
      external = parsed.origin !== targetOrigin;
    } catch {
      url = rawUrl.slice(0, 1_000);
    }

    try {
      const parsed = new URL(rawSource, targetOrigin);
      parsed.search = "";
      parsed.hash = "";
      foundAtUrl = parsed.toString();
    } catch {
      foundAtUrl = rawSource.slice(0, 1_000);
    }

    return {
      reason: String(row?.reason || "Unknown").slice(0, 160),
      source: String(row?.sourceAttr || "").slice(0, 160),
      found_at_url: foundAtUrl,
      url,
      external,
    };
  }).filter((row) => row.url);
}

export function normalizeSiteOneAudit(report, targetUrl = "https://offerpsp.com/") {
  if (!report || typeof report !== "object") throw new Error("SiteOne report must be a JSON object");
  if (report.crawler_error) throw new Error(String(report.crawler_error).slice(0, 500));
  if (report.crawler?.name !== "SiteOne Crawler") throw new Error("Unsupported SEO audit report");

  const categories = Array.isArray(report.qualityScores?.categories) ? report.qualityScores.categories : [];
  const overall = Number(report.qualityScores?.overall?.score);
  if (!Number.isFinite(overall)) throw new Error("SiteOne report does not contain a quality score");

  const categoryScores = Object.fromEntries(categories
    .filter((item) => item?.code && Number.isFinite(Number(item.score)))
    .map((item) => [String(item.code).replaceAll("-", "_"), Number(item.score)]));

  const issues = (report.summary?.items || [])
    .map((item) => ({ item, severity: severity(item?.status) }))
    .filter(({ severity: level }) => level)
    .slice(0, 30)
    .map(({ item, severity: level }) => ({
      severity: level,
      code: String(item.aplCode || "siteone-finding"),
      count: issueCount(item.text),
      title: String(item.text || item.aplCode || "SiteOne finding").replace(/\.$/, ""),
      action: ISSUE_ACTIONS[item.aplCode] || "Проверить URL и рекомендацию в полном отчёте SiteOne.",
    }));

  const stats = report.stats || {};
  const successfulUrls = Number(stats.countByStatus?.["200"] || 0);
  const brokenUrls = Object.entries(stats.countByStatus || {})
    .filter(([code]) => Number(code) >= 400)
    .reduce((sum, [, count]) => sum + Number(count || 0), 0);
  const targetOrigin = new URL(targetUrl).origin;
  const skippedUrls = normalizeSkippedUrls(report, targetUrl);
  const crawledPageUrls = [...new Set((Array.isArray(report.results) ? report.results : [])
    .filter((result) => Number(result?.type) === 1 && Number(result?.status) >= 200 && Number(result?.status) < 400)
    .map((result) => String(result?.url || "").trim())
    .filter((url) => {
      try {
        return new URL(url).origin === targetOrigin;
      } catch {
        return false;
      }
    }))].slice(0, 30);

  return {
    tool: "SiteOne Crawler",
    tool_version: String(report.crawler.version || "unknown"),
    target_url: targetUrl,
    audited_at: auditTimestamp(report.crawler.executedAt),
    overall_score: overall,
    category_scores: categoryScores,
    crawl_stats: {
      urls: Number(stats.totalUrls || 0),
      successful_urls: successfulUrls,
      broken_urls: brokenUrls,
      total_size_bytes: Number(stats.totalSize || 0),
      execution_seconds: Number(stats.totalExecutionTime || 0),
      average_request_seconds: Number(stats.totalRequestsTimesAvg || 0),
      maximum_request_seconds: Number(stats.totalRequestsTimesMax || 0),
    },
    issues,
    metadata: {
      verified: true,
      automated: true,
      report_format: "siteone-json-v2",
      scope: "public_site",
      summary_item_count: Number(report.summary?.items?.length || 0),
      crawled_page_urls: crawledPageUrls,
      skipped_urls: skippedUrls,
    },
  };
}

export function publicPageChecksFromEvidence(evidence) {
  const targetOrigin = new URL(evidence?.target_url || "https://offerpsp.com/").origin;
  const pages = (Array.isArray(evidence?.pages) ? evidence.pages : [])
    .filter((page) => {
      try {
        return new URL(page?.url).origin === targetOrigin;
      } catch {
        return false;
      }
    })
    .map((page) => ({
      url: String(page.url),
      status: Number(page.status || 0),
      title: String(page.title || "").slice(0, 240),
      canonical: String(page.canonical || "").slice(0, 1_000) || null,
      indexable: !/(?:^|[,\s])noindex(?:$|[,\s])/i.test(String(page.meta_robots || "")),
      structured_data_blocks: Number(page.json_ld_blocks || 0),
    }))
    .sort((left, right) => {
      const leftPath = new URL(left.url).pathname;
      const rightPath = new URL(right.url).pathname;
      if (leftPath === "/") return -1;
      if (rightPath === "/") return 1;
      return leftPath.localeCompare(rightPath);
    });

  return {
    checked_at: String(evidence?.collected_at || new Date().toISOString()),
    pages,
  };
}

async function probeText(url, fetchImpl) {
  try {
    const response = await fetchImpl(url, { headers: { "user-agent": "OfferPSP-SEO-GEO-Monitor/1.0" } });
    const text = await response.text();
    return { ok: response.ok, status: response.status, bytes: new TextEncoder().encode(text).length, text };
  } catch (error) {
    return { ok: false, status: 0, bytes: 0, text: "", error: String(error?.message || error) };
  }
}

export async function collectGeoSignals(fetchImpl = fetch) {
  const [robots, llms, sitemap, homepage] = await Promise.all([
    probeText("https://offerpsp.com/robots.txt", fetchImpl),
    probeText("https://offerpsp.com/llms.txt", fetchImpl),
    probeText("https://offerpsp.com/sitemap.xml", fetchImpl),
    probeText("https://offerpsp.com/", fetchImpl),
  ]);
  const aiBlocked = /user-agent:\s*(?:gptbot|chatgpt-user|claudebot|google-extended|perplexitybot)[\s\S]{0,300}?disallow:\s*\//i.test(robots.text);
  const structuredDataCount = (homepage.text.match(/application\/ld\+json/gi) || []).length;

  return {
    checked_at: new Date().toISOString(),
    robots_txt: { ok: robots.ok, status: robots.status, ai_crawlers_allowed: robots.ok && !aiBlocked },
    llms_txt: { ok: llms.ok, status: llms.status, bytes: llms.bytes },
    sitemap: { ok: sitemap.ok, status: sitemap.status },
    structured_data: { ok: homepage.ok && structuredDataCount > 0, blocks: structuredDataCount },
  };
}
