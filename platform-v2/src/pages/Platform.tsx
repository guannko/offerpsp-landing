import { useCallback, useEffect, useMemo, useState } from "react";
import { Link, useNavigate, useSearchParams } from "react-router";
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
import { supabase } from "../lib/supabase";
import { extractOfferSource, safeStorageName } from "../lib/offerSourceFiles";
import type { Lead, OfferIngestionJob, RouteCoverage } from "../types/offerpsp";

const activeStatuses = ["new", "qualifying", "needs_clarification", "matching", "matched", "shortlist_ready", "shared", "option_selected", "dossier_ready", "provider_reviewing", "provider_needs_info", "provider_accepted", "telegram_created", "zoom_scheduled", "negotiating"];

const list = (value: unknown) => Array.isArray(value) ? value.join(", ") : String(value || "—");
const date = (value?: string | null) => value ? new Intl.DateTimeFormat("ru-RU", { day: "2-digit", month: "short", year: "numeric" }).format(new Date(value)) : "—";

function PageFrame({ title, description, children }: { title: string; description: string; children: React.ReactNode }) {
  const bridge = useControlBridge();
  if (bridge.loading) return <SkeletonPage />;
  return <><PageMeta title={`${title} | OfferPSP`} description={description}/>{bridge.error && <ErrorBanner message={bridge.error}/>} {children}</>;
}

