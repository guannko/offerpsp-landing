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
  const operationalProviders = providers.filter((provider) => provider.relationship_status !== "archived");
  const stats = useMemo(() => ({
    newLeads: leads.filter((lead) => lead.status === "new").length,
    needsData: leads.filter((lead) => ["needs_clarification", "provider_needs_info"].includes(lead.status || "")).length,
    activeDeals: leads.filter((lead) => activeStatuses.includes(lead.status || "") && !["new", "qualifying", "needs_clarification"].includes(lead.status || "")).length,
    won: leads.filter((lead) => lead.status === "won").length,
    unassigned: leads.filter((lead) => !lead.owner_user_id).length,
    staleRoutes: routes.filter((route) => route.is_stale).length,
    blockedRoutes: routes.filter((route) => Number(route.open_error_count || 0) > 0).length,
    agents: organizations.filter((organization) => organization.organization_type === "agent" && organization.status === "active").length,
  }), [leads, routes, organizations]);

  const attention = [
    { label: "Новые заявки", count: stats.newLeads, path: "/inbox", hint: "нужно проверить и назначить ответственного" },
    { label: "Запросы без владельца", count: stats.unassigned, path: "/pipeline", hint: "могут зависнуть без следующего действия" },
    { label: "Нужны данные", count: stats.needsData, path: "/merchants", hint: "ждём уточнения от мерча или PSP" },
    { label: "Маршруты с ошибками", count: stats.blockedRoutes, path: "/offers", hint: "нельзя публиковать до исправления" },
    { label: "Устаревшие маршруты", count: stats.staleRoutes, path: "/offers", hint: "нужно подтвердить актуальность у PSP" },
  ].filter((item) => item.count > 0);

  const funnel = [
    ["Заявки", leads.length],
    ["В работе", leads.filter((lead) => activeStatuses.includes(lead.status || "")).length],
    ["Переданы PSP", leads.filter((lead) => ["provider_reviewing", "provider_needs_info", "provider_accepted", "telegram_created", "zoom_scheduled", "negotiating", "won"].includes(lead.status || "")).length],
    ["Запущены", stats.won],
  ] as const;
  const maxFunnel = Math.max(1, ...funnel.map(([, value]) => value));

  return <PageFrame title="Командный центр" description="Единая операционная панель OfferPSP и лидогенерации.">
    <PageHeading eyebrow="OfferPSP Control Bridge" title="Что требует внимания сегодня" description="Не витрина цифр, а рабочая очередь: заявки, офферы, сделки и риски в одном месте." action={<button onClick={() => void refresh()} disabled={refreshing} className="rounded-lg bg-brand-500 px-4 py-2.5 text-sm font-medium text-white hover:bg-brand-600 disabled:opacity-50">{refreshing ? "Обновляю…" : "Обновить данные"}</button>}/>
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
  return <PageFrame title="Воронка" description="Kanban сделок OfferPSP."><PageHeading eyebrow="Merchant pipeline" title="Воронка сделок" description="Каждая карточка показывает этап, следующий шаг и владельца. Перетаскивание добавим только после привязки transition rules."/><div className="grid min-w-[1100px] grid-cols-5 gap-4 overflow-x-auto pb-3">{pipelineColumns.map((column) => { const items = leads.filter((lead) => column.statuses.includes(lead.status || "")); return <div key={column.title} className="rounded-2xl bg-gray-100/70 p-3 dark:bg-white/[0.03]"><div className="mb-3 flex items-center justify-between"><h2 className="text-sm font-semibold text-gray-800 dark:text-white/90">{column.title}</h2><span className="rounded-full bg-white px-2 py-0.5 text-xs text-gray-500 dark:bg-gray-800">{items.length}</span></div><div className="space-y-3">{items.map((lead) => <Link to={`/merchants/${lead.lead_id}`} key={lead.lead_id} className="block rounded-xl border border-gray-200 bg-white p-4 shadow-theme-xs transition hover:border-brand-300 dark:border-gray-800 dark:bg-gray-900"><div className="flex items-start justify-between gap-2"><strong className="text-sm text-gray-900 dark:text-white">{lead.company || "Без названия"}</strong><span className="h-2 w-2 shrink-0 rounded-full bg-brand-500"/></div><p className="mt-2 text-xs text-gray-500">{lead.vertical || "Вертикаль не указана"} · {list(lead.geos)}</p><div className="mt-3"><StatusPill status={lead.status}/></div><p className="mt-3 border-t border-gray-100 pt-3 text-xs text-gray-400 dark:border-gray-800">Следующий шаг: {lead.status === "new" ? "проверить заявку" : lead.status === "needs_clarification" ? "запросить данные" : "открыть карточку"}</p></Link>)}{!items.length && <div className="rounded-xl border border-dashed border-gray-300 px-3 py-8 text-center text-xs text-gray-400 dark:border-gray-700">Нет заявок</div>}</div></div>; })}</div></PageFrame>;
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
    const historical = historicalStatuses.includes(lead.status || "");
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
  return <Panel className="overflow-hidden !p-0">
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
  </Panel>;
}

