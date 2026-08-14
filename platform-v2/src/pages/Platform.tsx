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
  statusLabels,
} from "../components/control/Ui";
import { useControlBridge } from "../context/ControlBridgeContext";
import { supabase } from "../lib/supabase";
import { extractOfferSource, safeStorageName } from "../lib/offerSourceFiles";
import ResearchEntityEditor from "../components/control/ResearchEntityEditor";
import type { AgentPspProvider, Lead, OfferIngestionJob, RouteCoverage, StaffMember } from "../types/offerpsp";

const activeStatuses = ["new", "qualifying", "needs_clarification", "matching", "matched", "shortlist_ready", "shared", "option_selected", "dossier_ready", "provider_reviewing", "provider_needs_info", "provider_accepted", "telegram_created", "zoom_scheduled", "negotiating"];

const matchingReachedStatuses = new Set(["matching", "matched", "shortlist_ready", "shared", "option_selected", "dossier_ready", "provider_reviewing", "provider_needs_info", "provider_accepted", "provider_declined", "telegram_created", "zoom_scheduled", "negotiating", "won"]);
const shortlistReachedStatuses = new Set(["shortlist_ready", "shared", "option_selected", "dossier_ready", "provider_reviewing", "provider_needs_info", "provider_accepted", "provider_declined", "telegram_created", "zoom_scheduled", "negotiating", "won"]);
const providerReviewReachedStatuses = new Set(["provider_reviewing", "provider_needs_info", "provider_accepted", "provider_declined", "telegram_created", "zoom_scheduled", "negotiating", "won"]);
const providerAcceptedReachedStatuses = new Set(["provider_accepted", "telegram_created", "zoom_scheduled", "negotiating", "won"]);

const isTestFixtureLead = (lead: Lead) => {
  const identity = [lead.company, lead.name, lead.work_email, lead.company_url].filter(Boolean).join(" ");
  return /(^|[^a-z])e2e([^a-z]|$)/i.test(identity) || /workspace-role/i.test(identity) || String(lead.work_email || "").endsWith(".invalid");
};

const isVisibleBusinessLead = (lead: Lead) => lead.record_state !== "archived"
  && !["closed", "spam"].includes(lead.status || "")
  && !isTestFixtureLead(lead);

const isOpenBusinessLead = (lead: Lead) => isVisibleBusinessLead(lead)
  && !["won", "lost"].includes(lead.status || "");

function leadFunnel(leads: Lead[]) {
  const businessLeads = leads.filter(isVisibleBusinessLead);
  return {
    businessLeads,
    applications: businessLeads.length,
    matching: businessLeads.filter((lead) => matchingReachedStatuses.has(lead.status || "")).length,
    shortlist: businessLeads.filter((lead) => shortlistReachedStatuses.has(lead.status || "")).length,
    providerReview: businessLeads.filter((lead) => providerReviewReachedStatuses.has(lead.status || "")).length,
    providerAccepted: businessLeads.filter((lead) => providerAcceptedReachedStatuses.has(lead.status || "")).length,
    launched: businessLeads.filter((lead) => lead.status === "won").length,
    lost: businessLeads.filter((lead) => lead.status === "lost").length,
  };
}

const list = (value: unknown) => Array.isArray(value) ? value.join(", ") : String(value || "—");
const date = (value?: string | null) => value ? new Intl.DateTimeFormat("ru-RU", { day: "2-digit", month: "short", year: "numeric" }).format(new Date(value)) : "—";

function PageFrame({ title, description, children }: { title: string; description: string; children: React.ReactNode }) {
  const bridge = useControlBridge();
  if (bridge.loading) return <SkeletonPage />;
  return <><PageMeta title={`${title} | OfferPSP`} description={description}/>{bridge.error && <ErrorBanner message={bridge.error}/>} {children}</>;
}