export function CommandCenter() {
  const { leads, providers, routes, organizations, ingestionJobs, freshnessReminders, complianceCases, lastUpdatedAt, refreshing, refresh } = useControlBridge();
  const operationalLeads = leads.filter((lead) => lead.record_state !== "archived" && !["closed", "spam"].includes(lead.status || ""));
  const operationalProviders = providers.filter((provider) => provider.relationship_status !== "archived");
  const stats = useMemo(() => ({
    newLeads: operationalLeads.filter((lead) => lead.status === "new").length,
    needsData: operationalLeads.filter((lead) => ["needs_clarification", "provider_needs_info"].includes(lead.status || "")).length,
    activeDeals: operationalLeads.filter((lead) => activeStatuses.includes(lead.status || "") && !["new", "qualifying", "needs_clarification"].includes(lead.status || "")).length,
    won: operationalLeads.filter((lead) => lead.status === "won").length,
    unassigned: operationalLeads.filter((lead) => !lead.assigned_to).length,
    pausedRoutes: routes.filter((route) => route.status === "paused").length,
    blockedRoutes: routes.filter((route) => Number(route.open_error_count || 0) > 0).length,
    agents: organizations.filter((organization) => organization.organization_type === "agent" && organization.status === "active").length,
    offerReviews: ingestionJobs.filter((job) => ["review", "failed", "duplicate"].includes(job.status) || Number(job.blocking_anomaly_count || 0) > 0).length,
    freshnessReminders: freshnessReminders.length,
    complianceReview: complianceCases.filter((item) => ["pending", "screening", "manual_review", "needs_info", "hold"].includes(item.case_status)).length,
  }), [operationalLeads, routes, organizations, ingestionJobs, freshnessReminders, complianceCases]);

  const attention = [
    { label: "Проверка входящих лидов", count: stats.complianceReview, path: "/compliance", hint: "подлинность, роль компании и готовность досье" },
    { label: "Запросы без владельца", count: stats.unassigned, path: "/pipeline", hint: "могут зависнуть без следующего действия" },
    { label: "Нужны данные", count: stats.needsData, path: "/merchants", hint: "ждём уточнения от мерча или PSP" },
    { label: "Маршруты с ошибками", count: stats.blockedRoutes, path: "/offers", hint: "нельзя публиковать до исправления" },
    { label: "Офферы ждут проверки", count: stats.offerReviews, path: "/offers?workspace=intake", hint: "новые разборы, ошибки и дубли находятся в очереди контроля" },
    { label: "PSP ждут подтверждения", count: stats.freshnessReminders, path: "/psps", hint: "n8n уже поставил задачу и подготовил сообщение партнёру" },
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
        <div className="mt-7 grid grid-cols-2 gap-3"><div className="rounded-xl bg-gray-50 p-3 dark:bg-white/[0.03]"><span className="text-xs text-gray-500">Активных агентов</span><strong className="mt-1 block text-xl text-gray-900 dark:text-white">{stats.agents}</strong></div><div className="rounded-xl bg-gray-50 p-3 dark:bg-white/[0.03]"><span className="text-xs text-gray-500">Офферов на паузе</span><strong className="mt-1 block text-xl text-gray-900 dark:text-white">{stats.pausedRoutes}</strong></div></div>
      </Panel>
    </div>
    {freshnessReminders.length > 0 && <Panel className="mt-6">
      <div className="flex flex-col gap-2 sm:flex-row sm:items-start sm:justify-between"><div><h2 className="text-lg font-semibold text-gray-900 dark:text-white">Подтверждение условий PSP</h2><p className="mt-1 text-sm text-gray-500">Единая очередь: срок, контакт и готовый текст партнёру. n8n напоминает повторно не чаще одного раза в 7 дней.</p></div><Link to="/operations" className="text-sm font-semibold text-brand-500">Все задачи →</Link></div>
      <div className="mt-5 divide-y divide-gray-100 dark:divide-gray-800">{freshnessReminders.slice(0, 8).map((reminder) => <div key={reminder.provider_id} className="grid gap-4 py-4 lg:grid-cols-[minmax(180px,0.7fr)_minmax(230px,1fr)_minmax(260px,1.5fr)_auto] lg:items-start"><div><Link to={`/psps/${reminder.provider_id}`} className="font-semibold text-gray-900 hover:text-brand-500 dark:text-white">{reminder.provider_name}</Link><span className="mt-1 block text-xs text-gray-400">{reminder.provider_code || "без кода"} · {reminder.active_route_count} офферов</span></div><div><strong className={reminder.days_overdue > 0 ? "text-sm text-error-600" : "text-sm text-warning-600"}>{reminder.days_overdue > 0 ? `Просрочено ${reminder.days_overdue} дн.` : `Подтвердить до ${date(reminder.due_at)}`}</strong><span className="mt-1 block text-xs text-gray-400">{reminder.contact_value ? `${reminder.contact_name || "Контакт"} · ${reminder.contact_value}` : "Контакт не указан — добавьте его в карточке PSP"}</span></div><p className="text-sm leading-6 text-gray-600 dark:text-gray-300">{reminder.message_ru}</p><button onClick={() => void navigator.clipboard.writeText(reminder.message_ru)} className="rounded-lg border border-gray-200 px-3 py-2 text-xs font-semibold text-gray-600 hover:border-brand-300 hover:text-brand-500 dark:border-gray-700 dark:text-gray-300">Копировать</button></div>)}</div>
    </Panel>}
  </PageFrame>;
}

export function InboxPage() {
  const { leads, complianceCases } = useControlBridge();
  const attentionLeadIds = new Set(complianceCases.filter((item) => ["pending", "screening", "manual_review", "needs_info", "hold"].includes(item.case_status)).map((item) => item.lead_id));
  const incoming = leads.filter((lead) => ["new", "qualifying", "needs_clarification"].includes(lead.status || "") || attentionLeadIds.has(lead.lead_id));
  return <PageFrame title="Входящие" description="Очередь новых и требующих решения заявок OfferPSP."><PageHeading eyebrow="Operations" title="Входящие заявки" description="Новые, квалифицируемые и требующие уточнения записи из операционной базы OfferPSP."/><LeadTable leads={incoming}/></PageFrame>;
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
  return <PageFrame title="Мерчи" description="Реестр мерчей и заявок."><PageHeading eyebrow="CRM" title="Мерчи" description="Компании, контакты, платёжные запросы и состояние сделки — без тестового и закрытого мусора в рабочей очереди."/><Panel className="mb-5"><div className="flex flex-col gap-3 lg:flex-row lg:items-center lg:justify-between"><div className="flex flex-wrap gap-2">{[["active","В работе"],["history","История"],["all","Все"]].map(([value,label]) => <button key={value} onClick={() => setScope(value as typeof scope)} className={`rounded-lg px-3 py-2 text-sm ${scope === value ? "bg-brand-500 text-white" : "bg-gray-100 text-gray-600 dark:bg-white/5 dark:text-gray-300"}`}>{label}</button>)}</div><input value={query} onChange={(event)=>setQuery(event.target.value)} placeholder="Найти компанию, контакт или email…" className="h-10 w-full rounded-lg border border-gray-200 px-3 text-sm outline-none focus:border-brand-400 dark:border-gray-700 dark:bg-gray-900 dark:text-white lg:max-w-sm"/></div><p className="mt-3 text-xs text-gray-400">Показано {visible.length} из {leads.length}. Закрытые, spam и lost находятся в «Истории».</p></Panel><LeadTable leads={visible}/></PageFrame>;
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

function OfferIntakePanel({ providerNames, onImported }: { providerNames: string[]; onImported: () => Promise<void> }) {
  const [jobs, setJobs] = useState<OfferIngestionJob[]>([]);
  const [providerName, setProviderName] = useState("");
  const [sourceType, setSourceType] = useState("telegram");
  const [sourceReference, setSourceReference] = useState("");
  const [sourceText, setSourceText] = useState("");
  const [sourceFile, setSourceFile] = useState<File | null>(null);
  const [fileMetadata, setFileMetadata] = useState<Awaited<ReturnType<typeof extractOfferSource>> | null>(null);
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState("");

  const loadJobs = async () => {
    const result = await supabase.rpc("list_offerpsp_ingestion_jobs", { p_limit: 100 });
    if (result.error) setMessage(result.error.message);
    else setJobs((result.data || []) as OfferIngestionJob[]);
  };
  useEffect(() => {
    void loadJobs();
    const timer = window.setInterval(() => void loadJobs(), 15000);
    return () => window.clearInterval(timer);
  }, []);

  const enqueue = async () => {
    if (!providerName.trim() || !sourceText.trim()) {
      setMessage("Укажите PSP и вставьте исходный оффер.");
      return;
    }
    setBusy(true); setMessage("");
    let queuedReference = sourceReference.trim() || null;
    let uploadedPath: string | null = null;
    const metadata: Record<string, unknown> = { entrypoint: "control_bridge", publication_allowed: false };
    if (sourceFile && fileMetadata) {
      uploadedPath = `${new Date().toISOString().slice(0, 10)}/${crypto.randomUUID()}-${safeStorageName(sourceFile.name)}`;
      const uploaded = await supabase.storage.from("offerpsp-private-sources").upload(uploadedPath, sourceFile, {
        contentType: sourceFile.type || undefined,
        upsert: false,
      });
      if (uploaded.error) {
        setBusy(false);
        setMessage(`Не удалось сохранить оригинал: ${uploaded.error.message}`);
        return;
      }
      queuedReference = `storage://offerpsp-private-sources/${uploadedPath}`;
      Object.assign(metadata, {
        original_filename: sourceFile.name,
        original_mime_type: fileMetadata.mimeType,
        original_size_bytes: fileMetadata.size,
        original_sha256: fileMetadata.sha256,
        extraction_method: fileMetadata.extractionMethod,
        extractor_version: "offerpsp-browser-source-extractor-v1",
        submitted_reference: sourceReference.trim() || null,
      });
    }
    const result = await supabase.rpc("enqueue_offerpsp_source", {
      p_provider_name: providerName.trim(),
      p_source_type: sourceType,
      p_source_text: sourceText,
      p_source_reference: queuedReference,
      p_source_metadata: metadata,
    });
    setBusy(false);
    if (result.error) {
      if (uploadedPath) await supabase.storage.from("offerpsp-private-sources").remove([uploadedPath]);
      setMessage(result.error.message);
      return;
    }
    const duplicate = Boolean((result.data as { duplicate?: boolean } | null)?.duplicate);
    if (duplicate && uploadedPath) await supabase.storage.from("offerpsp-private-sources").remove([uploadedPath]);
    setMessage(duplicate ? "Этот источник уже есть в очереди — дубль не создан." : "Источник принят в закрытую очередь.");
    if (!duplicate) { setSourceText(""); setSourceReference(""); setSourceFile(null); setFileMetadata(null); }
    await loadJobs();
    await onImported();
  };

  const changeState = async (jobId: string, status: "queued" | "dismissed") => {
    setBusy(true); setMessage("");
    const result = await supabase.rpc("set_offerpsp_ingestion_state", { p_job_id: jobId, p_status: status });
    setBusy(false);
    if (result.error) setMessage(result.error.message);
    else { setMessage(status === "queued" ? "Источник возвращён в очередь." : "Источник убран из рабочей очереди."); await loadJobs(); }
  };

  const purgeJob = async (job: OfferIngestionJob) => {
    if (!window.confirm(`Удалить источник ${job.provider_name}, его draft и приватный оригинал?`)) return;
    setBusy(true); setMessage("");
    const result = await supabase.rpc("purge_offerpsp_ingestion_source", { p_job_id: job.id });
    if (result.error) {
      setBusy(false); setMessage(result.error.message); return;
    }
    const storagePath = (result.data as { storage_path?: string | null } | null)?.storage_path;
    if (storagePath) {
      const removed = await supabase.storage.from("offerpsp-private-sources").remove([storagePath]);
      if (removed.error) {
        setBusy(false);
        setMessage(`Запись и draft удалены, но Storage требует ручной очистки: ${removed.error.message}`);
        await loadJobs(); await onImported();
        return;
      }
    }
    setBusy(false); setMessage("Источник, его draft и приватный оригинал удалены.");
    await loadJobs(); await onImported();
  };

  const readSourceFile = async (file?: File) => {
    if (!file) return;
    setBusy(true); setMessage("Извлекаю текст и проверяю файл…");
    try {
      const extracted = await extractOfferSource(file, setMessage);
      setSourceText(extracted.text);
      setSourceReference(file.name);
      setSourceType("admin_file");
      setSourceFile(file);
      setFileMetadata(extracted);
      setMessage(`${file.name}: текст извлечён, оригинал будет сохранён приватно после принятия.`);
    } catch (error) {
      setSourceFile(null); setFileMetadata(null);
      setMessage(error instanceof Error ? error.message : "Не удалось прочитать файл.");
    } finally {
      setBusy(false);
    }
  };

  const attentionJobs = jobs.filter((job) => ["review", "failed", "duplicate"].includes(job.status) || Number(job.blocking_anomaly_count || 0) > 0);
  const processingJobs = jobs.filter((job) => ["queued", "processing"].includes(job.status));
  const historyJobs = jobs.filter((job) => ["dismissed", "imported"].includes(job.status));
  const field = "min-h-11 w-full rounded-lg border border-gray-200 bg-white px-3 text-sm text-gray-700 outline-none focus:border-brand-400 dark:border-gray-700 dark:bg-gray-900 dark:text-gray-200";

  return <div className="space-y-5">
    <Panel>
      <div className="grid grid-cols-1 gap-5 xl:grid-cols-[380px_minmax(0,1fr)]">
        <div>
          <h2 className="text-lg font-semibold text-gray-900 dark:text-white">Новый источник</h2>
          <p className="mt-1 text-sm text-gray-500">Telegram, email и ручная загрузка сходятся в одну закрытую очередь. Ничего не публикуется автоматически.</p>
          <div className="mt-5 space-y-3">
            <input list="offerpsp-provider-names" className={field} value={providerName} onChange={(event)=>setProviderName(event.target.value)} placeholder="Название PSP"/>
            <datalist id="offerpsp-provider-names">{providerNames.map((name)=><option key={name} value={name}/>)}</datalist>
            <div className="grid grid-cols-1 gap-3 sm:grid-cols-2"><select className={field} value={sourceType} onChange={(event)=>setSourceType(event.target.value)}><option value="telegram">Telegram</option><option value="email">Email</option><option value="admin_text">Ручной текст</option><option value="admin_file">Файл</option><option value="api">API</option></select><input className={field} value={sourceReference} onChange={(event)=>setSourceReference(event.target.value)} placeholder="Ссылка / message ID"/></div>
            <label className="flex cursor-pointer items-center justify-center rounded-lg border border-dashed border-gray-300 px-4 py-3 text-center text-sm font-semibold text-gray-600 hover:border-brand-400 hover:text-brand-500 dark:border-gray-700 dark:text-gray-300">Загрузить PDF / DOCX / XLSX / TXT / скан<input type="file" className="hidden" accept=".txt,.md,.csv,.tsv,.json,.html,.xml,.pdf,.docx,.xlsx,.png,.jpg,.jpeg,.webp" onChange={(event)=>void readSourceFile(event.target.files?.[0])}/></label>
            {sourceFile&&fileMetadata&&<div className="rounded-lg bg-success-50 px-3 py-2 text-xs text-success-700 dark:bg-success-500/10 dark:text-success-300"><strong>{sourceFile.name}</strong><span className="mt-1 block">{Math.ceil(fileMetadata.size/1024)} КБ · {fileMetadata.format.toUpperCase()} · приватный оригинал</span></div>}
          </div>
        </div>
        <div><textarea className={`${field} min-h-64 resize-y p-4 font-mono leading-6`} value={sourceText} onChange={(event)=>setSourceText(event.target.value)} placeholder="Вставьте оффер ровно в том виде, в котором его прислал PSP…"/><div className="mt-3 flex flex-wrap items-center justify-between gap-3"><span className="text-xs text-gray-400">Исходник и его hash сохраняются; результат всегда создаётся как draft/review.</span><button disabled={busy} onClick={()=>void enqueue()} className="rounded-lg bg-brand-500 px-5 py-2.5 text-sm font-semibold text-white disabled:opacity-50">{busy ? "Сохраняю…" : "Принять оффер"}</button></div></div>
      </div>
      {message&&<div className="mt-4 rounded-lg bg-gray-50 px-4 py-3 text-sm text-gray-700 dark:bg-white/[0.04] dark:text-gray-300">{message}</div>}
    </Panel>
    <Panel>
      <div className="flex flex-wrap items-start justify-between gap-3"><div><h2 className="text-lg font-semibold text-gray-900 dark:text-white">Очередь контроля</h2><p className="mt-1 text-sm text-gray-500">Новые разборы, ошибки и дубли остаются здесь до решения сотрудника.</p></div><button onClick={()=>void loadJobs()} className="rounded-lg border border-gray-200 px-3 py-2 text-sm font-semibold text-gray-600 dark:border-gray-700 dark:text-gray-300">Обновить</button></div>
      <div className="mt-4 grid grid-cols-1 gap-3 sm:grid-cols-3"><Metric label="Требуют решения" value={attentionJobs.length} hint="review, ошибки и дубли" tone={attentionJobs.length ? "warning" : "default"}/><Metric label="Обрабатываются" value={processingJobs.length} hint="очередь и работа парсера"/><Metric label="Завершены" value={historyJobs.length} hint="импортированы или закрыты" tone="success"/></div>
      <div className="mt-5 divide-y divide-gray-100 dark:divide-gray-800">{attentionJobs.map((job)=><div key={job.id} className="grid gap-4 py-4 first:pt-0 lg:grid-cols-[1fr_180px_180px_auto]"><div className="min-w-0"><strong className="text-sm text-gray-900 dark:text-white">{job.provider_name}</strong><span className="mt-1 block truncate text-xs text-gray-400">{job.source_type} · {job.source_reference || "без ссылки"}</span><details className="mt-2"><summary className="cursor-pointer text-xs font-semibold text-brand-500">Показать исходник</summary><pre className="mt-2 max-h-48 overflow-auto whitespace-pre-wrap rounded-lg bg-gray-50 p-3 text-xs text-gray-600 dark:bg-white/[0.03] dark:text-gray-300">{job.source_text}</pre></details></div><div><span className="text-xs text-gray-400">Получен</span><strong className="mt-1 block text-sm text-gray-700 dark:text-gray-300">{date(job.received_at)}</strong></div><div><StatusPill status={job.status}/><span className="mt-2 block text-xs text-gray-400">{job.route_count} маршрутов · {job.blocking_anomaly_count} блокеров</span>{job.error_message&&<span className="mt-1 block text-xs text-error-600">{job.error_message}</span>}</div><div className="flex flex-wrap items-start gap-2">{job.provider_id&&job.status==="review"&&<Link to={`/psps/${job.provider_id}?tab=offers`} className="rounded-lg bg-brand-500 px-3 py-2 text-xs font-semibold text-white">Проверить</Link>}{job.status==="failed"&&<button disabled={busy} onClick={()=>void changeState(job.id,"queued")} className="rounded-lg border border-gray-200 px-3 py-2 text-xs font-semibold dark:border-gray-700">Повторить</button>}<button disabled={busy} onClick={()=>void changeState(job.id,"dismissed")} className="rounded-lg border border-gray-200 px-3 py-2 text-xs font-semibold dark:border-gray-700">Убрать</button><button disabled={busy} onClick={()=>void purgeJob(job)} className="rounded-lg border border-error-200 px-3 py-2 text-xs font-semibold text-error-600">Удалить</button></div></div>)}{!attentionJobs.length&&<EmptyState title="Ничего не требует решения" description="Ошибки, дубли и новые draft-разборы появятся здесь автоматически."/>}</div>
      {processingJobs.length>0&&<details className="mt-5 border-t border-gray-100 pt-4 dark:border-gray-800" open><summary className="cursor-pointer text-sm font-semibold text-gray-600 dark:text-gray-300">Сейчас обрабатываются · {processingJobs.length}</summary><div className="mt-3 space-y-2">{processingJobs.map((job)=><div key={job.id} className="flex flex-wrap items-center justify-between gap-3 rounded-lg bg-gray-50 px-4 py-3 text-sm dark:bg-white/[0.03]"><span><strong className="text-gray-800 dark:text-white">{job.provider_name}</strong> · {job.source_reference || job.source_type}</span><StatusPill status={job.status}/></div>)}</div></details>}
      {historyJobs.length>0&&<details className="mt-5 border-t border-gray-100 pt-4 dark:border-gray-800"><summary className="cursor-pointer text-sm font-semibold text-gray-600 dark:text-gray-300">История · {historyJobs.length}</summary><div className="mt-3 space-y-2">{historyJobs.map((job)=><div key={job.id} className="flex flex-wrap items-center justify-between gap-3 rounded-lg bg-gray-50 px-4 py-3 text-sm dark:bg-white/[0.03]"><span><strong className="text-gray-800 dark:text-white">{job.provider_name}</strong> · {job.source_reference || job.source_type}</span><span className="flex items-center gap-3"><span className="text-xs text-gray-400">{job.route_count} маршрутов</span><StatusPill status={job.status}/></span></div>)}</div></details>}
    </Panel>
  </div>;
}

export function OffersPage() {
  const { routes, providers: registryProviders, refresh } = useControlBridge();
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const [workspace, setWorkspace] = useState<"catalog" | "intake" | "updates">(
    searchParams.get("workspace") === "intake" ? "intake" :
    searchParams.get("workspace") === "updates" ? "updates" : "catalog"
  );
  const [status, setStatus] = useState("all");
  const [providerId, setProviderId] = useState("all");
  const [geo, setGeo] = useState("all");
  const [currency, setCurrency] = useState("all");
  const [method, setMethod] = useState("all");
  const [flow, setFlow] = useState("all");
  const [health, setHealth] = useState("all");
  const [query, setQuery] = useState("");
  const [creating, setCreating] = useState(false);
  const [creatingBusy, setCreatingBusy] = useState(false);
  const [creatingError, setCreatingError] = useState<string | null>(null);
  const [offerDraft, setOfferDraft] = useState({ provider_id: "", client_title: "", flow: "payin", geos: "", currencies: "", methods: "", source_reference: "" });
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
    if (health === "stale" && route.status !== "paused") return false;
    if (health === "ready" && (Number(route.open_error_count || 0) || route.status !== "published")) return false;
    if (needle && ![route.provider_name, route.provider_code, route.client_title, route.route_code, ...(route.geos || []), ...(route.currencies || []), ...(route.methods || []), ...(route.verticals || [])].filter(Boolean).join(" ").toLowerCase().includes(needle)) return false;
    return true;
  }), [routes, status, providerId, geo, currency, method, flow, health, needle]);
  const groups = useMemo(()=>providers.map((provider)=>({provider, routes:visible.filter((route)=>route.provider_id===provider.id)})).filter((group)=>group.routes.length), [providers, visible]);
  const selectClass = "h-10 min-w-0 rounded-lg border border-gray-200 bg-white px-3 text-sm text-gray-700 outline-none focus:border-brand-400 dark:border-gray-700 dark:bg-gray-900 dark:text-gray-200";
  const reset = () => { setStatus("all"); setProviderId("all"); setGeo("all"); setCurrency("all"); setMethod("all"); setFlow("all"); setHealth("all"); setQuery(""); };
  const createOffer = async () => {
    if (!offerDraft.provider_id || !offerDraft.client_title.trim()) return;
    setCreatingBusy(true); setCreatingError(null);
    const result = await supabase.rpc("create_offerpsp_manual_route", { p_provider_id: offerDraft.provider_id, p_payload: { client_title: offerDraft.client_title.trim(), flow: offerDraft.flow, coverage_scope: "specific", geos: offerDraft.geos.split(",").map((item)=>item.trim()).filter(Boolean), currencies: offerDraft.currencies.split(",").map((item)=>item.trim()).filter(Boolean), methods: offerDraft.methods.split(",").map((item)=>item.trim()).filter(Boolean), traffic_types: [], verticals: [], source_reference: offerDraft.source_reference.trim() || "Staff manual offer", fees: [], limits: [], settlements: [] } });
    setCreatingBusy(false);
    if (result.error) { setCreatingError(result.error.message); return; }
    const data = result.data as { route_id?: string } | null;
    if (!data?.route_id) { setCreatingError("Черновик создан, но система не вернула его ID."); return; }
    await refresh();
    navigate(`/psps/${offerDraft.provider_id}?route=${data.route_id}&tab=offers`);
  };
  return <PageFrame title="Офферы" description="Маршруты и rate cards.">
    <PageHeading eyebrow="Offer operations" title="Офферы и маршруты" description="Каталог, единый приём источников и очередь проверки — в одном рабочем модуле." action={<div className="flex flex-wrap gap-2"><button onClick={()=>setCreating(!creating)} className="rounded-lg bg-brand-500 px-4 py-2.5 text-sm font-semibold text-white">{creating?"Закрыть":"+ Новый оффер"}</button><div className="flex rounded-lg border border-gray-200 p-1 dark:border-gray-700">{[["catalog","Каталог"],["intake","Приём офферов"],["updates","Обновить мерчам"]].map(([value,label])=><button key={value} onClick={()=>setWorkspace(value as "catalog"|"intake"|"updates")} className={`rounded-md px-4 py-2 text-sm font-semibold ${workspace===value?"bg-brand-500 text-white":"text-gray-600 dark:text-gray-300"}`}>{label}</button>)}</div></div>}/>
    {creating && <Panel className="mb-5"><div className="flex flex-col gap-2 sm:flex-row sm:items-start sm:justify-between"><div><p className="text-xs font-semibold uppercase tracking-[0.18em] text-brand-500">Нормализованный оффер</p><h2 className="mt-2 text-xl font-semibold text-gray-900 dark:text-white">Создать черновик для любого PSP</h2><p className="mt-1 text-sm text-gray-500">После создания откроется полный редактор ставок, лимитов, settlement и маржи.</p></div><Link to="/psps/new" className="text-sm font-semibold text-brand-500">Сначала добавить новый PSP →</Link></div>{creatingError&&<div className="mt-4"><ErrorBanner message={creatingError}/></div>}<div className="mt-5 grid grid-cols-1 gap-3 md:grid-cols-2 xl:grid-cols-4"><select value={offerDraft.provider_id} onChange={(event)=>setOfferDraft({...offerDraft,provider_id:event.target.value})} className={selectClass}><option value="">Выберите PSP</option>{registryProviders.filter((provider)=>provider.relationship_status!=="archived").sort((a,b)=>a.brand_name.localeCompare(b.brand_name)).map((provider)=><option key={provider.id} value={provider.id}>{provider.brand_name} · {provider.internal_code||"без кода"}</option>)}</select><input value={offerDraft.client_title} onChange={(event)=>setOfferDraft({...offerDraft,client_title:event.target.value})} className={selectClass} placeholder="Название оффера"/><select value={offerDraft.flow} onChange={(event)=>setOfferDraft({...offerDraft,flow:event.target.value})} className={selectClass}><option value="payin">PayIn</option><option value="payout">PayOut</option><option value="both">PayIn + PayOut</option></select><input value={offerDraft.geos} onChange={(event)=>setOfferDraft({...offerDraft,geos:event.target.value})} className={selectClass} placeholder="GEO: IN, BR, MX"/><input value={offerDraft.currencies} onChange={(event)=>setOfferDraft({...offerDraft,currencies:event.target.value})} className={selectClass} placeholder="Валюты: INR, BRL"/><input value={offerDraft.methods} onChange={(event)=>setOfferDraft({...offerDraft,methods:event.target.value})} className={selectClass} placeholder="Методы: UPI, PIX"/><input value={offerDraft.source_reference} onChange={(event)=>setOfferDraft({...offerDraft,source_reference:event.target.value})} className={selectClass} placeholder="Источник: Telegram / PDF / XLSX"/><button onClick={()=>void createOffer()} disabled={!offerDraft.provider_id||!offerDraft.client_title.trim()||creatingBusy} className="h-10 rounded-lg bg-brand-500 px-4 text-sm font-semibold text-white disabled:opacity-40">{creatingBusy?"Создаю…":"Создать и заполнить"}</button></div></Panel>}
    {workspace === "intake" ? <OfferIntakePanel providerNames={registryProviders.map((provider)=>provider.brand_name).sort()} onImported={refresh}/> : workspace === "updates" ? <OfferUpdateQueuePanelV4/> : <>
    <Panel className="mb-5">
      <div className="flex flex-wrap gap-2">{[["all","Все"],["published","Опубликованы"],["draft","Черновики"],["review","На проверке"],["paused","Пауза"],["archived","Архив"]].map(([value,label]) => <button key={value} onClick={() => setStatus(value)} className={`rounded-lg px-3 py-2 text-sm ${status === value ? "bg-brand-500 text-white" : "bg-gray-100 text-gray-600 dark:bg-white/5 dark:text-gray-300"}`}>{label}</button>)}</div>
      <div className="mt-4 grid grid-cols-1 gap-3 md:grid-cols-2 xl:grid-cols-4"><input value={query} onChange={(event)=>setQuery(event.target.value)} className={selectClass} placeholder="PSP, маршрут, GEO, метод…"/><select value={providerId} onChange={(event)=>setProviderId(event.target.value)} className={selectClass}><option value="all">Все PSP</option>{providers.map((provider)=><option key={provider.id} value={provider.id}>{provider.name} · {routes.filter((route)=>route.provider_id===provider.id).length}</option>)}</select><select value={geo} onChange={(event)=>setGeo(event.target.value)} className={selectClass}><option value="all">Все GEO</option>{geos.map((value)=><option key={value}>{value}</option>)}</select><select value={currency} onChange={(event)=>setCurrency(event.target.value)} className={selectClass}><option value="all">Все валюты</option>{currencies.map((value)=><option key={value}>{value}</option>)}</select><select value={method} onChange={(event)=>setMethod(event.target.value)} className={selectClass}><option value="all">Все методы</option>{methods.map((value)=><option key={value}>{value}</option>)}</select><select value={flow} onChange={(event)=>setFlow(event.target.value)} className={selectClass}><option value="all">Все потоки</option><option value="payin">PayIn</option><option value="payout">PayOut</option><option value="both">PayIn + PayOut</option></select><select value={health} onChange={(event)=>setHealth(event.target.value)} className={selectClass}><option value="all">Любая готовность</option><option value="ready">Готовы к работе</option><option value="errors">С ошибками</option><option value="warnings">С предупреждениями</option><option value="stale">На паузе</option></select><button onClick={reset} className="h-10 rounded-lg border border-gray-200 px-3 text-sm font-semibold text-gray-600 hover:border-brand-300 hover:text-brand-500 dark:border-gray-700 dark:text-gray-300">Сбросить фильтры</button></div>
      <p className="mt-4 text-xs text-gray-400">Показано {visible.length} из {routes.length} маршрутов · {groups.length} PSP. Каждый оффер открывается в полном редакторе.</p>
    </Panel>
    <div className="space-y-5">{groups.map(({provider, routes:providerRoutes})=><Panel key={provider.id} className="overflow-hidden !p-0"><div className="flex flex-col gap-3 border-b border-gray-200 bg-gray-50 px-5 py-4 sm:flex-row sm:items-center sm:justify-between dark:border-gray-800 dark:bg-white/[0.03]"><div><div className="flex items-center gap-3"><h2 className="text-lg font-semibold text-gray-900 dark:text-white">{provider.name}</h2><span className="rounded-full bg-brand-50 px-2.5 py-1 text-xs font-semibold text-brand-700 dark:bg-brand-500/10 dark:text-brand-300">{providerRoutes.length} офферов</span></div><p className="mt-1 text-xs text-gray-400">{provider.code || "внутренний код не указан"}</p></div><Link to={`/psps/${provider.id}?tab=offers`} className="text-sm font-semibold text-brand-500">Открыть PSP и добавить оффер →</Link></div><div className="overflow-x-auto"><table className="min-w-full"><thead><tr>{["Оффер", "GEO и валюта", "Метод и поток", "Проверки", "Статус", ""].map((head)=><th key={head} className="px-5 py-3 text-left text-xs font-semibold uppercase tracking-wide text-gray-500">{head}</th>)}</tr></thead><tbody className="divide-y divide-gray-100 dark:divide-gray-800">{providerRoutes.map((route)=><tr key={route.route_id} className="hover:bg-gray-50/70 dark:hover:bg-white/[0.02]"><td className="px-5 py-4"><strong className="text-sm text-gray-900 dark:text-white">{route.client_title || route.route_code}</strong><span className="block text-xs text-gray-400">{route.route_code} · v{route.batch_version || "—"}</span></td><td className="px-5 py-4 text-sm text-gray-600 dark:text-gray-300">{list(route.geos)}<span className="block text-xs text-gray-400">{list(route.currencies)}</span></td><td className="px-5 py-4 text-sm text-gray-600 dark:text-gray-300">{list(route.methods)}<span className="block text-xs text-gray-400">{route.flow || "—"}</span></td><td className="px-5 py-4"><span className={Number(route.open_error_count || 0) ? "text-error-600" : "text-success-600"}>{Number(route.open_error_count || 0)} ошибок</span><span className="block text-xs text-gray-400">{Number(route.open_warning_count || 0)} предупреждений{route.status === "paused" ? " · на паузе" : ""}</span></td><td className="px-5 py-4"><StatusPill status={route.status}/></td><td className="px-5 py-4 text-right"><Link to={`/psps/${route.provider_id}?route=${route.route_id}&tab=offers`} className="text-sm font-semibold text-brand-500">Редактировать →</Link></td></tr>)}</tbody></table></div></Panel>)}{!groups.length&&<Panel><EmptyState title="Офферы не найдены" description="Сбросьте часть фильтров или добавьте оффер из workspace нужного PSP."/></Panel>}</div></>}
  </PageFrame>;
}

