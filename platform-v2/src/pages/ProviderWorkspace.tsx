import { useCallback, useEffect, useState } from "react";
import { Link, useNavigate, useParams, useSearchParams } from "react-router";
import PageMeta from "../components/common/PageMeta";
import { EmptyState, ErrorBanner, Panel, SkeletonPage, StatusPill } from "../components/control/Ui";
import { useControlBridge } from "../context/ControlBridgeContext";
import { supabase } from "../lib/supabase";
import { ActivityPanel, DocumentsPanel, useEntityWorkspace } from "../components/control/EntityWorkspace360";

type JsonRow = Record<string, string | number | null | undefined>;
type Provider = {
  id: string; internal_code?: string; brand_name: string; legal_name?: string; website?: string;
  relationship_status?: string; relationship_tier?: string; strategic_priority?: number;
  margin_included_default?: boolean; relationship_notes?: string; last_verified_at?: string;
};
type Contact = { id: string; full_name: string; role_title?: string; region?: string; telegram?: string; email?: string; phone?: string; preferred_channel?: string; active?: boolean; notes?: string };
type Margin = { id: string; route_id?: string | null; flow: string; mode: string; percent_value?: number | null; fixed_value?: number | null; fixed_currency?: string | null; active?: boolean; effective_to?: string | null };
type Route = {
  id: string; internal_code: string; client_title: string; status: string; batch_version?: number;
  flow: string; coverage_scope: string; geos?: string[]; blocked_geos?: string[]; currencies?: string[];
  methods?: string[]; traffic_types?: string[]; verticals?: string[]; integrations?: string[];
  min_monthly_volume?: number | null; max_monthly_volume?: number | null; volume_currency?: string | null;
  freshness_days?: number; effective_from?: string | null; expires_at?: string | null; operational_notes?: string | null;
  fees?: JsonRow[]; limits?: JsonRow[]; settlements?: JsonRow[]; anomalies?: Array<{ id: string; severity: string; status: string; message: string }>;
  open_error_count?: number; open_warning_count?: number; is_stale?: boolean;
};
type Workspace = { provider: Provider; contacts: Contact[]; margin_policies: Margin[]; routes: Route[]; batches: JsonRow[]; activity: JsonRow[] };
type MarginDraft = { route_id:string; flow:string; mode:string; percent_value:string; fixed_value:string; fixed_currency:string; notes:string };
type ProviderTab = "overview" | "profile" | "contacts" | "offers" | "pricing" | "documents" | "activity";

const providerTabs: Array<{ id: ProviderTab; label: string }> = [
  { id: "overview", label: "Обзор" },
  { id: "profile", label: "Профиль" },
  { id: "contacts", label: "Контакты" },
  { id: "offers", label: "Офферы" },
  { id: "pricing", label: "Маржа" },
  { id: "documents", label: "Документы" },
  { id: "activity", label: "История" },
];
const providerTabIds = new Set<ProviderTab>(providerTabs.map((item) => item.id));

const fieldClass = "h-11 w-full rounded-lg border border-gray-300 bg-transparent px-3 text-sm text-gray-800 outline-none focus:border-brand-400 dark:border-gray-700 dark:text-white";
const areaClass = "min-h-24 w-full rounded-lg border border-gray-300 bg-transparent px-3 py-2 text-sm text-gray-800 outline-none focus:border-brand-400 dark:border-gray-700 dark:text-white";
const split = (value: string) => value.split(",").map((item) => item.trim()).filter(Boolean);
const csv = (value: unknown) => Array.isArray(value) ? value.join(", ") : "";
const optionalNumber = (value: string) => value.trim() === "" ? null : Number(value);

