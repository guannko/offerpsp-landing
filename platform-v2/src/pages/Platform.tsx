import { useMemo, useState } from "react";
import { Link } from "react-router";
import PageMeta from "../components/common/PageMeta";
import {
  EmptyState,
  ErrorBanner,
  Metric,
  PageHeading,
  Panel,
  SkeletonPage,
  StatusPill,
} from "../components/control/Ui";
import { useControlBridge } from "../context/ControlBridgeContext";
import type { Lead } from "../types/offerpsp";

const activeStatuses = ["new", "qualifying", "needs_clarification", "matching", "matched", "shortlist_ready", "shared", "option_selected", "dossier_ready", "provider_reviewing", "provider_needs_info", "provider_accepted", "telegram_created", "zoom_scheduled", "negotiating"];

const list = (value: unknown) => Array.isArray(value) ? value.join(", ") : String(value || "—");
const date = (value?: string | null) => value ? new Intl.DateTimeFormat("ru-RU", { day: "2-digit", month: "short", year: "numeric" }).format(new Date(value)) : "—";

function PageFrame({ title, description, children }: { title: string; description: string; children: React.ReactNode }) {
  const bridge = useControlBridge();
  if (bridge.loading) return <SkeletonPage />;
  return <><PageMeta title={`${title} | OfferPSP`} description={description}/>{bridge.error && <ErrorBanner message={bridge.error}/>} {children}</>;
}

export function CommandCenter() {
  const { leads, providers, routes, organizations, lastUpdatedAt, refreshing, refresh } = useControlBridge();
  const operationalLeads = leads.filter((lead) => lead.record_state !== "archived" && !["closed", "spam"].includes(lead.status || ""));
  const operationalProviders = providers.filter((provider) => provider.relationship_status !== "archived");
  const stats = useMemo(() => ({
    newLeads: operationalLeads.filter((lead) => lead.status === "new").length,
    needsData: operationalLeads.filter((lead) => ["needs_clarification", "provider_needs_info"].includes(lead.status || "")).length,
    activeDeals: operationalLeads.filter((lead) => activeStatuses.includes(lead.status || "") && !["new", "qualifying", "needs_clarification"].includes(lead.status || "")).length,
    won: operationalLeads.filter((lead) => lead.status === "won").length,
    unassigned: operationalLeads.filter((lead) => !lead.assigned_to).length,
    staleRoutes: routes.filter((route) => route.is_stale).length,
    blockedRoutes: routes.filter((route) => Number(route.open_error_count || 0) > 0).length,
    agents: organizations.filter((organization) => organization.organization_type === "agent" && organization.status === "active").length,
  }), [operationalLeads, routes, organizations]);

  const attention = [
    { label: "Новые заявки", count: stats.newLeads, path: "/inbox", hint: "нужно проверить и назначить ответственного" },
    { label: "Запросы без владельца", count: stats.unassigned, path: "/pipeline", hint: "могут зависнуть без следующего действия" },
    { label: "Нужны данные", count: stats.needsData, path: "/merchants", hint: "ждём уточнения от мерча или PSP" },
    { label: "Маршруты с ошибками", count: stats.blockedRoutes, path: "/offers", hint: "нельзя публиковать до исправления" },
    { label: "Устаревшие маршруты", count: stats.staleRoutes, path: "/offers", hint: "нужно подтвердить актуальность у PSP" },
  ].filter((item) => item.count > 0);

  const funnel = [
    ["Заявки", operationalLeads.length],
    ["В работе", operationalLeads.filter((lead) => activeStatuses.includes(lead.status || "")).length],
    ["Переданы PSP", operationalLeads.filter((lead) => ["provider_reviewing", "provider_needs_info", "provider_accepted", "telegram_created", "zoom_scheduled", "negotiating", "won"].includes(lead.status || "")).length],
    ["Запущены", stats.won],
  ] as const;
  const maxFunnel = Math.max(1, ...funnel.map(([, value]) => value));

  return <PageFrame title="Командный центр" description="Единая операционная панель OfferPSP и лидогенерации.">
    <PageHeading eyebrow="OfferPSP Control Bridge" title="Что требует внимания сегодня" description="Не витрина цифр, а рабочая очередь: заявки, офферы, сделки и риски в одном месте." action={<div className="flex flex-wrap gap-2"><Link to="/psps/new" className="rounded-lg border border-gray-200 px-4 py-2.5 text-sm font-medium text-gray-700 hover:border-brand-300 hover:text-brand-600 dark:border-gray-700 dark:text-gray-300">+ Добавить PSP</Link><button onClick={() => void refresh()} disabled={refreshing} className="rounded-lg bg-brand-500 px-4 py-2.5 text-sm font-medium text-white hover:bg-brand-600 disabled:opacity-50">{refreshing ? "Обновляю…" : "Обновить данные"}</button></div>}/>
    <div className="grid grid-cols-1 gap-4 md:grid-cols-2 xl:grid-cols-4">
      <Metric label="Новые" value={stats.newLeads} hint="заявок ждут первичной проверки" tone={stats.newLeads ? "warning" : "default"}/>
      <Metric label="Сделки в работе" value={stats.activeDeals} hint="от matching до переговоров"/>
      <Metric label="PSP и маршруты" value={`${operationalProviders.length} / ${routes.length}`} hint="рабочие партнёры / нормализованные офферы"/>
      <Metric label="Запущено" value={stats.won} hint="сделок дошли до live processing" tone="success"/>
    </div>
    <div className="mt-6 grid grid-cols-1 gap-6 xl:grid-cols-5">
      <Panel className="xl:col-span-3">
        <div className="mb-5 flex items-center justify-between"><div><h2 className="text-lg font-semibold text-gray-900 dark:text-white">Очередь внимания</h2><p className="mt-1 text-sm text-gray-500 dark:text-gray-400">Сначала делаем то, что двигает деньги и снимает блокировки.</p></div><span className="text-xs text-gray-400">{lastUpdatedAt ? `обновлено ${lastUpdatedAt.toLocaleTimeString("ru-RU", { hour: "2-digit", minute: "2-digit" })}` : ""}</span></div>
        {attention.length ? <div className="space-y-3">{attention.map((item) => <Link key={item.label} to={item.path} className="flex items-center justify-between rounded-xl border border-gray-200 px-4 py-3 transition hover:border-brand-300 hover:bg-brand-25 dark:border-gray-800 dark:hover:border-brand-800 dark:hover:bg-brand-500/5"><div><strong className="text-sm text-gray-800 dark:text-white/90">{item.label}</strong><p className="mt-1 text-xs text-gray-500 dark:text-gray-400">{item.hint}</p></div><span className="rounded-lg bg-gray-100 px-3 py-1.5 text-lg font-semibold text-gray-800 dark:bg-white/5 dark:text-white">{item.count}</span></Link>)}</div> : <EmptyState title="Критичных очередей нет" description="Новые задачи появятся здесь автоматически."/>}
        <div className="mt-5 grid grid-cols-2 gap-2 border-t border-gray-100 pt-5 sm:grid-cols-4 dark:border-gray-800">{[["Мерчи","/merchants"],["PSP","/psps"],["Офферы","/offers"],["Сделки","/deals"]].map(([label,path])=><Link key={path} to={path} className="rounded-lg bg-gray-50 px-3 py-2 text-center text-xs font-medium text-gray-600 hover:bg-brand-50 hover:text-brand-600 dark:bg-white/[0.03] dark:text-gray-300 dark:hover:bg-brand-500/10">{label} →</Link>)}</div>
      </Panel>
      <Panel className="xl:col-span-2">
        <h2 className="text-lg font-semibold text-gray-900 dark:text-white">Живая воронка</h2>
        <p className="mt-1 text-sm text-gray-500 dark:text-gray-400">Текущее прохождение мерчей до запуска.</p>
        <div className="mt-6 space-y-5">{funnel.map(([label, value]) => <div key={label}><div className="mb-2 flex justify-between text-sm"><span className="text-gray-600 dark:text-gray-400">{label}</span><strong className="text-gray-900 dark:text-white">{value}</strong></div><div className="h-2.5 rounded-full bg-gray-100 dark:bg-gray-800"><div className="h-2.5 rounded-full bg-gradient-to-r from-brand-500 to-theme-purple-500" style={{ width: `${Math.max(value ? 8 : 0, (value / maxFunnel) * 100)}%` }}/></div></div>)}</div>
        <div className="mt-7 grid grid-cols-2 gap-3"><div className="rounded-xl bg-gray-50 p-3 dark:bg-white/[0.03]"><span className="text-xs text-gray-500">Активных агентов</span><strong className="mt-1 block text-xl text-gray-900 dark:text-white">{stats.agents}</strong></div><div className="rounded-xl bg-gray-50 p-3 dark:bg-white/[0.03]"><span className="text-xs text-gray-500">Требуют обновления</span><strong className="mt-1 block text-xl text-gray-900 dark:text-white">{stats.staleRoutes}</strong></div></div>
      </Panel>
    </div>
  </PageFrame>;
}