type UpdateQueueItem = {
  id: string; lead_id: string; shortlist_id: string; shortlist_item_id: string;
  old_route_id?: string; new_route_id?: string; trigger_event: string; status: string;
  has_client_selection: boolean; compatibility_check?: unknown; prepared_shortlist_id?: string;
  assigned_to?: string; due_at?: string; client_notified_at?: string; notes?: string;
  created_at: string; shortlist_title?: string; shortlist_version?: number;
  public_code?: string; current_staleness?: string; old_route_title?: string; new_route_title?: string;
};

const STALENESS_LABELS: Record<string, string> = {
  updated: "условия обновлены", paused: "оффер на паузе",
  unavailable: "оффер недоступен", expired: "недоступен (старый статус)",
};

// Per-item transient workflow state (not persisted, cleared on load)
type ItemWorkflow = {
  newRouteId: string;   // UUID typed by staff
  vNextId?: string;     // returned by create_offerpsp_shortlist_v_next
  step: "idle" | "validated" | "vnext_created" | "shared";
};

export function OfferUpdateQueuePanel() {
  const [items, setItems] = useState<UpdateQueueItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState<string | null>(null);
  const [statusFilter, setStatusFilter] = useState<string>("active");
  const [message, setMessage] = useState<{tone:"success"|"error";text:string}|null>(null);
  const [notesInput, setNotesInput] = useState<Record<string,string>>({});
  const [workflow, setWorkflow] = useState<Record<string, ItemWorkflow>>({});

  const load = useCallback(async () => {
    setLoading(true);
    const filter = statusFilter === "active" ? ["pending","in_progress"] : statusFilter === "all" ? null : [statusFilter];
    const { data, error } = await supabase.rpc("get_offerpsp_offer_update_queue", { p_status_filter: filter });
    if (error) setMessage({ tone: "error", text: error.message });
    else setItems((data as UpdateQueueItem[]) || []);
    setLoading(false);
  }, [statusFilter]);

  useEffect(() => { void load(); }, [load]);

  const wf = (id: string): ItemWorkflow => workflow[id] ?? { newRouteId: "", step: "idle" };
  const setWf = (id: string, patch: Partial<ItemWorkflow>) =>
    setWorkflow(prev => ({ ...prev, [id]: { ...wf(id), ...patch } }));

  const act = async (
    key: string,
    fn: () => Promise<{data?:unknown;error:{message:string}|null}>,
    success: string,
    onOk?: (data: unknown) => void,
  ) => {
    setBusy(key); setMessage(null);
    const result = await fn();
    if (result.error) setMessage({ tone: "error", text: result.error.message });
    else { setMessage({ tone: "success", text: success }); onOk?.(result.data); await load(); }
    setBusy(null);
  };

  const validate = (item: UpdateQueueItem) => {
    const routeId = wf(item.id).newRouteId.trim();
    if (!routeId) { setMessage({ tone: "error", text: "Укажите UUID маршрута-замены." }); return; }
    void act(`validate-${item.id}`, async () => {
      const r = await supabase.rpc("prepare_offerpsp_offer_update", {
        p_queue_item_id: item.id, p_new_route_id: routeId,
      });
      return { data: r.data, error: r.error };
    }, "Маршрут проверен, совместимость подтверждена.", () => setWf(item.id, { step: "validated" }));
  };

  const createVNext = (item: UpdateQueueItem) => {
    const routeId = wf(item.id).newRouteId.trim();
    void act(`vnext-${item.id}`, async () => {
      const r = await supabase.rpc("create_offerpsp_shortlist_v_next", {
        p_queue_item_id: item.id, p_new_route_id: routeId,
      });
      return { data: r.data, error: r.error };
    }, "Новая версия шортлиста создана.", (data) => {
      const d = data as { new_shortlist_id?: string } | null;
      setWf(item.id, { step: "vnext_created", vNextId: d?.new_shortlist_id });
    });
  };

  const shareVNext = (item: UpdateQueueItem) => {
    const vNextId = item.prepared_shortlist_id ?? wf(item.id).vNextId;
    if (!vNextId) { setMessage({ tone: "error", text: "Сначала создайте новый шортлист." }); return; }
    void act(`share-${item.id}`, async () => {
      const r = await supabase.rpc("share_offerpsp_shortlist", { p_shortlist_id: vNextId });
      return { data: r.data, error: r.error };
    }, "Шортлист опубликован клиенту.", () => setWf(item.id, { step: "shared" }));
  };

  const markSent = (item: UpdateQueueItem) => void act(`sent-${item.id}`, async () => {
    const r = await supabase.rpc("confirm_offerpsp_offer_update_sent", {
      p_queue_item_id: item.id, p_notes: notesInput[item.id] || null,
    });
    return { data: r.data, error: r.error };
  }, "Клиент отмечен как уведомлённый.");

  const dismiss = (item: UpdateQueueItem) => {
    if (!notesInput[item.id]?.trim()) {
      setMessage({ tone: "error", text: "Для закрытия задачи обязательна заметка с причиной." }); return;
    }
    void act(`dismiss-${item.id}`, async () => {
      const r = await supabase.rpc("dismiss_offerpsp_offer_update", {
        p_queue_item_id: item.id, p_notes: notesInput[item.id],
      });
      return { data: r.data, error: r.error };
    }, "Задача убрана из очереди.");
  };

  const dateStr = (v?: string) => v ? new Date(v).toLocaleDateString("ru-RU") : "—";
  const overdue = (v?: string) => v && new Date(v) < new Date();

  return <div className="space-y-5">
    {message && (message.tone === "error"
      ? <ErrorBanner message={message.text}/>
      : <div className="rounded-xl border border-success-200 bg-success-50 px-4 py-3 text-sm text-success-700 dark:border-success-500/20 dark:bg-success-500/10 dark:text-success-300">{message.text}</div>)}
    <Panel>
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <p className="text-xs font-semibold uppercase tracking-[0.18em] text-brand-500">Merchant updates</p>
          <h2 className="mt-1 text-lg font-semibold text-gray-900 dark:text-white">Обновить предложения мерчам</h2>
          <p className="mt-1 text-sm text-gray-500">Изменённые офферы, затронутые клиенты, статус уведомления.</p>
        </div>
        <button onClick={() => void load()} disabled={loading} className="rounded-lg border border-gray-200 px-4 py-2 text-sm font-medium text-gray-600 dark:border-gray-700 dark:text-gray-300">Обновить</button>
      </div>
      <div className="mt-4 flex flex-wrap gap-2">
        {[["active","Активные"],["sent","Отправлены"],["dismissed","Убраны"],["all","Все"]].map(([value,label])=>(
          <button key={value} onClick={()=>setStatusFilter(value)} className={`rounded-lg px-3 py-2 text-sm ${statusFilter===value?"bg-brand-500 text-white":"bg-gray-100 text-gray-600 dark:bg-white/5 dark:text-gray-300"}`}>{label}</button>
        ))}
      </div>
    </Panel>

    {loading
      ? <Panel><div className="py-8 text-center text-sm text-gray-400">Загружаю…</div></Panel>
      : items.length === 0
        ? <Panel><EmptyState title="Нет задач по обновлению мерчей" description="Здесь появятся задачи, когда оффер из шортлиста изменит статус."/></Panel>
        : <div className="space-y-4">{items.map(item => {
            const w = wf(item.id);
            const isActive = item.status !== "sent" && item.status !== "dismissed";
            const isBusy = (k: string) => busy === `${k}-${item.id}`;
            const vNextId = item.prepared_shortlist_id ?? w.vNextId;
            // Effective step: if DB already has prepared_shortlist_id, treat as at least vnext_created
            const effectiveStep = item.prepared_shortlist_id && w.step === "idle" ? "vnext_created" : w.step;

            return <Panel key={item.id}>
              {/* Header row */}
              <div className="flex flex-wrap items-start justify-between gap-3">
                <div className="min-w-0 flex-1">
                  <div className="flex flex-wrap items-center gap-2">
                    <span className={`inline-block rounded-full px-2.5 py-1 text-xs font-semibold ${
                      item.current_staleness === "unavailable" ? "bg-error-50 text-error-700 dark:bg-error-500/10 dark:text-error-300" :
                      item.current_staleness === "expired" ? "bg-gray-100 text-gray-600 dark:bg-white/5 dark:text-gray-400" :
                      "bg-warning-50 text-warning-700 dark:bg-warning-500/10 dark:text-warning-300"
                    }`}>{STALENESS_LABELS[item.current_staleness ?? ""] ?? item.trigger_event}</span>
                    <StatusPill status={item.status}/>
                    {item.has_client_selection && (
                      <span className="rounded-full bg-error-100 px-2.5 py-0.5 text-xs font-semibold text-error-700 dark:bg-error-500/20 dark:text-error-300">⚠ клиент выбрал этот оффер</span>
                    )}
                    {overdue(item.due_at) && isActive && (
                      <span className="rounded-full bg-error-50 px-2 py-0.5 text-xs font-semibold text-error-600">просрочено</span>
                    )}
                  </div>
                  <p className="mt-2 text-sm font-medium text-gray-900 dark:text-white">
                    {item.old_route_title ?? "Оффер"}
                    {item.new_route_title && <> → <span className="text-success-600">{item.new_route_title}</span></>}
                  </p>
                  <p className="mt-1 text-xs text-gray-400">
                    Шортлист: {item.shortlist_title ?? "—"} v{item.shortlist_version ?? "—"} · Код: {item.public_code ?? "—"} · Срок: {dateStr(item.due_at)}
                  </p>
                  {item.client_notified_at && <p className="mt-1 text-xs text-success-600">Уведомлён: {dateStr(item.client_notified_at)}</p>}
                </div>
                <Link to={`/merchants/${item.lead_id}?tab=shortlists`} className="shrink-0 rounded-lg border border-brand-200 px-3 py-2 text-xs font-semibold text-brand-600">Открыть мерча →</Link>
              </div>

              {/* Workflow steps (only for active items) */}
              {isActive && <div className="mt-4 space-y-3 border-t border-gray-100 pt-4 dark:border-gray-800">

                {/* Step 1 — select replacement route + validate */}
                <div className="flex flex-wrap items-center gap-2">
                  <span className={`shrink-0 text-xs font-semibold ${effectiveStep !== "idle" ? "text-success-600" : "text-gray-400"}`}>1. Маршрут-замена</span>
                  <input
                    value={w.newRouteId}
                    onChange={e => setWf(item.id, { newRouteId: e.target.value })}
                    disabled={effectiveStep !== "idle" || Boolean(busy)}
                    className="h-8 min-w-0 flex-1 rounded-lg border border-gray-200 px-3 font-mono text-xs text-gray-700 outline-none focus:border-brand-400 disabled:bg-gray-50 disabled:text-gray-400 dark:border-gray-700 dark:bg-gray-900 dark:text-gray-200 dark:disabled:bg-gray-800"
                    placeholder="UUID нового опубликованного маршрута"
                  />
                  {effectiveStep === "idle" && (
                    <button onClick={() => validate(item)} disabled={Boolean(busy) || !w.newRouteId.trim()} className="h-8 rounded-lg bg-brand-500 px-3 text-xs font-semibold text-white disabled:opacity-40">
                      {isBusy("validate") ? "Проверяю…" : "Проверить"}
                    </button>
                  )}
                  {effectiveStep !== "idle" && <span className="text-xs text-success-600">✓ проверен</span>}
                </div>

                {/* Step 2 — create vNext */}
                {(effectiveStep === "validated" || effectiveStep === "vnext_created" || effectiveStep === "shared") && (
                  <div className="flex flex-wrap items-center gap-2">
                    <span className={`shrink-0 text-xs font-semibold ${effectiveStep !== "validated" ? "text-success-600" : "text-gray-400"}`}>2. Создать vNext</span>
                    {effectiveStep === "validated" && (
                      <button onClick={() => createVNext(item)} disabled={Boolean(busy)} className="h-8 rounded-lg bg-brand-500 px-3 text-xs font-semibold text-white disabled:opacity-40">
                        {isBusy("vnext") ? "Создаю…" : "Создать новую версию шортлиста"}
                      </button>
                    )}
                    {effectiveStep !== "validated" && vNextId && (
                      <><span className="font-mono text-xs text-gray-500">{vNextId}</span><span className="text-xs text-success-600">✓ создан</span></>
                    )}
                  </div>
                )}

                {/* Step 3 — open + share */}
                {(effectiveStep === "vnext_created" || effectiveStep === "shared") && vNextId && (
                  <div className="flex flex-wrap items-center gap-2">
                    <span className={`shrink-0 text-xs font-semibold ${effectiveStep === "shared" ? "text-success-600" : "text-gray-400"}`}>3. Открыть и поделиться</span>
                    <Link to={`/merchants/${item.lead_id}?tab=shortlists&shortlist=${vNextId}`} className="h-8 rounded-lg border border-brand-200 px-3 text-xs font-semibold leading-8 text-brand-600">Открыть черновик →</Link>
                    {effectiveStep === "vnext_created" && (
                      <button onClick={() => shareVNext(item)} disabled={Boolean(busy)} className="h-8 rounded-lg bg-warning-500 px-3 text-xs font-semibold text-white disabled:opacity-40">
                        {isBusy("share") ? "Публикую…" : "Поделиться с клиентом"}
                      </button>
                    )}
                    {effectiveStep === "shared" && <span className="text-xs text-success-600">✓ опубликован</span>}
                  </div>
                )}

                {/* Step 4 — confirm sent / dismiss */}
                <div className="flex flex-wrap items-center gap-2 border-t border-dashed border-gray-100 pt-3 dark:border-gray-800">
                  <input
                    value={notesInput[item.id] ?? ""}
                    onChange={e => setNotesInput(prev => ({ ...prev, [item.id]: e.target.value }))}
                    className="h-8 min-w-0 flex-1 rounded-lg border border-gray-200 px-3 text-xs text-gray-700 outline-none focus:border-brand-400 dark:border-gray-700 dark:bg-gray-900 dark:text-gray-200"
                    placeholder={item.has_client_selection ? "Заметка (обязательна для закрытия)" : "Заметка (обязательна для закрытия, опционально для уведомления)"}
                  />
                  <button
                    onClick={() => markSent(item)}
                    disabled={Boolean(busy) || effectiveStep !== "shared"}
                    title={effectiveStep !== "shared" ? "Сначала поделитесь шортлистом с клиентом" : ""}
                    className="h-8 rounded-lg bg-success-500 px-3 text-xs font-semibold text-white disabled:opacity-40"
                  >
                    {isBusy("sent") ? "Сохраняю…" : "✓ Уведомил клиента"}
                  </button>
                  {!item.has_client_selection && (
                    <button
                      onClick={() => dismiss(item)}
                      disabled={Boolean(busy)}
                      className="h-8 rounded-lg border border-error-200 px-3 text-xs font-semibold text-error-600 disabled:opacity-40"
                    >
                      {isBusy("dismiss") ? "Закрываю…" : "Закрыть"}
                    </button>
                  )}
                  {item.has_client_selection && (
                    <span className="rounded-lg border border-error-100 px-3 py-1 text-xs text-error-500 dark:border-error-500/20">закрытие заблокировано — клиент выбрал оффер</span>
                  )}
                </div>
              </div>}
            </Panel>;
          })}</div>
    }
  </div>;
}