export default function ProviderWorkspace() {
  const { providerId } = useParams();
  const isNew = providerId === "new";
  const navigate = useNavigate();
  const [params, setParams] = useSearchParams();
  const { refresh: refreshBridge } = useControlBridge();
  const [workspace, setWorkspace] = useState<Workspace | null>(null);
  const [loading, setLoading] = useState(!isNew);
  const [busy, setBusy] = useState<string | null>(null);
  const [message, setMessage] = useState<{ tone: "success" | "error"; text: string } | null>(null);
  const requestedTab = params.get("tab") as ProviderTab | null;
  const [tab, setTab] = useState<ProviderTab>(requestedTab && providerTabIds.has(requestedTab) ? requestedTab : "overview");
  const [providerDraft, setProviderDraft] = useState<Partial<Provider>>({ relationship_status: "prospect", relationship_tier: "standard", strategic_priority: 50, margin_included_default: false });
  const [contactDraft, setContactDraft] = useState<Partial<Contact>>({ active: true, preferred_channel: "telegram" });
  const [marginDraft, setMarginDraft] = useState({ route_id: "", flow: "all", mode: "percentage_points", percent_value: "", fixed_value: "", fixed_currency: "", notes: "" });
  const entityWorkspace = useEntityWorkspace("provider", isNew ? undefined : providerId);

  const load = useCallback(async () => {
    if (!providerId || isNew) return;
    setLoading(true);
    const { data, error } = await supabase.rpc("get_offerpsp_supply_workspace", { p_provider_id: providerId });
    if (error) setMessage({ tone: "error", text: error.message });
    else {
      const next = data as Workspace;
      setWorkspace(next);
      setProviderDraft(next.provider);
      if (!params.get("route") && next.routes?.length) {
        const nextParams = new URLSearchParams(params);
        nextParams.set("route", next.routes.find((route) => route.status !== "archived")?.id || next.routes[0].id);
        setParams(nextParams, { replace: true });
      }
    }
    setLoading(false);
  }, [isNew, params, providerId, setParams]);

  useEffect(() => { void load(); }, [load]);
  useEffect(() => {
    const nextTab = params.get("tab") as ProviderTab | null;
    if (nextTab && providerTabIds.has(nextTab) && nextTab !== tab) setTab(nextTab);
  }, [params, tab]);
  const selectedRoute = workspace?.routes.find((route) => route.id === params.get("route"));

  const selectTab = (nextTab: ProviderTab) => {
    setTab(nextTab);
    const nextParams = new URLSearchParams(params);
    nextParams.set("tab", nextTab);
    setParams(nextParams, { replace: true });
  };

  async function execute(name: string, action: () => Promise<{ data?: unknown; error: { message: string } | null }>, success: string) {
    setBusy(name); setMessage(null);
    const result = await action();
    if (result.error) { setMessage({ tone: "error", text: result.error.message }); setBusy(null); return null; }
    if (!isNew) await Promise.all([load(), refreshBridge(), entityWorkspace.refresh()]);
    setMessage({ tone: "success", text: success }); setBusy(null);
    return result.data;
  }

  async function saveProvider() {
    const data = await execute("provider", async () => {
      const result = await supabase.rpc("save_offerpsp_managed_provider", { p_provider_id: isNew ? null : providerId, p_payload: providerDraft });
      return { data: result.data, error: result.error };
    }, isNew ? "PSP создан." : "Профиль PSP сохранён.");
    if (isNew && data && typeof data === "object" && "id" in data) navigate(`/psps/${String((data as Provider).id)}`, { replace: true });
  }

  async function saveContact() {
    if (!providerId || isNew) return;
    const saved = await execute("contact", async () => {
      const result = await supabase.rpc("save_offerpsp_provider_contact", { p_provider_id: providerId, p_contact_id: contactDraft.id || null, p_payload: contactDraft });
      return { data: result.data, error: result.error };
    }, "Контакт PSP сохранён.");
    if (saved) setContactDraft({ active: true, preferred_channel: "telegram" });
  }

  async function saveMargin() {
    if (!providerId || isNew) return;
    const saved = await execute("margin", async () => {
      const result = await supabase.rpc("set_offerpsp_margin_policy", {
        p_provider_id: providerId, p_route_id: marginDraft.route_id || null, p_flow: marginDraft.flow, p_mode: marginDraft.mode,
        p_percent_value: optionalNumber(marginDraft.percent_value), p_fixed_value: optionalNumber(marginDraft.fixed_value),
        p_fixed_currency: marginDraft.fixed_currency || null, p_notes: marginDraft.notes || null,
      });
      return { data: result.data, error: result.error };
    }, "Новая версия маржи активирована; предыдущая сохранена в истории.");
    if (saved) setMarginDraft({ route_id: "", flow: "all", mode: "percentage_points", percent_value: "", fixed_value: "", fixed_currency: "", notes: "" });
  }

  async function confirmFreshness() {
    if (!providerId || isNew || !window.confirm("Подтвердить, что условия PSP актуальны на сегодня?")) return;
    await execute("freshness", async () => { const result = await supabase.rpc("confirm_offerpsp_provider_freshness", { p_provider_id: providerId }); return { data: result.data, error: result.error }; }, "Актуальность условий подтверждена.");
  }

  if (loading) return <SkeletonPage/>;
  return <>
    <PageMeta title={`${isNew ? "Новый PSP" : workspace?.provider.brand_name || "PSP"} | OfferPSP`} description="Private PSP workspace"/>
    <div className="mb-6 flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between"><div><Link to="/psps" className="text-sm font-medium text-gray-500 hover:text-brand-500">← Реестр PSP</Link><div className="mt-3 flex flex-wrap items-center gap-3"><h1 className="text-2xl font-semibold text-gray-900 dark:text-white sm:text-3xl">{isNew ? "Новый PSP" : workspace?.provider.brand_name}</h1>{workspace && <StatusPill status={workspace.provider.relationship_status}/>}</div><p className="mt-2 text-sm text-gray-500">{workspace?.provider.internal_code || "Код будет назначен автоматически"}</p></div>{!isNew && <button onClick={() => void confirmFreshness()} disabled={Boolean(busy)} className="rounded-lg border border-gray-200 px-4 py-2.5 text-sm font-medium text-gray-700 hover:border-brand-300 hover:text-brand-500 dark:border-gray-700 dark:text-gray-300">{busy === "freshness" ? "Подтверждаю…" : "Подтвердить актуальность"}</button>}</div>
    {message && (message.tone === "error" ? <ErrorBanner message={message.text}/> : <div className="mb-6 rounded-xl border border-success-200 bg-success-50 px-4 py-3 text-sm text-success-700 dark:border-success-500/20 dark:bg-success-500/10 dark:text-success-300">{message.text}</div>)}
    {entityWorkspace.error && <ErrorBanner message={entityWorkspace.error}/>}
    {isNew
      ? <div className="max-w-2xl"><ProviderForm draft={providerDraft} setDraft={setProviderDraft} save={() => void saveProvider()} busy={busy}/></div>
      : workspace
        ? <>
            <div className="mb-6 flex gap-1 overflow-x-auto rounded-xl border border-gray-200 bg-white p-1 dark:border-gray-800 dark:bg-gray-900">
              {providerTabs.map((item) => <button key={item.id} onClick={() => selectTab(item.id)} className={`whitespace-nowrap rounded-lg px-4 py-2.5 text-sm font-medium ${tab === item.id ? "bg-brand-500 text-white" : "text-gray-600 hover:bg-gray-50 dark:text-gray-300 dark:hover:bg-white/5"}`}>{item.label}</button>)}
            </div>
            {tab === "overview"
              ? <ProviderOverview workspace={workspace} setTab={selectTab}/>
              : tab === "profile"
                ? <div className="max-w-2xl"><ProviderForm draft={providerDraft} setDraft={setProviderDraft} save={() => void saveProvider()} busy={busy}/></div>
              : tab === "contacts"
                ? <div className="max-w-3xl"><ContactPanel contacts={workspace.contacts || []} draft={contactDraft} setDraft={setContactDraft} save={() => void saveContact()} busy={busy}/></div>
              : tab === "offers"
                ? <RouteWorkspace workspace={workspace} route={selectedRoute} select={(id) => { const nextParams = new URLSearchParams(params); nextParams.set("route", id); nextParams.set("tab", "offers"); setParams(nextParams); setTab("offers"); }} reload={load} execute={execute}/>
              : tab === "pricing"
                ? <MarginPanel routes={workspace.routes} policies={workspace.margin_policies || []} draft={marginDraft} setDraft={setMarginDraft} save={() => void saveMargin()} busy={busy}/>
              : tab === "documents"
                ? (entityWorkspace.loading ? <SkeletonPage/> : <DocumentsPanel documents={entityWorkspace.data.documents} busy={entityWorkspace.busy} onSave={entityWorkspace.saveDocument} onArchive={entityWorkspace.archiveDocument}/>)
                : (entityWorkspace.loading ? <SkeletonPage/> : <ActivityPanel activities={entityWorkspace.data.activities}/>)}
          </>
        : <EmptyState title="Workspace недоступен" description="Не удалось загрузить данные PSP."/>}
  </>;
}

