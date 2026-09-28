import { useEffect, useMemo, useRef, useState } from "react";
import { useLocation, useNavigate } from "react-router";
import { platformModules } from "../config/modules";
import { ThemeToggleButton } from "../components/common/ThemeToggleButton";
import { useControlBridge } from "../context/ControlBridgeContext";
import { useSidebar } from "../context/SidebarContext";
import { isQaFixtureLead, isQaFixtureLeadId, isQaFixturePath, isQaFixtureProvider, isQaFixtureRoute } from "../lib/qaFixtures";
import { readRecentPaths, rememberPath } from "../lib/uiPreferences";
import { supabase } from "../lib/supabase";

type HeaderSearchResult = {
  key: string;
  label: string;
  meta: string;
  path: string;
};

const quickActions: HeaderSearchResult[] = [
  { key: "action:new-provider", label: "Добавить PSP", meta: "Быстрое действие", path: "/psps/new" },
  { key: "action:compose", label: "Написать письмо", meta: "Радиорубка", path: "/communications?compose=1" },
  { key: "action:new-offer", label: "Принять новый оффер", meta: "Офферы", path: "/offers?workspace=intake" },
];

export default function AppHeader() {
  const { isExpanded, isMobileOpen, toggleSidebar, toggleMobileSidebar } = useSidebar();
  const { staff, user, signOut, leads, providers, routes, complianceCases } = useControlBridge();
  const location = useLocation();
  const navigate = useNavigate();
  const inputRef = useRef<HTMLInputElement>(null);
  const [menuOpen, setMenuOpen] = useState(false);
  const [paletteOpen, setPaletteOpen] = useState(false);
  const [selectedIndex, setSelectedIndex] = useState(0);
  const [recentPaths, setRecentPaths] = useState<string[]>(readRecentPaths);
  const [query, setQuery] = useState("");
  const [remoteSearchResults, setRemoteSearchResults] = useState<HeaderSearchResult[]>([]);
  const activeModule = platformModules.find((item) => item.path === "/" ? location.pathname === "/" : location.pathname.startsWith(item.path));
  const attentionLeadIds = new Set(complianceCases.filter((item) => !isQaFixtureLeadId(item.lead_id) && ["pending", "screening", "manual_review", "needs_info", "hold"].includes(item.case_status)).map((item) => item.lead_id));
  const attentionCount = leads.filter((lead) => !isQaFixtureLead(lead) && (["new", "needs_clarification", "provider_needs_info"].includes(lead.status || "") || attentionLeadIds.has(lead.lead_id))).length;
  useEffect(() => {
    rememberPath(`${location.pathname}${location.search}`);
    setRecentPaths(readRecentPaths());
  }, [location.pathname, location.search]);
  const localSearchResults = useMemo<HeaderSearchResult[]>(() => {
    const needle = query.trim().toLowerCase();
    if (!needle) return [];
    const moduleResults = platformModules.filter((item) => item.enabled && `${item.label} ${item.shortLabel}`.toLowerCase().includes(needle)).map((item) => ({ key: `module:${item.id}`, label: item.label, meta: "Раздел", path: item.path }));
    const merchantResults = leads.filter((item) => !isQaFixtureLead(item) && item.record_state !== "archived" && [item.company, item.name, item.work_email, item.telegram, item.company_url].join(" ").toLowerCase().includes(needle)).map((item) => ({ key: `merchant:${item.lead_id}`, label: item.company || item.name || "Без названия", meta: `Мерч · ${item.status || "без статуса"}`, path: `/merchants/${item.lead_id}` }));
    const providerResults = providers.filter((item) => !isQaFixtureProvider(item) && item.record_state !== "archived" && [item.brand_name, item.legal_name, item.internal_code, item.website].join(" ").toLowerCase().includes(needle)).map((item) => ({ key: `provider:${item.id}`, label: item.brand_name, meta: `PSP · ${item.relationship_status || "без статуса"}`, path: `/psps/${item.id}` }));
    const routeResults = routes.filter((item) => !isQaFixtureRoute(item) && item.status !== "archived" && [item.client_title, item.route_code, item.provider_name, item.provider_code, ...(item.geos || []), ...(item.currencies || []), ...(item.methods || [])].join(" ").toLowerCase().includes(needle)).map((item) => ({ key: `route:${item.route_id}`, label: item.client_title || item.route_code || "Маршрут", meta: `Оффер · ${item.provider_name || item.provider_code || "PSP"}`, path: `/psps/${item.provider_id}?route=${item.route_id}` }));
    const actionResults = quickActions.filter((item) => `${item.label} ${item.meta}`.toLowerCase().includes(needle));
    return [...actionResults, ...moduleResults, ...merchantResults, ...providerResults, ...routeResults].slice(0, 14);
  }, [leads, providers, routes, query]);

  const searchResults = useMemo(() => {
    if (!query.trim()) {
      const recent = recentPaths.map((path) => {
        const module = platformModules.find((item) => item.path === "/" ? path === "/" : path.startsWith(item.path));
        return { key: `recent:${path}`, label: module?.label || path, meta: "Недавнее", path };
      });
      return [...quickActions, ...recent].filter((item, index, items) => items.findIndex((candidate) => candidate.path === item.path) === index).slice(0, 10);
    }
    const merged = [...remoteSearchResults, ...localSearchResults];
    return merged.filter((item, index) => merged.findIndex((candidate) => candidate.path === item.path) === index).slice(0, 14);
  }, [localSearchResults, query, recentPaths, remoteSearchResults]);

  useEffect(() => {
    const term = query.trim();
    if (term.length < 2) {
      setRemoteSearchResults([]);
      return;
    }
    setRemoteSearchResults([]);
    const controller = new AbortController();
    const timeout = window.setTimeout(async () => {
      try {
        const { data } = await supabase.auth.getSession();
        const token = data.session?.access_token;
        if (!token) return;
        const response = await fetch(`/api/unified-search?q=${encodeURIComponent(term)}&limit=10`, {
          headers: { authorization: `Bearer ${token}` },
          signal: controller.signal,
        });
        if (!response.ok) return;
        const payload = await response.json();
        if (payload?.source !== "meilisearch" || !Array.isArray(payload.results)) {
          setRemoteSearchResults([]);
          return;
        }
        setRemoteSearchResults(payload.results.map((item: Record<string, unknown>) => ({
          key: String(item.id || item.path || item.label || "result"),
          label: String(item.label || "Без названия"),
          meta: String(item.meta || item.kind || "Результат"),
          path: String(item.path || "/"),
        })).filter((item: HeaderSearchResult) => !isQaFixturePath(item.path)));
      } catch (error) {
        if (!(error instanceof DOMException && error.name === "AbortError")) {
          console.warn("Remote search unavailable; using local index", error);
        }
      }
    }, 180);
    return () => {
      window.clearTimeout(timeout);
      controller.abort();
    };
  }, [query]);

  useEffect(() => {
    const handler = (event: KeyboardEvent) => {
      if ((event.metaKey || event.ctrlKey) && event.key === "k") {
        event.preventDefault();
        setPaletteOpen(true);
        window.setTimeout(() => inputRef.current?.focus(), 0);
        return;
      }
      if (!paletteOpen) return;
      if (event.key === "Escape") { event.preventDefault(); setPaletteOpen(false); setQuery(""); }
      if (event.key === "ArrowDown") { event.preventDefault(); setSelectedIndex((current) => Math.min(current + 1, Math.max(0, searchResults.length - 1))); }
      if (event.key === "ArrowUp") { event.preventDefault(); setSelectedIndex((current) => Math.max(current - 1, 0)); }
      if (event.key === "Enter" && searchResults[selectedIndex]) { event.preventDefault(); navigate(searchResults[selectedIndex].path); setPaletteOpen(false); setQuery(""); }
    };
    document.addEventListener("keydown", handler);
    return () => document.removeEventListener("keydown", handler);
  }, [navigate, paletteOpen, searchResults, selectedIndex]);

  useEffect(() => setSelectedIndex(0), [query]);

  return <><header className="sticky top-0 z-40 flex min-h-14 w-full border-b border-gray-200 bg-white dark:border-[#34435a] dark:bg-[#1c283b]">
    <div className="flex w-full items-center justify-between gap-3 px-3 py-2 sm:px-5 lg:px-6">
      <div className="flex min-w-0 items-center gap-2.5">
        <button onClick={() => window.innerWidth >= 1024 ? toggleSidebar() : toggleMobileSidebar()} aria-label={isMobileOpen ? "Закрыть меню" : isExpanded ? "Свернуть боковую панель" : "Развернуть боковую панель"} title={isMobileOpen ? "Закрыть меню" : isExpanded ? "Свернуть боковую панель" : "Развернуть боковую панель"} className="flex h-9 shrink-0 items-center justify-center gap-1.5 rounded-lg border border-gray-300 bg-gray-50 px-2.5 text-xs font-semibold text-gray-700 shadow-sm transition hover:border-brand-300 hover:bg-brand-50 hover:text-brand-600 dark:border-gray-700 dark:bg-white/5 dark:text-gray-200 dark:hover:border-brand-700 dark:hover:bg-brand-500/10">
          <span aria-hidden="true" className="text-lg leading-none">{isMobileOpen ? "×" : isExpanded ? "‹" : "›"}</span>
          <span className="hidden xl:inline">{isMobileOpen ? "Закрыть" : isExpanded ? "Свернуть панель" : "Развернуть панель"}</span>
        </button>
        <div className="hidden min-w-0 sm:block"><strong className="block truncate text-sm font-semibold text-gray-800 dark:text-white/90">{activeModule?.label || "Рабочая область"}</strong></div>
      </div>
      <div className="hidden flex-1 lg:block"><button onClick={()=>{setPaletteOpen(true);window.setTimeout(()=>inputRef.current?.focus(),0);}} className="mx-auto flex h-9 w-full max-w-xl items-center rounded-lg border border-gray-200 bg-gray-50/70 px-3 text-left text-sm text-gray-400 transition hover:border-brand-300 hover:bg-white dark:border-gray-800 dark:bg-white/[0.03]"><span className="mr-2">⌕</span><span className="flex-1">Мерч, PSP, оффер, раздел или действие…</span><span className="rounded border border-gray-200 px-1.5 py-0.5 text-[9px] dark:border-gray-700">⌘K</span></button></div>
      <div className="flex shrink-0 items-center gap-1.5"><button onClick={()=>{setPaletteOpen(true);window.setTimeout(()=>inputRef.current?.focus(),0);}} aria-label="Поиск и команды" className="flex h-9 w-9 items-center justify-center rounded-full border border-gray-200 text-gray-600 dark:border-gray-800 dark:text-gray-300 lg:hidden">⌕</button><button onClick={()=>navigate("/")} title="Требует внимания" className="relative flex h-9 min-w-9 items-center justify-center rounded-full border border-gray-200 px-2.5 text-xs text-gray-600 dark:border-gray-800 dark:text-gray-300"><span className="mr-1">⚡</span>{attentionCount > 0 && <strong>{attentionCount}</strong>}</button><ThemeToggleButton/><div className="relative"><button onClick={()=>setMenuOpen(!menuOpen)} className="flex h-9 items-center gap-2 rounded-lg border border-gray-200 px-1.5 dark:border-gray-800"><span className="flex h-7 w-7 items-center justify-center rounded-md bg-gradient-to-br from-brand-500 to-theme-purple-500 text-[11px] font-bold text-white">{(staff?.display_name || user?.email || "B").slice(0,1).toUpperCase()}</span><span className="hidden text-left md:block"><strong className="block max-w-24 truncate text-[11px] text-gray-800 dark:text-white">{staff?.display_name || user?.email?.split("@")[0] || "Boris"}</strong><small className="block text-[9px] text-gray-400">{staff?.role || "staff"}</small></span></button>{menuOpen && <div className="absolute right-0 mt-2 w-56 rounded-xl border border-gray-200 bg-white p-2 shadow-theme-lg dark:border-gray-800 dark:bg-gray-900"><div className="border-b border-gray-100 px-3 py-2 dark:border-gray-800"><span className="block truncate text-xs text-gray-500">{user?.email}</span></div><button onClick={()=>void signOut()} className="mt-1 w-full rounded-lg px-3 py-2 text-left text-sm text-gray-600 hover:bg-gray-100 dark:text-gray-300 dark:hover:bg-white/5">Выйти</button></div>}</div></div>
    </div>
  </header>
  {paletteOpen && <div className="fixed inset-0 z-[100] flex items-start justify-center bg-gray-950/45 px-3 pt-[8vh] backdrop-blur-sm" onMouseDown={(event)=>{if(event.target===event.currentTarget){setPaletteOpen(false);setQuery("");}}}><div role="dialog" aria-modal="true" aria-label="Поиск и команды" className="w-full max-w-2xl overflow-hidden rounded-2xl border border-gray-200 bg-white shadow-2xl dark:border-gray-700 dark:bg-gray-900"><div className="flex items-center gap-3 border-b border-gray-100 px-4 dark:border-gray-800"><span className="text-xl text-gray-400">⌕</span><input ref={inputRef} autoFocus value={query} onChange={(event)=>setQuery(event.target.value)} placeholder="Найти запись, открыть раздел или выполнить действие…" className="h-14 flex-1 bg-transparent text-base text-gray-900 outline-none placeholder:text-gray-400 dark:text-white"/><button onClick={()=>{setPaletteOpen(false);setQuery("");}} className="rounded-md border border-gray-200 px-2 py-1 text-xs text-gray-400 dark:border-gray-700">Esc</button></div><div className="max-h-[62vh] overflow-y-auto p-2"><p className="px-3 pb-2 pt-1 text-[10px] font-semibold uppercase tracking-[0.16em] text-gray-400">{query.trim()?"Результаты":"Быстрые действия и недавнее"}</p>{searchResults.length?searchResults.map((result,index)=><button key={result.key} onMouseEnter={()=>setSelectedIndex(index)} onClick={()=>{navigate(result.path);setPaletteOpen(false);setQuery("");}} className={`flex w-full items-center gap-3 rounded-xl px-3 py-3 text-left transition ${selectedIndex===index?"bg-brand-50 dark:bg-brand-500/10":"hover:bg-gray-50 dark:hover:bg-white/5"}`}><span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-gray-100 text-xs font-bold text-gray-600 dark:bg-white/5 dark:text-gray-300">{result.meta==="Раздел"?"↗":result.meta==="Недавнее"?"↺":"⌕"}</span><span className="min-w-0 flex-1"><strong className="block truncate text-sm text-gray-900 dark:text-white">{result.label}</strong><small className="mt-0.5 block truncate text-xs text-gray-400">{result.meta}</small></span><span className="text-xs text-gray-300">↵</span></button>):<p className="px-4 py-10 text-center text-sm text-gray-500">Ничего не найдено</p>}</div><div className="flex items-center justify-between border-t border-gray-100 px-4 py-2 text-[10px] text-gray-400 dark:border-gray-800"><span>↑↓ выбрать · Enter открыть · Esc закрыть</span><span>Глобальный поиск OfferPSP</span></div></div></div>}
  </>;
}