type UpdateQueueItemV4 = UpdateQueueItem & {
  prepared_shortlist_status?: string | null;
  old_route_flow?: string | null;
  old_route_geos?: string[];
  old_route_currencies?: string[];
  old_route_methods?: string[];
};

const normalizedValues = (values?: string[] | null) => new Set((values ?? []).map((value) => value.trim().toUpperCase()).filter(Boolean));
const overlaps = (left?: string[] | null, right?: string[] | null) => {
  const a = normalizedValues(left);
  return [...normalizedValues(right)].some((value) => a.has(value));
};

function OfferUpdateQueuePanelV4() {
  const { routes } = useControlBridge();
  const [items, setItems] = useState<UpdateQueueItemV4[]>([]);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState<string | null>(null);
  const [statusFilter, setStatusFilter] = useState("active");
  const [message, setMessage] = useState<{tone:"success"|"error";text:string}|null>(null);
  const [selections, setSelections] = useState<Record<string,string>>({});
  const [notes, setNotes] = useState<Record<string,string>>({});
  const [overrideReasons, setOverrideReasons] = useState<Record<string,string>>({});

  const load = useCallback(async () => {
    setLoading(true);
    const filter = statusFilter === "active" ? ["pending", "in_progress"] : statusFilter === "all" ? null : [statusFilter];
    const result = await supabase.rpc("get_offerpsp_offer_update_queue", { p_status_filter: filter });
    if (result.error) setMessage({ tone: "error", text: result.error.message });
    else {
      const rows = (result.data as UpdateQueueItemV4[]) ?? [];
      setItems(rows);
      setSelections((current) => {
        const restored = { ...current };
        rows.forEach((item) => { if (item.new_route_id) restored[item.id] = item.new_route_id; });
        return restored;
      });
    }
    setLoading(false);
  }, [statusFilter]);

  useEffect(() => { void load(); }, [load]);

  const groups = useMemo(() => {
    const grouped = new Map<string, UpdateQueueItemV4[]>();
    items.forEach((item) => grouped.set(item.shortlist_id, [...(grouped.get(item.shortlist_id) ?? []), item]));
    return [...grouped.values()];
  }, [items]);

  const candidatesFor = (item: UpdateQueueItemV4) => routes
    .filter((route) => {
      const flowCompatible = Boolean(item.old_route_flow)
        && (item.old_route_flow === route.flow || item.old_route_flow === "both" || route.flow === "both");
      return route.route_id !== item.old_route_id
        && route.status === "published"

        && Number(route.open_error_count || 0) === 0
        && route.margin_ready
        && flowCompatible
        && overlaps(item.old_route_currencies, route.currencies);
    })
    .sort((a, b) => `${a.provider_name} ${a.client_title}`.localeCompare(`${b.provider_name} ${b.client_title}`));

  const selectedRoute = (item: UpdateQueueItemV4) => routes.find((route) => route.route_id === selections[item.id]);
  const requiresOverride = (item: UpdateQueueItemV4, route?: RouteCoverage) => Boolean(route)
    && (!overlaps(item.old_route_geos, route?.geos) || !overlaps(item.old_route_methods, route?.methods));

  const run = async (key: string, action: () => Promise<{data:unknown;error:{message:string}|null}>, success: string) => {
    setBusy(key); setMessage(null);
    const result = await action();
    if (result.error) setMessage({ tone: "error", text: result.error.message });
    else { setMessage({ tone: "success", text: success }); await load(); }
    setBusy(null);
  };

  const prepareGroup = (group: UpdateQueueItemV4[]) => {
    const shortlistId = group[0].shortlist_id;
    const active = group.filter((item) => ["pending", "in_progress"].includes(item.status));
    if (active.some((item) => !selections[item.id])) {
      setMessage({ tone: "error", text: "Выберите замену для каждого устаревшего оффера этого shortlist." });
      return;
    }
    const needsOverride = active.some((item) => requiresOverride(item, selectedRoute(item)));
    if (needsOverride && !overrideReasons[shortlistId]?.trim()) {
      setMessage({ tone: "error", text: "GEO или метод отличаются. Укажите причину осознанной замены." });
      return;
    }
    const replacements = Object.fromEntries(active.map((item) => [item.id, selections[item.id]]));
    void run(`prepare-${shortlistId}`, async () => {
      const result = await supabase.rpc("create_offerpsp_shortlist_v_next_bulk", {
        p_shortlist_id: shortlistId,
        p_replacements: replacements,
        p_title: null,
        p_introduction: null,
        p_override_reason: overrideReasons[shortlistId]?.trim() || null,
      });
      return { data: result.data, error: result.error };
    }, "Единый черновик vNext создан для всех устаревших офферов.");
  };

  const shareGroup = (group: UpdateQueueItemV4[]) => {
    const preparedId = group.find((item) => item.prepared_shortlist_id)?.prepared_shortlist_id;
    if (!preparedId) return;
    void run(`share-${group[0].shortlist_id}`, async () => {
      const result = await supabase.rpc("share_offerpsp_shortlist", { p_shortlist_id: preparedId });
      return { data: result.data, error: result.error };
    }, "Обновлённый shortlist отправлен в кабинет клиента.");
  };

  const confirmGroup = (group: UpdateQueueItemV4[]) => {
    const shortlistId = group[0].shortlist_id;
    void run(`confirm-${shortlistId}`, async () => {
      const result = await supabase.rpc("confirm_offerpsp_offer_updates_sent", {
        p_shortlist_id: shortlistId,
        p_notes: notes[shortlistId]?.trim() || null,
      });
      return { data: result.data, error: result.error };
    }, "Все связанные задачи закрыты: клиент уведомлён.");
  };

  const abandonGroup = (group: UpdateQueueItemV4[]) => {
    const shortlistId = group[0].shortlist_id;
    if (!notes[shortlistId]?.trim()) {
      setMessage({ tone: "error", text: "Для отмены черновика укажите причину." });
      return;
    }
    void run(`abandon-${shortlistId}`, async () => {
      const result = await supabase.rpc("abandon_offerpsp_prepared_update", {
        p_shortlist_id: shortlistId,
        p_reason: notes[shortlistId].trim(),
      });
      return { data: result.data, error: result.error };
    }, "Черновик отменён. Можно выбрать другие замены.");
  };

  const dismissItem = (item: UpdateQueueItemV4) => {
    if (!notes[item.shortlist_id]?.trim()) {
      setMessage({ tone: "error", text: "Для закрытия задачи укажите причину." });
      return;
    }
    void run(`dismiss-${item.id}`, async () => {
      const result = await supabase.rpc("dismiss_offerpsp_offer_update", {
        p_queue_item_id: item.id,
        p_notes: notes[item.shortlist_id].trim(),
      });
      return { data: result.data, error: result.error };
    }, "Задача убрана из очереди.");
  };

  return <div className="space-y-5">
    {message && (message.tone === "error" ? <ErrorBanner message={message.text}/> : <div className="rounded-xl border border-success-200 bg-success-50 px-4 py-3 text-sm text-success-700 dark:border-success-500/20 dark:bg-success-500/10 dark:text-success-300">{message.text}</div>)}
    <Panel>
      <div className="flex flex-wrap items-center justify-between gap-3"><div><p className="text-xs font-semibold uppercase tracking-[0.18em] text-brand-500">Impact control</p><h2 className="mt-1 text-lg font-semibold text-gray-900 dark:text-white">Обновить предложения мерчам</h2><p className="mt-1 text-sm text-gray-500">Один shortlist обновляется целиком: ни один устаревший оффер не останется внутри.</p></div><button onClick={()=>void load()} disabled={loading} className="rounded-lg border border-gray-200 px-4 py-2 text-sm font-medium text-gray-600 dark:border-gray-700 dark:text-gray-300">Обновить</button></div>
      <div className="mt-4 flex flex-wrap gap-2">{[["active","Активные"],["sent","Отправлены"],["dismissed","Убраны"],["all","Все"]].map(([value,label])=><button key={value} onClick={()=>setStatusFilter(value)} className={`rounded-lg px-3 py-2 text-sm ${statusFilter===value?"bg-brand-500 text-white":"bg-gray-100 text-gray-600 dark:bg-white/5 dark:text-gray-300"}`}>{label}</button>)}</div>
    </Panel>
    {loading ? <Panel><div className="py-8 text-center text-sm text-gray-400">Загружаю…</div></Panel> : groups.length === 0 ? <Panel><EmptyState title="Нет задач по обновлению мерчей" description="Здесь появятся задачи, когда отправленный оффер изменится или перестанет работать."/></Panel> : groups.map((group) => {
      const shortlistId = group[0].shortlist_id;
      const preparedId = group.find((item)=>item.prepared_shortlist_id)?.prepared_shortlist_id;
      const preparedStatus = group.find((item)=>item.prepared_shortlist_status)?.prepared_shortlist_status;
      const isActive = group.some((item)=>["pending","in_progress"].includes(item.status));
      const groupNeedsOverride = group.some((item)=>requiresOverride(item, selectedRoute(item)));
      return <Panel key={shortlistId}>
        <div className="flex flex-wrap items-start justify-between gap-3"><div><div className="flex flex-wrap items-center gap-2"><strong className="text-base text-gray-900 dark:text-white">{group[0].shortlist_title || "Shortlist"} · v{group[0].shortlist_version || "—"}</strong><StatusPill status={preparedStatus || group[0].status}/>{group.some((item)=>item.has_client_selection)&&<span className="rounded-full bg-error-100 px-2.5 py-1 text-xs font-semibold text-error-700 dark:bg-error-500/20 dark:text-error-300">клиент уже выбирал оффер</span>}</div><p className="mt-1 text-xs text-gray-400">{group.length} офферов требуют решения · изменения отправляются одной новой версией</p></div><Link to={`/merchants/${group[0].lead_id}?tab=shortlists`} className="rounded-lg border border-brand-200 px-3 py-2 text-xs font-semibold text-brand-600">Открыть мерча →</Link></div>
        <div className="mt-4 divide-y divide-gray-100 rounded-xl border border-gray-200 dark:divide-gray-800 dark:border-gray-800">{group.map((item)=>{
          const candidates = candidatesFor(item);
          const selected = selectedRoute(item);
          const warning = requiresOverride(item, selected);
          return <div key={item.id} className="grid gap-3 p-4 lg:grid-cols-[minmax(0,1fr)_minmax(260px,1.4fr)_auto] lg:items-center"><div><div className="flex flex-wrap items-center gap-2"><span className="rounded-full bg-warning-50 px-2 py-1 text-xs font-semibold text-warning-700 dark:bg-warning-500/10 dark:text-warning-300">{STALENESS_LABELS[item.current_staleness || ""] || item.trigger_event}</span><span className="text-xs text-gray-400">{item.public_code}</span></div><strong className="mt-2 block text-sm text-gray-900 dark:text-white">{item.old_route_title || "Оффер"}</strong><span className="mt-1 block text-xs text-gray-400">{list(item.old_route_geos)} · {list(item.old_route_currencies)} · {list(item.old_route_methods)} · {item.old_route_flow || "—"}</span></div>{isActive && !preparedId ? <div><select value={selections[item.id] || ""} onChange={(event)=>setSelections((current)=>({...current,[item.id]:event.target.value}))} className="h-10 w-full rounded-lg border border-gray-200 bg-white px-3 text-sm text-gray-700 outline-none focus:border-brand-400 dark:border-gray-700 dark:bg-gray-900 dark:text-gray-200"><option value="">Выберите актуальный оффер-замену</option>{candidates.map((route)=><option key={route.route_id} value={route.route_id}>{route.provider_name} · {route.client_title} · {list(route.geos)} · {list(route.currencies)} · {list(route.methods)} · {route.flow}</option>)}</select>{candidates.length===0&&<p className="mt-1 text-xs text-error-500">Нет опубликованной замены с совместимым потоком и валютой.</p>}{warning&&<p className="mt-1 text-xs text-warning-600">GEO или метод отличаются — потребуется обоснование.</p>}</div> : <div className="text-sm text-gray-600 dark:text-gray-300">{item.new_route_title ? `Замена: ${item.new_route_title}` : preparedId ? "Замена сохранена в черновике" : "Решение закрыто"}</div>}{isActive&&!preparedId&&!item.has_client_selection?<button onClick={()=>dismissItem(item)} disabled={Boolean(busy)} className="rounded-lg border border-error-200 px-3 py-2 text-xs font-semibold text-error-600 disabled:opacity-40">Убрать</button>:<span/>}</div>})}</div>
        {isActive && <div className="mt-4 space-y-3">{!preparedId && groupNeedsOverride&&<textarea value={overrideReasons[shortlistId]||""} onChange={(event)=>setOverrideReasons((current)=>({...current,[shortlistId]:event.target.value}))} rows={2} className="w-full rounded-lg border border-warning-200 px-3 py-2 text-sm outline-none focus:border-warning-400 dark:border-warning-500/30 dark:bg-gray-900" placeholder="Почему замена с другим GEO или методом допустима для этого мерча?"/>}<input value={notes[shortlistId]||""} onChange={(event)=>setNotes((current)=>({...current,[shortlistId]:event.target.value}))} className="h-10 w-full rounded-lg border border-gray-200 px-3 text-sm outline-none focus:border-brand-400 dark:border-gray-700 dark:bg-gray-900" placeholder="Рабочая заметка / причина отмены или закрытия"/><div className="flex flex-wrap gap-2">{!preparedId&&<button onClick={()=>prepareGroup(group)} disabled={Boolean(busy)} className="rounded-lg bg-brand-500 px-4 py-2.5 text-sm font-semibold text-white disabled:opacity-40">{busy===`prepare-${shortlistId}`?"Создаю…":"Создать единый vNext"}</button>}{preparedId&&preparedStatus==="draft"&&<><Link to={`/merchants/${group[0].lead_id}?tab=shortlists&shortlist=${preparedId}`} className="rounded-lg border border-brand-200 px-4 py-2.5 text-sm font-semibold text-brand-600">Проверить черновик →</Link><button onClick={()=>shareGroup(group)} disabled={Boolean(busy)} className="rounded-lg bg-warning-500 px-4 py-2.5 text-sm font-semibold text-white disabled:opacity-40">{busy===`share-${shortlistId}`?"Проверяю и отправляю…":"Отправить клиенту"}</button><button onClick={()=>abandonGroup(group)} disabled={Boolean(busy)} className="rounded-lg border border-error-200 px-4 py-2.5 text-sm font-semibold text-error-600 disabled:opacity-40">Отменить черновик</button></>}{preparedId&&preparedStatus==="shared"&&<button onClick={()=>confirmGroup(group)} disabled={Boolean(busy)} className="rounded-lg bg-success-500 px-4 py-2.5 text-sm font-semibold text-white disabled:opacity-40">{busy===`confirm-${shortlistId}`?"Закрываю…":"Подтвердить уведомление"}</button>}</div></div>}
      </Panel>;
    })}
  </div>;
}