function ProviderOverview({ workspace, setTab }: { workspace: Workspace; setTab: (tab: ProviderTab) => void }) {
  const activeRoutes = workspace.routes.filter((route) => route.status !== "archived");
  const nextAction = activeRoutes.some((route) => route.open_error_count)
    ? "Исправить ошибки в офферах"
    : activeRoutes.some((route) => route.is_stale)
      ? "Подтвердить актуальность условий"
      : !activeRoutes.some((route) => route.status === "published")
        ? "Подготовить и опубликовать оффер"
        : "Проверить новые запросы мерчей";
  return <div className="space-y-6"><SupplySummary workspace={workspace}/><div className="grid grid-cols-1 gap-6 lg:grid-cols-2"><Panel><p className="text-xs font-semibold uppercase tracking-[0.18em] text-brand-500">Следующее действие</p><h2 className="mt-3 text-xl font-semibold text-gray-900 dark:text-white">{nextAction}</h2><p className="mt-2 text-sm text-gray-500">Профиль PSP, его условия и история теперь собраны в одном workspace.</p><button onClick={() => setTab("offers")} className="mt-5 rounded-lg bg-brand-500 px-4 py-2.5 text-sm font-semibold text-white">Открыть офферы</button></Panel><Panel><p className="text-xs font-semibold uppercase tracking-[0.18em] text-brand-500">Relationship</p><div className="mt-4 grid grid-cols-2 gap-4 text-sm"><div><span className="text-gray-400">Tier</span><strong className="mt-1 block text-gray-900 dark:text-white">{workspace.provider.relationship_tier || "standard"}</strong></div><div><span className="text-gray-400">Приоритет</span><strong className="mt-1 block text-gray-900 dark:text-white">{workspace.provider.strategic_priority ?? 50}</strong></div><div><span className="text-gray-400">Контактов</span><strong className="mt-1 block text-gray-900 dark:text-white">{workspace.contacts.length}</strong></div><div><span className="text-gray-400">Маржа</span><strong className="mt-1 block text-gray-900 dark:text-white">{workspace.margin_policies.filter((policy) => policy.active).length} активных правил</strong></div></div><button onClick={() => setTab("profile")} className="mt-5 text-sm font-semibold text-brand-500">Редактировать профиль →</button></Panel></div></div>;
}