export function CommandCenter() {
  const { leads, providers, routes, organizations, ingestionJobs, freshnessReminders, complianceCases, lastUpdatedAt, refreshing, refresh } = useControlBridge();
  const funnelMetrics = leadFunnel(leads);
  const operationalLeads = funnelMetrics.businessLeads.filter(isOpenBusinessLead);
  const operationalProviders = providers.filter((provider) => provider.relationship_status !== "archived");
  const stats = useMemo(() => ({
    newLeads: operationalLeads.filter((lead) => lead.status === "new").length,
    needsData: operationalLeads.filter((lead) => ["needs_clarification", "provider_needs_info"].includes(lead.status || "")).length,
    activeDeals: operationalLeads.filter((lead) => activeStatuses.includes(lead.status || "") && !["new", "qualifying", "needs_clarification"].includes(lead.status || "")).length,
    won: funnelMetrics.launched,
    unassigned: operationalLeads.filter((lead) => !lead.assigned_to).length,
    pausedRoutes: routes.filter((route) => route.status === "paused").length,
    blockedRoutes: routes.filter((route) => Number(route.open_error_count || 0) > 0).length,
    agents: organizations.filter((organization) => organization.organization_type === "agent" && organization.status === "active").length,
    offerReviews: ingestionJobs.filter((job) => ["review", "failed", "duplicate"].includes(job.status) || Number(job.blocking_anomaly_count || 0) > 0).length,
    freshnessReminders: freshnessReminders.length,
    complianceReview: complianceCases.filter((item) => ["pending", "screening", "manual_review", "needs_info", "hold"].includes(item.case_status)).length,
  }), [operationalLeads, funnelMetrics.launched, routes, organizations, ingestionJobs, freshnessReminders, complianceCases]);

  const attention = [
    { label: "Проверка входящих лидов", count: stats.complianceReview, path: "/compliance", hint: "подлинность, роль компании и готовность досье" },
    { label: "Запросы без владельца", count: stats.unassigned, path: "/pipeline", hint: "могут зависнуть без следующего действия" },
    { label: "Нужны данные", count: stats.needsData, path: "/merchants", hint: "ждём уточнения от мерча или PSP" },
    { label: "Маршруты с ошибками", count: stats.blockedRoutes, path: "/offers", hint: "нельзя публиковать до исправления" },
    { label: "Офферы ждут проверки", count: stats.offerReviews, path: "/offers?workspace=intake", hint: "новые разборы, ошибки и дубли находятся в очереди контроля" },
    { label: "PSP ждут подтверждения", count: stats.freshnessReminders, path: "/psps", hint: "n8n уже поставил задачу и подготовил сообщение партнёру" },
  ].filter((item) => item.count > 0);

  const funnel = [
    ["Заявки", funnelMetrics.applications],
    ["Начат подбор", funnelMetrics.matching],
    ["Переданы PSP", funnelMetrics.providerReview],
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
  const { leads, complianceCases, refresh } = useControlBridge();
  const [query, setQuery] = useState("");
  const [status, setStatus] = useState("all");
  const [owner, setOwner] = useState("all");
  const [risk, setRisk] = useState("all");
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [staff, setStaff] = useState<StaffMember[]>([]);
  const [action, setAction] = useState("assign");
  const [actionValue, setActionValue] = useState("");
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState<{ error?: boolean; text: string } | null>(null);
  const attentionLeadIds = new Set(complianceCases.filter((item) => ["pending", "screening", "manual_review", "needs_info", "hold"].includes(item.case_status)).map((item) => item.lead_id));
  const incoming = leads.filter((lead) => lead.record_state !== "archived" && (["new", "qualifying", "needs_clarification"].includes(lead.status || "") || attentionLeadIds.has(lead.lead_id)));

  useEffect(() => {
    void supabase.from("offerpsp_staff_members").select("user_id,display_name,role,active").eq("active", true).order("display_name")
      .then(({ data }) => setStaff((data || []) as StaffMember[]));
  }, []);

  const filtered = incoming.filter((lead) => {
    if (status === "attention" && !attentionLeadIds.has(lead.lead_id)) return false;
    if (status !== "all" && status !== "attention" && lead.status !== status) return false;
    if (owner === "unassigned" && lead.assigned_to) return false;
    if (owner !== "all" && owner !== "unassigned" && lead.assigned_to !== owner) return false;
    if (risk !== "all" && (lead.risk_segment || "unknown") !== risk) return false;
    if (!query.trim()) return true;
    return [lead.company, lead.name, lead.work_email, lead.telegram, lead.company_url, lead.vertical, list(lead.geos), list(lead.methods)]
      .filter(Boolean).join(" ").toLowerCase().includes(query.trim().toLowerCase());
  });

  const selectedLeads = filtered.filter((lead) => selected.has(lead.lead_id));
  const allVisibleSelected = filtered.length > 0 && filtered.every((lead) => selected.has(lead.lead_id));
  const staffName = (userId?: string | null) => staff.find((member) => member.user_id === userId)?.display_name || (userId ? "Назначен" : "Не назначен");

  const toggle = (leadId: string) => setSelected((current) => {
    const next = new Set(current);
    if (next.has(leadId)) next.delete(leadId); else next.add(leadId);
    return next;
  });
  const toggleVisible = () => setSelected((current) => {
    const next = new Set(current);
    if (allVisibleSelected) filtered.forEach((lead) => next.delete(lead.lead_id));
    else filtered.forEach((lead) => next.add(lead.lead_id));
    return next;
  });

  async function applyBulk() {
    if (!selectedLeads.length) return;
    if (action === "status" && !actionValue) { setMessage({ error: true, text: "Выберите новый статус." }); return; }
    const actionLabel = action === "assign" ? "сменить ответственного" : action === "status" ? "сменить статус" : "скрыть из рабочих списков";
    if (!window.confirm(`${actionLabel} для ${selectedLeads.length} заявок?`)) return;
    setBusy(true); setMessage(null);
    const result = await supabase.rpc("bulk_manage_offerpsp_leads", {
      p_lead_ids: selectedLeads.map((lead) => lead.lead_id),
      p_action: action,
      p_value: action === "archive" ? null : actionValue || null,
    });
    if (result.error) setMessage({ error: true, text: result.error.message });
    else {
      setSelected(new Set());
      await refresh();
      setMessage({ text: `Обновлено заявок: ${Number((result.data as { updated_count?: number } | null)?.updated_count || selectedLeads.length)}.` });
    }
    setBusy(false);
  }

  return <PageFrame title="Входящие" description="Очередь новых и требующих решения заявок OfferPSP.">
    <PageHeading eyebrow="Operations" title="Входящие заявки" description="Рабочий диспетчер: отфильтруйте поток, назначьте владельца и обработайте несколько заявок за одно действие."/>
    <div className="mb-5 grid grid-cols-2 gap-3 lg:grid-cols-4"><Metric label="В очереди" value={incoming.length} hint="новые и требующие решения"/><Metric label="Без владельца" value={incoming.filter((lead)=>!lead.assigned_to).length} hint="нужно назначить" tone="warning"/><Metric label="Нужны данные" value={incoming.filter((lead)=>lead.status === "needs_clarification").length} hint="ждут уточнения"/><Metric label="На проверке" value={incoming.filter((lead)=>attentionLeadIds.has(lead.lead_id)).length} hint="контрольный список" tone="warning"/></div>
    {message && <div className={`mb-4 rounded-xl border px-4 py-3 text-sm ${message.error ? "border-error-200 bg-error-50 text-error-700 dark:border-error-500/20 dark:bg-error-500/10 dark:text-error-300" : "border-success-200 bg-success-50 text-success-700 dark:border-success-500/20 dark:bg-success-500/10 dark:text-success-300"}`}>{message.text}</div>}
    <Panel className="mb-5"><div className="grid gap-3 md:grid-cols-2 xl:grid-cols-[minmax(260px,1fr)_180px_210px_180px]">
      <input className="h-11 rounded-lg border border-gray-200 px-3 text-sm outline-none focus:border-brand-400 dark:border-gray-700 dark:bg-gray-900 dark:text-white" value={query} onChange={(event)=>setQuery(event.target.value)} placeholder="Компания, контакт, GEO или метод…"/>
      <select className="h-11 rounded-lg border border-gray-200 px-3 text-sm dark:border-gray-700 dark:bg-gray-900 dark:text-white" value={status} onChange={(event)=>setStatus(event.target.value)}><option value="all">Все статусы</option><option value="new">Новые</option><option value="qualifying">Квалификация</option><option value="needs_clarification">Нужны данные</option><option value="attention">Требуют проверки</option></select>
      <select className="h-11 rounded-lg border border-gray-200 px-3 text-sm dark:border-gray-700 dark:bg-gray-900 dark:text-white" value={owner} onChange={(event)=>setOwner(event.target.value)}><option value="all">Все ответственные</option><option value="unassigned">Без владельца</option>{staff.map((member)=><option key={member.user_id} value={member.user_id}>{member.display_name || member.user_id}</option>)}</select>
      <select className="h-11 rounded-lg border border-gray-200 px-3 text-sm dark:border-gray-700 dark:bg-gray-900 dark:text-white" value={risk} onChange={(event)=>setRisk(event.target.value)}><option value="all">Любая категория</option><option value="low">Low-risk</option><option value="high">High-risk</option><option value="unknown">Не определена</option></select>
    </div><p className="mt-3 text-xs text-gray-400">Показано {filtered.length} из {incoming.length}. Отбор не меняет данные, пока вы не подтвердите массовое действие.</p></Panel>
    {selectedLeads.length > 0 && <Panel className="mb-5 border-brand-200 bg-brand-50/50 dark:border-brand-500/30 dark:bg-brand-500/5"><div className="flex flex-col gap-3 xl:flex-row xl:items-center"><strong className="mr-auto text-sm text-gray-900 dark:text-white">Выбрано: {selectedLeads.length}</strong><select className="h-10 rounded-lg border border-gray-200 px-3 text-sm dark:border-gray-700 dark:bg-gray-900 dark:text-white" value={action} onChange={(event)=>{setAction(event.target.value);setActionValue("");}}><option value="assign">Назначить владельца</option><option value="status">Изменить статус</option><option value="archive">Скрыть / в архив</option></select>{action === "assign" && <select className="h-10 rounded-lg border border-gray-200 px-3 text-sm dark:border-gray-700 dark:bg-gray-900 dark:text-white" value={actionValue} onChange={(event)=>setActionValue(event.target.value)}><option value="">Снять назначение</option>{staff.map((member)=><option key={member.user_id} value={member.user_id}>{member.display_name || member.user_id}</option>)}</select>}{action === "status" && <select className="h-10 rounded-lg border border-gray-200 px-3 text-sm dark:border-gray-700 dark:bg-gray-900 dark:text-white" value={actionValue} onChange={(event)=>setActionValue(event.target.value)}><option value="">Выберите статус</option>{["new","qualifying","needs_clarification","matching","closed","spam"].map((value)=><option key={value} value={value}>{statusLabels[value] || value}</option>)}</select>}<button disabled={busy} onClick={()=>void applyBulk()} className="rounded-lg bg-brand-500 px-5 py-2.5 text-sm font-semibold text-white disabled:opacity-40">{busy ? "Применяю…" : "Применить"}</button><button disabled={busy} onClick={()=>setSelected(new Set())} className="rounded-lg border border-gray-200 px-4 py-2.5 text-sm dark:border-gray-700">Снять выбор</button></div></Panel>}
    {!filtered.length ? <Panel><EmptyState title="Заявки не найдены" description="Измените фильтры — данные не удалены."/></Panel> : <>
      <div className="space-y-3 md:hidden">{filtered.map((lead)=>{const stage=merchantStageMeta(lead);return <div key={lead.lead_id} className="rounded-2xl border border-gray-200 bg-white p-4 dark:border-gray-800 dark:bg-gray-900"><div className="flex items-start gap-3"><input type="checkbox" checked={selected.has(lead.lead_id)} onChange={()=>toggle(lead.lead_id)} className="mt-1 h-5 w-5 accent-[#ff477d]"/><Link to={`/merchants/${lead.lead_id}`} className="min-w-0 flex-1"><strong className="block truncate text-sm text-gray-900 dark:text-white">{lead.company || "Без названия"}</strong><span className="mt-1 block text-xs text-gray-400">{lead.name || lead.work_email || "Контакт не указан"}</span><div className="mt-3 flex flex-wrap gap-2"><span className={`rounded-full px-2.5 py-1 text-xs font-semibold ${stage.className}`}>{stage.label}</span><span className="rounded-full bg-gray-100 px-2.5 py-1 text-xs dark:bg-white/5">{staffName(lead.assigned_to)}</span></div></Link></div></div>;})}</div>
      <Panel className="hidden overflow-hidden !p-0 md:block"><div className="overflow-x-auto"><table className="min-w-full"><thead className="bg-gray-50 dark:bg-white/[0.03]"><tr><th className="px-4 py-3"><input type="checkbox" checked={allVisibleSelected} onChange={toggleVisible} className="h-4 w-4 accent-[#ff477d]"/></th>{["Компания","Запрос","Этап","Ответственный","Обновлено",""].map((head)=><th key={head} className="px-4 py-3 text-left text-xs font-semibold uppercase tracking-wide text-gray-500">{head}</th>)}</tr></thead><tbody className="divide-y divide-gray-100 dark:divide-gray-800">{filtered.map((lead)=>{const stage=merchantStageMeta(lead);return <tr key={lead.lead_id} className="hover:bg-gray-50/70 dark:hover:bg-white/[0.02]"><td className="px-4 py-4"><input type="checkbox" checked={selected.has(lead.lead_id)} onChange={()=>toggle(lead.lead_id)} className="h-4 w-4 accent-[#ff477d]"/></td><td className="px-4 py-4"><strong className="block text-sm text-gray-900 dark:text-white">{lead.company || "Без названия"}</strong><span className="mt-1 block text-xs text-gray-400">{lead.name || "—"} · {lead.work_email || lead.telegram || "нет контакта"}</span></td><td className="px-4 py-4 text-sm text-gray-600 dark:text-gray-300">{lead.vertical || "—"}<span className="block text-xs text-gray-400">{list(lead.geos)} · {list(lead.methods)}</span></td><td className="px-4 py-4"><span className={`inline-flex rounded-full px-2.5 py-1 text-xs font-semibold ${stage.className}`}>{stage.label}</span>{attentionLeadIds.has(lead.lead_id)&&<span className="mt-1 block text-xs font-semibold text-warning-600">Требует проверки</span>}</td><td className="px-4 py-4 text-sm text-gray-600 dark:text-gray-300">{staffName(lead.assigned_to)}</td><td className="px-4 py-4 text-sm text-gray-500">{date(lead.updated_at || lead.submitted_at)}</td><td className="px-4 py-4"><Link to={`/merchants/${lead.lead_id}`} className="text-sm font-semibold text-brand-500">Открыть →</Link></td></tr>;})}</tbody></table></div></Panel>
    </>}
  </PageFrame>;
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
  const operationalLeads = leads.filter(isVisibleBusinessLead);
  return <PageFrame title="Воронка" description="Kanban сделок OfferPSP."><PageHeading eyebrow="Merchant pipeline" title="Воронка сделок" description="Каждая карточка показывает этап и следующий шаг. На телефоне колонки прокручиваются горизонтально, не ломая всю страницу."/><div className="-mx-4 overflow-x-auto px-4 pb-3 md:mx-0 md:px-0"><div className="grid min-w-[1100px] grid-cols-5 gap-4">{pipelineColumns.map((column) => { const items = operationalLeads.filter((lead) => column.statuses.includes(lead.status || "")); return <div key={column.title} className="rounded-2xl bg-gray-100/70 p-3 dark:bg-white/[0.03]"><div className="mb-3 flex items-center justify-between"><h2 className="text-sm font-semibold text-gray-800 dark:text-white/90">{column.title}</h2><span className="rounded-full bg-white px-2 py-0.5 text-xs text-gray-500 dark:bg-gray-800">{items.length}</span></div><div className="space-y-3">{items.map((lead) => <Link to={`/merchants/${lead.lead_id}`} key={lead.lead_id} className="block rounded-xl border border-gray-200 bg-white p-4 shadow-theme-xs transition hover:border-brand-300 dark:border-gray-800 dark:bg-gray-900"><div className="flex items-start justify-between gap-2"><strong className="text-sm text-gray-900 dark:text-white">{lead.company || "Без названия"}</strong><span className="h-2 w-2 shrink-0 rounded-full bg-brand-500"/></div><p className="mt-2 text-xs text-gray-500">{lead.vertical || "Вертикаль не указана"} · {list(lead.geos)}</p><div className="mt-3"><StatusPill status={lead.status}/></div><p className="mt-3 border-t border-gray-100 pt-3 text-xs text-gray-400 dark:border-gray-800">Следующий шаг: {lead.status === "new" ? "проверить заявку" : lead.status === "needs_clarification" ? "запросить данные" : "открыть карточку"}</p></Link>)}{!items.length && <div className="rounded-xl border border-dashed border-gray-300 px-3 py-8 text-center text-xs text-gray-400 dark:border-gray-700">Нет заявок</div>}</div></div>; })}</div></div></PageFrame>;
}

const dealStatuses = ["option_selected", "dossier_ready", "provider_reviewing", "provider_needs_info", "provider_accepted", "provider_declined", "telegram_created", "zoom_scheduled", "negotiating", "won", "lost"];

export function DealDeskPage() {
  const { leads } = useControlBridge();
  const deals = leads.filter((lead) => isVisibleBusinessLead(lead) && dealStatuses.includes(lead.status || ""));
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
  const [scope, setScope] = useState<MerchantScope>("active");
  const [riskScope, setRiskScope] = useState<"all" | "low" | "high" | "unknown">("all");
  const [query, setQuery] = useState("");
  const counts = useMemo(() => {
    const result = Object.fromEntries(merchantStages.map((item) => [item.key, 0])) as Record<MerchantStageKey, number>;
    leads.forEach((lead) => {
      if (lead.record_state !== "archived") result[merchantStage(lead)] += 1;
    });
    return result;
  }, [leads]);
  const stageOrder: Record<MerchantStageKey, number> = { new: 0, psp: 1, launch: 2, matching: 3, client: 4, live: 5, history: 6 };
  const visible = leads.filter((lead) => {
    const stage = merchantStage(lead);
    const hidden = lead.record_state === "archived";
    if (scope === "hidden" && !hidden) return false;
    if (scope === "active" && (hidden || stage === "history")) return false;
    if (scope !== "active" && scope !== "all" && scope !== "hidden" && (hidden || stage !== scope)) return false;
    if (riskScope !== "all" && (lead.risk_segment || "unknown") !== riskScope) return false;
    if (!query.trim()) return true;
    return [lead.company, lead.name, lead.work_email, lead.telegram, lead.vertical, lead.company_url]
      .filter(Boolean).join(" ").toLowerCase().includes(query.trim().toLowerCase());
  }).sort((left, right) => {
    const stageDelta = stageOrder[merchantStage(left)] - stageOrder[merchantStage(right)];
    if (scope === "active" && stageDelta) return stageDelta;
    return new Date(right.updated_at || right.submitted_at || 0).getTime() - new Date(left.updated_at || left.submitted_at || 0).getTime();
  });
  const hiddenCount = leads.filter((lead) => lead.record_state === "archived").length;
  const activeCount = leads.length - counts.history - hiddenCount;
  return <PageFrame title="Мерчи" description="Реестр мерчей и заявок."><PageHeading eyebrow="CRM" title="Мерчи" description="Сразу видно, кто новый, кому отправлены офферы, кто уже у PSP и кто начал работать."/>
    <div className="mb-5 grid grid-cols-2 gap-3 md:grid-cols-3 xl:grid-cols-6">
      {merchantStages.filter((item) => item.key !== "history").map((item) => <button key={item.key} onClick={() => setScope(item.key)} className={`rounded-2xl border p-4 text-left transition ${scope === item.key ? "border-brand-400 bg-brand-50 dark:bg-brand-500/10" : "border-gray-200 bg-white hover:border-brand-200 dark:border-gray-800 dark:bg-gray-900"}`}><span className="text-xs font-semibold text-gray-500 dark:text-gray-400">{item.label}</span><strong className="mt-2 block text-2xl text-gray-900 dark:text-white">{counts[item.key]}</strong><span className="mt-1 block text-xs text-gray-400">{item.hint}</span></button>)}
    </div>
    <Panel className="mb-5"><div className="flex flex-col gap-3 lg:flex-row lg:items-center lg:justify-between"><div className="flex flex-wrap gap-2">{[...[{ key: "active", label: `Все активные · ${activeCount}` }, ...merchantStages.map((item) => ({ key: item.key, label: `${item.label} · ${counts[item.key]}` }))], { key: "hidden", label: `Скрытые · ${hiddenCount}` }, { key: "all", label: `Все · ${leads.length}` }].map((item) => <button key={item.key} onClick={() => setScope(item.key as MerchantScope)} className={`rounded-lg px-3 py-2 text-sm ${scope === item.key ? "bg-brand-500 text-white" : "bg-gray-100 text-gray-600 dark:bg-white/5 dark:text-gray-300"}`}>{item.label}</button>)}</div><div className="flex w-full flex-col gap-2 sm:flex-row lg:max-w-xl"><select value={riskScope} onChange={(event)=>setRiskScope(event.target.value as typeof riskScope)} className="h-10 rounded-lg border border-gray-200 px-3 text-sm outline-none focus:border-brand-400 dark:border-gray-700 dark:bg-gray-900 dark:text-white"><option value="all">Любая категория</option><option value="low">Low-risk</option><option value="high">High-risk</option><option value="unknown">Не определена</option></select><input value={query} onChange={(event)=>setQuery(event.target.value)} placeholder="Найти компанию, контакт или email…" className="h-10 w-full rounded-lg border border-gray-200 px-3 text-sm outline-none focus:border-brand-400 dark:border-gray-700 dark:bg-gray-900 dark:text-white"/></div></div><p className="mt-3 text-xs text-gray-400">Показано {visible.length} из {leads.length}. Категория бизнеса управляет подбором офферов, но не ограничивает приём клиентов.</p></Panel><LeadTable leads={visible}/></PageFrame>;
}

type MerchantStageKey = "new" | "matching" | "client" | "psp" | "launch" | "live" | "history";
type MerchantScope = "active" | "hidden" | "all" | MerchantStageKey;

const merchantStages: Array<{ key: MerchantStageKey; label: string; hint: string }> = [
  { key: "new", label: "Новые", hint: "ещё не разобраны" },
  { key: "matching", label: "В подборе", hint: "готовим решения" },
  { key: "client", label: "У клиента", hint: "офферы отправлены" },
  { key: "psp", label: "У PSP", hint: "переданы на review" },
  { key: "launch", label: "Подключение", hint: "Telegram, Zoom, запуск" },
  { key: "live", label: "Работают", hint: "live processing" },
  { key: "history", label: "Закрытые", hint: "закрыты, потеряны, спам" },
];

function merchantStage(lead: Lead): MerchantStageKey {
  const status = lead.status || "new";
  if (lead.record_state === "archived" || ["closed", "spam", "lost"].includes(status)) return "history";
  if (status === "won") return "live";
  if (["provider_accepted", "telegram_created", "zoom_scheduled", "negotiating"].includes(status)) return "launch";
  if (["provider_reviewing", "provider_needs_info"].includes(status)) return "psp";
  if (["shared", "option_selected", "dossier_ready"].includes(status)) return "client";
  if (["matching", "matched", "shortlist_ready", "provider_declined"].includes(status)) return "matching";
  return "new";
}

function merchantStageMeta(lead: Lead) {
  const stage = merchantStage(lead);
  const status = lead.status || "new";
  const details: Record<string, string> = {
    new: "Новая заявка",
    qualifying: "Разбираем запрос",
    needs_clarification: "Нужны данные",
    matching: "Идёт автоподбор",
    matched: "Есть кандидаты",
    shortlist_ready: "Shortlist готов",
    shared: "Офферы отправлены клиенту",
    option_selected: "Клиент выбрал оффер",
    dossier_ready: "Досье готово к PSP",
    provider_reviewing: "Передан PSP · на рассмотрении",
    provider_needs_info: "PSP запросил данные",
    provider_declined: "PSP отказал · нужен новый подбор",
    provider_accepted: "PSP принял мерча",
    telegram_created: "Создан общий Telegram",
    zoom_scheduled: "Назначен Zoom",
    negotiating: "Согласование условий",
    won: "Обработка платежей запущена",
    lost: "Сделка потеряна",
    closed: "Закрыт",
    spam: "Spam",
  };
  const styles: Record<MerchantStageKey, string> = {
    new: "bg-warning-50 text-warning-700 dark:bg-warning-500/15 dark:text-warning-300",
    matching: "bg-blue-light-50 text-blue-light-700 dark:bg-blue-light-500/15 dark:text-blue-light-300",
    client: "bg-brand-50 text-brand-700 dark:bg-brand-500/15 dark:text-brand-300",
    psp: "bg-orange-50 text-orange-700 dark:bg-orange-500/15 dark:text-orange-300",
    launch: "bg-blue-light-100 text-blue-light-800 dark:bg-blue-light-500/25 dark:text-blue-light-200",
    live: "bg-success-50 text-success-700 dark:bg-success-500/15 dark:text-success-300",
    history: "bg-gray-100 text-gray-600 dark:bg-white/5 dark:text-gray-400",
  };
  return { stage, label: merchantStages.find((item) => item.key === stage)?.label || stage, detail: details[status] || status, className: styles[stage] };
}

function LeadTable({ leads }: { leads: Lead[] }) {
  if (!leads.length) return <Panel><EmptyState title="Заявок пока нет" description="Новые мерчи появятся здесь из формы, агента или ручного добавления."/></Panel>;
  return <>
    <div className="space-y-3 md:hidden">{leads.map((lead)=>{ const stage = merchantStageMeta(lead); return <Link key={lead.lead_id} to={`/merchants/${lead.lead_id}`} className="block rounded-2xl border border-gray-200 bg-white p-4 shadow-theme-xs dark:border-gray-800 dark:bg-gray-900"><div className="flex items-start justify-between gap-3"><div className="min-w-0"><strong className="block truncate text-sm text-gray-900 dark:text-white">{lead.company || "Без названия"}</strong><span className="mt-1 block truncate text-xs text-gray-400">{lead.name || lead.work_email || lead.telegram || "Контакт не указан"}</span></div><span className={`shrink-0 rounded-full px-2.5 py-1 text-xs font-semibold ${stage.className}`}>{stage.label}</span></div><div className="mt-3 flex items-center gap-2"><RiskBadge segment={lead.risk_segment}/><p className="text-xs font-medium text-gray-600 dark:text-gray-300">{stage.detail}</p></div><div className="mt-4 grid grid-cols-2 gap-3 border-t border-gray-100 pt-3 text-xs dark:border-gray-800"><div><span className="block text-gray-400">Запрос</span><strong className="mt-1 block text-gray-700 dark:text-gray-300">{lead.vertical || "—"} · {list(lead.geos)}</strong></div><div><span className="block text-gray-400">Обновлено</span><strong className="mt-1 block text-gray-700 dark:text-gray-300">{date(lead.updated_at || lead.submitted_at)}</strong></div></div></Link>;})}</div>
    <Panel className="hidden overflow-hidden !p-0 md:block">
    <div className="overflow-x-auto"><table className="min-w-full">
      <thead className="bg-gray-50 dark:bg-white/[0.03]"><tr>{["Компания", "Контакт", "Запрос", "Категория", "Этап работы", "Обновлено", "Действие"].map((head) => <th key={head} className="px-5 py-3 text-left text-xs font-semibold uppercase tracking-wide text-gray-500">{head}</th>)}</tr></thead>
      <tbody className="divide-y divide-gray-100 dark:divide-gray-800">{leads.map((lead) => { const stage = merchantStageMeta(lead); return <tr key={lead.lead_id} className="hover:bg-gray-50/70 dark:hover:bg-white/[0.02]">
        <td className="px-5 py-4"><strong className="block text-sm text-gray-900 dark:text-white">{lead.company || "Без названия"}</strong><span className="mt-1 block text-xs text-gray-400">{lead.company_url || lead.lead_id.slice(0, 8)}</span></td>
        <td className="px-5 py-4 text-sm text-gray-600 dark:text-gray-300">{lead.name || "—"}<span className="block text-xs text-gray-400">{lead.work_email || lead.telegram || "—"}</span></td>
        <td className="px-5 py-4 text-sm text-gray-600 dark:text-gray-300">{lead.vertical || "—"}<span className="block text-xs text-gray-400">{list(lead.geos)} · {list(lead.methods)}</span></td>
        <td className="px-5 py-4"><RiskBadge segment={lead.risk_segment}/></td>
        <td className="px-5 py-4"><span className={`inline-flex rounded-full px-2.5 py-1 text-xs font-semibold ${stage.className}`}>{stage.label}</span><span className="mt-1.5 block max-w-[220px] text-xs text-gray-500">{stage.detail}</span></td><td className="px-5 py-4 text-sm text-gray-500">{date(lead.updated_at || lead.submitted_at)}</td>
        <td className="px-5 py-4"><Link to={`/merchants/${lead.lead_id}`} className="text-sm font-medium text-brand-500 hover:text-brand-600">Открыть →</Link></td>
      </tr>;})}</tbody>
    </table></div>
  </Panel></>;
}

function RiskBadge({ segment }: { segment?: string | null }) {
  const value = segment === "low" ? "Low-risk" : segment === "high" ? "High-risk" : "Не определена";
  const style = segment === "low" ? "bg-success-50 text-success-700 dark:bg-success-500/15 dark:text-success-300" : segment === "high" ? "bg-warning-50 text-warning-700 dark:bg-warning-500/15 dark:text-warning-300" : "bg-gray-100 text-gray-600 dark:bg-white/5 dark:text-gray-400";
  return <span className={`inline-flex rounded-full px-2.5 py-1 text-xs font-semibold ${style}`}>{value}</span>;
}

export function ProvidersPage() {
  const { providers, captainsBridge, refresh } = useControlBridge();
  const [searchParams, setSearchParams] = useSearchParams();
  const [scope, setScope] = useState<"active" | "pipeline" | "inactive" | "hidden" | "all">("active");
  const [query, setQuery] = useState("");
  const [editor, setEditor] = useState<{ record?: AgentPspProvider } | null>(null);
  const needle = query.trim().toLowerCase();
  const privateHidden = (provider: (typeof providers)[number]) => provider.relationship_status === "archived";
  const researchHidden = (provider: AgentPspProvider) => provider.record_state === "archived";
  const privateKind = (status?: string | null) => status === "active" || status === "partner" ? "active" : ["paused","ended","rejected"].includes(status || "") ? "inactive" : "pipeline";
  const researchKind = (provider: AgentPspProvider) => provider.provider_status === "partner" ? "active" : ["paused","rejected"].includes(provider.provider_status || "") ? "inactive" : "pipeline";
  const normalizeName = (value?: string | null) => (value || "").toLowerCase().replace(/[^a-z0-9]+/g, "");
  const normalizeDomain = (value?: string | null) => (value || "").toLowerCase().replace(/^https?:\/\//, "").replace(/^www\./, "").replace(/\/.*$/, "");
  const operationalIdentities = new Set(providers.flatMap((provider) => [
    normalizeName(provider.brand_name) ? `name:${normalizeName(provider.brand_name)}` : "",
    normalizeDomain(provider.website) ? `domain:${normalizeDomain(provider.website)}` : "",
  ]).filter(Boolean));
  const linkedResearchProviderIds = new Set(providers.map((provider) => provider.legacy_psp_id).filter((id): id is number => typeof id === "number"));
  const researchProviders = captainsBridge.psp_providers.filter((provider) => !linkedResearchProviderIds.has(provider.id) && ![
    normalizeName(provider.name) ? `name:${normalizeName(provider.name)}` : "",
    normalizeDomain(provider.website) ? `domain:${normalizeDomain(provider.website)}` : "",
  ].some((identity) => identity && operationalIdentities.has(identity)));
  const privateVisible = providers.filter((provider) => (scope === "all" || (scope === "hidden" ? privateHidden(provider) : !privateHidden(provider) && privateKind(provider.relationship_status) === scope)) && [provider.brand_name, provider.legal_name, provider.website, provider.internal_code].filter(Boolean).join(" ").toLowerCase().includes(needle));
  const researchVisible = researchProviders.filter((provider) => (scope === "all" || (scope === "hidden" ? researchHidden(provider) : !researchHidden(provider) && researchKind(provider) === scope)) && [provider.name, provider.website, provider.geo, provider.email, provider.telegram, provider.specialization, ...(provider.supported_countries || []), ...(provider.payment_methods || [])].filter(Boolean).join(" ").toLowerCase().includes(needle));
  const allCount = providers.length + researchProviders.length;
  const countKind = (kind: "active" | "pipeline" | "inactive") => providers.filter((item)=>!privateHidden(item) && privateKind(item.relationship_status)===kind).length + researchProviders.filter((item)=>!researchHidden(item) && researchKind(item)===kind).length;
  const hiddenCount = providers.filter(privateHidden).length + researchProviders.filter(researchHidden).length;
  const requestedResearch = searchParams.get("research");
  useEffect(() => {
    if (!requestedResearch) return;
    const record = captainsBridge.psp_providers.find((provider) => String(provider.id) === requestedResearch);
    if (record) setEditor({ record });
  }, [captainsBridge.psp_providers, requestedResearch]);
  const closeResearchEditor = () => {
    setEditor(null);
    if (!requestedResearch) return;
    const next = new URLSearchParams(searchParams);
    next.delete("research");
    setSearchParams(next, { replace: true });
  };
  return <PageFrame title="PSP" description="Единый реестр PSP и партнёров."><PageHeading eyebrow="Counterparty organizer" title="PSP" description="Действующие партнёры, новые PSP из AIBot и история переговоров находятся в одном разделе. Настоящие названия и контакты видит только команда." action={<button onClick={()=>setEditor({})} className="rounded-lg bg-brand-500 px-4 py-2.5 text-sm font-medium text-white">+ Добавить PSP</button>}/>
    <div className="mb-5 grid grid-cols-2 gap-3 xl:grid-cols-5"><Metric label="Всего" value={allCount} hint="партнёры и кандидаты"/><Metric label="Активные" value={countKind("active")} hint="работаем сейчас" tone="success"/><Metric label="В обработке" value={countKind("pipeline")} hint="исследование и переговоры"/><Metric label="Неактивные" value={countKind("inactive")} hint="пауза или отказ"/><Metric label="Скрытые" value={hiddenCount} hint="сохранены вне работы"/></div>
    <Panel className="mb-5"><div className="flex flex-col gap-3 lg:flex-row lg:items-center lg:justify-between"><div className="flex flex-wrap gap-2">{[["active","Активные"],["pipeline","В обработке"],["inactive","Неактивные"],["hidden","Скрытые"],["all","Все"]].map(([value,label]) => <button key={value} onClick={() => setScope(value as typeof scope)} className={`rounded-lg px-3 py-2 text-sm ${scope === value ? "bg-brand-500 text-white" : "bg-gray-100 text-gray-600 dark:bg-white/5 dark:text-gray-300"}`}>{label}</button>)}</div><input className="h-10 w-full rounded-lg border border-gray-200 px-3 text-sm outline-none focus:border-brand-400 dark:border-gray-700 dark:bg-gray-900 dark:text-white lg:max-w-sm" value={query} onChange={(event)=>setQuery(event.target.value)} placeholder="PSP, GEO, метод, контакт…"/></div><p className="mt-3 text-xs text-gray-400">Показано {privateVisible.length + researchVisible.length} из {allCount}. Скрытые PSP сохраняются в базе, но не мешают рабочему реестру.</p></Panel>
    <div className="grid grid-cols-1 gap-4 lg:grid-cols-2 xl:grid-cols-3">{privateVisible.map((provider) => <Panel key={`partner-${provider.id}`}><div className="flex items-start justify-between"><div><span className="text-xs font-semibold uppercase tracking-wide text-brand-500">Партнёр · {provider.internal_code || "PSP"}</span><h2 className="mt-2 text-xl font-semibold text-gray-900 dark:text-white">{provider.brand_name}</h2><p className="mt-1 text-sm text-gray-500">{provider.legal_name || provider.website || "Юридические данные не заполнены"}</p></div><StatusPill status={provider.relationship_status}/></div><div className="mt-5 grid grid-cols-3 gap-3 border-t border-gray-100 pt-4 text-center dark:border-gray-800"><div><strong className="block text-lg text-gray-900 dark:text-white">{provider.route_count || 0}</strong><span className="text-xs text-gray-400">офферов</span></div><div><strong className="block text-lg text-gray-900 dark:text-white">{provider.published_route_count || 0}</strong><span className="text-xs text-gray-400">live</span></div><div><strong className="block text-lg text-gray-900 dark:text-white">{provider.strategic_priority ?? "—"}</strong><span className="text-xs text-gray-400">приоритет</span></div></div><Link to={`/psps/${provider.id}`} className="mt-5 block w-full rounded-lg border border-gray-200 px-4 py-2 text-center text-sm font-medium text-gray-700 hover:border-brand-300 hover:text-brand-500 dark:border-gray-700 dark:text-gray-300">Открыть workspace</Link></Panel>)}
      {researchVisible.map((provider)=><Panel key={`research-${provider.id}`}><div className="flex items-start justify-between gap-3"><div><span className="text-xs font-semibold uppercase tracking-wide text-theme-purple-500">Кандидат · AIBot</span><h2 className="mt-2 text-xl font-semibold text-gray-900 dark:text-white">{provider.name}</h2><p className="mt-1 text-sm text-gray-500">{provider.specialization || provider.website || "Профиль ещё не заполнен"}</p></div><StatusPill status={provider.provider_status || provider.contact_status}/></div><div className="mt-4 space-y-2 border-t border-gray-100 pt-4 text-sm text-gray-500 dark:border-gray-800"><p>GEO: {(provider.supported_countries || []).join(", ") || provider.geo || "—"}</p><p className="truncate">Методы: {(provider.payment_methods || []).join(", ") || provider.methods || "—"}</p><p className="truncate">Контакт: {provider.email || provider.telegram || "не найден"}</p></div><button onClick={()=>setEditor({record:provider})} className="mt-5 w-full rounded-lg border border-gray-200 px-4 py-2 text-sm font-medium text-gray-700 hover:border-brand-300 hover:text-brand-500 dark:border-gray-700 dark:text-gray-300">Открыть органайзер</button></Panel>)}
      {!privateVisible.length && !researchVisible.length && <Panel className="lg:col-span-2 xl:col-span-3"><EmptyState title="PSP не найдены" description="Измените фильтр или добавьте нового партнёра."/></Panel>}
    </div>{editor && <ResearchEntityEditor entityType="psp" record={editor.record} onClose={closeResearchEditor} onSaved={refresh}/>}</PageFrame>;
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
        extractor_version: fileMetadata.extractionMethod === "docling"
          ? "docling-serve-v1.28.0"
          : "offerpsp-browser-source-extractor-v1",
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
      const { data: { session } } = await supabase.auth.getSession();
      const extracted = await extractOfferSource(file, setMessage, { accessToken: session?.access_token });
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
            <label className="flex cursor-pointer items-center justify-center rounded-lg border border-dashed border-gray-300 px-4 py-3 text-center text-sm font-semibold text-gray-600 hover:border-brand-400 hover:text-brand-500 dark:border-gray-700 dark:text-gray-300">Загрузить PDF / Office / email / скан<input type="file" className="hidden" accept=".txt,.md,.csv,.tsv,.json,.html,.xml,.pdf,.doc,.docx,.xls,.xlsx,.ppt,.pptx,.eml,.msg,.png,.jpg,.jpeg,.tif,.tiff,.webp" onChange={(event)=>void readSourceFile(event.target.files?.[0])}/></label>
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
  const [riskSegment, setRiskSegment] = useState("all");
  const [health, setHealth] = useState("all");
  const [query, setQuery] = useState("");
  const [creating, setCreating] = useState(false);
  const [creatingBusy, setCreatingBusy] = useState(false);
  const [creatingError, setCreatingError] = useState<string | null>(null);
  const [offerDraft, setOfferDraft] = useState({ provider_id: "", client_title: "", flow: "payin", risk_mode: "high", geos: "", currencies: "", methods: "", source_reference: "" });
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
    if (riskSegment !== "all" && !(route.risk_segments || []).includes(riskSegment as "low" | "high")) return false;
    if (health === "errors" && !Number(route.open_error_count || 0)) return false;
    if (health === "warnings" && !Number(route.open_warning_count || 0)) return false;
    if (health === "stale" && route.status !== "paused") return false;
    if (health === "ready" && (Number(route.open_error_count || 0) || route.status !== "published")) return false;
    if (needle && ![route.provider_name, route.provider_code, route.client_title, route.route_code, ...(route.geos || []), ...(route.currencies || []), ...(route.methods || []), ...(route.verticals || []), ...(route.risk_segments || [])].filter(Boolean).join(" ").toLowerCase().includes(needle)) return false;
    return true;
  }), [routes, status, providerId, geo, currency, method, flow, riskSegment, health, needle]);
  const groups = useMemo(()=>providers.map((provider)=>({provider, routes:visible.filter((route)=>route.provider_id===provider.id)})).filter((group)=>group.routes.length), [providers, visible]);
  const selectClass = "h-10 min-w-0 rounded-lg border border-gray-200 bg-white px-3 text-sm text-gray-700 outline-none focus:border-brand-400 dark:border-gray-700 dark:bg-gray-900 dark:text-gray-200";
  const reset = () => { setStatus("all"); setProviderId("all"); setGeo("all"); setCurrency("all"); setMethod("all"); setFlow("all"); setRiskSegment("all"); setHealth("all"); setQuery(""); };
  const createOffer = async () => {
    if (!offerDraft.provider_id || !offerDraft.client_title.trim()) return;
    setCreatingBusy(true); setCreatingError(null);
    const result = await supabase.rpc("create_offerpsp_manual_route", { p_provider_id: offerDraft.provider_id, p_payload: { client_title: offerDraft.client_title.trim(), flow: offerDraft.flow, coverage_scope: "specific", geos: offerDraft.geos.split(",").map((item)=>item.trim()).filter(Boolean), currencies: offerDraft.currencies.split(",").map((item)=>item.trim()).filter(Boolean), methods: offerDraft.methods.split(",").map((item)=>item.trim()).filter(Boolean), traffic_types: [], verticals: [], source_reference: offerDraft.source_reference.trim() || "Staff manual offer", fees: [], limits: [], settlements: [] } });
    if (result.error) { setCreatingBusy(false); setCreatingError(result.error.message); return; }
    const data = result.data as { route_id?: string } | null;
    if (!data?.route_id) { setCreatingBusy(false); setCreatingError("Черновик создан, но система не вернула его ID."); return; }
    const riskResult = await supabase.rpc("set_offerpsp_route_risk_segments", { p_route_id: data.route_id, p_risk_segments: offerDraft.risk_mode === "both" ? ["low", "high"] : [offerDraft.risk_mode] });
    setCreatingBusy(false);
    if (riskResult.error) { setCreatingError(`Черновик создан, но категория бизнеса не сохранена: ${riskResult.error.message}`); return; }
    await refresh();
    navigate(`/psps/${offerDraft.provider_id}?route=${data.route_id}&tab=offers`);
  };
  return <PageFrame title="Офферы" description="Маршруты и rate cards.">
    <PageHeading eyebrow="Offer operations" title="Офферы и маршруты" description="Каталог, единый приём источников и очередь проверки — в одном рабочем модуле." action={<div className="flex flex-wrap gap-2"><button onClick={()=>setCreating(!creating)} className="rounded-lg bg-brand-500 px-4 py-2.5 text-sm font-semibold text-white">{creating?"Закрыть":"+ Новый оффер"}</button><div className="flex rounded-lg border border-gray-200 p-1 dark:border-gray-700">{[["catalog","Каталог"],["intake","Приём офферов"],["updates","Обновить мерчам"]].map(([value,label])=><button key={value} onClick={()=>setWorkspace(value as "catalog"|"intake"|"updates")} className={`rounded-md px-4 py-2 text-sm font-semibold ${workspace===value?"bg-brand-500 text-white":"text-gray-600 dark:text-gray-300"}`}>{label}</button>)}</div></div>}/>
    {creating && <Panel className="mb-5"><div className="flex flex-col gap-2 sm:flex-row sm:items-start sm:justify-between"><div><p className="text-xs font-semibold uppercase tracking-[0.18em] text-brand-500">Нормализованный оффер</p><h2 className="mt-2 text-xl font-semibold text-gray-900 dark:text-white">Создать черновик для любого PSP</h2><p className="mt-1 text-sm text-gray-500">После создания откроется полный редактор ставок, лимитов, settlement и маржи.</p></div><Link to="/psps/new" className="text-sm font-semibold text-brand-500">Сначала добавить новый PSP →</Link></div>{creatingError&&<div className="mt-4"><ErrorBanner message={creatingError}/></div>}<div className="mt-5 grid grid-cols-1 gap-3 md:grid-cols-2 xl:grid-cols-4"><select value={offerDraft.provider_id} onChange={(event)=>setOfferDraft({...offerDraft,provider_id:event.target.value})} className={selectClass}><option value="">Выберите PSP</option>{registryProviders.filter((provider)=>provider.relationship_status!=="archived").sort((a,b)=>a.brand_name.localeCompare(b.brand_name)).map((provider)=><option key={provider.id} value={provider.id}>{provider.brand_name} · {provider.internal_code||"без кода"}</option>)}</select><input value={offerDraft.client_title} onChange={(event)=>setOfferDraft({...offerDraft,client_title:event.target.value})} className={selectClass} placeholder="Название оффера"/><select value={offerDraft.flow} onChange={(event)=>setOfferDraft({...offerDraft,flow:event.target.value})} className={selectClass}><option value="payin">PayIn</option><option value="payout">PayOut</option><option value="both">PayIn + PayOut</option></select><select value={offerDraft.risk_mode} onChange={(event)=>setOfferDraft({...offerDraft,risk_mode:event.target.value})} className={selectClass}><option value="low">Low-risk</option><option value="high">High-risk</option><option value="both">Low + High</option></select><input value={offerDraft.geos} onChange={(event)=>setOfferDraft({...offerDraft,geos:event.target.value})} className={selectClass} placeholder="GEO: IN, BR, MX"/><input value={offerDraft.currencies} onChange={(event)=>setOfferDraft({...offerDraft,currencies:event.target.value})} className={selectClass} placeholder="Валюты: INR, BRL"/><input value={offerDraft.methods} onChange={(event)=>setOfferDraft({...offerDraft,methods:event.target.value})} className={selectClass} placeholder="Методы: UPI, PIX"/><input value={offerDraft.source_reference} onChange={(event)=>setOfferDraft({...offerDraft,source_reference:event.target.value})} className={selectClass} placeholder="Источник: Telegram / PDF / XLSX"/><button onClick={()=>void createOffer()} disabled={!offerDraft.provider_id||!offerDraft.client_title.trim()||creatingBusy} className="h-10 rounded-lg bg-brand-500 px-4 text-sm font-semibold text-white disabled:opacity-40">{creatingBusy?"Создаю…":"Создать и заполнить"}</button></div></Panel>}
    {workspace === "intake" ? <OfferIntakePanel providerNames={registryProviders.map((provider)=>provider.brand_name).sort()} onImported={refresh}/> : workspace === "updates" ? <OfferUpdateQueuePanelV4/> : <>
    <Panel className="mb-5">
      <div className="flex flex-wrap gap-2">{[["all","Все"],["published","Опубликованы"],["draft","Черновики"],["review","На проверке"],["paused","Пауза"],["archived","Архив"]].map(([value,label]) => <button key={value} onClick={() => setStatus(value)} className={`rounded-lg px-3 py-2 text-sm ${status === value ? "bg-brand-500 text-white" : "bg-gray-100 text-gray-600 dark:bg-white/5 dark:text-gray-300"}`}>{label}</button>)}</div>
      <div className="mt-4 grid grid-cols-1 gap-3 md:grid-cols-2 xl:grid-cols-4"><input value={query} onChange={(event)=>setQuery(event.target.value)} className={selectClass} placeholder="PSP, маршрут, GEO, метод…"/><select value={providerId} onChange={(event)=>setProviderId(event.target.value)} className={selectClass}><option value="all">Все PSP</option>{providers.map((provider)=><option key={provider.id} value={provider.id}>{provider.name} · {routes.filter((route)=>route.provider_id===provider.id).length}</option>)}</select><select value={riskSegment} onChange={(event)=>setRiskSegment(event.target.value)} className={selectClass}><option value="all">Low + High risk</option><option value="low">Только low-risk</option><option value="high">Только high-risk</option></select><select value={geo} onChange={(event)=>setGeo(event.target.value)} className={selectClass}><option value="all">Все GEO</option>{geos.map((value)=><option key={value}>{value}</option>)}</select><select value={currency} onChange={(event)=>setCurrency(event.target.value)} className={selectClass}><option value="all">Все валюты</option>{currencies.map((value)=><option key={value}>{value}</option>)}</select><select value={method} onChange={(event)=>setMethod(event.target.value)} className={selectClass}><option value="all">Все методы</option>{methods.map((value)=><option key={value}>{value}</option>)}</select><select value={flow} onChange={(event)=>setFlow(event.target.value)} className={selectClass}><option value="all">Все потоки</option><option value="payin">PayIn</option><option value="payout">PayOut</option><option value="both">PayIn + PayOut</option></select><select value={health} onChange={(event)=>setHealth(event.target.value)} className={selectClass}><option value="all">Любая готовность</option><option value="ready">Готовы к работе</option><option value="errors">С ошибками</option><option value="warnings">С предупреждениями</option><option value="stale">На паузе</option></select><button onClick={reset} className="h-10 rounded-lg border border-gray-200 px-3 text-sm font-semibold text-gray-600 hover:border-brand-300 hover:text-brand-500 dark:border-gray-700 dark:text-gray-300">Сбросить фильтры</button></div>
      <p className="mt-4 text-xs text-gray-400">Показано {visible.length} из {routes.length} маршрутов · {groups.length} PSP. Каждый оффер открывается в полном редакторе.</p>
    </Panel>
    <div className="space-y-5">{groups.map(({provider, routes:providerRoutes})=><Panel key={provider.id} className="overflow-hidden !p-0"><div className="flex flex-col gap-3 border-b border-gray-200 bg-gray-50 px-5 py-4 sm:flex-row sm:items-center sm:justify-between dark:border-gray-800 dark:bg-white/[0.03]"><div><div className="flex items-center gap-3"><h2 className="text-lg font-semibold text-gray-900 dark:text-white">{provider.name}</h2><span className="rounded-full bg-brand-50 px-2.5 py-1 text-xs font-semibold text-brand-700 dark:bg-brand-500/10 dark:text-brand-300">{providerRoutes.length} офферов</span></div><p className="mt-1 text-xs text-gray-400">{provider.code || "внутренний код не указан"}</p></div><Link to={`/psps/${provider.id}?tab=offers`} className="text-sm font-semibold text-brand-500">Открыть PSP и добавить оффер →</Link></div><div className="overflow-x-auto"><table className="min-w-full"><thead><tr>{["Оффер", "Категория", "GEO и валюта", "Метод и поток", "Проверки", "Статус", ""].map((head)=><th key={head} className="px-5 py-3 text-left text-xs font-semibold uppercase tracking-wide text-gray-500">{head}</th>)}</tr></thead><tbody className="divide-y divide-gray-100 dark:divide-gray-800">{providerRoutes.map((route)=><tr key={route.route_id} className="hover:bg-gray-50/70 dark:hover:bg-white/[0.02]"><td className="px-5 py-4"><strong className="text-sm text-gray-900 dark:text-white">{route.client_title || route.route_code}</strong><span className="block text-xs text-gray-400">{route.route_code} · v{route.batch_version || "—"}</span></td><td className="px-5 py-4"><div className="flex flex-wrap gap-1">{(route.risk_segments||[]).map((segment)=><RiskBadge key={segment} segment={segment}/>)}</div></td><td className="px-5 py-4 text-sm text-gray-600 dark:text-gray-300">{list(route.geos)}<span className="block text-xs text-gray-400">{list(route.currencies)}</span></td><td className="px-5 py-4 text-sm text-gray-600 dark:text-gray-300">{list(route.methods)}<span className="block text-xs text-gray-400">{route.flow || "—"}</span></td><td className="px-5 py-4"><span className={Number(route.open_error_count || 0) ? "text-error-600" : "text-success-600"}>{Number(route.open_error_count || 0)} ошибок</span><span className="block text-xs text-gray-400">{Number(route.open_warning_count || 0)} предупреждений{route.status === "paused" ? " · на паузе" : ""}</span></td><td className="px-5 py-4"><StatusPill status={route.status}/></td><td className="px-5 py-4 text-right"><Link to={`/psps/${route.provider_id}?route=${route.route_id}&tab=offers`} className="text-sm font-semibold text-brand-500">Редактировать →</Link></td></tr>)}</tbody></table></div></Panel>)}{!groups.length&&<Panel><EmptyState title="Офферы не найдены" description="Сбросьте часть фильтров или добавьте оффер из workspace нужного PSP."/></Panel>}</div></>}
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
  const [scope, setScope] = useState<"active" | "hidden" | "all">("active");
  const visible = agents.filter((agent) => scope === "all" || (scope === "hidden" ? agent.status === "archived" : agent.status !== "archived"));
  return <PageFrame title="Субагенты" description="Портфель субагентов и комиссий."><PageHeading eyebrow="Partner network" title="Субагенты" description="Атрибуция мерчей, отдельная наценка, сделки и commission ledger — без раскрытия поставщика." action={<Link to="/agents/new" className="rounded-lg bg-brand-500 px-4 py-2.5 text-sm font-medium text-white">Добавить агента</Link>}/><div className="mb-6 grid grid-cols-1 gap-4 md:grid-cols-4"><Metric label="Агентские организации" value={agents.filter((agent) => agent.status !== "archived").length} hint="рабочих партнёров"/><Metric label="Закрепления" value={assignments.filter((assignment) => assignment.status === "active").length} hint="активных мерчей за агентами"/><Metric label="Правила маржи" value={agentMarginPolicies.filter((policy) => policy.active).length} hint="активных версий"/><Metric label="Записи комиссий" value={Object.values(commissionSummary).reduce((sum, value)=>sum+Number(value || 0),0)} hint="операций commission ledger" tone="success"/></div><Panel className="mb-5"><div className="flex flex-wrap gap-2">{[["active","Рабочие"],["hidden","Скрытые"],["all","Все"]].map(([value,label]) => <button key={value} onClick={() => setScope(value as typeof scope)} className={`rounded-lg px-3 py-2 text-sm ${scope === value ? "bg-brand-500 text-white" : "bg-gray-100 text-gray-600 dark:bg-white/5 dark:text-gray-300"}`}>{label}</button>)}</div></Panel><Panel>{visible.length ? <div className="divide-y divide-gray-100 dark:divide-gray-800">{visible.map((agent)=><Link to={`/agents/${agent.id}`} key={agent.id} className="flex flex-col gap-3 py-4 first:pt-0 last:pb-0 sm:flex-row sm:items-center sm:justify-between"><div><strong className="text-sm text-gray-900 hover:text-brand-500 dark:text-white">{agent.name}</strong><span className="mt-1 block text-xs text-gray-400">{agent.internal_code || "код не назначен"} · {agent.member_count || 0} пользователей</span></div><div className="flex items-center gap-3"><span className="text-sm text-gray-500">{agent.merchant_count || 0} мерчей</span><StatusPill status={agent.status}/></div></Link>)}</div> : <EmptyState title="Субагенты не найдены" description="Измените фильтр или добавьте первого партнёра."/>}</Panel></PageFrame>;
}

export function AnalyticsPage() {
  const { leads, providers, routes } = useControlBridge();
  const funnelMetrics = leadFunnel(leads);
  const operationalLeads = funnelMetrics.businessLeads;
  const funnel = [
    { label: "Все заявки", value: funnelMetrics.applications },
    { label: "Начат подбор", value: funnelMetrics.matching },
    { label: "Shortlist", value: funnelMetrics.shortlist },
    { label: "PSP принял", value: funnelMetrics.providerAccepted },
    { label: "Live processing", value: funnelMetrics.launched },
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
  const launchRate = operationalLeads.length ? Math.round(funnelMetrics.launched/operationalLeads.length*100) : 0;
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
