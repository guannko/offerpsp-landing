import { useCallback, useEffect, useRef, useState } from "react";
import { Link } from "react-router";
import PageMeta from "../components/common/PageMeta";
import { EmptyState, ErrorBanner, Metric, PageHeading, Panel, SkeletonPage } from "../components/control/Ui";
import { supabase } from "../lib/supabase";

type CountRow = { key?: string; source?: string; category?: string; geo?: string; visitors?: number; pageviews?: number; leads?: number };
type RecentLead = {
  lead_id: string;
  company?: string | null;
  submitted_at?: string | null;
  source_category?: string | null;
  source_platform?: string | null;
  source_referrer?: string | null;
  landing_path?: string | null;
  utm_source?: string | null;
  utm_medium?: string | null;
  utm_campaign?: string | null;
};
type AuditIssue = { severity: "critical" | "warning" | "notice"; code: string; count: number; title: string; action: string };
type AgentPriority = {
  priority: "P0" | "P1" | "P2";
  area: "SEO" | "GEO" | "Content" | "Technical";
  title: string;
  evidence: string;
  recommendation: string;
  affected_urls?: string[];
};
type AgentAnalysis = {
  status?: "completed" | "failed";
  agent?: string;
  agent_version?: string;
  model?: string;
  generated_at?: string;
  executive_summary?: string;
  confidence?: "high" | "medium" | "low";
  priorities?: AgentPriority[];
  quick_wins?: string[];
  content_recommendations?: Array<{
    url: string;
    suggested_title?: string;
    suggested_meta_description?: string;
    rationale?: string;
  }>;
  geo_recommendations?: string[];
  limitations?: string[];
  error_message?: string;
};
type TrafficSnapshot = {
  source?: string;
  period_start?: string;
  period_end?: string;
  captured_at?: string;
  visitors?: number;
  pageviews?: number;
  countries?: CountRow[];
  referrers?: CountRow[];
  paths?: CountRow[];
  limitations?: Array<{ code: string; message: string }>;
};
type LiveTraffic = {
  source: "vercel_web_analytics_live";
  period_start: string;
  period_end: string;
  fetched_at: string;
  visitors: number;
  pageviews: number;
  countries: CountRow[];
  referrers: CountRow[];
  paths: CountRow[];
};
type SearchMetric = {
  clicks: number;
  impressions: number;
  ctr: number;
  position: number;
};
type SearchPeriod = SearchMetric & { start_date: string; end_date: string };
type SearchDimensionRow = SearchMetric & { key: string; dimension: string };
type SearchInspection = {
  url: string;
  verdict: string;
  coverage_state?: string | null;
  last_crawl_time?: string | null;
  user_canonical?: string | null;
  google_canonical?: string | null;
};
type GoogleSearchConsole = {
  source: "google_search_console";
  fetched_at: string;
  data_through: string;
  periods: { days_7: SearchPeriod; days_28: SearchPeriod; days_90: SearchPeriod };
  queries: SearchDimensionRow[];
  pages: SearchDimensionRow[];
  countries: SearchDimensionRow[];
  devices: SearchDimensionRow[];
  sitemaps: Array<{ path: string; errors: number; warnings: number; pending: boolean; contents: Array<{ submitted: number; indexed: number }> }>;
  inspection: {
    summary: { total: number; indexed: number; not_indexed: number; neutral: number };
    urls: SearchInspection[];
  };
};
type TechnicalAudit = {
  tool?: string;
  tool_version?: string;
  target_url?: string;
  audited_at?: string;
  overall_score?: number;
  category_scores?: Record<string, number>;
  crawl_stats?: Record<string, number>;
  issues?: AuditIssue[];
  agent_analysis?: AgentAnalysis;
  metadata?: {
    geo_signals?: {
      checked_at?: string;
      robots_txt?: { ok?: boolean; status?: number; ai_crawlers_allowed?: boolean };
      llms_txt?: { ok?: boolean; status?: number; bytes?: number };
      sitemap?: { ok?: boolean; status?: number };
      structured_data?: { ok?: boolean; blocks?: number };
    };
  };
};
type AuditRun = {
  id?: string;
  status?: "queued" | "running" | "completed" | "failed";
  trigger_source?: string;
  requested_at?: string;
  started_at?: string;
  completed_at?: string;
  error_message?: string | null;
};
type AnalyticsPayload = {
  generated_at?: string;
  traffic?: TrafficSnapshot;
  traffic_history?: TrafficSnapshot[];
  technical_audit?: TechnicalAudit;
  audit_history?: TechnicalAudit[];
  audit_run?: AuditRun;
  lead_attribution?: {
    total_business_leads?: number;
    last_30_days?: number;
    attributed_leads?: number;
    sources?: CountRow[];
    utm?: Array<{ source: string; medium: string; campaign: string; leads: number }>;
    recent?: RecentLead[];
    geo_demand?: CountRow[];
  };
};
type AcquisitionFunnelRow = {
  source: string;
  category?: string;
  medium?: string;
  campaign?: string;
  leads: number;
  qualified: number;
  won: number;
  live: number;
};
type AcquisitionFunnel = {
  generated_at?: string;
  totals?: {
    leads?: number;
    qualified?: number;
    won?: number;
    live?: number;
    paid_leads?: number;
    google_ads_leads?: number;
    affiliate_leads?: number;
    tracked_clicks?: number;
    conversion_ready?: number;
    conversion_blocked_consent?: number;
  };
  sources?: AcquisitionFunnelRow[];
  campaigns?: AcquisitionFunnelRow[];
};

const number = (value: unknown) => Number(value || 0);
const dateTime = (value?: string | null) => value
  ? new Intl.DateTimeFormat("ru-RU", { day: "2-digit", month: "short", year: "numeric", hour: "2-digit", minute: "2-digit" }).format(new Date(value))
  : "—";
const shortDate = (value?: string | null) => value
  ? new Intl.DateTimeFormat("ru-RU", { day: "2-digit", month: "short" }).format(new Date(value))
  : "—";