function ProviderForm({ draft, setDraft, save, busy }: { draft: Partial<Provider>; setDraft: (value: Partial<Provider>) => void; save: () => void; busy: string | null }) {
  const set = (key: keyof Provider, value: unknown) => setDraft({ ...draft, [key]: value });
  return <Panel><p className="text-xs font-semibold uppercase tracking-[0.18em] text-brand-500">Профиль PSP</p><div className="mt-5 space-y-4"><Field label="Бренд"><input className={fieldClass} value={draft.brand_name || ""} onChange={(e)=>set("brand_name",e.target.value)}/></Field><Field label="Юридическое имя"><input className={fieldClass} value={draft.legal_name || ""} onChange={(e)=>set("legal_name",e.target.value)}/></Field><Field label="Сайт"><input className={fieldClass} value={draft.website || ""} onChange={(e)=>set("website",e.target.value)}/></Field><div className="grid grid-cols-2 gap-3"><Field label="Статус"><select className={fieldClass} value={draft.relationship_status || "prospect"} onChange={(e)=>set("relationship_status",e.target.value)}>{["prospect","onboarding","active","paused","archived"].map(v=><option key={v}>{v}</option>)}</select></Field><Field label="Tier"><select className={fieldClass} value={draft.relationship_tier || "standard"} onChange={(e)=>set("relationship_tier",e.target.value)}>{["top","core","standard","watchlist"].map(v=><option key={v}>{v}</option>)}</select></Field></div><Field label="Приоритет 0–100"><input className={fieldClass} type="number" min="0" max="100" value={draft.strategic_priority ?? 50} onChange={(e)=>set("strategic_priority",Number(e.target.value))}/></Field><label className="flex items-center gap-3 text-sm text-gray-700 dark:text-gray-300"><input type="checkbox" checked={Boolean(draft.margin_included_default)} onChange={(e)=>set("margin_included_default",e.target.checked)} className="h-4 w-4 accent-[#ff477d]"/>Агентская маржа уже включена PSP</label><Field label="Внутренние заметки"><textarea className={areaClass} value={draft.relationship_notes || ""} onChange={(e)=>set("relationship_notes",e.target.value)}/></Field><button onClick={save} disabled={!draft.brand_name?.trim() || Boolean(busy)} className="w-full rounded-lg bg-brand-500 px-4 py-3 text-sm font-semibold text-white disabled:opacity-40">{busy === "provider" ? "Сохраняю…" : "Сохранить PSP"}</button></div></Panel>;
}

function ContactPanel({ contacts, draft, setDraft, save, busy }: { contacts: Contact[]; draft: Partial<Contact>; setDraft: (v: Partial<Contact>)=>void; save: ()=>void; busy: string|null }) {
  const set=(key:keyof Contact,value:unknown)=>setDraft({...draft,[key]:value});
  return <Panel><div className="flex items-center justify-between"><h2 className="text-lg font-semibold text-gray-900 dark:text-white">Контакты</h2><span className="text-xs text-gray-400">{contacts.length}</span></div><div className="mt-4 space-y-2">{contacts.map(c=><button key={c.id} onClick={()=>setDraft(c)} className="w-full rounded-lg border border-gray-200 p-3 text-left dark:border-gray-800"><strong className="block text-sm text-gray-900 dark:text-white">{c.full_name}</strong><span className="text-xs text-gray-400">{c.role_title || "Contact"} · {c.telegram || c.email || c.phone || "нет канала"}</span></button>)}</div><div className="mt-5 space-y-3"><Field label="Имя"><input className={fieldClass} value={draft.full_name || ""} onChange={e=>set("full_name",e.target.value)}/></Field><Field label="Роль"><input className={fieldClass} value={draft.role_title || ""} onChange={e=>set("role_title",e.target.value)}/></Field><Field label="Telegram"><input className={fieldClass} value={draft.telegram || ""} onChange={e=>set("telegram",e.target.value)}/></Field><Field label="Email"><input className={fieldClass} value={draft.email || ""} onChange={e=>set("email",e.target.value)}/></Field><button onClick={save} disabled={!draft.full_name?.trim() || Boolean(busy)} className="w-full rounded-lg border border-brand-200 px-4 py-2.5 text-sm font-semibold text-brand-600 disabled:opacity-40">{busy === "contact" ? "Сохраняю…" : draft.id ? "Обновить контакт" : "Добавить контакт"}</button></div></Panel>;
}

