import { getGoogleSearchConsoleOverview } from "./google-search-console.mjs";
import { getLiveVercelTraffic } from "./vercel-web-analytics.mjs";

const errorMessage = (reason) => String(reason?.message || reason || "Source check failed").slice(0, 500);

export async function collectLiveSeoAuditSources({
  googleLoader = () => getGoogleSearchConsoleOverview({ force: true }),
  vercelLoader = () => getLiveVercelTraffic(),
} = {}) {
  const [google, vercel] = await Promise.allSettled([googleLoader(), vercelLoader()]);
  return { google, vercel };
}

export function seoAgentExternalEvidence(liveSources) {
  const google = liveSources?.google;
  const vercel = liveSources?.vercel;
  const googleOverview = google?.status === "fulfilled" ? google.value : null;
  const vercelTraffic = vercel?.status === "fulfilled" ? vercel.value : null;
  return {
    google_search_console: googleOverview ? {
      status: "completed",
      fetched_at: googleOverview.fetched_at || null,
      data_through: googleOverview.data_through || null,
      days_90: googleOverview.periods?.days_90 || null,
      inspection: googleOverview.inspection || null,
      sitemaps: googleOverview.sitemaps || [],
      warnings: googleOverview.warnings || [],
    } : {
      status: "failed",
      error_message: errorMessage(google?.reason || "Google Search Console check failed"),
    },
    vercel_web_analytics: vercelTraffic ? {
      status: "completed",
      fetched_at: vercelTraffic.fetched_at || null,
      period_start: vercelTraffic.period_start || null,
      period_end: vercelTraffic.period_end || null,
      visitors: Number(vercelTraffic.visitors || 0),
      pageviews: Number(vercelTraffic.pageviews || 0),
      countries: Array.isArray(vercelTraffic.countries) ? vercelTraffic.countries.slice(0, 20) : [],
      referrers: Array.isArray(vercelTraffic.referrers) ? vercelTraffic.referrers.slice(0, 20) : [],
      paths: Array.isArray(vercelTraffic.paths) ? vercelTraffic.paths.slice(0, 20) : [],
    } : {
      status: "failed",
      error_message: errorMessage(vercel?.reason || "Vercel Web Analytics check failed"),
    },
  };
}

export function buildSeoAuditSourceMatrix({ audit, liveSources, checkedAt = new Date().toISOString() }) {
  const google = liveSources?.google;
  const vercel = liveSources?.vercel;
  const agent = audit?.agent_analysis || {};
  const googleOverview = google?.status === "fulfilled" ? google.value : null;
  const vercelTraffic = vercel?.status === "fulfilled" ? vercel.value : null;

  const sources = [
    {
      id: "siteone",
      label: "SiteOne Crawler",
      mode: "executed",
      status: "completed",
      checked_at: audit?.audited_at || checkedAt,
      message: "Production-сайт проверен новым crawl без архивной подстановки.",
      metrics: {
        urls: Number(audit?.crawl_stats?.urls || 0),
        successful_urls: Number(audit?.crawl_stats?.successful_urls || 0),
        broken_urls: Number(audit?.crawl_stats?.broken_urls || 0),
        overall_score: Number(audit?.overall_score || 0),
      },
    },
    {
      id: "seo_geo_agent",
      label: "OfferPSP SEO/GEO Agent",
      mode: "executed",
      status: agent.status === "completed" ? "completed" : "failed",
      checked_at: agent.generated_at || checkedAt,
      message: agent.status === "completed"
        ? "Агент разобрал факты нового crawl и сформировал приоритеты."
        : errorMessage(agent.error_message || "AI-анализ не получен"),
      metrics: {
        model: agent.model || null,
        priorities: Array.isArray(agent.priorities) ? agent.priorities.length : 0,
      },
    },
    googleOverview ? {
      id: "google_search_console",
      label: "Google Search Console",
      mode: "executed",
      status: "completed",
      checked_at: googleOverview.fetched_at || checkedAt,
      message: "Поисковые показатели и URL Inspection запрошены заново. Данные Google публикуются с задержкой.",
      metrics: {
        data_through: googleOverview.data_through || null,
        clicks_90d: Number(googleOverview.periods?.days_90?.clicks || 0),
        impressions_90d: Number(googleOverview.periods?.days_90?.impressions || 0),
        inspected_urls: Number(googleOverview.inspection?.summary?.total || 0),
        indexed_urls: Number(googleOverview.inspection?.summary?.indexed || 0),
        failed_inspections: Number(googleOverview.inspection?.failed || 0),
      },
    } : {
      id: "google_search_console",
      label: "Google Search Console",
      mode: "executed",
      status: "failed",
      checked_at: checkedAt,
      message: errorMessage(google?.reason || "Google Search Console check failed"),
      metrics: {},
    },
    vercelTraffic ? {
      id: "vercel_web_analytics",
      label: "Vercel Web Analytics",
      mode: "executed",
      status: "completed",
      checked_at: vercelTraffic.fetched_at || checkedAt,
      message: "Текущий production-трафик получен напрямую из Vercel без архивной подстановки.",
      metrics: {
        period_start: vercelTraffic.period_start || null,
        period_end: vercelTraffic.period_end || null,
        visitors: Number(vercelTraffic.visitors || 0),
        pageviews: Number(vercelTraffic.pageviews || 0),
      },
    } : {
      id: "vercel_web_analytics",
      label: "Vercel Web Analytics",
      mode: "executed",
      status: "failed",
      checked_at: checkedAt,
      message: errorMessage(vercel?.reason || "Vercel Web Analytics check failed"),
      metrics: {},
    },
    {
      id: "bing_webmaster_tools",
      label: "Bing Webmaster Tools",
      mode: "independent",
      status: "not_triggered",
      checked_at: null,
      message: "Работает в отдельном кабинете Bing; API запуска из OfferPSP пока не подключён.",
      metrics: {},
    },
    {
      id: "ahrefs",
      label: "Ahrefs Site Audit",
      mode: "independent",
      status: "not_triggered",
      checked_at: null,
      message: "Независимый аудит идёт по расписанию Ahrefs; эта кнопка его не запускает.",
      metrics: {},
    },
    {
      id: "screaming_frog",
      label: "Screaming Frog",
      mode: "local_only",
      status: "not_triggered",
      checked_at: null,
      message: "Локальный инструмент на Mac; облачный аудит OfferPSP не может запустить его удалённо.",
      metrics: {},
    },
  ];

  return {
    version: "offerpsp-seo-audit-sources-v1",
    checked_at: checkedAt,
    summary: {
      executed: sources.filter((source) => source.mode === "executed").length,
      completed: sources.filter((source) => source.status === "completed").length,
      failed: sources.filter((source) => source.status === "failed").length,
      independent: sources.filter((source) => source.mode === "independent").length,
      local_only: sources.filter((source) => source.mode === "local_only").length,
    },
    sources,
  };
}