export function ProvidersPage() {
  const { providers } = useControlBridge();
  const [scope, setScope] = useState<"active" | "history" | "all">("active");
  const visible = providers.filter((provider) => scope === "all" || (scope === "history" ? provider.relationship_status === "archived" : provider.relationship_status !== "archived"));
  return <PageFrame title="PSP" description="Закрытый реестр PSP."><PageHeading eyebrow="Private supply" title="PSP и партнёры" description="Настоящие названия, контакты, tier и история доступны только команде OfferPSP." action={<Link to="/psps/new" className="rounded-lg bg-brand-500 px-4 py-2.5 text-sm font-medium text-white">Добавить PSP</Link>}/><Panel className="mb-5"><div className="flex flex-wrap gap-2">{[["active","Рабочие"],["history","Архив"],["all","Все"]].map(([value,label]) => <button key={value} onClick={() => setScope(value as typeof scope)} className={`rounded-lg px-3 py-2 text-sm ${scope === value ? "bg-brand-500 text-white" : "bg-gray-100 text-gray-600 dark:bg-white/5 dark:text-gray-300"}`}>{label}</button>)}</div><p className="mt-3 text-xs text-gray-400">Показано {visible.length} из {providers.length}. Ушедшие и тестовые PSP остаются в истории, но не мешают работе.</p></Panel><div className="grid grid-cols-1 gap-4 lg:grid-cols-2 xl:grid-cols-3">{visible.map((provider) => <Panel key={provider.id}><div className="flex items-start justify-between"><div><span className="text-xs font-semibold uppercase tracking-wide text-brand-500">{provider.internal_code || "PSP"}</span><h2 className="mt-2 text-xl font-semibold text-gray-900 dark:text-white">{provider.brand_name}</h2><p className="mt-1 text-sm text-gray-500">{provider.legal_name || provider.website || "Юридические данные не заполнены"}</p></div><StatusPill status={provider.relationship_status}/></div><div className="mt-5 grid grid-cols-3 gap-3 border-t border-gray-100 pt-4 text-center dark:border-gray-800"><div><strong className="block text-lg text-gray-900 dark:text-white">{provider.route_count || 0}</strong><span className="text-xs text-gray-400">офферов</span></div><div><strong className="block text-lg text-gray-900 dark:text-white">{provider.published_route_count || 0}</strong><span className="text-xs text-gray-400">live</span></div><div><strong className="block text-lg text-gray-900 dark:text-white">{provider.strategic_priority ?? "—"}</strong><span className="text-xs text-gray-400">приоритет</span></div></div><Link to={`/psps/${provider.id}`} className="mt-5 block w-full rounded-lg border border-gray-200 px-4 py-2 text-center text-sm font-medium text-gray-700 hover:border-brand-300 hover:text-brand-500 dark:border-gray-700 dark:text-gray-300">Открыть workspace</Link></Panel>)}{!visible.length && <Panel className="lg:col-span-2 xl:col-span-3"><EmptyState title="PSP не найдены" description="Измените фильтр или добавьте нового партнёра."/></Panel>}</div></PageFrame>;
}