export function InboxPage() {
  const { leads } = useControlBridge();
  const incoming = leads.filter((lead) => ["new", "qualifying", "needs_clarification"].includes(lead.status || ""));
  return <PageFrame title="Входящие" description="Единая очередь новых запросов."><PageHeading eyebrow="Operations" title="Входящие заявки" description="Форма сайта, рекомендации субагентов и найденные лиды должны попадать в одну управляемую очередь."/><LeadTable leads={incoming}/></PageFrame>;
}

const pipelineColumns = [
  { title: "Новые", statuses: ["new", "qualifying", "needs_clarification"] },
  { title: "Подбор", statuses: ["matching", "matched", "shortlist_ready"] },
  { title: "Клиент", statuses: ["shared", "option_selected", "dossier_ready"] },
  { title: "PSP review", statuses: ["provider_reviewing", "provider_needs_info", "provider_accepted", "provider_declined"] },
  { title: "Запуск", statuses: ["telegram_created", "zoom_scheduled", "negotiating", "won", "lost"] },
];

export function PipelinePage() {
  const { leads } = useControlBridge();
  const operationalLeads = leads.filter((lead) => lead.record_state !== "archived");
  return <PageFrame title="Воронка" description="Kanban сделок OfferPSP."><PageHeading eyebrow="Merchant pipeline" title="Воронка сделок" description="Каждая карточка показывает этап и следующий шаг. На телефоне колонки прокручиваются горизонтально, не ломая всю страницу."/><div className="-mx-4 overflow-x-auto px-4 pb-3 md:mx-0 md:px-0"><div className="grid min-w-[1100px] grid-cols-5 gap-4">{pipelineColumns.map((column) => { const items = operationalLeads.filter((lead) => column.statuses.includes(lead.status || "")); return <div key={column.title} className="rounded-2xl bg-gray-100/70 p-3 dark:bg-white/[0.03]"><div className="mb-3 flex items-center justify-between"><h2 className="text-sm font-semibold text-gray-800 dark:text-white/90">{column.title}</h2><span className="rounded-full bg-white px-2 py-0.5 text-xs text-gray-500 dark:bg-gray-800">{items.length}</span></div><div className="space-y-3">{items.map((lead) => <Link to={`/merchants/${lead.lead_id}`} key={lead.lead_id} className="block rounded-xl border border-gray-200 bg-white p-4 shadow-theme-xs transition hover:border-brand-300 dark:border-gray-800 dark:bg-gray-900"><div className="flex items-start justify-between gap-2"><strong className="text-sm text-gray-900 dark:text-white">{lead.company || "Без названия"}</strong><span className="h-2 w-2 shrink-0 rounded-full bg-brand-500"/></div><p className="mt-2 text-xs text-gray-500">{lead.vertical || "Вертикаль не указана"} · {list(lead.geos)}</p><div className="mt-3"><StatusPill status={lead.status}/></div><p className="mt-3 border-t border-gray-100 pt-3 text-xs text-gray-400 dark:border-gray-800">Следующий шаг: {lead.status === "new" ? "проверить заявку" : lead.status === "needs_clarification" ? "запросить данные" : "открыть карточку"}</p></Link>)}{!items.length && <div className="rounded-xl border border-dashed border-gray-300 px-3 py-8 text-center text-xs text-gray-400 dark:border-gray-700">Нет заявок</div>}</div></div>; })}</div></div></PageFrame>;
}

const dealStatuses = ["option_selected", "dossier_ready", "provider_reviewing", "provider_needs_info", "provider_accepted", "provider_declined", "telegram_created", "zoom_scheduled", "negotiating", "won", "lost"];