function SupplySummary({ workspace }: { workspace: Workspace }) {
  const active=workspace.routes.filter(r=>r.status!=="archived"); const errors=active.reduce((s,r)=>s+Number(r.open_error_count||0),0);
  return <div className="grid grid-cols-2 gap-4 lg:grid-cols-4">{[["Маршрутов",active.length],["Live",active.filter(r=>r.status==="published").length],["Ошибок",errors],["Устарели",active.filter(r=>r.is_stale).length]].map(([label,value])=><Panel key={String(label)}><span className="text-xs text-gray-400">{label}</span><strong className="mt-2 block text-2xl text-gray-900 dark:text-white">{value}</strong></Panel>)}</div>;
}

function MarginPanel({ routes, policies, draft, setDraft, save, busy }: { routes:Route[]; policies:Margin[]; draft:MarginDraft; setDraft:(v:MarginDraft)=>void; save:()=>void; busy:string|null }) {
  return <Panel><div className="flex items-center justify-between"><div><p className="text-xs font-semibold uppercase tracking-[0.18em] text-brand-500">Pricing</p><h2 className="mt-2 text-lg font-semibold text-gray-900 dark:text-white">Маржа OfferPSP</h2></div><span className="text-xs text-gray-400">версий: {policies.length}</span></div><div className="mt-5 grid grid-cols-1 gap-3 lg:grid-cols-6"><select className={fieldClass} value={draft.route_id} onChange={e=>setDraft({...draft,route_id:e.target.value})}><option value="">Все маршруты</option>{routes.filter(r=>r.status!=="archived").map(r=><option key={r.id} value={r.id}>{r.internal_code} · {r.client_title}</option>)}</select><select className={fieldClass} value={draft.flow} onChange={e=>setDraft({...draft,flow:e.target.value})}>{["all","payin","payout","settlement","refund","chargeback"].map(v=><option key={v}>{v}</option>)}</select><select className={fieldClass} value={draft.mode} onChange={e=>setDraft({...draft,mode:e.target.value})}>{["included","percentage_points","relative_percent","fixed","hybrid","override"].map(v=><option key={v}>{v}</option>)}</select><input className={fieldClass} type="number" step="0.01" placeholder="%" value={draft.percent_value} onChange={e=>setDraft({...draft,percent_value:e.target.value})}/><input className={fieldClass} type="number" step="0.01" placeholder="Fixed" value={draft.fixed_value} onChange={e=>setDraft({...draft,fixed_value:e.target.value})}/><input className={fieldClass} placeholder="Currency" value={draft.fixed_currency} onChange={e=>setDraft({...draft,fixed_currency:e.target.value})}/></div><div className="mt-3 flex gap-3"><input className={fieldClass} placeholder="Причина/заметка новой версии" value={draft.notes} onChange={e=>setDraft({...draft,notes:e.target.value})}/><button onClick={save} disabled={Boolean(busy)} className="shrink-0 rounded-lg bg-brand-500 px-5 text-sm font-semibold text-white disabled:opacity-40">{busy==="margin"?"Сохраняю…":"Применить"}</button></div><div className="mt-5 flex flex-wrap gap-2">{policies.filter(p=>p.active).map(p=><span key={p.id} className="rounded-full bg-gray-100 px-3 py-1.5 text-xs text-gray-700 dark:bg-white/5 dark:text-gray-300">{routes.find(r=>r.id===p.route_id)?.internal_code||"Все"} · {p.flow} · {p.mode} · {p.percent_value??p.fixed_value??"included"}</span>)}</div></Panel>;
}