export function IntelligencePage() {
  return <PageFrame title="Разведка" description="AI lead intelligence."><PageHeading eyebrow="AI & Telegram" title="Разведка iGaming‑рынка" description="Отдельный агент становится источником лидов внутри общей системы, а не соседним ботом без учёта результата." action={<button className="rounded-lg bg-brand-500 px-4 py-2.5 text-sm font-medium text-white">Новая поисковая миссия</button>}/><div className="grid grid-cols-1 gap-6 xl:grid-cols-3"><Panel className="xl:col-span-2"><div className="flex items-center justify-between"><div><span className="inline-flex items-center gap-2 rounded-full bg-success-50 px-3 py-1 text-xs font-semibold text-success-700 dark:bg-success-500/10 dark:text-success-300"><span className="h-2 w-2 rounded-full bg-success-500"/>Активен</span><h2 className="mt-4 text-xl font-semibold text-gray-900 dark:text-white">iGaming Lead Hunter Agent</h2><p className="mt-2 text-sm text-gray-500 dark:text-gray-400">Groq · Llama 3.3 70B · SerpAPI · загрузка страниц · память 8 сообщений</p></div><span className="rounded-xl bg-gray-100 px-4 py-3 text-center dark:bg-white/5"><strong className="block text-2xl text-gray-900 dark:text-white">6</strong><span className="text-xs text-gray-400">узлов</span></span></div><div className="mt-6 grid grid-cols-1 gap-3 sm:grid-cols-3">{[["Найти", "новые казино и PSP"],["Проверить", "сайт, GEO и контакты"],["Передать", "лид в общую очередь"]].map(([title,description], index)=><div key={title} className="rounded-xl border border-gray-200 p-4 dark:border-gray-800"><span className="text-xs font-semibold text-brand-500">0{index+1}</span><strong className="mt-2 block text-sm text-gray-900 dark:text-white">{title}</strong><span className="mt-1 block text-xs text-gray-500">{description}</span></div>)}</div><div className="mt-6 rounded-xl border border-warning-200 bg-warning-50 p-4 dark:border-warning-500/20 dark:bg-warning-500/10"><strong className="text-sm text-warning-800 dark:text-warning-300">Текущий разрыв</strong><p className="mt-1 text-sm text-warning-700 dark:text-warning-400">Агент умеет искать и исследовать, но ещё не сохраняет найденный лид в управляемую очередь OfferPSP. Следующий технический контракт: mission → candidate → qualified lead → merchant pipeline.</p></div></Panel><Panel><h2 className="text-lg font-semibold text-gray-900 dark:text-white">Контур контроля</h2><div className="mt-5 space-y-4">{[["Источник", "AI Agent / ручной / рекомендация"],["Владелец", "назначается после квалификации"],["Конфиденциальность", "PSP скрыт до знакомства"],["Результат", "Telegram → Zoom → launch"]].map(([label,value])=><div key={label} className="border-b border-gray-100 pb-3 last:border-0 dark:border-gray-800"><span className="block text-xs text-gray-400">{label}</span><strong className="mt-1 block text-sm text-gray-800 dark:text-white/90">{value}</strong></div>)}</div></Panel></div></PageFrame>;
}