export function DealDeskPage() {
  const { leads } = useControlBridge();
  const deals = leads.filter((lead) => dealStatuses.includes(lead.status || ""));
  const nextAction = (status?: string | null) => {
    if (status === "option_selected") return "Проверить досье и передать PSP";
    if (status === "provider_reviewing") return "Получить решение PSP";
    if (status === "provider_needs_info") return "Запросить недостающие данные";
    if (status === "provider_accepted") return "Создать общий Telegram‑чат";
    if (status === "telegram_created") return "Назначить Zoom";
    if (["zoom_scheduled", "negotiating"].includes(status || "")) return "Зафиксировать результат";
    if (["won", "lost"].includes(status || "")) return "Сделка закрыта";
    return "Открыть Deal Desk";
  };
  return <PageFrame title="Сделки" description="Очередь PSP review и знакомств."><PageHeading eyebrow="Deal Desk" title="Сделки и знакомства" description="Рабочая очередь от выбранного оффера до общего Telegram‑чата, Zoom и фактического запуска."/><div className="grid grid-cols-1 gap-4 xl:grid-cols-2">{deals.map((lead) => <Link key={lead.lead_id} to={`/merchants/${lead.lead_id}?tab=deal`} className="rounded-2xl border border-gray-200 bg-white p-5 shadow-theme-xs transition hover:border-brand-300 dark:border-gray-800 dark:bg-gray-900"><div className="flex items-start justify-between gap-4"><div><strong className="text-lg text-gray-900 dark:text-white">{lead.company || "Без названия"}</strong><p className="mt-1 text-sm text-gray-500">{lead.name || "Контакт не указан"} · {lead.work_email || lead.telegram || "нет канала"}</p></div><StatusPill status={lead.status}/></div><div className="mt-5 rounded-xl bg-gray-50 px-4 py-3 dark:bg-white/[0.03]"><span className="text-xs uppercase tracking-wide text-gray-400">Следующее действие</span><strong className="mt-1 block text-sm text-gray-800 dark:text-white/90">{nextAction(lead.status)}</strong></div></Link>)}{!deals.length && <Panel className="xl:col-span-2"><EmptyState title="Активных сделок нет" description="После выбора оффера клиентом сделка автоматически появится здесь."/></Panel>}</div></PageFrame>;
}

export function MerchantsPage() {
  const { leads } = useControlBridge();
  const [scope, setScope] = useState<"active" | "history" | "all">("active");
  const [query, setQuery] = useState("");
  const historicalStatuses = ["closed", "spam", "lost"];
  const visible = leads.filter((lead) => {
    const historical = lead.record_state === "archived" || historicalStatuses.includes(lead.status || "");
    if (scope === "active" && historical) return false;
    if (scope === "history" && !historical) return false;
    if (!query.trim()) return true;
    return [lead.company, lead.name, lead.work_email, lead.telegram, lead.vertical, lead.company_url]
      .filter(Boolean).join(" ").toLowerCase().includes(query.trim().toLowerCase());
  });
  return <PageFrame title="Мерчи" description="Реестр мерчей и заявок."><PageHeading eyebrow="CRM" title="Мерчи" description="Компании, контакты, запросы, владельцы и состояние сделки — без тестового и закрытого мусора в рабочей очереди."/><Panel className="mb-5"><div className="flex flex-col gap-3 lg:flex-row lg:items-center lg:justify-between"><div className="flex flex-wrap gap-2">{[["active","В работе"],["history","История"],["all","Все"]].map(([value,label]) => <button key={value} onClick={() => setScope(value as typeof scope)} className={`rounded-lg px-3 py-2 text-sm ${scope === value ? "bg-brand-500 text-white" : "bg-gray-100 text-gray-600 dark:bg-white/5 dark:text-gray-300"}`}>{label}</button>)}</div><input value={query} onChange={(event) => setQuery(event.target.value)} placeholder="Найти компанию, контакт или email…" className="h-10 w-full rounded-lg border border-gray-200 px-3 text-sm outline-none focus:border-brand-400 dark:border-gray-700 dark:bg-gray-900 dark:text-white lg:max-w-sm"/></div><p className="mt-3 text-xs text-gray-400">Показано {visible.length} из {leads.length}. Закрытые, spam и lost находятся в «Истории».</p></Panel><LeadTable leads={visible}/></PageFrame>;
}

function LeadTable({ leads }: { leads: Lead[] }) {
  if (!leads.length) return <Panel><EmptyState title="Заявок пока нет" description="Новые мерчи появятся здесь из формы, агента или ручного добавления."/></Panel>;
  return <>
    <div className="space-y-3 md:hidden">{leads.map((lead)=><Link key={lead.lead_id} to={`/merchants/${lead.lead_id}`} className="block rounded-2xl border border-gray-200 bg-white p-4 shadow-theme-xs dark:border-gray-800 dark:bg-gray-900"><div className="flex items-start justify-between gap-3"><div className="min-w-0"><strong className="block truncate text-sm text-gray-900 dark:text-white">{lead.company || "Без названия"}</strong><span className="mt-1 block truncate text-xs text-gray-400">{lead.name || lead.work_email || lead.telegram || "Контакт не указан"}</span></div><StatusPill status={lead.status}/></div><div className="mt-4 grid grid-cols-2 gap-3 border-t border-gray-100 pt-3 text-xs dark:border-gray-800"><div><span className="block text-gray-400">Запрос</span><strong className="mt-1 block text-gray-700 dark:text-gray-300">{lead.vertical || "—"} · {list(lead.geos)}</strong></div><div><span className="block text-gray-400">Обновлено</span><strong className="mt-1 block text-gray-700 dark:text-gray-300">{date(lead.updated_at || lead.submitted_at)}</strong></div></div></Link>)}</div>
    <Panel className="hidden overflow-hidden !p-0 md:block">
    <div className="overflow-x-auto"><table className="min-w-full">
      <thead className="bg-gray-50 dark:bg-white/[0.03]"><tr>{["Компания", "Контакт", "Запрос", "Статус", "Обновлено", "Действие"].map((head) => <th key={head} className="px-5 py-3 text-left text-xs font-semibold uppercase tracking-wide text-gray-500">{head}</th>)}</tr></thead>
      <tbody className="divide-y divide-gray-100 dark:divide-gray-800">{leads.map((lead) => <tr key={lead.lead_id} className="hover:bg-gray-50/70 dark:hover:bg-white/[0.02]">
        <td className="px-5 py-4"><strong className="block text-sm text-gray-900 dark:text-white">{lead.company || "Без названия"}</strong><span className="mt-1 block text-xs text-gray-400">{lead.company_url || lead.lead_id.slice(0, 8)}</span></td>
        <td className="px-5 py-4 text-sm text-gray-600 dark:text-gray-300">{lead.name || "—"}<span className="block text-xs text-gray-400">{lead.work_email || lead.telegram || "—"}</span></td>
        <td className="px-5 py-4 text-sm text-gray-600 dark:text-gray-300">{lead.vertical || "—"}<span className="block text-xs text-gray-400">{list(lead.geos)} · {list(lead.methods)}</span></td>
        <td className="px-5 py-4"><StatusPill status={lead.status}/></td><td className="px-5 py-4 text-sm text-gray-500">{date(lead.updated_at || lead.submitted_at)}</td>
        <td className="px-5 py-4"><Link to={`/merchants/${lead.lead_id}`} className="text-sm font-medium text-brand-500 hover:text-brand-600">Открыть →</Link></td>
      </tr>)}</tbody>
    </table></div>
  </Panel></>;
}