function RouteWorkspace({ workspace, route, select, reload, execute }: { workspace:Workspace; route?:Route; select:(id:string)=>void; reload:()=>Promise<void>; execute:(name:string,action:()=>Promise<{data?:unknown;error:{message:string}|null}>,success:string)=>Promise<unknown> }) {
  const active=workspace.routes.filter(r=>r.status!=="archived");
  const [creating,setCreating]=useState(false);
  const [draft,setDraft]=useState({client_title:"",flow:"payin",geos:"",currencies:"",methods:"",traffic_types:"",verticals:"",source_reference:""});
  const create=async()=>{const data=await execute("create-route",async()=>{const result=await supabase.rpc("create_offerpsp_manual_route",{p_provider_id:workspace.provider.id,p_payload:{client_title:draft.client_title,flow:draft.flow,geos:split(draft.geos),currencies:split(draft.currencies),methods:split(draft.methods),traffic_types:split(draft.traffic_types),verticals:split(draft.verticals),source_reference:draft.source_reference||"Staff manual offer",coverage_scope:"specific",fees:[],limits:[],settlements:[]}});return{data:result.data,error:result.error}} ,"Черновик оффера создан. Заполните ставки, лимиты и settlement.");if(data&&typeof data==="object"&&"route_id" in data){select(String((data as {route_id:unknown}).route_id));setCreating(false);setDraft({client_title:"",flow:"payin",geos:"",currencies:"",methods:"",traffic_types:"",verticals:"",source_reference:""});}};
  return <div className="grid grid-cols-1 gap-6 lg:grid-cols-[300px_minmax(0,1fr)]"><Panel className="h-fit"><div className="flex items-center justify-between"><h2 className="text-lg font-semibold text-gray-900 dark:text-white">Офферы</h2><button onClick={()=>setCreating(!creating)} className="rounded-lg bg-brand-500 px-3 py-2 text-xs font-semibold text-white">{creating?"Отмена":"+ Новый"}</button></div><span className="mt-1 block text-xs text-gray-400">{active.length} активных маршрутов</span><div className="mt-4 max-h-[680px] space-y-2 overflow-y-auto">{active.map(r=><button key={r.id} onClick={()=>{setCreating(false);select(r.id)}} className={`w-full rounded-xl border p-3 text-left ${route?.id===r.id&&!creating?"border-brand-400 bg-brand-25 dark:bg-brand-500/5":"border-gray-200 dark:border-gray-800"}`}><div className="flex items-start justify-between gap-2"><strong className="text-sm text-gray-900 dark:text-white">{r.client_title}</strong><StatusPill status={r.status}/></div><span className="mt-1 block text-xs text-gray-400">{r.internal_code} · v{r.batch_version||"—"}</span>{Boolean(r.open_error_count||r.is_stale)&&<span className="mt-2 block text-xs text-error-600">{r.open_error_count||0} ошибок{r.is_stale?" · устарел":""}</span>}</button>)}</div></Panel>{creating?<Panel><p className="text-xs font-semibold uppercase tracking-[0.18em] text-brand-500">Manual rate card</p><h2 className="mt-2 text-xl font-semibold text-gray-900 dark:text-white">Новый оффер PSP</h2><p className="mt-1 text-sm text-gray-500">Создаём нормализованный черновик. Ставки, лимиты и settlement добавляются следующим шагом в полном редакторе.</p><div className="mt-6 grid grid-cols-1 gap-4 md:grid-cols-2"><Field label="Название оффера"><input className={fieldClass} value={draft.client_title} onChange={e=>setDraft({...draft,client_title:e.target.value})}/></Field><Field label="Поток"><select className={fieldClass} value={draft.flow} onChange={e=>setDraft({...draft,flow:e.target.value})}>{["payin","payout","both"].map(v=><option key={v}>{v}</option>)}</select></Field><Field label="GEO"><input className={fieldClass} value={draft.geos} onChange={e=>setDraft({...draft,geos:e.target.value})} placeholder="IN, BR, MX"/></Field><Field label="Валюты"><input className={fieldClass} value={draft.currencies} onChange={e=>setDraft({...draft,currencies:e.target.value})} placeholder="INR, BRL, MXN"/></Field><Field label="Методы"><input className={fieldClass} value={draft.methods} onChange={e=>setDraft({...draft,methods:e.target.value})} placeholder="UPI, PIX, Cards"/></Field><Field label="Типы трафика"><input className={fieldClass} value={draft.traffic_types} onChange={e=>setDraft({...draft,traffic_types:e.target.value})} placeholder="FTD, Trusted"/></Field><Field label="Вертикали"><input className={fieldClass} value={draft.verticals} onChange={e=>setDraft({...draft,verticals:e.target.value})} placeholder="iGaming, Forex"/></Field><Field label="Источник"><input className={fieldClass} value={draft.source_reference} onChange={e=>setDraft({...draft,source_reference:e.target.value})} placeholder="Telegram / PDF / XLSX / ручной ввод"/></Field></div><button disabled={!draft.client_title.trim()} onClick={()=>void create()} className="mt-6 w-full rounded-lg bg-brand-500 px-4 py-3 text-sm font-semibold text-white disabled:opacity-40">Создать черновик и открыть редактор</button></Panel>:route?<RouteEditor key={route.id} providerId={workspace.provider.id} route={route} reload={reload} execute={execute}/>:<Panel><EmptyState title="Выберите или создайте оффер" description="Справа откроется редактор маршрута, ставок, лимитов и settlement."/></Panel>}</div>;
}