const sourceName = (value?: string | null) => {
  if (!value || value === "Не определён") return "Источник не определён";
  const normalized = value.toLowerCase();
  if (normalized.includes("chatgpt") || normalized.includes("openai")) return "ChatGPT / OpenAI";
  if (normalized.includes("gemini")) return "Google Gemini";
  if (normalized.includes("claude")) return "Claude";
  if (normalized === "direct") return "Прямой заход";
  return value;
};
const countryName = (value?: string) => ({ CY: "Кипр", RU: "Россия", IN: "Индия", DE: "Германия", IT: "Италия", GB: "Великобритания" }[value || ""] || value || "—");
const searchCountryName = (value?: string) => ({ vnm: "Вьетнам", rus: "Россия", cze: "Чехия", usa: "США", cyp: "Кипр", gbr: "Великобритания", deu: "Германия", mlt: "Мальта", nld: "Нидерланды", bra: "Бразилия" }[value || ""] || value?.toUpperCase() || "—");
const percent = (value: unknown) => `${(number(value) * 100).toFixed(1)}%`;
const position = (value: unknown) => number(value) ? number(value).toFixed(1) : "—";
const shortPage = (value: string) => value.replace(/^https?:\/\/offerpsp\.com/i, "") || "/";
const SEO_ANALYTICS_REFRESH_MS = 5 * 60_000;
const LIVE_TRAFFIC_REFRESH_MS = 5 * 60_000;
const GOOGLE_REFRESH_MS = 15 * 60_000;
const ACTIVE_AUDIT_POLL_MS = 15_000;

function BarList({ rows, valueKey, empty }: { rows: CountRow[]; valueKey: "visitors" | "pageviews" | "leads"; empty: string }) {
  const maximum = Math.max(1, ...rows.map((row) => number(row[valueKey])));
  if (!rows.length) return <EmptyState title="Данных пока нет" description={empty}/>;
  return <div className="space-y-4">{rows.map((row, index) => {
    const label = valueKey === "leads" ? sourceName(row.source || row.geo || row.key) : countryName(row.key);
    const value = number(row[valueKey]);
    return <div key={`${label}-${index}`}>
      <div className="mb-2 flex items-center justify-between gap-4 text-sm">
        <span className="truncate font-medium text-gray-700 dark:text-gray-300">{label}</span>
        <strong className="text-gray-900 dark:text-white">{value}</strong>
      </div>
      <div className="h-2.5 rounded-full bg-gray-100 dark:bg-gray-800"><div className="h-2.5 rounded-full bg-gradient-to-r from-brand-500 to-theme-purple-500" style={{ width: `${Math.max(6, value / maximum * 100)}%` }}/></div>
    </div>;
  })}</div>;
}