export function ProvidersPage() {
  const { providers } = useControlBridge();
  const [scope, setScope] = useState<"active" | "history" | "all">("active");
  const visible = providers.filter((provider) => scope === "all" || (scope === "history" ? provider.relationship_status === "archived" : provider.relationship_status !== "archived"));
  return <PageFrame title="PSP" description="Закрытый реестр PSP."><PageHeading eyebrow="Private supply" title="PSP и партнёры" description="Настоящие названия, контакты, tier и история доступны только команде OfferPSP." action={<Link to="/psps/new" className="rounded-lg bg-brand-500 px-4 py-2.5 text-sm font-medium text-white">Добавить PSP</Link>}/><Panel className="mb-5"><div className="flex flex-wrap gap-2">{[["active","Рабочие"],["history","Архив"],["all","Все"]].map(([value,label]) => <button key={value} onClick={() => setScope(value as typeof scope)} className={`rounded-lg px-3 py-2 text-sm ${scope === value ? "bg-brand-500 text-white" : "bg-gray-100 text-gray-600 dark:bg-white/5 dark:text-gray-300"}`}>{label}</button>)}</div><p className="mt-3 text-xs text-gray-400">Показано {visible.length} из {providers.length}. Ушедшие и тестовые PSP остаются в истории, но не мешают работе.</p></Panel><div className="grid grid-cols-1 gap-4 lg:grid-cols-2 xl:grid-cols-3">{visible.map((provider) => <Panel key={provider.id}><div className="flex items-start justify-between"><div><span className="text-xs font-semibold uppercase tracking-wide text-brand-500">{provider.internal_code || "PSP"}</span><h2 className="mt-2 text-xl font-semibold text-gray-900 dark:text-white">{provider.brand_name}</h2><p className="mt-1 text-sm text-gray-500">{provider.legal_name || provider.website || "Юридические данные не заполнены"}</p></div><StatusPill status={provider.relationship_status}/></div><div className="mt-5 grid grid-cols-3 gap-3 border-t border-gray-100 pt-4 text-center dark:border-gray-800"><div><strong className="block text-lg text-gray-900 dark:text-white">{provider.route_count || 0}</strong><span className="text-xs text-gray-400">офферов</span></div><div><strong className="block text-lg text-gray-900 dark:text-white">{provider.published_route_count || 0}</strong><span className="text-xs text-gray-400">live</span></div><div><strong className="block text-lg text-gray-900 dark:text-white">{provider.strategic_priority ?? "—"}</strong><span className="text-xs text-gray-400">приоритет</span></div></div><Link to={`/psps/${provider.id}`} className="mt-5 block w-full rounded-lg border border-gray-200 px-4 py-2 text-center text-sm font-medium text-gray-700 hover:border-brand-300 hover:text-brand-500 dark:border-gray-700 dark:text-gray-300">Открыть workspace</Link></Panel>)}{!visible.length && <Panel className="lg:col-span-2 xl:col-span-3"><EmptyState title="PSP не найдены" description="Измените фильтр или добавьте нового партнёра."/></Panel>}</div></PageFrame>;
}