export function AgentsPage() {
  const { organizations, assignments, agentMarginPolicies, commissionSummary } = useControlBridge();
  const agents = organizations.filter((organization) => organization.organization_type === "agent");
  const [scope, setScope] = useState<"active" | "history" | "all">("active");
  const visible = agents.filter((agent) => scope === "all" || (scope === "history" ? agent.status === "archived" : agent.status !== "archived"));
  return <PageFrame title="Субагенты" description="Портфель субагентов и комиссий."><PageHeading eyebrow="Partner network" title="Субагенты" description="Атрибуция мерчей, отдельная наценка, сделки и commission ledger — без раскрытия поставщика." action={<Link to="/agents/new" className="rounded-lg bg-brand-500 px-4 py-2.5 text-sm font-medium text-white">Добавить агента</Link>}/><div className="mb-6 grid grid-cols-1 gap-4 md:grid-cols-4"><Metric label="Агентские организации" value={agents.filter((agent) => agent.status !== "archived").length} hint="рабочих партнёров"/><Metric label="Закрепления" value={assignments.filter((assignment) => assignment.status === "active").length} hint="активных мерчей за агентами"/><Metric label="Правила маржи" value={agentMarginPolicies.filter((policy) => policy.active).length} hint="активных версий"/><Metric label="Записи комиссий" value={Object.values(commissionSummary).reduce((sum, value)=>sum+Number(value || 0),0)} hint="операций commission ledger" tone="success"/></div><Panel className="mb-5"><div className="flex flex-wrap gap-2">{[["active","Рабочие"],["history","Архив"],["all","Все"]].map(([value,label]) => <button key={value} onClick={() => setScope(value as typeof scope)} className={`rounded-lg px-3 py-2 text-sm ${scope === value ? "bg-brand-500 text-white" : "bg-gray-100 text-gray-600 dark:bg-white/5 dark:text-gray-300"}`}>{label}</button>)}</div></Panel><Panel>{visible.length ? <div className="divide-y divide-gray-100 dark:divide-gray-800">{visible.map((agent)=><Link to={`/agents/${agent.id}`} key={agent.id} className="flex flex-col gap-3 py-4 first:pt-0 last:pb-0 sm:flex-row sm:items-center sm:justify-between"><div><strong className="text-sm text-gray-900 hover:text-brand-500 dark:text-white">{agent.name}</strong><span className="mt-1 block text-xs text-gray-400">{agent.internal_code || "код не назначен"} · {agent.member_count || 0} пользователей</span></div><div className="flex items-center gap-3"><span className="text-sm text-gray-500">{agent.merchant_count || 0} мерчей</span><StatusPill status={agent.status}/></div></Link>)}</div> : <EmptyState title="Субагенты не найдены" description="Измените фильтр или добавьте первого партнёра."/>}</Panel></PageFrame>;
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
  return <PageFrame title="Аналитика" description="Воронка и качество supply."><PageHeading eyebrow="Business intelligence" title="Аналитика, которая отвечает на вопросы" description="Где тормозят сделки, достаточно ли покрытие и что требует внимания — без тестовых и архивных записей в рабочих показателях."/><div className="grid grid-cols-2 gap-3 xl:grid-cols-4"><Metric label="Launch conversion" value={`${launchRate}%`} hint={`${operationalLeads.filter((lead)=>lead.status === "won").length} запусков из ${operationalLeads.length} рабочих заявок`} tone="success"/><Metric label="Shortlist conversion" value={`${shortlistRate}%`} hint="от начатого подбора до shortlist"/><Metric label="Live coverage" value={`${liveRoutes}/${routes.length}`} hint="опубликовано маршрутов"/><Metric label="Supply blockers" value={errors} hint="открытых ошибок нормализации" tone={errors?"warning":"success"}/></div><div className="mt-6 grid grid-cols-1 gap-6 xl:grid-cols-3"><Panel className="xl:col-span-2"><div className="flex items-start justify-between gap-4"><div><h2 className="text-lg font-semibold text-gray-900 dark:text-white">Воронка до запуска</h2><p className="mt-1 text-sm text-gray-500">Кумулятивное прохождение, а не количество карточек в колонке.</p></div><span className="rounded-lg bg-gray-50 px-3 py-2 text-xs text-gray-500 dark:bg-white/[0.03]">{operationalLeads.length} рабочих заявок</span></div><div className="mt-7 space-y-4">{funnel.map((stage,index)=><div key={stage.label} className="grid grid-cols-[110px_1fr_48px] items-center gap-3 sm:grid-cols-[150px_1fr_64px]"><span className="text-xs text-gray-500 sm:text-sm">{stage.label}</span><div className="h-9 overflow-hidden rounded-lg bg-gray-100 dark:bg-gray-800"><div className="flex h-full items-center rounded-lg bg-gradient-to-r from-brand-600 to-theme-purple-500 px-3 text-xs font-semibold text-white transition-all" style={{width:`${Math.max(stage.value?12:0,stage.value/funnelMax*100)}%`}}>{index>0&&funnel[index-1].value?`${Math.round(stage.value/funnel[index-1].value*100)}%`:""}</div></div><strong className="text-right text-sm text-gray-900 dark:text-white">{stage.value}</strong></div>)}</div></Panel><Panel><h2 className="text-lg font-semibold text-gray-900 dark:text-white">Здоровье supply</h2><p className="mt-1 text-sm text-gray-500">То, что влияет на возможность отправить оффер.</p><div className="mt-6 space-y-5">{[["Опубликованы",liveRoutes,"success"],["Черновики",routes.filter((route)=>route.status === "draft").length,"warning"],["На паузе",routes.filter((route)=>route.status === "paused").length,"danger"],["Без маржи",routes.filter((route)=>!route.margin_ready).length,"danger"]].map(([label,value,tone])=><div key={String(label)}><div className="mb-2 flex justify-between text-sm"><span className="text-gray-500">{label}</span><strong className="text-gray-900 dark:text-white">{value}</strong></div><div className="h-2 rounded-full bg-gray-100 dark:bg-gray-800"><div className={`h-2 rounded-full ${tone === "success"?"bg-success-500":tone === "warning"?"bg-warning-500":"bg-error-500"}`} style={{width:`${routes.length?Math.max(5,Number(value)/routes.length*100):0}%`}}/></div></div>)}</div><div className="mt-6 rounded-xl bg-gray-50 p-4 dark:bg-white/[0.03]"><span className="text-xs text-gray-400">Рабочих PSP</span><strong className="mt-1 block text-2xl text-gray-900 dark:text-white">{activeProviders.length}</strong></div></Panel></div><div className="mt-6 grid grid-cols-1 gap-6 xl:grid-cols-2"><Panel><div className="flex items-start justify-between"><div><h2 className="text-lg font-semibold text-gray-900 dark:text-white">Новые заявки · 6 недель</h2><p className="mt-1 text-sm text-gray-500">Показывает реальный темп входящего потока.</p></div><strong className="text-2xl text-gray-900 dark:text-white">{weekly.reduce((sum,item)=>sum+item.value,0)}</strong></div><div className="mt-6 overflow-hidden"><svg viewBox="0 0 600 180" className="h-48 w-full" role="img" aria-label="Динамика новых заявок"><defs><linearGradient id="leadTrend" x1="0" x2="1"><stop offset="0" stopColor="#465fff"/><stop offset="1" stopColor="#9b51e0"/></linearGradient></defs><path d="M20 160 H580" stroke="currentColor" className="text-gray-200 dark:text-gray-800"/><polyline points={linePoints} fill="none" stroke="url(#leadTrend)" strokeWidth="5" strokeLinecap="round" strokeLinejoin="round"/>{weekly.map((item,index)=><g key={item.label}><circle cx={20+index*112} cy={160-(item.value/weeklyMax)*125} r="6" fill="#fff" stroke="#465fff" strokeWidth="4"/><text x={20+index*112} y="178" textAnchor="middle" className="fill-gray-400 text-[10px]">{item.label}</text><text x={20+index*112} y={145-(item.value/weeklyMax)*125} textAnchor="middle" className="fill-gray-700 text-[11px] font-semibold dark:fill-gray-200">{item.value}</text></g>)}</svg></div></Panel><Panel><h2 className="text-lg font-semibold text-gray-900 dark:text-white">Покрытие GEO</h2><p className="mt-1 text-sm text-gray-500">Где сейчас больше всего доступных маршрутов.</p><div className="mt-6 space-y-4">{geoCounts.map(([geo,count])=><div key={geo}><div className="mb-2 flex items-center justify-between text-sm"><span className="font-medium text-gray-700 dark:text-gray-300">{geo}</span><strong className="text-gray-900 dark:text-white">{count}</strong></div><div className="h-2.5 rounded-full bg-gray-100 dark:bg-gray-800"><div className="h-2.5 rounded-full bg-gradient-to-r from-brand-500 to-theme-purple-500" style={{width:`${count/maxGeo*100}%`}}/></div></div>)}{!geoCounts.length&&<EmptyState title="Нет данных покрытия" description="GEO появятся после нормализации маршрутов."/>}</div></Panel></div></PageFrame>;
}