function RouteEditor({ route, reload, execute }: { providerId:string; route:Route; reload:()=>Promise<void>; execute:RouteWorkspaceProps["execute"] }) {
  const [draft,setDraft]=useState({...route,geosText:csv(route.geos),blockedText:csv(route.blocked_geos),currenciesText:csv(route.currencies),methodsText:csv(route.methods),trafficText:csv(route.traffic_types),verticalsText:csv(route.verticals),integrationsText:csv(route.integrations),fees:(route.fees||[]).map(cleanRow),limits:(route.limits||[]).map(cleanRow),settlements:(route.settlements||[]).map(cleanRow)});
  const [routeError,setRouteError]=useState<string | null>(null);
  const editable=!['published','paused','archived'].includes(route.status);
  const save=async()=>{const validationError=validateRouteComponents(draft.fees,draft.limits,draft.settlements);if(validationError){setRouteError(validationError);return;}setRouteError(null);await execute("route",async()=>{const result=await supabase.rpc("save_offerpsp_route",{p_route_id:route.id,p_payload:{client_title:draft.client_title,flow:draft.flow,coverage_scope:draft.coverage_scope,geos:split(draft.geosText),blocked_geos:split(draft.blockedText),currencies:split(draft.currenciesText),methods:split(draft.methodsText),traffic_types:split(draft.trafficText),verticals:split(draft.verticalsText),integrations:split(draft.integrationsText),min_monthly_volume:draft.min_monthly_volume,max_monthly_volume:draft.max_monthly_volume,volume_currency:draft.volume_currency,freshness_days:draft.freshness_days,effective_from:draft.effective_from,expires_at:draft.expires_at,operational_notes:draft.operational_notes,fees:draft.fees,limits:draft.limits,settlements:draft.settlements}});return{data:result.data,error:result.error}},"Оффер сохранён и отправлен на проверку.");};
  const status=async(next:string)=>{if(next==="archived"&&!window.confirm("Архивировать оффер?"))return;await execute("route-status",async()=>{const result=await supabase.rpc("set_offerpsp_route_status",{p_route_id:route.id,p_status:next});return{data:result.data,error:result.error}},`Статус оффера: ${next}.`);};
  const revise=async()=>{if(!window.confirm("Создать редактируемую ревизию, не меняя текущий live-оффер?"))return;await execute("revise",async()=>{const result=await supabase.rpc("revise_offerpsp_route",{p_route_id:route.id});return{data:result.data,error:result.error}},"Редактируемая ревизия создана.");await reload();};
  return <Panel><div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between"><div><p className="text-xs font-semibold uppercase tracking-[0.18em] text-brand-500">{route.internal_code} · rate card v{route.batch_version||"—"}</p><h2 className="mt-2 text-xl font-semibold text-gray-900 dark:text-white">{route.client_title}</h2></div><div className="flex gap-2">{route.status==="published"&&<button onClick={()=>void status("paused")} className="rounded-lg border border-warning-300 px-3 py-2 text-sm text-warning-700">Пауза</button>}{route.status==="paused"&&<button onClick={()=>void status("published")} className="rounded-lg border border-success-300 px-3 py-2 text-sm text-success-700">Возобновить</button>}{!editable&&<button onClick={()=>void revise()} className="rounded-lg bg-brand-500 px-3 py-2 text-sm font-medium text-white">Создать ревизию</button>}{["draft","review","paused"].includes(route.status)&&<button onClick={()=>void status("archived")} className="rounded-lg border border-error-200 px-3 py-2 text-sm text-error-600">Архив</button>}</div></div>{routeError&&<div className="mt-4"><ErrorBanner message={routeError}/></div>}<div className="mt-6 grid grid-cols-1 gap-4 md:grid-cols-2"><Field label="Название"><input disabled={!editable} className={fieldClass} value={draft.client_title} onChange={e=>setDraft({...draft,client_title:e.target.value})}/></Field><Field label="Поток"><select disabled={!editable} className={fieldClass} value={draft.flow} onChange={e=>setDraft({...draft,flow:e.target.value})}>{["payin","payout","both"].map(v=><option key={v}>{v}</option>)}</select></Field><Field label="GEO"><input disabled={!editable} className={fieldClass} value={draft.geosText} onChange={e=>setDraft({...draft,geosText:e.target.value})}/></Field><Field label="Валюты"><input disabled={!editable} className={fieldClass} value={draft.currenciesText} onChange={e=>setDraft({...draft,currenciesText:e.target.value})}/></Field><Field label="Методы"><input disabled={!editable} className={fieldClass} value={draft.methodsText} onChange={e=>setDraft({...draft,methodsText:e.target.value})}/></Field><Field label="Тип трафика"><input disabled={!editable} className={fieldClass} value={draft.trafficText} onChange={e=>setDraft({...draft,trafficText:e.target.value})}/></Field><Field label="Вертикали"><input disabled={!editable} className={fieldClass} value={draft.verticalsText} onChange={e=>setDraft({...draft,verticalsText:e.target.value})}/></Field><Field label="Интеграции"><input disabled={!editable} className={fieldClass} value={draft.integrationsText} onChange={e=>setDraft({...draft,integrationsText:e.target.value})}/></Field></div><div className="mt-6 space-y-5"><ComponentRows title="Ставки PSP" kind="fees" rows={draft.fees} disabled={!editable} setRows={rows=>setDraft({...draft,fees:rows})}/><ComponentRows title="Лимиты" kind="limits" rows={draft.limits} disabled={!editable} setRows={rows=>setDraft({...draft,limits:rows})}/><ComponentRows title="Settlement" kind="settlements" rows={draft.settlements} disabled={!editable} setRows={rows=>setDraft({...draft,settlements:rows})}/></div><Field label="Операционные заметки"><textarea disabled={!editable} className={`${areaClass} mt-2`} value={draft.operational_notes||""} onChange={e=>setDraft({...draft,operational_notes:e.target.value})}/></Field>{editable&&<button onClick={()=>void save()} className="mt-5 w-full rounded-lg bg-brand-500 px-4 py-3 text-sm font-semibold text-white">Сохранить оффер</button>}</Panel>;
}