export function OffersPage() {
  const { routes } = useControlBridge();
  const [status, setStatus] = useState("all");
  const [providerId, setProviderId] = useState("all");
  const [geo, setGeo] = useState("all");
  const [currency, setCurrency] = useState("all");
  const [method, setMethod] = useState("all");
  const [flow, setFlow] = useState("all");
  const [health, setHealth] = useState("all");
  const [query, setQuery] = useState("");
  const providers = useMemo(() => Array.from(new Map(routes.map((route)=>[route.provider_id, { id: route.provider_id, name: route.provider_name || route.provider_code || "Без названия", code: route.provider_code }])).values()).sort((a,b)=>a.name.localeCompare(b.name)), [routes]);
  const geos = useMemo(()=>Array.from(new Set(routes.flatMap((route)=>route.geos || []).filter(Boolean))).sort(), [routes]);
  const currencies = useMemo(()=>Array.from(new Set(routes.flatMap((route)=>route.currencies || []).filter(Boolean))).sort(), [routes]);
  const methods = useMemo(()=>Array.from(new Set(routes.flatMap((route)=>route.methods || []).filter(Boolean))).sort(), [routes]);
  const needle = query.trim().toLowerCase();
  const visible = useMemo(()=>routes.filter((route) => {
    if (status !== "all" && route.status !== status) return false;
    if (providerId !== "all" && route.provider_id !== providerId) return false;
    if (geo !== "all" && !(route.geos || []).includes(geo)) return false;
    if (currency !== "all" && !(route.currencies || []).includes(currency)) return false;
    if (method !== "all" && !(route.methods || []).includes(method)) return false;
    if (flow !== "all" && route.flow !== flow) return false;
    if (health === "errors" && !Number(route.open_error_count || 0)) return false;
    if (health === "warnings" && !Number(route.open_warning_count || 0)) return false;
    if (health === "stale" && !route.is_stale) return false;
    if (health === "ready" && (Number(route.open_error_count || 0) || route.is_stale)) return false;
    if (needle && ![route.provider_name, route.provider_code, route.client_title, route.route_code, ...(route.geos || []), ...(route.currencies || []), ...(route.methods || []), ...(route.verticals || [])].filter(Boolean).join(" ").toLowerCase().includes(needle)) return false;
    return true;
  }), [routes, status, providerId, geo, currency, method, flow, health, needle]);
  const groups = useMemo(()=>providers.map((provider)=>({provider, routes:visible.filter((route)=>route.provider_id===provider.id)})).filter((group)=>group.routes.length), [providers, visible]);
  const selectClass = "h-10 min-w-0 rounded-lg border border-gray-200 bg-white px-3 text-sm text-gray-700 outline-none focus:border-brand-400 dark:border-gray-700 dark:bg-gray-900 dark:text-gray-200";
  const reset = () => { setStatus("all"); setProviderId("all"); setGeo("all"); setCurrency("all"); setMethod("all"); setFlow("all"); setHealth("all"); setQuery(""); };
  return <PageFrame title="Офферы" description="Маршруты и rate cards.">
    <PageHeading eyebrow="Offer operations" title="Офферы и маршруты" description="Каталог разделён по PSP. Фильтры позволяют быстро найти конкретный GEO, валюту, метод, поток и рабочее состояние."/>
    <Panel className="mb-5">
      <div className="flex flex-wrap gap-2">{[["all","Все"],["published","Опубликованы"],["draft","Черновики"],["review","На проверке"],["paused","Пауза"],["archived","Архив"]].map(([value,label]) => <button key={value} onClick={() => setStatus(value)} className={`rounded-lg px-3 py-2 text-sm ${status === value ? "bg-brand-500 text-white" : "bg-gray-100 text-gray-600 dark:bg-white/5 dark:text-gray-300"}`}>{label}</button>)}</div>
      <div className="mt-4 grid grid-cols-1 gap-3 md:grid-cols-2 xl:grid-cols-4"><input value={query} onChange={(event)=>setQuery(event.target.value)} className={selectClass} placeholder="PSP, маршрут, GEO, метод…"/><select value={providerId} onChange={(event)=>setProviderId(event.target.value)} className={selectClass}><option value="all">Все PSP</option>{providers.map((provider)=><option key={provider.id} value={provider.id}>{provider.name} · {routes.filter((route)=>route.provider_id===provider.id).length}</option>)}</select><select value={geo} onChange={(event)=>setGeo(event.target.value)} className={selectClass}><option value="all">Все GEO</option>{geos.map((value)=><option key={value}>{value}</option>)}</select><select value={currency} onChange={(event)=>setCurrency(event.target.value)} className={selectClass}><option value="all">Все валюты</option>{currencies.map((value)=><option key={value}>{value}</option>)}</select><select value={method} onChange={(event)=>setMethod(event.target.value)} className={selectClass}><option value="all">Все методы</option>{methods.map((value)=><option key={value}>{value}</option>)}</select><select value={flow} onChange={(event)=>setFlow(event.target.value)} className={selectClass}><option value="all">Все потоки</option><option value="payin">PayIn</option><option value="payout">PayOut</option><option value="both">PayIn + PayOut</option></select><select value={health} onChange={(event)=>setHealth(event.target.value)} className={selectClass}><option value="all">Любая готовность</option><option value="ready">Готовы к работе</option><option value="errors">С ошибками</option><option value="warnings">С предупреждениями</option><option value="stale">Устарели</option></select><button onClick={reset} className="h-10 rounded-lg border border-gray-200 px-3 text-sm font-semibold text-gray-600 hover:border-brand-300 hover:text-brand-500 dark:border-gray-700 dark:text-gray-300">Сбросить фильтры</button></div>
      <p className="mt-4 text-xs text-gray-400">Показано {visible.length} из {routes.length} маршрутов · {groups.length} PSP. Каждый оффер открывается в полном редакторе.</p>
    </Panel>
    <div className="space-y-5">{groups.map(({provider, routes:providerRoutes})=><Panel key={provider.id} className="overflow-hidden !p-0"><div className="flex flex-col gap-3 border-b border-gray-200 bg-gray-50 px-5 py-4 sm:flex-row sm:items-center sm:justify-between dark:border-gray-800 dark:bg-white/[0.03]"><div><div className="flex items-center gap-3"><h2 className="text-lg font-semibold text-gray-900 dark:text-white">{provider.name}</h2><span className="rounded-full bg-brand-50 px-2.5 py-1 text-xs font-semibold text-brand-700 dark:bg-brand-500/10 dark:text-brand-300">{providerRoutes.length} офферов</span></div><p className="mt-1 text-xs text-gray-400">{provider.code || "внутренний код не указан"}</p></div><Link to={`/psps/${provider.id}?tab=offers`} className="text-sm font-semibold text-brand-500">Открыть PSP и добавить оффер →</Link></div><div className="overflow-x-auto"><table className="min-w-full"><thead><tr>{["Оффер", "GEO и валюта", "Метод и поток", "Проверки", "Статус", ""].map((head)=><th key={head} className="px-5 py-3 text-left text-xs font-semibold uppercase tracking-wide text-gray-500">{head}</th>)}</tr></thead><tbody className="divide-y divide-gray-100 dark:divide-gray-800">{providerRoutes.map((route)=><tr key={route.route_id} className="hover:bg-gray-50/70 dark:hover:bg-white/[0.02]"><td className="px-5 py-4"><strong className="text-sm text-gray-900 dark:text-white">{route.client_title || route.route_code}</strong><span className="block text-xs text-gray-400">{route.route_code} · v{route.batch_version || "—"}</span></td><td className="px-5 py-4 text-sm text-gray-600 dark:text-gray-300">{list(route.geos)}<span className="block text-xs text-gray-400">{list(route.currencies)}</span></td><td className="px-5 py-4 text-sm text-gray-600 dark:text-gray-300">{list(route.methods)}<span className="block text-xs text-gray-400">{route.flow || "—"}</span></td><td className="px-5 py-4"><span className={Number(route.open_error_count || 0) ? "text-error-600" : "text-success-600"}>{Number(route.open_error_count || 0)} ошибок</span><span className="block text-xs text-gray-400">{Number(route.open_warning_count || 0)} предупреждений{route.is_stale ? " · устарел" : ""}</span></td><td className="px-5 py-4"><StatusPill status={route.status}/></td><td className="px-5 py-4 text-right"><Link to={`/psps/${route.provider_id}?route=${route.route_id}&tab=offers`} className="text-sm font-semibold text-brand-500">Редактировать →</Link></td></tr>)}</tbody></table></div></Panel>)}{!groups.length&&<Panel><EmptyState title="Офферы не найдены" description="Сбросьте часть фильтров или добавьте оффер из workspace нужного PSP."/></Panel>}</div>
  </PageFrame>;
}