const moduleCopy: Record<string, { eyebrow: string; title: string; description: string; capabilities: string[] }> = {
  matching: { eyebrow: "Matching workbench", title: "Подбор решений", description: "Сопоставление запроса с конкретными маршрутами без раскрытия PSP клиенту.", capabilities: ["Hard gates: GEO, currency, method, flow", "PSP rate → OfferPSP margin → agent margin", "Ручное включение и исключение с причиной", "Preview Telegram‑оффера перед отправкой"] },
  deals: { eyebrow: "Deal desk", title: "Сделки", description: "Досье → PSP review → Telegram → Zoom → live processing.", capabilities: ["Очередь решений клиента", "Полное досье для PSP", "Раунды вопросов и решений", "Telegram, Zoom, won/lost"] },
  communications: { eyebrow: "Omnichannel", title: "Коммуникации", description: "Переписка с мерчами, PSP и субагентами в контексте сделки.", capabilities: ["Клиентские сообщения", "Telegram уведомления", "Email delivery log", "Шаблоны и напоминания"] },
  operations: { eyebrow: "Operations", title: "Задачи и календарь", description: "Общая очередь работы, сроки и автоматические follow‑ups.", capabilities: ["My tasks", "Просроченные действия", "SLA по этапам", "Календарь Zoom и проверок условий"] },
  integrations: { eyebrow: "System", title: "Интеграции", description: "Рабочее состояние внешних сервисов и автоматизаций.", capabilities: ["Supabase", "n8n", "Telegram", "Vercel и email"] },
};

