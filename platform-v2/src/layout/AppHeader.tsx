import { useEffect, useMemo, useRef, useState } from "react";
import { Link, useLocation, useNavigate } from "react-router";
import { platformModules } from "../config/modules";
import { ThemeToggleButton } from "../components/common/ThemeToggleButton";
import { useControlBridge } from "../context/ControlBridgeContext";
import { useSidebar } from "../context/SidebarContext";
import { supabase } from "../lib/supabase";
import { captureProductEvent } from "../lib/analytics";

type HeaderSearchResult = {
  key: string;
  label: string;
  meta: string;
  path: string;
};

export default function AppHeader() {
  const { isMobileOpen, toggleSidebar, toggleMobileSidebar } = useSidebar();
  const { staff, user, signOut, leads, providers, routes, complianceCases } = useControlBridge();
  const location = useLocation();
  const navigate = useNavigate();
  const inputRef = useRef<HTMLInputElement>(null);
  const mobileInputRef = useRef<HTMLInputElement>(null);
  const [menuOpen, setMenuOpen] = useState(false);
  const [mobileSearchOpen, setMobileSearchOpen] = useState(false);
  const [query, setQuery] = useState("");
  const [remoteSearchResults, setRemoteSearchResults] = useState<HeaderSearchResult[]>([]);
  const activeModule = platformModules.find((item) => item.path === "/" ? location.pathname === "/" : location.pathname.startsWith(item.path));
  const attentionLeadIds = new Set(complianceCases.filter((item) => ["pending", "screening", "manual_review", "needs_info", "hold"].includes(item.case_status)).map((item) => item.lead_id));
  const attentionCount = leads.filter((lead) => ["new", "needs_clarification", "provider_needs_info"].includes(lead.status || "") || attentionLeadIds.has(lead.lead_id)).length + routes.filter((route) => Number(route.open_error_count || 0) > 0).length;
  const localSearchResults = useMemo<HeaderSearchResult[]>(() => {
    const needle = query.trim().toLowerCase();
    if (!needle) return [];
    const merchantResults = leads.filter((item) => [item.company, item.name, item.work_email, item.telegram, item.company_url].join(" ").toLowerCase().includes(needle)).map((item) => ({ key: `merchant:${item.lead_id}`, label: item.company || item.name || "Без названия", meta: `Мерч · ${item.status || "без статуса"}`, path: `/merchants/${item.lead_id}` }));
    const providerResults = providers.filter((item) => [item.brand_name, item.legal_name, item.internal_code, item.website].join(" ").toLowerCase().includes(needle)).map((item) => ({ key: `provider:${item.id}`, label: item.brand_name, meta: `PSP · ${item.relationship_status || "без статуса"}`, path: `/psps/${item.id}` }));
    const routeResults = routes.filter((item) => [item.client_title, item.route_code, item.provider_name, item.provider_code, ...(item.geos || []), ...(item.currencies || []), ...(item.methods || [])].join(" ").toLowerCase().includes(needle)).map((item) => ({ key: `route:${item.route_id}`, label: item.client_title || item.route_code || "Маршрут", meta: `Оффер · ${item.provider_name || item.provider_code || "PSP"}`, path: `/psps/${item.provider_id}?route=${item.route_id}` }));
    return [...merchantResults, ...providerResults, ...routeResults].slice(0, 10);
  }, [leads, providers, routes, query]);

  const searchResults = useMemo(() => {
    const merged = [...remoteSearchResults, ...localSearchResults];
    return merged.filter((item, index) => merged.findIndex((candidate) => candidate.path === item.path) === index).slice(0, 10);
  }, [localSearchResults, remoteSearchResults]);

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
        captureProductEvent("control_bridge_search_used", {
          source: "meilisearch",
          result_count: payload.results.length,
        });
        setRemoteSearchResults(payload.results.map((item: Record<string, unknown>) => ({
          key: String(item.id || item.path || item.label || "result"),
          label: String(item.label || "Без названия"),
          meta: String(item.meta || item.kind || "Результат"),
          path: String(item.path || "/"),
        })));
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
        if (window.innerWidth < 1024) {
          setMobileSearchOpen(true);
          window.setTimeout(() => mobileInputRef.current?.focus(), 0);
        } else {
          inputRef.current?.focus();
        }
      }
    };
    document.addEventListener("keydown", handler);
    return () => document.removeEventListener("keydown", handler);
  }, []);

  return <header className="sticky top-0 z-40 flex w-full border-b border-gray-200 bg-white dark:border-gray-800 dark:bg-gray-900">
    <div className="flex w-full items-center justify-between gap-3 px-4 py-3 lg:px-6">
      <div className="flex min-w-0 items-center gap-3">
        <button onClick={() => window.innerWidth >= 1024 ? toggleSidebar() : toggleMobileSidebar()} aria-label="Открыть меню" className="flex h-11 w-11 shrink-0 items-center justify-center rounded-lg border border-gray-200 text-gray-500 dark:border-gray-800 dark:text-gray-400">{isMobileOpen ? "×" : "☰"}</button>
        <div className="hidden min-w-0 sm:block"><span className="block truncate text-xs text-gray-400">OfferPSP / {activeModule?.label || "Workspace"}</span><strong className="block truncate text-sm text-gray-800 dark:text-white/90">Captain's Bridge</strong></div>
      </div>
      <div className="hidden flex-1 lg:block"><div className="relative mx-auto max-w-xl"><span className="pointer-events-none absolute left-4 top-1/2 -translate-y-1/2 text-gray-400">⌕</span><input ref={inputRef} value={query} onChange={(event) => setQuery(event.target.value)} onKeyDown={(event) => { if (event.key === "Enter" && searchResults[0]) { navigate(searchResults[0].path); setQuery(""); } if (event.key === "Escape") setQuery(""); }} placeholder="Найти мерча, PSP, оффер или сделку…" className="h-11 w-full rounded-lg border border-gray-200 bg-transparent py-2 pl-10 pr-16 text-sm text-gray-800 outline-none focus:border-brand-400 dark:border-gray-800 dark:text-white"/><span className="absolute right-3 top-1/2 -translate-y-1/2 rounded border border-gray-200 px-1.5 py-0.5 text-[10px] text-gray-400 dark:border-gray-700">⌘K</span>{query.trim() && <div className="absolute left-0 right-0 top-12 z-50 rounded-xl border border-gray-200 bg-white p-2 shadow-theme-lg dark:border-gray-800 dark:bg-gray-900">{searchResults.length ? searchResults.map((result) => <Link key={result.key} to={result.path} onClick={() => setQuery("")} className="flex items-center justify-between rounded-lg px-3 py-2.5 hover:bg-gray-50 dark:hover:bg-white/5"><strong className="truncate text-sm text-gray-800 dark:text-white">{result.label}</strong><span className="ml-3 shrink-0 text-xs text-gray-400">{result.meta}</span></Link>) : <p className="px-3 py-4 text-center text-sm text-gray-500">Ничего не найдено</p>}</div>}</div></div>
      <div className="flex shrink-0 items-center gap-2"><button onClick={()=>{setMobileSearchOpen(!mobileSearchOpen); window.setTimeout(()=>mobileInputRef.current?.focus(),0);}} aria-label="Поиск" className="flex h-11 w-11 items-center justify-center rounded-full border border-gray-200 text-gray-600 dark:border-gray-800 dark:text-gray-300 lg:hidden">⌕</button><Link to="/" title="Требует внимания" className="relative flex h-11 min-w-11 items-center justify-center rounded-full border border-gray-200 px-3 text-sm text-gray-600 dark:border-gray-800 dark:text-gray-300"><span className="mr-1">⚡</span>{attentionCount > 0 && <strong>{attentionCount}</strong>}</Link><ThemeToggleButton/><div className="relative"><button onClick={()=>setMenuOpen(!menuOpen)} className="flex items-center gap-2 rounded-lg border border-gray-200 px-2 py-1.5 dark:border-gray-800"><span className="flex h-8 w-8 items-center justify-center rounded-lg bg-gradient-to-br from-brand-500 to-theme-purple-500 text-xs font-bold text-white">{(staff?.display_name || user?.email || "B").slice(0,1).toUpperCase()}</span><span className="hidden text-left md:block"><strong className="block max-w-28 truncate text-xs text-gray-800 dark:text-white">{staff?.display_name || user?.email?.split("@")[0] || "Boris"}</strong><small className="block text-[10px] text-gray-400">{staff?.role || "staff"}</small></span></button>{menuOpen && <div className="absolute right-0 mt-2 w-56 rounded-xl border border-gray-200 bg-white p-2 shadow-theme-lg dark:border-gray-800 dark:bg-gray-900"><div className="border-b border-gray-100 px-3 py-2 dark:border-gray-800"><span className="block truncate text-xs text-gray-500">{user?.email}</span></div><button onClick={()=>void signOut()} className="mt-1 w-full rounded-lg px-3 py-2 text-left text-sm text-gray-600 hover:bg-gray-100 dark:text-gray-300 dark:hover:bg-white/5">Выйти</button></div>}</div></div>
    </div>
    {mobileSearchOpen && <div className="absolute left-0 right-0 top-full border-b border-gray-200 bg-white p-3 shadow-theme-md dark:border-gray-800 dark:bg-gray-900 lg:hidden"><div className="relative"><input ref={mobileInputRef} value={query} onChange={(event)=>setQuery(event.target.value)} onKeyDown={(event)=>{if(event.key==="Enter"&&searchResults[0]){navigate(searchResults[0].path);setQuery("");setMobileSearchOpen(false);}if(event.key==="Escape"){setQuery("");setMobileSearchOpen(false);}}} placeholder="Мерч, PSP или оффер…" className="h-11 w-full rounded-lg border border-gray-200 px-4 pr-11 text-sm outline-none focus:border-brand-400 dark:border-gray-700 dark:bg-gray-900 dark:text-white"/><button onClick={()=>{setQuery("");setMobileSearchOpen(false);}} className="absolute right-2 top-1/2 h-8 w-8 -translate-y-1/2 text-gray-400">×</button></div>{query.trim()&&<div className="mt-2 max-h-72 overflow-y-auto rounded-xl border border-gray-200 p-2 dark:border-gray-800">{searchResults.length?searchResults.map((result)=><Link key={result.key} to={result.path} onClick={()=>{setQuery("");setMobileSearchOpen(false);}} className="flex items-center justify-between rounded-lg px-3 py-2.5 hover:bg-gray-50 dark:hover:bg-white/5"><strong className="truncate text-sm text-gray-800 dark:text-white">{result.label}</strong><span className="ml-3 shrink-0 text-xs text-gray-400">{result.meta}</span></Link>):<p className="px-3 py-4 text-center text-sm text-gray-500">Ничего не найдено</p>}</div>}</div>}
  </header>;
}