export function IntelligencePage() {
  return <PageFrame title="Разведка" description="AI lead intelligence."><PageHeading eyebrow="AI & Telegram" title="Разведка iGaming‑рынка" description="Отдельный агент становится источником лидов внутри общей системы, а не соседним ботом без учёта результата." action={<button className="rounded-lg bg-brand-500 px-4 py-2.5 text-sm font-medium text-white">Новая поисковая миссия</button>}/><div className="grid grid-cols-1 gap-6 xl:grid-cols-3"><Panel className="xl:col-span-2"><div className="flex items-center justify-between"><div><span className="inline-flex items-center gap-2 rounded-full bg-success-50 px-3 py-1 text-xs font-semibold text-success-700 dark:bg-success-500/10 dark:text-success-300"><span className="h-2 w-2 rounded-full bg-success-500"/>Активен</span><h2 className="mt-4 text-xl font-semibold text-gray-900 dark:text-white">iGaming Lead Hunter Agent</h2><p className="mt-2 text-sm text-gray-500 dark:text-gray-400">Groq · Llama 3.3 70B · SerpAPI · загрузка страниц · память 8 сообщений</p></div><span className="rounded-xl bg-gray-100 px-4 py-3 text-center dark:bg-white/5"><strong className="block text-2xl text-gray-900 dark:text-white">6</strong><span className="text-xs text-gray-400">узлов</span></span></div><div className="mt-6 grid grid-cols-1 gap-3 sm:grid-cols-3">{[["Найти", "новые казино и PSP"],["Проверить", "сайт, GEO и контакты"],["Передать", "лид в общую очередь"]].map(([title,description], index)=><div key={title} className="rounded-xl border border-gray-200 p-4 dark:border-gray-800"><span className="text-xs font-semibold text-brand-500">0{index+1}</span><strong className="mt-2 block text-sm text-gray-900 dark:text-white">{title}</strong><span className="mt-1 block text-xs text-gray-500">{description}</span></div>)}</div><div className="mt-6 rounded-xl border border-warning-200 bg-warning-50 p-4 dark:border-warning-500/20 dark:bg-warning-500/10"><strong className="text-sm text-warning-800 dark:text-warning-300">Текущий разрыв</strong><p className="mt-1 text-sm text-warning-700 dark:text-warning-400">Агент умеет искать и исследовать, но ещё не сохраняет найденный лид в управляемую очередь OfferPSP. Следующий технический контракт: mission → candidate → qualified lead → merchant pipeline.</p></div></Panel><Panel><h2 className="text-lg font-semibold text-gray-900 dark:text-white">Контур контроля</h2><div className="mt-5 space-y-4">{[["Источник", "AI Agent / ручной / рекомендация"],["Владелец", "назначается после квалификации"],["Конфиденциальность", "PSP скрыт до знакомства"],["Результат", "Telegram → Zoom → launch"]].map(([label,value])=><div key={label} className="border-b border-gray-100 pb-3 last:border-0 dark:border-gray-800"><span className="block text-xs text-gray-400">{label}</span><strong className="mt-1 block text-sm text-gray-800 dark:text-white/90">{value}</strong></div>)}</div></Panel></div></PageFrame>;
}

export function AgentsPage() {
  const { organizations, assignments, agentMarginPolicies, commissionSummary } = useControlBridge();
  const agents = organizations.filter((organization) => organization.organization_type === "agent");
  const [scope, setScope] = useState<"active" | "history" | "all">("active");
  const visible = agents.filter((agent) => scope === "all" || (scope === "history" ? agent.status === "archived" : agent.status !== "archived"));
  return <PageFrame title="Субагенты" description="Портфель субагентов и комиссий."><PageHeading eyebrow="Partner network" title="Субагенты" description="Атрибуция мерчей, отдельная наценка, сделки и commission ledger — без раскрытия поставщика." action={<Link to="/agents/new" className="rounded-lg bg-brand-500 px-4 py-2.5 text-sm font-medium text-white">Добавить агента</Link>}/><div className="mb-6 grid grid-cols-1 gap-4 md:grid-cols-4"><Metric label="Агентские организации" value={agents.filter((agent) => agent.status !== "archived").length} hint="рабочих партнёров"/><Metric label="Закрепления" value={assignments.filter((assignment) => assignment.status === "active").length} hint="активных мерчей за агентами"/><Metric label="Правила маржи" value={agentMarginPolicies.filter((policy) => policy.active).length} hint="активных версий"/><Metric label="Начислено" value={Object.values(commissionSummary).reduce((sum, value)=>sum+Number(value || 0),0)} hint="записей commission ledger" tone="success"/></div><Panel className="mb-5"><div className="flex flex-wrap gap-2">{[["active","Рабочие"],["history","Архив"],["all","Все"]].map(([value,label]) => <button key={value} onClick={() => setScope(value as typeof scope)} className={`rounded-lg px-3 py-2 text-sm ${scope === value ? "bg-brand-500 text-white" : "bg-gray-100 text-gray-600 dark:bg-white/5 dark:text-gray-300"}`}>{label}</button>)}</div></Panel><Panel>{visible.length ? <div className="divide-y divide-gray-100 dark:divide-gray-800">{visible.map((agent)=><Link to={`/agents/${agent.id}`} key={agent.id} className="flex flex-col gap-3 py-4 first:pt-0 last:pb-0 sm:flex-row sm:items-center sm:justify-between"><div><strong className="text-sm text-gray-900 hover:text-brand-500 dark:text-white">{agent.name}</strong><span className="mt-1 block text-xs text-gray-400">{agent.internal_code || "код не назначен"} · {agent.member_count || 0} пользователей</span></div><div className="flex items-center gap-3"><span className="text-sm text-gray-500">{agent.merchant_count || 0} мерчей</span><StatusPill status={agent.status}/></div></Link>)}</div> : <EmptyState title="Субагенты не найдены" description="Измените фильтр или добавьте первого партнёра."/>}</Panel></PageFrame>;
}