export function ModulePage({ module }: { module: keyof typeof moduleCopy }) {
  const copy = moduleCopy[module];
  const { leads, routes } = useControlBridge();
  return <PageFrame title={copy.title} description={copy.description}><PageHeading eyebrow={copy.eyebrow} title={copy.title} description={copy.description}/><div className="grid grid-cols-1 gap-6 xl:grid-cols-3"><Panel className="xl:col-span-2"><h2 className="text-lg font-semibold text-gray-900 dark:text-white">Рабочий контур</h2><div className="mt-5 grid grid-cols-1 gap-4 sm:grid-cols-2">{copy.capabilities.map((capability,index)=><div key={capability} className="rounded-xl border border-gray-200 p-4 dark:border-gray-800"><span className="text-xs font-semibold text-brand-500">0{index+1}</span><strong className="mt-2 block text-sm text-gray-800 dark:text-white/90">{capability}</strong></div>)}</div></Panel><Panel><h2 className="text-lg font-semibold text-gray-900 dark:text-white">Состояние ядра</h2><div className="mt-5 space-y-4"><div><span className="text-xs text-gray-400">Активных заявок</span><strong className="block text-2xl text-gray-900 dark:text-white">{leads.filter((lead)=>activeStatuses.includes(lead.status || "")).length}</strong></div><div><span className="text-xs text-gray-400">Доступно маршрутов</span><strong className="block text-2xl text-gray-900 dark:text-white">{routes.length}</strong></div><p className="rounded-lg bg-brand-50 p-3 text-xs text-brand-700 dark:bg-brand-500/10 dark:text-brand-300">Экран включён в V2. Операции подключаются к уже существующим RPC без замены бизнес‑логики.</p></div></Panel></div></PageFrame>;
}