export default function SeoGeoPage() {
  const [payload, setPayload] = useState<AnalyticsPayload | null>(null);
  const [acquisition, setAcquisition] = useState<AcquisitionFunnel | null>(null);
  const [liveTraffic, setLiveTraffic] = useState<LiveTraffic | null>(null);
  const [googleData, setGoogleData] = useState<GoogleSearchConsole | null>(null);
  const [loading, setLoading] = useState(true);
  const [liveTrafficLoading, setLiveTrafficLoading] = useState(true);
  const [googleLoading, setGoogleLoading] = useState(true);
  const [startingAudit, setStartingAudit] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [liveTrafficError, setLiveTrafficError] = useState<string | null>(null);
  const [googleError, setGoogleError] = useState<string | null>(null);
  const [refreshNotice, setRefreshNotice] = useState<string | null>(null);
  const analyticsLoadInFlight = useRef<Promise<void> | null>(null);
  const analyticsLoadedAt = useRef(0);
  const liveTrafficLoadedAt = useRef(0);
  const googleLoadedAt = useRef(0);

  const load = useCallback((background = false) => {
    if (analyticsLoadInFlight.current) return analyticsLoadInFlight.current;
    const request = (async () => {
      if (!background) setLoading(true);
      setError(null);
      const [analyticsResult, acquisitionResult] = await Promise.all([
        supabase.rpc("get_offerpsp_seo_geo_analytics"),
        supabase.rpc("get_offerpsp_acquisition_funnel"),
      ]);
      const loadError = analyticsResult.error || acquisitionResult.error;
      if (loadError) setError(loadError.message);
      if (!analyticsResult.error) setPayload((analyticsResult.data || {}) as AnalyticsPayload);
      if (!acquisitionResult.error) setAcquisition((acquisitionResult.data || {}) as AcquisitionFunnel);
      setLoading(false);
      analyticsLoadedAt.current = Date.now();
    })();
    analyticsLoadInFlight.current = request;
    request.then(
      () => { if (analyticsLoadInFlight.current === request) analyticsLoadInFlight.current = null; },
      () => { if (analyticsLoadInFlight.current === request) analyticsLoadInFlight.current = null; },
    );
    return request;
  }, []);

  const loadLiveTraffic = useCallback(async () => {
    setLiveTrafficLoading(true);
    setLiveTrafficError(null);
    try {
      const { data: sessionData } = await supabase.auth.getSession();
      const accessToken = sessionData.session?.access_token;
      if (!accessToken) throw new Error("Сессия истекла. Войдите снова.");
      const response = await fetch("/api/seo-live-traffic", {
        method: "GET",
        headers: { Authorization: `Bearer ${accessToken}` },
        cache: "no-store",
      });
      const result = await response.json().catch(() => ({}));
      if (!response.ok) throw new Error(result.error || "Живые данные Vercel недоступны");
      setLiveTraffic(result as LiveTraffic);
    } catch (trafficError) {
      setLiveTraffic(null);
      setLiveTrafficError(trafficError instanceof Error ? trafficError.message : "Живые данные Vercel недоступны");
    } finally {
      setLiveTrafficLoading(false);
      liveTrafficLoadedAt.current = Date.now();
    }
  }, []);

  const loadGoogle = useCallback(async () => {
    setGoogleLoading(true);
    setGoogleError(null);
    try {
      const { data: sessionData } = await supabase.auth.getSession();
      const accessToken = sessionData.session?.access_token;
      if (!accessToken) throw new Error("Сессия истекла. Войдите снова.");
      const response = await fetch("/api/google-search-console", {
        method: "GET",
        headers: { Authorization: `Bearer ${accessToken}` },
        cache: "no-store",
      });
      const result = await response.json().catch(() => ({}));
      if (!response.ok) throw new Error(result.error || "Google Search Console недоступен");
      setGoogleData(result as GoogleSearchConsole);
    } catch (googleLoadError) {
      setGoogleData(null);
      setGoogleError(googleLoadError instanceof Error ? googleLoadError.message : "Google Search Console недоступен");
    } finally {
      setGoogleLoading(false);
      googleLoadedAt.current = Date.now();
    }
  }, []);

  useEffect(() => {
    void load();
    void loadLiveTraffic();
    void loadGoogle();
  }, [load, loadLiveTraffic, loadGoogle]);

  useEffect(() => {
    const refresh = () => { void load(true); };
    const refreshStaleSources = () => {
      const now = Date.now();
      if (now - analyticsLoadedAt.current >= SEO_ANALYTICS_REFRESH_MS) refresh();
      if (now - liveTrafficLoadedAt.current >= LIVE_TRAFFIC_REFRESH_MS) void loadLiveTraffic();
      if (now - googleLoadedAt.current >= GOOGLE_REFRESH_MS) void loadGoogle();
    };
    const channel = supabase
      .channel("offerpsp-seo-geo-live")
      .on("postgres_changes", { event: "*", schema: "public", table: "offerpsp_seo_audit_runs" }, refresh)
      .on("postgres_changes", { event: "*", schema: "public", table: "offerpsp_technical_audits" }, refresh)
      .on("postgres_changes", { event: "*", schema: "public", table: "offerpsp_leads" }, refresh)
      .subscribe();

    const fallbackInterval = window.setInterval(refresh, SEO_ANALYTICS_REFRESH_MS);
    const liveTrafficInterval = window.setInterval(() => { void loadLiveTraffic(); }, LIVE_TRAFFIC_REFRESH_MS);
    const googleInterval = window.setInterval(() => { void loadGoogle(); }, GOOGLE_REFRESH_MS);
    const refreshWhenVisible = () => {
      if (document.visibilityState === "visible") refreshStaleSources();
    };
    window.addEventListener("focus", refreshStaleSources);
    document.addEventListener("visibilitychange", refreshWhenVisible);

    return () => {
      window.clearInterval(fallbackInterval);
      window.clearInterval(liveTrafficInterval);
      window.clearInterval(googleInterval);
      window.removeEventListener("focus", refreshStaleSources);
      document.removeEventListener("visibilitychange", refreshWhenVisible);
      void supabase.removeChannel(channel);
    };
  }, [load, loadLiveTraffic, loadGoogle]);

  const auditRun = payload?.audit_run || {};
  const auditActive = auditRun.status === "queued" || auditRun.status === "running";

  useEffect(() => {
    if (!auditActive) return undefined;
    const interval = window.setInterval(() => { void load(true); }, ACTIVE_AUDIT_POLL_MS);
    return () => window.clearInterval(interval);
  }, [auditActive, load]);

  const startAudit = useCallback(async () => {
    setStartingAudit(true);
    setError(null);
    setRefreshNotice(null);
    try {
      const { data: sessionData } = await supabase.auth.getSession();
      const accessToken = sessionData.session?.access_token;
      if (!accessToken) throw new Error("Сессия истекла. Войдите снова.");
      const response = await fetch("/api/seo-audit", {
        method: "POST",
        headers: { Authorization: `Bearer ${accessToken}`, "Content-Type": "application/json" },
        body: "{}",
      });
      const result = await response.json().catch(() => ({}));
      if (!response.ok) throw new Error(result.error || "Не удалось запустить SEO-аудит");
      setRefreshNotice(result.reused
        ? "Аудит уже выполняется. Страница обновится автоматически после завершения."
        : result.status === "completed"
          ? "Новый crawl и AI-анализ завершены. Ниже показаны свежие результаты SiteOne и нашего SEO/GEO-агента."
          : "Полный аудит запущен. SiteOne проверяет production-сайт, затем наш агент расставит приоритеты.");
      await load(true);
    } catch (startError) {
      setError(startError instanceof Error ? startError.message : "Не удалось запустить SEO-аудит");
    } finally {
      setStartingAudit(false);
    }
  }, [load]);

  const traffic = liveTraffic;
  const trafficHistory = payload?.traffic_history || [];
  const auditHistory = payload?.audit_history || [];
  const attribution = payload?.lead_attribution || {};
  const audit = payload?.technical_audit || {};
  const totalLeads = number(attribution.total_business_leads);
  const attributedLeads = number(attribution.attributed_leads);
  const coverage = totalLeads ? Math.round(attributedLeads / totalLeads * 100) : 0;
  const issues = audit.issues || [];
  const agent = audit.agent_analysis || {};
  const agentPriorities = agent.priorities || [];
  const categoryScores = Object.entries(audit.category_scores || {});
  const geoSignals = audit.metadata?.geo_signals;
  const referrers = (traffic?.referrers || []).map((row) => ({ ...row, key: row.key === "direct" ? "Прямой заход" : row.key }));
  const recent = attribution.recent || [];
  const sourceRows = attribution.sources || [];
  const acquisitionTotals = acquisition?.totals || {};
  const campaignRows = acquisition?.campaigns || [];
  const maxSource = Math.max(1, ...sourceRows.map((row) => number(row.leads)));
  const google90 = googleData?.periods.days_90;
  const indexAttention = number(googleData?.inspection.summary.not_indexed) + number(googleData?.inspection.summary.neutral);

  if (loading) return <SkeletonPage/>;

  return <>
    <PageMeta title="SEO / GEO | OfferPSP" description="Источники трафика, география, атрибуция лидов и техническое здоровье OfferPSP."/>
    {error && <ErrorBanner message={error}/>}
    <PageHeading
      eyebrow="Growth intelligence"
      title="SEO / GEO и источники лидов"
      description="Посещения идут напрямую из Vercel, поисковый спрос и индексация — напрямую из Google Search Console. Аудиты и заявки хранятся отдельно."
      action={<div className="flex flex-col items-end gap-2"><button onClick={() => void startAudit()} disabled={startingAudit || auditActive} className="rounded-lg bg-brand-500 px-4 py-2.5 text-sm font-semibold text-white hover:bg-brand-600 disabled:opacity-50">{startingAudit ? "Запускаю…" : auditActive ? "Аудит выполняется…" : "Запустить полный аудит"}</button><span className={`text-xs font-medium ${liveTraffic ? "text-success-600 dark:text-success-400" : liveTrafficError ? "text-error-600 dark:text-error-400" : "text-gray-400"}`}>{liveTraffic ? `● Live Vercel · ${dateTime(liveTraffic.fetched_at)}` : liveTrafficLoading ? "Подключаю Vercel…" : "Live Vercel недоступен"}</span><span className={`text-xs font-medium ${googleData ? "text-success-600 dark:text-success-400" : googleError ? "text-error-600 dark:text-error-400" : "text-gray-400"}`}>{googleData ? `● Google · данные по ${shortDate(googleData.data_through)}` : googleLoading ? "Подключаю Google…" : "Google недоступен"}</span></div>}
    />
    {refreshNotice && <div className="mb-5 rounded-xl border border-success-200 bg-success-50 px-4 py-3 text-sm text-success-700 dark:border-success-500/20 dark:bg-success-500/10 dark:text-success-300">{refreshNotice}</div>}
    {liveTrafficError && <div className="mb-5 rounded-xl border border-error-200 bg-error-50 px-4 py-3 text-sm text-error-700 dark:border-error-500/20 dark:bg-error-500/10 dark:text-error-300"><strong>Текущий трафик не показан.</strong> {liveTrafficError} Архивные данные не используются.</div>}
    {googleError && <div className="mb-5 rounded-xl border border-error-200 bg-error-50 px-4 py-3 text-sm text-error-700 dark:border-error-500/20 dark:bg-error-500/10 dark:text-error-300"><strong>Данные Google не показаны.</strong> {googleError} Архивные данные не используются.</div>}

    <Panel className="mb-6">
      <div className="flex flex-col gap-2 sm:flex-row sm:items-start sm:justify-between">
        <div><h2 className="text-lg font-semibold text-gray-900 dark:text-white">Google Search Console</h2><p className="mt-1 text-sm text-gray-500">Органический поиск и фактическая индексация. Google публикует эти данные с задержкой, поэтому это не live‑счётчик.</p></div>
        <span className="rounded-lg bg-gray-50 px-3 py-2 text-xs text-gray-500 dark:bg-white/[0.03]">{googleData ? `Данные по ${shortDate(googleData.data_through)} · получены ${dateTime(googleData.fetched_at)}` : googleLoading ? "Загрузка…" : "Нет данных"}</span>
      </div>
      <div className="mt-5 grid grid-cols-2 gap-3 lg:grid-cols-5">
        <Metric label="Клики · 90 дней" value={google90 ? number(google90.clicks) : "—"} hint={google90 ? `${shortDate(google90.start_date)} — ${shortDate(google90.end_date)}` : "Google недоступен"}/>
        <Metric label="Показы · 90 дней" value={google90 ? number(google90.impressions) : "—"} hint="органический поиск Google"/>
        <Metric label="CTR" value={google90 ? percent(google90.ctr) : "—"} hint="клики ÷ показы" tone={google90 && google90.ctr < 0.02 ? "warning" : "success"}/>
        <Metric label="Средняя позиция" value={google90 ? position(google90.position) : "—"} hint="меньше — лучше" tone={google90 && google90.position > 30 ? "warning" : "success"}/>
        <Metric label="В индексе" value={googleData ? `${googleData.inspection.summary.indexed}/${googleData.inspection.summary.total}` : "—"} hint={googleData ? `${indexAttention} требуют внимания` : "проверка URL не получена"} tone={indexAttention ? "warning" : "success"}/>
      </div>
      <div className="mt-6 grid grid-cols-1 gap-6 xl:grid-cols-3">
        <div><h3 className="text-sm font-semibold text-gray-900 dark:text-white">Запросы</h3><div className="mt-3 space-y-2">{(googleData?.queries || []).slice(0, 8).map((row) => <div key={row.key} className="grid grid-cols-[1fr_52px_62px] gap-2 rounded-xl border border-gray-200 px-3 py-2 text-sm dark:border-gray-800"><span className="truncate text-gray-700 dark:text-gray-300">{row.key}</span><strong className="text-right text-gray-900 dark:text-white">{row.impressions}</strong><span className="text-right text-gray-400">поз. {position(row.position)}</span></div>)}{!googleData?.queries.length && <EmptyState title="Запросов нет" description="Google ещё не показал поисковые запросы."/>}</div></div>
        <div><h3 className="text-sm font-semibold text-gray-900 dark:text-white">Страницы из поиска</h3><div className="mt-3 space-y-2">{(googleData?.pages || []).slice(0, 8).map((row) => <div key={row.key} className="grid grid-cols-[1fr_52px_62px] gap-2 rounded-xl border border-gray-200 px-3 py-2 text-sm dark:border-gray-800"><code className="truncate text-xs text-gray-700 dark:text-gray-300">{shortPage(row.key)}</code><strong className="text-right text-gray-900 dark:text-white">{row.impressions}</strong><span className="text-right text-gray-400">{row.clicks} клик.</span></div>)}{!googleData?.pages.length && <EmptyState title="Страниц нет" description="Google ещё не показал страницы в поиске."/>}</div></div>
        <div><h3 className="text-sm font-semibold text-gray-900 dark:text-white">Страны поиска</h3><div className="mt-3 space-y-2">{(googleData?.countries || []).slice(0, 8).map((row) => <div key={row.key} className="grid grid-cols-[1fr_52px_62px] gap-2 rounded-xl border border-gray-200 px-3 py-2 text-sm dark:border-gray-800"><span className="truncate text-gray-700 dark:text-gray-300">{searchCountryName(row.key)}</span><strong className="text-right text-gray-900 dark:text-white">{row.impressions}</strong><span className="text-right text-gray-400">{row.clicks} клик.</span></div>)}{!googleData?.countries.length && <EmptyState title="Стран нет" description="Google ещё не показал географию поиска."/>}</div></div>
      </div>
      {googleData && <details className="mt-6 rounded-xl border border-gray-200 dark:border-gray-800"><summary className="cursor-pointer px-4 py-3 text-sm font-semibold text-gray-900 dark:text-white">Индексация URL · {googleData.inspection.summary.indexed} в индексе, {indexAttention} требуют внимания</summary><div className="border-t border-gray-100 p-4 dark:border-gray-800"><div className="space-y-2">{googleData.inspection.urls.map((row) => <div key={row.url} className="flex flex-col justify-between gap-2 rounded-xl bg-gray-50 px-4 py-3 text-sm dark:bg-white/[0.03] sm:flex-row sm:items-center"><div className="min-w-0"><code className="block truncate text-xs text-gray-700 dark:text-gray-300">{shortPage(row.url)}</code><span className="mt-1 block text-xs text-gray-400">{row.coverage_state || "Статус не указан"}{row.last_crawl_time ? ` · обход ${dateTime(row.last_crawl_time)}` : ""}</span></div><strong className={row.verdict === "PASS" ? "text-success-600 dark:text-success-400" : "text-warning-600"}>{row.verdict === "PASS" ? "В индексе" : "Требует внимания"}</strong></div>)}</div></div></details>}
    </Panel>

    <div className="grid grid-cols-2 gap-3 xl:grid-cols-5">
      <Metric label="Посетители" value={traffic ? number(traffic.visitors) : "—"} hint={traffic ? `${shortDate(traffic.period_start)} — ${shortDate(traffic.period_end)}` : "живой источник недоступен"}/>
      <Metric label="Просмотры" value={traffic ? number(traffic.pageviews) : "—"} hint={traffic ? "production‑сайт по данным Vercel" : "архивные данные не используются"}/>
      <Metric label="Заявки · 30 дней" value={number(attribution.last_30_days)} hint="без E2E, спама и архивных дублей" tone="success"/>
      <Metric label="Атрибуция" value={`${coverage}%`} hint={`${attributedLeads} из ${totalLeads} рабочих заявок`} tone={coverage < 50 ? "warning" : "success"}/>
      <Metric label="Техаудит" value={audit.audited_at ? `${number(audit.overall_score).toFixed(1)}/10` : "—"} hint={auditActive ? "новый crawl выполняется" : audit.audited_at ? `${audit.tool || "аудит"} ${audit.tool_version || ""}` : "crawl пока не запускался"} tone={audit.audited_at && number(audit.overall_score) >= 9 ? "success" : "warning"}/>
    </div>

    <div className="mt-6 grid grid-cols-1 gap-6 xl:grid-cols-3">
      <Panel className="xl:col-span-2">
        <div className="flex flex-col gap-2 sm:flex-row sm:items-start sm:justify-between">
          <div><h2 className="text-lg font-semibold text-gray-900 dark:text-white">Источники заявок</h2><p className="mt-1 text-sm text-gray-500">Наша собственная first/last‑touch атрибуция из формы, независимо от ограничений Vercel.</p></div>
          <span className="rounded-lg bg-gray-50 px-3 py-2 text-xs text-gray-500 dark:bg-white/[0.03]">Обновлено {dateTime(payload?.generated_at)}</span>
        </div>
        <div className="mt-6 space-y-4">{sourceRows.map((row, index) => {
          const value = number(row.leads);
          return <div key={`${row.source}-${index}`} className="grid grid-cols-[minmax(120px,180px)_1fr_42px] items-center gap-3">
            <div className="min-w-0"><strong className="block truncate text-sm text-gray-800 dark:text-white/90">{sourceName(row.source)}</strong><span className="text-xs text-gray-400">{row.category || "—"}</span></div>
            <div className="h-9 overflow-hidden rounded-lg bg-gray-100 dark:bg-gray-800"><div className="h-full rounded-lg bg-gradient-to-r from-brand-600 to-theme-purple-500" style={{ width: `${Math.max(7, value / maxSource * 100)}%` }}/></div>
            <strong className="text-right text-sm text-gray-900 dark:text-white">{value}</strong>
          </div>;
        })}{!sourceRows.length && <EmptyState title="Источники ещё не записаны" description="Новые заявки уже сохраняют referrer, AI‑платформу и UTM автоматически."/>}</div>
      </Panel>
      <Panel>
        <h2 className="text-lg font-semibold text-gray-900 dark:text-white">География посещений</h2>
        <p className="mt-1 text-sm text-gray-500">Страны реальных посетителей сайта, не GEO платёжного запроса.</p>
        <div className="mt-6"><BarList rows={traffic?.countries || []} valueKey="visitors" empty={liveTrafficError ? "Живой источник Vercel недоступен." : "Vercel ещё не зафиксировал географию посетителей."}/></div>
      </Panel>
    </div>

    <Panel className="mt-6">
      <div className="flex flex-col gap-2 sm:flex-row sm:items-start sm:justify-between">
        <div><h2 className="text-lg font-semibold text-gray-900 dark:text-white">Рекламная и affiliate‑атрибуция</h2><p className="mt-1 text-sm text-gray-500">Честная цепочка: рекламный или партнёрский клик → заявка → квалификация → выигранная сделка → live‑подключение.</p></div>
        <span className="rounded-lg bg-gray-50 px-3 py-2 text-xs text-gray-500 dark:bg-white/[0.03]">Без расхода и ROAS, пока Google Ads не отдаёт живую стоимость</span>
      </div>
      <div className="mt-5 grid grid-cols-2 gap-3 lg:grid-cols-4 xl:grid-cols-7">
        <Metric label="Paid‑лиды" value={number(acquisitionTotals.paid_leads)} hint="любые платные кампании"/>
        <Metric label="Google Ads" value={number(acquisitionTotals.google_ads_leads)} hint="gclid / gbraid / wbraid"/>
        <Metric label="Affiliate" value={number(acquisitionTotals.affiliate_leads)} hint="партнёрский ID или click ID"/>
        <Metric label="Квалифицированы" value={number(acquisitionTotals.qualified)} hint={`из ${number(acquisitionTotals.leads)} заявок`} tone="success"/>
        <Metric label="Выиграно" value={number(acquisitionTotals.won)} hint="зафиксирован outcome" tone="success"/>
        <Metric label="Live" value={number(acquisitionTotals.live)} hint="реально запущено" tone="success"/>
        <Metric label="Google export" value={number(acquisitionTotals.conversion_ready)} hint={number(acquisitionTotals.conversion_blocked_consent) ? `${number(acquisitionTotals.conversion_blocked_consent)} ждут consent` : "готовых событий"} tone={number(acquisitionTotals.conversion_blocked_consent) ? "warning" : "success"}/>
      </div>
      <div className="mt-6 overflow-x-auto">
        <table className="min-w-[780px] w-full text-left text-sm">
          <thead><tr className="border-b border-gray-200 text-xs uppercase tracking-wide text-gray-400 dark:border-gray-800"><th className="px-3 py-3">Источник / кампания</th><th className="px-3 py-3">Medium</th><th className="px-3 py-3 text-right">Лиды</th><th className="px-3 py-3 text-right">Qualified</th><th className="px-3 py-3 text-right">Won</th><th className="px-3 py-3 text-right">Live</th></tr></thead>
          <tbody>{campaignRows.map((row, index) => <tr key={`${row.source}-${row.campaign}-${index}`} className="border-b border-gray-100 last:border-0 dark:border-gray-800"><td className="px-3 py-4"><strong className="block text-gray-800 dark:text-white/90">{sourceName(row.source)}</strong><span className="text-xs text-gray-400">{row.campaign || "Без названия кампании"}</span></td><td className="px-3 py-4 text-gray-500">{row.medium || "—"}</td><td className="px-3 py-4 text-right font-semibold">{number(row.leads)}</td><td className="px-3 py-4 text-right">{number(row.qualified)}</td><td className="px-3 py-4 text-right">{number(row.won)}</td><td className="px-3 py-4 text-right">{number(row.live)}</td></tr>)}{!campaignRows.length && <tr><td colSpan={6} className="py-8"><EmptyState title="Платных или партнёрских лидов пока нет" description="После первого реального клика с UTM/click ID здесь появится его путь до результата."/></td></tr>}</tbody>
        </table>
      </div>
    </Panel>

    <div className="mt-6 grid grid-cols-1 gap-6 xl:grid-cols-3">
      <Panel>
        <h2 className="text-lg font-semibold text-gray-900 dark:text-white">Referrer</h2>
        <p className="mt-1 text-sm text-gray-500">Откуда пришёл визит по данным Vercel.</p>
        <div className="mt-6"><BarList rows={referrers} valueKey="visitors" empty="Источники посещений ещё не зафиксированы."/></div>
      </Panel>
      <Panel>
        <h2 className="text-lg font-semibold text-gray-900 dark:text-white">Посадочные страницы</h2>
        <p className="mt-1 text-sm text-gray-500">Какие URL получают входящий трафик.</p>
        <div className="mt-6 space-y-3">{(traffic?.paths || []).map((row, index) => <div key={`${row.key}-${index}`} className="flex items-center justify-between rounded-xl border border-gray-200 px-4 py-3 dark:border-gray-800"><code className="text-sm text-gray-700 dark:text-gray-300">{row.key || "/"}</code><strong className="text-sm text-gray-900 dark:text-white">{number(row.pageviews)}</strong></div>)}{!(traffic?.paths || []).length && <EmptyState title="Страниц пока нет" description={liveTrafficError ? "Живой источник Vercel недоступен." : "Данные появятся после посещений."}/>}</div>
      </Panel>
      <Panel>
        <h2 className="text-lg font-semibold text-gray-900 dark:text-white">Спрос по GEO</h2>
        <p className="mt-1 text-sm text-gray-500">Целевые рынки из реальных заявок мерчей.</p>
        <div className="mt-6"><BarList rows={attribution.geo_demand || []} valueKey="leads" empty="В заявках пока нет нормализованных target GEO."/></div>
      </Panel>
    </div>

    <Panel className="mt-6">
      <div className="flex flex-col gap-2 sm:flex-row sm:items-start sm:justify-between"><div><h2 className="text-lg font-semibold text-gray-900 dark:text-white">Последние рабочие заявки и атрибуция</h2><p className="mt-1 text-sm text-gray-500">Тестовые fixtures и спам исключены. «Не определён» означает старую заявку без сохранённого источника.</p></div><span className="text-xs text-gray-400">{totalLeads} рабочих заявок</span></div>
      <div className="mt-5 overflow-x-auto"><table className="min-w-[900px] w-full text-left text-sm"><thead><tr className="border-b border-gray-200 text-xs uppercase tracking-wide text-gray-400 dark:border-gray-800"><th className="px-3 py-3">Компания</th><th className="px-3 py-3">Дата</th><th className="px-3 py-3">Источник</th><th className="px-3 py-3">UTM</th><th className="px-3 py-3">Landing</th></tr></thead><tbody>{recent.map((lead) => <tr key={lead.lead_id} className="border-b border-gray-100 last:border-0 dark:border-gray-800"><td className="px-3 py-4"><Link to={`/merchants/${lead.lead_id}`} className="font-semibold text-gray-900 hover:text-brand-500 dark:text-white">{lead.company || "Без названия"}</Link></td><td className="px-3 py-4 text-gray-500">{dateTime(lead.submitted_at)}</td><td className="px-3 py-4"><strong className="block text-gray-700 dark:text-gray-300">{sourceName(lead.source_platform || lead.utm_source || lead.source_referrer)}</strong><span className="text-xs text-gray-400">{lead.source_category || "—"}</span></td><td className="px-3 py-4 text-gray-500">{lead.utm_source || "—"}{lead.utm_campaign ? ` · ${lead.utm_campaign}` : ""}</td><td className="px-3 py-4"><code className="text-xs text-gray-500">{lead.landing_path || "—"}</code></td></tr>)}{!recent.length && <tr><td colSpan={5} className="py-8"><EmptyState title="Заявок нет" description="Атрибуция появится после первой рабочей заявки."/></td></tr>}</tbody></table></div>
    </Panel>

    <div className="mt-6 grid grid-cols-1 gap-6 xl:grid-cols-3">
      <Panel className="xl:col-span-2">
        <div className="flex flex-col gap-2 sm:flex-row sm:items-start sm:justify-between"><div><h2 className="text-lg font-semibold text-gray-900 dark:text-white">Последний технический аудит</h2><p className="mt-1 text-sm text-gray-500">SiteOne Crawler {audit.tool_version || ""} проверил production-сайт {dateTime(audit.audited_at)}. Каждый запуск создаёт новый результат и сохраняет историю.</p></div><a href={audit.target_url || "https://offerpsp.com/"} target="_blank" rel="noreferrer" className="text-sm font-semibold text-brand-500">Открыть сайт ↗</a></div>
        <div className="mt-6 grid grid-cols-2 gap-3 sm:grid-cols-5">{categoryScores.map(([label, score]) => <div key={label} className="rounded-xl bg-gray-50 p-4 dark:bg-white/[0.03]"><span className="block text-xs text-gray-400">{{ performance: "Скорость", seo: "SEO", security: "Защита", accessibility: "Доступность", best_practices: "Практики" }[label] || label}</span><strong className={`mt-2 block text-2xl ${score >= 9 ? "text-success-600 dark:text-success-400" : score >= 8 ? "text-warning-600" : "text-error-600"}`}>{score.toFixed(1)}</strong></div>)}</div>
        {geoSignals && <div className="mt-6">
          <div className="flex items-end justify-between gap-4"><div><h3 className="text-sm font-semibold text-gray-900 dark:text-white">GEO readiness</h3><p className="mt-1 text-xs text-gray-500">Проверяемые сигналы доступности для AI‑поиска и answer engines.</p></div><span className="text-xs text-gray-400">{dateTime(geoSignals.checked_at)}</span></div>
          <div className="mt-3 grid grid-cols-2 gap-3 sm:grid-cols-4">
            {[
              ["AI‑краулеры", geoSignals.robots_txt?.ai_crawlers_allowed, "robots.txt"],
              ["llms.txt", geoSignals.llms_txt?.ok, `${number(geoSignals.llms_txt?.bytes)} байт`],
              ["Sitemap", geoSignals.sitemap?.ok, `HTTP ${number(geoSignals.sitemap?.status) || "—"}`],
              ["Structured data", geoSignals.structured_data?.ok, `${number(geoSignals.structured_data?.blocks)} JSON‑LD`],
            ].map(([label, ok, hint]) => <div key={String(label)} className="rounded-xl border border-gray-200 p-3 dark:border-gray-800"><span className="block text-xs text-gray-400">{label}</span><strong className={`mt-1 block text-sm ${ok ? "text-success-600 dark:text-success-400" : "text-error-600"}`}>{ok ? "Доступно" : "Проблема"}</strong><span className="mt-1 block text-xs text-gray-400">{hint}</span></div>)}
          </div>
        </div>}
        <div className="mt-6 divide-y divide-gray-100 dark:divide-gray-800">{issues.map((issue) => <div key={issue.code} className="flex flex-col gap-3 py-4 first:pt-0 sm:flex-row sm:items-start"><span className={`w-fit shrink-0 rounded-full px-2.5 py-1 text-xs font-semibold ${issue.severity === "critical" ? "bg-error-50 text-error-700 dark:bg-error-500/10 dark:text-error-300" : issue.severity === "warning" ? "bg-warning-50 text-warning-700 dark:bg-warning-500/10 dark:text-warning-300" : "bg-gray-100 text-gray-600 dark:bg-white/5 dark:text-gray-300"}`}>{issue.severity === "critical" ? "Критично" : issue.severity === "warning" ? "Предупреждение" : "Замечание"} · {issue.count}</span><div><strong className="text-sm text-gray-900 dark:text-white">{issue.title}</strong><p className="mt-1 text-sm text-gray-500">{issue.action}</p></div></div>)}</div>
      </Panel>
      <Panel>
        <h2 className="text-lg font-semibold text-gray-900 dark:text-white">Достоверность данных</h2>
        <div className="mt-5 space-y-4">
          <div className="rounded-xl bg-success-50 p-4 text-sm text-success-800 dark:bg-success-500/10 dark:text-success-300"><strong>Lead attribution работает</strong><p className="mt-1 text-xs">Новые формы сохраняют AI‑платформу, referrer, first/last touch и UTM в нашей базе.</p></div>
          <div className="rounded-xl bg-success-50 p-4 text-sm text-success-800 dark:bg-success-500/10 dark:text-success-300"><strong>Живой crawler подключён</strong><p className="mt-1 text-xs">SiteOne Crawler запускается вручную этой страницей и по расписанию, затем сохраняет новый проверяемый аудит.</p></div>
          {auditRun.status === "failed" && <div className="rounded-xl bg-error-50 p-4 text-sm text-error-800 dark:bg-error-500/10 dark:text-error-300"><strong>Последний запуск завершился ошибкой</strong><p className="mt-1 text-xs">{auditRun.error_message || "Повторите запуск или проверьте runtime-логи модуля."}</p></div>}
          <div className={`rounded-xl p-4 text-sm ${traffic ? "bg-success-50 text-success-800 dark:bg-success-500/10 dark:text-success-300" : "bg-error-50 text-error-800 dark:bg-error-500/10 dark:text-error-300"}`}><strong>{traffic ? "Живой трафик подключён" : "Живой трафик недоступен"}</strong><p className="mt-1 text-xs">{traffic ? `Прямой запрос к Vercel выполнен ${dateTime(traffic.fetched_at)}. Архивные данные не участвуют.` : "Текущие показатели скрыты: подмена историей запрещена."}</p></div>
          <div className="rounded-xl border border-gray-200 p-4 dark:border-gray-800"><span className="block text-xs text-gray-400">Технический аудит</span><strong className="mt-1 block text-sm text-gray-800 dark:text-white/90">{dateTime(audit.audited_at)}</strong></div>
        </div>
      </Panel>
    </div>

    <Panel className="mt-6">
      <div className="flex flex-col gap-2 sm:flex-row sm:items-start sm:justify-between">
        <div>
          <div className="flex flex-wrap items-center gap-2"><h2 className="text-lg font-semibold text-gray-900 dark:text-white">Наш SEO/GEO‑агент</h2>{agent.status === "completed" && <span className="rounded-full bg-success-50 px-2.5 py-1 text-xs font-semibold text-success-700 dark:bg-success-500/10 dark:text-success-300">Read-only · готов</span>}</div>
          <p className="mt-1 text-sm text-gray-500">Интерпретирует факты SiteOne и содержимое публичных страниц. Его рекомендации не меняют объективный технический балл.</p>
        </div>
        <span className="text-xs text-gray-400">{agent.model ? `${agent.model} · ${dateTime(agent.generated_at)}` : "Отдельный AI-контур"}</span>
      </div>

      {agent.status === "completed" ? <>
        <div className="mt-5 rounded-xl border border-brand-100 bg-brand-50/60 p-5 dark:border-brand-500/20 dark:bg-brand-500/10">
          <span className="text-xs font-semibold uppercase tracking-wide text-brand-600 dark:text-brand-300">Вывод агента · уверенность {{ high: "высокая", medium: "средняя", low: "низкая" }[agent.confidence || "medium"]}</span>
          <p className="mt-2 text-sm leading-6 text-gray-700 dark:text-gray-300">{agent.executive_summary}</p>
        </div>
        <div className="mt-5 grid grid-cols-1 gap-4 lg:grid-cols-2 xl:grid-cols-3">
          {agentPriorities.map((item, index) => <div key={`${item.priority}-${item.title}-${index}`} className="rounded-xl border border-gray-200 p-4 dark:border-gray-800">
            <div className="flex items-center justify-between gap-3"><span className={`rounded-full px-2.5 py-1 text-xs font-semibold ${item.priority === "P0" ? "bg-error-50 text-error-700 dark:bg-error-500/10 dark:text-error-300" : item.priority === "P1" ? "bg-warning-50 text-warning-700 dark:bg-warning-500/10 dark:text-warning-300" : "bg-gray-100 text-gray-600 dark:bg-white/5 dark:text-gray-300"}`}>{item.priority}</span><span className="text-xs text-gray-400">{item.area}</span></div>
            <strong className="mt-3 block text-sm text-gray-900 dark:text-white">{item.title}</strong>
            <p className="mt-2 text-xs leading-5 text-gray-500"><span className="font-semibold text-gray-600 dark:text-gray-400">Основание:</span> {item.evidence}</p>
            <p className="mt-2 text-sm leading-5 text-gray-700 dark:text-gray-300">{item.recommendation}</p>
          </div>)}
        </div>
        {!!agent.quick_wins?.length && <div className="mt-5 rounded-xl bg-gray-50 p-4 dark:bg-white/[0.03]"><h3 className="text-sm font-semibold text-gray-900 dark:text-white">Быстрые улучшения</h3><ul className="mt-3 grid grid-cols-1 gap-2 text-sm text-gray-600 dark:text-gray-300 md:grid-cols-2">{agent.quick_wins.map((item, index) => <li key={`${item}-${index}`} className="flex gap-2"><span className="text-success-500">✓</span><span>{item}</span></li>)}</ul></div>}
      </> : agent.status === "failed" ? <div className="mt-5 rounded-xl bg-error-50 p-4 text-sm text-error-800 dark:bg-error-500/10 dark:text-error-300"><strong>SiteOne завершил crawl, но AI-анализ не получен</strong><p className="mt-1 text-xs">{agent.error_message || "Повторите полный аудит или проверьте SEO/GEO workflow."}</p></div> : <EmptyState title="AI-анализ ещё не запускался" description="Нажмите «Запустить полный аудит»: сначала SiteOne соберёт факты, затем отдельный агент подготовит рекомендации."/>}
    </Panel>

    <details className="mt-6 rounded-2xl border border-gray-200 bg-white shadow-theme-xs dark:border-[#34435a] dark:bg-[#202d42]">
      <summary className="cursor-pointer px-5 py-4 text-sm font-semibold text-gray-900 dark:text-white">История SEO/GEO · {trafficHistory.length} архивных записей трафика, {auditHistory.length} аудитов</summary>
      <div className="border-t border-gray-100 px-5 py-4 dark:border-gray-800">
        <p className="mb-4 text-sm text-gray-500">Архив только для аналитики. Эти значения никогда не подставляются в текущие показатели.</p>
        <div className="space-y-2">{trafficHistory.map((snapshot, index) => <div key={`${snapshot.captured_at}-${index}`} className="flex flex-wrap items-center justify-between gap-3 rounded-xl border border-gray-200 px-4 py-3 text-sm dark:border-gray-800"><span className="text-gray-500">{dateTime(snapshot.captured_at)} · {shortDate(snapshot.period_start)} — {shortDate(snapshot.period_end)}</span><strong className="text-gray-900 dark:text-white">{number(snapshot.visitors)} посетителей · {number(snapshot.pageviews)} просмотров</strong></div>)}{!trafficHistory.length && <EmptyState title="История пуста" description="Архивных записей SEO/GEO нет."/>}</div>
      </div>
    </details>
  </>;
}