export function AnalyticsPage() {
  const { leads, providers, routes } = useControlBridge();
  const operationalLeads = leads.filter((lead)=>lead.record_state !== "archived" && !["closed","spam"].includes(lead.status || ""));
  const stageRank: Record<string, number> = {
    new: 0, qualifying: 0, needs_clarification: 0,
    matching: 1, matched: 1,
    shortlist_ready: 2, shared: 2, option_selected: 2, dossier_ready: 2,
    provider_reviewing: 3, provider_needs_info: 3, provider_declined: 3,
    provider_accepted: 4, telegram_created: 4, zoom_scheduled: 4, negotiating: 4,
    won: 5, lost: 5,
  };
  const funnel = [
    { label: "Все заявки", value: operationalLeads.length },
    { label: "Начат подбор", value: operationalLeads.filter((lead)=>Number(stageRank[lead.status || ""] ?? 0) >= 1).length },
    { label: "Shortlist", value: operationalLeads.filter((lead)=>Number(stageRank[lead.status || ""] ?? 0) >= 2).length },
    { label: "PSP принял", value: operationalLeads.filter((lead)=>Number(stageRank[lead.status || ""] ?? 0) >= 4).length },
    { label: "Live processing", value: operationalLeads.filter((lead)=>lead.status === "won").length },
  ];
  const funnelMax = Math.max(1, funnel[0].value);
  const liveRoutes = routes.filter((route)=>route.status === "published").length;
  const errors = routes.reduce((sum,route)=>sum+Number(route.open_error_count || 0),0);
  const activeProviders = providers.filter((provider)=>provider.relationship_status !== "archived");
  const geoCounts = Array.from(routes.reduce((map,route)=>{(route.geos || []).forEach((geo)=>map.set(geo,(map.get(geo)||0)+1));return map;},new Map<string,number>()).entries()).sort((a,b)=>b[1]-a[1]).slice(0,6);
  const maxGeo = Math.max(1,...geoCounts.map(([,count])=>count));
  const now = new Date();
  const weekly = Array.from({length:6},(_,index)=>{
    const end = new Date(now); end.setDate(now.getDate()-(5-index)*7);
    const start = new Date(end); start.setDate(end.getDate()-6); start.setHours(0,0,0,0); end.setHours(23,59,59,999);
    return {label:new Intl.DateTimeFormat("ru-RU",{day:"2-digit",month:"short"}).format(start),value:operationalLeads.filter((lead)=>{const value=lead.submitted_at?new Date(lead.submitted_at):null;return value&&value>=start&&value<=end;}).length};
  });
  const weeklyMax = Math.max(1,...weekly.map((item)=>item.value));
  const linePoints = weekly.map((item,index)=>`${20+index*112},${160-(item.value/weeklyMax)*125}`).join(" ");
  const launchRate = operationalLeads.length ? Math.round(operationalLeads.filter((lead)=>lead.status === "won").length/operationalLeads.length*100) : 0;
  const shortlistRate = funnel[1].value ? Math.round(funnel[2].value/funnel[1].value*100) : 0;
  return <PageFrame title="Аналитика" description="Воронка и качество supply."><PageHeading eyebrow="Business intelligence" title="Аналитика, которая отвечает на вопросы" description="Где тормозят сделки, достаточно ли покрытие и что требует внимания — без тестовых и архивных записей в рабочих показателях."/><div className="grid grid-cols-2 gap-3 xl:grid-cols-4"><Metric label="Launch conversion" value={`${launchRate}%`} hint={`${operationalLeads.filter((lead)=>lead.status === "won").length} запусков из ${operationalLeads.length} рабочих заявок`} tone="success"/><Metric label="Shortlist conversion" value={`${shortlistRate}%`} hint="от начатого подбора до shortlist"/><Metric label="Live coverage" value={`${liveRoutes}/${routes.length}`} hint="опубликовано маршрутов"/><Metric label="Supply blockers" value={errors} hint="открытых ошибок нормализации" tone={errors?"warning":"success"}/></div><div className="mt-6 grid grid-cols-1 gap-6 xl:grid-cols-3"><Panel className="xl:col-span-2"><div className="flex items-start justify-between gap-4"><div><h2 className="text-lg font-semibold text-gray-900 dark:text-white">Воронка до запуска</h2><p className="mt-1 text-sm text-gray-500">Кумулятивное прохождение, а не количество карточек в колонке.</p></div><span className="rounded-lg bg-gray-50 px-3 py-2 text-xs text-gray-500 dark:bg-white/[0.03]">{operationalLeads.length} рабочих заявок</span></div><div className="mt-7 space-y-4">{funnel.map((stage,index)=><div key={stage.label} className="grid grid-cols-[110px_1fr_48px] items-center gap-3 sm:grid-cols-[150px_1fr_64px]"><span className="text-xs text-gray-500 sm:text-sm">{stage.label}</span><div className="h-9 overflow-hidden rounded-lg bg-gray-100 dark:bg-gray-800"><div className="flex h-full items-center rounded-lg bg-gradient-to-r from-brand-600 to-theme-purple-500 px-3 text-xs font-semibold text-white transition-all" style={{width:`${Math.max(stage.value?12:0,stage.value/funnelMax*100)}%`}}>{index>0&&funnel[index-1].value?`${Math.round(stage.value/funnel[index-1].value*100)}%`:""}</div></div><strong className="text-right text-sm text-gray-900 dark:text-white">{stage.value}</strong></div>)}</div></Panel><Panel><h2 className="text-lg font-semibold text-gray-900 dark:text-white">Здоровье supply</h2><p className="mt-1 text-sm text-gray-500">То, что влияет на возможность отправить оффер.</p><div className="mt-6 space-y-5">{[["Опубликованы",liveRoutes,"success"],["Черновики",routes.filter((route)=>route.status === "draft").length,"warning"],["Устарели",routes.filter((route)=>route.is_stale).length,"danger"],["Без маржи",routes.filter((route)=>!route.margin_ready).length,"danger"]].map(([label,value,tone])=><div key={String(label)}><div className="mb-2 flex justify-between text-sm"><span className="text-gray-500">{label}</span><strong className="text-gray-900 dark:text-white">{value}</strong></div><div className="h-2 rounded-full bg-gray-100 dark:bg-gray-800"><div className={`h-2 rounded-full ${tone === "success"?"bg-success-500":tone === "warning"?"bg-warning-500":"bg-error-500"}`} style={{width:`${routes.length?Math.max(5,Number(value)/routes.length*100):0}%`}}/></div></div>)}</div><div className="mt-6 rounded-xl bg-gray-50 p-4 dark:bg-white/[0.03]"><span className="text-xs text-gray-400">Рабочих PSP</span><strong className="mt-1 block text-2xl text-gray-900 dark:text-white">{activeProviders.length}</strong></div></Panel></div><div className="mt-6 grid grid-cols-1 gap-6 xl:grid-cols-2"><Panel><div className="flex items-start justify-between"><div><h2 className="text-lg font-semibold text-gray-900 dark:text-white">Новые заявки · 6 недель</h2><p className="mt-1 text-sm text-gray-500">Показывает реальный темп входящего потока.</p></div><strong className="text-2xl text-gray-900 dark:text-white">{weekly.reduce((sum,item)=>sum+item.value,0)}</strong></div><div className="mt-6 overflow-hidden"><svg viewBox="0 0 600 180" className="h-48 w-full" role="img" aria-label="Динамика новых заявок"><defs><linearGradient id="leadTrend" x1="0" x2="1"><stop offset="0" stopColor="#465fff"/><stop offset="1" stopColor="#9b51e0"/></linearGradient></defs><path d="M20 160 H580" stroke="currentColor" className="text-gray-200 dark:text-gray-800"/><polyline points={linePoints} fill="none" stroke="url(#leadTrend)" strokeWidth="5" strokeLinecap="round" strokeLinejoin="round"/>{weekly.map((item,index)=><g key={item.label}><circle cx={20+index*112} cy={160-(item.value/weeklyMax)*125} r="6" fill="#fff" stroke="#465fff" strokeWidth="4"/><text x={20+index*112} y="178" textAnchor="middle" className="fill-gray-400 text-[10px]">{item.label}</text><text x={20+index*112} y={145-(item.value/weeklyMax)*125} textAnchor="middle" className="fill-gray-700 text-[11px] font-semibold dark:fill-gray-200">{item.value}</text></g>)}</svg></div></Panel><Panel><h2 className="text-lg font-semibold text-gray-900 dark:text-white">Покрытие GEO</h2><p className="mt-1 text-sm text-gray-500">Где сейчас больше всего доступных маршрутов.</p><div className="mt-6 space-y-4">{geoCounts.map(([geo,count])=><div key={geo}><div className="mb-2 flex items-center justify-between text-sm"><span className="font-medium text-gray-700 dark:text-gray-300">{geo}</span><strong className="text-gray-900 dark:text-white">{count}</strong></div><div className="h-2.5 rounded-full bg-gray-100 dark:bg-gray-800"><div className="h-2.5 rounded-full bg-gradient-to-r from-brand-500 to-theme-purple-500" style={{width:`${count/maxGeo*100}%`}}/></div></div>)}{!geoCounts.length&&<EmptyState title="Нет данных покрытия" description="GEO появятся после нормализации маршрутов."/>}</div></Panel></div></PageFrame>;
}