type RouteWorkspaceProps={execute:(name:string,action:()=>Promise<{data?:unknown;error:{message:string}|null}>,success:string)=>Promise<unknown>};
const cleanRow=(row:JsonRow)=>Object.fromEntries(Object.entries(row).filter(([key])=>!["id","route_id","created_at"].includes(key)));
const componentFields={fees:[{key:"flow",label:"Операция",options:["payin","payout","settlement","refund","chargeback","decline"]},{key:"fee_type",label:"Тип ставки",options:["percent","fixed","percent_plus_fixed"]},{key:"base_percent",label:"Процент, %",type:"number"},{key:"base_fixed",label:"Фиксированная сумма",type:"number"},{key:"base_fixed_currency",label:"Валюта фикса"},{key:"applies_on",label:"Применяется",options:["success","decline","both","event"]}],limits:[{key:"flow",label:"Операция",options:["payin","payout","both"]},{key:"currency",label:"Валюта"},{key:"minimum_amount",label:"Минимум",type:"number"},{key:"maximum_amount",label:"Максимум",type:"number"}],settlements:[{key:"currency",label:"Валюта расчёта"},{key:"fee_percent",label:"Комиссия, %",type:"number"},{key:"period",label:"Период (T+0, T+1)"},{key:"minimum_amount",label:"Мин. сумма",type:"number"},{key:"exchange_rule",label:"Курс / правило"}]} as const;
function validateRouteComponents(fees:JsonRow[],limits:JsonRow[],settlements:JsonRow[]){for(const [index,row] of fees.entries()){if(!row.flow||!row.fee_type)return `Ставка ${index+1}: выберите операцию и тип ставки.`;if(row.base_percent==null&&row.base_fixed==null)return `Ставка ${index+1}: укажите процент или фиксированную сумму.`;if(row.base_fixed!=null&&!row.base_fixed_currency)return `Ставка ${index+1}: для фиксированной суммы укажите валюту.`;}for(const [index,row] of limits.entries()){if(!row.flow||!row.currency)return `Лимит ${index+1}: выберите операцию и валюту.`;const min=optionalNumber(String(row.minimum_amount??""));const max=optionalNumber(String(row.maximum_amount??""));if(min!=null&&max!=null&&max<min)return `Лимит ${index+1}: максимум не может быть меньше минимума.`;}for(const [index,row] of settlements.entries()){if(!row.currency&&!row.period)return `Settlement ${index+1}: укажите валюту или период расчёта.`;}return null;}
function ComponentRows({title,kind,rows,setRows,disabled}:{title:string;kind:"fees"|"limits"|"settlements";rows:JsonRow[];setRows:(v:JsonRow[])=>void;disabled:boolean}){const fields=componentFields[kind];const update=(index:number,key:string,value:string)=>{const next=[...rows];next[index]={...next[index],[key]:value===""?null:value};setRows(next)};return <div><div className="mb-2 flex items-center justify-between"><h3 className="text-sm font-semibold text-gray-900 dark:text-white">{title}</h3>{!disabled&&<button onClick={()=>setRows([...rows,{}])} className="text-xs font-semibold text-brand-500">+ Добавить</button>}</div><div className="space-y-3">{rows.map((row,index)=><div key={index} className="rounded-xl bg-gray-50 p-4 dark:bg-white/[0.03]"><div className="grid grid-cols-1 gap-3 sm:grid-cols-2 xl:grid-cols-3">{fields.map(field=><Field key={field.key} label={field.label}>{"options" in field?<select disabled={disabled} className={fieldClass} value={String(row[field.key]??"")} onChange={e=>update(index,field.key,e.target.value)}><option value="">Выберите</option>{field.options.map(option=><option key={option} value={option}>{option}</option>)}</select>:<input disabled={disabled} type={"type" in field?field.type:"text"} step={"type" in field&&field.type==="number"?"0.01":undefined} className={fieldClass} value={String(row[field.key]??"")} onChange={e=>update(index,field.key,e.target.value)}/>}</Field>)}</div>{!disabled&&<button onClick={()=>setRows(rows.filter((_,i)=>i!==index))} className="mt-3 text-xs font-semibold text-error-600">Удалить строку</button>}</div>)}</div></div>}
function Field({label,children}:{label:string;children:React.ReactNode}){return <label className="block"><span className="mb-1.5 block text-xs font-medium text-gray-500">{label}</span>{children}</label>}