export function OffersPage() {
  const { routes } = useControlBridge();
  const [filter, setFilter] = useState("all");
  const visible = routes.filter((route) => filter === "all" || route.status === filter || (filter === "blocked" && Number(route.open_error_count || 0) > 0));
  return <PageFrame title="Офферы" description="Маршруты и rate cards."><PageHeading eyebrow="Offer operations" title="Офферы и маршруты" description="Любой входной формат нормализуется в единый маршрут, а клиент получает привычный Telegram‑формат без раскрытия PSP."/><Panel className="mb-5"><div className="flex flex-wrap gap-2">{[["all","Все"],["published","Опубликованы"],["draft","Черновики"],["review","На проверке"],["blocked","С ошибками"]].map(([value,label]) => <button key={value} onClick={() => setFilter(value)} className={`rounded-lg px-3 py-2 text-sm ${filter === value ? "bg-brand-500 text-white" : "bg-gray-100 text-gray-600 dark:bg-white/5 dark:text-gray-300"}`}>{label}</button>)}</div></Panel><Panel className="overflow-hidden !p-0"><div className="overflow-x-auto"><table className="min-w-full"><thead className="bg-gray-50 dark:bg-white/[0.03]"><tr>{["PSP", "Маршрут", "Покрытие", "Поток", "Проверки", "Статус"].map((head)=><th key={head} className="px-5 py-3 text-left text-xs font-semibold uppercase tracking-wide text-gray-500">{head}</th>)}</tr></thead><tbody className="divide-y divide-gray-100 dark:divide-gray-800">{visible.map((route)=><tr key={route.route_id}><td className="px-5 py-4"><Link to={`/psps/${route.provider_id}`} className="text-sm font-semibold text-gray-900 hover:text-brand-500 dark:text-white">{route.provider_name || "—"}</Link><span className="block text-xs text-gray-400">{route.provider_code}</span></td><td className="px-5 py-4"><Link to={`/psps/${route.provider_id}?route=${route.route_id}`} className="text-sm font-semibold text-gray-900 hover:text-brand-500 dark:text-white">{route.client_title || route.route_code}</Link><span className="block text-xs text-gray-400">v{route.batch_version || "—"}</span></td><td className="px-5 py-4 text-sm text-gray-600 dark:text-gray-300">{list(route.geos)}<span className="block text-xs text-gray-400">{list(route.currencies)} · {list(route.methods)}</span></td><td className="px-5 py-4 text-sm text-gray-600 dark:text-gray-300">{route.flow || "—"}</td><td className="px-5 py-4"><span className={Number(route.open_error_count || 0) ? "text-error-600" : "text-success-600"}>{Number(route.open_error_count || 0)} ошибок</span><span className="block text-xs text-gray-400">{Number(route.open_warning_count || 0)} предупреждений{route.is_stale ? " · устарел" : ""}</span></td><td className="px-5 py-4"><StatusPill status={route.status}/></td></tr>)}</tbody></table></div>{!visible.length && <div className="p-5"><EmptyState title="Маршрутов нет" description="Измените фильтр или добавьте оффер из workspace нужного PSP."/></div>}</Panel></PageFrame>;
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
  const stages = pipelineColumns.map((column) => ({ label: column.title, value: leads.filter((lead)=>column.statuses.includes(lead.status || "")).length }));
  const max = Math.max(1, ...stages.map((stage)=>stage.value));
  const liveRoutes = routes.filter((route)=>route.status === "published").length;
  return <PageFrame title="Аналитика" description="Воронка и качество supply."><PageHeading eyebrow="Business intelligence" title="Аналитика, которая отвечает на вопросы" description="Где теряются мерчи, какие PSP отвечают, какие GEO закрыты и где лежит маржа — вместо пустых vanity‑метрик."/><div className="grid grid-cols-1 gap-4 md:grid-cols-4"><Metric label="Конверсия в launch" value={`${leads.length ? Math.round(leads.filter((lead)=>lead.status === "won").length / leads.length * 100) : 0}%`} hint="от всех заявок" tone="success"/><Metric label="Live coverage" value={`${liveRoutes}/${routes.length}`} hint="опубликовано маршрутов"/><Metric label="PSP" value={providers.length} hint="в закрытом реестре"/><Metric label="Ошибки supply" value={routes.reduce((sum,route)=>sum+Number(route.open_error_count || 0),0)} hint="блокирующих проверок" tone="warning"/></div><div className="mt-6 grid grid-cols-1 gap-6 xl:grid-cols-3"><Panel className="xl:col-span-2"><h2 className="text-lg font-semibold text-gray-900 dark:text-white">Сделки по этапам</h2><div className="mt-7 flex h-72 items-end gap-4 border-b border-gray-200 px-2 dark:border-gray-800">{stages.map((stage)=><div key={stage.label} className="flex flex-1 flex-col items-center justify-end gap-2"><strong className="text-sm text-gray-800 dark:text-white">{stage.value}</strong><div className="w-full rounded-t-lg bg-gradient-to-t from-brand-600 to-theme-purple-500" style={{height:`${Math.max(stage.value ? 18 : 4, stage.value/max*220)}px`}}/><span className="h-10 text-center text-xs text-gray-500">{stage.label}</span></div>)}</div></Panel><Panel><h2 className="text-lg font-semibold text-gray-900 dark:text-white">Supply health</h2><div className="mt-6 space-y-5">{[["Опубликованы",liveRoutes,"success"],["Черновики",routes.filter((route)=>route.status === "draft").length,"warning"],["Устарели",routes.filter((route)=>route.is_stale).length,"danger"],["Без маржи",routes.filter((route)=>!route.margin_ready).length,"danger"]].map(([label,value,tone])=><div key={String(label)}><div className="mb-2 flex justify-between text-sm"><span className="text-gray-500">{label}</span><strong className="text-gray-900 dark:text-white">{value}</strong></div><div className="h-2 rounded-full bg-gray-100 dark:bg-gray-800"><div className={`h-2 rounded-full ${tone === "success" ? "bg-success-500" : tone === "warning" ? "bg-warning-500" : "bg-error-500"}`} style={{width:`${routes.length ? Math.max(5, Number(value)/routes.length*100) : 0}%`}}/></div></div>)}</div></Panel></div></PageFrame>;
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