const moduleCopy: Record<string, { eyebrow: string; title: string; description: string; capabilities: string[] }> = {
  matching: { eyebrow: "Matching workbench", title: "Подбор решений", description: "Сопоставление запроса с конкретными маршрутами без раскрытия PSP клиенту.", capabilities: ["Hard gates: GEO, currency, method, flow", "PSP rate → OfferPSP margin → agent margin", "Ручное включение и исключение с причиной", "Preview Telegram‑оффера перед отправкой"] },
  deals: { eyebrow: "Deal desk", title: "Сделки", description: "Досье → PSP review → Telegram → Zoom → live processing.", capabilities: ["Очередь решений клиента", "Полное досье для PSP", "Раунды вопросов и решений", "Telegram, Zoom, won/lost"] },
  communications: { eyebrow: "Omnichannel", title: "Коммуникации", description: "Переписка с мерчами, PSP и субагентами в контексте сделки.", capabilities: ["Клиентские сообщения", "Telegram уведомления", "Email delivery log", "Шаблоны и напоминания"] },
  operations: { eyebrow: "Operations", title: "Задачи и календарь", description: "Общая очередь работы, сроки и автоматические follow‑ups.", capabilities: ["My tasks", "Просроченные действия", "SLA по этапам", "Календарь Zoom и freshness"] },
  integrations: { eyebrow: "System", title: "Интеграции", description: "Рабочее состояние внешних сервисов и автоматизаций.", capabilities: ["Supabase", "n8n", "Telegram", "Vercel и email"] },
};

export function ModulePage({ module }: { module: keyof typeof moduleCopy }) {
  const copy = moduleCopy[module];
  const { leads, routes } = useControlBridge();
  return <PageFrame title={copy.title} description={copy.description}><PageHeading eyebrow={copy.eyebrow} title={copy.title} description={copy.description}/><div className="grid grid-cols-1 gap-6 xl:grid-cols-3"><Panel className="xl:col-span-2"><h2 className="text-lg font-semibold text-gray-900 dark:text-white">Рабочий контур</h2><div className="mt-5 grid grid-cols-1 gap-4 sm:grid-cols-2">{copy.capabilities.map((capability,index)=><div key={capability} className="rounded-xl border border-gray-200 p-4 dark:border-gray-800"><span className="text-xs font-semibold text-brand-500">0{index+1}</span><strong className="mt-2 block text-sm text-gray-800 dark:text-white/90">{capability}</strong></div>)}</div></Panel><Panel><h2 className="text-lg font-semibold text-gray-900 dark:text-white">Состояние ядра</h2><div className="mt-5 space-y-4"><div><span className="text-xs text-gray-400">Активных заявок</span><strong className="block text-2xl text-gray-900 dark:text-white">{leads.filter((lead)=>activeStatuses.includes(lead.status || "")).length}</strong></div><div><span className="text-xs text-gray-400">Доступно маршрутов</span><strong className="block text-2xl text-gray-900 dark:text-white">{routes.length}</strong></div><p className="rounded-lg bg-brand-50 p-3 text-xs text-brand-700 dark:bg-brand-500/10 dark:text-brand-300">Экран включён в V2. Операции подключаются к уже существующим RPC без замены бизнес‑логики.</p></div></Panel></div></PageFrame>;
}
